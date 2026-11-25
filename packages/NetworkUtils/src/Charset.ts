/**
 * Charsets: reading the one a `Content-Type` names, and checking a label is one `TextDecoder` knows. One place for
 * every reader of web text (the HTTP client's `text` responses, the content pipeline's HTML extractor, the website
 * crawl), so a label is understood the same way everywhere.
 */

/** The canonical name of a charset label `TextDecoder` knows (`latin1` → `windows-1252`), or null for an unknown one. */
export function KnownCharset(label: string | null | undefined): string | null {
    const trimmed = label?.trim();
    if (!trimmed) {
        return null;
    }
    try {
        return new TextDecoder(trimmed).encoding;
    } catch {
        return null;
    }
}

/** The charset a `Content-Type` header names (`text/html; charset=windows-1252`), when `TextDecoder` knows it; else null. */
export function CharsetOfContentType(contentType: string | null | undefined): string | null {
    return KnownCharset(/charset\s*=\s*["']?([^"';\s]+)/i.exec(contentType ?? "")?.[1]);
}
