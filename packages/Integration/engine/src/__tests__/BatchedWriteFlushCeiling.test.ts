/**
 * A batched group holds every enrolled record's rendered SQL and parameters until Submit, so peak
 * memory for an apply is roughly (maps in flight × group size × row size). With wide rows that is
 * the largest allocation a sync makes, and a box that has exhausted its heap currently has no way
 * to trade throughput for headroom.
 *
 * The ceiling is OFF unless asked for, because splitting a batch into several transactions is a
 * real trade: an earlier flush stays committed if a later one fails. These tests pin that default
 * far more than they pin the splitting.
 */
import { describe, it, expect } from 'vitest';
import { ReadFlushCeiling } from '../IntegrationEngine.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('ReadFlushCeiling', () => {
    it('is UNSET by default — one batch stays one group and one transaction', () => {
        expect(ReadFlushCeiling({} as NodeJS.ProcessEnv)).toBeUndefined();
    });

    it('ignores values that cannot mean a ceiling', () => {
        for (const bad of ['', '0', '-5', 'lots', 'NaN']) {
            expect(ReadFlushCeiling({ MJ_INTEGRATION_BATCH_FLUSH_AT: bad } as NodeJS.ProcessEnv)).toBeUndefined();
        }
    });

    it('accepts an explicit ceiling', () => {
        expect(ReadFlushCeiling({ MJ_INTEGRATION_BATCH_FLUSH_AT: '100' } as NodeJS.ProcessEnv)).toBe(100);
        expect(ReadFlushCeiling({ MJ_INTEGRATION_BATCH_FLUSH_AT: '1' } as NodeJS.ProcessEnv)).toBe(1);
    });
});

describe('wiring', () => {
    const source = readFileSync(join(__dirname, '..', 'IntegrationEngine.ts'), 'utf8');

    it('skips the whole mechanism when no ceiling is set', () => {
        // The guard must come before any counting, so the default path costs nothing.
        expect(source).toMatch(/if \(flushAt === undefined\) continue;/);
    });

    it('replaces the group on the SHARED context object, not a local', () => {
        // Every frame below reads the group through AsyncLocalStorage from this same object, so a
        // local reassignment would leave the next record enrolling into the submitted group.
        expect(source).toMatch(/ctx\.writeGroup = fresh;/);
    });

    it('arms the replacement group for batched submit', () => {
        // A fresh group defaults to sequential submit; forgetting this would silently drop the
        // batching win for every record after the first flush.
        expect(source).toMatch(/const fresh = await provider\.CreateTransactionGroup\(\);\s*\n\s*fresh\.BatchedSubmit = true;/);
    });

    it('treats a failed mid-batch submit as a batch failure', () => {
        expect(source).toMatch(/if \(!submitted\) throw new Error\('Batched write group did not commit'\);/);
    });
});
