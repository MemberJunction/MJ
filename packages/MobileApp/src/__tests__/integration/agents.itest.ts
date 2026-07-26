/**
 * Integration: agents service against the live backend.
 *
 * loadAgents() returns active top-level agents; the seed data includes the
 * "Sage" orchestrator and "Skip". resolveTargetAgent() should route an
 * "@sage ..." mention to Sage.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initLiveProvider, hasToken } from './setup-live';
import { loadAgents, resolveTargetAgent } from '@/data/services/agents';

describe.skipIf(!hasToken())('integration: agents', () => {
    beforeAll(async () => {
        await initLiveProvider();
    });

    it('loadAgents returns active agents including Sage and Skip', async () => {
        const agents = await loadAgents();
        expect(agents.length).toBeGreaterThan(0);

        const names = agents.map((a) => a.name);
        expect(names).toContain('Sage');
        expect(names).toContain('Skip');

        // Shape check.
        for (const a of agents) {
            expect(a.id).toBeTruthy();
            expect(typeof a.name).toBe('string');
        }
    });

    it('resolveTargetAgent("@sage hi") resolves to Sage', async () => {
        const resolved = await resolveTargetAgent('@sage hi there');
        expect(resolved).not.toBeNull();
        expect(resolved!.name).toBe('Sage');
    });

    it('resolveTargetAgent falls back to a default when no mention matches', async () => {
        const resolved = await resolveTargetAgent('just a plain message with no mention');
        // Non-null: there is at least one active agent (Skip is preferred by the fallback).
        expect(resolved).not.toBeNull();
    });
});
