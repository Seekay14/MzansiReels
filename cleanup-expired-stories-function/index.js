const { Client, Databases, Query, Storage } = require('node-appwrite');

const PAGE_SIZE = 100;
const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const FILE_ID_PATTERN = /\/files\/([^/?#]+)\/(?:view|preview|download)(?:[/?#]|$)/;

function getFileId(mediaUrl) {
  if (!mediaUrl) return null;
  const match = FILE_ID_PATTERN.exec(mediaUrl);
  return match ? decodeURIComponent(match[1]) : null;
}

module.exports = async function (req, res) {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.DATABASE_ID;
  const storiesCollectionId = process.env.STORIES_COLLECTION_ID;
  const bucketId = process.env.STORAGE_BUCKET_ID;

  const missing = [
    ['APPWRITE_ENDPOINT', endpoint],
    ['APPWRITE_PROJECT_ID', projectId],
    ['APPWRITE_API_KEY', apiKey],
    ['DATABASE_ID', databaseId],
    ['STORIES_COLLECTION_ID', storiesCollectionId],
    ['STORAGE_BUCKET_ID', bucketId],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    return res.json({ success: false, error: `Missing environment variables: ${missing.join(', ')}` }, 500);
  }

  const client = new Client()
    .setEndpoint(endpoint)
    .setProject(projectId)
    .setKey(apiKey);
  const databases = new Databases(client);
  const storage = new Storage(client);
  const expiryCutoff = new Date(Date.now() - STORY_TTL_MS).toISOString();
  const expiredStories = [];
  let offset = 0;

  try {
    while (true) {
      const page = await databases.listDocuments(databaseId, storiesCollectionId, [
        Query.lessThan('$createdAt', expiryCutoff),
        Query.limit(PAGE_SIZE),
        Query.offset(offset),
      ]);
      expiredStories.push(...page.documents);
      if (page.documents.length < PAGE_SIZE) break;
      offset += page.documents.length;
    }

    const failures = [];
    let deleted = 0;
    for (const story of expiredStories) {
      try {
        const fileId = getFileId(story.mediaUrl);
        if (fileId) {
          try {
            await storage.deleteFile(bucketId, fileId);
          } catch (error) {
            if (error.code !== 404) throw error;
            console.warn(`Story ${story.$id} references a file that is already missing.`);
          }
        }
        await databases.deleteDocument(databaseId, storiesCollectionId, story.$id);
        deleted += 1;
      } catch (error) {
        failures.push({ storyId: story.$id, message: error.message });
        console.error(`Could not clean up expired story ${story.$id}:`, error);
      }
    }

    return res.json({
      success: failures.length === 0,
      expired: expiredStories.length,
      deleted,
      failures,
    }, failures.length ? 500 : 200);
  } catch (error) {
    console.error('Expired story cleanup failed:', error);
    return res.json({ success: false, error: error.message }, 500);
  }
};
