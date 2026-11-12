import { databases, ID, Query } from './appwrite';
import { COLLECTIONS, DATABASE_ID } from './constants';
import { createNotification } from './helpers';

const COMMENT_PAGE_SIZE = 100;

export async function addPostComment(postId, text, currentUser, parentId = '', onCountError) {
  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!postId || !cleanText || !currentUser?.$id) {
    throw new Error('A post, signed-in user, and comment text are required.');
  }

  try {
    const comment = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.postComments,
      ID.unique(),
      {
        postId,
        userId: currentUser.$id,
        userName: currentUser.name || '',
        avatarUrl: currentUser.avatarUrl || '',
        text: cleanText,
        parentId: parentId || '',
        likes: 0,
        createdAt: new Date().toISOString(),
      },
    );

    try {
      await databases.incrementDocumentAttribute(
        DATABASE_ID,
        COLLECTIONS.posts,
        postId,
        'commentCount',
        1,
      );
    } catch (error) {
      console.error('Comment was saved, but the post comment count could not be updated:', error);
      onCountError?.(error);
    }

    try {
      const post = await databases.getDocument(DATABASE_ID, COLLECTIONS.posts, postId);
      if (post.userId && post.userId !== currentUser.$id) {
        await createNotification(
          post.userId,
          currentUser.name || 'Someone',
          currentUser.avatarUrl || '',
          'comment',
          post.$id,
        );
      }
    } catch (error) {
      console.error('Comment was saved, but its activity notification could not be created:', error);
    }

    return comment;
  } catch (error) {
    console.error('Could not add post comment:', error);
    throw error;
  }
}

export async function addVideoComment(videoId, text, currentUser, parentId = '') {
  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!videoId || !cleanText || !currentUser?.$id) {
    throw new Error('A video, signed-in user, and comment text are required.');
  }

  try {
    const comment = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.comments,
      ID.unique(),
      {
        videoId,
        userName: currentUser.name || '',
        avatarUrl: currentUser.avatarUrl || '',
        text: cleanText,
        parentId: parentId || '',
        likes: 0,
      },
    );
    try {
      const video = await databases.getDocument(DATABASE_ID, COLLECTIONS.videos, videoId);
      if (video.userId && video.userId !== currentUser.$id) {
        await createNotification(
          video.userId,
          currentUser.name || 'Someone',
          currentUser.avatarUrl || '',
          'comment',
          video.$id,
        );
      }
    } catch (error) {
      console.error('Video comment was saved, but its activity notification could not be created:', error);
    }
    return comment;
  } catch (error) {
    console.error('Could not add video comment:', error);
    throw error;
  }
}

export async function fetchPostComments(postId) {
  return fetchComments(postId, COLLECTIONS.postComments, 'postId');
}

export async function fetchVideoComments(videoId) {
  return fetchComments(videoId, COLLECTIONS.comments, 'videoId');
}

async function fetchComments(contentId, collectionId, contentAttribute) {
  if (!contentId) throw new Error('A content ID is required to fetch comments.');
  try {
    const documents = [];
    let offset = 0;
    while (true) {
      const result = await databases.listDocuments(DATABASE_ID, collectionId, [
        Query.equal(contentAttribute, contentId),
        Query.orderDesc('$createdAt'),
        Query.limit(COMMENT_PAGE_SIZE),
        Query.offset(offset),
      ]);
      documents.push(...result.documents);
      offset += result.documents.length;
      if (!result.documents.length || offset >= result.total) break;
    }
    return documents;
  } catch (error) {
    console.error(`Could not fetch comments from ${collectionId}:`, error);
    throw error;
  }
}

export async function fetchLikedCommentIds(commentIds, userId) {
  if (!userId || commentIds.length === 0) return new Set();
  const likedIds = new Set();
  try {
    for (let index = 0; index < commentIds.length; index += COMMENT_PAGE_SIZE) {
      const batch = commentIds.slice(index, index + COMMENT_PAGE_SIZE);
      let offset = 0;
      while (true) {
        const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.commentLikes, [
          Query.equal('userId', userId),
          Query.equal('commentId', batch),
          Query.limit(COMMENT_PAGE_SIZE),
          Query.offset(offset),
        ]);
        result.documents.forEach((like) => likedIds.add(like.commentId));
        offset += result.documents.length;
        if (!result.documents.length || offset >= result.total) break;
      }
    }
    return likedIds;
  } catch (error) {
    console.error('Could not fetch liked comment IDs:', error);
    throw error;
  }
}

export async function toggleCommentLike(
  commentId,
  userId,
  commentCollectionId = COLLECTIONS.postComments,
  currentLikes,
) {
  if (!commentId || !userId) {
    throw new Error('A comment ID and user ID are required to toggle a comment like.');
  }
  if (![COLLECTIONS.postComments, COLLECTIONS.comments].includes(commentCollectionId)) {
    throw new Error('A valid comment collection is required to toggle a comment like.');
  }

  const [likeResult, comment] = await Promise.all([
    databases.listDocuments(DATABASE_ID, COLLECTIONS.commentLikes, [
      Query.equal('commentId', commentId),
      Query.equal('userId', userId),
      Query.limit(1),
    ]),
    databases.getDocument(DATABASE_ID, commentCollectionId, commentId),
  ]);
  const existingLike = likeResult.documents[0];
  const wasLiked = Boolean(existingLike);
  const baseLikes = Number.isFinite(Number(currentLikes))
    ? Number(currentLikes)
    : Number(comment.likes) || 0;
  const likes = Math.max(0, baseLikes + (wasLiked ? -1 : 1));
  let createdLike;

  if (wasLiked) {
    await databases.deleteDocument(DATABASE_ID, COLLECTIONS.commentLikes, existingLike.$id);
  } else {
    createdLike = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.commentLikes,
      ID.unique(),
      { commentId, userId },
    );
  }

  try {
    const updatedComment = await databases.updateDocument(
      DATABASE_ID,
      commentCollectionId,
      commentId,
      { likes },
    );
    return { isLiked: !wasLiked, likes: Number(updatedComment.likes) || 0 };
  } catch (error) {
    try {
      if (createdLike) {
        await databases.deleteDocument(DATABASE_ID, COLLECTIONS.commentLikes, createdLike.$id);
      } else {
        await databases.createDocument(
          DATABASE_ID,
          COLLECTIONS.commentLikes,
          existingLike.$id,
          { commentId, userId },
        );
      }
    } catch (rollbackError) {
      console.error('Could not roll back the comment like record after the comment update failed:', rollbackError);
    }
    throw error;
  }
}

export async function togglePostCommentLike(commentId, userId, currentLikes) {
  return toggleCommentLike(
    commentId,
    userId,
    COLLECTIONS.postComments,
    currentLikes,
  );
}
