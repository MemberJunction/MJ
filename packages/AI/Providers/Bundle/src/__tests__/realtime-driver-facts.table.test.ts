import { describe, it, expect } from 'vitest';
import { BaseRealtimeModel, type RealtimeDriverFacts, type SupportedTurnSettingsMap } from '@memberjunction/ai';
import { MJGlobal } from '@memberjunction/global';
import { OpenAIRealtime, OpenAILiveRealtime } from '@memberjunction/ai-openai';
import { xAIRealtime } from '@memberjunction/ai-xai';
import { GeminiRealtime } from '@memberjunction/ai-gemini';
import { GeminiEnterpriseRealtime } from '@memberjunction/ai-vertex';
import { ElevenLabsRealtime, ElevenRealtime } from '@memberjunction/ai-elevenlabs';
import { AssemblyAIRealtime } from '@memberjunction/ai-assemblyai';
import { InworldRealtime } from '@memberjunction/ai-inworld';

/** The static shape every realtime driver class exposes; typed structurally so the table needs no cast. */
interface DriverWithFacts {
    readonly name: string;
    readonly DriverFacts: Readonly<RealtimeDriverFacts>;
}

// Every provider's ceiling, as MJ runs it. `undefined` = not confirmed in-repo; never a guess.
const EXPECTED: ReadonlyArray<readonly [DriverWithFacts, number | undefined]> = [
    [OpenAIRealtime, 3600],
    [OpenAILiveRealtime, undefined],
    [xAIRealtime, 7200],
    [GeminiRealtime, 1800],
    [GeminiEnterpriseRealtime, 1800],
    [ElevenLabsRealtime, 7200],
    [ElevenRealtime, undefined],
    [AssemblyAIRealtime, undefined],
    [InworldRealtime, undefined],
];

const OPENAI_FAMILY_SETTINGS: SupportedTurnSettingsMap = { Mode: 'exact', Eagerness: 'exact', SilenceDurationMs: 'exact', Threshold: 'exact' };
const GEMINI_SETTINGS: SupportedTurnSettingsMap = { Eagerness: 'approximate', SilenceDurationMs: 'exact', Threshold: 'approximate', Coverage: 'exact' };

// Second column: which normalized turn settings each driver honours, and how faithfully. `undefined` =
// the driver maps none (declares no key at all).
const EXPECTED_TURN_SETTINGS: ReadonlyArray<readonly [DriverWithFacts, SupportedTurnSettingsMap | undefined]> = [
    [OpenAIRealtime, OPENAI_FAMILY_SETTINGS],
    [OpenAILiveRealtime, undefined],
    [xAIRealtime, { Mode: 'exact', Eagerness: 'approximate', SilenceDurationMs: 'exact', Threshold: 'exact' }],
    [GeminiRealtime, GEMINI_SETTINGS],
    [GeminiEnterpriseRealtime, GEMINI_SETTINGS],
    [ElevenLabsRealtime, { Eagerness: 'exact' }],
    // BuildElevenRealtimeTurnDetection: serverVad/semanticVad modes, eagerness (auto -> medium), threshold, silence.
    [ElevenRealtime, OPENAI_FAMILY_SETTINGS],
    [AssemblyAIRealtime, undefined],
    [InworldRealtime, undefined],
];

/*
 * Scope: this table and the registration check below cover the provider packages this Bundle
 * imports. HuggingFaceRealtime is not a Bundle dependency, so its own package test checks it.
 * That each driver's per-session Capabilities equal its static DriverFacts is asserted in each
 * provider package's own tests, not here.
 */
describe('realtime driver facts table', () => {
    it.each(EXPECTED.map(([cls, expected]) => [cls.name, cls, expected] as const))(
        '%s declares its own ProviderMaxSessionSeconds',
        (_name, cls, expected) => {
            expect(cls.DriverFacts.ProviderMaxSessionSeconds).toBe(expected);
            // An inherited static would hide a driver that forgot to declare its own.
            expect(Object.prototype.hasOwnProperty.call(cls, 'DriverFacts')).toBe(true);
        },
    );

    it.each(EXPECTED_TURN_SETTINGS.map(([cls, expected]) => [cls.name, cls, expected] as const))(
        '%s declares its SupportedTurnSettings',
        (_name, cls, expected) => {
            expect(cls.DriverFacts.SupportedTurnSettings).toEqual(expected);
        },
    );

    it('every class registered under BaseRealtimeModel is in the table', () => {
        const tabled = new Set<unknown>(EXPECTED.map(([cls]) => cls));
        const registered = MJGlobal.Instance.ClassFactory.GetAllRegistrations(BaseRealtimeModel).map(r => r.SubClass as DriverWithFacts);
        expect(registered.length).toBeGreaterThanOrEqual(EXPECTED.length);
        // HuggingFaceRealtime is not a Bundle dependency, so it is legitimately absent here; its own
        // package test (HuggingFace/src/__tests__) covers it.
        const missing = registered.filter(cls => !tabled.has(cls)).map(cls => cls.name);
        expect(missing).toEqual([]);
        const unregistered = EXPECTED.map(([cls]) => cls).filter(cls => !registered.includes(cls)).map(cls => cls.name);
        expect(unregistered).toEqual([]);
    });
});
