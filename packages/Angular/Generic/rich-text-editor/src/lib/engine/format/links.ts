/**
 * Recognising addresses in text — shared by the Space handler (autolink as you type) and
 * plain-text paste (autolink what arrived).
 *
 * Deliberately conservative: a scheme or a `www.` prefix is required, so `example.com` in
 * running prose stays text. A false positive is a link the user has to remove; a miss
 * costs them nothing.
 */

/** The three shapes recognised, as capture groups: scheme URL, `www.` host, email. */
export const LINK_SOURCE = String.raw`(?:(https?:\/\/[^\s<>"']+)|(www\.[^\s<>"']+)|([\w.+-]+@(?:[\w-]+\.)+[a-z]{2,}))`;

/** Punctuation that trails an address in prose and is almost never part of it. */
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/** A matched address, trimmed of trailing punctuation, with its resolved `href`. */
export interface LinkMatch {
    /** Character index of the address within the searched string. */
    Index: number;
    /** The address text, without trailing punctuation. */
    Text: string;
    Href: string;
}

/** Interpret a regex match from {@link LINK_SOURCE}; null if trimming leaves nothing. */
export function interpretLinkMatch(match: RegExpExecArray): LinkMatch | null {
    let text = match[0];
    const punctuation = TRAILING_PUNCTUATION.exec(text);
    if (punctuation) {
        text = text.slice(0, text.length - punctuation[0].length);
    }
    if (text.length === 0) {
        return null;
    }
    let href = text;
    if (match[3]) {
        href = `mailto:${text}`;
    } else if (match[2]) {
        href = `http://${text}`;
    }
    return { Index: match.index, Text: text, Href: href };
}

/** Every address in `text`, in order. */
export function findLinks(text: string): LinkMatch[] {
    const pattern = new RegExp(LINK_SOURCE, 'gi');
    const links: LinkMatch[] = [];
    for (const match of text.matchAll(pattern)) {
        const link = interpretLinkMatch(match as RegExpExecArray);
        if (link) {
            links.push(link);
        }
    }
    return links;
}

/** The address that ends exactly at the end of `text`, if any. */
export function findTrailingLink(text: string): LinkMatch | null {
    const match = new RegExp(`${LINK_SOURCE}$`, 'i').exec(text);
    return match ? interpretLinkMatch(match) : null;
}
