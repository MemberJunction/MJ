import { describe, it, expect, vi, afterEach } from 'vitest';
import { EndSensitivity, StartSensitivity, type LiveConnectConfig, type AutomaticActivityDetection } from '@google/genai';
import type { RealtimeSessionParams } from '@memberjunction/ai';

import { GeminiRealtime, type GeminiLiveSession, type GeminiConnectArgs } from '../geminiRealtime';
import { MapGeminiActivityDetection } from '../geminiActivityDetection';
import { ConfirmGeminiSetup } from './live-session-test-helpers';

describe('MapGeminiActivityDetection', () => {
    it('maps silence, low eagerness and a low threshold (spec acceptance row)', () => {
        expect(MapGeminiActivityDetection({ SilenceDurationMs: 1200, Eagerness: 'low', Threshold: 0.3 })).toEqual({
            silenceDurationMs: 1200,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        });
    });

    it('maps high eagerness to END_SENSITIVITY_HIGH', () => {
        expect(MapGeminiActivityDetection({ Eagerness: 'high' })).toEqual({ endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH });
    });

    it('auto eagerness and absent settings set nothing', () => {
        expect(MapGeminiActivityDetection({ Eagerness: 'auto' })).toEqual({});
        expect(MapGeminiActivityDetection(undefined)).toEqual({});
    });

    it('threshold 0.5 is START LOW; 0.49 is START HIGH', () => {
        expect(MapGeminiActivityDetection({ Threshold: 0.5 })).toEqual({ startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW });
        expect(MapGeminiActivityDetection({ Threshold: 0.49 })).toEqual({ startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH });
        expect(MapGeminiActivityDetection({ Threshold: 0 })).toEqual({ startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH });
        expect(MapGeminiActivityDetection({ Threshold: 1 })).toEqual({ startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW });
    });

    it('omits an out-of-range or non-finite threshold', () => {
        expect(MapGeminiActivityDetection({ Threshold: 1.5 })).toEqual({});
        expect(MapGeminiActivityDetection({ Threshold: -0.1 })).toEqual({});
        expect(MapGeminiActivityDetection({ Threshold: Number.NaN })).toEqual({});
    });

    it('drops a non-positive or fractional silence', () => {
        expect(MapGeminiActivityDetection({ SilenceDurationMs: 0 })).toEqual({});
        expect(MapGeminiActivityDetection({ SilenceDurationMs: -5 })).toEqual({});
        expect(MapGeminiActivityDetection({ SilenceDurationMs: 10.5 })).toEqual({});
    });

    it('never emits disabled and ignores Mode', () => {
        const result: Partial<AutomaticActivityDetection> = MapGeminiActivityDetection({ Mode: 'serverVad', SilenceDurationMs: 800, Eagerness: 'high', Threshold: 0.9 });
        expect('disabled' in result).toBe(false);
        expect(MapGeminiActivityDetection({ Mode: 'semanticVad' })).toEqual({});
    });
});

class CaptureGeminiRealtime extends GeminiRealtime {
    public LastConnectArgs: GeminiConnectArgs | null = null;
    protected override async connectLiveSession(args: GeminiConnectArgs): Promise<GeminiLiveSession> {
        this.LastConnectArgs = args;
        ConfirmGeminiSetup(args);
        return { sendRealtimeInput: () => {}, sendClientContent: () => {}, sendToolResponse: () => {}, close: () => {} };
    }
}

function params(config: Record<string, unknown>): RealtimeSessionParams {
    return { Model: 'gemini-live-2.5-flash-preview', SystemPrompt: 'Hi.', Config: config } as RealtimeSessionParams;
}

async function connectConfig(config: Record<string, unknown>): Promise<LiveConnectConfig> {
    const driver = new CaptureGeminiRealtime('k');
    await driver.StartSession(params(config));
    return driver.LastConnectArgs!.Config as LiveConnectConfig;
}

describe('GeminiRealtime turnDetection through the driver', () => {
    afterEach(() => vi.restoreAllMocks());

    it('applies the acceptance row to automaticActivityDetection', async () => {
        const config = await connectConfig({ turnDetection: { SilenceDurationMs: 1200, Eagerness: 'low', Threshold: 0.3 } });
        expect(config.realtimeInputConfig?.automaticActivityDetection).toEqual({
            silenceDurationMs: 1200,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        });
    });

    it('meeting mode disabled:true survives a SilenceDurationMs merge', async () => {
        const config = await connectConfig({ disableAutoResponse: true, turnDetection: { SilenceDurationMs: 900 } });
        expect(config.realtimeInputConfig?.automaticActivityDetection).toEqual({ disabled: true, silenceDurationMs: 900 });
    });

    it('leaves turnCoverage as the Coverage setting alone decides', async () => {
        const config = await connectConfig({ turnDetection: { Coverage: 'audioActivityAndAllVideo', SilenceDurationMs: 900 } });
        const baseline = await connectConfig({ turnDetection: { Coverage: 'audioActivityAndAllVideo' } });
        expect(config.realtimeInputConfig?.turnCoverage).toBe(baseline.realtimeInputConfig?.turnCoverage);
    });

    it('sets no automaticActivityDetection fields when turnDetection maps nothing', async () => {
        const config = await connectConfig({ turnDetection: { Eagerness: 'auto' } });
        expect(config.realtimeInputConfig?.automaticActivityDetection ?? {}).toEqual({});
    });

    it("logs once for Mode 'serverVad' and still applies the mapped fields", async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const config = await connectConfig({ turnDetection: { Mode: 'serverVad', SilenceDurationMs: 700 } });
        const lines = warn.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('Mode'));
        expect(lines).toHaveLength(1);
        expect(config.realtimeInputConfig?.automaticActivityDetection?.silenceDurationMs).toBe(700);
    });
});
