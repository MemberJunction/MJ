import { describe, it, expect } from 'vitest';
import { EventEmitter } from 'node:events';
import { RunUntilStopped, WorkerStartFailure } from '../lib/work-queue/queue-worker.js';
import type { StoppableWorkHost } from '../lib/work-queue/queue-worker.js';

function health(states: Array<[string, 'Running' | 'Paused' | 'Unsupported' | 'HandlerNotRegistered' | 'Error', string | null]>) {
    return { InstanceID: 'job', Subscriptions: states.map(([Name, State, Reason]) => ({ Name, State, Reason, InFlight: 0 })) };
}

describe('WorkerStartFailure', () => {
    it('is null when at least one requested subscription is Running', () => {
        expect(WorkerStartFailure(health([['a', 'Running', null], ['b', 'Paused', 'Subscription status is Paused']]), '*')).toBeNull();
    });

    it('counts a subscription that ran and was then shut down (the state RunOnce leaves behind)', () => {
        expect(WorkerStartFailure(health([['a', 'Paused', 'Host is shut down']]), 'a')).toBeNull();
    });

    it('names every reason when nothing could run', () => {
        expect(WorkerStartFailure(health([['venue-import', 'HandlerNotRegistered', "No BaseWorkHandler is registered for HandlerKey 'venue.import'"]]), 'venue-import'))
            .toBe("No subscription is running for 'venue-import': venue-import is HandlerNotRegistered (No BaseWorkHandler is registered for HandlerKey 'venue.import')");
        expect(WorkerStartFailure(health([['nope', 'Error', "Subscription 'nope' not found"]]), 'nope')).toContain("nope is Error (Subscription 'nope' not found)");
        expect(WorkerStartFailure(health([['email.ordered', 'Unsupported', 'Ordered requires the Database transport']]), 'email.ordered')).toContain('Unsupported');
    });

    it('does not fail for a subscription an operator paused, but fails when nothing matched at all', () => {
        expect(WorkerStartFailure(health([['a', 'Paused', 'Subscription status is Paused']]), 'a')).toBeNull();
        expect(WorkerStartFailure(health([]), '*')).toBe("No subscription is running for '*': no MJWorker subscriptions matched");
    });
});

describe('RunUntilStopped', () => {
    function host(): StoppableWorkHost & { Shutdowns: number } {
        const h = { Shutdowns: 0, Shutdown: async (): Promise<void> => { h.Shutdowns++; } };
        return h;
    }

    it('shuts the host down on SIGTERM and removes its listeners', async () => {
        const signals = new EventEmitter();
        const h = host();
        const run = RunUntilStopped(h, new Promise<void>(() => undefined), signals);
        signals.emit('SIGTERM');
        expect(await run).toBe('Signal');
        expect(h.Shutdowns).toBe(1);
        expect(signals.listenerCount('SIGTERM') + signals.listenerCount('SIGINT')).toBe(0);
    });

    it('returns Finished when the work ends first, still removing its listeners', async () => {
        const signals = new EventEmitter();
        const h = host();
        expect(await RunUntilStopped(h, Promise.resolve(), signals)).toBe('Finished');
        expect(h.Shutdowns).toBe(0);
        expect(signals.listenerCount('SIGTERM') + signals.listenerCount('SIGINT')).toBe(0);
    });
});
