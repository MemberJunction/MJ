/**
 * HighlightUtil - Utility class for highlighting search matches in text
 *
 * This class provides methods to:
 * 1. Check if text matches a search term (with SQL-style % wildcard support)
 * 2. Highlight matching portions of text with HTML markup
 *
 * The key distinction is that highlighting should only occur when the text
 * actually matches the search pattern. For wildcard searches like "food%ass",
 * the text must contain "food" followed by "ass" in order - we shouldn't
 * highlight partial matches that don't satisfy the full pattern.
 */
export class HighlightUtil {
  /**
   * Check if a value matches the search term (supports SQL-style % wildcards)
   * This is used for filtering records.
   *
   * @param value The text value to check
   * @param searchTerm The search term (may include % wildcards)
   * @returns true if the value matches the search pattern
   */
  static matches(value: string, searchTerm: string): boolean {
    if (!value || !searchTerm) return false;

    const lowerValue = value.toLowerCase();
    const lowerTerm = searchTerm.toLowerCase().trim();

    if (!lowerTerm.includes('%')) {
      // No wildcards - simple substring match
      return lowerValue.includes(lowerTerm);
    }

    // Split by % to get fragments that must appear in order
    const fragments = lowerTerm.split('%').filter(s => s.length > 0);

    if (fragments.length === 0) {
      // Just wildcards, matches everything
      return true;
    }

    // Each fragment must appear in the value, in order
    let searchStartIndex = 0;
    for (const fragment of fragments) {
      const foundIndex = lowerValue.indexOf(fragment, searchStartIndex);
      if (foundIndex === -1) {
        return false;
      }
      searchStartIndex = foundIndex + fragment.length;
    }

    return true;
  }

  /**
   * Highlight matching text in a string based on the filter text.
   * IMPORTANT: Only highlights if the text actually matches the pattern.
   * For wildcard searches, all segments must be present in order.
   *
   * @param text The text to highlight
   * @param searchTerm The search term (may include % wildcards)
   * @param escapeHtml Whether to escape HTML characters (default: true)
   * @returns HTML string with highlighted matches, or the original text if no match
   */
  static highlight(text: string, searchTerm: string, escapeHtml: boolean = true): string {
    if (!text) return '';
    if (!searchTerm || searchTerm.trim() === '') {
      return escapeHtml ? this.escapeHtml(text) : text;
    }

    const trimmedSearch = searchTerm.trim();

    // First check if this text actually matches the pattern
    if (!this.matches(text, trimmedSearch)) {
      // No match - return text without highlighting
      return escapeHtml ? this.escapeHtml(text) : text;
    }

    // Text matches - now apply highlighting
    if (!trimmedSearch.includes('%')) {
      // Simple case: no wildcards, highlight the exact match
      return this.highlightSimple(text, trimmedSearch, escapeHtml);
    }

    // Wildcard case: highlight each segment that appears in order
    return this.highlightWildcard(text, trimmedSearch, escapeHtml);
  }

  /**
   * Highlight a simple (non-wildcard) search term
   */
  private static highlightSimple(text: string, searchTerm: string, escapeHtml: boolean): string {
    const regex = new RegExp(`(${this.escapeRegex(searchTerm)})`, 'gi');

    if (escapeHtml) {
      // Need to escape HTML first, then apply highlighting
      // Find all match positions first
      const matches = this.findMatchPositions(text, [searchTerm]);
      return this.buildHighlightedString(text, matches, true);
    } else {
      return text.replace(regex, '<span class="highlight-match">$1</span>');
    }
  }

  /**
   * Highlight a wildcard search term (segments separated by %)
   * Only highlights segments that appear in the correct order
   */
  private static highlightWildcard(text: string, searchTerm: string, escapeHtml: boolean): string {
    const segments = searchTerm.split('%').filter(s => s.length > 0);
    if (segments.length === 0) {
      return escapeHtml ? this.escapeHtml(text) : text;
    }

    // Find positions of each segment in order (only the first occurrence that maintains order)
    const matches = this.findOrderedMatchPositions(text, segments);

    if (matches.length === 0) {
      return escapeHtml ? this.escapeHtml(text) : text;
    }

    return this.buildHighlightedString(text, matches, escapeHtml);
  }

  /**
   * Find all positions of segments in text (for simple highlighting)
   */
  private static findMatchPositions(text: string, segments: string[]): MatchRange[] {
    const matches: MatchRange[] = [];
    const lowerText = text.toLowerCase();

    for (const segment of segments) {
      const lowerSegment = segment.toLowerCase();
      let searchStart = 0;
      while (searchStart < lowerText.length) {
        const idx = lowerText.indexOf(lowerSegment, searchStart);
        if (idx === -1) break;
        matches.push({ start: idx, end: idx + segment.length });
        searchStart = idx + 1;
      }
    }

    return this.mergeOverlappingRanges(matches);
  }

  /**
   * Find positions of segments that appear in order (for wildcard highlighting)
   * This ensures we only highlight the segments that form the actual match
   */
  private static findOrderedMatchPositions(text: string, segments: string[]): MatchRange[] {
    const matches: MatchRange[] = [];
    const lowerText = text.toLowerCase();

    let searchStart = 0;
    for (const segment of segments) {
      const lowerSegment = segment.toLowerCase();
      const idx = lowerText.indexOf(lowerSegment, searchStart);
      if (idx === -1) {
        // This shouldn't happen if matches() returned true, but be safe
        return [];
      }
      matches.push({ start: idx, end: idx + segment.length });
      searchStart = idx + segment.length;
    }

    return this.mergeOverlappingRanges(matches);
  }

  /**
   * Merge overlapping or adjacent ranges
   */
  private static mergeOverlappingRanges(matches: MatchRange[]): MatchRange[] {
    if (matches.length === 0) return [];

    // Sort by start position
    matches.sort((a, b) => a.start - b.start);

    const merged: MatchRange[] = [];
    for (const match of matches) {
      if (merged.length === 0 || merged[merged.length - 1].end < match.start) {
        merged.push({ ...match });
      } else {
        // Extend the previous range if overlapping
        merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, match.end);
      }
    }

    return merged;
  }

  /**
   * Build the final highlighted string from match ranges
   */
  private static buildHighlightedString(text: string, ranges: MatchRange[], escapeHtml: boolean): string {
    let result = '';
    let lastEnd = 0;

    for (const range of ranges) {
      // Add text before this match
      const before = text.substring(lastEnd, range.start);
      result += escapeHtml ? this.escapeHtml(before) : before;

      // Add highlighted match
      const match = text.substring(range.start, range.end);
      result += '<span class="highlight-match">';
      result += escapeHtml ? this.escapeHtml(match) : match;
      result += '</span>';

      lastEnd = range.end;
    }

    // Add remaining text
    const remaining = text.substring(lastEnd);
    result += escapeHtml ? this.escapeHtml(remaining) : remaining;

    return result;
  }

  /**
   * Escape special regex characters
   */
  private static escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Escape HTML special characters to prevent XSS
   */
  static escapeHtml(text: string): string {
    if (typeof document !== 'undefined') {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    // Fallback for SSR
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

/**
 * Interface for match position ranges
 */
interface MatchRange {
  start: number;
  end: number;
}
