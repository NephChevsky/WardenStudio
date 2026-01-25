// Badge URL cache - populated by TwitchChatService
let badgeCache: Map<string, string> = new Map();

const BADGE_CACHE_KEY = 'twitch_badge_cache';

// Load badge cache from localStorage on module initialization
function loadBadgeCache() {
  try {
    const stored = localStorage.getItem(BADGE_CACHE_KEY);
    if (stored) {
      const entries = JSON.parse(stored) as [string, string][];
      badgeCache = new Map(entries);
    }
  } catch (error) {
    console.error('Failed to load badge cache from localStorage:', error);
  }
}

// Save badge cache to localStorage
function saveBadgeCache() {
  try {
    const entries = Array.from(badgeCache.entries());
    localStorage.setItem(BADGE_CACHE_KEY, JSON.stringify(entries));
  } catch (error) {
    console.error('Failed to save badge cache to localStorage:', error);
  }
}

// Initialize cache from localStorage
loadBadgeCache();

export function setBadgeCache(cache: Map<string, string>) {
  badgeCache = cache;
  saveBadgeCache();
}

export function getBadgeUrl(badgeKey: string): string {
  // First try to get from cache
  const cachedUrl = badgeCache.get(badgeKey);
  if (cachedUrl) {
    return cachedUrl;
  }
  
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
