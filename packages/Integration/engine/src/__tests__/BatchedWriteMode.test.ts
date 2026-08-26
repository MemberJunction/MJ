/**
 * The opt-in for batched writes. Two properties matter, and they are the ones a perf switch gets
 * wrong: it must fail CLOSED (anything short of an explicit ask keeps the proven path), and when
 * it is on the writes must still go through `Save()` rather than around it.
 */
import { describe, it, expect } from 'vitest';
import { IntegrationEngine } from '../IntegrationEngine.js';
import type { MJCompanyIntegrationEntity } from '@memberjunction/core-entities';

/** Reaches the private reader the batch path uses. Named rather than cast to `any`. */
type WriteModeReader = { ReadWriteMode: (ci: MJCompanyIntegrationEntity) => string };
const readMode = (configuration: unknown): string => {
    const engine = Object.create(IntegrationEngine.prototype) as unknown as WriteModeReader;
    const ci = { Get: (f: string) => (f === 'Configuration' ? configuration : undefined) } as unknown as MJCompanyIntegrationEntity;
    return engine.ReadWriteMode(ci);
};

describe('ReadWriteMode — the opt-in must fail closed', () => {
    it('reads an explicit ask', () => {
        expect(readMode(JSON.stringify({ writeMode: 'batched' }))).toBe('batched');
    });

    it('returns nothing when the connection said nothing', () => {
        expect(readMode(null)).toBe('');
        expect(readMode(undefined)).toBe('');
        expect(readMode('')).toBe('');
        expect(readMode('{}')).toBe('');
    });

    it('returns nothing for unparseable configuration rather than throwing into the sync', () => {
        // A connection whose Configuration is malformed must not fail its sync over a perf switch.
        expect(readMode('{ not json')).toBe('');
    });

    it('returns nothing when writeMode is the wrong TYPE', () => {
        // `writeMode: true` is not an ask for batched writes, and must not be read as one.
        expect(readMode(JSON.stringify({ writeMode: true }))).toBe('');
        expect(readMode(JSON.stringify({ writeMode: 1 }))).toBe('');
        expect(readMode(JSON.stringify({ writeMode: { on: true } }))).toBe('');
    });

    it('does not treat an unrecognised mode as batched', () => {
        // Only the exact string switches the path; the batch site compares === 'batched'.
        expect(readMode(JSON.stringify({ writeMode: 'bulk' }))).toBe('bulk');
        expect(readMode(JSON.stringify({ writeMode: 'BATCHED' }))).toBe('BATCHED');
    });
});
