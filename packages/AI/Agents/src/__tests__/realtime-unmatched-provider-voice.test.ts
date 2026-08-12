/**
 * @fileoverview Regression guard for {@link WarnOnUnmatchedProviderVoice} — the diagnosis that ends
 * the silent-drop bug class in #3530.
 *
 * The trap this pins: the function MUST ask {@link MatchProviderVoiceSettings}, not
 * `GetProviderVoiceSettings`. The latter is truthy for every driver once an agnostic voice is set, so
 * a refactor to it would silence the warning on exactly the path that emits one — the path the fix
 * exists to serve. Nothing else in the suite would notice, which is why this file exists.
 *
 * @module @memberjunction/ai-agents
 * @author MemberJunction.com
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogError } from '@memberjunction/core';

// Spread the real module and override only the logging this test asserts on.
vi.mock('@memberjunction/core', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@memberjunction/core')>()),
    LogError: vi.fn(),
}));

import { WarnOnUnmatchedProviderVoice } from '../realtime/realtime-client-session-service';
import { RealtimeCoAgentConfig } from '../realtime/realtime-coagent-config';

/** An effective config carrying the given per-provider bags and optional agnostic voice. */
function config(providers: Record<string, Record<string, unknown>>, agnosticVoice?: string): RealtimeCoAgentConfig {
    return {
        realtime: {
            voice: {
                ...(agnosticVoice ? { default: { voice: agnosticVoice } } : {}),
                providers
            }
        }
    } as RealtimeCoAgentConfig;
}

const logErrorMock = vi.mocked(LogError);

describe('WarnOnUnmatchedProviderVoice', () => {
    beforeEach(() => {
        logErrorMock.mockClear();
    });

    it('warns when authored provider bags matched nothing, naming the keys and the driver', () => {
        WarnOnUnmatchedProviderVoice(config({ openai: { voice: 'alloy' } }), 'ElevenLabsRealtime', 'TestSurface');

        expect(logErrorMock).toHaveBeenCalledTimes(1);
        const message = String(logErrorMock.mock.calls[0][0]);
        // The log has to be actionable on its own — the authored key, the driver that actually ran,
        // and the way out. Diagnosing this from a stack trace is what nobody managed pre-#3530.
        expect(message).toContain('openai');
        expect(message).toContain('ElevenLabsRealtime');
        expect(message).toContain('TestSurface');
        expect(message).toContain('realtime.voice.default.voice');
    });

    it('STILL warns when an agnostic voice is set — the unmatched provider bag is dropped either way', () => {
        // THE REGRESSION GUARD. Asking GetProviderVoiceSettings here would return truthy (the agnostic
        // voice supplies `voice` for every driver) and silence this, on the exact path the fix serves.
        WarnOnUnmatchedProviderVoice(config({ openai: { voice: 'alloy' } }, 'Rachel'), 'ElevenLabsRealtime', 'TestSurface');

        expect(logErrorMock).toHaveBeenCalledTimes(1);
        expect(String(logErrorMock.mock.calls[0][0])).toContain('openai');
    });

    it('stays silent when an authored provider key DID match the resolved driver', () => {
        WarnOnUnmatchedProviderVoice(config({ openai: { voice: 'alloy' } }), 'OpenAIRealtime', 'TestSurface');
        expect(logErrorMock).not.toHaveBeenCalled();
    });

    it('stays silent when no provider bags were authored at all (the common config)', () => {
        WarnOnUnmatchedProviderVoice(config({}), 'ElevenLabsRealtime', 'TestSurface');
        expect(logErrorMock).not.toHaveBeenCalled();

        WarnOnUnmatchedProviderVoice(undefined, 'ElevenLabsRealtime', 'TestSurface');
        expect(logErrorMock).not.toHaveBeenCalled();
    });

    it('reports an unresolved driver rather than throwing on an undefined one', () => {
        WarnOnUnmatchedProviderVoice(config({ openai: { voice: 'alloy' } }), undefined, 'TestSurface');

        expect(logErrorMock).toHaveBeenCalledTimes(1);
        expect(String(logErrorMock.mock.calls[0][0])).toContain('unknown');
    });
});
