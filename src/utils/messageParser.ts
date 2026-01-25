import { parseLinks } from './linkParser';
import { parseEmotes } from './emoteParser';

// Re-export for backward compatibility
export { parseEmotes, getEmoteUrl } from './emoteParser';

export interface MessagePart {
  type: 'text' | 'emote' | 'link';
  content: string;
  emoteId?: string;
  url?: string;
}

/**
 * Parse text parts to detect and linkify URLs
 */
function parseTextForLinks(text: string): MessagePart[] {
  const links = parseLinks(text);
  
  if (links.length === 0) {
    return [{ type: 'text', content: text }];
  }

  const parts: MessagePart[] = [];
  let lastIndex = 0;

  for (const link of links) {
    // Add text before link
    if (link.start > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, link.start),
      });
    }

    // Add link
    parts.push({
      type: 'link',
      content: link.displayText,
      url: link.url,
    });

    lastIndex = link.end;
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

/**
 * Parse a message with emotes into parts for rendering
 * Handles Twurple's emoteOffsets (Map format) to split text and emotes
 * Also detects and linkifies URLs in text portions
 */
export function parseMessageWithEmotes(text: string, emoteOffsets?: string | Map<string, string[]>): MessagePart[] {
  const emotes = parseEmotes(text, emoteOffsets);
  if (emotes.length === 0) {
    // No emotes, but still check for links
    return parseTextForLinks(text);
  }

  const parts: MessagePart[] = [];
  let lastIndex = 0;

  for (const emote of emotes) {
    // Add text before emote (and check for links in it)
    if (emote.start > lastIndex) {
      const textPart = text.substring(lastIndex, emote.start);
      const textParts = parseTextForLinks(textPart);
      parts.push(...textParts);
    }

    // Add emote
    parts.push({
      type: 'emote',
      content: emote.code,
      emoteId: emote.id,
    });

    lastIndex = emote.end;
  }

  // Add remaining text (and check for links in it)
  if (lastIndex < text.length) {
    const textPart = text.substring(lastIndex);
    const textParts = parseTextForLinks(textPart);
    parts.push(...textParts);
  }

  return parts;
}
