import { AsyncLocalStorage } from 'node:async_hooks';
import { describe, it, expect, afterEach, vi } from 'vitest';
import {
    DiagnosticContext,
    IDiagnosticContextProvider,
    IsDiagnosticCaptureSuppressed,
    LogEntry,
    LogStatusEx,
    RegisterLogSink,
    SetDiagnosticContextProvider,
    WithoutDiagnosticCapture,
} from '../generic/logging';

/** An async-local context provider like the one the diagnostics server registers. */
function createAsyncLocalProvider(): { Provider: IDiagnosticContextProvider; Run: <T>(ctx: DiagnosticContext, fn: () => T) => T } {
    const als = new AsyncLocalStorage<DiagnosticContext>();
    const provider: IDiagnosticContextProvider = {
        GetContext: () => als.getStore(),
        RunWithContext: (ctx, fn) => (ctx === undefined ? als.exit(fn) : als.run(ctx, fn)),
        WithoutDiagnosticCapture: (fn) => als.run({ ...(als.getStore() ?? {}), suppressCapture: true, SuppressCapture: true }, fn),
    };
    return { Provider: provider, Run: (ctx, fn) => als.run(ctx, fn) };
}

describe('WithoutDiagnosticCapture', () => {
    const unsubscribers: Array<() => void> = [];

    afterEach(() => {
        unsubscribers.splice(0).forEach((u) => u());
        SetDiagnosticContextProvider(null);
        vi.restoreAllMocks();
    });

    it('does not suppress a log from another async context while one suppression is pending', async () => {
        const { Provider, Run } = createAsyncLocalProvider();
        SetDiagnosticContextProvider(Provider);
        const received: LogEntry[] = [];
        unsubscribers.push(RegisterLogSink((entry) => received.push(entry)));
        vi.spyOn(console, 'log').mockImplementation(() => {});

        let release: () => void = () => {};
        const pending = WithoutDiagnosticCapture(() => new Promise<void>((resolve) => (release = resolve)));

        Run({ sessionId: 'other-session' }, () => {
            expect(IsDiagnosticCaptureSuppressed()).toBe(false);
            LogStatusEx('other request log');
        });
        release();
        await pending;

        expect(received.map((e) => e.message)).toContain('other request log');
    });
});
