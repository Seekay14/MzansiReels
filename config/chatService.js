import { databases, ID, Query } from './appwrite';
import { COLLECTIONS, DATABASE_ID } from './constants';

// Helper to get a user's Document ID from their Auth ID
async function getUserDocId(authUserId) {
  const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
    Query.equal('userId', authUserId),
    Query.limit(1),
  ]);
  if (!res.documents[0]) throw new Error('User profile not found');
  return res.documents[0].$id; // This is the Document ID needed for the relationship
}

// Helper to handle both String and Array formats for participants
function getParticipantIds(participants) {
  if (Array.isArray(participants)) return participants;
  if (typeof participants === 'string') {
    return participants.split(',').map(id => id.trim()).filter(Boolean);
  }
  return [];
}

export async function getOrCreateChat(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    throw new Error('A valid current user and target user are required.');
  }

  try {
    // 1. Get the Document IDs for both users (Required for Relationships)
    const currentUserDocId = await getUserDocId(currentUserId);
    const targetUserDocId = await getUserDocId(targetUserId);

    // 2. Search for a chat that contains the current user's Document ID
    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.chats, [
      Query.contains('participants', currentUserDocId),
      Query.orderDesc('updatedAt'),
      Query.limit(100),
    ]);

    // 3. Find the one that ALSO contains the target user's Document ID
    const existingChat = result.documents.find((chat) => {
      const ids = getParticipantIds(chat.participants);
      return ids.includes(targetUserDocId);
    });

    if (existingChat) return existingChat;

    // 4. Create a new chat using the Document IDs
    return await databases.createDocument(DATABASE_ID, COLLECTIONS.chats, ID.unique(), {
      participants: [currentUserDocId, targetUserDocId], // Array of Document IDs
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
    const message = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.messages,
      ID.unique(),
      { chatId, senderId, receiverId, text: cleanText, isRead: false },
    );

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