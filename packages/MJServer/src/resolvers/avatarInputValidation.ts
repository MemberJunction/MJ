/**
 * @fileoverview Trust-boundary validation for the self-service avatar mutation
 * (`UpdateMyAvatar` in `UserAvatarResolver`).
 *
 * The browser checks these values too, but its URL check is `new URL(...)`, which happily accepts
 * `javascript:` and every `data:` type. The server is the boundary, so everything that reaches
 * `MJ: Users.UserImageURL` / `UserImageIconClass` through the mutation passes through here first.
 *
 * Pure: no I/O, no provider, no entity — so it is unit-testable on its own.
 *
 * @module @memberjunction/server/resolvers/avatarInputValidation
 */

/** Largest DECODED image accepted in a `data:` URI. Matches the Explorer upload cap. */
export const AVATAR_MAX_IMAGE_BYTES = 200 * 1024;

/** Longest `http:` / `https:` image URL accepted. */
export const AVATAR_MAX_URL_LENGTH = 2048;

/** Longest icon class string accepted. */
export const AVATAR_MAX_ICON_CLASS_LENGTH = 100;

/** `data:image/<raster type>;base64,<payload>` — SVG is deliberately absent (it can carry script). */
const DATA_URI_PATTERN = /^data:image\/(png|jpeg|jpg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/;

/** Lower-case Font Awesome class lists only, e.g. `fa-solid fa-user`. */
const ICON_CLASS_PATTERN = /^[a-z0-9 -]+$/;
const FA_TOKEN_PATTERN = /^fa-[a-z0-9-]+$/;

/** The outcome of {@link ValidateAvatarInput}. Empty strings are normalised to `null` (clear). */
export interface AvatarInputValidationResult {
    Valid: boolean;
    /** Why the input was refused. Set only when `Valid` is false. */
    ErrorMessage?: string;
    /** The value to store in `UserImageURL`; `null` clears it. */
    ImageURL: string | null;
    /** The value to store in `UserImageIconClass`; `null` clears it. */
    IconClass: string | null;
}

/**
 * Validates a requested avatar. Null or empty values clear the corresponding column, so both
 * null is a valid "revert to default".
 *
 * - `imageURL`: a `data:image/(png|jpeg|jpg|gif|webp);base64,...` URI whose decoded size is at most
 *   {@link AVATAR_MAX_IMAGE_BYTES}, or an absolute `http:`/`https:` URL of at most
 *   {@link AVATAR_MAX_URL_LENGTH} characters with no whitespace. Everything else is refused.
 * - `iconClass`: at most {@link AVATAR_MAX_ICON_CLASS_LENGTH} characters of `[a-z0-9 -]`,
 *   containing at least one `fa-` token.
 */
export function ValidateAvatarInput(
    imageURL: string | null | undefined,
    iconClass: string | null | undefined
): AvatarInputValidationResult {
    const image = imageURL ? imageURL : null;
    const icon = iconClass ? iconClass : null;
    const error = (image === null ? undefined : imageUrlError(image)) ?? (icon === null ? undefined : iconClassError(icon));
    return error ? { Valid: false, ErrorMessage: error, ImageURL: null, IconClass: null } : { Valid: true, ImageURL: image, IconClass: icon };
}

/** Returns why an image value is refused, or `undefined` when it is acceptable. */
function imageUrlError(value: string): string | undefined {
    if (value.startsWith('data:')) {
        return dataUriError(value);
    }
    return httpUrlError(value);
}

function dataUriError(value: string): string | undefined {
    const match = DATA_URI_PATTERN.exec(value);
    if (!match || match[2].length % 4 !== 0) {
        return 'Avatar image must be a base64 PNG, JPEG, GIF or WEBP data URI.';
    }
    const decodedBytes = decodedBase64Length(match[2]);
    if (decodedBytes > AVATAR_MAX_IMAGE_BYTES) {
        return `Avatar image must be ${AVATAR_MAX_IMAGE_BYTES / 1024}KB or smaller (this one is ${Math.ceil(decodedBytes / 1024)}KB).`;
    }
    return undefined;
}

/** Decoded byte length of a padded base64 string, without decoding it. */
function decodedBase64Length(base64: string): number {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return (base64.length / 4) * 3 - padding;
}

function httpUrlError(value: string): string | undefined {
    const refusal = 'Avatar image URL must be an absolute http or https URL.';
    if (value.length > AVATAR_MAX_URL_LENGTH) {
        return `Avatar image URL must be ${AVATAR_MAX_URL_LENGTH} characters or fewer.`;
    }
    if (/\s/.test(value) || !/^https?:\/\//i.test(value)) {
        return refusal;
    }
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:' ? undefined : refusal;
    } catch {
        return refusal;
    }
}

/** Returns why an icon class is refused, or `undefined` when it is acceptable. */
function iconClassError(value: string): string | undefined {
    const valid =
        value.length <= AVATAR_MAX_ICON_CLASS_LENGTH &&
        ICON_CLASS_PATTERN.test(value) &&
        value.split(' ').some((token) => FA_TOKEN_PATTERN.test(token));
    return valid
        ? undefined
        : `Avatar icon must be a Font Awesome class list (lower-case letters, digits, spaces and hyphens, ` +
              `${AVATAR_MAX_ICON_CLASS_LENGTH} characters or fewer, including an fa- class).`;
}
