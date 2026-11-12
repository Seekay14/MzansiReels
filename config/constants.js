// All Appwrite IDs live here so a typo can only happen in one place.
export const DATABASE_ID = '6af0bc84001abbbcb856';
export const BUCKET_ID = '6af0bf150026128b0048';
export const PUSH_NOTIFICATION_FUNCTION_ID = '6af4567b000022e1dab8';
export const DELETE_USER_FUNCTION_ID = '6af477db000e25a8caec';
export const MESSAGE_FUNCTION_ID = 'send-message';
export const STORY_VIEW_FUNCTION_ID = 'record-story-view';

export const COLLECTIONS = {
  // 👈 FIXED: Using the exact ID from your screenshot (3 zeros)
  videos: '6af0bcb10006ade69d48', 
  posts: '6af3949e000d613946bf',
  stories: '6af42b7f002fb4e8a1f8',
  comments: '6af0c43f001655ee7511',
  postComments: '6af3a88c00396f0d49b9',
  commentLikes: '6af45d390007fa5cbb40',
  profilePictures: '6af3abb50025851a7cc4',
  users: '6af0c69b0019c1c74d74',
  messages: '6af0c7fd002e8d46827c',
  notifications: '6af46388001b8d4a8597',
  videoLikes: '6af4582e000090ea8aec',
  postLikes: '6af3b1930015013e6b4b',
  follows: '6af0dfe100196e6116f4',
  bookmarks: '6af0fbce003c0e8aec59',
  typingStatus: '6af31c57001d52c8fbd0',
  reports: '6af31e42000017a213e7',
  blocks: '6af31db90012d83cf0bb',
  chats: '6af324010030906d4c0b',
  storyViews: '6af5cf2a0033a90f811c',
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