/**
 * @fileoverview Pure logic for synthetic duplicate corpus generation, reply validation,
 * exact match dropping, and corpus file serialization.
 *
 * @module @memberjunction/integration-test-suite
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AssertOutputOutsideRepo } from '@memberjunction/testing-engine';
import type {
    CorpusLabel,
    CorpusRecord,
    DuplicateCorpusLabel,
    GeneratedFromMetadata,
    NewCorpusLabel,
} from './types';

/**
 * Result of validating an LLM reply for corpus generation.
 */
export interface ValidationResult {
    Success: boolean;
    Values?: Record<string, string>;
    Error?: string;
}

/**
 * Samples `count` elements from `records` using a seeded random function in [0, 1).
 * When `count <= records.length`, samples without replacement.
 * When `count > records.length`, wraps with seeded draws.
 */
export function SampleSourceRecords<T>(
    records: readonly T[],
    count: number,
    random: () => number
): T[] {
    if (records.length === 0 || count <= 0) {
        return [];
    }

    if (count <= records.length) {
        // Fisher-Yates partial shuffle copy
        const copy = [...records];
        for (let i = 0; i < count; i++) {
            const j = i + Math.floor(random() * (copy.length - i));
            const temp = copy[i];
            copy[i] = copy[j];
            copy[j] = temp;
        }
        return copy.slice(0, count);
    }

    // When requested count exceeds pool, sample with replacement
    const sampled: T[] = [];
    for (let i = 0; i < count; i++) {
        const index = Math.floor(random() * records.length);
        sampled.push(records[index]);
    }
    return sampled;
}

/**
 * Strips surrounding markdown code fences (```json ... ``` or ``` ... ```) if present.
 */
export function StripCodeFences(text: string): string {
    const trimmed = text.trim();
    if (trimmed.startsWith('```')) {
        const firstNewline = trimmed.indexOf('\n');
        if (firstNewline !== -1) {
            const withoutHeader = trimmed.slice(firstNewline + 1);
            const lastFence = withoutHeader.lastIndexOf('```');
            if (lastFence !== -1) {
                return withoutHeader.slice(0, lastFence).trim();
            }
        }
    }
    return trimmed;
}

/**
 * Validates an LLM's text reply for a generation task:
 * 1. Must parse as valid JSON object (not array, not primitive).
 * 2. Only `expectedFields` keys are permitted.
 * 3. All `expectedFields` must be present.
 * 4. Every field value must be a non-empty string (trimmed length > 0).
 */
export function ValidateGeneratorReply(
    rawText: string,
    expectedFields: readonly string[]
): ValidationResult {
    const cleaned = StripCodeFences(rawText);
    let parsed: unknown;
    try {
        parsed = JSON.parse(cleaned);
    } catch (e) {
        return {
            Success: false,
            Error: `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
        };
    }

    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            Success: false,
            Error: 'Expected JSON object but received ' + (Array.isArray(parsed) ? 'array' : typeof parsed),
        };
    }

    const obj = parsed as Record<string, unknown>;
    const expectedSet = new Set(expectedFields);
    const actualKeys = Object.keys(obj);

    // Check for extraneous keys
    const extraKeys = actualKeys.filter(k => !expectedSet.has(k));
    if (extraKeys.length > 0) {
        return {
            Success: false,
            Error: `Unexpected fields in reply: ${extraKeys.join(', ')} (expected only ${expectedFields.join(', ')})`,
        };
    }

    // Check for missing keys and validate non-empty string values
    const resultValues: Record<string, string> = {};
    for (const field of expectedFields) {
        if (!(field in obj)) {
            return {
                Success: false,
                Error: `Missing required field: "${field}"`,
            };
        }
        const val = obj[field];
        if (typeof val !== 'string' || val.trim().length === 0) {
            return {
                Success: false,
                Error: `Field "${field}" must be a non-empty string`,
            };
        }
        resultValues[field] = val.trim();
    }

    return {
        Success: true,
        Values: resultValues,
    };
}

/**
 * Checks whether the generated field values match any existing record across all `fields`
 * (normalized case-insensitively with whitespace trimmed).
 */
export function IsExactMatchWithExisting(
    generatedValues: Record<string, string>,
    existingRecords: readonly Record<string, unknown>[],
    fields: readonly string[]
): boolean {
    for (const row of existingRecords) {
        const matchesAll = fields.every(field => {
            const rowVal = String(row[field] ?? '').trim().toLowerCase();
            const genVal = String(generatedValues[field] ?? '').trim().toLowerCase();
            return rowVal === genVal;
        });
        if (matchesAll) {
            return true;
        }
    }
    return false;
}

/**
 * Serializes a CorpusRecord to its single-line JSON representation:
 * `{"id": "...", "values": { ... }}`
 */
export function SerializeCorpusRecord(record: CorpusRecord): string {
    return JSON.stringify({
        id: record.Id,
        values: record.Values,
    });
}

/**
 * Serializes a CorpusLabel to its single-line JSON representation:
 * `{ "id": "...", "label": "duplicate", "sourceRecordId": "..." }` or
 * `{ "id": "...", "label": "new", "nearRecordId": "..." }`
 */
export function SerializeCorpusLabel(label: CorpusLabel): string {
    if (label.Label === 'duplicate') {
        return JSON.stringify({
            id: label.Id,
            label: 'duplicate',
            sourceRecordId: label.SourceRecordId,
        });
    }
    return JSON.stringify({
        id: label.Id,
        label: 'new',
        nearRecordId: label.NearRecordId,
    });
}

/**
 * Deserializes a single line from corpus.jsonl.
 */
export function DeserializeCorpusRecord(line: string): CorpusRecord {
    const raw = JSON.parse(line.trim()) as { id?: string; Id?: string; values?: Record<string, string>; Values?: Record<string, string> };
    return {
        Id: raw.id ?? raw.Id ?? '',
        Values: raw.values ?? raw.Values ?? {},
    };
}

/**
 * Deserializes a single line from labels.jsonl.
 */
export function DeserializeCorpusLabel(line: string): CorpusLabel {
    const raw = JSON.parse(line.trim()) as {
        id?: string;
        Id?: string;
        label: 'duplicate' | 'new';
        sourceRecordId?: string;
        SourceRecordId?: string;
        nearRecordId?: string;
        NearRecordId?: string;
    };

    const id = raw.id ?? raw.Id ?? '';
    if (raw.label === 'duplicate') {
        const sourceRecordId = raw.sourceRecordId ?? raw.SourceRecordId ?? '';
        const dupeLabel: DuplicateCorpusLabel = {
            Id: id,
            Label: 'duplicate',
            SourceRecordId: sourceRecordId,
        };
        return dupeLabel;
    }
    const nearRecordId = raw.nearRecordId ?? raw.NearRecordId ?? '';
    const newLabel: NewCorpusLabel = {
        Id: id,
        Label: 'new',
        NearRecordId: nearRecordId,
    };
    return newLabel;
}

/**
 * Writes corpus.jsonl, labels.jsonl, and generated-from.json to `outDir`.
 * Refuses paths inside any git repository via {@link AssertOutputOutsideRepo}.
 */
export function WriteCorpusFiles(
    outDir: string,
    records: readonly CorpusRecord[],
    labels: readonly CorpusLabel[],
    metadata: GeneratedFromMetadata
): void {
    const resolvedDir = AssertOutputOutsideRepo(outDir);
    if (!existsSync(resolvedDir)) {
        mkdirSync(resolvedDir, { recursive: true });
    }

    const corpusContent = records.map(SerializeCorpusRecord).join('\n') + '\n';
    writeFileSync(join(resolvedDir, 'corpus.jsonl'), corpusContent, 'utf-8');

    const labelsContent = labels.map(SerializeCorpusLabel).join('\n') + '\n';
    writeFileSync(join(resolvedDir, 'labels.jsonl'), labelsContent, 'utf-8');

    const metaContent = JSON.stringify(metadata, null, 2) + '\n';
    writeFileSync(join(resolvedDir, 'generated-from.json'), metaContent, 'utf-8');
}

/**
 * Reads corpus.jsonl, labels.jsonl, and generated-from.json from a corpus directory.
 */
export function ReadCorpusFiles(corpusDir: string): {
    Records: CorpusRecord[];
    Labels: CorpusLabel[];
    Metadata?: GeneratedFromMetadata;
} {
    const corpusPath = join(corpusDir, 'corpus.jsonl');
    const labelsPath = join(corpusDir, 'labels.jsonl');
    const metaPath = join(corpusDir, 'generated-from.json');

    if (!existsSync(corpusPath)) {
        throw new Error(`Corpus file not found: ${corpusPath}`);
    }
    if (!existsSync(labelsPath)) {
        throw new Error(`Labels file not found: ${labelsPath}`);
    }

    const corpusLines = readFileSync(corpusPath, 'utf-8')
        .split('\n')
        .filter(l => l.trim().length > 0);
    const Records = corpusLines.map(DeserializeCorpusRecord);

    const labelLines = readFileSync(labelsPath, 'utf-8')
        .split('\n')
        .filter(l => l.trim().length > 0);
    const Labels = labelLines.map(DeserializeCorpusLabel);

    let Metadata: GeneratedFromMetadata | undefined;
    if (existsSync(metaPath)) {
        Metadata = JSON.parse(readFileSync(metaPath, 'utf-8')) as GeneratedFromMetadata;
    }

    return { Records, Labels, Metadata };
}
