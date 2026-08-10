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
});
