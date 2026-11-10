import { databases, storage, ID, Query } from './appwrite';
import { DATABASE_ID, COLLECTIONS, BUCKET_ID } from './constants';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { uploadMediaFile } from './mediaUpload';

export async function getUserDoc(userId) {
  const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
    Query.equal('userId', userId),
    Query.limit(1),
  ]);
  return res.documents[0] || null;
}

export async function reportVideo(videoId, reporterId, reason) {
  if (!videoId || !reporterId || !reason) {
    throw new Error('A video, reporter, and report reason are required.');
  }

  return databases.createDocument(DATABASE_ID, COLLECTIONS.reports, ID.unique(), {
    videoId,
    reporterId,
    reasonId: reason,
  });
}

export async function blockUser(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    throw new Error('A valid current user and target user are required to block someone.');
  }

  const existing = await databases.listDocuments(DATABASE_ID, COLLECTIONS.blocks, [
    Query.equal('blockerId', currentUserId),
    Query.equal('blockedId', targetUserId),
    Query.limit(1),
  ]);
  if (existing.documents[0]) return existing.documents[0];

  return databases.createDocument(DATABASE_ID, COLLECTIONS.blocks, ID.unique(), {
    blockerId: currentUserId,
    blockedId: targetUserId,
  });
}

export async function getOrCreateChat(currentUserId, targetUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) {
    throw new Error('A valid current user and target user are required to start a chat.');
  }

  const existing = await databases.listDocuments(DATABASE_ID, COLLECTIONS.chats, [
    Query.contains('participants', currentUserId),
    Query.contains('participants', targetUserId),
    Query.limit(1),
  ]);
  if (existing.documents[0]) return existing.documents[0].$id;

  const chat = await databases.createDocument(DATABASE_ID, COLLECTIONS.chats, ID.unique(), {
    participants: [currentUserId, targetUserId],
    lastMessage: 'Chat started',
    updatedAt: new Date().toISOString(),
  });
  return chat.$id;
}

export async function sendMessage(chatId, senderId, text, isRead = false, replyToId = '', attachmentType = '') {
  if (!chatId || !senderId || typeof text !== 'string' || !text.trim()) {
    throw new Error('A chat, sender, and non-empty message are required.');
  }

  const chat = await databases.getDocument(DATABASE_ID, COLLECTIONS.chats, chatId);
  if (!chat.participants?.includes(senderId)) {
    throw new Error('The sender is not a participant in this chat.');
  }
  const receiverId = chat.participants.find((participantId) => participantId !== senderId);
  if (!receiverId) throw new Error('The chat does not have another participant.');

  const message = await databases.createDocument(DATABASE_ID, COLLECTIONS.messages, ID.unique(), {
    senderId,
    receiverId,
    text: text.trim(),
    isRead: Boolean(isRead),
    replyToId: replyToId || '',
    attachmentType: attachmentType || '',
  });

  try {
    await databases.updateDocument(DATABASE_ID, COLLECTIONS.chats, chatId, {
      lastMessage: text.trim(),
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Message was saved, but the chat preview could not be updated:', error);
    throw error;
  }

  return message;
}

export function getAvatarPreviewUrl(fileId) {
  if (!fileId) throw new Error('An avatar file ID is required.');
  return storage.getFilePreviewURL(BUCKET_ID, fileId, 200, 200).toString();
}

export function getFileViewUrl(fileId) {
  if (!fileId) throw new Error('A file ID is required.');
  return storage.getFileViewURL(BUCKET_ID, fileId).toString();
}

export async function toggleLike(videoId, userId) {
  if (!videoId || !userId) {
    throw new Error('A video ID and user ID are required to toggle a like.');
  }

  const [likeResult, video] = await Promise.all([
    databases.listDocuments(DATABASE_ID, COLLECTIONS.likes, [
      Query.equal('videoId', videoId),
      Query.equal('userId', userId),
      Query.limit(1),
    ]),
    databases.getDocument(DATABASE_ID, COLLECTIONS.videos, videoId),
  ]);
  const existingLike = likeResult.documents[0];
  const wasLiked = Boolean(existingLike);
  const nextCount = Math.max(0, (Number(video.likes) || 0) + (wasLiked ? -1 : 1));
  let createdLike;

  if (wasLiked) {
    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.likes, existingLike.$id);
  } else {
    createdLike = await databases.createDocument(DATABASE_ID, COLLECTIONS.likes, ID.unique(), {
      userId,
      videoId,
    });
  }

  try {
    const updatedVideo = await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.videos,
      videoId,
      { likes: nextCount },
    );
    return {
      isLiked: !wasLiked,
      likes: Number(updatedVideo.likes) || 0,
    };
  } catch (error) {
    try {
      if (createdLike) {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.likes, createdLike.$id);
      } else {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.likes, existingLike.$id, {
          userId,
          videoId,
        });
      }
    } catch (rollbackError) {
      console.error('Could not roll back the like record after the video update failed:', rollbackError);
    }
    throw error;
  }
}

export async function repairBrokenVideoUrls() {
  const { documents } = await databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, [
    Query.equal('videoUrl', '[object Promise]'),
    Query.limit(100),
  ]);
  const repaired = [];
  const needsReupload = [];

  for (const video of documents) {
    if (!video.videoFileId) {
      needsReupload.push(video.$id);
      continue;
    }

    const videoUrl = getFileViewUrl(video.videoFileId);
    if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
      throw new Error(`Could not create a valid view URL for video ${video.$id}.`);
    }

    await databases.updateDocument(DATABASE_ID, COLLECTIONS.videos, video.$id, { videoUrl });
    repaired.push(video.$id);
  }

  return { repaired, needsReupload };
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
export async function generateAndUploadThumbnail(videoUri, videoId, userId) {
  const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, { time: 1000 });
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the generated video thumbnail.');
  const blob = await response.blob();
  const fileId = await uploadMediaFile({
    uri,
    fileName: `thumb_${videoId}.jpg`,
    mimeType: 'image/jpeg',
    fileSize: blob.size,
  }, {
    userId,
    kind: 'image',
    folder: `videos/${userId}/thumbnails`,
  });
  return getAvatarPreviewUrl(fileId);
}