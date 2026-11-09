import { describe, it, expect } from 'vitest';
import { ParseClientToolMedia, CLIENT_TOOL_MEDIA_LIMITS, type ClientToolMediaParse } from '../client-tool-media';

const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

/** The error of a failed parse, or an empty string when the parse succeeded. */
function errorOf(parsed: ClientToolMediaParse): string {
    return parsed.ok === false ? parsed.error : '';
}

/** Parses one media item with the given MIME type and Base64 value. */
function parseOne(mimeType: unknown, base64: unknown): ClientToolMediaParse {
    return ParseClientToolMedia(JSON.stringify([{ MimeType: mimeType, Base64: base64 }]));
}

describe('ParseClientToolMedia', () => {
    it('returns an empty list for undefined or blank', () => {
        expect(ParseClientToolMedia(undefined)).toEqual({ ok: true, media: [] });
        expect(ParseClientToolMedia('  ')).toEqual({ ok: true, media: [] });
    });

    it('accepts an allowed image', () => {
        const parsed = ParseClientToolMedia(JSON.stringify([{ MimeType: 'image/png', Base64: png1x1, Width: 1, Height: 1 }]));
        expect(parsed).toEqual({ ok: true, media: [{ MimeType: 'image/png', Base64: png1x1, Width: 1, Height: 1 }] });
    });

    it('rejects a MIME type that is not an allowed image', () => {
        const parsed = ParseClientToolMedia(JSON.stringify([{ MimeType: 'text/html', Base64: png1x1 }]));
        expect(parsed.ok).toBe(false);
        if (!parsed.ok) expect(parsed.error).toContain('text/html');
    });

    it('rejects more than the item limit', () => {
        const items = Array.from({ length: CLIENT_TOOL_MEDIA_LIMITS.MaxItems + 1 }, () => ({ MimeType: 'image/png', Base64: png1x1 }));
        expect(ParseClientToolMedia(JSON.stringify(items)).ok).toBe(false);
    });

    it('rejects an item over the byte limit', () => {
        const bytes = CLIENT_TOOL_MEDIA_LIMITS.MaxBytesPerItem + 1;
        const base64 = Buffer.alloc(bytes, 1).toString('base64');
        expect(ParseClientToolMedia(JSON.stringify([{ MimeType: 'image/jpeg', Base64: base64 }])).ok).toBe(false);
    });

    it('rejects malformed JSON and non-arrays', () => {
        expect(ParseClientToolMedia('{not json').ok).toBe(false);
        expect(ParseClientToolMedia('{"MimeType":"image/png"}').ok).toBe(false);
    });

    it('strips a data URL prefix from Base64', () => {
        const parsed = ParseClientToolMedia(JSON.stringify([{ MimeType: 'image/png', Base64: `data:image/png;base64,${png1x1}` }]));
        expect(parsed).toEqual({ ok: true, media: [{ MimeType: 'image/png', Base64: png1x1 }] });
    });

    it('rejects hostile items without throwing', () => {
        const hostile: unknown[][] = [
            [{ MimeType: { toString: 1 }, Base64: png1x1 }],
            [{ MimeType: 'image/png', Base64: 12345 }],
            [null],
        ];
        for (const items of hostile) {
            const json = JSON.stringify(items);
            expect(() => ParseClientToolMedia(json)).not.toThrow();
            expect(ParseClientToolMedia(json).ok).toBe(false);
        }
    });

    it('strips an uppercase data URL prefix', () => {
        expect(parseOne('image/png', `DATA:image/png;BASE64,${png1x1}`)).toEqual({ ok: true, media: [{ MimeType: 'image/png', Base64: png1x1 }] });
    });

    it('strips a data URL prefix that follows leading whitespace', () => {
        expect(parseOne('image/png', `  data:image/png;base64,${png1x1}`)).toEqual({ ok: true, media: [{ MimeType: 'image/png', Base64: png1x1 }] });
    });

    it('rejects content that is not base64', () => {
        expect(parseOne('image/webp', 'hello world, not an image!').ok).toBe(false);
    });

    it('rejects bare padding', () => {
        expect(parseOne('image/png', '==').ok).toBe(false);
        expect(parseOne('image/png', '====').ok).toBe(false);
    });

    it('rejects a data URL whose MIME type differs from MimeType', () => {
        const parsed = parseOne('image/png', `data:image/jpeg;base64,${png1x1}`);
        expect(parsed.ok).toBe(false);
        expect(errorOf(parsed)).toContain('image/jpeg');
    });

    it('accepts a data URL whose MIME type matches MimeType in any letter case', () => {
        expect(parseOne('Image/PNG', `data:IMAGE/png;base64,${png1x1}`)).toEqual({ ok: true, media: [{ MimeType: 'image/png', Base64: png1x1 }] });
    });

    it('rejects a data URL that is not base64-encoded', () => {
        expect(parseOne('image/png', `data:image/png,${png1x1}`).ok).toBe(false);
    });

    it('drops a Width or Height that is not a positive finite number', () => {
        const parsed = ParseClientToolMedia(JSON.stringify([
            { MimeType: 'image/png', Base64: png1x1, Width: -1, Height: 0 },
            { MimeType: 'image/png', Base64: png1x1, Width: '5', Height: 2 },
        ]));
        expect(parsed).toStrictEqual({
            ok: true,
            media: [
                { MimeType: 'image/png', Base64: png1x1 },
                { MimeType: 'image/png', Base64: png1x1, Height: 2 },
            ],
        });
    });
});
