import { account, databases, Query } from './appwrite';
import { COLLECTIONS, DATABASE_ID } from './constants';
import { getUserDocs } from './helpers';

const PAGE_SIZE = 100;
const FOLLOW_HASH_SEEDS = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];

function getFollowDocumentId(followerId, followingId) {
  // A deterministic row ID prevents concurrent follow attempts from creating duplicates.
  const pair = `${followerId.length}:${followerId}|${followingId.length}:${followingId}`;
  const hash = FOLLOW_HASH_SEEDS.map((seed) => {
    let value = seed;
    for (let index = 0; index < pair.length; index += 1) {
      value = Math.imul(value ^ pair.charCodeAt(index), 0x01000193);
    }
    return (value >>> 0).toString(16).padStart(8, '0');
  }).join('');
  return `f_${hash}`;
}

async function getFollowRelationships(followerId, followingId) {
  return fetchAllProfileDocuments(COLLECTIONS.follows, [
    Query.equal('followerId', followerId),
    Query.equal('followingId', followingId),
    Query.orderDesc('$createdAt'),
  ]);
}

async function assertAuthenticatedFollower(followerId, followingId) {
  if (!followerId || !followingId || followerId === followingId) {
    throw new Error('A valid follower and following user are required.');
  }
  const authenticatedUser = await account.get();
  if (authenticatedUser.$id !== followerId) {
    throw new Error('Your signed-in account does not match the follower.');
  }
}

export async function createFollowRelationship(followerId, followingId) {
  await assertAuthenticatedFollower(followerId, followingId);
  const existing = await getFollowRelationships(followerId, followingId);
  if (existing.length) return { relationship: existing[0], created: false };

  try {
    const relationship = await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.follows,
      getFollowDocumentId(followerId, followingId),
      { followerId, followingId },
    );
    return { relationship, created: true };
  } catch (error) {
    if (error.code !== 409 && error.type !== 'document_already_exists') throw error;
    const racedRelationship = await getFollowRelationships(followerId, followingId);
    if (!racedRelationship.length) throw error;
    return { relationship: racedRelationship[0], created: false };
  }
}

export async function deleteFollowRelationships(followerId, followingId) {
  await assertAuthenticatedFollower(followerId, followingId);
  const relationships = await getFollowRelationships(followerId, followingId);
  const results = await Promise.allSettled(relationships.map((relationship) => (
    databases.deleteDocument(DATABASE_ID, COLLECTIONS.follows, relationship.$id)
  )));
  const failure = results.find((result) => (
    result.status === 'rejected' && result.reason?.code !== 404
  ));
  if (failure) throw failure.reason;
  return relationships.length;
}

export async function filterVisibleProfileContent(items, viewerId) {
  const authorIds = [...new Set(items
    .flatMap((item) => [item.userId, item.sharedFromUserId])
    .filter((id) => id && id !== viewerId))];
  if (authorIds.length === 0) return items;

  try {
    const profiles = await getUserDocs(authorIds);
    const knownAuthors = new Set(profiles.map((profile) => profile.userId));
    const privateAuthors = new Set(
      profiles.filter((profile) => profile.isPrivate === true).map((profile) => profile.userId),
    );
    return items.filter((item) => {
      const ownerCanView = item.userId === viewerId || (
        knownAuthors.has(item.userId)
        && item.isPrivate !== true
        && !privateAuthors.has(item.userId)
      );
      const sharedSourceCanView = !item.sharedFromUserId
        || item.sharedFromUserId === viewerId
        || (knownAuthors.has(item.sharedFromUserId) && !privateAuthors.has(item.sharedFromUserId));
      return ownerCanView && sharedSourceCanView;
    });
  } catch (error) {
    console.error('Could not verify profile activity content privacy:', error);
    return items.filter((item) => (
      item.userId === viewerId
      && (!item.sharedFromUserId || item.sharedFromUserId === viewerId)
    ));
  }
}

export async function fetchAllProfileDocuments(collectionId, queries) {
  const documentsById = new Map();
  let cursor = null;

  while (true) {
    const page = await databases.listDocuments(DATABASE_ID, collectionId, [
      ...queries,
      ...(cursor ? [Query.cursorAfter(cursor)] : []),
      Query.limit(PAGE_SIZE),
    ]);

    page.documents.forEach((document) => documentsById.set(document.$id, document));
    const lastDocument = page.documents[page.documents.length - 1];
    if (page.documents.length < PAGE_SIZE || !lastDocument || lastDocument.$id === cursor) break;
    cursor = lastDocument.$id;
  }

  return [...documentsById.values()];
}

export async function fetchProfileDocumentsByIds(collectionId, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const batches = [];
  for (let index = 0; index < uniqueIds.length; index += PAGE_SIZE) {
    batches.push(uniqueIds.slice(index, index + PAGE_SIZE));
  }
  const results = await Promise.all(batches.map((batch) => (
    databases.listDocuments(DATABASE_ID, collectionId, [
      Query.equal('$id', batch),
      Query.limit(PAGE_SIZE),
    ])
  )));
  const documentsById = new Map();
  results.forEach((result) => {
    result.documents.forEach((document) => documentsById.set(document.$id, document));
  });
  return uniqueIds.map((id) => documentsById.get(id)).filter(Boolean);
}

export async function fetchProfileFollowCounts(userId, profile) {
  const countRelation = async (field, fallback) => {
    const storedCount = Math.max(0, Number(fallback) || 0);
    try {
      const result = await databases.listDocuments(DATABASE_ID, COLLECTIONS.follows, [
        Query.equal(field, userId),
        Query.limit(1),
      ]);
      return Number.isFinite(Number(result.total))
        ? Math.max(0, Number(result.total))
        : storedCount;
    } catch (error) {
      console.warn(`Could not count profile ${field} relationships; using the stored profile count:`, error);
      return storedCount;
    }
  };

  const [followers, following] = await Promise.all([
    countRelation('followingId', profile?.followers),
    countRelation('followerId', profile?.following),
  ]);
  return { followers, following };
}

export async function fetchProfileActivityContent(userId, activity) {
  if (!userId) return [];

  if (activity === 'likes') {
    const [videoLikes, postLikes] = await Promise.all([
      fetchAllProfileDocuments(COLLECTIONS.videoLikes, [
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
      ]),
      fetchAllProfileDocuments(COLLECTIONS.postLikes, [
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
      ]),
    ]);
    const videoIds = [...new Set(videoLikes.map((like) => like.videoId).filter(Boolean))];
    const postIds = [...new Set(postLikes.map((like) => like.postId).filter(Boolean))];
    const [videos, posts] = await Promise.all([
      fetchProfileDocumentsByIds(COLLECTIONS.videos, videoIds),
      fetchProfileDocumentsByIds(COLLECTIONS.posts, postIds),
    ]);
    return [...videos, ...posts.map((post) => ({ ...post, mediaType: 'post' }))]
      .sort((a, b) => new Date(b.uploadedAt || b.$createdAt) - new Date(a.uploadedAt || a.$createdAt));
  }

  if (activity === 'comments') {
    const [videoComments, postComments] = await Promise.all([
      fetchAllProfileDocuments(COLLECTIONS.comments, [
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
      ]),
      fetchAllProfileDocuments(COLLECTIONS.postComments, [
        Query.equal('userId', userId),
        Query.orderDesc('$createdAt'),
      ]),
    ]);
    const videoIds = [...new Set(videoComments.map((comment) => comment.videoId).filter(Boolean))];
    const postIds = [...new Set(postComments.map((comment) => comment.postId).filter(Boolean))];
    const [videos, posts] = await Promise.all([
      fetchProfileDocumentsByIds(COLLECTIONS.videos, videoIds),
      fetchProfileDocumentsByIds(COLLECTIONS.posts, postIds),
    ]);
    return [...videos, ...posts.map((post) => ({ ...post, mediaType: 'post' }))]
      .sort((a, b) => new Date(b.uploadedAt || b.$createdAt) - new Date(a.uploadedAt || a.$createdAt));
  }

  if (activity === 'shares') {
    const posts = await fetchAllProfileDocuments(COLLECTIONS.posts, [
      Query.equal('userId', userId),
      Query.orderDesc('uploadedAt'),
    ]);
    return posts
      .filter((post) => post.sharedFromId || post.sharedFromUserId)
      .map((post) => ({ ...post, mediaType: 'post' }));
  }

  return [];
}

export async function fetchProfileMutuals(viewerId, profileId) {
  if (!viewerId || !profileId || viewerId === profileId) return [];
  const [viewerFollowing, profileFollowers] = await Promise.all([
    fetchAllProfileDocuments(COLLECTIONS.follows, [
      Query.equal('followerId', viewerId),
      Query.orderDesc('$createdAt'),
    ]),
    fetchAllProfileDocuments(COLLECTIONS.follows, [
      Query.equal('followingId', profileId),
      Query.orderDesc('$createdAt'),
    ]),
  ]);
  const profileFollowerIds = new Set(profileFollowers.map((follow) => follow.followerId).filter(Boolean));
  const mutualIds = [...new Set(viewerFollowing
    .map((follow) => follow.followingId)
    .filter((mutualId) => mutualId && profileFollowerIds.has(mutualId)))];
  if (!mutualIds.length) return [];
  const profiles = await getUserDocs(mutualIds);
  const profilesByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
  return mutualIds.map((mutualId) => profilesByUserId.get(mutualId)).filter(Boolean);
}
