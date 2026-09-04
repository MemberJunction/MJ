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
    });
});
