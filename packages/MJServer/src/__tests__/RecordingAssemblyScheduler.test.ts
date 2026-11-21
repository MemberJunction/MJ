import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { logErrorMock, logStatusMock } = vi.hoisted(() => ({
    logErrorMock: vi.fn(),
    logStatusMock: vi.fn(),
}));
vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: logErrorMock, LogStatus: logStatusMock };
});

import type { DatabaseProviderBase, UserInfo } from '@memberjunction/core';
import { ShutdownRegistry } from '@memberjunction/global';
import type {
    AssembleRealtimeRecordingInput, AssembleRealtimeRecordingOutcome, IRealtimeRecordingLedger,
} from '@memberjunction/ai-agents';
import { RecordingAssemblyScheduler } from '../realtimeSessions/RecordingAssemblyScheduler.js';

const SESSION = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const GRACE_MS = 90_000;
const SYSTEM_USER = { ID: 'system-user' } as unknown as UserInfo;
const PROVIDER = {} as unknown as DatabaseProviderBase;

/** A ledger whose claim hands out increasing versions; only ClaimAssembly is used by the scheduler. */
function makeLedger(claim: (sessionID: string) => Promise<number | null>): IRealtimeRecordingLedger {
    return { ClaimAssembly: vi.fn(claim) } as unknown as IRealtimeRecordingLedger;
}

describe('RecordingAssemblyScheduler', () => {
    let assemble: ReturnType<typeof vi.fn<(input: AssembleRealtimeRecordingInput) => Promise<AssembleRealtimeRecordingOutcome>>>;
    let ledger: IRealtimeRecordingLedger;
    let version: number;

    function start(): void {
        RecordingAssemblyScheduler.Instance.Start({
            Provider: PROVIDER,
            SystemUser: SYSTEM_USER,
            GraceMs: () => GRACE_MS,
            CreateLedger: () => ledger,
            Assemble: assemble,
        });
    }

    beforeEach(() => {
        vi.useFakeTimers();
        logErrorMock.mockReset();
        logStatusMock.mockReset();
        version = 0;
        ledger = makeLedger(async () => ++version);
        assemble = vi.fn(async () => 'Complete' as AssembleRealtimeRecordingOutcome);
        start();
    });

    afterEach(async () => {
        await RecordingAssemblyScheduler.Instance.Shutdown();
        vi.useRealTimers();
    });

    it('claims and assembles when the timer fires, passing ForcePartial and the claimed version', async () => {
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 1000, true);
        await vi.advanceTimersByTimeAsync(999);
        expect(assemble).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(ledger.ClaimAssembly).toHaveBeenCalledWith(SESSION, null);
        expect(assemble).toHaveBeenCalledTimes(1);
        expect(assemble.mock.calls[0][0]).toMatchObject({
            SessionID: SESSION, Version: 1, Ledger: ledger, ContextUser: SYSTEM_USER, Provider: PROVIDER, ForcePartial: true,
        });
    });

    it('keeps one timer per session: a sooner request replaces a later one, a later one is dropped', async () => {
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, GRACE_MS, true);
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 0, false);
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 5000, true);
        await vi.advanceTimersByTimeAsync(0);
        expect(assemble).toHaveBeenCalledTimes(1);
        expect(assemble.mock.calls[0][0].ForcePartial).toBe(false);

        await vi.advanceTimersByTimeAsync(GRACE_MS * 2);
        expect(assemble).toHaveBeenCalledTimes(1);
    });

    it('keeps the stronger ForcePartial when two requests fire at the same time', async () => {
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 1000, false);
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 1000, true);
        await vi.advanceTimersByTimeAsync(1000);
        expect(assemble).toHaveBeenCalledTimes(1);
        expect(assemble.mock.calls[0][0].ForcePartial).toBe(true);
    });

    it('times sessions independently', async () => {
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 1000, false);
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(OTHER, 2000, false);
        await vi.advanceTimersByTimeAsync(2000);
        expect(assemble.mock.calls.map(call => call[0].SessionID)).toEqual([SESSION, OTHER]);
    });

    it('re-schedules a Deferred assembly after the grace with ForcePartial', async () => {
        assemble.mockResolvedValueOnce('Deferred');
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 0, false);
        await vi.advanceTimersByTimeAsync(0);
        expect(assemble).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(GRACE_MS - 1);
        expect(assemble).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1);
        expect(assemble).toHaveBeenCalledTimes(2);
        expect(assemble.mock.calls[1][0].ForcePartial).toBe(true);
    });

    it('does not assemble when the claim is lost, and logs it', async () => {
        ledger = makeLedger(async () => null);
        start();
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 0, false);
        await vi.advanceTimersByTimeAsync(0);
        expect(assemble).not.toHaveBeenCalled();
        expect(logStatusMock.mock.calls.some(call => String(call[0]).includes(SESSION))).toBe(true);
    });

    it('never runs the same session twice at once; a request during a run re-runs it afterwards', async () => {
        let release: (outcome: AssembleRealtimeRecordingOutcome) => void = () => undefined;
        assemble.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));

        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 0, false);
        await vi.advanceTimersByTimeAsync(0);
        expect(assemble).toHaveBeenCalledTimes(1);

        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 0, true);
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 0, false);
        await vi.advanceTimersByTimeAsync(0);
        expect(assemble).toHaveBeenCalledTimes(1);

        release('Complete');
        await vi.advanceTimersByTimeAsync(0);
        expect(assemble).toHaveBeenCalledTimes(2);
        expect(assemble.mock.calls[1][0].ForcePartial).toBe(true);
    });

    it('logs Retry and claim failures with the session id', async () => {
        assemble.mockResolvedValueOnce('Retry');
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 0, false);
        await vi.advanceTimersByTimeAsync(0);
        expect(logErrorMock.mock.calls.some(call => String(call[0]).includes(SESSION))).toBe(true);

        logErrorMock.mockReset();
        ledger = makeLedger(async () => { throw new Error('db down'); });
        start();
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(OTHER, 0, false);
        await vi.advanceTimersByTimeAsync(0);
        expect(logErrorMock.mock.calls.some(call => String(call[0]).includes(OTHER) && String(call[0]).includes('db down'))).toBe(true);
    });

    it('unrefs its timers so they never keep the process alive', () => {
        const unref = vi.fn();
        const realSetTimeout = globalThis.setTimeout;
        const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((callback: () => void, ms?: number) => {
            const handle = realSetTimeout(callback, ms);
            return Object.assign(handle, { unref: () => { unref(); return handle; } });
        }) as typeof setTimeout);
        try {
            RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 1000, false);
            expect(unref).toHaveBeenCalledTimes(1);
        } finally {
            spy.mockRestore();
        }
    });

    it('registers for shutdown and clears pending timers on Shutdown; later requests are logged and dropped', async () => {
        expect(ShutdownRegistry.Instance.List()).toContain(RecordingAssemblyScheduler.Instance);
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(SESSION, 1000, false);
        await RecordingAssemblyScheduler.Instance.Shutdown();
        RecordingAssemblyScheduler.Instance.ScheduleAssembly(OTHER, 0, false);
        await vi.advanceTimersByTimeAsync(5000);
        expect(assemble).not.toHaveBeenCalled();
        expect(logErrorMock.mock.calls.some(call => String(call[0]).includes(OTHER))).toBe(true);
    });
});
