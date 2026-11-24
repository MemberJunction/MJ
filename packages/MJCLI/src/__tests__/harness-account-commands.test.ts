import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@oclif/core';
import {
    HARNESS_ACCOUNT_POOL_DIR_ENV_VAR,
    HarnessAccountPoolService,
    type InteractiveLoginCommandSpec,
} from '@memberjunction/ai-agent-harness';
import HarnessAccountAdd from '../commands/harness/account/add.js';
import HarnessAccountClearCooldown from '../commands/harness/account/clear-cooldown.js';
import HarnessAccountDisable from '../commands/harness/account/disable.js';
import HarnessAccountEnable from '../commands/harness/account/enable.js';
import HarnessAccountList from '../commands/harness/account/list.js';
import HarnessAccountLogin from '../commands/harness/account/login.js';
import HarnessAccountRemove from '../commands/harness/account/remove.js';
import HarnessAccountSetStrategy from '../commands/harness/account/set-strategy.js';
import {
    BuildInteractiveLoginEnv,
    FormatHarnessAccountTable,
    RequireHarnessStrategy,
    RequireHarnessVendor,
    RunInteractiveCliLogin,
    type HarnessAccountListJsonOutput,
} from '../lib/harness-account.js';

function createFakeOclifConfig(): Config {
    return {
        bin: 'mj',
        runHook: vi.fn().mockResolvedValue({ successes: [], failures: [] }),
        pjson: { name: '@memberjunction/cli', version: '6.3.0-edge.1', oclif: {} },
    } as unknown as Config;
}

interface CommandInstance {
    run(): Promise<void>;
    log(message?: string): void;
    warn(input: string | Error): string | Error;
}

async function runOclifCommand<T extends CommandInstance>(
    Ctor: new (argv: string[], config: Config) => T,
    argv: string[],
): Promise<{ logs: string[]; warnings: string[] }> {
    const logs: string[] = [];
    const warnings: string[] = [];
    const instance = new Ctor(argv, createFakeOclifConfig());
    vi.spyOn(instance, 'log').mockImplementation((msg?: string) => {
        if (msg !== undefined) {
            logs.push(String(msg));
        }
    });
    vi.spyOn(instance, 'warn').mockImplementation((msg: string | Error) => {
        warnings.push(msg instanceof Error ? msg.message : String(msg));
        return msg;
    });
    await instance.run();
    return { logs, warnings };
}

describe('mj harness account commands', () => {
    const tempDirs: string[] = [];
    let poolDir: string;
    let fakeHome: string;
    let origPoolDir: string | undefined;
    let origHome: string | undefined;

    beforeEach(() => {
        origPoolDir = process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR];
        origHome = process.env.HOME;
        poolDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-cli-harness-pool-'));
        fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mj-cli-harness-home-'));
        tempDirs.push(poolDir, fakeHome);
        process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR] = poolDir;
        process.env.HOME = fakeHome;
        HarnessAccountAdd.loginRunner = RunInteractiveCliLogin;
        HarnessAccountLogin.loginRunner = RunInteractiveCliLogin;
    });

    afterEach(() => {
        HarnessAccountAdd.loginRunner = RunInteractiveCliLogin;
        HarnessAccountLogin.loginRunner = RunInteractiveCliLogin;
        vi.restoreAllMocks();
        if (origPoolDir === undefined) {
            delete process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR];
        } else {
            process.env[HARNESS_ACCOUNT_POOL_DIR_ENV_VAR] = origPoolDir;
        }
        if (origHome === undefined) {
            delete process.env.HOME;
        } else {
            process.env.HOME = origHome;
        }
        while (tempDirs.length > 0) {
            const dir = tempDirs.pop();
            if (dir) {
                fs.rmSync(dir, { recursive: true, force: true });
            }
        }
    });

    it('validates vendor and strategy parsers and strips API keys from interactive login env', () => {
        expect(RequireHarnessVendor('claude-code')).toBe('claude');
        expect(RequireHarnessVendor('antigravity')).toBe('agy');
        expect(RequireHarnessVendor('openai-codex')).toBe('codex');
        expect(RequireHarnessVendor('gemini-cli')).toBe('gemini');
        expect(() => RequireHarnessVendor('nope')).toThrow(/Unknown vendor/);

        expect(RequireHarnessStrategy('weighted')).toBe('weighted');
        expect(() => RequireHarnessStrategy('bogus')).toThrow(/Invalid strategy/);

        const env = BuildInteractiveLoginEnv(
            { CLAUDE_CONFIG_DIR: '/tmp/slot-1' },
            {
                PATH: '/usr/bin',
                ANTHROPIC_API_KEY: 'sk-ant-strip-me',
                GEMINI_API_KEY: 'AIza-strip-me',
                OPENAI_API_KEY: 'sk-openai-strip-me',
            },
        );
        expect(env.CLAUDE_CONFIG_DIR).toBe('/tmp/slot-1');
        expect(env.ANTHROPIC_API_KEY).toBeUndefined();
        expect(env.GEMINI_API_KEY).toBeUndefined();
        expect(env.OPENAI_API_KEY).toBeUndefined();
    });

    it('enrolls a slot via `mj harness account add` with interactive login and verifies isolated env', async () => {
        const calls: Array<{ spec: InteractiveLoginCommandSpec; env: Record<string, string> }> = [];
        HarnessAccountAdd.loginRunner = (spec, env) => {
            calls.push({ spec, env });
            // Simulate `claude auth login` writing credentials into CLAUDE_CONFIG_DIR
            fs.writeFileSync(path.join(env.CLAUDE_CONFIG_DIR, '.credentials.json'), '{}', 'utf8');
            return { status: 0 };
        };

        const { logs } = await runOclifCommand(HarnessAccountAdd, [
            'claude-code',
            '--label',
            'Pro #2',
            '--weight',
            '2',
            '--priority',
            '50',
            '--pool-dir',
            poolDir,
        ]);

        expect(calls).toHaveLength(1);
        expect(calls[0].spec.command).toBe('claude');
        expect(calls[0].spec.args).toEqual(['auth', 'login']);
        expect(calls[0].env.CLAUDE_CONFIG_DIR).toContain(path.join(poolDir, 'claude'));
        expect(logs.join('\n')).toContain('auth: Ready');

        const listOut = await runOclifCommand(HarnessAccountList, [
            '--vendor',
            'claude',
            '--json',
            '--pool-dir',
            poolDir,
        ]);
        const parsed = JSON.parse(listOut.logs.join('\n')) as HarnessAccountListJsonOutput;
        expect(parsed.strategy).toBe('least-in-flight');
        expect(parsed.slots).toHaveLength(1);
        expect(parsed.slots[0].label).toBe('Pro #2');
        expect(parsed.slots[0].weight).toBe(2);
        expect(parsed.slots[0].priority).toBe(50);
        expect(parsed.slots[0].authStatus).toBe('Ready');
    });

    it('supports `--no-login` on add, plus set-strategy, disable, enable, clear-cooldown, login, and remove --purge-files', async () => {
        const loginSpy = vi.fn().mockReturnValue({ status: 0 });
        HarnessAccountAdd.loginRunner = loginSpy;

        await runOclifCommand(HarnessAccountAdd, [
            'agy',
            '--slot-id',
            'agy-team',
            '--label',
            'Team Seat',
            '--no-login',
            '--pool-dir',
            poolDir,
        ]);
        expect(loginSpy).not.toHaveBeenCalled();

        const service = HarnessAccountPoolService.Instance;
        const slot = service.GetSlot('agy-team', { poolDir });
        expect(slot).not.toBeNull();
        expect(slot?.authStatus).toBe('Needs Login');
        expect(fs.existsSync(path.join(slot!.slotDir, '.gemini'))).toBe(true);
        expect(fs.existsSync(path.join(slot!.slotDir, '.config'))).toBe(true);

        // set-strategy
        await runOclifCommand(HarnessAccountSetStrategy, ['weighted', '--pool-dir', poolDir]);
        expect(service.GetStrategy({ poolDir })).toBe('weighted');

        // disable & enable
        await runOclifCommand(HarnessAccountDisable, ['agy-team', '--pool-dir', poolDir]);
        expect(service.GetSlot('agy-team', { poolDir })?.enabled).toBe(false);
        await runOclifCommand(HarnessAccountEnable, ['agy-team', '--pool-dir', poolDir]);
        expect(service.GetSlot('agy-team', { poolDir })?.enabled).toBe(true);

        // cooldown -> clear-cooldown
        service.MarkSlotCooldown('agy-team', '429 rate limit', new Date(Date.now() + 600_000).toISOString(), { poolDir });
        expect(service.GetSlot('agy-team', { poolDir })?.inCooldown).toBe(true);
        await runOclifCommand(HarnessAccountClearCooldown, ['agy-team', '--pool-dir', poolDir]);
        expect(service.GetSlot('agy-team', { poolDir })?.inCooldown).toBe(false);

        // re-login via `mj harness account login` clears cooldown and runs `agy` with isolated HOME
        service.MarkSlotCooldown('agy-team', '429 again', new Date(Date.now() + 600_000).toISOString(), { poolDir });
        HarnessAccountLogin.loginRunner = (spec, env) => {
            expect(spec.command).toBe('agy');
            expect(env.HOME).toBe(slot!.slotDir);
            expect(env.XDG_CONFIG_HOME).toBe(path.join(slot!.slotDir, '.config'));
            fs.mkdirSync(path.join(env.HOME, '.gemini', 'antigravity'), { recursive: true });
            return { status: 0 };
        };
        await runOclifCommand(HarnessAccountLogin, ['agy-team', '--pool-dir', poolDir]);
        const afterLogin = service.GetSlot('agy-team', { poolDir });
        expect(afterLogin?.inCooldown).toBe(false);
        expect(afterLogin?.authStatus).toBe('Ready');

        // human-readable table output renders expected columns
        const table = FormatHarnessAccountTable(poolDir, 'weighted', true, [afterLogin!]);
        expect(table).toContain('SLOT ID');
        expect(table).toContain('agy-team');
        expect(table).toContain('Ready');

        // remove --purge-files deletes slot dir
        const slotDirPath = slot!.slotDir;
        await runOclifCommand(HarnessAccountRemove, ['agy-team', '--purge-files', '--pool-dir', poolDir]);
        expect(service.GetSlot('agy-team', { poolDir })).toBeNull();
        expect(fs.existsSync(slotDirPath)).toBe(false);
    });
});
