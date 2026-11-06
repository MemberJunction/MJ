import { describe, expect, it, vi } from 'vitest';
import { KnowledgeHubMetadataEngine } from '@memberjunction/core-entities';
import { DetectByteSignature } from '@memberjunction/content-pipeline-base';
import { BuildDetectionRules, DetectionCatalog, DetectionRow } from '../DetectionCatalog.js';

/** Rows in the shape `metadata/content-file-types` seeds them. */
const ROWS: DetectionRow[] = [
    { FileExtension: '.pdf', Name: 'PDF', ByteSignature: '{"Magic":[37,80,68,70],"Unambiguous":true}', IsText: false, ExtractorKey: 'Pdf' },
    { FileExtension: '.html', Name: 'HTML', ByteSignature: '{"TextPrefix":["<!doctype html","<html"]}', IsText: true, ExtractorKey: 'Html' },
    { FileExtension: '.json', Name: 'JSON', ByteSignature: '{"TextPrefix":["{","["]}', IsText: true, ExtractorKey: null },
    { FileExtension: '.webp', Name: 'WEBP', ByteSignature: '{"Magic":[87,69,66,80],"Offset":8,"Unambiguous":true}', IsText: false, ExtractorKey: null },
    { FileExtension: '.zip', Name: 'ZIP', ByteSignature: '{"Magic":[80,75,3,4],"Unambiguous":false}', IsText: false, ExtractorKey: 'Archive' },
    { FileExtension: null, Name: 'Other', ByteSignature: null, IsText: null, ExtractorKey: null },
    { FileExtension: '.bad', Name: 'Broken', ByteSignature: '{not json', IsText: null, ExtractorKey: null },
];

const text = (s: string) => new TextEncoder().encode(s);
const bytes = (...n: number[]) => new Uint8Array(n);

describe('BuildDetectionRules', () => {
    const rules = BuildDetectionRules(ROWS);

    it('turns magic-byte rows into working signatures, honouring an offset', () => {
        expect(DetectByteSignature(text('%PDF-1.7'), rules.Signatures)).toEqual({ FileType: 'pdf', Unambiguous: true });
        expect(DetectByteSignature(bytes(0x50, 0x4b, 0x03, 0x04), rules.Signatures)).toEqual({ FileType: 'zip', Unambiguous: false });
        const webp = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);
        expect(DetectByteSignature(webp, rules.Signatures)?.FileType).toBe('webp');
    });

    it('expands a row that declares SEVERAL text prefixes', () => {
        expect(DetectByteSignature(text('<!DOCTYPE html><p>'), rules.Signatures)?.FileType).toBe('html');
        expect(DetectByteSignature(text('<html>'), rules.Signatures)?.FileType).toBe('html');
        expect(DetectByteSignature(text('[1,2]'), rules.Signatures)?.FileType).toBe('json');
    });

    it('routes only non-text types with no extractor to multi-modal', () => {
        expect([...rules.NonTextFileTypes]).toEqual(['webp']);
    });

    it('maps file type to extractor, keyed by the extension without its dot', () => {
        expect(rules.ExtractorByFileType.get('pdf')).toBe('Pdf');
        expect(rules.ExtractorByFileType.get('zip')).toBe('Archive');
    });

    it('SKIPS an unparseable row instead of losing the rest', () => {
        expect(rules.Signatures.some((s) => s.FileType === 'bad')).toBe(false);
    });
});

describe('DetectionCatalog', () => {
    it('loads the rows from the Knowledge Hub cache', async () => {
        const engine = { Config: vi.fn().mockResolvedValue(undefined), ContentFileTypes: ROWS };
        vi.spyOn(KnowledgeHubMetadataEngine, 'Instance', 'get').mockReturnValue(engine as never);
        const rules = await new DetectionCatalog({} as never, {} as never).Rules();
        expect(rules.ExtractorByFileType.get('html')).toBe('Html');
        vi.restoreAllMocks();
    });

    it('does not cache a failed load, so the next record retries', async () => {
        vi.spyOn(KnowledgeHubMetadataEngine, 'Instance', 'get').mockImplementation(() => {
            throw new Error('no database');
        });
        const catalog = new DetectionCatalog({} as never, {} as never);
        await expect(catalog.Rules()).rejects.toThrow(/no database/);
        vi.restoreAllMocks();
        const engine = { Config: vi.fn().mockResolvedValue(undefined), ContentFileTypes: ROWS };
        vi.spyOn(KnowledgeHubMetadataEngine, 'Instance', 'get').mockReturnValue(engine as never);
        expect((await catalog.Rules()).Signatures.length).toBeGreaterThan(0);
        vi.restoreAllMocks();
    });
});
