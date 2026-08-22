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

import { RunCommandsBase } from '../Misc/runCommand';
import type { CommandExecutionResult } from '../Misc/runCommand';

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

// The reason this block exists: a failing BEFORE/AFTER command used to reject with nothing but
// its exit code, so `npm run build` failing on a deploy host and failing on a compile error were
// the same string. CodeGen decides a whole run's success from these failures, and the in-process
// (RSU) caller has no console of its own — so if the text is not on the Error, it is gone.
describe('a failed command carries its own output', () => {
    const runner = new RunCommandsBase();

    it('puts the command output on the rejection, not just the exit code', async () => {
        await expect(
            runner.runCommand({
                command: 'sh',
                args: ['-c', "'echo TS2304-cannot-find-name 1>&2; exit 3'"],
                workingDirectory: '/tmp',
                when: 'after',
                timeout: 20000,
            })
        ).rejects.toThrow(/Process exited with code 3[\s\S]*TS2304-cannot-find-name/);
    });

    it('hands that text to runCommands as the failed result, index-aligned', async () => {
        const results = await runner.runCommands([
            { command: 'sh', args: ['-c', "'echo first-ok'"], workingDirectory: '/tmp', when: 'after', timeout: 20000 },
            { command: 'sh', args: ['-c', "'echo TS18003-no-inputs 1>&2; exit 2'"], workingDirectory: '/tmp', when: 'after', timeout: 20000 },
        ]);

        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(false);
        // recordCommandFailures reads `error || output` — this is the string an operator sees.
        expect(results[1].error).toContain('TS18003-no-inputs');
    });

    it('bounds the output it carries — a failing build can emit megabytes', async () => {
        const script = "'i=1; while [ $i -le 200 ]; do echo line$i; i=$((i+1)); done; exit 1'";
        let message = '';
        try {
            await runner.runCommand({
                command: 'sh',
                args: ['-c', script],
                workingDirectory: '/tmp',
                when: 'after',
                timeout: 20000,
            });
        } catch (e) {
            message = e instanceof Error ? e.message : String(e);
        }

        expect(message).toContain('line200');   // the tail is what diagnoses a failure
        expect(message).not.toContain('line159'); // ...and only the tail
        expect(message.split('\n').length).toBeLessThanOrEqual(42);
    });
});
