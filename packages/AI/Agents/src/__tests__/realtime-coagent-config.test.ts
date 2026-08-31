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
    MatchProviderVoiceSettings,
    GetSessionTuningSettings,
    BuildVoiceMannerSection,
    GetNarrationPaceMs,
    EvaluateRuntimeOverrideAuthorization,
    REALTIME_ADVANCED_SESSION_CONTROLS_AUTHORIZATION,
    RealtimeCoAgentConfig,
    GetEffectiveModeratorConfig,
    GetEffectiveTurnMode,
    GetModelCatalogSessionSettings,
    REALTIME_MODERATOR_DEFAULTS,
    FindIgnoredRealtimeConfigKeys,
    REALTIME_CONFIG_SECTION_KEYS,
    RealtimeConfigSection
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
    /**
     * Round-trips a raw authored config through the SAME cascade the runtime uses. Normalization
     * runs there, not in the raw parse, so a key `normalizeVoice` fails to carry through is
     * silently lost between authoring and the driver — the failure mode these tests guard.
     */
    const normalize = (raw: unknown) => ResolveEffectiveRealtimeConfig(null, JSON.stringify(raw), null);

    const CONFIG: RealtimeCoAgentConfig = {
        realtime: {
            voice: {
                providers: {
                    openai: { voice: 'alloy' },
                    elevenlabs: { voice: 'el-1' },
                    gemini: { voice: 'Puck' },
                    assemblyai: { voice: 'nova' }
                }
            }
        }
    };

    it('matches a DriverClass by normalized prefix for every seeded provider', () => {
        expect(GetProviderVoiceSettings(CONFIG, 'OpenAIRealtime')).toEqual({ voice: 'alloy' });
        expect(GetProviderVoiceSettings(CONFIG, 'ElevenLabsRealtime')).toEqual({ voice: 'el-1' });
        expect(GetProviderVoiceSettings(CONFIG, 'GeminiRealtime')).toEqual({ voice: 'Puck' });
        expect(GetProviderVoiceSettings(CONFIG, 'AssemblyAIRealtime')).toEqual({ voice: 'nova' });
    });

    it('matches a bare provider key (e.g. ClientRealtimeSessionConfig.Provider)', () => {
        expect(GetProviderVoiceSettings(CONFIG, 'openai')).toEqual({ voice: 'alloy' });
    });

    it('is case- and punctuation-insensitive', () => {
        expect(GetProviderVoiceSettings(CONFIG, 'eleven-labs-realtime')).toEqual({ voice: 'el-1' });
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

    // ── Provider-AGNOSTIC voice (issue #3530) ────────────────────────────────────────────────────
    // A host authors `realtime.voice.default.voice` without knowing which vendor will run, and the
    // framework files it onto whichever driver it resolved. Every realtime driver reads the neutral
    // `voice` bag key, so one authored value is consumable by all of them.
    describe('provider-agnostic voice', () => {
        const AGNOSTIC: RealtimeCoAgentConfig = { realtime: { voice: { default: { voice: 'Rachel' } } } };

        it('reaches a driver that has NO provider entry at all', () => {
            expect(GetProviderVoiceSettings(AGNOSTIC, 'ElevenLabsRealtime')).toEqual({ voice: 'Rachel' });
            expect(GetProviderVoiceSettings(AGNOSTIC, 'InworldRealtime')).toEqual({ voice: 'Rachel' });
            expect(GetProviderVoiceSettings(AGNOSTIC, 'OpenAIRealtime')).toEqual({ voice: 'Rachel' });
        });

        it('WINS the voice key over a matching provider entry (a runtime pick must beat authored metadata)', () => {
            // The regression this guards: the picker now emits the agnostic slot, so if a co-agent's
            // pre-existing providers.openai.voice outranked it, the user's explicit choice would be
            // silently ignored on the most common path.
            const both: RealtimeCoAgentConfig = {
                realtime: { voice: { default: { voice: 'verse' }, providers: { openai: { voice: 'alloy' } } } }
            };
            expect(GetProviderVoiceSettings(both, 'OpenAIRealtime')).toEqual({ voice: 'verse' });
        });

        it('leaves the matched provider bag’s OTHER (opaque) keys intact', () => {
            const both: RealtimeCoAgentConfig = {
                realtime: {
                    voice: {
                        default: { voice: 'verse' },
                        providers: { openai: { voice: 'alloy', language: 'en', someOpaqueKnob: 3 } }
                    }
                }
            };
            expect(GetProviderVoiceSettings(both, 'OpenAIRealtime'))
                .toEqual({ voice: 'verse', language: 'en', someOpaqueKnob: 3 });
        });

        it('does NOT mask an unmatched provider bag — the match is separately answerable', () => {
            // The agnostic voice makes GetProviderVoiceSettings truthy for EVERY driver, so it cannot
            // answer "did an authored provider key match?". Callers that need that question (the
            // dropped-settings warning) must ask MatchProviderVoiceSettings, or the warning goes dead
            // on exactly the path that emits an agnostic voice.
            const both: RealtimeCoAgentConfig = {
                realtime: {
                    voice: { default: { voice: 'verse' }, providers: { openai: { voice: 'alloy', language: 'en' } } }
                }
            };
            expect(MatchProviderVoiceSettings(both, 'ElevenLabsRealtime')).toBeNull();
            expect(GetProviderVoiceSettings(both, 'ElevenLabsRealtime')).toEqual({ voice: 'verse' });
            expect(MatchProviderVoiceSettings(both, 'OpenAIRealtime')).toEqual({ voice: 'alloy', language: 'en' });
        });

        it('changes NOTHING when no agnostic voice is authored (every pre-existing config)', () => {
            expect(GetProviderVoiceSettings(CONFIG, 'OpenAIRealtime')).toEqual({ voice: 'alloy' });
            expect(GetProviderVoiceSettings(CONFIG, 'AcmeRealtime')).toBeNull();
            const personaOnly: RealtimeCoAgentConfig = { realtime: { voice: { default: { tone: 'warm' } } } };
            expect(GetProviderVoiceSettings(personaOnly, 'OpenAIRealtime')).toBeNull();
        });

        it('survives normalization (trimmed; blank and non-string dropped)', () => {
            // Normalization runs in the cascade, not in the raw parse — a key normalizeVoice does not
            // carry through is silently lost, which is the exact failure mode this issue is about.
            const parsed = normalize({ realtime: { voice: { default: { tone: 'warm', voice: '  Rachel  ' } } } });
            expect(parsed.realtime?.voice?.default?.voice).toBe('Rachel');
            expect(parsed.realtime?.voice?.default?.tone).toBe('warm');

            expect(normalize({ realtime: { voice: { default: { voice: '   ' } } } })
                .realtime?.voice?.default?.voice).toBeUndefined();
            expect(normalize({ realtime: { voice: { default: { voice: 7 } } } })
                .realtime?.voice?.default?.voice).toBeUndefined();
        });
    });

    // ── Provider-AGNOSTIC first message (issue #3557) ────────────────────────────────────────────
    // The opening utterance the agent speaks before the user says anything. Authored on the persona
    // beside `voice` and filed onto the resolved driver's bag under the same neutral `firstMessage`
    // key, so a host authors "how the session opens" without naming a vendor.
    describe('provider-agnostic first message', () => {
        const AGNOSTIC: RealtimeCoAgentConfig = {
            realtime: { voice: { default: { firstMessage: 'Hi — thanks for making the time.' } } }
        };

        it('reaches a driver that has NO provider entry at all', () => {
            expect(GetProviderVoiceSettings(AGNOSTIC, 'ElevenLabsRealtime'))
                .toEqual({ firstMessage: 'Hi — thanks for making the time.' });
            expect(GetProviderVoiceSettings(AGNOSTIC, 'OpenAIRealtime'))
                .toEqual({ firstMessage: 'Hi — thanks for making the time.' });
        });

        it('rides ALONGSIDE the agnostic voice rather than displacing it', () => {
            const both: RealtimeCoAgentConfig = {
                realtime: { voice: { default: { voice: 'Rachel', firstMessage: 'Hello there.' } } }
            };
            expect(GetProviderVoiceSettings(both, 'ElevenLabsRealtime'))
                .toEqual({ voice: 'Rachel', firstMessage: 'Hello there.' });
        });

        it('WINS the firstMessage key over a matching provider entry', () => {
            const both: RealtimeCoAgentConfig = {
                realtime: {
                    voice: {
                        default: { firstMessage: 'Persona greeting.' },
                        providers: { elevenlabs: { firstMessage: 'Vendor-pinned greeting.', voice: 'el-1' } }
                    }
                }
            };
            expect(GetProviderVoiceSettings(both, 'ElevenLabsRealtime'))
                .toEqual({ firstMessage: 'Persona greeting.', voice: 'el-1' });
        });

        it('changes NOTHING when no agnostic first message is authored (every pre-existing config)', () => {
            expect(GetProviderVoiceSettings(CONFIG, 'OpenAIRealtime')).toEqual({ voice: 'alloy' });
            expect(GetProviderVoiceSettings(CONFIG, 'AcmeRealtime')).toBeNull();
            const personaOnly: RealtimeCoAgentConfig = { realtime: { voice: { default: { tone: 'warm' } } } };
            expect(GetProviderVoiceSettings(personaOnly, 'OpenAIRealtime')).toBeNull();
        });

        it('survives normalization (trimmed; blank and non-string dropped)', () => {
            // Same failure mode as the agnostic voice: a key normalizeVoice does not carry through is
            // silently lost between authoring and the driver.
            expect(normalize({ realtime: { voice: { default: { firstMessage: '  Hello there.  ' } } } })
                .realtime?.voice?.default?.firstMessage).toBe('Hello there.');
            expect(normalize({ realtime: { voice: { default: { firstMessage: '   ' } } } })
                .realtime?.voice?.default?.firstMessage).toBeUndefined();
            expect(normalize({ realtime: { voice: { default: { firstMessage: 7 } } } })
                .realtime?.voice?.default?.firstMessage).toBeUndefined();
        });
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

describe('turnTaking — moderator + mode normalization', () => {
    const wrap = (turnTaking: unknown) => JSON.stringify({ realtime: { turnTaking } });

    it('parses a full moderator block and clamps the context window to 50', () => {
        const cfg = ResolveEffectiveRealtimeConfig(null, null, wrap({
            mode: 'addressed-only',
            moderator: {
                promptId: 'P1', contextWindowTurns: 999, maxCharsPerTurn: 200,
                maxConsecutiveAgentOnlyTurns: 6, timeoutMs: 500, onError: 'addressed-only', prestageOnAgentSpeech: false,
            },
        }));
        expect(cfg.realtime?.turnTaking?.mode).toBe('addressed-only');
        const m = cfg.realtime?.turnTaking?.moderator;
        expect(m).toMatchObject({ promptId: 'P1', contextWindowTurns: 50, maxCharsPerTurn: 200, maxConsecutiveAgentOnlyTurns: 6, timeoutMs: 500, onError: 'addressed-only', prestageOnAgentSpeech: false });
    });

    it('drops invalid mode + invalid moderator fields, keeps the valid ones', () => {
        const cfg = ResolveEffectiveRealtimeConfig(null, null, wrap({
            mode: 'bogus', moderator: { promptId: '  ', contextWindowTurns: -1, onError: 'nope', timeoutMs: 0 },
        }));
        expect(cfg.realtime?.turnTaking ?? null).toBeNull(); // nothing usable survived
    });

    it('honors an explicit null maxConsecutiveAgentOnlyTurns (no cap) distinctly from absent', () => {
        const withNull = ResolveEffectiveRealtimeConfig(null, null, wrap({ moderator: { promptId: 'P', maxConsecutiveAgentOnlyTurns: null } }));
        expect(withNull.realtime?.turnTaking?.moderator?.maxConsecutiveAgentOnlyTurns).toBeNull();
    });

    it('GetEffectiveModeratorConfig fills defaults, returns null without a promptId', () => {
        expect(GetEffectiveModeratorConfig(ResolveEffectiveRealtimeConfig(null, null, wrap({ moderator: { contextWindowTurns: 10 } })))).toBeNull();
        const eff = GetEffectiveModeratorConfig(ResolveEffectiveRealtimeConfig(null, null, wrap({ moderator: { promptId: 'P' } })));
        expect(eff).toEqual({ promptId: 'P', ...REALTIME_MODERATOR_DEFAULTS });
    });

    it('target-agent layer overrides mode while inheriting the type-default moderator (cascade)', () => {
        const typeDefault = JSON.stringify({ realtime: { turnTaking: { moderator: { promptId: 'JUDGE', contextWindowTurns: 25 } } } });
        const targetAgent = JSON.stringify({ realtime: { turnTaking: { mode: 'proactive' } } });
        const cfg = ResolveEffectiveRealtimeConfig(typeDefault, null, null, targetAgent);
        expect(GetEffectiveTurnMode(cfg)).toBe('proactive');
        expect(cfg.realtime?.turnTaking?.moderator?.promptId).toBe('JUDGE');
        expect(cfg.realtime?.turnTaking?.moderator?.contextWindowTurns).toBe(25);
    });

    it('GetEffectiveTurnMode defaults to proactive when unset', () => {
        expect(GetEffectiveTurnMode(ResolveEffectiveRealtimeConfig(null, null, null))).toBe('proactive');
    });
});

describe('C1: GetSessionTuningSettings', () => {
    it('projects every knob onto the flat driver bag keys', () => {
        const bag = GetSessionTuningSettings({
            realtime: {
                session: {
                    effortLevel: 85,
                    parallelToolCalls: false,
                    mcpTools: [{ type: 'mcp', server_label: 'kb', server_url: 'https://mcp.example.com', require_approval: 'never' }],
                    inputTranscriptionModel: '  whisper-1  ',
                },
            },
        });
        expect(bag).toEqual({
            effortLevel: 85,
            parallelToolCalls: false,
            mcpTools: [{ type: 'mcp', server_label: 'kb', server_url: 'https://mcp.example.com', require_approval: 'never' }],
            inputTranscriptionModel: 'whisper-1',
        });
    });

    it('named effort levels pass through as strings', () => {
        expect(GetSessionTuningSettings({ realtime: { session: { effortLevel: 'xhigh' } } })).toEqual({ effortLevel: 'xhigh' });
    });

    it('returns null for an absent/empty section (bag construction skipped byte-for-byte)', () => {
        expect(GetSessionTuningSettings(undefined)).toBeNull();
        expect(GetSessionTuningSettings({})).toBeNull();
        expect(GetSessionTuningSettings({ realtime: {} })).toBeNull();
        expect(GetSessionTuningSettings({ realtime: { session: {} } })).toBeNull();
        expect(GetSessionTuningSettings({ realtime: { session: { mcpTools: [] } } })).toBeNull();
        expect(GetSessionTuningSettings({ realtime: { session: { inputTranscriptionModel: '   ' } } })).toBeNull();
    });
});

describe('turnDetection — the agent/app tuning layer', () => {
    it('projects a normalized block onto the driver bag', () => {
        const bag = GetSessionTuningSettings({
            realtime: { session: { turnDetection: { Mode: 'semanticVad', Eagerness: 'high' } } },
        });
        expect(bag).toEqual({ turnDetection: { Mode: 'semanticVad', Eagerness: 'high' } });
    });

    it('copies rather than aliases, so the projected bag cannot mutate the effective config', () => {
        const config: RealtimeCoAgentConfig = {
            realtime: { session: { turnDetection: { Mode: 'serverVad' } } },
        };
        const bag = GetSessionTuningSettings(config);
        expect(bag?.turnDetection).not.toBe(config.realtime?.session?.turnDetection);
    });

    it('keeps only recognized, correctly-typed knobs when normalizing a raw config layer', () => {
        const effective = ResolveEffectiveRealtimeConfig(
            null,
            JSON.stringify({
                realtime: {
                    session: {
                        turnDetection: {
                            Mode: 'semanticVad',
                            Eagerness: 'sideways',
                            Threshold: 0.7,
                            SilenceDurationMs: 'soon',
                            Extra: 'ignored',
                        },
                    },
                },
            }),
            null,
        );
        expect(effective.realtime?.session?.turnDetection).toEqual({ Mode: 'semanticVad', Threshold: 0.7 });
    });

    it('drops the block entirely when nothing valid survives normalization', () => {
        const effective = ResolveEffectiveRealtimeConfig(
            null,
            JSON.stringify({ realtime: { session: { turnDetection: { Mode: 'telepathy', Threshold: 'high' } } } }),
            null,
        );
        expect(effective.realtime?.session?.turnDetection).toBeUndefined();
    });

    it('ignores a non-object turnDetection', () => {
        const effective = ResolveEffectiveRealtimeConfig(
            null,
            JSON.stringify({ realtime: { session: { turnDetection: 'semanticVad' } } }),
            null,
        );
        expect(effective.realtime?.session?.turnDetection).toBeUndefined();
    });
});

describe('GetModelCatalogSessionSettings — the model-catalog BASE layer', () => {
    it('projects Realtime.TurnDetection onto the flat driver bag key', () => {
        expect(GetModelCatalogSessionSettings({ Realtime: { TurnDetection: { Mode: 'semanticVad', Eagerness: 'auto' } } })).toEqual({
            turnDetection: { Mode: 'semanticVad', Eagerness: 'auto' },
        });
    });

    it('returns null when the catalog contributes nothing', () => {
        expect(GetModelCatalogSessionSettings(null)).toBeNull();
        expect(GetModelCatalogSessionSettings(undefined)).toBeNull();
        expect(GetModelCatalogSessionSettings({})).toBeNull();
        expect(GetModelCatalogSessionSettings({ Realtime: {} })).toBeNull();
        expect(GetModelCatalogSessionSettings({ LLM: { effortLevel: 'high' } })).toBeNull();
    });

    it('copies rather than aliases the cached catalog entity\'s object', () => {
        const config = { Realtime: { TurnDetection: { Mode: 'serverVad' as const } } };
        const bag = GetModelCatalogSessionSettings(config);
        expect(bag?.turnDetection).not.toBe(config.Realtime.TurnDetection);
    });

    it('the catalog layer sits UNDER the agent/app tuning layer per key', () => {
        // This is the precedence the session builders rely on: catalog < realtime.session.
        const catalog = GetModelCatalogSessionSettings({ Realtime: { TurnDetection: { Mode: 'serverVad', Threshold: 0.4 } } });
        const tuning = GetSessionTuningSettings({ realtime: { session: { turnDetection: { Mode: 'semanticVad' } } } });
        expect(DeepMergeConfigs(catalog, tuning)).toEqual({
            turnDetection: { Mode: 'semanticVad', Threshold: 0.4 },
        });
    });
});

describe('FindIgnoredRealtimeConfigKeys', () => {
    it('reports a foreign top-level section as unknown-section (MJ #3854, the reported case)', () => {
        const payload = JSON.stringify({
            realtime: { modelPreference: 'GPT Realtime' },
            caliber: { instructions: 'Interview the applicant about their work history.' },
        });
        expect(FindIgnoredRealtimeConfigKeys(payload)).toEqual([{ path: 'caliber', reason: 'unknown-section' }]);
        // ...and the reported section is, in fact, gone from the effective config.
        expect(ResolveEffectiveRealtimeConfig(null, null, payload)).toEqual({ realtime: { modelPreference: 'GPT Realtime' } });
    });

    it('reports every foreign top-level section, in payload order', () => {
        expect(FindIgnoredRealtimeConfigKeys('{"caliber":{},"realtime":{},"other":1}')).toEqual([
            { path: 'caliber', reason: 'unknown-section' },
            { path: 'other', reason: 'unknown-section' },
        ]);
    });

    it('reports an unrecognized key inside realtime as unknown-key', () => {
        expect(FindIgnoredRealtimeConfigKeys('{"realtime":{"modelPref":"GPT Realtime","instructions":"hi"}}')).toEqual([
            { path: 'realtime.modelPref', reason: 'unknown-key' },
            { path: 'realtime.instructions', reason: 'unknown-key' },
        ]);
    });

    it('reports modelPreference given as an ORDERED ARRAY as wrong-type (the issue\'s smaller item)', () => {
        expect(FindIgnoredRealtimeConfigKeys('{"realtime":{"modelPreference":["GPT Realtime","Gemini Live"]}}')).toEqual([
            { path: 'realtime.modelPreference', reason: 'wrong-type' },
        ]);
    });

    it('mirrors the normalizer on every scalar guard it enforces', () => {
        const payload = JSON.stringify({
            realtime: {
                modelPreference: '   ',
                allowUserModelOverride: 'yes',
                disclosure: 'whisper',
                allowedAgents: { agentId: 'not-an-array' },
                voice: 'warm',
                narration: 5000,
                video: true,
                turnTaking: 'proactive',
                session: [],
            },
        });
        expect(FindIgnoredRealtimeConfigKeys(payload)).toEqual([
            { path: 'realtime.modelPreference', reason: 'wrong-type' },
            { path: 'realtime.allowUserModelOverride', reason: 'wrong-type' },
            { path: 'realtime.disclosure', reason: 'wrong-type' },
            { path: 'realtime.allowedAgents', reason: 'wrong-type' },
            { path: 'realtime.voice', reason: 'wrong-type' },
            { path: 'realtime.narration', reason: 'wrong-type' },
            { path: 'realtime.video', reason: 'wrong-type' },
            { path: 'realtime.turnTaking', reason: 'wrong-type' },
            { path: 'realtime.session', reason: 'wrong-type' },
        ]);
        // Everything above really is discarded — the report and the cascade agree.
        expect(ResolveEffectiveRealtimeConfig(null, null, payload)).toEqual({ realtime: {} });
    });

    it('reports a non-object realtime section once, without descending', () => {
        expect(FindIgnoredRealtimeConfigKeys('{"realtime":"GPT Realtime","caliber":{}}')).toEqual([
            { path: 'caliber', reason: 'unknown-section' },
            { path: 'realtime', reason: 'wrong-type' },
        ]);
    });

    it('reports nothing for a fully valid payload', () => {
        const payload = JSON.stringify({
            realtime: {
                modelPreference: 'GPT Realtime',
                allowUserModelOverride: false,
                disclosure: 'silent',
                voice: { default: { tone: 'warm' }, providers: { openai: { voice: 'alloy' } } },
                narration: { paceMs: 5000 },
                session: { effortLevel: 'high' },
            },
        });
        expect(FindIgnoredRealtimeConfigKeys(payload)).toEqual([]);
    });

    it('reports nothing (never throws) for absent, malformed, or non-object payloads', () => {
        expect(FindIgnoredRealtimeConfigKeys(null)).toEqual([]);
        expect(FindIgnoredRealtimeConfigKeys(undefined)).toEqual([]);
        expect(FindIgnoredRealtimeConfigKeys('')).toEqual([]);
        expect(FindIgnoredRealtimeConfigKeys('   ')).toEqual([]);
        expect(FindIgnoredRealtimeConfigKeys('{not json')).toEqual([]);
        expect(FindIgnoredRealtimeConfigKeys('"caliber"')).toEqual([]);
        expect(FindIgnoredRealtimeConfigKeys('42')).toEqual([]);
        expect(FindIgnoredRealtimeConfigKeys('null')).toEqual([]);
        expect(FindIgnoredRealtimeConfigKeys('[{"realtime":{}}]')).toEqual([]);
    });

    it('reports an empty realtime section as nothing (an empty object drops no keys)', () => {
        expect(FindIgnoredRealtimeConfigKeys('{"realtime":{}}')).toEqual([]);
        expect(FindIgnoredRealtimeConfigKeys('{}')).toEqual([]);
    });

    /**
     * DRIFT GUARD: every key this module calls "known" must actually survive the cascade. If a new
     * RealtimeConfigSection field is added, the source-side Required<> table fails the build until
     * it is listed here-adjacent; this test then fails until a valid sample proves it round-trips.
     */
    it('every key it considers known is genuinely accepted by ResolveEffectiveRealtimeConfig', () => {
        const VALID_SAMPLE: { [K in keyof Required<RealtimeConfigSection>]: unknown } = {
            modelPreference: 'GPT Realtime',
            voice: { default: { tone: 'warm' } },
            video: { enabled: true },
            allowUserModelOverride: false,
            narration: { paceMs: 5000 },
            turnTaking: { mode: 'proactive' },
            disclosure: 'silent',
            allowedAgents: [{ agentId: 'AGENT-1', label: 'Skip' }],
            session: { effortLevel: 'high' },
        };

        expect(REALTIME_CONFIG_SECTION_KEYS.length).toBe(Object.keys(VALID_SAMPLE).length);
        for (const key of REALTIME_CONFIG_SECTION_KEYS) {
            const sample = VALID_SAMPLE[key];
            expect(sample, `no valid sample for known key '${key}'`).toBeDefined();

            const payload = JSON.stringify({ realtime: { [key]: sample } });
            expect(FindIgnoredRealtimeConfigKeys(payload), `'${key}' should be reported as known+valid`).toEqual([]);

            const effective = ResolveEffectiveRealtimeConfig(null, null, payload);
            expect(effective.realtime?.[key], `'${key}' did not survive the cascade`).toBeDefined();
        }
    });
});
