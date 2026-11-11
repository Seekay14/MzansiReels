import { databases, ID, Query } from './appwrite';
import { COLLECTIONS, DATABASE_ID } from './constants';

export async function getOrCreateChat(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    throw new Error('A valid current user and target user are required to start a chat.');
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
        Array.isArray(chat.participants) && chat.participants.includes(targetUserId)
      ));
      if (existingChat) return existingChat;

      offset += result.documents.length;
      if (!result.documents.length || offset >= result.total) break;
    }

    return await databases.createDocument(DATABASE_ID, COLLECTIONS.chats, ID.unique(), {
      participants: [currentUserId, targetUserId],
      lastMessage: 'Chat started',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Could not get or create chat:', error);
    throw error;
  }
}

export async function sendMessage(chatId, senderId, receiverId, text, messageType = 'text') {
  if (!chatId || !senderId || !receiverId || typeof text !== 'string' || !text.trim()) {
    throw new Error('A chat, sender, receiver, and non-empty message are required.');
  }
  if (!['text', 'image'].includes(messageType)) {
    throw new Error('Message type must be text or image.');
  }

  return sendTypedMessage(chatId, senderId, receiverId, text.trim(), messageType, '');
}

export async function sendStickerMessage(chatId, senderId, receiverId, stickerUrl) {
  if (!chatId || !senderId || !receiverId || !stickerUrl) {
    throw new Error('A chat, sender, receiver, and sticker are required.');
  }
  return sendTypedMessage(chatId, senderId, receiverId, '', 'sticker', stickerUrl);
}

async function sendTypedMessage(chatId, senderId, receiverId, text, messageType, stickerUrl) {
  try {
    const message = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.messages,
      ID.unique(),
      {
        chatId,
        senderId,
        receiverId,
        text,
        messageType,
        stickerUrl,
        isRead: false,
      },
    );
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.chats, chatId, {
      lastMessage: messageType === 'sticker' ? 'Sticker' : text,
      updatedAt: new Date().toISOString(),
    });
    return message;
  } catch (error) {
    console.error(`Could not send ${messageType} message:`, error);
    throw error;
  }
}

export async function fetchMessages(chatId) {
  if (!chatId) throw new Error('A chat ID is required to fetch messages.');

  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.messages, [
      Query.equal('chatId', chatId),
      Query.orderAsc('$createdAt'),
      Query.limit(200),
    ]);
    return result.documents;
  } catch (error) {
    console.error('Could not fetch messages:', error);
    throw error;
  }
}
