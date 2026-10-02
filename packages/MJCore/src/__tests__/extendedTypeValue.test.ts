import { describe, it, expect } from 'vitest';
import { EntityFieldInfo, EntityFieldExtendedTypes } from '../generic/entityInfo';
import {
    CoerceImageSrc,
    CoerceRawImageBase64ToDataUri,
    FormatByteSize,
    IsInlineImageDataUri,
    IsPermittedImageFieldValue,
    IsValidCssColor,
    MaxInlineImageBytes,
    MaxStoredImageChars,
    ParseCssHexColor,
    PrettyPrintJson,
    TryParseJsonText,
} from '../generic/extendedTypeValue';

describe('EntityFieldExtendedTypes', () => {
    it('is the same array EntityFieldInfo.ExtendedTypes exposes', () => {
        expect(EntityFieldInfo.ExtendedTypes).toBe(EntityFieldExtendedTypes);
        expect(EntityFieldExtendedTypes).toEqual(expect.arrayContaining(['Image', 'Color', 'JSON', 'URL', 'Email', 'Icon']));
    });
});

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Image ExtendedType helpers', () => {
    it('detects data:image URIs', () => {
        expect(IsInlineImageDataUri(`data:image/png;base64,${PNG_1X1}`)).toBe(true);
        expect(IsInlineImageDataUri('data:text/html;base64,PHNjcmlwdD4=')).toBe(false);
        expect(IsInlineImageDataUri('https://example.com/a.png')).toBe(false);
    });

    it('coerces raw PNG/JPEG base64 into a data URI', () => {
        expect(CoerceRawImageBase64ToDataUri(PNG_1X1)).toBe(`data:image/png;base64,${PNG_1X1}`);
        expect(CoerceRawImageBase64ToDataUri('/9j/abc')).toBeNull(); // too short
        expect(CoerceRawImageBase64ToDataUri('not-base64!!!')).toBeNull();
    });

    it('CoerceImageSrc accepts URLs, data URIs, and raw base64; rejects dangerous schemes', () => {
        expect(CoerceImageSrc(`data:image/png;base64,${PNG_1X1}`)).toBe(`data:image/png;base64,${PNG_1X1}`);
        expect(CoerceImageSrc(PNG_1X1)).toBe(`data:image/png;base64,${PNG_1X1}`);
        expect(CoerceImageSrc('https://cdn.example.com/photo.jpg')).toBe('https://cdn.example.com/photo.jpg');
        expect(CoerceImageSrc('/assets/logo.png')).toBe('/assets/logo.png');
        expect(CoerceImageSrc('photos/me.png')).toBe('photos/me.png');
        expect(CoerceImageSrc('javascript:alert(1)')).toBeNull();
        expect(CoerceImageSrc('data:text/html;base64,PHNjcmlwdD4=')).toBeNull();
        expect(CoerceImageSrc('')).toBeNull();
        expect(IsPermittedImageFieldValue('https://x.test/a')).toBe(true);
    });

    it('caps stored size at MaxLength when set, else a 1 MiB practical cap', () => {
        expect(MaxStoredImageChars(500)).toBe(500);
        expect(MaxInlineImageBytes(500)).toBe(Math.floor((500 - 32) * 3 / 4));
        expect(MaxStoredImageChars(0)).toBeGreaterThan(1_000_000);
        expect(FormatByteSize(500)).toBe('500 bytes');
        expect(FormatByteSize(2048)).toBe('2.0 KB'); // 2.0 because values under 10 KB keep one decimal
    });
});

describe('Color ExtendedType helpers', () => {
    it('normalizes 3-digit and 8-digit hex to #rrggbb', () => {
        expect(ParseCssHexColor('#abc')).toBe('#aabbcc');
        expect(ParseCssHexColor('#AABBCC')).toBe('#aabbcc');
        expect(ParseCssHexColor('#aabbccdd')).toBe('#aabbcc');
        expect(ParseCssHexColor('red')).toBeNull();
    });

    it('accepts hex, rgb, hsl, and transparent', () => {
        expect(IsValidCssColor('#fff')).toBe(true);
        expect(IsValidCssColor('rgb(1, 2, 3)')).toBe(true);
        expect(IsValidCssColor('rgba(1, 2, 3, 0.5)')).toBe(true);
        expect(IsValidCssColor('hsl(120, 50%, 50%)')).toBe(true);
        expect(IsValidCssColor('transparent')).toBe(true);
        expect(IsValidCssColor('not-a-color')).toBe(false);
        expect(IsValidCssColor('')).toBe(false);
    });
});

describe('JSON ExtendedType helpers', () => {
    it('parses and pretty-prints valid JSON, leaves invalid text alone', () => {
        expect(TryParseJsonText('{"a":1}').ok).toBe(true);
        expect(TryParseJsonText('{nope}').ok).toBe(false);
        expect(PrettyPrintJson('{"a":1}')).toBe('{\n  "a": 1\n}');
        expect(PrettyPrintJson('{nope}')).toBe('{nope}');
    });
});
