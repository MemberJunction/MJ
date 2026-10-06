import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { IRealtimeSession } from '@memberjunction/ai';
import { DelegationNarrator } from '../realtime/realtime-delegation-narrator';

function makeSession(overrides: Partial<{ RequestSpokenUpdate: ((i: string) => boolean) | undefined; SendContextNote: ((t: string) => void) | undefined }> = {}) {
    const spoken: string[] = [];
    const notes: string[] = [];
    const session = {
        RequestSpokenUpdate: 'RequestSpokenUpdate' in overrides ? overrides.RequestSpokenUpdate : (i: string) => (spoken.push(i), true),
        SendContextNote: 'SendContextNote' in overrides ? overrides.SendContextNote : (t: string) => notes.push(t),
    } as unknown as IRealtimeSession;
    return { session, spoken, notes };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const progress = (message: string, step = 'prompt_execution') => ({ step, message });

describe('DelegationNarrator', () => {
    it('speaks the first update about 5 s into a burst, as a digest of the progress so far', async () => {
        const { session, spoken, notes } = makeSession();
        const n = new DelegationNarrator({ GetSession: () => session });
        await n.Track(async () => {
            n.HandleProgress(progress('Searching records'));
            n.HandleProgress(progress('Reading results'));
            await vi.advanceTimersByTimeAsync(4000);
            expect(spoken).toHaveLength(0);
            await vi.advanceTimersByTimeAsync(1500);
        });
        expect(notes).toHaveLength(2);
        expect(spoken).toHaveLength(1);
        expect(spoken[0]).toContain('Searching records → Reading results');
        expect(spoken[0]).toContain('#1');
    });

    it('spaces later updates by the configured pace, never faster', async () => {
        const { session, spoken } = makeSession();
        const n = new DelegationNarrator({ GetSession: () => session, NarrationPaceMs: 12000 });
        await n.Track(async () => {
            n.HandleProgress(progress('one'));
            await vi.advanceTimersByTimeAsync(5100);
            expect(spoken).toHaveLength(1);
            n.HandleProgress(progress('two'));
            await vi.advanceTimersByTimeAsync(8000);
            expect(spoken).toHaveLength(1); // 12 s has not yet elapsed since the first
            await vi.advanceTimersByTimeAsync(5000);
            expect(spoken).toHaveLength(2);
        });
    });

    it('falls back to the 8 s default for an invalid pace', async () => {
        const { session, spoken } = makeSession();
        const n = new DelegationNarrator({ GetSession: () => session, NarrationPaceMs: -5 });
        await n.Track(async () => {
            n.HandleProgress(progress('one'));
            await vi.advanceTimersByTimeAsync(5100);
            n.HandleProgress(progress('two'));
            await vi.advanceTimersByTimeAsync(8100);
        });
        expect(spoken).toHaveLength(2);
    });

    it('drops noise steps and de-duplicates repeated messages', async () => {
        const { session, spoken, notes } = makeSession();
        const n = new DelegationNarrator({ GetSession: () => session });
        await n.Track(async () => {
            n.HandleProgress(progress('starting', 'initialization'));
            n.HandleProgress(progress('same'));
            n.HandleProgress(progress('same'));
            await vi.advanceTimersByTimeAsync(5100);
        });
        expect(notes).toEqual(['[delegated-agent progress] same', '[delegated-agent progress] same']);
        expect(spoken[0]).toContain('progress on the work YOU are doing for the user (oldest first): same.');
    });

    it('cancels a pending spoken update when the delegation finishes first', async () => {
        const { session, spoken } = makeSession();
        const n = new DelegationNarrator({ GetSession: () => session });
        await n.Track(async () => {
            n.HandleProgress(progress('quick'));
            await vi.advanceTimersByTimeAsync(1000);
        });
        await vi.advanceTimersByTimeAsync(10000);
        expect(spoken).toHaveLength(0);
    });

    it('cancels on demand (barge-in)', async () => {
        const { session, spoken } = makeSession();
        const n = new DelegationNarrator({ GetSession: () => session });
        await n.Track(async () => {
            n.HandleProgress(progress('work'));
            n.Cancel();
            await vi.advanceTimersByTimeAsync(10000);
        });
        expect(spoken).toHaveLength(0);
    });

    it('ignores progress that arrives with no delegation in flight', async () => {
        const { session, notes } = makeSession();
        const n = new DelegationNarrator({ GetSession: () => session });
        n.HandleProgress(progress('late'));
        expect(notes).toHaveLength(0);
    });

    it('only notes (never speaks) when the provider cannot voice an update', async () => {
        const { session, notes } = makeSession({ RequestSpokenUpdate: undefined });
        const n = new DelegationNarrator({ GetSession: () => session });
        await n.Track(async () => {
            n.HandleProgress(progress('work'));
            await vi.advanceTimersByTimeAsync(10000);
        });
        expect(notes).toHaveLength(1);
    });

    it('does nothing without a session', async () => {
        const n = new DelegationNarrator({ GetSession: () => null });
        await n.Track(async () => n.HandleProgress(progress('work')));
    });

    it('substitutes the DB template', async () => {
        const { session, spoken } = makeSession();
        const n = new DelegationNarrator({ GetSession: () => session, NarrationInstructionsTemplate: 'SAY: {{ progressMessage }} (#{{ updateNumber }})' });
        await n.Track(async () => {
            n.HandleProgress(progress('digging'));
            await vi.advanceTimersByTimeAsync(5100);
        });
        expect(spoken).toEqual(['SAY: digging (#1)']);
    });

    it('Run threads its own progress callback into the delegate and tracks the burst', async () => {
        const { session, notes } = makeSession();
        const n = new DelegationNarrator({ GetSession: () => session });
        const result = await n.Run({ CallID: 'c1', RequestText: 'x' } as never, async (request) => {
            request.OnProgress?.(progress('through run'));
            return { CallID: 'c1', Success: true, Output: 'ok' };
        });
        expect(result.Success).toBe(true);
        expect(notes).toHaveLength(1);
    });
});
