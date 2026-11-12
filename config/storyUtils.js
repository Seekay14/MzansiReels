export const STORY_TTL_MS = 24 * 60 * 60 * 1000;

export function getStoryCreatedAt(story) {
  const createdAt = Date.parse(story?.$createdAt || story?.createdAt);
  return Number.isFinite(createdAt) ? createdAt : null;
}

export function getStoryExpiresAt(story) {
  const createdAt = getStoryCreatedAt(story);
  return createdAt === null ? null : createdAt + STORY_TTL_MS;
}

export function isStoryActive(story, now = Date.now()) {
  const expiresAt = getStoryExpiresAt(story);
  return expiresAt !== null && expiresAt > now;
}

export function formatStoryAge(story, now = Date.now()) {
  const createdAt = getStoryCreatedAt(story);
  if (createdAt === null) return 'Posted recently';

  const minutes = Math.max(0, Math.floor((now - createdAt) / 60_000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}
