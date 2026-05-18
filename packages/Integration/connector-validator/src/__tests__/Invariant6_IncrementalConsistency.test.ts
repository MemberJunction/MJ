/**
 * Unit tests for Invariant 6 — Incremental sync consistency.
 */
import { describe, it, expect } from 'vitest';
import { CheckIncrementalConsistency } from '../Invariant6_IncrementalConsistency.js';
import type { MetadataFile } from '../types.js';

function makeMetadata(io: {
    Name?: string;
    SupportsIncrementalSync?: boolean;
    IncrementalCursorFieldName?: string | null;
    IncrementalWatermarkType?: 'Timestamp' | 'Version' | 'Cursor' | 'ChangeToken' | null;
    iofs?: Array<{ Name: string; Type?: string; IsIncrementalCursorCandidate?: boolean }>;
}): MetadataFile {
    return {
        fields: { Name: 'TestVendor', ClassName: 'TestVendorConnector' },
        relatedEntities: {
            'MJ: Integration Objects': [{
                fields: {
                    Name: io.Name ?? 'contacts',
                    SupportsIncrementalSync: io.SupportsIncrementalSync ?? false,
                    IncrementalCursorFieldName: io.IncrementalCursorFieldName,
                    IncrementalWatermarkType: io.IncrementalWatermarkType,
                },
                relatedEntities: io.iofs ? {
                    'MJ: Integration Object Fields': io.iofs.map((iof) => ({
                        fields: { Name: iof.Name, Type: iof.Type, IsIncrementalCursorCandidate: iof.IsIncrementalCursorCandidate },
                    })),
                } : undefined,
            }],
        },
    };
}

describe('Invariant 6 — Incremental sync consistency', () => {
    it('passes when IO has SupportsIncrementalSync=false (no checks apply)', () => {
        const md = makeMetadata({ SupportsIncrementalSync: false });
        expect(CheckIncrementalConsistency(md).Status).toBe('Pass');
    });

    it('passes when cursor field + type are consistent (Timestamp + datetime)', () => {
        const md = makeMetadata({
            SupportsIncrementalSync: true,
            IncrementalCursorFieldName: 'updatedAt',
            IncrementalWatermarkType: 'Timestamp',
            iofs: [{ Name: 'updatedAt', Type: 'datetime', IsIncrementalCursorCandidate: true }],
        });
        expect(CheckIncrementalConsistency(md).Status).toBe('Pass');
    });

    it('fails when SupportsIncrementalSync=true but no cursor field set', () => {
        const md = makeMetadata({
            SupportsIncrementalSync: true,
            IncrementalCursorFieldName: null,
            IncrementalWatermarkType: 'Timestamp',
        });
        const result = CheckIncrementalConsistency(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes('IncrementalCursorFieldName is not set'))).toBe(true);
    });

    it('fails when cursor field references nonexistent IOF', () => {
        const md = makeMetadata({
            SupportsIncrementalSync: true,
            IncrementalCursorFieldName: 'phantom',
            IncrementalWatermarkType: 'Timestamp',
            iofs: [{ Name: 'updatedAt', Type: 'datetime' }],
        });
        const result = CheckIncrementalConsistency(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes("'phantom' but no IOF"))).toBe(true);
    });

    it('fails when watermark type incompatible with IOF type (Timestamp + boolean)', () => {
        const md = makeMetadata({
            SupportsIncrementalSync: true,
            IncrementalCursorFieldName: 'isModified',
            IncrementalWatermarkType: 'Timestamp',
            iofs: [{ Name: 'isModified', Type: 'boolean' }],
        });
        const result = CheckIncrementalConsistency(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes("incompatible with IOF"))).toBe(true);
    });

    it('accepts Version + integer or Version + string', () => {
        for (const type of ['integer', 'string']) {
            const md = makeMetadata({
                SupportsIncrementalSync: true,
                IncrementalCursorFieldName: 'systemVersion',
                IncrementalWatermarkType: 'Version',
                iofs: [{ Name: 'systemVersion', Type: type, IsIncrementalCursorCandidate: true }],
            });
            expect(CheckIncrementalConsistency(md).Status).toBe('Pass');
        }
    });

    it('rejects invalid IncrementalWatermarkType enum value', () => {
        const md = makeMetadata({
            SupportsIncrementalSync: true,
            IncrementalCursorFieldName: 'updatedAt',
            IncrementalWatermarkType: 'Bogus' as never,
            iofs: [{ Name: 'updatedAt', Type: 'datetime' }],
        });
        const result = CheckIncrementalConsistency(md);
        expect(result.Status).toBe('Fail');
        expect(result.Failures.some((f) => f.Failure.includes("'Bogus'"))).toBe(true);
    });

    it('warns when cursor IOF lacks IsIncrementalCursorCandidate=true', () => {
        const md = makeMetadata({
            SupportsIncrementalSync: true,
            IncrementalCursorFieldName: 'updatedAt',
            IncrementalWatermarkType: 'Timestamp',
            iofs: [{ Name: 'updatedAt', Type: 'datetime', IsIncrementalCursorCandidate: false }],
        });
        const result = CheckIncrementalConsistency(md);
        // Warning only — overall still Pass since the only failure is a Warning
        expect(result.Status).toBe('Pass');
        expect(result.Failures.some((f) => f.Severity === 'Warning' && f.Failure.includes('IsIncrementalCursorCandidate=false'))).toBe(true);
    });
});
