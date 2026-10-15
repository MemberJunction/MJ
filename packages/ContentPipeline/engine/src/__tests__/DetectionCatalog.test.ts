import { describe, expect, it, vi } from 'vitest';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { DetectByteSignature } from '@memberjunction/content-pipeline-base';
import { DetectionCatalog } from '../DetectionCatalog.js';

/**
 * The JSON exactly as the migration seeds it. Written out rather than imported so that changing a
 * stored signature has to be a deliberate edit here too — this file is what says the rows and the
 * parser agree.
 */
const SEEDED = [
    { FileExtension: '.pdf', Name: 'PDF', ByteSignature: '{"Magic":[37,80,68,70],"Unambiguous":true}', IsText: false },
    { FileExtension: '.html', Name: 'HTML', ByteSignature: '{"TextPrefix":["<!doctype html","<html"],"Unambiguous":false}', IsText: true },
    { FileExtension: '.json', Name: 'JSON', ByteSignature: '{"TextPrefix":["{","["],"Unambiguous":false}', IsText: true },
    { FileExtension: '.webp', Name: 'WebP', ByteSignature: '{"Magic":[87,69,66,80],"Offset":8,"Unambiguous":true}', IsText: false },
    { FileExtension: '.zip', Name: 'ZIP', ByteSignature: '{"Magic":[80,75,3,4],"Unambiguous":false}', IsText: false },
    { FileExtension: '.docx', Name: 'DOCX', ByteSignature: null, IsText: true },
    { FileExtension: null, Name: 'Other', ByteSignature: null, IsText: null },
    { FileExtension: '.bad', Name: 'Broken', ByteSignature: '{not json', IsText: null },
];

function catalog(fileTypes: unknown[] = SEEDED, contentTypes: unknown[] = []) {
    const engine = {
        Config: vi.fn().mockResolvedValue(undefined),
        ContentFileTypes: fileTypes,
        ContentTypes: contentTypes,
    };
    vi.spyOn(KnowledgeHubMetadataEngine, 'Instance', 'get').mockReturnValue(engine as never);
    return new DetectionCatalog({} as never, {} as never);
}

const text = (s: string) => new TextEncoder().encode(s);
const bytes = (...n: number[]) => new Uint8Array(n);

describe('DetectionCatalog — the seeded rows drive detection', () => {
    it('turns magic-byte rows into working signatures', async () => {
        const { Signatures } = await catalog().Rules();
        expect(DetectByteSignature(text('%PDF-1.7'), Signatures)).toEqual({ FileType: 'pdf', Unambiguous: true });
        expect(DetectByteSignature(bytes(0x50, 0x4b, 0x03, 0x04), Signatures)).toEqual({
            FileType: 'zip',
            Unambiguous: false,
        });
    });

    it('honours an offset', async () => {
        const { Signatures } = await catalog().Rules();
        const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
        expect(DetectByteSignature(webp, Signatures)?.FileType).toBe('webp');
    });

    it('expands a row that declares SEVERAL text prefixes', async () => {
        const { Signatures } = await catalog().Rules();
        expect(DetectByteSignature(text('<!DOCTYPE html><p>'), Signatures)?.FileType).toBe('html');
        expect(DetectByteSignature(text('<html>'), Signatures)?.FileType).toBe('html');
        expect(DetectByteSignature(text('{"a":1}'), Signatures)?.FileType).toBe('json');
        expect(DetectByteSignature(text('[1,2]'), Signatures)?.FileType).toBe('json');
    });

    it('reads IsText into the two sets, keeping NULL out of both', async () => {
        const rules = await catalog().Rules();
        expect(rules.TextFileTypes.has('html')).toBe(true);
        expect(rules.NonTextFileTypes.has('pdf')).toBe(true);
        expect(rules.TextFileTypes.has('other')).toBe(false);
        expect(rules.NonTextFileTypes.has('other')).toBe(false);
    });

    it('SKIPS an unparseable row instead of losing the rest', async () => {
        const { Signatures } = await catalog().Rules();
        expect(Signatures.some((s) => s.FileType === 'bad')).toBe(false);
        expect(DetectByteSignature(text('%PDF-1.7'), Signatures)?.FileType).toBe('pdf');
    });

    it('falls back to the built-in table when metadata cannot be read', async () => {
        vi.spyOn(KnowledgeHubMetadataEngine, 'Instance', 'get').mockImplementation(() => {
            throw new Error('no database');
        });
        const rules = await new DetectionCatalog({} as never, {} as never).Rules();
        expect(rules.Signatures).toEqual([]);
        // A run with no metadata still recognises a PDF — that is what the built-ins are for.
        expect(DetectByteSignature(text('%PDF-1.7'), rules.Signatures)?.FileType).toBe('pdf');
    });
});
