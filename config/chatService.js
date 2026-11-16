import { databases, ID, Query } from './appwrite';
import { COLLECTIONS, DATABASE_ID } from './constants';

export async function getOrCreateChat(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    throw new Error('A valid current user and target user are required.');
  }

  try {
    // 1. Create the string of participants (sorted so it's always the same)
    const participantString = [currentUserId, targetUserId].sort().join(',');

    // 2. Search for an existing chat with this exact string
    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.chats, [
      Query.equal('participants', participantString),
      Query.limit(1),
    ]);

    if (result.documents[0]) {
      return result.documents[0];
    }

    // 3. Create a new chat
    return await databases.createDocument(DATABASE_ID, COLLECTIONS.chats, ID.unique(), {
      participants: participantString,
      lastMessage: 'Chat started',
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Could not get or create chat:', error);
    throw error;
  }
}

export async function sendMessage(chatId, senderId, receiverId, text) {
  if (!chatId || !senderId || !receiverId || !text.trim()) {
    throw new Error('A chat, sender, receiver, and message are required.');
  }

  const cleanText = text.trim();
  try {
    // 1. Create the message
    const message = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.messages,
      ID.unique(),
      { chatId, senderId, receiverId, text: cleanText, isRead: false },
    );

    // 2. Update the chat's last message
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.chats, chatId, {
      lastMessage: cleanText,
      updatedAt: new Date().toISOString(),
    });

    return message;
  } catch (error) {
    console.error('Could not send message:', error);
    throw error;
  }
}

export async function fetchMessages(chatId) {
  if (!chatId) throw new Error('A chat ID is required.');

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