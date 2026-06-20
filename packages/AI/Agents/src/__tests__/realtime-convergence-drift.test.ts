/**
 * @fileoverview Drift-protection tests for the realtime core ↔ host convergence
 * (`plans/realtime/realtime-core-host-convergence.md`).
 *
 * These guard the invariants that make the realtime co-agent the SAME agent on every host (native chat,
 * LiveKit, future Zoom/Teams) — so a future change can't silently re-introduce the drift the convergence
 * removed. They are pure-function tests (no DB / SDK / session), deliberately fast and deterministic.
 *
 * The invariants:
 *   1. **Identity** — the ONE framing producer speaks first-person AS the TARGET, never the co-agent.
 *   2. **Precedence** — the ONE config cascade resolves model + voice as
 *      type-default < co-agent < target < runtime-override, identically for every host.
 *   3. **Delegation** — `invoke-target-agent` is always named in the framing (core capability, not UX).
 *   4. **Override envelope** — the server-side override builder emits the one pinned shape every host uses.
 */
import { describe, it, expect } from 'vitest';
import { BuildRealtimeAgentFraming, INVOKE_TARGET_AGENT_TOOL_NAME } from '../realtime/realtime-tool-broker';
import {
    ResolveEffectiveRealtimeConfig,
    BuildRealtimeOverridesJson,
    GetProviderVoiceSettings,
} from '../realtime/realtime-coagent-config';

// Helpers to build the per-layer TypeConfiguration JSON the cascade consumes.
const cfg = (modelPreference?: string, voice?: string): string =>
    JSON.stringify({
        realtime: {
            ...(modelPreference ? { modelPreference } : {}),
            ...(voice ? { voice: { providers: { openai: { voice } } } } : {}),
        },
    });

describe('Realtime convergence — drift protection', () => {
    // ── Invariant 1 + 3: identity framing ────────────────────────────────────────────────────────────
    describe('identity framing (single producer)', () => {
        it('frames first-person AS the target agent, never as the co-agent', () => {
            const framing = BuildRealtimeAgentFraming('Marketing Agent');
            expect(framing).toContain('voice for the agent "Marketing Agent"');
            expect(framing).toContain('FIRST PERSON as Marketing Agent');
            // The co-agent name must NEVER be the spoken identity.
            expect(framing).not.toContain('Realtime Co-Agent');
            expect(framing).not.toContain('Sage');
        });

        it('always names invoke-target-agent (delegation is a core capability, not UX)', () => {
            expect(BuildRealtimeAgentFraming('Anyone')).toContain(INVOKE_TARGET_AGENT_TOOL_NAME);
            // Even with no interactive-surface clause (a pure-voice bridge host).
            expect(BuildRealtimeAgentFraming('Anyone', '')).toContain(INVOKE_TARGET_AGENT_TOOL_NAME);
        });

        it('appends the host interactive-surface clause verbatim (host-specific, additive)', () => {
            const clause = ' ONE EXCEPTION: you may drive browser_* yourself.';
            expect(BuildRealtimeAgentFraming('X', clause)).toContain(clause);
            // Pure-voice hosts (LiveKit today) get NO surface clause.
            expect(BuildRealtimeAgentFraming('X')).not.toContain('ONE EXCEPTION');
        });
    });

    // ── Invariant 2: precedence cascade (the anti-drift workhorse) ────────────────────────────────────
    describe('precedence cascade (single resolver)', () => {
        it('model preference: runtime override > target > co-agent > type-default', () => {
            const typeDefault = cfg('type-model');
            const coAgent = cfg('coagent-model');
            const target = cfg('target-model');
            const override = cfg('override-model');

            // All four layers → runtime override wins.
            expect(ResolveEffectiveRealtimeConfig(typeDefault, coAgent, override, target).realtime?.modelPreference)
                .toBe('override-model');
            // No override → the TARGET wins over the co-agent.
            expect(ResolveEffectiveRealtimeConfig(typeDefault, coAgent, null, target).realtime?.modelPreference)
                .toBe('target-model');
            // No override, no target → the co-agent wins over the type default.
            expect(ResolveEffectiveRealtimeConfig(typeDefault, coAgent, null, null).realtime?.modelPreference)
                .toBe('coagent-model');
            // Only the type default present.
            expect(ResolveEffectiveRealtimeConfig(typeDefault, null, null, null).realtime?.modelPreference)
                .toBe('type-model');
        });

        it('voice: runtime override > target > co-agent (same cascade, resolved via the provider settings)', () => {
            const coAgent = cfg(undefined, 'alloy');
            const target = cfg(undefined, 'echo');
            const override = cfg(undefined, 'shimmer');
            const voiceOf = (c: ReturnType<typeof ResolveEffectiveRealtimeConfig>) =>
                (GetProviderVoiceSettings(c, 'OpenAIRealtime') as { voice?: string } | null)?.voice;

            expect(voiceOf(ResolveEffectiveRealtimeConfig(null, coAgent, override, target))).toBe('shimmer'); // override
            expect(voiceOf(ResolveEffectiveRealtimeConfig(null, coAgent, null, target))).toBe('echo');        // target
            expect(voiceOf(ResolveEffectiveRealtimeConfig(null, coAgent, null, null))).toBe('alloy');         // co-agent
        });

        it('the target layer is BACKWARD-COMPATIBLE (omitted 4th arg == no target layer)', () => {
            // Existing 3-arg callers must behave exactly as before — the target layer is purely additive.
            const threeArg = ResolveEffectiveRealtimeConfig(cfg('t'), cfg('co'), cfg('ov'));
            const fourArgNoTarget = ResolveEffectiveRealtimeConfig(cfg('t'), cfg('co'), cfg('ov'), null);
            expect(threeArg).toEqual(fourArgNoTarget);
            expect(threeArg.realtime?.modelPreference).toBe('ov');
        });
    });

    // ── Invariant 4: the one override envelope every host emits ───────────────────────────────────────
    describe('runtime-override envelope (one shape, server + client)', () => {
        it('builds the pinned {realtime:{modelPreference,voice:{providers:{openai:{voice}}}}} shape', () => {
            expect(JSON.parse(BuildRealtimeOverridesJson('m', 'echo')!)).toEqual({
                realtime: { modelPreference: 'm', voice: { providers: { openai: { voice: 'echo' } } } },
            });
            expect(JSON.parse(BuildRealtimeOverridesJson(null, 'echo')!)).toEqual({
                realtime: { voice: { providers: { openai: { voice: 'echo' } } } },
            });
            expect(JSON.parse(BuildRealtimeOverridesJson('m', null)!)).toEqual({
                realtime: { modelPreference: 'm' },
            });
        });

        it('returns null when nothing is overridden (cascade stays at its lower layers)', () => {
            expect(BuildRealtimeOverridesJson(null, null)).toBeNull();
            expect(BuildRealtimeOverridesJson('  ', '  ')).toBeNull();
        });

        it('round-trips through the cascade as the highest-precedence layer', () => {
            // A picker override must beat both the co-agent AND the target config.
            const overrideJson = BuildRealtimeOverridesJson('picked-model', 'verse')!;
            const eff = ResolveEffectiveRealtimeConfig(null, cfg('co', 'alloy'), overrideJson, cfg('tgt', 'echo'));
            expect(eff.realtime?.modelPreference).toBe('picked-model');
            expect((GetProviderVoiceSettings(eff, 'OpenAIRealtime') as { voice?: string }).voice).toBe('verse');
        });
    });
});
