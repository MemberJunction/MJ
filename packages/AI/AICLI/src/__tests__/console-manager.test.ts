/**
 * Unit tests for ConsoleManager: while an agent runs, framework console output must stay off
 * stdout — dropped normally, sent to stderr under --verbose — because stdout carries the result.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConsoleManager } from '../lib/console-manager';

describe('ConsoleManager', () => {
    afterEach(() => {
        ConsoleManager.RestoreOutput();
        vi.restoreAllMocks();
    });

    it('drops console.log while suppressed and puts it back afterwards', () => {
        const originalLog = console.log;
        const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

        ConsoleManager.SuppressOutput();
        console.log('framework chatter');
        ConsoleManager.RestoreOutput();

        expect(stdout).not.toHaveBeenCalled();
        expect(console.log).toBe(originalLog);
    });

    it('sends console.log, info, warn and debug to stderr when redirected', () => {
        const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
        // console.error writes to stderr; capture it the same way the console does.
        const error = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
            process.stderr.write(args.join(' ') + '\n');
        });

        ConsoleManager.RedirectOutputToStderr();
        console.log('log line');
        console.info('info line');
        console.warn('warn line');
        console.debug('debug line');
        ConsoleManager.RestoreOutput();

        expect(stdout).not.toHaveBeenCalled();
        const written = stderr.mock.calls.map(call => String(call[0])).join('');
        expect(written).toContain('log line');
        expect(written).toContain('info line');
        expect(written).toContain('warn line');
        expect(written).toContain('debug line');
        expect(error).toHaveBeenCalledTimes(4);
        expect(ConsoleManager.IsOutputSuppressed()).toBe(false);
    });

    it('leaves an outer suppression in place rather than stacking a second one', () => {
        ConsoleManager.SuppressOutput();
        const suppressedLog = console.log;

        ConsoleManager.RedirectOutputToStderr();

        expect(console.log).toBe(suppressedLog);
        expect(ConsoleManager.IsOutputSuppressed()).toBe(true);
    });
});
