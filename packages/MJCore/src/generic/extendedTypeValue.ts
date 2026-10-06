/**
 * Helpers for EntityField.ExtendedType values that carry structured content
 * (Image, Color, JSON). Used by EntityField.Validate and by Angular form/grid UX.
 */

/** Practical cap for inline image payloads when the column is unlimited (nvarchar(max)). */
export const DEFAULT_MAX_INLINE_IMAGE_BYTES = 1024 * 1024;

const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+(;[^,]*)?,/i;
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_COLOR_RE = /^rgba?\(\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*(,\s*[\d.]+\s*)?\)$/i;
const HSL_COLOR_RE = /^hsla?\(/i;
const DANGEROUS_SCHEME_RE = /^(javascript|vbscript|file):/i;

/**
 * True when `value` is a `data:image/...` URI (base64 or utf-8 SVG).
 */
export function IsInlineImageDataUri(value: string): boolean {
    if (!value) return false;
    return DATA_IMAGE_RE.test(value.trim());
}

/**
 * If `value` is raw base64 of a known image magic number (no data: prefix),
 * return a data URI; otherwise null.
 */
export function CoerceRawImageBase64ToDataUri(value: string): string | null {
    if (!value) return null;
    const compact = value.trim().replace(/\s/g, '');
    if (compact.length < 32) return null;
    if (!/^[A-Za-z0-9+/]+=*$/.test(compact)) return null;
    if (compact.startsWith('/9j/')) return `data:image/jpeg;base64,${compact}`;
    if (compact.startsWith('iVBOR')) return `data:image/png;base64,${compact}`;
    if (compact.startsWith('R0lGOD')) return `data:image/gif;base64,${compact}`;
    if (compact.startsWith('UklGR')) return `data:image/webp;base64,${compact}`;
    if (compact.startsWith('PHN2Zy') || compact.startsWith('PD94bW')) return `data:image/svg+xml;base64,${compact}`;
    return null;
}

/**
 * Normalize a stored Image-field value into something safe to put in `img src`.
 * Accepts data URIs, raw image base64, http(s) URLs, and relative paths.
 * Rejects javascript:/vbscript:/file: and non-image data: URIs.
 */
export function CoerceImageSrc(value: string): string | null {
    if (value == null) return null;
    const v = value.trim();
    if (!v) return null;
    if (IsInlineImageDataUri(v)) return v;
    if (v.toLowerCase().startsWith('data:')) return null;
    if (DANGEROUS_SCHEME_RE.test(v)) return null;

    const raw = CoerceRawImageBase64ToDataUri(v);
    if (raw) return raw;

    if (/^https?:\/\//i.test(v) || v.startsWith('/')) return v;
    // Scheme-less relative path (e.g. "photos/me.png") — permit. Unknown schemes — reject.
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return null;
    return v;
}

export function IsPermittedImageFieldValue(value: string): boolean {
    return CoerceImageSrc(value) != null;
}

export function NormalizeImageHref(value: string): string {
    const v = value.trim();
    if (/^https?:\/\//i.test(v) || v.startsWith('data:') || v.startsWith('/')) return v;
    return 'https://' + v;
}

/**
 * Max characters that may be stored for an Image field. `maxLength === 0` means unlimited
 * (nvarchar(max)); then we apply {@link DEFAULT_MAX_INLINE_IMAGE_BYTES} as a practical cap.
 */
export function MaxStoredImageChars(maxLength: number): number {
    if (maxLength > 0) return maxLength;
    return Math.floor(DEFAULT_MAX_INLINE_IMAGE_BYTES * 4 / 3) + 64;
}

/** Decoded-byte budget implied by {@link MaxStoredImageChars} (data-URI overhead subtracted). */
export function MaxInlineImageBytes(maxLength: number): number {
    const chars = MaxStoredImageChars(maxLength);
    return Math.max(0, Math.floor((chars - 32) * 3 / 4));
}

export function FormatByteSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} bytes`;
    if (bytes < 1024 * 1024) {
        const kb = bytes / 1024;
        return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Normalize a hex color to `#rrggbb` for `<input type="color">`.
 * 3-digit hex is expanded; 8-digit hex drops alpha. Returns null if not hex.
 */
export function ParseCssHexColor(value: string): string | null {
    if (!value) return null;
    const v = value.trim();
    const m = HEX_COLOR_RE.exec(v);
    if (!m) return null;
    const hex = m[1];
    if (hex.length === 3) {
        return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
    }
    return `#${hex.slice(0, 6)}`.toLowerCase();
}

export function IsValidCssColor(value: string): boolean {
    if (!value) return false;
    const v = value.trim();
    if (v.toLowerCase() === 'transparent') return true;
    if (HEX_COLOR_RE.test(v)) return true;
    if (RGB_COLOR_RE.test(v)) return true;
    if (HSL_COLOR_RE.test(v)) return true;
    return false;
}

export function TryParseJsonText(value: string): { ok: true; value: unknown } | { ok: false; message: string } {
    try {
        return { ok: true, value: JSON.parse(value) };
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Invalid JSON';
        return { ok: false, message };
    }
}

/** Pretty-print JSON when valid; otherwise return the original string. */
export function PrettyPrintJson(value: string): string {
    if (value == null || value.trim() === '') return value ?? '';
    const parsed = TryParseJsonText(value);
    if (!parsed.ok) return value;
    return JSON.stringify(parsed.value, null, 2);
}
