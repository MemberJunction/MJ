/**
 * TaskStore unit tests (memory-leak fix R2-C11).
 *
 * The previous module-level `Map<string, Task>` accumulated forever — terminal
 * tasks were never removed, so memory grew quadratically with `tasks × messages
 * × artifact-bytes`. TaskStore wraps the Map and adds a periodic sweep that
 * drops terminal-state tasks past the retention window.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
    LogStatus: vi.fn(),
}));

import { TaskStore, Task, TaskStatus, TERMINAL_STATUSES } from '../TaskStore';

function makeTask(id: string, status: TaskStatus, updated: Date): Task {
    return {
        id,
        status,
        messages: [],
        artifacts: [],
        created: updated,
        updated,
    };
}

describe('TaskStore', () => {
    describe('Map-compatible surface', () => {
        it('set/get/has/delete/size mirror Map semantics', () => {
            const store = new TaskStore();
            const t = makeTask('t1', 'pending', new Date());
            expect(store.size).toBe(0);
            store.set('t1', t);
            expect(store.size).toBe(1);
            expect(store.has('t1')).toBe(true);
            expect(store.get('t1')).toBe(t);
            expect(store.delete('t1')).toBe(true);
            expect(store.delete('t1')).toBe(false);
            expect(store.size).toBe(0);
        });
    });

    describe('Sweep', () => {
        it('drops terminal tasks older than retentionMs', () => {
            const store = new TaskStore({ retentionMs: 1000 });
            const now = Date.now();
            store.set('done-old', makeTask('done-old', 'completed', new Date(now - 5000)));
            store.set('failed-old', makeTask('failed-old', 'failed', new Date(now - 5000)));
            store.set('cancelled-old', makeTask('cancelled-old', 'cancelled', new Date(now - 5000)));
            store.set('done-fresh', makeTask('done-fresh', 'completed', new Date(now)));
            store.set('pending-old', makeTask('pending-old', 'pending', new Date(now - 5000)));
            store.set('running-old', makeTask('running-old', 'in_progress', new Date(now - 5000)));

            const evicted = store.Sweep(now);
            expect(evicted).toBe(3);
            expect(store.has('done-old')).toBe(false);
            expect(store.has('failed-old')).toBe(false);
            expect(store.has('cancelled-old')).toBe(false);
            expect(store.has('done-fresh')).toBe(true);
            expect(store.has('pending-old')).toBe(true); // not terminal — never sweeps non-terminal
            expect(store.has('running-old')).toBe(true);
        });

        it('returns 0 when nothing is eligible', () => {
            const store = new TaskStore({ retentionMs: 1000 });
            store.set('a', makeTask('a', 'pending', new Date()));
            store.set('b', makeTask('b', 'completed', new Date())); // fresh
            expect(store.Sweep()).toBe(0);
            expect(store.size).toBe(2);
        });

        it('uses default retention of 1 hour', () => {
            const store = new TaskStore();
            expect(store.RetentionMs).toBe(60 * 60 * 1000);
        });
    });

    describe('Start / Shutdown', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });
        afterEach(() => {
            vi.useRealTimers();
        });

        it('Start schedules periodic sweep', () => {
            const store = new TaskStore({ sweepIntervalMs: 1000, retentionMs: 100 });
            const now = Date.now();
            store.set('old', makeTask('old', 'completed', new Date(now - 5000)));
            store.Start();
            expect(store.size).toBe(1); // not yet swept
            vi.advanceTimersByTime(1001);
            expect(store.size).toBe(0); // sweep ran
        });

        it('Start is idempotent', () => {
            const store = new TaskStore({ sweepIntervalMs: 1000, retentionMs: 100 });
            store.Start();
            store.Start(); // should not double-schedule
            const before = vi.getTimerCount();
            expect(before).toBe(1);
            store.Shutdown();
        });

        it('Shutdown clears the timer and drops all tasks', () => {
            const store = new TaskStore({ sweepIntervalMs: 1000 });
            store.set('a', makeTask('a', 'pending', new Date()));
            store.Start();
            expect(vi.getTimerCount()).toBe(1);
            store.Shutdown();
            expect(vi.getTimerCount()).toBe(0);
            expect(store.size).toBe(0);
        });

        it('Shutdown is idempotent', () => {
            const store = new TaskStore();
            store.Start();
            store.Shutdown();
            store.Shutdown(); // should not throw
            expect(store.size).toBe(0);
        });

        it('exposes ShutdownName for diagnostics', () => {
            const store = new TaskStore();
            expect(store.ShutdownName).toBe('A2AServer.TaskStore');
        });
    });

    it('TERMINAL_STATUSES is exhaustive', () => {
        expect(TERMINAL_STATUSES.has('completed')).toBe(true);
        expect(TERMINAL_STATUSES.has('cancelled')).toBe(true);
        expect(TERMINAL_STATUSES.has('failed')).toBe(true);
        expect(TERMINAL_STATUSES.has('pending')).toBe(false);
        expect(TERMINAL_STATUSES.has('in_progress')).toBe(false);
    });
});
