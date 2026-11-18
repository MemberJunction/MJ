/**
 * `mj install`: the target directory is resolved to an absolute path before the plan is
 * built (#4478), and the resume guidance names that directory (#4562).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { createPlan, run } = vi.hoisted(() => ({
    createPlan: vi.fn(async (input: { Dir: string }) => ({ Dir: input.Dir, Summarize: () => '' })),
    run: vi.fn(async () => ({ Success: false, DurationMs: 0, Warnings: [], PhasesCompleted: [], PhasesFailed: ['scaffold'] })),
}));

vi.mock('@memberjunction/installer', () => ({
    InstallerEngine: vi.fn(function () {
        return { CreatePlan: createPlan, Run: run, On: vi.fn() };
    }),
}));

import Install, { ResumeInstructions } from '../commands/install/index.js';

const packageRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('mj install --dir', () => {
    beforeEach(() => {
        createPlan.mockClear();
    });

    it('passes an absolute directory to the plan when --dir is relative (#4478)', async () => {
        const log = vi.spyOn(Install.prototype, 'log').mockImplementation(() => undefined);
        await expect(Install.run(['--dir', 'relative-host', '--yes'], packageRoot)).rejects.toThrow();
        expect(createPlan).toHaveBeenCalledWith(expect.objectContaining({ Dir: path.resolve('relative-host') }));
        log.mockRestore();
    }, 60_000);
});

describe('ResumeInstructions (#4562)', () => {
    it('names the install directory in the resume and fresh-start commands', () => {
        const lines = ResumeInstructions('/srv/mj', false);
        expect(lines[0]).toBe('Run "mj install --dir /srv/mj" to resume from the last checkpoint.');
        expect(lines[lines.length - 1]).toBe('Run "mj install --dir /srv/mj --no-resume" to start fresh.');
        expect(lines).toHaveLength(2);
    });

    it('tells a monorepo user to resume from outside the checkout', () => {
        const text = ResumeInstructions('/srv/mj', true).join('\n');
        expect(text).toContain('outside that directory');
        expect(text).toContain('workspace CLI');
    });

    it('quotes a directory containing spaces', () => {
        expect(ResumeInstructions('/Users/a b/mj', false)[0]).toContain("--dir '/Users/a b/mj'");
    });
});
