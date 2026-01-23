/**
 * Detect URLs in text and return their positions
 * Supports full URLs (http/https) and short links (google.fr, youtube.com, etc.)
 */
export interface LinkPosition {
  start: number;
  end: number;
  url: string;
  displayText: string;
}

/**
 * Regular expression to match URLs:
 * - Full URLs with http:// or https://
 * - Short URLs like google.fr, youtube.com, etc.
 * Matches pattern: word.word (x.y format) with optional protocol, www, and path
 */
const URL_REGEX = /(https?:\/\/)?(www\.)?[a-zA-Z0-9][-a-zA-Z0-9@:%._\+~#=]*\.[a-zA-Z]{2,}(:[0-9]*)?/gi;

/**
 * Parse links from text and return their positions
 */
export function parseLinks(text: string): LinkPosition[] {
  const links: LinkPosition[] = [];
  let match: RegExpExecArray | null;
  // Reset regex state
  URL_REGEX.lastIndex = 0;
  
  while ((match = URL_REGEX.exec(text)) !== null) {
    const matchedText = match[0];
    const start = match.index;
    const end = start + matchedText.length;
    
    // Determine the full URL (add https:// if not present)
    let fullUrl = matchedText;
    if (!matchedText.match(/^https?:\/\//i)) {
      fullUrl = `https://${matchedText}`;
    }
    
    links.push({
      start,
      end,
      url: fullUrl,
      displayText: matchedText,
    });
  }
  
  return links;
}
