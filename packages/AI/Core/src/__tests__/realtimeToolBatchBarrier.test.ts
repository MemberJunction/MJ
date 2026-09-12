import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RealtimeToolBatchBarrier } from '../generic/realtimeToolBatchBarrier';

describe('RealtimeToolBatchBarrier', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('returns Closed=false for unknown or untracked calls', () => {
        const barrier = new RealtimeToolBatchBarrier();
        expect(barrier.Closed('untracked_call')).toBe(false);
        expect(barrier.RecordResult('untracked_call')).toBe(false);
    });

    it('completes batch when single tracked call is closed', () => {
        const barrier = new RealtimeToolBatchBarrier();
        barrier.Opened('call_1');
        expect(barrier.PendingCount).toBe(1);
        expect(barrier.IsEmpty).toBe(false);

        const isComplete = barrier.Closed('call_1');
        expect(isComplete).toBe(true);
        expect(barrier.PendingCount).toBe(0);
        expect(barrier.IsEmpty).toBe(true);
    });

    it('waits for all parallel calls to finish before returning true on the last result', () => {
        const barrier = new RealtimeToolBatchBarrier();
        barrier.Opened('call_1');
        barrier.Opened('call_2');
        barrier.Opened('call_3');
        expect(barrier.PendingCount).toBe(3);

        // Results arrive out of order: call_2 first
        expect(barrier.Closed('call_2')).toBe(false);
        expect(barrier.PendingCount).toBe(2);

        // call_1 second
        expect(barrier.Closed('call_1')).toBe(false);
        expect(barrier.PendingCount).toBe(1);

        // call_3 last -> drains barrier, returns true
        expect(barrier.Closed('call_3')).toBe(true);
        expect(barrier.PendingCount).toBe(0);
        expect(barrier.IsEmpty).toBe(true);
    });

    it('rejects duplicate results for already-closed calls without re-firing', () => {
        const barrier = new RealtimeToolBatchBarrier();
        barrier.Opened('call_1');
        expect(barrier.Closed('call_1')).toBe(true);

        // Duplicate result for call_1
        expect(barrier.Closed('call_1')).toBe(false);
    });

    it('flushes via timeout callback if a tool call does not return in time', () => {
        const barrier = new RealtimeToolBatchBarrier(5000);
        const onTimeoutFlush = vi.fn();

        barrier.Opened('call_1', onTimeoutFlush);
        barrier.Opened('call_2');

        // Only call_1 completes
        expect(barrier.Closed('call_1')).toBe(false);
        expect(onTimeoutFlush).not.toHaveBeenCalled();

        // Fast forward 5s -> timeout fires
        vi.advanceTimersByTime(5000);

        expect(onTimeoutFlush).toHaveBeenCalledTimes(1);
        expect(barrier.PendingCount).toBe(0);
        expect(barrier.IsEmpty).toBe(true);

        // If call_2 arrives late after timeout, it is treated as already-drained and returns false
        expect(barrier.Closed('call_2')).toBe(false);
    });

    it('Reset() and Clear() cancel timeout and clear pending calls', () => {
        const barrier = new RealtimeToolBatchBarrier(5000);
        const onTimeoutFlush = vi.fn();

        barrier.Opened('call_1', onTimeoutFlush);
        expect(barrier.PendingCount).toBe(1);

        barrier.Reset();
        expect(barrier.PendingCount).toBe(0);
        expect(barrier.IsEmpty).toBe(true);

        vi.advanceTimersByTime(10000);
        expect(onTimeoutFlush).not.toHaveBeenCalled();
    });

    it('ArmTimeout allows configuring a custom timeout window', () => {
        const barrier = new RealtimeToolBatchBarrier(15000);
        const onTimeoutFlush = vi.fn();

        barrier.Opened('call_x');
        barrier.ArmTimeout(2000, onTimeoutFlush);

        vi.advanceTimersByTime(1999);
        expect(onTimeoutFlush).not.toHaveBeenCalled();

        vi.advanceTimersByTime(1);
        expect(onTimeoutFlush).toHaveBeenCalledTimes(1);
    });
});
