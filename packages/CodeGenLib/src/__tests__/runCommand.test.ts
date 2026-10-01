import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
vi.mock('../Misc/status_logging', () => ({
    logError: vi.fn(),
    logStatus: vi.fn()
}));

vi.mock('tree-kill', () => ({
    default: vi.fn()
}));

// Partially mock @memberjunction/global: stub RegisterClass as a no-op, but
// preserve every other real export. runCommand.ts transitively imports
// @memberjunction/core, whose baseEngine.ts does `extends BaseSingleton` at
// module load — a full replacement mock would make BaseSingleton undefined and
// throw during collection.
vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

vi.mock('@memberjunction/generic-database-provider', () => ({
    resolveDbPlatformFromEnv: vi.fn().mockReturnValue(undefined),
}));

import { RunCommandsBase, formatCommandFailureDetail } from '../Misc/runCommand';
import type { CommandExecutionResult } from '../Misc/runCommand';

describe('formatCommandFailureDetail', () => {
    it('keeps the last lines of a long diagnostic', () => {
        const lines = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`);
        const detail = formatCommandFailureDetail({
            output: lines.join('\n'),
            error: 'Process exited with code 2',
            success: false,
            elapsedTime: 10,
        }, 5);
        expect(detail).toMatch(/Process exited with code 2/);
        expect(detail).toMatch(/line 80/);
        expect(detail).not.toMatch(/line 1\b/);
        expect(detail.startsWith('Process exited with code 2')).toBe(true);
    });
});

describe('CommandExecutionResult type', () => {
    it('should represent a successful command', () => {
        const result: CommandExecutionResult = {
            output: 'Build completed',
            error: '',
            success: true,
            elapsedTime: 5000
        };
        expect(result.success).toBe(true);
        expect(result.elapsedTime).toBe(5000);
    });

    it('should represent a failed command', () => {
        const result: CommandExecutionResult = {
            output: '',
            error: 'Command not found',
            success: false,
            elapsedTime: 100
        };
        expect(result.success).toBe(false);
        expect(result.error).toBe('Command not found');
    });

    it('should track elapsed time', () => {
        const result: CommandExecutionResult = {
            output: 'done',
            error: '',
            success: true,
            elapsedTime: 12345
        };
        expect(result.elapsedTime).toBe(12345);
    });
});

describe('RunCommandsBase', () => {
    let runner: RunCommandsBase;

    beforeEach(() => {
        runner = new RunCommandsBase();
        vi.clearAllMocks();
    });

    describe('runCommands', () => {
        it('should be a function', () => {
            expect(typeof runner.runCommands).toBe('function');
        });

        it('should return an array', async () => {
            // Empty commands array should return empty results
            const results = await runner.runCommands([]);
            expect(Array.isArray(results)).toBe(true);
            expect(results).toHaveLength(0);
        });

        it('should handle errors in individual commands without failing entire batch', async () => {
            // The runCommand will fail because the command doesn't exist, but runCommands catches it
            const results = await runner.runCommands([
                { command: 'nonexistent-command-xyz', args: [], workingDirectory: '/tmp', when: 'test', timeout: 1000 }
            ]);
            // The error is caught and logged, not propagated
            expect(results).toBeDefined();
        });
    });

    describe('runCommand', () => {
        it('should be a function', () => {
            expect(typeof runner.runCommand).toBe('function');
        });

        it('treats a zero exit as success even when stderr contains the word ERROR', async () => {
            // runCommand concatenates command+args and spawn()s with shell:true,
            // so quoting inside `args` is not preserved. Put the whole line in
            // `command` — that is how AFTER entries in mj.config.cjs are invoked.
            const result = await runner.runCommand({
                command: 'printf "%s\\n" "error TS0000 is a word in the log" >&2',
                args: [],
                workingDirectory: '/tmp',
                when: 'test',
                timeout: 5000,
            });
            expect(result.success).toBe(true);
            expect(result.output).toMatch(/error TS0000/i);
        });

        it('resolves a non-zero exit as success:false and keeps captured output', async () => {
            const result = await runner.runCommand({
                command: 'printf "%s\\n" "error TS2307: cannot find module" >&2; exit 2',
                args: [],
                workingDirectory: '/tmp',
                when: 'test',
                timeout: 5000,
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/exited with code 2/i);
            expect(result.output).toMatch(/error TS2307/i);
            expect(formatCommandFailureDetail(result)).toMatch(/error TS2307/i);
        });

        it('keeps running later commands after a non-zero exit', async () => {
            const results = await runner.runCommands([
                { command: 'false', args: [], workingDirectory: '/tmp', when: 'test', timeout: 5000 },
                { command: 'true', args: [], workingDirectory: '/tmp', when: 'test', timeout: 5000 },
            ]);
            expect(results).toHaveLength(2);
            expect(results[0].success).toBe(false);
            expect(results[1].success).toBe(true);
        });

        it('should reject for invalid commands', async () => {
            const command = {
                command: 'echo',
                args: ['hello'],
                workingDirectory: '/tmp',
                when: 'test',
                timeout: 5000
            };
            // This will attempt to actually spawn, so we test the structure
            try {
                const result = await runner.runCommand(command);
                // If it succeeds (echo exists), check the result shape
                expect(result).toHaveProperty('output');
                expect(result).toHaveProperty('success');
                expect(result).toHaveProperty('elapsedTime');
            } catch (error) {
                // If it fails (in restricted environments), that's expected
                expect(error).toBeDefined();
            }
        });

        it('treats a daemon that stays up for its whole timeout as success', async () => {
            // `npm start` in MJAPI is a server: it cannot exit on its own, so the
            // timeout is the only way it can ever end. Before isDaemon existed the
            // timeout path hardcoded success:false, so a fully working install
            // reported "Installation failed". See #4562.
            const result = await runner.runCommand({
                command: 'sleep 5',
                args: [],
                workingDirectory: '/tmp',
                when: 'test',
                timeout: 300,
                isDaemon: true,
            });
            expect(result.success).toBe(true);
            expect(result.elapsedTime).toBeGreaterThanOrEqual(250);
        });

        it('still fails a non-daemon command that times out', async () => {
            const result = await runner.runCommand({
                command: 'sleep 5',
                args: [],
                workingDirectory: '/tmp',
                when: 'test',
                timeout: 300,
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/timed out/i);
        });

        it('fails a daemon that exits before its timeout', async () => {
            // A service that comes down on its own crashed; the timeout never fires.
            const result = await runner.runCommand({
                command: 'printf "%s\\n" "EADDRINUSE: port 4000 already in use" >&2; exit 1',
                args: [],
                workingDirectory: '/tmp',
                when: 'test',
                timeout: 5000,
                isDaemon: true,
            });
            expect(result.success).toBe(false);
            expect(result.output).toMatch(/EADDRINUSE/);
        });

        it('fails a daemon that exits ZERO before its timeout', async () => {
            // The sibling test above covers a non-zero exit. This is the case that
            // actually bites: MJAPI's entry point is
            // `createMJServer({ resolverPaths }).catch(console.error)`, so a boot
            // failure is caught and logged and never re-thrown, and Node then exits
            // 0 once the event loop drains. Staying up IS the assertion, so any
            // close before the timeout is a failure whatever the code — otherwise a
            // server that never came up is reported as a passing boot check, which
            // is the inverse of the bug isDaemon was added to fix.
            const result = await runner.runCommand({
                command: 'printf "%s\\n" "boot failed: invalid DB credentials" >&2; exit 0',
                args: [],
                workingDirectory: '/tmp',
                when: 'test',
                timeout: 5000,
                isDaemon: true,
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/exited/i);
            expect(result.output).toMatch(/boot failed/);
        });

        it('does not report a daemon failure for the kill it performed itself', async () => {
            // Reaching the timeout is the PASS, and we kill the child to end the
            // observation window — so its `close` event fires moments later with
            // whatever code the kill produced. That close must stay silent: logging
            // "Daemon exited ... instead of staying up" right after a successful boot
            // check tells the operator the opposite of what happened.
            // tree-kill is mocked file-wide, so by default nothing is actually killed
            // and the child's close event never arrives — which would make this test
            // pass without exercising anything. Give the mock a real kill for this case.
            const treeKill = (await import('tree-kill')).default;
            vi.mocked(treeKill).mockImplementation(((pid: number) => {
                try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
            }) as unknown as typeof treeKill);

            const errors: string[] = [];
            const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
                errors.push(args.map(String).join(' '));
            });
            try {
                const result = await runner.runCommand({
                    command: 'sleep 5',
                    args: [],
                    workingDirectory: '/tmp',
                    when: 'test',
                    timeout: 300,
                    isDaemon: true,
                });
                expect(result.success).toBe(true);
                // Give the child's close event time to arrive after treeKill.
                await new Promise((r) => setTimeout(r, 500));
                // Assert on FAILED, not just the daemon wording: skipping the daemon
                // branch still fell through to the generic non-zero path, which printed
                // `FAILED: … (Process exited with code null)` directly under the
                // STAYED UP line. A narrower assertion passes while the log still
                // says pass and fail back to back.
                expect(errors.join('\n')).not.toMatch(/FAILED/i);
            } finally {
                spy.mockRestore();
            }
        });

        it('rejects a daemon with no timeout instead of waiting forever', async () => {
            const result = await runner.runCommand({
                command: 'sleep 30',
                args: [],
                workingDirectory: '/tmp',
                when: 'test',
                isDaemon: true,
            });
            expect(result.success).toBe(false);
            expect(result.error).toMatch(/isDaemon/i);
            expect(result.error).toMatch(/timeout/i);
        });
    });
});
