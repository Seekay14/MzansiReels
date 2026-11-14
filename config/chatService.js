import { Alert } from 'react-native';
import { account, databases, functions, Query } from './appwrite';
import { COLLECTIONS, DATABASE_ID, MESSAGE_FUNCTION_ID } from './constants';

const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'audio', 'sticker']);
const MESSAGE_PAGE_SIZE = 100;

function createAuthenticationError(error) {
  const authenticationError = new Error('Please sign in again to continue.');
  authenticationError.name = 'MessagingAuthenticationError';
  authenticationError.kind = 'authentication';
  authenticationError.code = error?.code;
  authenticationError.type = error?.type;
  return authenticationError;
}

export function logMessagingError(context, error) {
  if (__DEV__) {
    console.error(context, {
      code: error?.code,
      type: error?.type,
      message: error?.message || String(error),
    });
  }
}

export async function verifyMessagingUser(expectedUserId) {
  let authenticatedUser;
  try {
    authenticatedUser = await account.get();
  } catch (error) {
    logMessagingError('Could not verify the Appwrite messaging session:', error);
    if (Number(error?.code) === 401) throw createAuthenticationError(error);
    throw error;
  }

  if (expectedUserId && authenticatedUser.$id !== expectedUserId) {
    const error = new Error('The active Appwrite account does not match the messaging account.');
    error.kind = 'account_mismatch';
    throw error;
  }
  return authenticatedUser;
}

export function getChatParticipantIds(value) {
  let participants = value;
  if (typeof value === 'string') {
    const serialized = value.trim();
    if (!serialized) return [];
    try {
      participants = JSON.parse(serialized);
    } catch {
      participants = serialized.split(',');
    }
  }
  if (typeof participants === 'string') participants = participants.split(',');
  if (!Array.isArray(participants)) return [];
  return [...new Set(participants
    .filter((participantId) => typeof participantId === 'string')
    .map((participantId) => participantId.trim())
    .filter(Boolean))];
}

export function getMessagingErrorMessage(error, fallback = 'Please try again.') {
  const code = Number(error?.code ?? error?.responseStatusCode);
  if (error?.kind === 'authentication') return 'Please sign in again to continue.';
  if (error?.kind === 'account_mismatch') {
    return 'Your active account changed. Reopen this conversation and try again.';
  }
  if (code === 401) {
    if (/action ['"]?execute/i.test(error?.message || '')) {
      return 'You do not have permission to run the messaging service. Ask an administrator to enable authenticated Function execution.';
    }
    return 'Appwrite rejected this request. Your session has not been cleared; check the project, Function, and collection permissions.';
  }
  if (code === 403) return "You don't have permission to access this conversation.";
  if (code === 404) return 'This user or conversation is unavailable.';
  if (code === 400) return 'The chat request is invalid. Check the messaging schema and query configuration.';
  if (code === 409) return 'This conversation changed elsewhere. Refresh it and try again.';
  if (
    code === 0
    || error?.type === 'fetch_error'
    || /network|fetch failed|connection/i.test(error?.message || '')
  ) return 'Check your internet connection.';
  return fallback;
}

export async function findChat(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    throw new Error('A valid current user and target user are required to find a chat.');
  }

  try {
    let offset = 0;
    while (true) {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.chats, [
        Query.contains('participants', currentUserId),
        Query.orderDesc('updatedAt'),
        Query.limit(100),
        Query.offset(offset),
      ]);
      const existingChat = result.documents.find((chat) => {
        const participants = getChatParticipantIds(chat.participants);
        return participants.length === 2
          && participants.includes(currentUserId)
          && participants.includes(targetUserId);
      });
      if (existingChat) return existingChat;

      offset += result.documents.length;
      if (!result.documents.length || offset >= result.total) break;
    }

    return null;
  } catch (error) {
    if (__DEV__) console.error('Could not find chat:', error);
    throw error;
  }
}

export async function getChatForParticipants(chatId, currentUserId, targetUserId) {
  if (!chatId || !currentUserId || !targetUserId) {
    throw new Error('A chat and both participant IDs are required.');
  }
  const chat = await databases.getDocument(DATABASE_ID, COLLECTIONS.chats, chatId);
  const participants = getChatParticipantIds(chat.participants);
  if (
    participants.length !== 2
    || !participants.includes(currentUserId)
    || !participants.includes(targetUserId)
  ) {
    throw new Error('You are not a participant in this conversation.');
  }
  return chat;
}

function parseFunctionResponse(responseBody) {
  try {
    return JSON.parse(responseBody || '{}');
  } catch {
    throw new Error('The messaging function returned an invalid response.');
  }
}

async function callMessagingFunction(body, expectedUserId) {
  await verifyMessagingUser(expectedUserId);
  let jwt;
  try {
    jwt = await account.createJWT({ duration: 600 });
  } catch (error) {
    logMessagingError('Could not create an Appwrite messaging JWT:', error);
    if (Number(error?.code) === 401) throw createAuthenticationError(error);
    throw error;
  }
  const headers = Object.fromEntries(
    [['x-appwrite-user-jwt', jwt.jwt]].map(([name, value]) => [
      name.toLowerCase().replace(/_/g, '-').replace(/^x-appwrite-/, ''),
      value,
    ]),
  );
  const execution = await functions.createExecution({
    functionId: MESSAGE_FUNCTION_ID,
    body: JSON.stringify(body),
    async: false,
    xpath: '/',
    method: 'POST',
    headers,
  });
  const result = parseFunctionResponse(execution.responseBody);
  if (
    execution.responseStatusCode < 200
    || execution.responseStatusCode >= 300
    || result.success !== true
  ) {
    const error = new Error(
      result.error || `Messaging request failed (HTTP ${execution.responseStatusCode}).`,
    );
    error.code = execution.responseStatusCode;
    throw error;
  }
  return result;
}

export async function getOrCreateChat(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    throw new Error('A valid current user and target user are required to find a chat.');
  }
  return (await callMessagingFunction({
    action: 'get_or_create_chat',
    receiverId: targetUserId,
  }, currentUserId)).chat;
}

export async function sendMessage(
  chatId,
  senderId,
  receiverId,
  text,
  attachmentUrl = '',
  attachmentType = 'text',
  replyToId = '',
) {
  try {
    if (!chatId || !senderId || !receiverId || senderId === receiverId) {
      throw new Error('A chat, sender, and recipient are required.');
    }
    if (typeof text !== 'string') throw new Error('Message text must be a string.');
    const messageType = attachmentType || 'text';
    if (!MESSAGE_TYPES.has(messageType) || messageType === 'sticker') {
      throw new Error('Unsupported message type.');
    }
    if (messageType === 'text' && !text.trim()) {
      throw new Error('Message text or an attachment is required.');
    }
    if (['image', 'video', 'audio'].includes(messageType) && !attachmentUrl) {
      throw new Error(`An attachment URL is required for ${messageType} messages.`);
    }

    const result = await callMessagingFunction({
      action: 'send',
      chatId,
      receiverId,
      text,
      attachmentUrl,
      attachmentType: messageType,
      replyToId,
    }, senderId);
    return result.message;
  } catch (error) {
    if (__DEV__) {
      console.error('Could not send message:', {
        collectionId: error.collectionId || COLLECTIONS.messages,
        code: error.code,
        type: error.type,
        message: error.message || String(error),
        chatIdPresent: Boolean(chatId),
        senderIdPresent: Boolean(senderId),
        receiverIdPresent: Boolean(receiverId),
        attachmentType,
      });
    }
    Alert.alert('Message not sent', getMessagingErrorMessage(error, 'Message could not be sent. Please try again.'));
    throw error;
  }
}

export async function sendMessageToParticipants(
  senderId,
  receiverId,
  text,
  attachmentUrl = '',
  attachmentType = 'text',
  stickerUrl = '',
  replyToId = '',
  chatId = '',
) {
  try {
    if (!senderId || !receiverId || senderId === receiverId) {
      throw new Error('A valid sender and recipient are required.');
    }
    if (!MESSAGE_TYPES.has(attachmentType)) throw new Error('Unsupported message type.');
    if (
      typeof text !== 'string'
      || (attachmentType === 'text' && !text.trim())
      || (['image', 'video', 'audio'].includes(attachmentType) && !attachmentUrl)
      || (attachmentType === 'sticker' && !stickerUrl)
    ) {
      throw new Error('Message text or an attachment is required.');
    }

    const result = await callMessagingFunction({
      action: 'send',
      chatId,
      receiverId,
      text,
      attachmentUrl,
      attachmentType,
      stickerUrl,
      replyToId,
    }, senderId);
    return { chat: result.chat, message: result.message };
  } catch (error) {
    if (__DEV__) {
      console.error('Could not send message to participants:', {
        collectionId: error.collectionId || COLLECTIONS.messages,
        code: error.code,
        type: error.type,
        message: error.message || String(error),
        chatIdPresent: Boolean(chatId),
        senderIdPresent: Boolean(senderId),
        receiverIdPresent: Boolean(receiverId),
        attachmentType,
      });
    }
    throw error;
  }
}

export async function sendStickerMessage(chatId, senderId, receiverId, stickerUrl) {
  if (!chatId || !senderId || !receiverId || !stickerUrl) {
    throw new Error('A chat, sender, recipient, and sticker are required.');
  }
  try {
    const result = await callMessagingFunction({
      action: 'send',
      chatId,
      receiverId,
      text: '',
      attachmentType: 'sticker',
      stickerUrl,
    }, senderId);
    return result.message;
  } catch (error) {
    if (__DEV__) {
      console.error('Could not send sticker message:', {
        collectionId: error.collectionId || COLLECTIONS.messages,
        code: error.code,
        type: error.type,
        message: error.message || String(error),
        chatIdPresent: Boolean(chatId),
        senderIdPresent: Boolean(senderId),
        receiverIdPresent: Boolean(receiverId),
        attachmentType: 'sticker',
      });
    }
    Alert.alert('Sticker not sent', getMessagingErrorMessage(error, 'Sticker could not be sent. Please try again.'));
    throw error;
  }
}

export async function setTypingStatus(chatId, isTyping) {
  if (!chatId || typeof isTyping !== 'boolean') {
    throw new Error('A chat and typing state are required.');
  }
  return callMessagingFunction({ action: 'typing', chatId, isTyping });
}

export async function updateMessageReaction(messageId, reaction) {
  if (!messageId || typeof reaction !== 'string' || reaction.length > 32) {
    throw new Error('A valid message and reaction are required.');
  }
  const result = await callMessagingFunction({ action: 'react', messageId, reaction });
  return result.message;
}

export async function fetchMessages(chatId, offset = 0) {
  if (!chatId) throw new Error('A chat ID is required to fetch messages.');
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error('The message offset must be a non-negative integer.');
  }

  try {
    const totalResult = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
      Query.equal('chatId', chatId),
      Query.orderAsc('$createdAt'),
      Query.limit(1),
    ]);
    const pageOffset = Math.max(totalResult.total - MESSAGE_PAGE_SIZE - offset, 0);
    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
      Query.equal('chatId', chatId),
      Query.orderAsc('$createdAt'),
      Query.limit(MESSAGE_PAGE_SIZE),
      Query.offset(pageOffset),
    ]);
    return {
      documents: result.documents,
      nextOffset: offset + result.documents.length,
      hasMore: pageOffset > 0,
    };
  } catch (error) {
    if (__DEV__) console.error('Could not fetch messages:', error);
    throw error;
  }
}

export async function markMessagesAsRead(messages, currentUserId) {
  if (!currentUserId || !Array.isArray(messages)) {
    throw new Error('The signed-in user and messages are required to update read receipts.');
  }
  const authenticatedUser = await verifyMessagingUser(currentUserId);

  const unreadMessages = messages.filter((message) => (
    message.receiverId === authenticatedUser.$id && message.isRead === false
  ));
  if (!unreadMessages.length) return [];
  const result = await callMessagingFunction({
    action: 'mark_read',
    messageIds: unreadMessages.map((message) => message.$id),
  }, currentUserId);
  return result.messageIds;
}
