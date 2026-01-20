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

export interface MessagePart {
  type: 'text' | 'emote';
  content: string;
  emoteId?: string;
}

/**
 * Parse a message with emotes into parts for rendering
 * Handles Twurple's emoteOffsets (Map format) to split text and emotes
 */
export function parseMessageWithEmotes(text: string, emoteOffsets?: string | Map<string, string[]>): MessagePart[] {
  const emotes = parseEmotes(text, emoteOffsets);
  if (emotes.length === 0) {
    return [{ type: 'text', content: text }];
  }

  const parts: MessagePart[] = [];
  let lastIndex = 0;

  for (const emote of emotes) {
    // Add text before emote
    if (emote.start > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, emote.start),
      });
    }

    // Add emote
    parts.push({
      type: 'emote',
      content: emote.code,
      emoteId: emote.id,
    });

    lastIndex = emote.end;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return parts;
}
