/**
 * Unit tests for the PURE model-catalog configuration layer (`generic/modelConfiguration.ts`):
 * tolerant parsing of one `ModelConfiguration` column value, and the base-first deep-merge that
 * resolves the three-level catalog cascade (AIModelType < AIModel < AIModelVendor).
 *
 * Both functions are deliberately total — a malformed catalog row must contribute NOTHING rather
 * than fail a session — so the negative cases below are the contract, not edge-case trivia.
 */
import { describe, it, expect } from 'vitest';
import {
    AIModelConfiguration,
    GetPromptCacheStrategy,
    ParseModelConfiguration,
    ResolveEffectiveModelConfiguration,
} from '../generic/modelConfiguration';

describe('ParseModelConfiguration — tolerant single-layer parse', () => {
    it('returns null for absent / blank input', () => {
        expect(ParseModelConfiguration(null)).toBeNull();
        expect(ParseModelConfiguration(undefined)).toBeNull();
        expect(ParseModelConfiguration('')).toBeNull();
        expect(ParseModelConfiguration('   \n\t ')).toBeNull();
    });

    it('returns null for malformed JSON instead of throwing', () => {
        expect(ParseModelConfiguration('{ not json')).toBeNull();
        expect(ParseModelConfiguration('{"Realtime": }')).toBeNull();
    });

    it('returns null for valid JSON that is not a plain object', () => {
        // A bag must be an object — arrays and scalars are structurally wrong for every consumer.
        expect(ParseModelConfiguration('[]')).toBeNull();
        expect(ParseModelConfiguration('[{"Realtime":{}}]')).toBeNull();
        expect(ParseModelConfiguration('"semanticVad"')).toBeNull();
        expect(ParseModelConfiguration('42')).toBeNull();
        expect(ParseModelConfiguration('null')).toBeNull();
    });

    it('parses a well-formed bag', () => {
        const parsed = ParseModelConfiguration('{"Realtime":{"TurnDetection":{"Mode":"semanticVad","Eagerness":"auto"}}}');
        expect(parsed).toEqual({ Realtime: { TurnDetection: { Mode: 'semanticVad', Eagerness: 'auto' } } });
    });

    it('parses an empty object as an empty bag (present but contributing nothing)', () => {
        expect(ParseModelConfiguration('{}')).toEqual({});
    });
});

describe('ResolveEffectiveModelConfiguration — the three-level cascade', () => {
    it('returns null when there are no layers, or every layer is absent', () => {
        expect(ResolveEffectiveModelConfiguration()).toBeNull();
        expect(ResolveEffectiveModelConfiguration(null, undefined, null)).toBeNull();
    });

    it('returns null when every layer is present but empty', () => {
        expect(ResolveEffectiveModelConfiguration({}, {}, {})).toBeNull();
    });

    it('passes a single contributing layer through', () => {
        const model: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };
        expect(ResolveEffectiveModelConfiguration(null, model, null)).toEqual(model);
    });

    it('merges per key so a vendor override of ONE knob keeps the model layer\'s others', () => {
        const type: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'serverVad', Threshold: 0.5 } } };
        const model: AIModelConfiguration = { Realtime: { TurnDetection: { Eagerness: 'auto' } } };
        const vendor: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };

        expect(ResolveEffectiveModelConfiguration(type, model, vendor)).toEqual({
            Realtime: { TurnDetection: { Mode: 'semanticVad', Threshold: 0.5, Eagerness: 'auto' } },
        });
    });

    it('keeps sibling sections a later layer does not mention', () => {
        const model: AIModelConfiguration = {
            LLM: { effortLevel: 'high' },
            Realtime: { TurnDetection: { Mode: 'serverVad' } },
        };
        const vendor: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };

        expect(ResolveEffectiveModelConfiguration(model, vendor)).toEqual({
            LLM: { effortLevel: 'high' },
            Realtime: { TurnDetection: { Mode: 'semanticVad' } },
        });
    });

    it('replaces (does not merge) arrays and scalars', () => {
        const base: AIModelConfiguration = { LLM: { stops: ['a', 'b'], temperature: 0.2 } };
        const top: AIModelConfiguration = { LLM: { stops: ['c'], temperature: 0.9 } };
        expect(ResolveEffectiveModelConfiguration(base, top)).toEqual({ LLM: { stops: ['c'], temperature: 0.9 } });
    });

    it('lets a later layer replace an object with a scalar (last writer wins on type change)', () => {
        const base = { Realtime: { TurnDetection: { Mode: 'serverVad' } } } as AIModelConfiguration;
        const top = { Realtime: { TurnDetection: null } } as unknown as AIModelConfiguration;
        expect(ResolveEffectiveModelConfiguration(base, top)).toEqual({ Realtime: { TurnDetection: null } });
    });

    it('skips undefined VALUES within a layer rather than blanking the base', () => {
        const base: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };
        const top = { Realtime: undefined } as AIModelConfiguration;
        expect(ResolveEffectiveModelConfiguration(base, top)).toEqual({
            Realtime: { TurnDetection: { Mode: 'semanticVad' } },
        });
    });

    it('never mutates its inputs and never aliases nested objects into the result', () => {
        const type: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'serverVad', Threshold: 0.5 } } };
        const vendor: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };
        const typeSnapshot = JSON.parse(JSON.stringify(type)) as AIModelConfiguration;
        const vendorSnapshot = JSON.parse(JSON.stringify(vendor)) as AIModelConfiguration;

        const merged = ResolveEffectiveModelConfiguration(type, vendor);

        expect(type).toEqual(typeSnapshot);
        expect(vendor).toEqual(vendorSnapshot);
        // A cached catalog entity must not be corrupted by a caller mutating the resolved bag.
        expect(merged?.Realtime).not.toBe(type.Realtime);
        expect(merged?.Realtime?.TurnDetection).not.toBe(type.Realtime?.TurnDetection);
        expect(merged?.Realtime?.TurnDetection).not.toBe(vendor.Realtime?.TurnDetection);
    });

    it('ignores non-object layers entirely', () => {
        const model: AIModelConfiguration = { Realtime: { TurnDetection: { Mode: 'semanticVad' } } };
        const bogus = ['not', 'a', 'bag'] as unknown as AIModelConfiguration;
        expect(ResolveEffectiveModelConfiguration(bogus, model, bogus)).toEqual(model);
    });

    it('merges Realtime.Reasoning configuration properly across layers', () => {
        const type: AIModelConfiguration = {
            Realtime: {
                Reasoning: {
                    Plane: 'local',
                },
            },
        };
        const vendor: AIModelConfiguration = {
            Realtime: {
                Reasoning: {
                    Plane: 'remote',
                    Remote: {
                        Kind: 'model',
                        Ref: 'gpt-5.6-terra',
                        Effort: 'medium',
                    },
                },
            },
        };
        const merged = ResolveEffectiveModelConfiguration(type, vendor);
        expect(merged).toEqual({
            Realtime: {
                Reasoning: {
                    Plane: 'remote',
                    Remote: {
                        Kind: 'model',
                        Ref: 'gpt-5.6-terra',
                        Effort: 'medium',
                    },
                },
            },
        });
    });
});

describe('LLM section — native tool-calling flags (implementation plan §4.1)', () => {
    it('inherits a model-level capability flag when the vendor layer omits it', () => {
        const resolved = ResolveEffectiveModelConfiguration(
            null,
            { LLM: { SupportsNativeToolCalling: true } },
            { LLM: { DefaultToNativeToolCalling: true } }
        );
        // The vendor layer set a DIFFERENT key, so per-key deep merge must preserve the model's.
        expect(resolved?.LLM?.SupportsNativeToolCalling).toBe(true);
        expect(resolved?.LLM?.DefaultToNativeToolCalling).toBe(true);
    });

    it('lets an explicit vendor false override a model true — a serving path that lacks tools', () => {
        const resolved = ResolveEffectiveModelConfiguration(
            null,
            { LLM: { SupportsNativeToolCalling: true } },
            { LLM: { SupportsNativeToolCalling: false } }
        );
        expect(resolved?.LLM?.SupportsNativeToolCalling).toBe(false);
    });

    it('distinguishes absent from false: an absent property inherits rather than disabling', () => {
        const resolved = ResolveEffectiveModelConfiguration(
            { LLM: { SupportsNativeToolCalling: true } },
            { LLM: {} },
            { LLM: {} }
        );
        expect(resolved?.LLM?.SupportsNativeToolCalling).toBe(true);
    });

    it('resolves to a falsy value when no layer expresses an opinion — today behavior, untouched', () => {
        const resolved = ResolveEffectiveModelConfiguration(null, null, null);
        expect(resolved?.LLM?.SupportsNativeToolCalling ?? false).toBe(false);
        expect(resolved?.LLM?.DefaultToNativeToolCalling ?? false).toBe(false);
    });

    it('does not let a tool-calling flag disturb another modality section', () => {
        const resolved = ResolveEffectiveModelConfiguration(
            null,
            { Realtime: { TurnDetection: { Mode: 'serverVad' } } },
            { LLM: { SupportsNativeToolCalling: true } }
        );
        expect(resolved?.Realtime?.TurnDetection?.Mode).toBe('serverVad');
        expect(resolved?.LLM?.SupportsNativeToolCalling).toBe(true);
    });
});

describe('LLM control-flow knobs', () => {
    it('carries NativeControlFlow and NativeToolResults through the cascade like the other LLM knobs', () => {
        const merged = ResolveEffectiveModelConfiguration(
            { LLM: { SupportsNativeToolCalling: true, NativeControlFlow: 'implicit' } },
            { LLM: { NativeToolResults: true } }
        );
        expect(merged?.LLM?.NativeControlFlow).toBe('implicit');
        expect(merged?.LLM?.NativeToolResults).toBe(true);
        expect(merged?.LLM?.SupportsNativeToolCalling).toBe(true);
    });

    it('an explicit null at a higher layer REPLACES (tri-state), it does not inherit', () => {
        const merged = ResolveEffectiveModelConfiguration(
            { LLM: { NativeControlFlow: 'implicit' } },
            { LLM: { NativeControlFlow: null } }
        );
        expect(merged?.LLM?.NativeControlFlow).toBeNull();
    });
});

describe('GetPromptCacheStrategy — the catalog answers "is this serving path a byte-prefix cache?"', () => {
    it('returns null when no layer declares a strategy (callers treat null as block / replace-in-place)', () => {
        expect(GetPromptCacheStrategy(null)).toBeNull();
        expect(GetPromptCacheStrategy(undefined)).toBeNull();
        expect(GetPromptCacheStrategy({})).toBeNull();
        expect(GetPromptCacheStrategy({ LLM: {} })).toBeNull();
        expect(GetPromptCacheStrategy({ LLM: { PromptCacheStrategy: null } })).toBeNull();
    });

    it('returns only the two known values; an unknown string in stored JSON is treated as absent', () => {
        expect(GetPromptCacheStrategy({ LLM: { PromptCacheStrategy: 'prefix' } })).toBe('prefix');
        expect(GetPromptCacheStrategy({ LLM: { PromptCacheStrategy: 'block' } })).toBe('block');
        const stored = ParseModelConfiguration('{"LLM":{"PromptCacheStrategy":"sliding"}}');
        expect(GetPromptCacheStrategy(stored)).toBeNull();
    });

    it("the model-vendor row's strategy wins over the model's, and the model's over the type's", () => {
        const type: AIModelConfiguration = { LLM: { PromptCacheStrategy: 'block' } };
        const model: AIModelConfiguration = { LLM: { PromptCacheStrategy: 'prefix', SupportsNativeToolCalling: true } };
        const vendor: AIModelConfiguration = { LLM: { PromptCacheStrategy: 'block' } };

        expect(GetPromptCacheStrategy(ResolveEffectiveModelConfiguration(type, model))).toBe('prefix');
        const effective = ResolveEffectiveModelConfiguration(type, model, vendor);
        expect(GetPromptCacheStrategy(effective)).toBe('block');
        // ...without wiping the model's other knobs: this is a per-key merge, not a replace.
        expect(effective?.LLM?.SupportsNativeToolCalling).toBe(true);
    });
});
