import { describe, it, expect } from 'vitest';
import { isOracleAdvisory, partitionGatingOracles } from '../test-driver/oracle-scoring.js';
import type { OracleResult } from '@memberjunction/testing-engine';

function res(oracleType: string, passed: boolean, advisory?: boolean): OracleResult {
    return { oracleType, passed, score: passed ? 1 : 0, message: '', advisory };
}

describe('oracle-scoring', () => {
    describe('isOracleAdvisory', () => {
        it('defaults step-count to advisory', () => {
            expect(isOracleAdvisory('step-count')).toBe(true);
        });

        it('defaults other oracle types to gating', () => {
            expect(isOracleAdvisory('goal-completion')).toBe(false);
            expect(isOracleAdvisory('url-match')).toBe(false);
        });

        it('lets an explicit config value override the type default', () => {
            // Force step-count to gate…
            expect(isOracleAdvisory('step-count', false)).toBe(false);
            // …and force a normally-gating oracle to advisory.
            expect(isOracleAdvisory('goal-completion', true)).toBe(true);
        });
    });

    describe('partitionGatingOracles', () => {
        it('excludes advisory results from the gating set', () => {
            const results = [
                res('goal-completion', true),
                res('step-count', false, true),
                res('url-match', true, false),
            ];
            const gating = partitionGatingOracles(results);
            expect(gating.map(r => r.oracleType)).toEqual(['goal-completion', 'url-match']);
        });

        it('treats a missing advisory flag as gating', () => {
            const results = [res('goal-completion', true)];
            expect(partitionGatingOracles(results)).toHaveLength(1);
        });

        it('returns empty when every oracle is advisory (caller falls back)', () => {
            const results = [res('step-count', false, true)];
            expect(partitionGatingOracles(results)).toHaveLength(0);
        });

        it('a failing advisory oracle does not appear among gating results', () => {
            // The scenario this fixes: step-count "fails" but must not gate.
            const results = [res('goal-completion', true), res('step-count', false, true)];
            const gating = partitionGatingOracles(results);
            expect(gating.every(r => r.passed)).toBe(true);
        });
    });
});
