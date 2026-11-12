import { databases, functions, Query } from './appwrite';
import { COLLECTIONS, DATABASE_ID, PUSH_NOTIFICATION_FUNCTION_ID } from './constants';

export async function sendPushNotification(payload) {
  try {
    const recipientProfiles = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
      Query.equal('userId', payload.targetUserId),
      Query.limit(1),
    ]);
    if (recipientProfiles.documents[0]?.pushNotifications === false) return;

    await functions.createExecution({
      functionId: PUSH_NOTIFICATION_FUNCTION_ID,
      body: JSON.stringify(payload),
      async: true,
    });
  } catch (error) {
    console.error('Could not trigger push notification:', error);
  }
}
