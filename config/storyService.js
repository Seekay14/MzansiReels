import { Audio } from 'expo-av';
import { databases, ID, storage } from './appwrite';
import { BUCKET_ID, COLLECTIONS, DATABASE_ID } from './constants';
import { getFileViewUrl } from './helpers';
import { uploadMediaFile } from './mediaUpload';

const MAX_STORY_VIDEO_MS = 45_000;

async function verifyStoryVideoDuration(asset) {
  let sound;
  try {
    const result = await Audio.Sound.createAsync(
      { uri: asset.uri },
      { shouldPlay: false },
    );
    sound = result.sound;
    if (!result.status.isLoaded || !Number.isFinite(result.status.durationMillis)) {
      throw new Error('Could not verify video duration. Please choose another video.');
    }
    if (result.status.durationMillis > MAX_STORY_VIDEO_MS) {
      const error = new Error('Video too long. Stories must be 45 seconds or less.');
      error.code = 'STORY_VIDEO_TOO_LONG';
      throw error;
    }
  } finally {
    if (sound) {
      try {
        await sound.unloadAsync();
      } catch (error) {
        console.error('Could not unload the temporary story video probe:', error);
      }
    }
  }
}

export async function uploadStory(asset, currentUser) {
  if (!asset?.uri || !currentUser?.$id) {
    throw new Error('Choose a story file and sign in before uploading.');
  }

  const mediaType = asset.type;
  if (mediaType !== 'image' && mediaType !== 'video') {
    throw new Error('Story media must be an image or video.');
  }
  if (mediaType === 'video') await verifyStoryVideoDuration(asset);

  const fileId = await uploadMediaFile(asset, {
    userId: currentUser.$id,
    kind: mediaType,
    publicRead: true,
    folder: `stories/${currentUser.$id}`,
  });
  const mediaUrl = getFileViewUrl(fileId);

  try {
    return await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.stories,
      ID.unique(),
      {
        userId: currentUser.$id,
        userName: currentUser.name || '',
        avatarUrl: currentUser.avatarUrl || '',
        mediaUrl,
        mediaType,
        createdAt: new Date().toISOString(),
        views: 0,
      },
    );
  } catch (error) {
    console.error('Story media uploaded, but its story document could not be saved:', error);
    try {
      await storage.deleteFile(BUCKET_ID, fileId);
    } catch (cleanupError) {
      console.error('Could not clean up the uploaded story file:', cleanupError);
    }
    throw error;
  }
}
