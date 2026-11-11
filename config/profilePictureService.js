import { databases, Query, storage, ID } from './appwrite';
import { BUCKET_ID, COLLECTIONS, DATABASE_ID } from './constants';
import { uploadMediaFile } from './mediaUpload';

export async function uploadProfilePicture(asset, currentUser, onStatusChange) {
  if (!currentUser?.$id) {
    throw new Error('Sign in before uploading a profile picture.');
  }

  let uploadedFileId;
  try {
    uploadedFileId = await uploadMediaFile(asset, {
      userId: currentUser.$id,
      kind: 'image',
      publicRead: true,
      folder: `avatars/${currentUser.$id}`,
      onStatusChange: (status) => {
        if (status?.status === 'error') {
          onStatusChange?.(status);
        } else {
          onStatusChange?.({
            status: 'uploading',
            message: status?.status === 'success'
              ? 'Saving your new profile picture…'
              : status?.message || 'Uploading profile picture…',
          });
        }
      },
    });

    const url = storage.getFileViewURL(BUCKET_ID, uploadedFileId).toString();
    if (!url) throw new Error('Appwrite did not return a profile picture URL.');

    const uploadedAt = new Date().toISOString();
    const existing = await databases.listDocuments(DATABASE_ID, COLLECTIONS.profilePictures, [
      Query.equal('userId', currentUser.$id),
      Query.limit(1),
    ]);

    const pictureData = {
      userId: currentUser.$id,
      fileId: uploadedFileId,
      url,
      uploadedAt,
    };
    const profilePicture = existing.documents[0]
      ? await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.profilePictures,
        existing.documents[0].$id,
        pictureData,
      )
      : await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.profilePictures,
        ID.unique(),
        pictureData,
      );

    const userResult = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
      Query.equal('userId', currentUser.$id),
      Query.limit(1),
    ]);
    const userDocument = userResult.documents[0];
    if (!userDocument) throw new Error('Your user profile could not be found.');

    const updatedUser = await databases.updateDocument(
      DATABASE_ID,
      COLLECTIONS.users,
      userDocument.$id,
      { avatarUrl: url },
    );

    await Promise.all([
      updateExistingAvatarUrls(COLLECTIONS.posts, currentUser.$id, url),
      updateExistingAvatarUrls(COLLECTIONS.videos, currentUser.$id, url),
    ]);

    onStatusChange?.({
      status: 'success',
      message: 'Profile picture updated successfully!',
    });
    return { fileId: uploadedFileId, url, profilePicture, userDocument: updatedUser };
  } catch (error) {
    console.error('Could not upload profile picture:', error);
    onStatusChange?.({ status: 'error', message: error.message || 'Profile picture upload failed.' });
    throw error;
  }
}

async function updateExistingAvatarUrls(collectionId, userId, avatarUrl) {
  let offset = 0;
  let total = 0;
  do {
    const result = await databases.listDocuments(DATABASE_ID, collectionId, [
      Query.equal('userId', userId),
      Query.limit(100),
      Query.offset(offset),
    ]);

    for (let index = 0; index < result.documents.length; index += 10) {
      const batch = result.documents.slice(index, index + 10);
      await Promise.all(batch.map((document) => (
        databases.updateDocument(DATABASE_ID, collectionId, document.$id, { avatarUrl })
      )));
    }

    offset += result.documents.length;
    total = result.total;
  } while (offset < total);
}

export async function getProfilePicture(userId) {
  if (!userId) return null;

  try {
    const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.profilePictures, [
      Query.equal('userId', userId),
      Query.limit(1),
    ]);
    return result.documents[0]?.url || null;
  } catch (error) {
    console.error('Could not fetch profile picture:', error);
    throw error;
  }
}
