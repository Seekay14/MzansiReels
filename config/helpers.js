import { databases, storage, ID, Query } from './appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID } from './constants';
import * as VideoThumbnails from 'expo-video-thumbnails';

export async function getUserDoc(userId) {
  const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
    Query.equal('userId', userId),
    Query.limit(1),
  ]);
  return res.documents[0] || null;
}

// Finds the profile document for an account, creating it if sign-up never managed to.
export async function ensureUserDoc(user) {
  const existing = await getUserDoc(user.$id);
  if (existing) return existing;
  
  // 👈 FIXED: Added default username and isVerified
  return databases.createDocument(DATABASE_ID, COLLECTIONS.users, ID.unique(), {
    userId: user.$id,
    name: user.name || 'Mzansi User',
    username: user.name?.toLowerCase().replace(/\s+/g, '') || 'user', 
    followers: 0,
    following: 0,
    isVerified: false, 
  });
}

// Best effort: a failed notification should never break the action that caused it.
export async function notify(toUserId, senderName, type) {
  if (!toUserId) return;
  try {
    await databases.createDocument(DATABASE_ID, COLLECTIONS.notifications, ID.unique(), {
      userId: toUserId,
      senderName: senderName || 'Someone',
      type,
      isRead: false, 
    });
  } catch (error) {
    console.log('notify failed:', error.message);
  }
}

export function timeAgo(iso) {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

// Generates a thumbnail from the video and uploads it
export async function generateAndUploadThumbnail(videoUri, videoId) {
  try {
    // 1. Generate an image from the video (at 1 second in)
    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 1000 });
    
    // 2. Get the image ready for upload
    const response = await fetch(uri);
    const blob = await response.blob();
    
    // 3. Format for Appwrite
    const thumbnailFile = new File([blob], `thumb_${videoId}.jpg`, { type: 'image/jpeg' });

    // 4. Upload the image to Appwrite Storage
    const uploadedFile = await storage.createFile(BUCKET_ID, ID.unique(), thumbnailFile);
    
    // 5. Return the URL
    return storage.getFileView(BUCKET_ID, uploadedFile.$id).toString();
  } catch (error) {
    console.log("Error generating thumbnail:", error);
    return ''; 
  }
}