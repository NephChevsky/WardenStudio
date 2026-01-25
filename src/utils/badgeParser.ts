// Badge URL cache - populated by TwitchChatService
let badgeCache: Map<string, string> = new Map();

export function setBadgeCache(cache: Map<string, string>) {
  badgeCache = cache;
}

export function getBadgeUrl(badgeKey: string): string {
  // First try to get from cache
  const cachedUrl = badgeCache.get(badgeKey);
  if (cachedUrl) {
    return cachedUrl;
  }
  
  // Fallback to constructing URL from badge key
  // Badge keys are in format "id:version" e.g. "broadcaster:1", "moderator:1"
  const [badgeId] = badgeKey.split(':');
  
  // Use Twitch's static CDN for badge images
  // Format: https://static-cdn.jtvnw.net/badges/v1/{set_id}/{version}/1
  return `https://static-cdn.jtvnw.net/badges/v1/${badgeKey.replace(':', '/')}/1`;
}

export function getBadgeTitle(badgeKey: string): string {
  const [badgeId] = badgeKey.split(':');
  
  // Capitalize first letter and replace underscores/dashes with spaces
  return badgeId
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
