import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine';

/**
 * Engine-side half of the pagination rule: a connector MUST honour `ctx.BatchSize`. The engine never
 * truncates an over-size batch — every record is written, just in sub-batches — so the violation is
 * otherwise INVISIBLE. These tests pin the classification that decides which structured warning code
 * lands on the run-event stream, because the two cases are materially different defects:
 *
 *  - `CONNECTOR_UNBOUNDED_BATCH`   — pagination not implemented at all; the whole object is in memory,
 *                                    and it grows silently with the customer's data (an OOM waiting).
 *  - `CONNECTOR_IGNORED_BATCH_SIZE` — paging, but overshooting the requested size. Bounded memory.
 */
describe('IntegrationEngine.ClassifyOversizedBatch', () => {
    const OBJ = 'Contacts';
    const SIZE = 500;

    it('returns null when the batch is within the requested size (nothing to warn about)', () => {
        expect(IntegrationEngine.ClassifyOversizedBatch(OBJ, 500, SIZE, 1, false)).toBeNull();
        expect(IntegrationEngine.ClassifyOversizedBatch(OBJ, 1, SIZE, 1, true)).toBeNull();
        expect(IntegrationEngine.ClassifyOversizedBatch(OBJ, 0, SIZE, 1, false)).toBeNull();
    });

    it('flags UNBOUNDED when the first batch is over-size and there is no next page', () => {
        const v = IntegrationEngine.ClassifyOversizedBatch(OBJ, 40_000, SIZE, 1, false);

        expect(v).not.toBeNull();
        expect(v!.Code).toBe('CONNECTOR_UNBOUNDED_BATCH');
        expect(v!.Unbounded).toBe(true);
        expect(v!.Message).toContain(OBJ);
        expect(v!.Message).toContain('40000');
        expect(v!.Message).toContain('500');
        // Must state the records were still written — the engine chunks, it does not drop.
        expect(v!.Message).toMatch(/written/i);
    });

    it('treats an undefined HasMore on the first batch as no-next-page (unbounded)', () => {
        // A connector that omits HasMore entirely is the classic no-pagination case.
        const v = IntegrationEngine.ClassifyOversizedBatch(OBJ, 40_000, SIZE, 1, undefined);
        expect(v!.Code).toBe('CONNECTOR_UNBOUNDED_BATCH');
    });

    it('flags IGNORED_BATCH_SIZE — not unbounded — when the first batch is over-size but paging', () => {
        const v = IntegrationEngine.ClassifyOversizedBatch(OBJ, 1_000, SIZE, 1, true);

        expect(v!.Code).toBe('CONNECTOR_IGNORED_BATCH_SIZE');
        expect(v!.Unbounded).toBe(false);
        expect(v!.Message).toContain('1000');
    });

    it('flags IGNORED_BATCH_SIZE for a later over-size batch even when HasMore is false', () => {
        // batchIndex > 1 proves pagination works; a final over-size page is just an overshoot.
        const v = IntegrationEngine.ClassifyOversizedBatch(OBJ, 1_000, SIZE, 7, false);

        expect(v!.Code).toBe('CONNECTOR_IGNORED_BATCH_SIZE');
        expect(v!.Unbounded).toBe(false);
        expect(v!.Message).toContain('batch 7');
    });

    it('is over-size by strict comparison — exactly the requested size is compliant', () => {
        expect(IntegrationEngine.ClassifyOversizedBatch(OBJ, SIZE, SIZE, 1, false)).toBeNull();
        expect(IntegrationEngine.ClassifyOversizedBatch(OBJ, SIZE + 1, SIZE, 1, false)).not.toBeNull();
    });
});
