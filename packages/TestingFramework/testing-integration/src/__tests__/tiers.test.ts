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

    it('live-model is ON by default; only an explicit RUN_AGENT_TESTS=0 disables it (2026-07-20 inversion)', () => {
        // The live-model ITs live in their own suite — invoking them is already explicit,
        // so a second env opt-in was a confusing double gate. '1' stays enabled for
        // backward compat with every existing RUN_AGENT_TESTS=1 invocation.
        expect(IsTierEnabled('live-model', {})).toBe(true);
        expect(IsTierEnabled('live-model', { RUN_AGENT_TESTS: '1' })).toBe(true);
        expect(IsTierEnabled('live-model', { RUN_AGENT_TESTS: 'yes' })).toBe(true);
        expect(IsTierEnabled('live-model', { RUN_AGENT_TESTS: '0' })).toBe(false);
    });

    it('TIER_ENV_GATE maps each tier to its gate var (deterministic ungated)', () => {
        expect(TIER_ENV_GATE.deterministic).toBe(null);
        expect(TIER_ENV_GATE.mutation).toBe('RUN_MUTATION_TESTS');
        expect(TIER_ENV_GATE['live-model']).toBe('RUN_AGENT_TESTS');
    });
});
