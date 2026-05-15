import { describe, it, expect } from 'vitest';
import {
    isTextyMime,
    decideInlineStorage,
    buildUnregisteredMimeError,
    extractBase64FromDataUrl,
} from '../engines/artifact-content-storage';

describe('isTextyMime', () => {
    it('returns true for any text/* MIME', () => {
        expect(isTextyMime('text/plain')).toBe(true);
        expect(isTextyMime('text/csv')).toBe(true);
        expect(isTextyMime('text/markdown')).toBe(true);
        expect(isTextyMime('text/x-python')).toBe(true);
    });

    it('returns true for application/* MIMEs that carry text bytes', () => {
        expect(isTextyMime('application/json')).toBe(true);
        expect(isTextyMime('application/xml')).toBe(true);
        expect(isTextyMime('application/javascript')).toBe(true);
        expect(isTextyMime('application/typescript')).toBe(true);
        expect(isTextyMime('application/sql')).toBe(true);
        expect(isTextyMime('application/csv')).toBe(true);
    });

    it('returns false for binary Office MIMEs', () => {
        expect(isTextyMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(false);
        expect(isTextyMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(false);
        expect(isTextyMime('application/pdf')).toBe(false);
    });

    it('returns false for media MIMEs', () => {
        expect(isTextyMime('image/png')).toBe(false);
        expect(isTextyMime('audio/mpeg')).toBe(false);
        expect(isTextyMime('video/mp4')).toBe(false);
    });

    it('returns false for octet-stream', () => {
        expect(isTextyMime('application/octet-stream')).toBe(false);
    });

    it('is case-insensitive', () => {
        expect(isTextyMime('APPLICATION/JSON')).toBe(true);
        expect(isTextyMime('Text/Csv')).toBe(true);
    });
});

describe('decideInlineStorage', () => {
    it('decodes text MIMEs to raw UTF-8 so tool libraries can JSON.parse / split directly', () => {
        const json = '{"hello":"world"}';
        const base64 = Buffer.from(json, 'utf-8').toString('base64');
        const result = decideInlineStorage('application/json', base64);
        expect(result.contentMode).toBe('Text');
        expect(result.content).toBe(json);
    });

    it('wraps binary MIMEs in a data URL so the resolver can detect media + gather can re-decode', () => {
        const base64 = 'UEsDBBQACAgIAA==';
        const result = decideInlineStorage('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', base64);
        expect(result.contentMode).toBe('Text');
        expect(result.content).toBe(`data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}`);
    });

    it('wraps images as a data URL (resolver recognizes media-modality for inline routing)', () => {
        const base64 = 'iVBORw0KGgo';
        const result = decideInlineStorage('image/png', base64);
        expect(result.content).toBe(`data:image/png;base64,${base64}`);
    });

    it('returns empty Text record when inlineData is null/undefined', () => {
        expect(decideInlineStorage('image/png', null)).toEqual({ contentMode: 'Text', content: '' });
        expect(decideInlineStorage('image/png', undefined)).toEqual({ contentMode: 'Text', content: '' });
        expect(decideInlineStorage('image/png', '')).toEqual({ contentMode: 'Text', content: '' });
    });

    it('preserves multi-byte UTF-8 when decoding text MIMEs', () => {
        const text = '{"emoji":"🎉","fr":"café"}';
        const base64 = Buffer.from(text, 'utf-8').toString('base64');
        const result = decideInlineStorage('application/json', base64);
        expect(result.content).toBe(text);
    });
});

describe('buildUnregisteredMimeError', () => {
    it('uses the file name when provided', () => {
        const msg = buildUnregisteredMimeError('random-bytes.xyz', 'application/octet-stream');
        expect(msg).toContain('"random-bytes.xyz"');
        expect(msg).toContain("can't be attached");
        expect(msg).toContain('PDF, Word, Excel');
    });

    it('falls back to a generic name when file name is missing', () => {
        const msg = buildUnregisteredMimeError(null, 'application/octet-stream');
        expect(msg).toContain('"this file"');
    });

    it('does not leak the MIME type into the user-facing message', () => {
        // Intentional UX choice: end users don't care about MIME identifiers.
        const msg = buildUnregisteredMimeError('weird.xyz', 'application/x-some-internal-id');
        expect(msg).not.toContain('application/x-some-internal-id');
    });
});

describe('extractBase64FromDataUrl', () => {
    it('decodes a base64 data URL into a Buffer of the underlying bytes', () => {
        const bytes = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // ZIP magic ("PK..")
        const url = `data:application/zip;base64,${bytes.toString('base64')}`;
        const result = extractBase64FromDataUrl(url);
        expect(Buffer.isBuffer(result)).toBe(true);
        expect((result as Buffer).equals(bytes)).toBe(true);
    });

    it('decodes the xlsx data URL the server hook stores into the original ZIP buffer', () => {
        // xlsx files start with the ZIP magic bytes — this verifies the
        // round-trip works for the exact format ExcelToolLibrary expects.
        const xlsxBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x08, 0x08]);
        const url = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${xlsxBytes.toString('base64')}`;
        const result = extractBase64FromDataUrl(url);
        expect(Buffer.isBuffer(result)).toBe(true);
        expect((result as Buffer).slice(0, 4).toString('hex')).toBe('504b0304');
    });

    it('returns the input unchanged when it is not a data URL', () => {
        const raw = '{"already":"plain JSON"}';
        expect(extractBase64FromDataUrl(raw)).toBe(raw);
    });

    it('returns the input unchanged for a non-base64 data URL', () => {
        const url = 'data:text/plain,hello world';
        expect(extractBase64FromDataUrl(url)).toBe(url);
    });

    it('handles data URLs with newlines in the base64 payload', () => {
        // Some encoders insert newlines every 76 chars — the /s flag in our
        // regex allows the trailing capture to span lines.
        const bytes = Buffer.from('hello world');
        const base64 = bytes.toString('base64');
        const url = `data:text/plain;base64,${base64.slice(0, 4)}\n${base64.slice(4)}`;
        const result = extractBase64FromDataUrl(url);
        expect(Buffer.isBuffer(result)).toBe(true);
    });
});
