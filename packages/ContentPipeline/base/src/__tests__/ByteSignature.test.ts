import { describe, expect, it } from 'vitest';
import { DetectByteSignature } from '../extract/ByteSignature.js';
import { ResolveFileType } from '../extract/FileTypeResolution.js';

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (s: string) => new TextEncoder().encode(s);

describe('DetectByteSignature', () => {
    it('identifies a PDF unambiguously', () => {
        expect(DetectByteSignature(text('%PDF-1.7'))).toEqual({ FileType: 'pdf', Unambiguous: true });
    });

    it('identifies a PNG unambiguously', () => {
        expect(DetectByteSignature(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toEqual({
            FileType: 'png',
            Unambiguous: true,
        });
    });

    it('reads a signature at a non-zero offset', () => {
        const mp4 = bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d);
        expect(DetectByteSignature(mp4)?.FileType).toBe('mp4');
    });

    it('recognizes a ZIP but does NOT call it unambiguous', () => {
        // docx, xlsx, pptx, epub and jar are all zips. Overruling a declared 'docx' with a bare
        // 'zip' would be a downgrade, not a correction.
        expect(DetectByteSignature(bytes(0x50, 0x4b, 0x03, 0x04))).toEqual({
            FileType: 'zip',
            Unambiguous: false,
        });
    });

    it('recognizes HTML from its opening tag, ambiguously', () => {
        expect(DetectByteSignature(text('<!DOCTYPE html><html>'))).toEqual({
            FileType: 'html',
            Unambiguous: false,
        });
    });

    it('tolerates a byte-order mark and leading whitespace', () => {
        expect(DetectByteSignature(text('﻿\n  <html>'))?.FileType).toBe('html');
    });

    it('returns null for content it does not recognize', () => {
        expect(DetectByteSignature(text('just some prose'))).toBeNull();
    });

    it('returns null for content shorter than any signature', () => {
        expect(DetectByteSignature(bytes(0x25))).toBeNull();
    });
});

describe('signatures configured in metadata', () => {
    it('recognizes a format the built-in table does not', () => {
        const avro = bytes(0x4f, 0x62, 0x6a, 0x01);
        expect(DetectByteSignature(avro)).toBeNull();
        expect(
            DetectByteSignature(avro, [{ FileType: 'avro', Magic: [0x4f, 0x62, 0x6a, 0x01], Unambiguous: true }]),
        ).toEqual({ FileType: 'avro', Unambiguous: true });
    });

    it('OVERRIDES a built-in, so a wrong default can be corrected without a release', () => {
        expect(
            DetectByteSignature(text('%PDF-1.7'), [
                { FileType: 'pdf-a', Magic: [0x25, 0x50, 0x44, 0x46], Unambiguous: true },
            ]),
        ).toEqual({ FileType: 'pdf-a', Unambiguous: true });
    });

    it('matches a configured text prefix, normalizing the way the built-ins do', () => {
        const toml = [{ FileType: 'toml', Magic: [], TextPrefix: '[package]', Unambiguous: false }];
        expect(DetectByteSignature(text('\ufeff\n  [PACKAGE]\nname = "x"'), toml)).toEqual({
            FileType: 'toml',
            Unambiguous: false,
        });
    });

    it('still prefers ANY magic number over a text prefix', () => {
        // '{' opens every JSON document and a good deal that is not JSON, so a prefix must never
        // beat a format that announced itself in its first bytes.
        const gzWithBrace = bytes(0x1f, 0x8b, 0x7b);
        expect(DetectByteSignature(gzWithBrace)?.FileType).toBe('gz');
    });
});

describe('byte signatures feeding file-type precedence', () => {
    it('OVERRULES a wrong declaration when the signature is unambiguous', () => {
        const signature = DetectByteSignature(text('%PDF-1.7'))!;
        const resolved = ResolveFileType({
            Declared: 'html',
            Signature: signature.FileType,
            SignatureIsUnambiguous: signature.Unambiguous,
        });
        expect(resolved).toEqual({ FileType: 'pdf', Evidence: 'ByteCorrection' });
    });

    it('LEAVES a declaration alone when the signature is ambiguous', () => {
        const signature = DetectByteSignature(bytes(0x50, 0x4b, 0x03, 0x04))!;
        const resolved = ResolveFileType({
            Declared: 'docx',
            Signature: signature.FileType,
            SignatureIsUnambiguous: signature.Unambiguous,
        });
        expect(resolved).toEqual({ FileType: 'docx', Evidence: 'Declared' });
    });

    it('sniffs when nothing was declared', () => {
        const signature = DetectByteSignature(text('%PDF-1.7'))!;
        const resolved = ResolveFileType({ Signature: signature.FileType, FileName: 'mislabelled.txt' });
        expect(resolved).toEqual({ FileType: 'pdf', Evidence: 'Signature' });
    });
});
