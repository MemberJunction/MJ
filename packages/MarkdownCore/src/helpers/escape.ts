/**
 * Escape HTML entities for safe display.
 *
 * Pure string implementation (no `document.createElement`) so it works in
 * Node, React Native, and the browser. Used as the fallback when parsing
 * throws — the raw markdown is shown escaped inside a <pre>.
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
