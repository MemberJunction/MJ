/**
 * Unit tests for the PURE realtime co-agent configuration module
 * (`realtime/realtime-coagent-config.ts`): deep merge, tolerant parsing, effective-config
 * resolution/normalization, provider voice matching, prompt-section building, narration pace,
 * and the runtime-override authorization matrix.
 */
import { describe, it, expect } from 'vitest';
import {
    DeepMergeConfigs,
    ParseRealtimeTypeConfiguration,
    ResolveEffectiveRealtimeConfig,
    GetProviderVoiceSettings,
    BuildVoiceMannerSection,
    GetNarrationPaceMs,
    EvaluateRuntimeOverrideAuthorization,
    REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION,
    RealtimeCoAgentConfig
} from '../realtime/realtime-coagent-config';

describe('DeepMergeConfigs', () => {
    it('returns an empty object for no layers / all-null layers', () => {
        expect(DeepMergeConfigs()).toEqual({});
        expect(DeepMergeConfigs(null, undefined, null)).toEqual({});
    });

    it('deep-merges nested plain objects with later layers winning per key', () => {
        const base = { realtime: { modelPreference: 'A', narration: { paceMs: 8000 } } };
        const agent = { realtime: { modelPreference: 'B', voice: { default: { tone: 'warm' } } } };
        expect(DeepMergeConfigs(base, agent)).toEqual({
            realtime: {
                modelPreference: 'B',
                narration: { paceMs: 8000 },
                voice: { default: { tone: 'warm' } }
            }
        });
    });

    it('replaces arrays wholesale (no element merge)', () => {
        const merged = DeepMergeConfigs({ a: [1, 2, 3] }, { a: [9] });
        expect(merged).toEqual({ a: [9] });
    });

    it('replaces primitives and object→primitive / primitive→object transitions', () => {
        expect(DeepMergeConfigs({ a: { b: 1 } }, { a: 'flat' })).toEqual({ a: 'flat' });
        expect(DeepMergeConfigs({ a: 'flat' }, { a: { b: 1 } })).toEqual({ a: { b: 1 } });
    });

    it('treats null as a real value that replaces', () => {
        expect(DeepMergeConfigs({ a: { b: 1 } }, { a: null })).toEqual({ a: null });
    });

    it('skips undefined values in a later layer', () => {
        expect(DeepMergeConfigs({ a: 1 }, { a: undefined as unknown as number })).toEqual({ a: 1 });
    });

    it('never mutates the input layers and never aliases nested objects/arrays', () => {
        const base = { realtime: { voice: { providers: { openai: { voice: 'alloy' } } } } };
        const overlay = { realtime: { narration: { paceMs: 5000 } }, list: [1, 2] };
        const merged = DeepMergeConfigs(base, overlay);

        (merged['realtime'] as Record<string, unknown>)['mutated'] = true;
        (merged['list'] as number[]).push(99);

        expect(base.realtime).not.toHaveProperty('mutated');
        expect(overlay.realtime).not.toHaveProperty('mutated');
        expect(overlay.list).toEqual([1, 2]);
    });

    it('merges three layers in order (type default ← agent ← runtime)', () => {
        const merged = DeepMergeConfigs(
            { realtime: { modelPreference: 'type-model', allowUserModelOverride: true } },
            { realtime: { modelPreference: 'agent-model' } },
            { realtime: { modelPreference: 'runtime-model' } }
        );
        expect(merged).toEqual({ realtime: { modelPreference: 'runtime-model', allowUserModelOverride: true } });
    });
});

describe('ParseRealtimeTypeConfiguration', () => {
    it('parses a valid JSON object', () => {
        expect(ParseRealtimeTypeConfiguration('{"realtime":{}}')).toEqual({ realtime: {} });
    });

    it('returns null for null / undefined / blank input', () => {
        expect(ParseRealtimeTypeConfiguration(null)).toBeNull();
        expect(ParseRealtimeTypeConfiguration(undefined)).toBeNull();
        expect(ParseRealtimeTypeConfiguration('   ')).toBeNull();
        expect(ParseRealtimeTypeConfiguration('')).toBeNull();
    });

    it('returns null (never throws) for malformed JSON', () => {
        expect(ParseRealtimeTypeConfiguration('{not json')).toBeNull();
    });

    it('returns null for non-object JSON (arrays and scalars are not config layers)', () => {
        expect(ParseRealtimeTypeConfiguration('[1,2]')).toBeNull();
        expect(ParseRealtimeTypeConfiguration('"string"')).toBeNull();
        expect(ParseRealtimeTypeConfiguration('42')).toBeNull();
        expect(ParseRealtimeTypeConfiguration('null')).toBeNull();
    });
});

describe('ResolveEffectiveRealtimeConfig', () => {
    const TYPE_DEFAULT = JSON.stringify({
        realtime: {
            modelPreference: 'GPT Realtime',
            allowUserModelOverride: true,
            voice: { default: { tone: 'neutral' }, providers: { openai: { voice: 'alloy' } } },
            narration: { paceMs: 8000 }
        }
    });
    const AGENT = JSON.stringify({
        realtime: {
            voice: { default: { tone: 'warm and upbeat', speakingStyle: 'short sentences' } },
            narration: { paceMs: 5000 }
        }
    });
    const OVERRIDES = JSON.stringify({ realtime: { modelPreference: 'model-id-123', narration: { paceMs: 3000 } } });

    it('merges all three layers with later layers winning per key', () => {
        const cfg = ResolveEffectiveRealtimeConfig(TYPE_DEFAULT, AGENT, OVERRIDES);
        expect(cfg.realtime?.modelPreference).toBe('model-id-123');
        expect(cfg.realtime?.allowUserModelOverride).toBe(true);
        expect(cfg.realtime?.voice?.default).toEqual({ tone: 'warm and upbeat', speakingStyle: 'short sentences' });
        expect(cfg.realtime?.voice?.providers).toEqual({ openai: { voice: 'alloy' } });
        expect(cfg.realtime?.narration?.paceMs).toBe(3000);
    });

    it('works with only the agent layer', () => {
        const cfg = ResolveEffectiveRealtimeConfig(null, AGENT, null);
        expect(cfg.realtime?.voice?.default?.tone).toBe('warm and upbeat');
        expect(cfg.realtime?.modelPreference).toBeUndefined();
    });

    it('returns an empty config when every layer is absent or malformed', () => {
        expect(ResolveEffectiveRealtimeConfig(null, null, null)).toEqual({});
        expect(ResolveEffectiveRealtimeConfig('{bad', '[]', '"x"')).toEqual({});
    });

    it('drops wrong-typed fields during normalization instead of throwing', () => {
        const cfg = ResolveEffectiveRealtimeConfig(
            null,
            JSON.stringify({
                realtime: {
                    modelPreference: 42,
                    allowUserModelOverride: 'yes',
                    voice: { default: { tone: 7, speakingStyle: '   ' }, providers: { openai: 'alloy' } },
                    narration: { paceMs: -100 }
                }
            }),
            null
        );
        expect(cfg.realtime).toEqual({});
    });

    it('floors a fractional paceMs and rejects non-finite values', () => {
        const ok = ResolveEffectiveRealtimeConfig(null, JSON.stringify({ realtime: { narration: { paceMs: 4999.9 } } }), null);
        expect(ok.realtime?.narration?.paceMs).toBe(4999);
        const bad = ResolveEffectiveRealtimeConfig(null, JSON.stringify({ realtime: { narration: { paceMs: 'fast' } } }), null);
        expect(bad.realtime?.narration).toBeUndefined();
    });

    it('trims whitespace on modelPreference and persona strings', () => {
        const cfg = ResolveEffectiveRealtimeConfig(
            null,
            JSON.stringify({ realtime: { modelPreference: '  GPT Realtime  ', voice: { default: { tone: ' warm ' } } } }),
            null
        );
        expect(cfg.realtime?.modelPreference).toBe('GPT Realtime');
        expect(cfg.realtime?.voice?.default?.tone).toBe('warm');
    });

    it('honors allowUserModelOverride=false from a later layer over true from an earlier one', () => {
        const cfg = ResolveEffectiveRealtimeConfig(
            JSON.stringify({ realtime: { allowUserModelOverride: true } }),
            JSON.stringify({ realtime: { allowUserModelOverride: false } }),
            null
        );
        expect(cfg.realtime?.allowUserModelOverride).toBe(false);
    });
});

describe('GetProviderVoiceSettings', () => {
    const CONFIG: RealtimeCoAgentConfig = {
        realtime: {
            voice: {
                providers: {
                    openai: { voice: 'alloy' },
                    elevenlabs: { voiceId: 'el-1' },
                    gemini: { voice: 'Puck' },
                    assemblyai: { voice: 'nova' }
                }
            }
        }
    };

    it('matches a DriverClass by normalized prefix for every seeded provider', () => {
        expect(GetProviderVoiceSettings(CONFIG, 'OpenAIRealtime')).toEqual({ voice: 'alloy' });
        expect(GetProviderVoiceSettings(CONFIG, 'ElevenLabsRealtime')).toEqual({ voiceId: 'el-1' });
        expect(GetProviderVoiceSettings(CONFIG, 'GeminiRealtime')).toEqual({ voice: 'Puck' });
        expect(GetProviderVoiceSettings(CONFIG, 'AssemblyAIRealtime')).toEqual({ voice: 'nova' });
    });

    it('matches a bare provider key (e.g. ClientRealtimeSessionConfig.Provider)', () => {
        expect(GetProviderVoiceSettings(CONFIG, 'openai')).toEqual({ voice: 'alloy' });
    });

    it('is case- and punctuation-insensitive', () => {
        expect(GetProviderVoiceSettings(CONFIG, 'eleven-labs-realtime')).toEqual({ voiceId: 'el-1' });
        expect(GetProviderVoiceSettings(CONFIG, 'OPENAI_REALTIME')).toEqual({ voice: 'alloy' });
    });

    it('prefers the LONGEST matching key when several match', () => {
        const cfg: RealtimeCoAgentConfig = {
            realtime: { voice: { providers: { open: { voice: 'generic' }, openai: { voice: 'alloy' } } } }
        };
        expect(GetProviderVoiceSettings(cfg, 'OpenAIRealtime')).toEqual({ voice: 'alloy' });
    });

    it('returns null when no provider matches / no providers / no config', () => {
        expect(GetProviderVoiceSettings(CONFIG, 'AcmeRealtime')).toBeNull();
        expect(GetProviderVoiceSettings({}, 'OpenAIRealtime')).toBeNull();
        expect(GetProviderVoiceSettings(null, 'OpenAIRealtime')).toBeNull();
        expect(GetProviderVoiceSettings(CONFIG, null)).toBeNull();
        expect(GetProviderVoiceSettings(CONFIG, '')).toBeNull();
    });
});

describe('BuildVoiceMannerSection', () => {
    it('builds a section with tone and speaking style', () => {
        const section = BuildVoiceMannerSection({
            realtime: { voice: { default: { tone: 'warm', speakingStyle: 'concise' } } }
        });
        expect(section).toBe('Voice & manner:\nTone: warm\nSpeaking style: concise');
    });

    it('builds a tone-only / style-only section', () => {
        expect(BuildVoiceMannerSection({ realtime: { voice: { default: { tone: 'warm' } } } }))
            .toBe('Voice & manner:\nTone: warm');
        expect(BuildVoiceMannerSection({ realtime: { voice: { default: { speakingStyle: 'concise' } } } }))
            .toBe('Voice & manner:\nSpeaking style: concise');
    });

    it('returns empty string when no persona is configured', () => {
        expect(BuildVoiceMannerSection({})).toBe('');
        expect(BuildVoiceMannerSection(null)).toBe('');
        expect(BuildVoiceMannerSection({ realtime: { voice: {} } })).toBe('');
    });
});

describe('GetNarrationPaceMs', () => {
    it('returns the configured pace', () => {
        expect(GetNarrationPaceMs({ realtime: { narration: { paceMs: 6000 } } })).toBe(6000);
    });

    it('returns null when not configured', () => {
        expect(GetNarrationPaceMs({})).toBeNull();
        expect(GetNarrationPaceMs(null)).toBeNull();
        expect(GetNarrationPaceMs(undefined)).toBeNull();
    });
});

describe('EvaluateRuntimeOverrideAuthorization — the authorization matrix', () => {
    it('allows a plain start (no overrides, no model) regardless of authorization', () => {
        for (const has of [true, false]) {
            const d = EvaluateRuntimeOverrideAuthorization({ HasConfigOverrides: false, CallerHasAdvancedControls: has });
            expect(d.Allowed).toBe(true);
        }
    });

    it('denies configOverridesJson without the authorization (names the authorization)', () => {
        const d = EvaluateRuntimeOverrideAuthorization({ HasConfigOverrides: true, CallerHasAdvancedControls: false });
        expect(d.Allowed).toBe(false);
        expect(d.DenialReason).toContain(REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION);
    });

    it('allows configOverridesJson with the authorization', () => {
        const d = EvaluateRuntimeOverrideAuthorization({ HasConfigOverrides: true, CallerHasAdvancedControls: true });
        expect(d.Allowed).toBe(true);
    });

    it('denies a DEVIATING explicit model without the authorization', () => {
        const d = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: false,
            RequestedModelID: 'model-b',
            MetadataPreferredModelID: 'model-a',
            CallerHasAdvancedControls: false
        });
        expect(d.Allowed).toBe(false);
        expect(d.DenialReason).toContain(REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION);
    });

    it('allows an explicit model that EQUALS the metadata preference (no deviation), unauthorized', () => {
        const d = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: false,
            RequestedModelID: 'model-a',
            MetadataPreferredModelID: 'model-a',
            CallerHasAdvancedControls: false
        });
        expect(d.Allowed).toBe(true);
    });

    it('compares model ids case/whitespace-insensitively (SQL Server vs PostgreSQL UUID casing)', () => {
        const d = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: false,
            RequestedModelID: ' ABCDEF00-0000-0000-0000-000000000001 ',
            MetadataPreferredModelID: 'abcdef00-0000-0000-0000-000000000001',
            CallerHasAdvancedControls: false
        });
        expect(d.Allowed).toBe(true);
    });

    it('denies an explicit model when there is NO metadata preference and no authorization', () => {
        const d = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: false,
            RequestedModelID: 'model-b',
            MetadataPreferredModelID: null,
            CallerHasAdvancedControls: false
        });
        expect(d.Allowed).toBe(false);
    });

    it('allows a deviating explicit model for an AUTHORIZED caller when policy permits', () => {
        const d = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: false,
            RequestedModelID: 'model-b',
            MetadataPreferredModelID: 'model-a',
            AllowUserModelOverride: true,
            CallerHasAdvancedControls: true
        });
        expect(d.Allowed).toBe(true);
    });

    it('denies a deviating explicit model when allowUserModelOverride=false, EVEN for authorized callers', () => {
        const d = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: false,
            RequestedModelID: 'model-b',
            MetadataPreferredModelID: 'model-a',
            AllowUserModelOverride: false,
            CallerHasAdvancedControls: true
        });
        expect(d.Allowed).toBe(false);
        expect(d.DenialReason).toContain('allowUserModelOverride');
    });

    it('does NOT apply the allowUserModelOverride policy to a NON-deviating model', () => {
        const d = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: false,
            RequestedModelID: 'model-a',
            MetadataPreferredModelID: 'model-a',
            AllowUserModelOverride: false,
            CallerHasAdvancedControls: false
        });
        expect(d.Allowed).toBe(true);
    });

    it('denies combined overrides + deviating model when only one condition is satisfied', () => {
        // Authorized, but model override disabled by policy: config overrides OK, model NOT.
        const d = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: true,
            RequestedModelID: 'model-b',
            MetadataPreferredModelID: 'model-a',
            AllowUserModelOverride: false,
            CallerHasAdvancedControls: true
        });
        expect(d.Allowed).toBe(false);
        expect(d.DenialReason).toContain('allowUserModelOverride');
    });

    it('treats a blank RequestedModelID as no model override', () => {
        const d = EvaluateRuntimeOverrideAuthorization({
            HasConfigOverrides: false,
            RequestedModelID: '   ',
            MetadataPreferredModelID: null,
            CallerHasAdvancedControls: false
        });
        expect(d.Allowed).toBe(true);
    });
});
