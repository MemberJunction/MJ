import { describe, it, expect } from 'vitest';
import { BaseRealtimeModel, type RealtimeDriverFacts } from '@memberjunction/ai';
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

describe('realtime driver facts table', () => {
    it.each(EXPECTED.map(([cls, expected]) => [cls.name, cls, expected] as const))(
        '%s declares its own ProviderMaxSessionSeconds',
        (_name, cls, expected) => {
            expect(cls.DriverFacts.ProviderMaxSessionSeconds).toBe(expected);
            // An inherited static would hide a driver that forgot to declare its own.
            expect(Object.prototype.hasOwnProperty.call(cls, 'DriverFacts')).toBe(true);
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
