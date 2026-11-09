// All Appwrite IDs live here so a typo can only happen in one place.
export const DATABASE_ID = '6af0bc84001abbbcb856';
export const BUCKET_ID = '6af0bf150026128b0048';

export const COLLECTIONS = {
  // 👈 FIXED: Using the exact ID from your screenshot (3 zeros)
  videos: '6af0bcb10006ade69d48', 
  comments: '6af0c43f001655ee7511',
  users: '6af0c69b0019c1c74d74',
  messages: '6af0c7fd002e8d46827c',
  notifications: '6af0c95100156e8da70c',
  likes: '6af0df47001d46d146d9',
  follows: '6af0dfe100196e6116f4',
  bookmarks: '6af0fbce003c0e8aec59',
};

export const MAX_UPLOAD_MB = 50;

export const COLORS = {
  bg: '#0A0A0F',
  card: '#15151E',
  border: '#1F1F28',
  cyan: '#00E5FF',
  pink: '#FF0055',
  muted: '#888',
  text: '#fff',
};

export const fileIdFromUrl = (url) => {
  const match = /\/files\/([^/]+)\//.exec(url || '');
  return match ? match[1] : null;
};