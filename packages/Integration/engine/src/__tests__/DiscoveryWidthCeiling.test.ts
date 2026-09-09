import { describe, expect, it } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import { BaseIntegrationConnector } from '../BaseIntegrationConnector.js';
import type {
    ConnectionTestResult,
    ExternalFieldSchema,
    ExternalObjectSchema,
    FetchBatchResult,
    FetchContext,
} from '../BaseIntegrationConnector.js';
import type { PkPickOptions, StreamDiscoveryOptions } from '../StreamingDiscovery.js';
import { MergeLength } from '../DeclaredSampleMerge.js';

/**
 * The residual half of MJ-DISC-18.
 *
 * Sampled widths are padded to at least twice the observed maximum, rounded up to a standard
 * bucket. When twice the observed maximum exceeds the largest bucket there IS no such bounded
 * width — and the code returned the largest bucket anyway. For anything past 4000 characters that
 * is NARROWER THAN THE VALUE ALREADY SEEN, and a record too long for its column is skipped whole
 * rather than truncated, so the data stops arriving with the run still reporting success.
 */

@RegisterClass(BaseIntegrationConnector, 'WidthCeilingTestConnector')
class WidthCeilingTestConnector extends BaseIntegrationConnector {
    public async TestConnection(): Promise<ConnectionTestResult> { return { Success: true, Message: 'OK' }; }
    public async DiscoverObjects(): Promise<ExternalObjectSchema[]> { return []; }
    public async DiscoverFields(): Promise<ExternalFieldSchema[]> { return []; }
    public async FetchChanges(_ctx: FetchContext): Promise<FetchBatchResult> { return { Records: [], HasMore: false }; }
    public Run(
        records: Iterable<Record<string, unknown>>,
        opts?: { Discovery?: StreamDiscoveryOptions; Pk?: PkPickOptions; ReadOnly?: boolean }
    ): Promise<ExternalFieldSchema[]> {
        return this.DiscoverFieldsViaStream(records, opts);
    }
}

const widthOf = (fields: ExternalFieldSchema[], name: string): number | null | undefined =>
    fields.find(f => f.Name === name)?.MaxLength;

/** Rows with a unique key and one wide text column of the requested size. */
function rows(count: number, bodyChars: number): Array<Record<string, unknown>> {
    return Array.from({ length: count }, (_, i) => ({ id: `k-${i}`, body: 'x'.repeat(bodyChars) }));
}

describe('sampled width ceiling', () => {
    it('sizes a comfortably-bounded column to the padded bucket, unchanged', async () => {
        const fields = await new WidthCeilingTestConnector().Run(rows(60, 100));
        // The inference floors a string at 255 before this code doubles again, so a 100-character
        // column lands at 512. Double-padding, pre-existing and deliberate on the "a sample max is
        // not the true max" argument — pinned here so a change to either half is visible.
        expect(widthOf(fields, 'body')).toBe(512);
    });

    it('returns UNBOUNDED rather than a width narrower than twice what was observed', async () => {
        // 2100 observed -> 4200 wanted -> past the largest bucket.
        const fields = await new WidthCeilingTestConnector().Run(rows(60, 2100));
        expect(widthOf(fields, 'body')).toBe(-1);
    });

    it('returns UNBOUNDED rather than a width narrower than the value already seen', async () => {
        // The sharp case: 5000 observed, and the old answer of 4000 could not even hold the row
        // the sample was taken FROM. Every such record would be skipped, silently.
        const fields = await new WidthCeilingTestConnector().Run(rows(60, 5000));
        const w = widthOf(fields, 'body');
        expect(w).toBe(-1);
        expect(w).not.toBe(4000);
    });

    it('returns UNBOUNDED when the PADDED width overflows the largest bucket', async () => {
        // The other half of the ceiling, and it needs a specific window to reach: the inference
        // itself hands back a doubled width (capped at 4000, null above), and this code doubles
        // AGAIN into a bucket. So the bucket overflow is only reachable when the inference returns
        // something above 2000 — i.e. an observed length between 1001 and 2000. 1500 observed
        // -> inferred 3000 -> wants 6000 -> past the largest bucket.
        const fields = await new WidthCeilingTestConnector().Run(rows(60, 1500));
        expect(widthOf(fields, 'body')).toBe(-1);
    });

    it('keeps a KEY index-eligible when the PADDED width overflows too', async () => {
        // Math.min(-1, 450) is -1, so without the explicit collapse a wide key would be handed to
        // the schema builder as MAX — and a MAX column cannot be an index key at all.
        const wide = Array.from({ length: 60 }, (_, i) => ({ id: `${'k'.repeat(1500)}-${i}` }));
        const fields = await new WidthCeilingTestConnector().Run(wide);
        expect(fields.find(f => f.Name === 'id')?.MaxLength).toBe(450);
    });

    it('keeps a KEY column index-eligible instead of making it unbounded', async () => {
        // A key can never be MAX — it would stop being a key. So an unbounded padding has to
        // collapse to the index-key cap, not to Math.min(-1, 450), which is -1.
        const wide = Array.from({ length: 60 }, (_, i) => ({ id: `${'k'.repeat(3000)}-${i}` }));
        const fields = await new WidthCeilingTestConnector().Run(wide);
        const id = fields.find(f => f.Name === 'id');
        expect(id?.MaxLength).toBe(450);
        expect(id?.MaxLength).not.toBe(-1);
    });
});

describe('MergeLength speaks both spellings of unbounded', () => {
    it('lets -1 win over any bounded width, from either side', () => {
        // The bug: -1 read as an ordinary number made this 255 — a numeric comparison treating the
        // WIDEST possible width as the narrowest, silently merging away a sample that had just
        // proved no bounded width was safe.
        expect(MergeLength(255, -1)).toBe(-1);
        expect(MergeLength(-1, 255)).toBe(-1);
        expect(MergeLength(-1, -1)).toBe(-1);
    });

    it('still lets null win, and preserves the spelling the caller used', () => {
        expect(MergeLength(null, 255)).toBe(null);
        expect(MergeLength(255, null)).toBe(null);
        // A source that said -1 gets -1 back rather than null, so the value stays legible to the
        // catalog path that produced it.
        expect(MergeLength(-1, null)).toBe(-1);
        expect(MergeLength(null, -1)).toBe(null);
    });

    it('is unchanged for ordinary bounded widths', () => {
        expect(MergeLength(255, 512)).toBe(512);
        expect(MergeLength(512, 255)).toBe(512);
        expect(MergeLength(undefined, 255)).toBe(255);
        expect(MergeLength(255, undefined)).toBe(255);
        expect(MergeLength(undefined, undefined)).toBe(undefined);
    });
});
