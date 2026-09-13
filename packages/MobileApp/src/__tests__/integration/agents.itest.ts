/**
 * Integration: agents service against the live backend.
 *
 * LoadAgents() returns active top-level agents; the seed data includes the
 * "Sage" orchestrator and "Skip". ResolveTargetAgent() should route an
 * "@sage ..." mention to Sage.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { initLiveProvider, hasToken } from './setup-live';
import { LoadAgents, ResolveTargetAgent } from '@/data/services/agents';

describe.skipIf(!hasToken())('integration: agents', () => {
    beforeAll(async () => {
        await initLiveProvider();
    });

    it('LoadAgents returns active agents including Sage and Skip', async () => {
        const agents = await LoadAgents();
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

    it('ResolveTargetAgent("@sage hi") resolves to Sage', async () => {
        const resolved = await ResolveTargetAgent('@sage hi there');
        expect(resolved).not.toBeNull();
        expect(resolved!.name).toBe('Sage');
    });

    it('ResolveTargetAgent falls back to a default when no mention matches', async () => {
        const resolved = await ResolveTargetAgent('just a plain message with no mention');
        // Non-null: there is at least one active agent (Skip is preferred by the fallback).
        expect(resolved).not.toBeNull();
    });
});
