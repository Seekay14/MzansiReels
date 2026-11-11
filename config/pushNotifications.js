import { functions } from './appwrite';
import { PUSH_NOTIFICATION_FUNCTION_ID } from './constants';

export async function sendPushNotification(payload) {
  try {
    await functions.createExecution({
      functionId: PUSH_NOTIFICATION_FUNCTION_ID,
      body: JSON.stringify(payload),
      async: true,
    });
  } catch (error) {
    console.error('Could not trigger push notification:', error);
  }
}
