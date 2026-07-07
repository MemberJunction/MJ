/**
 * Resumability + mutex tests for `mj app install|upgrade|remove`.
 *
 * Covers the checkpoint (`OpenApp.LastCompletedStep`) resume behavior added to InstallApp/
 * UpgradeApp/RemoveApp, and the mutex guards on Enable/Disable/Upgrade/Remove/Install that
 * refuse to act on an app while a DIFFERENT operation is mid-flight on it.
 *
 * Pattern follows install-orchestrator-order.test.ts / -teardown.test.ts: every external
 * collaborator is stubbed; only the orchestrator's own control flow is real.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../github/github-client.js', () => ({
    FetchManifestFromGitHub: vi.fn(),
    DownloadMigrations: vi.fn(),
    GetLatestVersion: vi.fn(),
    ValidateGitHubTag: vi.fn(),
    ParseGitHubUrl: (u: string) => {
        const m = u.match(/github\.com\/([^/?#]+)\/([^/?#]+)((?:\/[^?#]+)*)/);
        if (!m) return null;
        const sub = (m[3] ?? '').replace(/^\/+|\/+$/g, '');
        return { Owner: m[1], Repo: m[2].replace(/\.git$/, ''), Subpath: sub.length ? sub : undefined };
    },
    ListGitHubReleases: vi.fn(),
    ListGitHubTags: vi.fn(),
}));
vi.mock('../install/schema-manager.js', () => ({
    CreateAppSchema: vi.fn(),
    DropAppSchema: vi.fn(),
    SchemaExists: vi.fn(),
    EscapeSqlString: (s: string) => s,
}));
vi.mock('../install/migration-runner.js', () => ({ RunAppMigrations: vi.fn() }));
vi.mock('../install/package-manager.js', () => ({
    AddAppPackages: vi.fn(),
    RemoveAppPackages: vi.fn(),
    RunPackageInstall: vi.fn(),
    BumpPrefixedDependencies: vi.fn(),
}));
vi.mock('../install/config-manager.js', () => ({
    AddServerDynamicPackages: vi.fn(),
    AddClientDynamicPackages: vi.fn(),
    RemoveServerDynamicPackages: vi.fn(),
    ToggleServerDynamicPackages: vi.fn(),
    AddEntityPackageMapping: vi.fn(),
    RemoveEntityPackageMapping: vi.fn(),
}));
vi.mock('../install/history-recorder.js', () => ({
    RecordAppInstallation: vi.fn(),
    RecordInstallHistoryEntry: vi.fn(),
    RecordAppDependencies: vi.fn(),
    DeleteAppDependencies: vi.fn(),
    ReplaceAppDependenciesAtomically: vi.fn(),
    SetAppStatus: vi.fn(),
    SetAppStep: vi.fn(),
    FindInstalledApp: vi.fn(),
    FindDependentApps: vi.fn(),
    ListInstalledApps: vi.fn(),
    UpdateAppRecord: vi.fn(),
    CheckSchemaSharedByOtherApps: vi.fn(),
}));
vi.mock('@memberjunction/core', () => ({
    Metadata: class { async CreateTransactionGroup() { return { Submit: async () => true }; } },
    RunView: class {},
    BaseEntity: class {},
    DatabaseProviderBase: class {},
}));

import { InstallApp, UpgradeApp, RemoveApp, EnableApp, DisableApp } from '../install/install-orchestrator.js';
import type { OrchestratorContext } from '../install/install-orchestrator.js';
import { FetchManifestFromGitHub, DownloadMigrations, GetLatestVersion, ListGitHubReleases, ListGitHubTags, ValidateGitHubTag } from '../github/github-client.js';
import { CreateAppSchema, SchemaExists } from '../install/schema-manager.js';
import { RunAppMigrations } from '../install/migration-runner.js';
import { AddAppPackages, RunPackageInstall, BumpPrefixedDependencies, RemoveAppPackages } from '../install/package-manager.js';
import { AddServerDynamicPackages, AddClientDynamicPackages, ToggleServerDynamicPackages, AddEntityPackageMapping, RemoveServerDynamicPackages } from '../install/config-manager.js';
import {
    RecordAppInstallation,
    RecordInstallHistoryEntry,
    RecordAppDependencies,
    ReplaceAppDependenciesAtomically,
    SetAppStatus,
    SetAppStep,
    FindInstalledApp,
    FindDependentApps,
    ListInstalledApps,
    UpdateAppRecord,
    CheckSchemaSharedByOtherApps,
} from '../install/history-recorder.js';

function manifestJSON(name: string, version = '1.0.0', withMigrations = false): string {
    return JSON.stringify({
        manifestVersion: 1,
        name,
        displayName: name,
        description: `${name} test app description`,
        version,
        publisher: { name: 'Test' },
        repository: `https://github.com/test/${name}`,
        mjVersionRange: '>=5.0.0 <6.0.0',
        schema: { name: `test_${name.replace(/-/g, '_')}` },
        ...(withMigrations ? { migrations: { directory: 'migrations' } } : {}),
        packages: {},
    });
}

function serveManifests(byRepoUrl: Record<string, string>): void {
    vi.mocked(FetchManifestFromGitHub).mockImplementation(async (repoUrl: string) => {
        const json = byRepoUrl[repoUrl];
        return json ? { Success: true, ManifestJSON: json } : { Success: false, ErrorMessage: `no manifest for ${repoUrl}` };
    });
}

const context = {
    ContextUser: {},
    DatabaseProvider: { Dialect: { PlatformKey: 'sqlserver' } },
    DatabaseConfig: {},
    GitHubOptions: {},
    RepoRoot: '/tmp/test-repo',
    MJVersion: '5.37.0',
} as unknown as OrchestratorContext;

function baseHappyPathStubs(): void {
    vi.mocked(SchemaExists).mockResolvedValue(false);
    vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
    vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true });
    vi.mocked(DownloadMigrations).mockResolvedValue({ Success: true, Files: [] } as unknown as Awaited<ReturnType<typeof DownloadMigrations>>);
    vi.mocked(AddAppPackages).mockReturnValue({ Success: true });
    vi.mocked(RunPackageInstall).mockReturnValue({ Success: true });
    vi.mocked(BumpPrefixedDependencies).mockReturnValue(0);
    vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
    vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true });
    vi.mocked(ToggleServerDynamicPackages).mockReturnValue({ Success: true });
    vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
    vi.mocked(SetAppStatus).mockResolvedValue(undefined);
    vi.mocked(SetAppStep).mockResolvedValue(undefined);
    vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
    vi.mocked(RecordAppDependencies).mockResolvedValue(undefined);
    vi.mocked(ReplaceAppDependenciesAtomically).mockResolvedValue(true);
    vi.mocked(ListInstalledApps).mockResolvedValue([]);
    vi.mocked(GetLatestVersion).mockResolvedValue('2.0.0' as unknown as Awaited<ReturnType<typeof GetLatestVersion>>);
    vi.mocked(ListGitHubTags).mockResolvedValue([]);
    vi.mocked(ListGitHubReleases).mockResolvedValue([]);
    vi.mocked(ValidateGitHubTag).mockResolvedValue({ Exists: true });
    vi.mocked(FindDependentApps).mockResolvedValue([]);
    vi.mocked(CheckSchemaSharedByOtherApps).mockResolvedValue({ Shared: false, CheckFailed: false });
    vi.mocked(UpdateAppRecord).mockResolvedValue(undefined);
}

/** In-memory "row" so SetAppStep/SetAppStatus/UpdateAppRecord mutate what FindInstalledApp next returns. */
function trackRow(initial: Record<string, unknown>) {
    const row: Record<string, unknown> = { ...initial };
    vi.mocked(FindInstalledApp).mockImplementation(async () => ({ ...row }) as never);
    vi.mocked(SetAppStatus).mockImplementation(async (_u, _id, status) => {
        row.Status = status;
    });
    vi.mocked(SetAppStep).mockImplementation(async (_u, _id, step) => {
        row.LastCompletedStep = step;
    });
    vi.mocked(UpdateAppRecord).mockImplementation(async (_u, _id, updates) => {
        Object.assign(row, updates);
    });
    return row;
}

describe('InstallApp — resume after a crash mid-install', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        baseHappyPathStubs();
        serveManifests({ 'https://github.com/test/app-x': manifestJSON('app-x') });
    });

    it('resumes from RecordCreated (skips schema/migration/record work already done)', async () => {
        const row = trackRow({ ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Installing', LastCompletedStep: 'RecordCreated', SchemaName: 'test_app_x' });
        void row;

        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);

        expect(result.Success).toBe(true);
        expect(vi.mocked(CreateAppSchema)).not.toHaveBeenCalled();
        expect(vi.mocked(RunAppMigrations)).not.toHaveBeenCalled();
        expect(vi.mocked(RecordAppInstallation)).not.toHaveBeenCalled();
        // Phase 2 still runs to completion.
        expect(vi.mocked(RunPackageInstall)).toHaveBeenCalled();
        // Checkpoint cleared on final success.
        expect(vi.mocked(SetAppStep)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', null);
    });

    it('resumes from PackagesInstalled (skips packages, still does config/hooks)', async () => {
        trackRow({ ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Installing', LastCompletedStep: 'PackagesInstalled', SchemaName: 'test_app_x' });

        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);

        expect(result.Success).toBe(true);
        expect(vi.mocked(RunPackageInstall)).not.toHaveBeenCalled();
        expect(vi.mocked(AddServerDynamicPackages)).toHaveBeenCalled();
    });

    it('a version mismatch on an Installing app is NOT a resume — falls through to the conflict error', async () => {
        trackRow({ ID: 'app-x-id', Name: 'app-x', Version: '0.9.0', Status: 'Installing', LastCompletedStep: 'RecordCreated', SchemaName: 'test_app_x' });

        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage?.toLowerCase()).toContain('already installed');
        expect(vi.mocked(RecordAppInstallation)).not.toHaveBeenCalled();
    });

    it('a real crash-and-retry end to end: fails at Packages, then a second call resumes past it', async () => {
        // First attempt: nothing installed yet, packages step throws.
        vi.mocked(FindInstalledApp).mockResolvedValueOnce(undefined as never);
        vi.mocked(RecordAppInstallation).mockResolvedValueOnce('app-x-id');
        vi.mocked(AddAppPackages).mockImplementationOnce(() => {
            throw new Error('npm registry unreachable');
        });

        const attempt1 = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);
        expect(attempt1.Success).toBe(false);
        expect(vi.mocked(SetAppStatus)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', 'Error');

        // Second attempt resumes: row is now Installing... wait, outer catch set it to 'Error',
        // and RecordCreated was the last checkpoint written before the throw.
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Error', LastCompletedStep: 'RecordCreated', SchemaName: 'test_app_x',
        } as never);

        const attempt2 = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);
        expect(attempt2.Success).toBe(true);
        // Error-status apps go through the isReinstall path (not the Installing-only isResume
        // checkpoint-skip path), so schema/migration/record DO re-run on the retry — once per
        // attempt (2 total). HandleSchemaCreation reuses the existing schema (SchemaExists=true
        // by then) and RecordAppInstallation reuses the existing row (FindInstalledApp match)
        // rather than duplicating it — safe, just not the fast checkpoint-skip path.
        expect(vi.mocked(RecordAppInstallation)).toHaveBeenCalledTimes(2);
    });
});

describe('UpgradeApp — resume after a crash mid-upgrade', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        baseHappyPathStubs();
        serveManifests({ 'https://github.com/test/app-x': manifestJSON('app-x', '2.0.0', true) });
    });

    it('resumes from MigrationsApplied (skips migrations, still updates packages/config/record)', async () => {
        trackRow({ ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Upgrading', LastCompletedStep: 'MigrationsApplied', RepositoryURL: 'https://github.com/test/app-x', SchemaName: 'test_app_x' });

        const result = await UpgradeApp({ AppName: 'app-x' }, context);

        expect(result.Success).toBe(true);
        expect(vi.mocked(RunAppMigrations)).not.toHaveBeenCalled();
        expect(vi.mocked(RunPackageInstall)).toHaveBeenCalled();
        expect(vi.mocked(UpdateAppRecord)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', expect.objectContaining({ Version: '2.0.0', Status: 'Active' }));
    });

    it('crash-and-retry: fails at Config (an uncaught throw), then a second call resumes past Packages', async () => {
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Active', RepositoryURL: 'https://github.com/test/app-x', SchemaName: 'test_app_x',
        } as never);
        // Config step throws instead of returning a failure result — exercises the outer
        // try/catch path (SetAppStatus 'Error'), not the explicit configResult.Success===false branch.
        vi.mocked(AddServerDynamicPackages).mockImplementationOnce(() => {
            throw new Error('disk full writing mj.config.cjs');
        });

        const attempt1 = await UpgradeApp({ AppName: 'app-x' }, context);
        expect(attempt1.Success).toBe(false);
        expect(vi.mocked(SetAppStatus)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', 'Error');
        expect(vi.mocked(RunPackageInstall)).toHaveBeenCalledTimes(1); // Packages succeeded before Config threw

        // Second attempt resumes past the checkpointed Packages step (row is Error, per the
        // mutex rule Error is still an allowed re-entry status for Upgrade — B21).
        vi.mocked(FindInstalledApp).mockResolvedValue({
            ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: 'Error', LastCompletedStep: 'PackagesInstalled',
            RepositoryURL: 'https://github.com/test/app-x', SchemaName: 'test_app_x',
        } as never);

        const attempt2 = await UpgradeApp({ AppName: 'app-x' }, context);
        expect(attempt2.Success).toBe(true);
        // Error-status re-entry reads the checkpoint too (not just 'Upgrading'), so the
        // already-completed Packages step is skipped on the retry — it is NOT re-run.
        expect(vi.mocked(RunPackageInstall)).toHaveBeenCalledTimes(1);
    });
});

describe('RemoveApp — resume after a crash mid-remove', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        baseHappyPathStubs();
    });

    function installedApp(status: string, lastStep: string | null = null) {
        return {
            ID: 'app-x-id', Name: 'app-x', Version: '1.0.0', Status: status, LastCompletedStep: lastStep,
            RepositoryURL: 'https://github.com/test/app-x', SchemaName: null, // null skips metadata/schema-drop, isolating the file-removal phase
            ManifestJSON: manifestJSON('app-x'),
        };
    }

    it('resumes from DbCleanupDone (skips the DB-cleanup phase, still removes files)', async () => {
        vi.mocked(FindInstalledApp).mockResolvedValue(installedApp('Removing', 'DbCleanupDone') as never);

        const result = await RemoveApp({ AppName: 'app-x' }, context);

        expect(result.Success).toBe(true);
        expect(vi.mocked(CheckSchemaSharedByOtherApps)).not.toHaveBeenCalled();
        expect(vi.mocked(RemoveServerDynamicPackages)).toHaveBeenCalled();
        expect(vi.mocked(RemoveAppPackages)).toHaveBeenCalled();
    });

    it('resumes from FilesRemoved (skips file removal, just finalizes)', async () => {
        vi.mocked(FindInstalledApp).mockResolvedValue(installedApp('Removing', 'FilesRemoved') as never);

        const result = await RemoveApp({ AppName: 'app-x' }, context);

        expect(result.Success).toBe(true);
        expect(vi.mocked(RemoveServerDynamicPackages)).not.toHaveBeenCalled();
        expect(vi.mocked(UpdateAppRecord)).toHaveBeenCalledWith(expect.anything(), 'app-x-id', { Status: 'Removed', LastCompletedStep: null });
    });

    it('an Error-status remove with a DbCleanupDone checkpoint skips DB cleanup and finishes via files', async () => {
        vi.mocked(FindInstalledApp).mockResolvedValue(installedApp('Error', 'DbCleanupDone') as never);
        // The DB cleanup already succeeded (checkpoint says so) before whatever later step threw —
        // Error-status re-entry now consults the checkpoint too, so it isn't redone.
        const result = await RemoveApp({ AppName: 'app-x' }, context);

        expect(result.Success).toBe(true);
        expect(vi.mocked(CheckSchemaSharedByOtherApps)).not.toHaveBeenCalled();
        expect(vi.mocked(RemoveServerDynamicPackages)).toHaveBeenCalled();
    });

    it('an Error-status remove with NO checkpoint restarts DB cleanup cleanly', async () => {
        vi.mocked(FindInstalledApp).mockResolvedValue(installedApp('Error', null) as never);
        const result = await RemoveApp({ AppName: 'app-x' }, context);

        expect(result.Success).toBe(true);
        expect(vi.mocked(RemoveServerDynamicPackages)).toHaveBeenCalled();
    });
});

describe('Mutex — Enable/Disable/Upgrade/Remove refuse to act while a DIFFERENT operation owns the row', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        baseHappyPathStubs();
    });

    it.each(['Installing', 'Upgrading', 'Removing', 'Error'])('DisableApp refuses on Status=%s', async (status) => {
        vi.mocked(FindInstalledApp).mockResolvedValue({ ID: 'x', Name: 'app-x', Version: '1.0.0', Status: status } as never);
        const result = await DisableApp('app-x', context);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(status);
        expect(vi.mocked(SetAppStatus)).not.toHaveBeenCalled();
    });

    it.each(['Installing', 'Upgrading', 'Removing', 'Error'])('EnableApp refuses on Status=%s', async (status) => {
        vi.mocked(FindInstalledApp).mockResolvedValue({ ID: 'x', Name: 'app-x', Version: '1.0.0', Status: status } as never);
        const result = await EnableApp('app-x', context);
        expect(result.Success).toBe(false);
        expect(vi.mocked(SetAppStatus)).not.toHaveBeenCalled();
    });

    it.each(['Active', 'Disabled'])('DisableApp/EnableApp proceed normally on settled Status=%s', async (status) => {
        vi.mocked(FindInstalledApp).mockResolvedValue({ ID: 'x', Name: 'app-x', Version: '1.0.0', Status: status } as never);
        const result = await DisableApp('app-x', context);
        expect(result.Success).toBe(true);
    });

    it.each(['Installing', 'Removing'])('UpgradeApp refuses on Status=%s', async (status) => {
        vi.mocked(FindInstalledApp).mockResolvedValue({ ID: 'x', Name: 'app-x', Version: '1.0.0', Status: status, RepositoryURL: 'https://github.com/test/app-x' } as never);
        const result = await UpgradeApp({ AppName: 'app-x' }, context);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(status);
    });

    it.each(['Installing', 'Upgrading'])('RemoveApp refuses on Status=%s', async (status) => {
        vi.mocked(FindInstalledApp).mockResolvedValue({ ID: 'x', Name: 'app-x', Version: '1.0.0', Status: status, ManifestJSON: manifestJSON('app-x') } as never);
        const result = await RemoveApp({ AppName: 'app-x' }, context);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toContain(status);
    });

    it('InstallApp refuses a fresh install while the existing row is Upgrading (existing guard, not new code)', async () => {
        serveManifests({ 'https://github.com/test/app-x': manifestJSON('app-x') });
        vi.mocked(FindInstalledApp).mockResolvedValue({ ID: 'x', Name: 'app-x', Version: '1.0.0', Status: 'Upgrading' } as never);
        const result = await InstallApp({ Source: 'https://github.com/test/app-x' }, context);
        expect(result.Success).toBe(false);
        expect(result.ErrorMessage?.toLowerCase()).toContain('already installed');
    });
});
