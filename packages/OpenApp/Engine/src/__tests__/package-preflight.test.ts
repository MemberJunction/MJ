/**
 * Registry preflight and package.json rollback (#3796, #5517).
 *
 * PreflightAppPackages runs `npm view <name>@<range> version --json` for every declared package
 * before an install or upgrade changes anything, and classifies auth failures and unpublished
 * packages. AddAppPackages puts back every package.json it wrote when a later target fails.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
    PreflightAppPackages,
    ClassifyNpmViewFailure,
    AddAppPackages,
    type PackagePreflightOptions,
    type PackageManagerOptions,
} from '../install/package-manager.js';

/** A stand-in `npm view` process: answers with the given stdout/stderr and exit code. */
class FakeChild extends EventEmitter {
    public stdout = new EventEmitter();
    public stderr = new EventEmitter();
    public kill(): boolean {
        return true;
    }
}

type NpmAnswer = { Code: number; Stdout?: string; Stderr?: string } | { SpawnError: string };

const mockSpawn = vi.mocked(spawn);

/** Wires spawn so each `npm view <spec>` answers from the map (default: published). */
function answerNpmView(bySpec: Record<string, NpmAnswer>): void {
    mockSpawn.mockImplementation(((_bin: string, argv: readonly string[]) => {
        const child = new FakeChild();
        const answer = bySpec[argv[1]] ?? { Code: 0, Stdout: '"1.0.0"' };
        setTimeout(() => {
            if ('SpawnError' in answer) {
                child.emit('error', new Error(answer.SpawnError));
                return;
            }
            if (answer.Stdout) child.stdout.emit('data', Buffer.from(answer.Stdout));
            if (answer.Stderr) child.stderr.emit('data', Buffer.from(answer.Stderr));
            child.emit('close', answer.Code);
        }, 0);
        return child;
    }) as unknown as typeof spawn);
}

function options(overrides: Partial<PackagePreflightOptions> = {}): PackagePreflightOptions {
    return {
        RepoRoot: '/repo',
        ServerPackages: [{ name: '@acme/server', role: 'bootstrap', startupExport: 'LoadAcme' }],
        ClientPackages: [{ name: '@acme/ng', role: 'library' }],
        SharedPackages: [{ name: '@acme/core', role: 'library' }],
        Version: '2.0.0',
        PackageManager: 'npm',
        VersionStrategy: 'semver',
        ...overrides,
    };
}

const E401 = {
    Code: 1,
    Stdout: '{"error":{"code":"E401","summary":"Unable to authenticate, need: Bearer"}}',
    Stderr: 'npm error code E401\nnpm error Unable to authenticate, need: Bearer',
};
const E404 = {
    Code: 1,
    Stdout: '{"error":{"code":"E404","summary":"Not Found - GET https://registry.npmjs.org/@acme%2fng - Not found"}}',
    Stderr: 'npm error code E404\nnpm error 404 Not Found',
};

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(existsSync).mockReturnValue(false);
    answerNpmView({});
});

describe('PreflightAppPackages', () => {
    it('runs `npm view <name>@<range> version --json` per unique package, no shell, in the repo root', async () => {
        const result = await PreflightAppPackages(options({ SharedPackages: [{ name: '@acme/server', role: 'library' }] }));

        expect(result.Success).toBe(true);
        expect(result.Checks.map((c) => c.Spec)).toEqual(['@acme/server@^2.0.0', '@acme/ng@^2.0.0']);
        const [bin, argv, spawnOptions] = mockSpawn.mock.calls[0];
        expect(bin).toBe(process.platform === 'win32' ? 'npm.cmd' : 'npm');
        expect(argv).toEqual(['view', '@acme/server@^2.0.0', 'version', '--json']);
        expect(spawnOptions).toMatchObject({ cwd: '/repo' });
        expect((spawnOptions as { shell?: boolean }).shell).toBeUndefined();
    });

    it('checks the exact version for the exact strategy and the bare name for catalog:', async () => {
        const exact = await PreflightAppPackages(options({ VersionStrategy: 'exact' }));
        expect(exact.Checks[0].Spec).toBe('@acme/server@2.0.0');

        const catalog = await PreflightAppPackages(options({ VersionStrategy: 'catalog' }));
        expect(catalog.Checks[0].Spec).toBe('@acme/server');
    });

    it('passes a custom registry and rejects a malformed one without spawning', async () => {
        await PreflightAppPackages(options({ RegistryUrl: 'https://npm.acme.dev/' }));
        expect(mockSpawn.mock.calls[0][1]).toContain('--registry=https://npm.acme.dev/');

        mockSpawn.mockClear();
        const bad = await PreflightAppPackages(options({ RegistryUrl: 'https://x.dev/$(id)' }));
        expect(bad.Success).toBe(false);
        expect(bad.ErrorMessage).toContain('Invalid custom registry URL');
        expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('fails on a 401 with a message telling the user to run npm login', async () => {
        answerNpmView({ '@acme/server@^2.0.0': E401 });

        const result = await PreflightAppPackages(options());

        expect(result.Success).toBe(false);
        expect(result.Checks.find((c) => c.Spec === '@acme/server@^2.0.0')?.Status).toBe('AuthFailed');
        expect(result.ErrorMessage).toContain("npm login");
        expect(result.ErrorMessage).toContain('@acme');
        expect(result.ErrorMessage).toContain('Nothing has been changed');
    });

    it('fails on a 404 naming the unpublished package', async () => {
        answerNpmView({ '@acme/ng@^2.0.0': E404 });

        const result = await PreflightAppPackages(options());

        expect(result.Success).toBe(false);
        expect(result.Checks.find((c) => c.Spec === '@acme/ng@^2.0.0')?.Status).toBe('NotPublished');
        expect(result.ErrorMessage).toContain('@acme/ng@^2.0.0');
        expect(result.ErrorMessage).toContain('not published');
    });

    it('reports the auth failure when both kinds occur (it explains the 404s too)', async () => {
        answerNpmView({ '@acme/server@^2.0.0': E404, '@acme/ng@^2.0.0': E401 });

        const result = await PreflightAppPackages(options());

        expect(result.ErrorMessage).toContain('npm authentication failed');
    });

    it('treats exit 0 with no output (older npm, no matching version) as not published', async () => {
        answerNpmView({ '@acme/core@^2.0.0': { Code: 0, Stdout: '' } });

        const result = await PreflightAppPackages(options());

        expect(result.Success).toBe(false);
        expect(result.Checks.find((c) => c.Spec === '@acme/core@^2.0.0')?.Status).toBe('NotPublished');
    });

    it('warns and passes when the check itself cannot run (npm missing, network)', async () => {
        answerNpmView({
            '@acme/server@^2.0.0': { SpawnError: 'spawn npm ENOENT' },
            '@acme/ng@^2.0.0': { Code: 1, Stderr: 'npm error code ECONNRESET' },
        });

        const result = await PreflightAppPackages(options());

        expect(result.Success).toBe(true);
        expect(result.Warnings).toHaveLength(2);
        expect(result.Warnings[0]).toContain('ENOENT');
    });

    it('is skipped for the workspace strategy', async () => {
        const result = await PreflightAppPackages(options({ VersionStrategy: 'workspace' }));

        expect(result.Success).toBe(true);
        expect(result.SkippedReason).toContain('workspace');
        expect(mockSpawn).not.toHaveBeenCalled();
    });

    it('is skipped when the repo is a member of an mj dev workspace', async () => {
        vi.mocked(existsSync).mockImplementation((p) => String(p) === '/ws/.mj-dev-workspace.json' || String(p) === '/ws/pnpm-workspace.yaml');
        vi.mocked(readFileSync).mockReturnValue(JSON.stringify({ generatedBy: 'mj dev workspace', members: ['repo'] }));

        const result = await PreflightAppPackages(options({ RepoRoot: '/ws/repo' }));

        expect(result.Success).toBe(true);
        expect(result.SkippedReason).toContain('/ws');
        expect(mockSpawn).not.toHaveBeenCalled();
    });
});

describe('ClassifyNpmViewFailure', () => {
    it.each([
        ['npm error code E401', 'AuthFailed'],
        ['npm ERR! code E403', 'AuthFailed'],
        ['npm error code ENEEDAUTH', 'AuthFailed'],
        ['{"error":{"code":"E404"}}', 'NotPublished'],
        ['npm error code ETIMEDOUT', 'Unknown'],
    ])('%s -> %s', (output, expected) => {
        expect(ClassifyNpmViewFailure(output)).toBe(expected);
    });
});

describe('AddAppPackages — restores written package.json files when a later target fails (#3796)', () => {
    const serverPath = '/repo/apps/Server/package.json';
    const clientPath = '/repo/apps/Client/package.json';
    const serverOriginal = '{\n  "name": "server",\n  "dependencies": {}\n}\n';

    function addOptions(): PackageManagerOptions {
        return {
            RepoRoot: '/repo',
            ServerPackages: [{ name: '@acme/server', role: 'bootstrap', startupExport: 'LoadAcme' }],
            ClientPackages: [{ name: '@acme/ng', role: 'library' }],
            SharedPackages: [],
            Version: '2.0.0',
            ServerPackagePath: 'apps/Server',
            ClientPackagePath: 'apps/Client',
            VersionStrategy: 'semver',
        };
    }

    it('puts the server package.json back when the client one cannot be updated', async () => {
        vi.mocked(readFileSync).mockImplementation((p) => (String(p) === serverPath ? serverOriginal : '{ broken'));

        const result = AddAppPackages(addOptions());

        expect(result.Success).toBe(false);
        expect(result.Added).toEqual([]);
        expect(result.ErrorMessage).toContain(`Invalid JSON in ${clientPath}`);
        expect(result.ErrorMessage).toContain('No package.json was changed');
        const serverWrites = vi.mocked(writeFileSync).mock.calls.filter((c) => c[0] === serverPath).map((c) => c[1]);
        expect(serverWrites[0]).toContain('@acme/server');
        expect(serverWrites[serverWrites.length - 1]).toBe(serverOriginal);
    });

    it('names a file it could not restore', async () => {
        vi.mocked(readFileSync).mockImplementation((p) => (String(p) === serverPath ? serverOriginal : '{ broken'));
        vi.mocked(writeFileSync).mockImplementation((p, data) => {
            if (p === serverPath && data === serverOriginal) throw new Error('EACCES');
        });

        const result = AddAppPackages(addOptions());

        expect(result.ErrorMessage).toContain(`Could not restore ${serverPath}`);
    });

    it('writes each target once on success', async () => {
        vi.mocked(writeFileSync).mockImplementation(() => undefined);
        vi.mocked(readFileSync).mockReturnValue(serverOriginal);

        const result = AddAppPackages(addOptions());

        expect(result.Success).toBe(true);
        expect(result.Added).toEqual(['@acme/server', '@acme/ng']);
        expect(vi.mocked(writeFileSync)).toHaveBeenCalledTimes(2);
    });
});
