import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryManager, TelemetryEventLifecycleType } from '../generic/telemetryManager';
import { WithoutDiagnosticCapture } from '../generic/logging';

/**
 * Coverage for `TelemetryManager.Instance.OnEvent` — the in-process synchronous lifecycle hook
 * that bridges telemetry events to observers (e.g. an OpenTelemetry span bridge) without the
 * observer having to poll `GetEvents()`.
 */
describe('TelemetryManager — OnEvent lifecycle hook', () => {
    beforeEach(() => {
        const tm = TelemetryManager.Instance;
        tm.Reset();
        tm.SetEnabled(true);
    });

    it('fires "start" when StartEvent is called and "end" when EndEvent completes it', () => {
        const tm = TelemetryManager.Instance;
        const phases: TelemetryEventLifecycleType[] = [];
        const unsubscribe = tm.OnEvent((_event, type) => phases.push(type));

        const id = tm.StartEvent('RunView', 'ProviderBase.RunView', { EntityName: 'MJ: Users' });
        expect(phases).toEqual(['start']);

        tm.EndEvent(id);
        expect(phases).toEqual(['start', 'end']);

        unsubscribe();
    });

    it('fires both "start" and "end" (in that order) for a directly RecordEvent-ed event', () => {
        const tm = TelemetryManager.Instance;
        const phases: TelemetryEventLifecycleType[] = [];
        tm.OnEvent((_event, type) => phases.push(type));

        tm.RecordEvent('AI', 'Chat.Complete', { modelName: 'gpt' }, 42);

        expect(phases).toEqual(['start', 'end']);
    });

    it('stops notifying after the returned unsubscribe function is called', () => {
        const tm = TelemetryManager.Instance;
        const phases: TelemetryEventLifecycleType[] = [];
        const unsubscribe = tm.OnEvent((_event, type) => phases.push(type));

        const id1 = tm.StartEvent('RunView', 'ProviderBase.RunView', { EntityName: 'MJ: Users' });
        tm.EndEvent(id1);
        expect(phases.length).toBe(2);

        unsubscribe();

        const id2 = tm.StartEvent('RunView', 'ProviderBase.RunView', { EntityName: 'MJ: Users' });
        tm.EndEvent(id2);
        expect(phases.length).toBe(2); // unchanged — no further notifications after unsubscribe
    });

    it('swallows a listener exception without disrupting event recording or other listeners', () => {
        const tm = TelemetryManager.Instance;
        const goodPhases: TelemetryEventLifecycleType[] = [];

        tm.OnEvent(() => {
            throw new Error('boom');
        });
        tm.OnEvent((_event, type) => goodPhases.push(type));

        const id = tm.StartEvent('RunView', 'ProviderBase.RunView', { EntityName: 'MJ: Users' });
        expect(() => tm.EndEvent(id)).not.toThrow();

        expect(goodPhases).toEqual(['start', 'end']);
        // Recording itself must have proceeded normally despite the throwing listener.
        expect(tm.GetEvents({ category: 'RunView' }).length).toBe(1);
    });

    it('suppresses all notifications while diagnostic capture is suppressed', () => {
        const tm = TelemetryManager.Instance;
        const phases: TelemetryEventLifecycleType[] = [];
        tm.OnEvent((_event, type) => phases.push(type));

        WithoutDiagnosticCapture(() => {
            const id = tm.StartEvent('RunView', 'ProviderBase.RunView', { EntityName: 'MJ: Users' });
            tm.EndEvent(id);
        });

        expect(phases).toEqual([]);
    });

    it('preserves numeric AI token counts through sanitizeTelemetryParams (not redacted as secrets)', () => {
        const tm = TelemetryManager.Instance;
        let capturedInputTokens: unknown;
        let capturedOutputTokens: unknown;

        tm.OnEvent((event) => {
            if (event.category === 'AI') {
                const params = event.params as { inputTokens?: number; outputTokens?: number };
                capturedInputTokens = params.inputTokens;
                capturedOutputTokens = params.outputTokens;
            }
        });

        tm.RecordEvent('AI', 'Chat.Complete', { modelName: 'gpt', inputTokens: 123, outputTokens: 456 }, 10);

        expect(capturedInputTokens).toBe(123);
        expect(capturedOutputTokens).toBe(456);
    });

    it('still redacts a string field whose name matches a sensitive-key substring', () => {
        const tm = TelemetryManager.Instance;
        let capturedApiKey: unknown;
        let capturedUrl: unknown;

        tm.OnEvent((event) => {
            if (event.category === 'Custom') {
                const params = event.params as { apikey?: string; url?: string };
                capturedApiKey = params.apikey;
                capturedUrl = params.url;
            }
        });

        tm.RecordEvent('Custom', 'Fetch', { apikey: 'super-secret-value', url: 'https://example.com' }, 5);

        // The sensitive string field is redacted, while the unrelated field is untouched — this
        // exercises that redaction still applies to legitimate string secrets while the earlier
        // test proves a numeric field with a matching substring (e.g. token counts) is spared.
        expect(capturedApiKey).toBe('[REDACTED]');
        expect(capturedUrl).toBe('https://example.com');
    });
});
