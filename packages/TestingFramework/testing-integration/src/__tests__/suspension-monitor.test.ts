import { describe, it, expect, vi, afterEach } from 'vitest';
import { SuspensionMonitor } from '../suspension-monitor';
import { IntegrationTestDriver } from '../IntegrationTestDriver';

/** A controllable wall clock: the monitor reads it, the test moves it. */
class FakeClock {
    public T = 1_000_000;
    public readonly Now = (): number => this.T;
}

describe('SuspensionMonitor', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('counts nothing while ticks arrive on time (normal jitter stays under the threshold)', () => {
        const clock = new FakeClock();
        const m = new SuspensionMonitor(1000, 5000, clock.Now);
        m.Start();
        for (let i = 0; i < 10; i++) {
            clock.T += 1000 + 200; // 200 ms late: jitter, not a stall
            m.Sample();
        }
        m.Stop();
        expect(m.StalledMs).toBe(0);
        expect(m.LongestStallMs).toBe(0);
    });

    it('counts the lateness of a tick that arrives after a suspension (host sleep / SIGSTOP)', () => {
        const clock = new FakeClock();
        const m = new SuspensionMonitor(1000, 5000, clock.Now);
        m.Start();
        clock.T += 1000;
        m.Sample();
        clock.T += 600_000 + 1000; // ten minutes frozen, then the overdue tick
        m.Sample();
        clock.T += 1000;
        m.Sample();
        m.Stop();
        expect(m.StalledMs).toBe(600_000);
        expect(m.LongestStallMs).toBe(600_000);
    });

    it('sums separate stalls and keeps the longest', () => {
        const clock = new FakeClock();
        const m = new SuspensionMonitor(1000, 5000, clock.Now);
        m.Start();
        clock.T += 1000 + 10_000;
        m.Sample();
        clock.T += 1000 + 30_000;
        m.Sample();
        m.Stop();
        expect(m.StalledMs).toBe(40_000);
        expect(m.LongestStallMs).toBe(30_000);
    });

    it('Stop takes a final sample so a stall that ended after the last tick is still counted', () => {
        const clock = new FakeClock();
        const m = new SuspensionMonitor(1000, 5000, clock.Now);
        m.Start();
        clock.T += 1000 + 20_000;
        m.Stop();
        expect(m.StalledMs).toBe(20_000);
    });

    it('Start resets the totals of an earlier measurement', () => {
        const clock = new FakeClock();
        const m = new SuspensionMonitor(1000, 5000, clock.Now);
        m.Start();
        clock.T += 1000 + 20_000;
        m.Stop();
        m.Start();
        clock.T += 1000;
        m.Stop();
        expect(m.StalledMs).toBe(0);
    });

    it('its ticker samples on its own while started and stops after Stop', () => {
        vi.useFakeTimers();
        const m = new SuspensionMonitor(1000, 5000);
        m.Start();
        vi.advanceTimersByTime(1000);
        // Jump the wall clock as a sleep would, then let the overdue tick run.
        vi.setSystemTime(Date.now() + 60_000);
        vi.advanceTimersByTime(1000);
        expect(m.StalledMs).toBe(60_000);
        m.Stop();
        expect(vi.getTimerCount()).toBe(0);
    });
});

describe('IntegrationTestDriver.BudgetExceededMessage', () => {
    it('keeps the hung-check wording when the event loop ran the whole time', () => {
        const msg = IntegrationTestDriver.BudgetExceededMessage('b.C1', 290_000, 0, 295_000);
        expect(msg).toBe("check 'b.C1' exceeded the 290000ms remaining run budget (hung check)");
    });

    it('names the suspension, with its length, instead of calling it a hung check', () => {
        const msg = IntegrationTestDriver.BudgetExceededMessage('b.C1', 290_000, 912_400, 1_000_000);
        expect(msg).not.toMatch(/\(hung check\)/);
        expect(msg).toMatch(/did not run for 912s/);
        expect(msg).toMatch(/host sleep/);
    });

    it('keeps the hung-check wording and notes the stall when the stall does not explain the overrun', () => {
        const msg = IntegrationTestDriver.BudgetExceededMessage('b.C1', 290_000, 6_000, 300_000);
        expect(msg).toContain('(hung check)');
        expect(msg).toContain('(also stalled 6s)');
        expect(msg).not.toMatch(/did not run for/);
    });
});
