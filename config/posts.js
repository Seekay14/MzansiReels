import { Alert } from 'react-native';
import { databases, ID } from './appwrite';
import { COLLECTIONS, DATABASE_ID } from './constants';
import { generateAndUploadThumbnail, getFileViewUrl } from './helpers';
import { uploadMediaFile } from './mediaUpload';

export async function createPost({
  currentUser,
  textInput,
  postType,
  asset,
  onUploadStatus,
}) {
  try {
    if (!currentUser?.$id) throw new Error('Sign in before creating a post.');
    if (!['text', 'image', 'video'].includes(postType)) {
      throw new Error('Choose a valid post type.');
    }
    if (typeof textInput !== 'string') {
      throw new Error('Post content must be text.');
    }
    if (postType === 'text' && !textInput.trim()) {
      throw new Error('Write something before posting.');
    }
    if (postType !== 'text' && !asset?.uri) {
      throw new Error(`Choose a ${postType} before posting.`);
    }

    let imageUrl = '';
    let videoUrl = '';
    if (postType !== 'text') {
      const fileId = await uploadMediaFile(asset, {
        userId: currentUser.$id,
        kind: postType,
        publicRead: true,
        folder: `${postType === 'video' ? 'videos' : 'posts'}/${currentUser.$id}`,
        onStatusChange: onUploadStatus,
      });
      const uploadedUrl = getFileViewUrl(fileId);
      if (!uploadedUrl.startsWith('http://') && !uploadedUrl.startsWith('https://')) {
        throw new Error(`Could not create a valid ${postType} URL.`);
      }
      if (postType === 'image') imageUrl = uploadedUrl;
      if (postType === 'video') videoUrl = uploadedUrl;
    }

    const uploadedAt = new Date().toISOString();
    const sharedData = {
      postType,
      content: textInput.trim(),
      userId: currentUser.$id,
      userName: currentUser.name || '',
      avatarUrl: currentUser.avatarUrl || '',
      likes: 0,
      views: 0,
      uploadedAt,
    };
    const data = postType === 'video'
      ? { ...sharedData, videoUrl }
      : { ...sharedData, imageUrl, videoUrl, shares: 0 };

    const documentId = ID.unique();
    const document = await databases.createDocument(
      DATABASE_ID,
      postType === 'video' ? COLLECTIONS.videos : COLLECTIONS.posts,
      documentId,
      data,
    );

    if (postType !== 'video') return document;

    try {
      const thumbnailUrl = await generateAndUploadThumbnail(asset.uri, documentId, currentUser.$id);
      const parsedThumbnailUrl = new URL(thumbnailUrl);
      if (parsedThumbnailUrl.protocol !== 'http:' && parsedThumbnailUrl.protocol !== 'https:') {
        throw new Error('Could not generate a valid video thumbnail URL.');
      }
      return await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.videos,
        documentId,
        { thumbnailUrl: parsedThumbnailUrl.toString() },
      );
    } catch (error) {
      console.warn(`Video ${documentId} was posted without a thumbnail:`, error);
      onUploadStatus?.({
        status: 'warning',
        message: 'Video posted, but its thumbnail could not be generated or saved.',
      });
      return document;
    }
  } catch (error) {
    console.error(error);
    Alert.alert('Upload failed', error.message || String(error));
    throw error;
  }
}
