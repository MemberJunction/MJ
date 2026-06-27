/**
 * @fileoverview Tests for the Move 4 additions to the realtime co-agent config cascade:
 * delegation disclosure, the union-accumulated allowedAgents set, the app cascade layer,
 * and the BuildAppRealtimeOverridesJson mapper. All pure — no DB, no provider.
 */
import { describe, it, expect } from 'vitest';
import {
    ResolveEffectiveRealtimeConfig,
    accumulateAllowedAgents,
    GetEffectiveDisclosure,
    GetDisclosureForTarget,
    BuildAppRealtimeOverridesJson,
    RealtimeAllowedAgent,
} from '../realtime/realtime-coagent-config';
import { BuildRealtimeAgentFraming, BuildColleaguesClause } from '../realtime/realtime-tool-broker';

const layer = (allowedAgents: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    realtime: { allowedAgents, ...extra },
});

describe('accumulateAllowedAgents', () => {
    it('unions across layers and dedupes by agentId (case-insensitive)', () => {
        const result = accumulateAllowedAgents([
            layer([{ agentId: 'A1', label: 'Sage' }]),
            layer([{ agentId: 'a1' }, { agentId: 'A2', label: 'Skip' }]),
        ]);
        expect(result.map(a => a.agentId.toLowerCase()).sort()).toEqual(['a1', 'a2']);
    });

    it('merges per-entry fields, later layer wins on set keys but keeps earlier ones', () => {
        const result = accumulateAllowedAgents([
            layer([{ agentId: 'A1', label: 'Sage' }]),
            layer([{ agentId: 'A1', disclosure: 'silent' }]),
        ]);
        expect(result).toHaveLength(1);
        expect(result[0].label).toBe('Sage');         // kept from earlier layer
        expect(result[0].disclosure).toBe('silent');  // added by later layer
    });

    it('accumulates dynamic entries last (highest precedence)', () => {
        const dynamic: RealtimeAllowedAgent[] = [{ agentId: 'A1', disclosure: 'mention' }];
        const result = accumulateAllowedAgents([layer([{ agentId: 'A1', disclosure: 'silent' }])], dynamic);
        expect(result[0].disclosure).toBe('mention');
    });

    it('ignores invalid entries and non-array allowedAgents', () => {
        const result = accumulateAllowedAgents([
            layer('not-an-array'),
            layer([{ label: 'no-id' }, { agentId: '' }, 42, { agentId: 'Good' }]),
        ]);
        expect(result.map(a => a.agentId)).toEqual(['Good']);
    });

    it('returns empty when no layers carry allowedAgents', () => {
        expect(accumulateAllowedAgents([{ realtime: {} }, null, undefined])).toEqual([]);
    });
});

describe('ResolveEffectiveRealtimeConfig — app layer + disclosure + allowedAgents', () => {
    it('app layer disclosure overrides the agent layer (scalar cascade)', () => {
        const cfg = ResolveEffectiveRealtimeConfig(
            JSON.stringify({ realtime: { disclosure: 'mention' } }), // type default
            JSON.stringify({ realtime: { disclosure: 'silent' } }),  // co-agent
            null,                                                    // override
            null,                                                    // target
            JSON.stringify({ realtime: { disclosure: 'hand-voice' } }), // app
        );
        expect(cfg.realtime?.disclosure).toBe('hand-voice');
    });

    it('runtime override beats the app layer', () => {
        const cfg = ResolveEffectiveRealtimeConfig(
            null,
            JSON.stringify({ realtime: { disclosure: 'silent' } }),
            JSON.stringify({ realtime: { disclosure: 'mention' } }),  // override
            null,
            JSON.stringify({ realtime: { disclosure: 'hand-voice' } }), // app
        );
        expect(cfg.realtime?.disclosure).toBe('mention');
    });

    it('unions allowedAgents from agent + app + dynamic rather than replacing', () => {
        const cfg = ResolveEffectiveRealtimeConfig(
            null,
            JSON.stringify({ realtime: { allowedAgents: [{ agentId: 'A1' }] } }),
            null,
            null,
            JSON.stringify({ realtime: { allowedAgents: [{ agentId: 'A2' }] } }),
            [{ agentId: 'A3' }],
        );
        expect(cfg.realtime?.allowedAgents?.map(a => a.agentId).sort()).toEqual(['A1', 'A2', 'A3']);
    });

    it('drops an invalid disclosure value during normalization', () => {
        const cfg = ResolveEffectiveRealtimeConfig(
            JSON.stringify({ realtime: { disclosure: 'bogus' } }),
            null,
            null,
        );
        expect(cfg.realtime?.disclosure).toBeUndefined();
    });
});

describe('GetEffectiveDisclosure / GetDisclosureForTarget', () => {
    it('defaults to mention when unset', () => {
        expect(GetEffectiveDisclosure({})).toBe('mention');
        expect(GetEffectiveDisclosure(null)).toBe('mention');
    });

    it('returns the configured default disclosure', () => {
        expect(GetEffectiveDisclosure({ realtime: { disclosure: 'silent' } })).toBe('silent');
    });

    it('per-target override beats the default; falls back otherwise', () => {
        const cfg = {
            realtime: {
                disclosure: 'mention' as const,
                allowedAgents: [{ agentId: 'A1', disclosure: 'silent' as const }, { agentId: 'A2' }],
            },
        };
        expect(GetDisclosureForTarget(cfg, 'A1')).toBe('silent');  // per-target override
        expect(GetDisclosureForTarget(cfg, 'A2')).toBe('mention'); // falls back to default
        expect(GetDisclosureForTarget(cfg, 'unknown')).toBe('mention');
    });
});

describe('BuildAppRealtimeOverridesJson', () => {
    it('maps Disclosure / Persona / ModelPreference / RelevantAgents into the canonical shape', () => {
        const json = BuildAppRealtimeOverridesJson(
            { Disclosure: 'silent', Persona: { Tone: 'warm', SpeakingStyle: 'concise' }, ModelPreference: 'gpt-realtime' },
            [{ agentId: 'A1', label: 'Skip' }],
        );
        const parsed = JSON.parse(json!);
        expect(parsed.realtime.disclosure).toBe('silent');
        expect(parsed.realtime.voice.default).toEqual({ tone: 'warm', speakingStyle: 'concise' });
        expect(parsed.realtime.modelPreference).toBe('gpt-realtime');
        expect(parsed.realtime.allowedAgents).toEqual([{ agentId: 'A1', label: 'Skip' }]);
    });

    it('returns null when nothing was supplied', () => {
        expect(BuildAppRealtimeOverridesJson(null, null)).toBeNull();
        expect(BuildAppRealtimeOverridesJson({}, [])).toBeNull();
    });

    it('round-trips through ResolveEffectiveRealtimeConfig as the app layer', () => {
        const appJson = BuildAppRealtimeOverridesJson({ Disclosure: 'hand-voice' }, [{ agentId: 'A9' }]);
        const cfg = ResolveEffectiveRealtimeConfig(null, null, null, null, appJson);
        expect(cfg.realtime?.disclosure).toBe('hand-voice');
        expect(cfg.realtime?.allowedAgents?.map(a => a.agentId)).toEqual(['A9']);
    });
});

describe('BuildRealtimeAgentFraming / BuildColleaguesClause', () => {
    it('produces classic single-target framing when no colleagues are supplied', () => {
        const a = BuildRealtimeAgentFraming('Sage');
        const b = BuildRealtimeAgentFraming('Sage', '', []);
        expect(a).toBe(b); // byte-identical — additive change is safe for existing callers
        expect(a).toContain('You are the real-time voice for the agent "Sage"');
        expect(a).not.toContain('colleagues');
    });

    it('appends a colleagues clause with per-target disclosure guidance', () => {
        const framing = BuildRealtimeAgentFraming('Sage', '', [
            { name: 'Skip', description: 'data analysis', disclosure: 'mention' },
            { name: 'Cleaner', disclosure: 'silent' },
        ]);
        expect(framing).toContain('Your colleagues:');
        expect(framing).toContain('"Skip" — data analysis');
        expect(framing).toContain('let me get Skip on this');     // mention guidance
        expect(framing).toContain('speak their result as your own'); // silent guidance
    });

    it('returns empty clause for no colleagues', () => {
        expect(BuildColleaguesClause([])).toBe('');
    });

    it('renders hand-voice guidance', () => {
        expect(BuildColleaguesClause([{ name: 'Skip', disclosure: 'hand-voice' }]))
            .toContain('hand the conversation over to them');
    });
});
