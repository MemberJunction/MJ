/**
 * @fileoverview Unit tests for synthetic duplicate corpus generation, reply validation,
 * exact match detection, and corpus serialization.
 *
 * All tests use mocks and deterministic seeded functions — no live LLM or DB calls.
 */

import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CreateSeededRandom, OutputInsideRepoError } from '@memberjunction/testing-engine';
import {
    DeserializeCorpusLabel,
    DeserializeCorpusRecord,
    IsExactMatchWithExisting,
    ReadCorpusFiles,
    SampleSourceRecords,
    SerializeCorpusLabel,
    SerializeCorpusRecord,
    StripCodeFences,
    ValidateGeneratorReply,
    WriteCorpusFiles,
} from '../../dupe-check-measurement/corpus-generator';
import type {
    CorpusRecord,
    DuplicateCorpusLabel,
    GeneratedFromMetadata,
    NewCorpusLabel,
} from '../../dupe-check-measurement/types';

describe('SampleSourceRecords', () => {
    it('returns empty array when source is empty or count <= 0', () => {
        const rand = CreateSeededRandom(42);
        expect(SampleSourceRecords([], 5, rand)).toEqual([]);
        expect(SampleSourceRecords(['a', 'b'], 0, rand)).toEqual([]);
    });

    it('samples deterministically without replacement when count <= length', () => {
        const pool = ['A', 'B', 'C', 'D', 'E', 'F'];
        const rand1 = CreateSeededRandom(12345);
        const sample1 = SampleSourceRecords(pool, 3, rand1);

        const rand2 = CreateSeededRandom(12345);
        const sample2 = SampleSourceRecords(pool, 3, rand2);

        expect(sample1).toEqual(sample2);
        expect(sample1).toHaveLength(3);
        const set = new Set(sample1);
        expect(set.size).toBe(3);
    });

    it('samples with replacement when count > length', () => {
        const pool = ['X', 'Y'];
        const rand = CreateSeededRandom(999);
        const sample = SampleSourceRecords(pool, 5, rand);

        expect(sample).toHaveLength(5);
        expect(sample.every(item => pool.includes(item))).toBe(true);
    });
});

describe('StripCodeFences', () => {
    it('strips json code fences', () => {
        const input = '```json\n{"Name": "Test"}\n```';
        expect(StripCodeFences(input)).toBe('{"Name": "Test"}');
    });

    it('strips plain markdown code fences', () => {
        const input = '```\n{"Name": "Test"}\n```';
        expect(StripCodeFences(input)).toBe('{"Name": "Test"}');
    });

    it('returns untouched text when no fences are present', () => {
        const input = '{"Name": "Test"}';
        expect(StripCodeFences(input)).toBe('{"Name": "Test"}');
    });
});

describe('ValidateGeneratorReply', () => {
    const fields = ['Name', 'Description'] as const;

    it('accepts valid JSON with exactly the requested fields and non-empty strings', () => {
        const reply = JSON.stringify({
            Name: 'Create User',
            Description: 'Creates a new user record in the database',
        });
        const result = ValidateGeneratorReply(reply, fields);
        expect(result.Success).toBe(true);
        expect(result.Values).toEqual({
            Name: 'Create User',
            Description: 'Creates a new user record in the database',
        });
    });

    it('accepts valid JSON wrapped in markdown code fences', () => {
        const reply = '```json\n{\n  "Name": "Send Email",\n  "Description": "Sends notification"\n}\n```';
        const result = ValidateGeneratorReply(reply, fields);
        expect(result.Success).toBe(true);
        expect(result.Values?.Name).toBe('Send Email');
    });

    it('rejects JSON containing extraneous keys', () => {
        const reply = JSON.stringify({
            Name: 'Create User',
            Description: 'Desc',
            Rationale: 'This is a rewrite',
        });
        const result = ValidateGeneratorReply(reply, fields);
        expect(result.Success).toBe(false);
        expect(result.Error).toContain('Unexpected fields in reply: Rationale');
    });

    it('rejects JSON missing required fields', () => {
        const reply = JSON.stringify({
            Name: 'Create User',
        });
        const result = ValidateGeneratorReply(reply, fields);
        expect(result.Success).toBe(false);
        expect(result.Error).toContain('Missing required field: "Description"');
    });

    it('rejects empty or whitespace-only field values', () => {
        const replyEmpty = JSON.stringify({
            Name: 'Create User',
            Description: '',
        });
        expect(ValidateGeneratorReply(replyEmpty, fields).Success).toBe(false);

        const replyWhitespace = JSON.stringify({
            Name: '   ',
            Description: 'Desc',
        });
        expect(ValidateGeneratorReply(replyWhitespace, fields).Success).toBe(false);
    });

    it('rejects non-object responses (arrays, primitives, null)', () => {
        expect(ValidateGeneratorReply('["Name", "Desc"]', fields).Success).toBe(false);
        expect(ValidateGeneratorReply('"some string"', fields).Success).toBe(false);
        expect(ValidateGeneratorReply('null', fields).Success).toBe(false);
    });

    it('rejects invalid JSON syntax', () => {
        expect(ValidateGeneratorReply('{Name: "Create User"', fields).Success).toBe(false);
    });
});

describe('IsExactMatchWithExisting', () => {
    const existing = [
        { ID: '1', Name: 'Export Data', Description: 'Exports data to CSV format' },
        { ID: '2', Name: 'Import Data', Description: 'Imports data from CSV' },
    ];
    const fields = ['Name', 'Description'];

    it('returns true when generated record exactly matches an existing row (case-insensitive)', () => {
        const generated = {
            Name: 'export data',
            Description: '  exports data to csv format  ',
        };
        expect(IsExactMatchWithExisting(generated, existing, fields)).toBe(true);
    });

    it('returns false when any field differs', () => {
        const generated = {
            Name: 'Export Data to File',
            Description: 'Exports data to CSV format',
        };
        expect(IsExactMatchWithExisting(generated, existing, fields)).toBe(false);
    });
});

describe('Corpus Serialization and Deserialization', () => {
    it('round-trips CorpusRecord', () => {
        const record: CorpusRecord = {
            Id: 'rec-001',
            Values: { Name: 'Test Action', Description: 'Action description' },
        };
        const serialized = SerializeCorpusRecord(record);
        expect(serialized).toContain('"id":"rec-001"');
        const parsed = DeserializeCorpusRecord(serialized);
        expect(parsed.Id).toBe('rec-001');
        expect(parsed.Values.Name).toBe('Test Action');
    });

    it('round-trips DuplicateCorpusLabel', () => {
        const label: DuplicateCorpusLabel = {
            Id: 'rec-dupe-1',
            Label: 'duplicate',
            SourceRecordId: 'src-100',
        };
        const serialized = SerializeCorpusLabel(label);
        expect(serialized).toContain('"label":"duplicate"');
        expect(serialized).toContain('"sourceRecordId":"src-100"');
        const parsed = DeserializeCorpusLabel(serialized);
        expect(parsed.Id).toBe('rec-dupe-1');
        expect(parsed.Label).toBe('duplicate');
        if (parsed.Label === 'duplicate') {
            expect(parsed.SourceRecordId).toBe('src-100');
        }
    });

    it('round-trips NewCorpusLabel', () => {
        const label: NewCorpusLabel = {
            Id: 'rec-new-1',
            Label: 'new',
            NearRecordId: 'src-200',
        };
        const serialized = SerializeCorpusLabel(label);
        expect(serialized).toContain('"label":"new"');
        expect(serialized).toContain('"nearRecordId":"src-200"');
        const parsed = DeserializeCorpusLabel(serialized);
        expect(parsed.Id).toBe('rec-new-1');
        expect(parsed.Label).toBe('new');
        if (parsed.Label === 'new') {
            expect(parsed.NearRecordId).toBe('src-200');
        }
    });
});

describe('WriteCorpusFiles and ReadCorpusFiles', () => {
    it('refuses writing inside the repository', () => {
        const repoPath = join(process.cwd(), 'scratch-test-out');
        const records: CorpusRecord[] = [];
        const labels: DuplicateCorpusLabel[] = [];
        const meta: GeneratedFromMetadata = {
            Entity: 'MJ: Actions',
            Fields: ['Name'],
            Model: 'mock-model',
            Seed: 7,
            Counts: { Duplicates: 0, New: 0 },
            Timestamp: new Date().toISOString(),
        };

        expect(() => WriteCorpusFiles(repoPath, records, labels, meta)).toThrow(OutputInsideRepoError);
    });

    it('writes and reads corpus files outside the repository', () => {
        const tempDir = mkdtempSync(join(tmpdir(), 'mj-dupe-corpus-test-'));
        try {
            const records: CorpusRecord[] = [
                { Id: 'd1', Values: { Name: 'Action A' } },
                { Id: 'n1', Values: { Name: 'Action B' } },
            ];
            const labels = [
                { Id: 'd1', Label: 'duplicate' as const, SourceRecordId: 's1' },
                { Id: 'n1', Label: 'new' as const, NearRecordId: 's2' },
            ];
            const meta: GeneratedFromMetadata = {
                Entity: 'MJ: Actions',
                Fields: ['Name'],
                Model: 'test-model',
                Seed: 42,
                Counts: { Duplicates: 1, New: 1 },
                Timestamp: '2026-09-29T12:00:00Z',
            };

            WriteCorpusFiles(tempDir, records, labels, meta);

            const readBack = ReadCorpusFiles(tempDir);
            expect(readBack.Records).toHaveLength(2);
            expect(readBack.Records[0].Id).toBe('d1');
            expect(readBack.Records[0].Values.Name).toBe('Action A');
            expect(readBack.Labels).toHaveLength(2);
            expect(readBack.Labels[0].Label).toBe('duplicate');
            expect(readBack.Metadata?.Model).toBe('test-model');
            expect(readBack.Metadata?.Counts.Duplicates).toBe(1);
        } finally {
            rmSync(tempDir, { recursive: true, force: true });
        }
    });
});
