import { describe, expect, it } from 'vitest';
import { DetectByteSignature, Signature } from '../extract/ByteSignature.js';
import { ResolveFileType } from '../extract/FileTypeResolution.js';

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (s: string) => new TextEncoder().encode(s);

/** Rules as metadata would supply them, longest magic first. */
const RULES: Signature[] = [
    { FileType: 'png', Magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], Unambiguous: true },
    { FileType: 'pdf', Magic: [0x25, 0x50, 0x44, 0x46], Unambiguous: true },
    { FileType: 'mp4', Magic: [0x66, 0x74, 0x79, 0x70], Offset: 4, Unambiguous: true },
    { FileType: 'zip', Magic: [0x50, 0x4b, 0x03, 0x04], Unambiguous: false },
    { FileType: 'gz', Magic: [0x1f, 0x8b], Unambiguous: true },
    { FileType: 'html', Magic: [], TextPrefix: '<!doctype html', Unambiguous: false },
    { FileType: 'html', Magic: [], TextPrefix: '<html', Unambiguous: false },
    { FileType: 'json', Magic: [], TextPrefix: '{', Unambiguous: false },
];

describe('DetectByteSignature', () => {
    it('identifies a PDF unambiguously', () => {
        expect(DetectByteSignature(text('%PDF-1.7'), RULES)).toEqual({ FileType: 'pdf', Unambiguous: true });
    });

    it('identifies a PNG unambiguously', () => {
        expect(DetectByteSignature(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), RULES)?.FileType).toBe('png');
    });

    it('reads a signature at a non-zero offset', () => {
        const mp4 = bytes(0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d);
        expect(DetectByteSignature(mp4, RULES)?.FileType).toBe('mp4');
    });

    it('recognizes a ZIP but does NOT call it unambiguous', () => {
        expect(DetectByteSignature(bytes(0x50, 0x4b, 0x03, 0x04), RULES)).toEqual({ FileType: 'zip', Unambiguous: false });
    });

    it('recognizes HTML from its opening tag, ignoring a BOM, whitespace and case', () => {
        expect(DetectByteSignature(text('<!DOCTYPE html><html>'), RULES)).toEqual({ FileType: 'html', Unambiguous: false });
        expect(DetectByteSignature(text('﻿\n  <HTML>'), RULES)?.FileType).toBe('html');
    });

    it('returns null for content it does not recognize, or with no rules at all', () => {
        expect(DetectByteSignature(text('just some prose'), RULES)).toBeNull();
        expect(DetectByteSignature(bytes(0x25), RULES)).toBeNull();
        expect(DetectByteSignature(text('%PDF-1.7'), [])).toBeNull();
    });

    it('prefers ANY magic number over a text prefix', () => {
        expect(DetectByteSignature(bytes(0x1f, 0x8b, 0x7b), RULES)?.FileType).toBe('gz');
    });
});

describe('byte signatures feeding file-type precedence', () => {
    it('OVERRULES a wrong declaration when the signature is unambiguous', () => {
        const signature = DetectByteSignature(text('%PDF-1.7'), RULES)!;
        const resolved = ResolveFileType({ Declared: 'html', Signature: signature.FileType, SignatureIsUnambiguous: signature.Unambiguous });
        expect(resolved).toEqual({ FileType: 'pdf', Evidence: 'ByteCorrection' });
    });

    it('LEAVES a declaration alone when the signature is ambiguous', () => {
        const signature = DetectByteSignature(bytes(0x50, 0x4b, 0x03, 0x04), RULES)!;
        const resolved = ResolveFileType({ Declared: 'docx', Signature: signature.FileType, SignatureIsUnambiguous: signature.Unambiguous });
        expect(resolved).toEqual({ FileType: 'docx', Evidence: 'Declared' });
    });
});
