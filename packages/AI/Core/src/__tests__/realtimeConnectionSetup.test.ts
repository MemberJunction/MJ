import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeConnectionSetup, REALTIME_CONNECTION_SETUP_TIMEOUT_MS } from '../generic/realtimeConnectionSetup';

/** Settles `wait` and says how: `'confirmed'`, or the rejection's message. */
async function outcomeOf(wait: Promise<void>): Promise<string> {
    try {
        await wait;
        return 'confirmed';
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

describe('RealtimeConnectionSetup', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });
    afterEach(() => {
        vi.useRealTimers();
    });

    it('resolves once the provider confirms the setup', async () => {
        const setup = new RealtimeConnectionSetup();
        const wait = outcomeOf(setup.Wait());
        expect(setup.IsConfirmed).toBe(false);
        setup.Confirm();
        expect(await wait).toBe('confirmed');
        expect(setup.IsConfirmed).toBe(true);
    });

    it('resolves when the confirmation came before anyone waited', async () => {
        const setup = new RealtimeConnectionSetup();
        setup.Confirm();
        expect(await outcomeOf(setup.Wait())).toBe('confirmed');
    });

    it('rejects with the failure when the connection closes first, and ignores a later confirmation', async () => {
        const setup = new RealtimeConnectionSetup();
        const wait = outcomeOf(setup.Wait());
        setup.Fail(new Error('closed (1007): bad setup'));
        setup.Confirm();
        expect(await wait).toBe('closed (1007): bad setup');
        expect(setup.IsConfirmed).toBe(false);
    });

    it('a close after the confirmation changes nothing', async () => {
        const setup = new RealtimeConnectionSetup();
        setup.Confirm();
        setup.Fail(new Error('closed later'));
        expect(await outcomeOf(setup.Wait())).toBe('confirmed');
    });

    it('rejects when no confirmation comes in time, and a late one changes nothing', async () => {
        const setup = new RealtimeConnectionSetup();
        const wait = outcomeOf(setup.Wait());
        await vi.advanceTimersByTimeAsync(REALTIME_CONNECTION_SETUP_TIMEOUT_MS);
        setup.Confirm();
        expect(await wait).toBe(`the provider did not confirm the session setup within ${REALTIME_CONNECTION_SETUP_TIMEOUT_MS} ms`);
        expect(setup.IsConfirmed).toBe(false);
    });

    it('takes its own limit', async () => {
        const setup = new RealtimeConnectionSetup();
        const wait = outcomeOf(setup.Wait(500));
        await vi.advanceTimersByTimeAsync(499);
        setup.Confirm();
        expect(await wait).toBe('confirmed');
    });

    it('a failure nobody waits for is not an unhandled rejection', async () => {
        const setup = new RealtimeConnectionSetup();
        setup.Fail(new Error('closed before anyone waited'));
        await vi.advanceTimersByTimeAsync(0);
        expect(await outcomeOf(setup.Wait())).toBe('closed before anyone waited');
    });
});
