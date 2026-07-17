import { describe, it, expect } from 'vitest';
import { IsTierEnabled, TIER_ENV_GATE } from '../tiers';

describe('IsTierEnabled', () => {
    it('deterministic is always enabled regardless of env', () => {
        expect(IsTierEnabled('deterministic', {})).toBe(true);
        expect(IsTierEnabled('deterministic', { RUN_MUTATION_TESTS: '0' })).toBe(true);
        expect(IsTierEnabled('deterministic', { RUN_MUTATION_TESTS: '1', RUN_AGENT_TESTS: '1' })).toBe(true);
    });

    it('mutation requires RUN_MUTATION_TESTS === "1" (only "1", not "true")', () => {
        expect(IsTierEnabled('mutation', {})).toBe(false);
        expect(IsTierEnabled('mutation', { RUN_MUTATION_TESTS: 'true' })).toBe(false);
        expect(IsTierEnabled('mutation', { RUN_MUTATION_TESTS: '0' })).toBe(false);
        expect(IsTierEnabled('mutation', { RUN_MUTATION_TESTS: '1' })).toBe(true);
    });

    it('live-model requires RUN_AGENT_TESTS === "1"', () => {
        expect(IsTierEnabled('live-model', {})).toBe(false);
        expect(IsTierEnabled('live-model', { RUN_AGENT_TESTS: 'yes' })).toBe(false);
        expect(IsTierEnabled('live-model', { RUN_AGENT_TESTS: '1' })).toBe(true);
    });

    it('TIER_ENV_GATE maps each tier to its gate var (deterministic ungated)', () => {
        expect(TIER_ENV_GATE.deterministic).toBe(null);
        expect(TIER_ENV_GATE.mutation).toBe('RUN_MUTATION_TESTS');
        expect(TIER_ENV_GATE['live-model']).toBe('RUN_AGENT_TESTS');
    });
});
