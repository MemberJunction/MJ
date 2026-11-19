import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MJTestEntity_IReplayScript } from '@memberjunction/core-entities';

const mocks = vi.hoisted(() => ({
    FlushAndExit: vi.fn(),
    Tests: [] as { ID: string; Name: string; ConfigurationObject: object }[],
}));

vi.mock('../lib/mj-provider', () => {
    const noop = vi.fn().mockResolvedValue(undefined);
    const user = vi.fn().mockResolvedValue({ ID: 'user' });
    return {
        InitializeMJProvider: noop, initializeMJProvider: noop,
        CloseMJProvider: noop, closeMJProvider: noop,
        GetContextUser: user, getContextUser: user,
    };
});
vi.mock('../utils/flush-and-exit', () => ({ FlushAndExit: mocks.FlushAndExit }));
vi.mock('@memberjunction/testing-engine', () => ({
    TestEngine: { Instance: { Config: vi.fn().mockResolvedValue(undefined), get Tests() { return mocks.Tests; } } },
}));

import { ScriptsCommand } from '../commands/scripts';

function script(steps: number): MJTestEntity_IReplayScript {
    return {
        TestId: 'T001',
        AppBuildHash: '',
        AppVersion: '6.3.0',
        GoalHash: 'goal',
        RecordedAt: '2026-11-12T00:00:00.000Z',
        Viewport: { Width: 1280, Height: 720 },
        Variables: [],
        Steps: Array.from({ length: steps }, () => ({
            Instruction: 'click',
            UrlBefore: 'http://localhost:4200/',
            Action: { Method: 'click', Target: { Role: 'button', Name: 'Save', Selector: '#save' } },
            Precondition: { WaitForTarget: true, ReadyBeacon: false },
        })),
        GoalPostconditions: [],
    };
}

let dir: string;
beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'scripts-command-'));
    mocks.FlushAndExit.mockReset();
    mocks.Tests = [{ ID: 'A1', Name: 'T001 - Login Smoke', ConfigurationObject: { PendingReplayScript: script(3) } }];
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    process.exitCode = undefined;
});
afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
    process.exitCode = undefined;
});

describe('ScriptsCommand', () => {
    it('exits after it prints the report, so the process does not stay open', async () => {
        await new ScriptsCommand().Execute({});
        expect(mocks.FlushAndExit).toHaveBeenCalledWith(0);
    });

    it('exits with 1 when no test has the --test name', async () => {
        await new ScriptsCommand().Execute({ test: 'T999 - Nope' });
        expect(mocks.FlushAndExit).toHaveBeenCalledWith(1);
    });

    it('writes the report as markdown to --output', async () => {
        const out = path.join(dir, 'drift.md');
        await new ScriptsCommand().Execute({ format: 'markdown', output: out });
        const md = readFileSync(out, 'utf8');
        expect(md).toContain('### Pending replay scripts (1)');
        expect(md).toContain('| T001 - Login Smoke | 0 | new script — 3 step(s), no promoted script to compare against |');
    });

    it('writes JSON to --output when nothing is pending', async () => {
        mocks.Tests = [{ ID: 'A1', Name: 'T001 - Login Smoke', ConfigurationObject: {} }];
        const out = path.join(dir, 'drift.json');
        await new ScriptsCommand().Execute({ format: 'json', output: out });
        expect(JSON.parse(readFileSync(out, 'utf8'))).toEqual({ PendingCount: 0, Tests: [] });
        expect(mocks.FlushAndExit).toHaveBeenCalledWith(0);
    });
});
