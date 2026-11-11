import { Permission, Role } from 'react-native-appwrite';
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { storage, ID, APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID } from './appwrite';
import { BUCKET_ID } from './constants';

const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v']);
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let webStoragePromise;

const mimeFromName = (name = '') => {
  const extension = name.split('.').pop()?.toLowerCase();
  const types = {
    mp4: 'video/mp4',
    m4v: 'video/x-m4v',
    mov: 'video/quicktime',
    webm: 'video/webm',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  };
  return types[extension] || '';
};

async function getAssetSize(asset) {
  if (!asset.uri) throw new Error('The selected file has no readable URI.');

  if (Platform.OS === 'web' && asset.file && Number.isFinite(asset.file.size)) {
    return asset.file.size;
  }

  if (Platform.OS !== 'web') {
    try {
      const fileInfo = await FileSystem.getInfoAsync(asset.uri);
      if (fileInfo.exists) {
        if (!Number.isFinite(fileInfo.size) || fileInfo.size <= 0) {
          throw new Error('The selected file is empty.');
        }
        return fileInfo.size;
      }
    } catch (error) {
      if (error.message === 'The selected file is empty.') throw error;
      console.warn('Could not read the selected file size from the device filesystem:', error);
    }
  }

  if (Number.isFinite(asset.fileSize) && asset.fileSize > 0) return asset.fileSize;

  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('Could not inspect the selected file size.');
  const blob = await response.blob();
  if (!Number.isFinite(blob.size) || blob.size <= 0) {
    throw new Error('Could not determine the selected file size.');
  }
  return blob.size;
}

function getFileName(asset, kind) {
  const uriName = asset.uri?.split(/[?#]/)[0].split('/').pop();
  let decodedUriName = '';
  try {
    decodedUriName = uriName ? decodeURIComponent(uriName) : '';
  } catch {
    decodedUriName = uriName || '';
  }
  const name = asset.fileName || asset.name || asset.file?.name || decodedUriName;
  return name && !name.startsWith('blob:')
    ? name
    : kind === 'video' ? 'video.mp4' : 'image.jpg';
}

export async function convertExpoAssetToFile(asset, { kind = 'image', fileName, mimeType } = {}) {
  if (!asset?.uri) throw new Error('The selected file has no readable URI.');
  if (typeof File === 'undefined') {
    throw new Error('Browser File uploads are only supported on web.');
  }

  const name = fileName || getFileName(asset, kind);
  const type = mimeType || asset.mimeType || asset.file?.type || asset.type || mimeFromName(name);
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error('Could not read the selected file.');

  const blob = await response.blob();
  if (!Number.isFinite(blob.size) || blob.size <= 0) {
    throw new Error('The selected file is empty.');
  }

  return new File([blob], name, { type: type || blob.type });
}

async function getWebStorage() {
  if (!webStoragePromise) {
    webStoragePromise = import('appwrite').then(({ Client, Storage }) => {
      const client = new Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID);
      return new Storage(client);
    }).catch((error) => {
      webStoragePromise = undefined;
      throw error;
    });
  }
  return webStoragePromise;
}

function notifyStatus(onStatusChange, status, message) {
  onStatusChange?.({ status, message });
}

export async function uploadMediaFile(
  asset,
  { userId, kind, publicRead = false, folder, onProgress, onStatusChange } = {},
) {
  try {
    if (!userId) throw new Error('Sign in before uploading a file.');
    if (!asset?.uri) throw new Error('The selected file is missing its URI.');
    if (kind !== 'video' && kind !== 'image') {
      throw new Error('Upload kind must be either "video" or "image".');
    }

    const fileName = getFileName(asset, kind);
    const allowedTypes = kind === 'video' ? VIDEO_TYPES : IMAGE_TYPES;
    const mimeType = [asset.mimeType, asset.file?.type, asset.type].find((type) => allowedTypes.has(type))
      || mimeFromName(fileName);
    if (!allowedTypes.has(mimeType)) {
      throw new Error(`Unsupported ${kind} file type: ${mimeType || 'unknown'}.`);
    }

    const maxBytes = kind === 'video' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
    const declaredSize = Platform.OS === 'web'
      ? asset.file?.size ?? asset.fileSize
      : asset.fileSize;
    if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
      throw new Error(`${kind === 'video' ? 'Video' : 'Image'} must be no larger than ${kind === 'video' ? 50 : 5} MB.`);
    }

    notifyStatus(onStatusChange, 'uploading', kind === 'video' ? 'Uploading video…' : 'Uploading profile picture…');
    let file;
    let size;
    if (Platform.OS === 'web') {
      file = await convertExpoAssetToFile(asset, { kind, fileName, mimeType });
      size = file.size;
    } else {
      size = await getAssetSize(asset);
    }
    if (size > maxBytes) {
      throw new Error(`${kind === 'video' ? 'Video' : 'Image'} must be no larger than ${kind === 'video' ? 50 : 5} MB.`);
    }

    const ownerRole = Role.user(userId);
    const permissions = [
      publicRead ? Permission.read(Role.any()) : Permission.read(ownerRole),
      Permission.update(ownerRole),
      Permission.delete(ownerRole),
    ];

    const fileId = ID.unique();
    const uploaded = Platform.OS === 'web'
      ? await getWebStorage().then((webStorage) => webStorage.createFile({
          bucketId: BUCKET_ID,
          fileId,
          file,
          permissions,
          folder: folder || undefined,
          onProgress,
        }))
      : await storage.createFile({
        bucketId: BUCKET_ID,
        fileId,
        file: {
          name: fileName,
          type: mimeType,
          size,
          uri: asset.uri,
        },
        permissions,
        folder: folder || undefined,
        onProgress,
      });
    notifyStatus(
      onStatusChange,
      'success',
      kind === 'video' ? 'Video uploaded successfully!' : 'Profile picture updated successfully!',
    );
    return uploaded.$id;
  } catch (error) {
    console.error(`Appwrite ${kind} upload failed:`, error);
    notifyStatus(onStatusChange, 'error', error.message || 'Upload failed. Please try again.');
    throw error;
  }
}

export function uploadVideo(asset, userId, onProgress, onStatusChange) {
  return uploadMediaFile(asset, {
    userId,
    kind: 'video',
    folder: `videos/${userId}`,
    onProgress,
    onStatusChange,
  });
}
