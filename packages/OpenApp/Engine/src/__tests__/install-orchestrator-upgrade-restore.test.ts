/**
 * UpgradeApp: when the package install fails after the package files were written, the upgrade
 * restores those files and leaves the app at its previous version and status (#5517).
 *
 * Same stubs as install-orchestrator-order.test.ts, except that the package step's file list is
 * real: these tests snapshot and restore real files in a temp repo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// ── Stub every external collaborator the install path touches ──────────────
// The template-user step loads the record-cloning engine, which this file's mocks don't provide for.
vi.mock('../install/template-user.js', () => ({
    OfferTemplateUser: vi.fn(),
    NamesFromEmail: vi.fn(),
    TEMPLATE_USER_ENV: {},
}));
vi.mock('../github/github-client.js', () => ({
    FetchManifestFromGitHub: vi.fn(),
    DownloadMigrations: vi.fn(),
    GetLatestVersion: vi.fn(),
    ValidateGitHubTag: vi.fn(),
    // The orchestrator derives an optional in-repo subpath from the Source URL;
    // keep the real parser so single-app URLs resolve to `undefined` (root manifest).
    ParseGitHubUrl: (repoUrl: string) => {
        const m = repoUrl.match(/github\.com\/([^/?#]+)\/([^/?#]+)((?:\/[^?#]+)*)/);
        if (!m) return null;
        const sub = (m[3] ?? '').replace(/^\/+|\/+$/g, '');
        return { Owner: m[1], Repo: m[2].replace(/\.git$/, ''), Subpath: sub.length ? sub : undefined };
    },
    ListGitHubReleases: vi.fn(),
    ListGitHubTags: vi.fn(),
}));
// Spread the real module so ValidateSchemaName is the genuine rule (these suites declare
// ordinary schema names, so it always passes); only the DB-touching functions are stubbed.
vi.mock('../install/schema-manager.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../install/schema-manager.js')>()),
    CreateAppSchema: vi.fn(),
    // Default: the installer may migrate the app schema. Tests of the #4756 gate override it.
    CheckCanMigrateAppSchema: vi.fn(async () => ({ Success: true })),
    DropAppSchema: vi.fn(),
    SchemaExists: vi.fn(),
    EscapeSqlString: (s: string) => s,
}));
vi.mock('../install/migration-runner.js', () => ({ RunAppMigrations: vi.fn() }));
vi.mock('../install/package-manager.js', async (importOriginal) => ({
    AddAppPackages: vi.fn(),
    RemoveAppPackages: vi.fn(),
    RunPackageInstallAsync: vi.fn(),
    BumpPrefixedDependencies: vi.fn(),
    PreflightAppPackages: vi.fn(async () => ({ Success: true, Checks: [], Warnings: [] })),
    // Real: the upgrade rollback tests below snapshot real files in a temp repo.
    ListPackageStepFiles: (await importOriginal<typeof import('../install/package-manager.js')>()).ListPackageStepFiles,
}));
vi.mock('../install/config-manager.js', () => ({
    AddServerDynamicPackages: vi.fn(),
    AddClientDynamicPackages: vi.fn(),
    RemoveServerDynamicPackages: vi.fn(),
    PruneDynamicPackagesNotInManifest: vi.fn(() => ({ Success: true })),
    ToggleServerDynamicPackages: vi.fn(),
    AddEntityPackageMapping: vi.fn(),
    RemoveEntityPackageMapping: vi.fn(),
    AddExcludeSchema: vi.fn(() => ({ Success: true })),
    RemoveExcludeSchema: vi.fn(() => ({ Success: true })),
}));
vi.mock('../install/history-recorder.js', async (importOriginal) => {
    const { MockHistoryRecorder } = await import('./helpers/history-recorder-mock.js');
    return MockHistoryRecorder(await importOriginal());
});
vi.mock('@memberjunction/core', () => ({
    // Only CreateTransactionGroup is used on the install path.
    Metadata: class { async CreateTransactionGroup() { return { Submit: async () => true }; } },
    RunView: class {},
    BaseEntity: class {},
    DatabaseProviderBase: class {},
}));

import { UpgradeApp, DescribeRestoredUpgrade } from '../install/install-orchestrator.js';
import type { OrchestratorContext } from '../install/install-orchestrator.js';
import { FetchManifestFromGitHub, DownloadMigrations, GetLatestVersion } from '../github/github-client.js';
import { SchemaExists } from '../install/schema-manager.js';
import { RunAppMigrations } from '../install/migration-runner.js';
import { AddAppPackages, RunPackageInstallAsync } from '../install/package-manager.js';
import { AddServerDynamicPackages, AddClientDynamicPackages, AddEntityPackageMapping, ToggleServerDynamicPackages, PruneDynamicPackagesNotInManifest } from '../install/config-manager.js';
import { RecordInstallHistoryEntry, SetAppStatus, FindInstalledApp, UpdateAppRecord } from '../install/history-recorder.js';



/** Wires the GitHub fetch stub to serve a fixed set of manifests by repo URL. */
function serveManifests(byRepoUrl: Record<string, string>): void {
    vi.mocked(FetchManifestFromGitHub).mockImplementation(async (repoUrl: string) => {
        const json = byRepoUrl[repoUrl];
        return json
            ? { Success: true, ManifestJSON: json }
            : { Success: false, ErrorMessage: `no manifest for ${repoUrl}` };
    });
}

// Minimal context — the stubbed collaborators ignore the provider/user objects,
// so a cast is sufficient for wiring (no real DB or GitHub is contacted).
// CanonicalSchemaName is the one Dialect member HandleSchemaCreation calls directly.
const context = {
    ContextUser: {},
    DatabaseProvider: { Dialect: { CanonicalSchemaName: (s: string) => s } },
    DatabaseConfig: {},
    GitHubOptions: {},
    RepoRoot: '/tmp/test-repo',
    MJVersion: '5.37.0',
} as unknown as OrchestratorContext;

describe('UpgradeApp — a failed package install restores the package files (#5517)', () => {
    let repo: string;
    let upContext: OrchestratorContext;

    const SERVER_PKG = `${JSON.stringify({ name: 'mj_api', dependencies: { '@test/app-x-server': '1.0.0' } }, null, 2)}\n`;
    const CLIENT_PKG = `${JSON.stringify({ name: 'mj_explorer', dependencies: { '@test/app-x-client': '1.0.0' } }, null, 4)}\n`;
    const LOCKFILE = 'lockfileVersion: 9.0\n';

    function v2Manifest(): string {
        return JSON.stringify({
            manifestVersion: 1,
            name: 'app-x',
            displayName: 'app-x',
            description: 'app-x test app description',
            version: '2.0.0',
            publisher: { name: 'Test' },
            repository: 'https://github.com/test/app-x',
            mjVersionRange: '>=5.0.0 <6.0.0',
            schema: { name: 'test_app_x' },
            migrations: { directory: 'migrations' },
            packages: {
                server: [{ name: '@test/app-x-server', role: 'bootstrap', startupExport: 'Load' }],
                client: [{ name: '@test/app-x-client', role: 'bootstrap', startupExport: 'LoadClient' }],
            },
            dependencies: {},
        });
    }

    const read = (rel: string): string => readFileSync(join(repo, rel), 'utf-8');

    beforeEach(() => {
        vi.clearAllMocks();
        repo = mkdtempSync(join(tmpdir(), 'oa-upgrade-restore-'));
        mkdirSync(join(repo, 'packages', 'MJAPI'), { recursive: true });
        mkdirSync(join(repo, 'packages', 'MJExplorer'), { recursive: true });
        writeFileSync(join(repo, 'package.json'), '{"name":"host","workspaces":["packages/*"]}\n');
        writeFileSync(join(repo, 'packages', 'MJAPI', 'package.json'), SERVER_PKG);
        writeFileSync(join(repo, 'packages', 'MJExplorer', 'package.json'), CLIENT_PKG);
        writeFileSync(join(repo, 'pnpm-lock.yaml'), LOCKFILE);
        upContext = {
            ...context,
            RepoRoot: repo,
            PackageManager: 'pnpm',
            DatabaseProvider: { Dialect: { PlatformKey: 'sqlserver', CanonicalSchemaName: (s: string) => s } },
        } as unknown as OrchestratorContext;

        vi.mocked(SchemaExists).mockResolvedValue(true);
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(DownloadMigrations).mockResolvedValue({ Success: true } as Awaited<ReturnType<typeof DownloadMigrations>>);
        vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true } as Awaited<ReturnType<typeof RunAppMigrations>>);
        vi.mocked(GetLatestVersion).mockResolvedValue('2.0.0' as unknown as Awaited<ReturnType<typeof GetLatestVersion>>);
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Active',
            RepositoryURL: 'https://github.com/test/app-x', SchemaName: 'test_app_x',
        } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>);
        serveManifests({ 'https://github.com/test/app-x': v2Manifest() });
        vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true } as ReturnType<typeof AddServerDynamicPackages>);
        vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true } as ReturnType<typeof AddClientDynamicPackages>);
        vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true } as ReturnType<typeof AddEntityPackageMapping>);
        vi.mocked(PruneDynamicPackagesNotInManifest).mockReturnValue({ Success: true } as ReturnType<typeof PruneDynamicPackagesNotInManifest>);
        // The package step writes the new version into both package.json files, then the install
        // rewrites the lockfile and creates an npm lockfile before failing.
        vi.mocked(AddAppPackages).mockImplementation(() => {
            writeFileSync(join(repo, 'packages', 'MJAPI', 'package.json'), SERVER_PKG.replace('1.0.0', '2.0.0'));
            writeFileSync(join(repo, 'packages', 'MJExplorer', 'package.json'), CLIENT_PKG.replace('1.0.0', '2.0.0'));
            return { Success: true, Added: ['@test/app-x-server', '@test/app-x-client'], Removed: [] };
        });
    });

    afterEach(() => {
        rmSync(repo, { recursive: true, force: true });
    });

    function failInstall(): void {
        vi.mocked(RunPackageInstallAsync).mockImplementation(async () => {
            writeFileSync(join(repo, 'pnpm-lock.yaml'), `${LOCKFILE}half-written: true\n`);
            writeFileSync(join(repo, 'package-lock.json'), '{}');
            return { Success: false, Added: [], Removed: [], ErrorMessage: 'pnpm install failed (exit code 1).' };
        });
    }

    it('restores every snapshotted file byte for byte and keeps the previous version and status', async () => {
        failInstall();

        const result = await UpgradeApp({ AppName: 'app-x' }, upContext);

        expect(result.Success).toBe(false);
        expect(read('packages/MJAPI/package.json')).toBe(SERVER_PKG);
        expect(read('packages/MJExplorer/package.json')).toBe(CLIENT_PKG);
        expect(read('pnpm-lock.yaml')).toBe(LOCKFILE);
        expect(existsSync(join(repo, 'package-lock.json'))).toBe(false); // created by the failed install
        // never finalized: no version bump, no Disabled, config untouched
        expect(vi.mocked(UpdateAppRecord)).not.toHaveBeenCalled();
        expect(vi.mocked(SetAppStatus)).not.toHaveBeenCalledWith(expect.anything(), 'app-x-id', 'Disabled');
        expect(vi.mocked(SetAppStatus)).toHaveBeenLastCalledWith(expect.anything(), 'app-x-id', 'Active');
        expect(vi.mocked(AddServerDynamicPackages)).not.toHaveBeenCalled();
        expect(vi.mocked(ToggleServerDynamicPackages)).not.toHaveBeenCalled();
    });

    it('says the schema moved ahead and names the retry command', async () => {
        failInstall();

        const result = await UpgradeApp({ AppName: 'app-x' }, upContext);

        expect(result.ErrorMessage).toContain('pnpm install failed');
        expect(result.ErrorMessage).toContain('stays at v1.0.0');
        expect(result.ErrorMessage).toContain('the test_app_x schema is at v2.0.0');
        expect(result.ErrorMessage).toContain("'mj app upgrade app-x'");
    });

    it('leaves a row that was in Error as Error, so a re-run resumes', async () => {
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Error',
            RepositoryURL: 'https://github.com/test/app-x', SchemaName: 'test_app_x',
        } as unknown as Awaited<ReturnType<typeof FindInstalledApp>>);
        failInstall();

        await UpgradeApp({ AppName: 'app-x' }, upContext);

        expect(vi.mocked(SetAppStatus)).toHaveBeenLastCalledWith(expect.anything(), 'app-x-id', 'Error');
    });

    it('falls back to finalizing Disabled when a file cannot be restored', async () => {
        vi.mocked(RunPackageInstallAsync).mockImplementation(async () => {
            // a directory where the snapshot recorded no file: the restore cannot remove it
            mkdirSync(join(repo, 'package-lock.json', 'x'), { recursive: true });
            return { Success: false, Added: [], Removed: [], ErrorMessage: 'pnpm install failed (exit code 1).' };
        });

        const result = await UpgradeApp({ AppName: 'app-x' }, upContext);

        expect(result.Success).toBe(true);
        expect(result.Summary).toContain('finalized as Disabled');
        expect(vi.mocked(UpdateAppRecord)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', expect.objectContaining({ Status: 'Disabled' }));
        expect(vi.mocked(ToggleServerDynamicPackages)).toHaveBeenCalled();
    });

    it('restores nothing when the package step succeeds', async () => {
        vi.mocked(RunPackageInstallAsync).mockResolvedValue({ Success: true, Added: [], Removed: [] });

        const result = await UpgradeApp({ AppName: 'app-x' }, upContext);

        expect(result.Success).toBe(true);
        expect(read('packages/MJAPI/package.json')).toBe(SERVER_PKG.replace('1.0.0', '2.0.0'));
        expect(vi.mocked(UpdateAppRecord)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', expect.objectContaining({ Status: 'Active', Version: '2.0.0' }));
    });

    it('repeats an explicit --version in the retry command', () => {
        const message = DescribeRestoredUpgrade({ AppName: 'app-x', PreviousVersion: '1.0.0', TargetVersion: '2.0.0', ExplicitVersion: '2.0.0', Detail: 'x' });
        expect(message).toContain("'mj app upgrade app-x --version 2.0.0'");
        expect(message).not.toContain('schema is at');
    });
});

