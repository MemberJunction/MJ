/**
 * @fileoverview Tests for the adapter interfaces and their default implementations.
 */

import { describe, it, expect, vi } from 'vitest';

import {
    ConsoleNotificationAdapter,
    type NotificationLevel,
} from '../adapters/INotificationAdapter';
import { NoOpActiveTaskTracker } from '../adapters/IActiveTaskTracker';

describe('ConsoleNotificationAdapter (default INotificationAdapter)', () => {
    it('routes error to console.error', () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            new ConsoleNotificationAdapter().Notify('error', 'boom');
            expect(spy).toHaveBeenCalledOnce();
            expect(spy.mock.calls[0][0]).toContain('boom');
        } finally {
            spy.mockRestore();
        }
    });

    it('routes warning to console.warn', () => {
        const spy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        try {
            new ConsoleNotificationAdapter().Notify('warning', 'careful');
            expect(spy).toHaveBeenCalledOnce();
            expect(spy.mock.calls[0][0]).toContain('careful');
        } finally {
            spy.mockRestore();
        }
    });

    it('routes info and success to console.log', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            const adapter = new ConsoleNotificationAdapter();
            adapter.Notify('info', 'hello');
            adapter.Notify('success', 'done');
            expect(spy).toHaveBeenCalledTimes(2);
        } finally {
            spy.mockRestore();
        }
    });

    it('includes the ttl in the message when supplied', () => {
        const spy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        try {
            new ConsoleNotificationAdapter().Notify('info', 'with ttl', 1234);
            expect(spy.mock.calls[0][0]).toContain('ttl=1234ms');
        } finally {
            spy.mockRestore();
        }
    });

    it('handles all NotificationLevel values without throwing', () => {
        const adapter = new ConsoleNotificationAdapter();
        const levels: NotificationLevel[] = ['info', 'success', 'warning', 'error'];
        const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            for (const level of levels) {
                expect(() => adapter.Notify(level, `test-${level}`)).not.toThrow();
            }
        } finally {
            consoleLog.mockRestore();
            consoleWarn.mockRestore();
            consoleError.mockRestore();
        }
    });
});

describe('NoOpActiveTaskTracker (default IActiveTaskTracker)', () => {
    it('returns false from RemoveByAgentRunId — truthful "nothing tracked" answer', () => {
        const tracker = new NoOpActiveTaskTracker();
        expect(tracker.RemoveByAgentRunId('any-id')).toBe(false);
    });

    it('does not throw under any input', () => {
        const tracker = new NoOpActiveTaskTracker();
        expect(() => tracker.RemoveByAgentRunId('')).not.toThrow();
        expect(() => tracker.RemoveByAgentRunId('arbitrary-uuid')).not.toThrow();
    });
});
