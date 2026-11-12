import { account, databases, ID, Query, storage } from './appwrite';
import { BUCKET_ID, COLLECTIONS, DATABASE_ID } from './constants';
import { getFileViewUrl } from './helpers';
import { uploadMediaFile } from './mediaUpload';
import { isStoryActive, STORY_TTL_MS } from './storyUtils';

const MAX_STORY_VIDEO_MS = 45_000;
const STORY_PAGE_SIZE = 100;

export async function fetchActiveStories() {
  const cutoff = new Date(Date.now() - STORY_TTL_MS).toISOString();
  const stories = [];
  let offset = 0;

  while (true) {
    const page = await databases.listDocuments(DATABASE_ID, COLLECTIONS.stories, [
      Query.greaterThan('$createdAt', cutoff),
      Query.orderDesc('$createdAt'),
      Query.limit(STORY_PAGE_SIZE),
      Query.offset(offset),
    ]);
    stories.push(...page.documents.filter((story) => isStoryActive(story)));
    offset += page.documents.length;
    if (!page.documents.length || offset >= page.total) break;
  }

  return [...new Map(stories.map((story) => [story.$id, story])).values()];
}

export async function uploadStory(
  asset,
  currentUser,
  {
    content = '',
    mediaType = asset?.type,
    durationMs,
    onStatusChange,
    onProgress,
  } = {},
) {
  let fileId;
  try {
    onStatusChange?.({ status: 'validating', message: 'Validating story…' });
    if (!currentUser?.$id) {
      throw new Error('Sign in before uploading a story.');
    }

    const authenticatedUser = await account.get();
    if (authenticatedUser.$id !== currentUser.$id) {
      throw new Error('Your signed-in account does not match this story owner. Please sign in again.');
    }

    const normalizedContent = typeof content === 'string' ? content.trim() : '';
    if (mediaType === 'text') {
      if (!normalizedContent) throw new Error('Write some text before sharing your story.');
      if (normalizedContent.length > 500) throw new Error('Text stories can be up to 500 characters.');
    } else {
      if (mediaType !== 'image' && mediaType !== 'video') {
        throw new Error('Choose a supported image, video, or text story.');
      }
      if (!asset?.uri) throw new Error('The selected media is missing its local file URI.');
      if (mediaType === 'video') {
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
          throw new Error('Could not verify video duration. Please choose another video.');
        }
        if (durationMs > MAX_STORY_VIDEO_MS) {
          const error = new Error('Video too long. Stories must be 45 seconds or less.');
          error.code = 'STORY_VIDEO_TOO_LONG';
          throw error;
        }
      }

      onStatusChange?.({ status: 'preparing', message: 'Preparing media…' });
      fileId = await uploadMediaFile(asset, {
        userId: authenticatedUser.$id,
        kind: mediaType,
        publicRead: true,
        folder: `stories/${authenticatedUser.$id}`,
        onStatusChange,
        onProgress,
      });
    }

    onStatusChange?.({ status: 'saving', message: 'Saving story…' });
    const mediaUrl = fileId ? getFileViewUrl(fileId) : '';
    if (fileId && !/^https?:\/\//i.test(mediaUrl)) {
      throw new Error('Appwrite did not return a valid story media URL.');
    }
    const createdAt = new Date();
    const story = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.stories,
      ID.unique(),
      {
        userId: authenticatedUser.$id,
        userName: authenticatedUser.name || currentUser.name || '',
        avatarUrl: currentUser.avatarUrl || '',
        mediaUrl,
        mediaType,
        content: normalizedContent,
        createdAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        views: 0,
      },
    );
    onStatusChange?.({ status: 'success', message: 'Story published successfully.' });
    return story;
  } catch (error) {
    console.error('Could not upload story:', error);
    if (fileId) {
      try {
        await storage.deleteFile(BUCKET_ID, fileId);
      } catch (cleanupError) {
        console.error('Could not clean up the uploaded story file:', cleanupError);
      }
    }
    onStatusChange?.({ status: 'error', message: error.message || 'Story upload failed.' });
    throw error;
  }
}
