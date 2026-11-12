import { Alert } from 'react-native';
import { account, databases, functions, Query } from './appwrite';
import { COLLECTIONS, DATABASE_ID, MESSAGE_FUNCTION_ID } from './constants';

const MESSAGE_TYPES = new Set(['text', 'image', 'video', 'audio', 'sticker']);
const MESSAGE_PAGE_SIZE = 100;

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
      const existingChat = result.documents.find((chat) => (
        Array.isArray(chat.participants)
        && chat.participants.length === 2
        && chat.participants.includes(targetUserId)
      ));
      if (existingChat) return existingChat;

      offset += result.documents.length;
      if (!result.documents.length || offset >= result.total) break;
    }

    return null;
  } catch (error) {
    console.error('Could not find chat:', error);
    throw error;
  }
}

export async function getChatForParticipants(chatId, currentUserId, targetUserId) {
  if (!chatId || !currentUserId || !targetUserId) {
    throw new Error('A chat and both participant IDs are required.');
  }
  const chat = await databases.getDocument(DATABASE_ID, COLLECTIONS.chats, chatId);
  if (
    !Array.isArray(chat.participants)
    || chat.participants.length !== 2
    || !chat.participants.includes(currentUserId)
    || !chat.participants.includes(targetUserId)
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

async function callMessagingFunction(body) {
  const jwt = await account.createJWT({ duration: 600 });
  const execution = await functions.createExecution({
    functionId: MESSAGE_FUNCTION_ID,
    body: JSON.stringify(body),
    async: false,
    xpath: '/',
    method: 'POST',
    headers: { 'x-appwrite-user-jwt': jwt.jwt },
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
  const authenticatedUser = await account.get();
  if (authenticatedUser.$id !== currentUserId) {
    throw new Error('Your signed-in account does not match the chat participant.');
  }
  return (await callMessagingFunction({
    action: 'get_or_create_chat',
    receiverId: targetUserId,
  })).chat;
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

    const authenticatedUser = await account.get();
    if (authenticatedUser.$id !== senderId) {
      throw new Error('Your signed-in account does not match the message sender.');
    }
    const result = await callMessagingFunction({
      action: 'send',
      chatId,
      receiverId,
      text,
      attachmentUrl,
      attachmentType: messageType,
      replyToId,
    });
    return result.message;
  } catch (error) {
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
    Alert.alert('DB Error', error.message || 'Message could not be saved to Appwrite.');
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

    const authenticatedUser = await account.get();
    if (authenticatedUser.$id !== senderId) {
      throw new Error('Your signed-in account does not match the message sender.');
    }
    const result = await callMessagingFunction({
      action: 'send',
      receiverId,
      text,
      attachmentUrl,
      attachmentType,
      stickerUrl,
      replyToId,
    });
    return { chat: result.chat, message: result.message };
  } catch (error) {
    console.error('Could not send message to participants:', {
      collectionId: error.collectionId || COLLECTIONS.messages,
      code: error.code,
      type: error.type,
      message: error.message || String(error),
      chatIdPresent: false,
      senderIdPresent: Boolean(senderId),
      receiverIdPresent: Boolean(receiverId),
      attachmentType,
    });
    Alert.alert('DB Error', error.message || 'Message could not be saved to Appwrite.');
    throw error;
  }
}

export async function sendStickerMessage(chatId, senderId, receiverId, stickerUrl) {
  if (!chatId || !senderId || !receiverId || !stickerUrl) {
    throw new Error('A chat, sender, recipient, and sticker are required.');
  }
  try {
    const authenticatedUser = await account.get();
    if (authenticatedUser.$id !== senderId) {
      throw new Error('Your signed-in account does not match the message sender.');
    }
    const result = await callMessagingFunction({
      action: 'send',
      chatId,
      receiverId,
      text: '',
      attachmentType: 'sticker',
      stickerUrl,
    });
    return result.message;
  } catch (error) {
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
    Alert.alert('DB Error', error.message || 'Sticker could not be saved to Appwrite.');
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
    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
      Query.equal('chatId', chatId),
      Query.orderDesc('$createdAt'),
      Query.limit(MESSAGE_PAGE_SIZE),
      Query.offset(offset),
    ]);
    return {
      documents: result.documents.reverse(),
      nextOffset: offset + result.documents.length,
      hasMore: result.documents.length === MESSAGE_PAGE_SIZE,
    };
  } catch (error) {
    console.error('Could not fetch messages:', error);
    throw error;
  }
}

export async function markMessagesAsRead(messages, currentUserId) {
  if (!currentUserId || !Array.isArray(messages)) {
    throw new Error('The signed-in user and messages are required to update read receipts.');
  }
  const authenticatedUser = await account.get();
  if (authenticatedUser.$id !== currentUserId) {
    throw new Error('Your signed-in account does not match the read receipt recipient.');
  }

  const unreadMessages = messages.filter((message) => (
    message.receiverId === authenticatedUser.$id && message.isRead === false
  ));
  if (!unreadMessages.length) return [];
  const result = await callMessagingFunction({
    action: 'mark_read',
    messageIds: unreadMessages.map((message) => message.$id),
  });
  return result.messageIds;
}
