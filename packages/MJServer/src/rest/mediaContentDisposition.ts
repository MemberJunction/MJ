/**
 * Content types that are safe to render `inline` on this origin: media the browser can only
 * display, never execute. Everything else — text/html, image/svg+xml, XML, anything unknown —
 * is served as an `attachment` so an uploaded file with an attacker-declared active content
 * type can never run as a document on the API origin (stored XSS via /media URLs).
 * `X-Content-Type-Options: nosniff` does not help here, because the hazard is the DECLARED
 * type being active, not a sniffed one.
 */
const INLINE_SAFE_CONTENT_TYPES = /^(image\/(?!svg)[-\w.+]+|video\/[-\w.+]+|audio\/[-\w.+]+|application\/pdf|text\/plain)(\s*;.*)?$/i;

/** Builds the Content-Disposition header: `inline` only for passive, non-scriptable types. */
export function ContentDispositionFor(contentType: string, fileName: string): string {
  const kind = INLINE_SAFE_CONTENT_TYPES.test(contentType) ? 'inline' : 'attachment';
  return `${kind}; filename="${encodeURIComponent(fileName)}"`;
}
