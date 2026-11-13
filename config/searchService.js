import { databases, Query } from './appwrite';
import { COLLECTIONS, DATABASE_ID } from './constants';
import { fetchActiveStories } from './storyService';

export const SEARCH_PAGE_SIZE = 30;

export async function searchVideos(searchTerm, offset = 0, limit = SEARCH_PAGE_SIZE) {
  const term = String(searchTerm || '').trim().replace(/^#/, '');
  if (!term) return { documents: [], total: 0 };

  const baseQueries = [
    Query.orderDesc('$createdAt'),
    Query.limit(limit),
    Query.offset(offset),
  ];
  const fieldSets = [
    ['caption', 'content', 'category', 'hashtags', 'soundName'],
    ['caption', 'content', 'category'],
    ['caption', 'category'],
    ['caption'],
  ];
  let lastError;
  for (let index = 0; index < fieldSets.length; index += 1) {
    try {
      const searches = fieldSets[index].map((field) => Query.search(field, term));
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, [
        searches.length === 1 ? searches[0] : Query.or(searches),
        ...baseQueries,
      ]);
      return index === 0 ? result : { ...result, fieldSearchLimited: true };
    } catch (error) {
      lastError = error;
      const errorCode = Number(error?.code || error?.status);
      const errorMessage = String(error?.message || '').toLowerCase();
      const canNarrowSearch = [400, 404].includes(errorCode)
        || /index|attribute|invalid.*query|query.*invalid/.test(errorMessage);
      if (!canNarrowSearch) throw error;
    }
  }
  throw lastError;
}

export async function searchPosts(searchTerm, offset = 0, limit = SEARCH_PAGE_SIZE) {
  const term = String(searchTerm || '').trim().replace(/^#/, '');
  if (!term) return { documents: [], total: 0 };

  const baseQueries = [
    Query.orderDesc('uploadedAt'),
    Query.limit(limit),
    Query.offset(offset),
  ];
  try {
    return await databases.listDocuments(DATABASE_ID, COLLECTIONS.posts, [
      Query.search('content', term),
      ...baseQueries,
    ]);
  } catch (error) {
    const errorCode = Number(error?.code || error?.status);
    const errorMessage = String(error?.message || '').toLowerCase();
    const canUseContainsFallback = [400, 404].includes(errorCode)
      || /index|attribute|invalid.*query|query.*invalid/.test(errorMessage);
    if (!canUseContainsFallback) throw error;

    return {
      ...(await databases.listDocuments(DATABASE_ID, COLLECTIONS.posts, [
        Query.contains('content', term),
        ...baseQueries,
      ])),
      fieldSearchLimited: true,
    };
  }
}

export async function listExploreVideos(offset = 0, limit = SEARCH_PAGE_SIZE) {
  return databases.listDocuments(DATABASE_ID, COLLECTIONS.videos, [
    Query.orderDesc('$createdAt'),
    Query.limit(limit),
    Query.offset(offset),
  ]);
}

export async function listExplorePosts(offset = 0, limit = SEARCH_PAGE_SIZE) {
  return databases.listDocuments(DATABASE_ID, COLLECTIONS.posts, [
    Query.orderDesc('uploadedAt'),
    Query.limit(limit),
    Query.offset(offset),
  ]);
}

export async function listActiveStories() {
  return fetchActiveStories();
}

export async function listCreatorPage(offset = 0, limit = SEARCH_PAGE_SIZE) {
  return databases.listDocuments(DATABASE_ID, COLLECTIONS.users, [
    Query.orderDesc('$createdAt'),
    Query.limit(limit),
    Query.offset(offset),
  ]);
}

export async function listFollowPage(userId, offset = 0, limit = 100) {
  if (!userId) return { documents: [], total: 0 };
  return databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
    Query.equal('followerId', userId),
    Query.limit(limit),
    Query.offset(offset),
  ]);
}
