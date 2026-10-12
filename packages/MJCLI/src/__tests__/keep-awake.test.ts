import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';
import { KeepAwakeForCommand, SleepNoticeForCommand, KEEP_AWAKE_COMMANDS, KEEP_AWAKE_OPT_OUT_ENV_VAR, type KeepAwakeEnvironment } from '../lib/keep-awake';

function fakeChild(): EventEmitter & { unref: ReturnType<typeof vi.fn> } {
    return Object.assign(new EventEmitter(), { unref: vi.fn() });
}

function environment(overrides: Partial<KeepAwakeEnvironment> = {}): KeepAwakeEnvironment & { Spawn: ReturnType<typeof vi.fn> } {
    const spawnMock = vi.fn(() => fakeChild());
    return { Platform: 'darwin', Env: {}, Pid: 4242, Spawn: spawnMock as unknown as typeof spawn, ...overrides } as KeepAwakeEnvironment & {
        Spawn: ReturnType<typeof vi.fn>;
    };
}

describe('KeepAwakeForCommand', () => {
    it('holds a caffeinate assertion tied to the CLI pid for long database commands on macOS', () => {
        for (const id of ['install', 'app:install', 'app:upgrade', 'migrate']) {
            const env = environment();
            expect(KeepAwakeForCommand(id, env)).toBe(true);
            expect(env.Spawn).toHaveBeenCalledWith('caffeinate', ['-i', '-s', '-w', '4242'], { stdio: 'ignore' });
        }
        expect([...KEEP_AWAKE_COMMANDS].sort()).toEqual(['app:install', 'app:upgrade', 'install', 'migrate']);
    });

    it('does not keep the CLI alive for its sake', () => {
        const child = fakeChild();
        const env = environment({ Spawn: vi.fn(() => child) as unknown as typeof spawn });
        KeepAwakeForCommand('app:install', env);
        expect(child.unref).toHaveBeenCalled();
    });

    it('does nothing for other commands or other platforms', () => {
        const env = environment();
        expect(KeepAwakeForCommand('sync:push', env)).toBe(false);
        expect(KeepAwakeForCommand('version', env)).toBe(false);
        for (const platform of ['linux', 'win32'] as const) {
            expect(KeepAwakeForCommand('app:install', environment({ Platform: platform }))).toBe(false);
        }
        expect(env.Spawn).not.toHaveBeenCalled();
    });

    it('honours the opt-out', () => {
        for (const value of ['1', 'true', 'TRUE', ' 1 ']) {
            const env = environment({ Env: { [KEEP_AWAKE_OPT_OUT_ENV_VAR]: value } });
            expect(KeepAwakeForCommand('app:install', env)).toBe(false);
            expect(env.Spawn).not.toHaveBeenCalled();
        }
        expect(KeepAwakeForCommand('app:install', environment({ Env: { [KEEP_AWAKE_OPT_OUT_ENV_VAR]: '0' } }))).toBe(true);
    });

    it('never throws, even when caffeinate cannot start', () => {
        const throwing = environment({ Spawn: vi.fn(() => { throw new Error('ENOENT'); }) as unknown as typeof spawn });
        expect(KeepAwakeForCommand('install', throwing)).toBe(false);

        const child = fakeChild();
        const erroring = environment({ Spawn: vi.fn(() => child) as unknown as typeof spawn });
        expect(KeepAwakeForCommand('install', erroring)).toBe(true);
        expect(() => child.emit('error', new Error('spawn caffeinate ENOENT'))).not.toThrow();
    });
});

describe('SleepNoticeForCommand', () => {
    it('warns about sleep at the start of every long database command', () => {
        for (const id of KEEP_AWAKE_COMMANDS) {
            expect(SleepNoticeForCommand(id, false)).toMatch(/Don't let this machine sleep/);
            expect(SleepNoticeForCommand(id, true)).toMatch(/keeping this Mac awake.*closing the lid/);
        }
    });

    it('says nothing for short commands', () => {
        expect(SleepNoticeForCommand('sync:push', false)).toBeUndefined();
        expect(SleepNoticeForCommand('version', true)).toBeUndefined();
    });
});
