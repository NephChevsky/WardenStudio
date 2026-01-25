export interface EmotePosition {
  start: number;
  end: number;
  id: string;
  code: string;
}

/**
 * Parse emotes from Twurple's emoteOffsets format
 * Twurple provides emotes as a Map<string, string[]> where:
 * - key is the emote ID
 * - value is an array of position strings like "0-4"
 */
export function parseEmotes(text: string, emoteOffsets?: string | Map<string, string[]>): EmotePosition[] {
  if (!emoteOffsets) return [];

  // Handle Twurple's Map format (preferred)
  if (emoteOffsets instanceof Map) {
    const emotes: EmotePosition[] = [];
    emoteOffsets.forEach((positions, id) => {
      for (const pos of positions) {
        const [start, end] = pos.split('-').map(Number);
        const code = text.substring(start, end + 1);
        emotes.push({ start, end: end + 1, id, code });
      }
    });
    return emotes.sort((a, b) => a.start - b.start);
  }

  // Handle legacy string format (fallback)
  const emotes: EmotePosition[] = [];
  const emoteParts = emoteOffsets.split('/');

  for (const part of emoteParts) {
    const [id, positions] = part.split(':');
    if (!positions) continue;

    const positionParts = positions.split(',');
    for (const pos of positionParts) {
      const [start, end] = pos.split('-').map(Number);
      const code = text.substring(start, end + 1);
      emotes.push({ start, end: end + 1, id, code });
    }
  }

  return emotes.sort((a, b) => a.start - b.start);
}

/**
 * Get emote URL from Twitch CDN
 * Uses Twitch's static CDN for emote images
 */
export function getEmoteUrl(emoteId: string, size: '1.0' | '2.0' | '3.0' = '1.0'): string {
  return `https://static-cdn.jtvnw.net/emoticons/v2/${emoteId}/default/dark/${size}`;
}
