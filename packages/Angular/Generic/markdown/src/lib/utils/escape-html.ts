/**
 * Escape a string so it renders as visible text inside HTML rather than as markup.
 *
 * Used as the no-DOM fallback of the markdown component's passthrough sanitizer: when
 * there is no `window` to run a real sanitizer against, showing the markup as text is
 * the only safe rendering.
 */
export function escapeHtmlAsText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
