/**
 * RunPackageInstallAsync runs the package manager as a child process the event loop keeps
 * servicing (the sync form froze the whole host for the length of the install), with a
 * configurable ceiling and an error that names the real cause.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('node:fs', () => ({
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn(() => false),
    readdirSync: vi.fn(() => []),
}));
vi.mock('node:child_process', () => ({
    execFileSync: vi.fn(() => ''),
    spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import {
    RunPackageInstallAsync,
    ResolvePackageInstallTimeoutMs,
    IsDefaultNpmRegistry,
    DEFAULT_PACKAGE_INSTALL_TIMEOUT_MS,
    PACKAGE_INSTALL_TIMEOUT_ENV_VAR,
} from '../install/package-manager.js';
import { DescribeUnresolvedPackages } from '../install/install-orchestrator.js';

/** A stand-in child process the test drives: emit stderr, then close or error. */
class FakeChild extends EventEmitter {
    public stderr = new EventEmitter();
    public Killed: string | undefined;
    public kill(signal: string): boolean {
        this.Killed = signal;
        queueMicrotask(() => this.emit('close', null));
        return true;
    }
}

const mockSpawn = vi.mocked(spawn);
let child: FakeChild;

beforeEach(() => {
    vi.clearAllMocks();
    child = new FakeChild();
    mockSpawn.mockReturnValue(child as unknown as ReturnType<typeof spawn>);
});

afterEach(() => {
    vi.useRealTimers();
});

describe('ResolvePackageInstallTimeoutMs', () => {
    it('defaults to 30 minutes', () => {
        expect(ResolvePackageInstallTimeoutMs({})).toBe(DEFAULT_PACKAGE_INSTALL_TIMEOUT_MS);
        expect(DEFAULT_PACKAGE_INSTALL_TIMEOUT_MS).toBe(30 * 60 * 1000);
    });

    it('honours a positive override and ignores junk', () => {
        expect(ResolvePackageInstallTimeoutMs({ [PACKAGE_INSTALL_TIMEOUT_ENV_VAR]: '90000' })).toBe(90000);
        for (const junk of ['0', '-5', 'abc', '']) {
            expect(ResolvePackageInstallTimeoutMs({ [PACKAGE_INSTALL_TIMEOUT_ENV_VAR]: junk })).toBe(DEFAULT_PACKAGE_INSTALL_TIMEOUT_MS);
        }
    });
});

describe('RunPackageInstallAsync', () => {
    it('runs the package manager with no shell and resolves on exit 0', async () => {
        const pending = RunPackageInstallAsync('/repo', false, undefined, 'pnpm', 60_000);
        child.emit('close', 0);
        const result = await pending;

        expect(result.Success).toBe(true);
        expect(result.InstallRoot).toBe('/repo');
        const [bin, argv, options] = mockSpawn.mock.calls[0];
        expect(bin).toBe(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm');
        expect(argv).toEqual(['install']);
        expect(options).toMatchObject({ cwd: '/repo' });
        expect((options as { shell?: boolean }).shell).toBeUndefined();
    });

    it('reports a non-zero exit with the tail of stderr', async () => {
        const pending = RunPackageInstallAsync('/repo', false, undefined, 'pnpm', 60_000);
        child.stderr.emit('data', Buffer.from('ERR_PNPM_FETCH_404  GET https://registry/x: Not Found'));
        child.emit('close', 1);
        const result = await pending;

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('pnpm install failed (exit code 1)');
        expect(result.ErrorMessage).toContain('ERR_PNPM_FETCH_404');
    });

    it('stops the install at the timeout and says how to finish it', async () => {
        vi.useFakeTimers();
        const pending = RunPackageInstallAsync('/repo', false, undefined, 'pnpm', 120_000);
        await vi.advanceTimersByTimeAsync(120_000);
        vi.useRealTimers();
        const result = await pending;

        expect(child.Killed).toBe('SIGTERM');
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('did not finish within 2 minute(s)');
        expect(result.ErrorMessage).toContain("Run 'pnpm install' in /repo");
        expect(result.ErrorMessage).toContain(PACKAGE_INSTALL_TIMEOUT_ENV_VAR);
    });

    it('reports a package manager that cannot start', async () => {
        const pending = RunPackageInstallAsync('/repo', false, undefined, 'pnpm', 60_000);
        child.emit('error', new Error('spawn pnpm ENOENT'));
        const result = await pending;

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toBe('pnpm install could not start: spawn pnpm ENOENT');
    });

    it('rejects a hostile registry URL without spawning anything', async () => {
        const result = await RunPackageInstallAsync('/repo', false, 'https://evil.com; rm -rf ~', 'pnpm', 60_000);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain('Invalid custom registry URL');
        expect(mockSpawn).not.toHaveBeenCalled();
    });
});

describe('IsDefaultNpmRegistry', () => {
    it('accepts the public npm registry by host', () => {
        expect(IsDefaultNpmRegistry('https://registry.npmjs.org')).toBe(true);
        expect(IsDefaultNpmRegistry('https://registry.npmjs.org/')).toBe(true);
        expect(IsDefaultNpmRegistry('https://REGISTRY.npmjs.org/some/path')).toBe(true);
    });

    it('rejects look-alikes a substring test would accept', () => {
        expect(IsDefaultNpmRegistry('https://evil.example/registry.npmjs.org')).toBe(false);
        expect(IsDefaultNpmRegistry('https://registry.npmjs.org.evil.example')).toBe(false);
        expect(IsDefaultNpmRegistry('https://evil.example/?r=registry.npmjs.org')).toBe(false);
        expect(IsDefaultNpmRegistry('not a url registry.npmjs.org')).toBe(false);
    });

    it('passes a look-alike to the package manager as a custom registry', async () => {
        const pending = RunPackageInstallAsync('/repo', false, 'https://registry.npmjs.org.evil.example', 'pnpm', 60_000);
        child.emit('close', 0);
        await pending;
        expect(mockSpawn.mock.calls[0][1]).toEqual(['install', '--registry=https://registry.npmjs.org.evil.example']);
    });

    it('does not pass the default registry explicitly', async () => {
        const pending = RunPackageInstallAsync('/repo', false, 'https://registry.npmjs.org', 'pnpm', 60_000);
        child.emit('close', 0);
        await pending;
        expect(mockSpawn.mock.calls[0][1]).toEqual(['install']);
    });
});

describe('DescribeUnresolvedPackages', () => {
    it('names the real remedy: install, then enable the Disabled app', () => {
        const text = DescribeUnresolvedPackages('mj-bizapps-common', 'added', 'pnpm install did not finish within 30 minute(s)');
        expect(text).toContain("'mj-bizapps-common' is left Disabled");
        expect(text).toContain("mj app enable mj-bizapps-common");
        expect(text).toContain('Detail: pnpm install did not finish');
        expect(text).not.toMatch(/npm auth/i);
    });
});
