import {
  account,
  databases,
  functions,
  Query,
} from './appwrite';
import { COLLECTIONS, DATABASE_ID, STORY_VIEW_FUNCTION_ID } from './constants';
import { getStoryExpiresAt } from './storyUtils';

const VIEW_PAGE_SIZE = 100;

async function getStoryOwnerAccountId(story, authenticatedUserId) {
  if (story.userId === authenticatedUserId) return authenticatedUserId;

  try {
    const profile = await databases.getDocument(
      DATABASE_ID,
      COLLECTIONS.users,
      story.userId,
    );
    return profile.userId || null;
  } catch (error) {
    if (error?.code === 404) return null;
    throw error;
  }
}

function parseFunctionResponse(responseBody) {
  try {
    return JSON.parse(responseBody || '{}');
  } catch {
    throw new Error('The story-view function returned an invalid response.');
  }
}

export async function recordStoryView(story, currentUser) {
  if (!story?.$id || !story.userId) {
    throw new Error('A valid story is required to record a view.');
  }
  if (!currentUser?.$id) {
    throw new Error('Sign in before recording a story view.');
  }
  const expiresAt = getStoryExpiresAt(story);
  if (expiresAt === null || expiresAt <= Date.now()) {
    throw new Error('This story has expired and cannot receive a view.');
  }

  const authenticatedUser = await account.get();
  if (authenticatedUser.$id !== currentUser.$id) {
    throw new Error('Your signed-in account does not match the story viewer.');
  }

  const jwt = await account.createJWT({ duration: 600 });
  const execution = await functions.createExecution({
    functionId: STORY_VIEW_FUNCTION_ID,
    body: JSON.stringify({ storyId: story.$id }),
    async: false,
    xpath: '/',
    method: 'POST',
    headers: { 'x-appwrite-user-jwt': jwt.jwt },
  });
  const result = parseFunctionResponse(execution.responseBody);
  if (
    execution.responseStatusCode < 200
    || execution.responseStatusCode >= 300
    || result.success !== true
  ) {
    throw new Error(
      result.error
      || `Story view could not be recorded (HTTP ${execution.responseStatusCode}).`,
    );
  }

  return {
    created: result.created === true,
    story: { ...story, views: Number(result.views) || 0 },
  };
}

export async function fetchStoryViewers(storyId) {
  if (!storyId) throw new Error('A story ID is required to load viewers.');

  const authenticatedUser = await account.get();
  const story = await databases.getDocument(DATABASE_ID, COLLECTIONS.stories, storyId);
  const ownerId = await getStoryOwnerAccountId(story, authenticatedUser.$id);
  if (!ownerId || ownerId !== authenticatedUser.$id) {
    throw new Error('Only the story owner can view its viewer list.');
  }

  const viewerById = new Map();
  let offset = 0;
  while (true) {
    const page = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.storyViews,
      [
        Query.equal('storyId', storyId),
        Query.orderDesc('viewedAt'),
        Query.limit(VIEW_PAGE_SIZE),
        Query.offset(offset),
      ],
    );
    for (const viewer of page.documents) {
      const previous = viewerById.get(viewer.viewerId);
      if (!previous || new Date(viewer.viewedAt) > new Date(previous.viewedAt)) {
        viewerById.set(viewer.viewerId, viewer);
      }
    }
    offset += page.documents.length;
    if (!page.documents.length || offset >= page.total) break;
  }

  const viewers = [...viewerById.values()];
  const profileById = new Map();
  const viewerIds = [...viewerById.keys()];
  for (let index = 0; index < viewerIds.length; index += VIEW_PAGE_SIZE) {
    const ids = viewerIds.slice(index, index + VIEW_PAGE_SIZE);
    const profiles = await databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
      Query.equal('userId', ids),
      Query.limit(VIEW_PAGE_SIZE),
    ]);
    profiles.documents.forEach((profile) => profileById.set(profile.userId, profile));
  }

  return viewers
    .map((viewer) => {
      const profile = profileById.get(viewer.viewerId);
      return {
        ...viewer,
        viewerName: profile?.name || viewer.viewerName || 'Mzansi User',
        viewerAvatar: profile?.avatarUrl || viewer.viewerAvatar || '',
        viewerUsername: profile?.username || '',
      };
    })
    .sort((a, b) => new Date(b.viewedAt) - new Date(a.viewedAt));
}
