const crypto = require('crypto');
const {
  Account,
  Client,
  Databases,
  Permission,
  Query,
  Role,
} = require('node-appwrite');

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function getUserJwt(req) {
  const headers = req.headers || {};
  return headers['x-appwrite-user-jwt'] || headers['X-Appwrite-User-JWT'];
}

function parseRequestBody(body) {
  if (typeof body !== 'string') return body || {};
  try {
    return JSON.parse(body);
  } catch (error) {
    return null;
  }
}

async function getOwnerAccountId(databases, databaseId, usersCollectionId, story) {
  try {
    const profile = await databases.getDocument(
      databaseId,
      usersCollectionId,
      story.userId,
    );
    return profile.userId || null;
  } catch (error) {
    if (error.code === 404) return story.userId;
    throw error;
  }
}

async function findExistingView(databases, databaseId, viewsCollectionId, storyId, viewerId) {
  const page = await databases.listDocuments(databaseId, viewsCollectionId, [
    Query.equal('storyId', storyId),
    Query.equal('viewerId', viewerId),
    Query.limit(1),
  ]);
  return page.documents[0] || null;
}

module.exports = async function (req, res) {
  const endpoint = process.env.APPWRITE_ENDPOINT;
  const projectId = process.env.APPWRITE_PROJECT_ID;
  const apiKey = process.env.APPWRITE_API_KEY;
  const databaseId = process.env.DATABASE_ID;
  const storiesCollectionId = process.env.STORIES_COLLECTION_ID;
  const usersCollectionId = process.env.USERS_COLLECTION_ID;
  const viewsCollectionId = process.env.STORY_VIEWS_COLLECTION_ID;
  const missing = [
    ['APPWRITE_ENDPOINT', endpoint],
    ['APPWRITE_PROJECT_ID', projectId],
    ['APPWRITE_API_KEY', apiKey],
    ['DATABASE_ID', databaseId],
    ['STORIES_COLLECTION_ID', storiesCollectionId],
    ['USERS_COLLECTION_ID', usersCollectionId],
    ['STORY_VIEWS_COLLECTION_ID', viewsCollectionId],
  ].filter(([, value]) => !value).map(([name]) => name);

  if (missing.length) {
    return res.json({ success: false, error: `Missing environment variables: ${missing.join(', ')}` }, 500);
  }

  const userJwt = getUserJwt(req);
  const body = parseRequestBody(req.body);
  const storyId = body?.storyId;
  if (!userJwt || typeof storyId !== 'string' || !storyId) {
    return res.json({ success: false, error: 'A signed-in user and valid storyId are required.' }, 400);
  }

  try {
    const userClient = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setJWT(userJwt);
    const authenticatedUser = await new Account(userClient).get();
    const adminClient = new Client()
      .setEndpoint(endpoint)
      .setProject(projectId)
      .setKey(apiKey);
    const databases = new Databases(adminClient);
    const story = await databases.getDocument(databaseId, storiesCollectionId, storyId);
    const expiresAt = Date.parse(story.$createdAt) + STORY_TTL_MS;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return res.json({ success: false, error: 'This story has expired.' }, 410);
    }

    const ownerId = await getOwnerAccountId(
      databases,
      databaseId,
      usersCollectionId,
      story,
    );
    if (!ownerId) {
      return res.json({ success: false, error: 'Could not resolve the story owner account.' }, 500);
    }
    if (ownerId === authenticatedUser.$id) {
      return res.json({
        success: true,
        created: false,
        views: Number(story.views) || 0,
      });
    }

    const existingView = await findExistingView(
      databases,
      databaseId,
      viewsCollectionId,
      storyId,
      authenticatedUser.$id,
    );
    if (existingView) {
      return res.json({
        success: true,
        created: false,
        views: Number(story.views) || 0,
      });
    }

    const viewId = crypto
      .createHash('sha256')
      .update(`${storyId}:${authenticatedUser.$id}`)
      .digest('hex')
      .slice(0, 32);
    try {
      await databases.createDocument(
        databaseId,
        viewsCollectionId,
        viewId,
        {
          storyId,
          viewerId: authenticatedUser.$id,
          viewerName: authenticatedUser.name || 'Mzansi User',
          viewerAvatar: '',
          viewedAt: new Date().toISOString(),
        },
        [
          Permission.read(Role.user(ownerId)),
          Permission.read(Role.user(authenticatedUser.$id)),
        ],
      );
    } catch (error) {
      if (error.code !== 409 && error.type !== 'document_already_exists') throw error;
      return res.json({
        success: true,
        created: false,
        views: Number(story.views) || 0,
      });
    }

    const updatedStory = await databases.incrementDocumentAttribute(
      databaseId,
      storiesCollectionId,
      storyId,
      'views',
      1,
    );
    return res.json({
      success: true,
      created: true,
      views: Number(updatedStory.views) || 1,
    });
  } catch (error) {
    console.error('Could not record story view:', {
      message: error.message,
      code: error.code,
      type: error.type,
    });
    return res.json({ success: false, error: error.message || 'Could not record story view.' }, 500);
  }
};
