import { databases, storage, functions, ID, Query } from './appwrite';
import { Permission, Role } from 'react-native-appwrite';
import { Alert } from 'react-native';
import {
  DATABASE_ID,
  COLLECTIONS,
  BUCKET_ID,
  PUSH_NOTIFICATION_FUNCTION_ID,
  fileIdFromUrl,
} from './constants';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { uploadMediaFile } from './mediaUpload';
export { sendMessage } from './chatService';

export function requireAuth(actionName, navigation, currentUser) {
  if (currentUser) return true;

  Alert.alert('Login Required', `You need to log in to ${actionName}.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Log In', onPress: () => navigation.navigate('Login') },
  ]);
  return false;
}

export async function getUserDoc(userId) {
  const res = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
    Query.equal('userId', userId),
    Query.limit(1),
  ]);
  return res.documents[0] || null;
}

export async function getUserDocs(userIds) {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const profiles = [];
  for (let index = 0; index < uniqueIds.length; index += 100) {
    const batch = uniqueIds.slice(index, index + 100);
    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
      Query.equal('userId', batch),
      Query.limit(100),
    ]);
    profiles.push(...result.documents);
  }
  return profiles;
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

export function getAvatarPreviewUrl(fileId) {
  if (!fileId) throw new Error('An avatar file ID is required.');
  return storage.getFilePreviewURL(BUCKET_ID, fileId, 200, 200).toString();
}

export function getFileViewUrl(fileId) {
  if (!fileId) throw new Error('A file ID is required.');
  return storage.getFileViewURL(BUCKET_ID, fileId).toString();
}

export function getVideoThumbnail(video) {
  if (!video || typeof video !== 'object') return '';
  if (typeof video.thumbnailUrl === 'string' && video.thumbnailUrl.trim()) {
    return video.thumbnailUrl;
  }

  const fileId = video.videoFileId || fileIdFromUrl(video.videoUrl);
  if (!fileId) return '';

  return storage.getFilePreviewURL(BUCKET_ID, fileId, 400, 400).toString();
}

export async function sharePost(originalPost, currentUser, newCaption = '') {
  if (!originalPost?.$id || !originalPost.userId || !currentUser?.$id) {
    throw new Error('A post and signed-in user are required to share a post.');
  }

  const originalContent = originalPost.content || '';
  const thoughts = typeof newCaption === 'string' ? newCaption.trim() : '';

  const sharedPost = await databases.createDocument(DATABASE_ID, COLLECTIONS.posts, ID.unique(), {
    postType: originalPost.postType || 'text',
    imageUrl: originalPost.imageUrl || '',
    videoUrl: originalPost.videoUrl || '',
    content: thoughts ? `${thoughts}\n\n${originalContent}` : originalContent,
    userId: currentUser.$id,
    userName: currentUser.name || '',
    avatarUrl: currentUser.avatarUrl || '',
    sharedFromName: originalPost.sharedFromName || originalPost.userName || 'Mzansi Creator',
    sharedFromId: originalPost.sharedFromId || originalPost.$id,
    sharedFromUserId: originalPost.sharedFromUserId || originalPost.userId,
    likes: 0,
    views: 0,
    shares: 0,
    uploadedAt: new Date().toISOString(),
  });

  const currentOriginalPost = await databases.getDocument(
    DATABASE_ID,
    COLLECTIONS.posts,
    originalPost.$id,
  );
  const updatedOriginalPost = await databases.updateDocument(
    DATABASE_ID,
    COLLECTIONS.posts,
    originalPost.$id,
    { shares: (Number(currentOriginalPost.shares) || 0) + 1 },
  );

  return {
    sharedPost,
    originalShares: Number(updatedOriginalPost.shares) || 0,
    originalPostId: originalPost.$id,
  };
}

export async function togglePostLike(postId, userId, currentLikes, userName = '', senderAvatar = '') {
  if (!postId || !userId) {
    throw new Error('A post ID and user ID are required to toggle a post like.');
  }

  const [likeResult, post] = await Promise.all([
    databases.listDocuments(DATABASE_ID, COLLECTIONS.postLikes, [
      Query.equal('postId', postId),
      Query.equal('userId', userId),
      Query.limit(1),
    ]),
    databases.getDocument(DATABASE_ID, COLLECTIONS.posts, postId),
  ]);
  const existingLike = likeResult.documents[0];
  const wasLiked = Boolean(existingLike);
  const baseLikes = Number.isFinite(Number(currentLikes))
    ? Number(currentLikes)
    : Number(post.likes) || 0;
  const nextCount = Math.max(0, baseLikes + (wasLiked ? -1 : 1));
  let createdLike;

  if (wasLiked) {
    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.postLikes, existingLike.$id);
  } else {
    createdLike = await databases.createDocument(DATABASE_ID, COLLECTIONS.postLikes, ID.unique(), {
      userId,
      postId,
    });
  }

  try {
    const updatedPost = await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.posts,
      postId,
      { likes: nextCount },
    );
    if (!wasLiked && post.userId && post.userId !== userId) {
      try {
        await createNotification(post.userId, userName || 'Someone', senderAvatar, 'like', post.$id);
      } catch (error) {
        console.error('Post was liked, but the activity notification could not be created:', error);
      }
    }
    return { isLiked: !wasLiked, likes: Number(updatedPost.likes) || 0 };
  } catch (error) {
    try {
      if (createdLike) {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.postLikes, createdLike.$id);
      } else {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.postLikes, existingLike.$id, {
          userId,
          postId,
        });
      }
    } catch (rollbackError) {
      console.error('Could not roll back the post like record after the post update failed:', rollbackError);
    }
    throw error;
  }
}

export async function toggleVideoLike(videoId, userId, userName, senderAvatar = '') {
  if (!videoId || !userId) {
    throw new Error('A video ID and user ID are required to toggle a video like.');
  }

  const [likeResult, video] = await Promise.all([
    databases.listDocuments(DATABASE_ID, COLLECTIONS.videoLikes, [
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
    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.videoLikes, existingLike.$id);
  } else {
    createdLike = await databases.createDocument(DATABASE_ID, COLLECTIONS.videoLikes, ID.unique(), {
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
    if (!wasLiked && video.userId && video.userId !== userId) {
      try {
        await createNotification(video.userId, userName || 'Someone', senderAvatar, 'like', video.$id);
      } catch (error) {
        console.error('Video was liked, but the activity notification could not be created:', error);
      }
    }
    return {
      isLiked: !wasLiked,
      likes: Number(updatedVideo.likes) || 0,
    };
  } catch (error) {
    try {
      if (createdLike) {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.videoLikes, createdLike.$id);
      } else {
        await databases.createDocument(DATABASE_ID, COLLECTIONS.videoLikes, existingLike.$id, {
          userId,
          videoId,
        });
      }
    } catch (rollbackError) {
      console.error('Could not roll back the video like record after the video update failed:', rollbackError);
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
  if (!user?.$id) throw new Error('A signed-in user is required to load a profile.');
  const existing = await getUserDoc(user.$id);
  if (existing) return existing;

  return databases.createDocument(DATABASE_ID, COLLECTIONS.users, ID.unique(), {
    userId: user.$id,
    name: '',
    username: '',
    avatarUrl: '',
    followers: 0,
    following: 0,
    pushNotifications: true,
    isPrivate: false,
    isVerified: false,
    interests: [],
    profileSetupComplete: false,
    onboardingComplete: false,
  });
}

export async function createNotification(targetUserId, senderName, senderAvatar, type, postId) {
  if (!targetUserId || !type) {
    throw new Error('A target user and notification type are required.');
  }
  const notification = await databases.createDocument(
    DATABASE_ID,
    COLLECTIONS.notifications,
    ID.unique(),
    {
      userId: targetUserId,
      senderName,
      senderAvatar: senderAvatar || '',
      type,
      postId: postId || '',
      isRead: false,
      createdAt: new Date().toISOString(),
      shares: 0,
    },
    [
      Permission.read(Role.user(targetUserId)),
      Permission.update(Role.user(targetUserId)),
      Permission.delete(Role.user(targetUserId)),
    ],
  );

  const actorName = senderName || 'Someone';
  const notificationCopy = {
    like: { title: 'New Like!', body: `${actorName} liked your post.` },
    comment: { title: 'New Comment!', body: `${actorName} commented on your post.` },
    follow: { title: 'New Follower!', body: `${actorName} followed you.` },
    message: { title: 'New Message', body: `${actorName} sent you a message.` },
  }[type] || { title: 'New Activity', body: `${actorName} sent you a notification.` };

  try {
    const recipientProfile = await getUserDoc(targetUserId);
    if (recipientProfile?.pushNotifications === false) return notification;

    await functions.createExecution({
      functionId: PUSH_NOTIFICATION_FUNCTION_ID,
      body: JSON.stringify({
        targetUserId,
        ...notificationCopy,
        postId: postId || '',
      }),
      async: true,
    });
  } catch (error) {
    console.error('Activity notification was created, but push could not be triggered or preference checked:', error);
  }

  return notification;
}

export async function notify(toUserId, senderName, type, senderAvatar = '', postId = '') {
  if (!toUserId) return;
  try {
    await createNotification(toUserId, senderName || 'Someone', senderAvatar, type, postId);
  } catch (error) {
    console.error('Could not create activity notification:', error);
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