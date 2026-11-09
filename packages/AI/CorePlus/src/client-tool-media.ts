import type { ClientToolMediaItem } from './agent-types';

/** Limits for images in a client tool result. */
export const CLIENT_TOOL_MEDIA_LIMITS = {
    AllowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as readonly string[],
    MaxItems: 4,
    MaxBytesPerItem: 2_000_000,
} as const;

/** The outcome of parsing the media JSON a client sent. */
export type ClientToolMediaParse =
    | { ok: true; media: ClientToolMediaItem[] }   // case-violation-ok-legacy-back-compat: matches the { ok, … } discriminated-union shape the spec fixes for validators
    | { ok: false; error: string };                 // case-violation-ok-legacy-back-compat: matches the { ok, … } discriminated-union shape the spec fixes for validators

/** A `data:` URL prefix in any letter case. Group 1 is the MIME type; group 2 is `;base64`. */
const DATA_URL_PREFIX = /^data:([^;,]+)(;base64)?,/i;

/** Standard base64 text with at most two padding characters. */
const BASE64_TEXT = /^[A-Za-z0-9+/]+={0,2}$/;

/** A `Base64` value split into an optional `data:` URL prefix and the content after it. */
interface DataUrlParts {
    /** MIME type the prefix names, in lowercase; undefined when there is no prefix */
    MimeType?: string;
    /** False only when a prefix is present without `;base64` */
    IsBase64: boolean;
    /** The content after the prefix, trimmed */
    Content: string;
}

/**
 * Parses and checks the `media` argument of RespondToClientToolRequest. A blank value is an
 * empty list. Each item must be an object with an allowed image MIME type and padded base64
 * content that fits the byte limit. A `data:` URL prefix on `Base64` is removed; it must say
 * `;base64` and name the same MIME type. A Width or Height that is not a positive number is
 * dropped. Bad input gives `ok: false`; the function does not throw.
 */
export function ParseClientToolMedia(json: string | undefined): ClientToolMediaParse {
    if (!json || !json.trim()) return { ok: true, media: [] };

    let parsed: unknown;
    try {
        parsed = JSON.parse(json);
    } catch {
        return { ok: false, error: 'media is not valid JSON' };
    }
    if (!Array.isArray(parsed)) return { ok: false, error: 'media must be a JSON array' };
    const items: unknown[] = parsed;
    if (items.length > CLIENT_TOOL_MEDIA_LIMITS.MaxItems) {
        return { ok: false, error: `media holds ${items.length} items; the limit is ${CLIENT_TOOL_MEDIA_LIMITS.MaxItems}` };
    }

    const media: ClientToolMediaItem[] = [];
    for (const raw of items) {
        const item = checkMediaItem(raw);
        if (typeof item === 'string') return { ok: false, error: item };
        media.push(item);
    }
    return { ok: true, media };
}

/** Returns the normalized item, or the reason the item is rejected. */
function checkMediaItem(raw: unknown): ClientToolMediaItem | string {
    if (!isRecord(raw)) return `media item must be an object, not ${describeValue(raw)}`;
    const { MimeType: declaredMime, Base64: base64Value } = raw;
    if (typeof declaredMime !== 'string') return `media MimeType must be a string, not ${describeValue(declaredMime)}`;
    const mime = declaredMime.trim().toLowerCase();
    if (!CLIENT_TOOL_MEDIA_LIMITS.AllowedMimeTypes.includes(mime)) {
        return `media MIME type ${describeValue(declaredMime)} is not allowed`;
    }
    if (typeof base64Value !== 'string') return `media Base64 must be a string, not ${describeValue(base64Value)}`;

    const parts = splitDataUrl(base64Value);
    const problem = findContentProblem(parts, mime);
    if (problem) return problem;

    const item: ClientToolMediaItem = { MimeType: mime, Base64: parts.Content };
    const width = positiveNumber(raw.Width);
    const height = positiveNumber(raw.Height);
    if (width !== undefined) item.Width = width;
    if (height !== undefined) item.Height = height;
    return item;
}

/** Returns why the content cannot be used, or undefined when it is padded base64 within the byte limit. */
function findContentProblem(parts: DataUrlParts, mime: string): string | undefined {
    if (parts.MimeType !== undefined && parts.MimeType !== mime) {
        return `media data URL type ${describeValue(parts.MimeType)} does not match MimeType "${mime}"`;
    }
    if (!parts.IsBase64) return 'media data URL is not base64-encoded';
    if (!parts.Content) return 'media item has no Base64 content';
    const bytes = decodedByteLength(parts.Content);
    if (bytes === null) return 'media Base64 is not valid padded base64';
    if (bytes > CLIENT_TOOL_MEDIA_LIMITS.MaxBytesPerItem) {
        return `media item is ${bytes} bytes; the limit is ${CLIENT_TOOL_MEDIA_LIMITS.MaxBytesPerItem}`;
    }
    return undefined;
}

/** Splits an optional `data:` URL prefix from the content after it. Surrounding whitespace is ignored. */
function splitDataUrl(value: string): DataUrlParts {
    const trimmed = value.trim();
    const match = DATA_URL_PREFIX.exec(trimmed);
    if (!match) return { IsBase64: true, Content: trimmed };
    return {
        MimeType: match[1].trim().toLowerCase(),
        IsBase64: match[2] !== undefined,
        Content: trimmed.slice(match[0].length).trim(),
    };
}

/** The decoded size of padded base64 text, or null when the text is not padded base64. */
function decodedByteLength(base64: string): number | null {
    if (base64.length % 4 !== 0 || !BASE64_TEXT.test(base64)) return null;
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return (base64.length / 4) * 3 - padding;
}

/** A finite number above zero, or undefined for any other value. */
function positiveNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** Whether a JSON value is an object that is not null and not an array. */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Names a JSON value for an error message: a string is quoted and cut to 100 characters; any other value is named by its type. */
function describeValue(value: unknown): string {
    if (typeof value === 'string') return `"${value.slice(0, 100)}"`;
    if (value === null) return 'null';
    return Array.isArray(value) ? 'array' : typeof value;
}
