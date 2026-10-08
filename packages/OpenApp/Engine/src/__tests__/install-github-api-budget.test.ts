/**
 * How many GitHub REST API calls does one `mj app install` cost?
 *
 * Without a token GitHub allows 60 REST requests per hour. Installing
 * https://github.com/MemberJunction/more-cheese pulls in 10 dependency apps and ~227 migration files,
 * and used to cost roughly 300 requests (one Contents call per directory and per file, a Blob call per
 * file over 1 MB, plus tag/release/ref/manifest lookups per app), so it could not finish anonymously.
 *
 * This suite runs the REAL orchestrator and the REAL github-client — only the database, npm and config
 * writers are stubbed — against a fake GitHub served through `fetch`, and counts every REST call. File
 * contents come from raw.githubusercontent.com, which is not part of the REST budget, so what remains
 * is a small, fixed number of calls per app that does NOT grow with the number of migration files.
 * If a change reintroduces per-file or per-directory API calls, these tests fail with a breakdown.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { FakeGitHub, type FakeFile, type FakeRepo, type FakeGitHubOptions } from './helpers/fake-github.js';

// ── Stub only the collaborators that touch a database, npm, or config files ──
vi.mock('../install/schema-manager.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../install/schema-manager.js')>()),
    CreateAppSchema: vi.fn(),
    CheckCanMigrateAppSchema: vi.fn(async () => ({ Success: true })),
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
    PruneDynamicPackagesNotInManifest: vi.fn(() => ({ Success: true })),
    ToggleServerDynamicPackages: vi.fn(),
    AddEntityPackageMapping: vi.fn(),
    RemoveEntityPackageMapping: vi.fn(),
    AddExcludeSchema: vi.fn(() => ({ Success: true })),
    RemoveExcludeSchema: vi.fn(() => ({ Success: true })),
}));
vi.mock('../install/history-recorder.js', () => ({
    RecordAppInstallation: vi.fn(),
    RecordInstallHistoryEntry: vi.fn(),
    RecordAppDependencies: vi.fn(),
    DeleteAppDependencies: vi.fn(),
    SetAppStatus: vi.fn(),
    SetAppStep: vi.fn(),
    FindInstalledApp: vi.fn(),
    FindDependentApps: vi.fn(),
    ListInstalledApps: vi.fn(),
    UpdateAppRecord: vi.fn(),
    ReplaceAppDependenciesAtomically: vi.fn(),
    CheckSchemaSharedByOtherApps: vi.fn(),
}));
vi.mock('@memberjunction/core', () => ({
    Metadata: class { async CreateTransactionGroup() { return { Submit: async () => true }; } },
    RunView: class {},
    BaseEntity: class {},
    DatabaseProviderBase: class {},
}));

import { InstallApp } from '../install/install-orchestrator.js';
import type { OrchestratorContext } from '../install/install-orchestrator.js';
import { ClearGitHubTagCache } from '../github/github-client.js';
import { CreateAppSchema, SchemaExists } from '../install/schema-manager.js';
import { RunAppMigrations } from '../install/migration-runner.js';
import { AddAppPackages, RunPackageInstall, BumpPrefixedDependencies } from '../install/package-manager.js';
import { AddServerDynamicPackages, AddClientDynamicPackages, AddEntityPackageMapping } from '../install/config-manager.js';
import { RecordAppInstallation, RecordInstallHistoryEntry, RecordAppDependencies, SetAppStatus, SetAppStep, FindInstalledApp, ListInstalledApps } from '../install/history-recorder.js';

/** One app in the simulated install: where it lives, what it publishes, and what it ships. */
interface AppShape {
    Name: string;
    Owner: string;
    Repo: string;
    /** The range its parent declares. */
    Range: string;
    /** The highest published version inside `Range` — what the installer must pick. */
    Version: string;
    /** Other published tags (older, or outside the range) that the resolver must look past. */
    OtherTags: string[];
    /** `.sql` files directly under `migrations/`. */
    SqlFiles: number;
    /** `.sql` files in a nested `migrations/<sub>/` directory. */
    NestedSqlFiles?: number;
    /** How many of the top-level files are over GitHub's 1 MB inline-content limit. */
    LargeFiles?: number;
    Deps: string[];
}

/**
 * The more-cheese install as measured on GitHub (2026-10): ten dependency apps at the versions their
 * ranges resolve to, with their real migration counts — 8 files over 1 MB, and two apps that keep one
 * migration in a subdirectory. skip-client is private, so its migration count is an assumption (3).
 */
const MORE_CHEESE_DEPS: AppShape[] = [
    { Name: 'mj-bizapps-common', Owner: 'MemberJunction', Repo: 'bizapps-common', Range: '>=5.47.0 <6.0.0', Version: '5.51.0', OtherTags: ['v5.47.0', 'v5.50.2'], SqlFiles: 40, Deps: [] },
    { Name: 'mj-bizapps-orders', Owner: 'MemberJunction', Repo: 'bizapps-orders', Range: '>=5.0.0 <6.0.0', Version: '5.29.0', OtherTags: ['v5.28.1', 'v6.0.0-beta.1'], SqlFiles: 72, LargeFiles: 1, Deps: ['mj-bizapps-accounting', 'mj-bizapps-common', 'mj-bizapps-tasks'] },
    { Name: 'mj-bizapps-accounting', Owner: 'MemberJunction', Repo: 'bizapps-accounting', Range: '>=0.4.0 <1.0.0', Version: '0.21.2', OtherTags: ['v0.21.1', 'v1.0.0'], SqlFiles: 23, LargeFiles: 1, Deps: ['mj-bizapps-common', 'mj-bizapps-tasks'] },
    { Name: 'mj-committees', Owner: 'MemberJunction', Repo: 'bizapps-committees', Range: '>=1.3.0 <2.0.0', Version: '1.4.0', OtherTags: ['v1.3.0'], SqlFiles: 6, NestedSqlFiles: 1, Deps: ['mj-bizapps-common', 'mj-bizapps-tasks'] },
    { Name: 'mj-bizapps-forms', Owner: 'MemberJunction', Repo: 'bizapps-forms', Range: '>=0.1.0 <1.0.0', Version: '0.15.0', OtherTags: ['v0.14.0'], SqlFiles: 41, Deps: ['mj-bizapps-common', 'mj-bizapps-tasks'] },
    { Name: 'mj-bizapps-tasks', Owner: 'MemberJunction', Repo: 'bizapps-tasks', Range: '>=1.0.0 <2.0.0', Version: '1.6.2', OtherTags: ['v1.6.1'], SqlFiles: 11, NestedSqlFiles: 1, Deps: ['mj-bizapps-common'] },
    { Name: 'mj-bizapps-issues', Owner: 'MemberJunction', Repo: 'bizapps-issues', Range: '>=1.0.0 <2.0.0', Version: '1.3.2', OtherTags: ['v1.3.1'], SqlFiles: 7, Deps: ['mj-bizapps-common', 'mj-bizapps-tasks'] },
    { Name: 'mj-secure-messaging', Owner: 'MemberJunction', Repo: 'bizapps-secure-messaging', Range: '>=2.0.0 <3.0.0', Version: '2.1.0', OtherTags: ['v1.0.0', 'v2.0.0'], SqlFiles: 2, Deps: ['mj-bizapps-common'] },
    { Name: 'mj-bizapps-sonar', Owner: 'MemberJunction', Repo: 'bizapps-sonar', Range: '>=0.4.0 <1.0.0', Version: '0.6.0', OtherTags: ['v0.5.0'], SqlFiles: 11, Deps: [] },
    { Name: 'skip-client', Owner: 'BlueCypress', Repo: 'Skip-Client-Open-App', Range: '>=0.3.0', Version: '0.3.4', OtherTags: ['v0.3.0'], SqlFiles: 3, Deps: [] },
];

/** The root: installed from its default branch (no --version), so its migrations come from `v<manifest.version>`. */
const MORE_CHEESE_ROOT: AppShape = {
    Name: 'more-cheese-demo', Owner: 'MemberJunction', Repo: 'more-cheese', Range: '', Version: '1.3.2',
    OtherTags: ['v1.3.1'], SqlFiles: 9, LargeFiles: 6, Deps: MORE_CHEESE_DEPS.map(d => d.Name),
};

/** A generous ceiling — the design target is 2 per app — that still fails loudly on per-file calls. */
const MAX_REST_CALLS_PER_APP = 4;
const LARGE_FILE_BYTES = 94 * 1024 * 1024;

const repoUrl = (app: AppShape): string => `https://github.com/${app.Owner}/${app.Repo}`;
const schemaName = (app: AppShape): string => `test_${app.Name.replace(/-/g, '_')}`;

function manifestFor(app: AppShape, all: AppShape[]): string {
    const deps: Record<string, { version: string; repository: string }> = {};
    for (const depName of app.Deps) {
        const dep = all.find(a => a.Name === depName)!;
        deps[depName] = { version: dep.Range, repository: repoUrl(dep) };
    }
    return JSON.stringify({
        manifestVersion: 1, name: app.Name, displayName: app.Name, description: `${app.Name} simulated for the API budget test`,
        version: app.Version, publisher: { name: 'Test' }, repository: repoUrl(app), mjVersionRange: '>=6.0.0 <7.0.0',
        schema: { name: schemaName(app) }, migrations: { directory: 'migrations' }, packages: {}, dependencies: deps,
    });
}

/** The migration files an app ships, keyed by path relative to `migrations/`. */
function migrationsFor(app: AppShape, scale: number): Record<string, FakeFile> {
    const files: Record<string, FakeFile> = {};
    const topLevel = app.SqlFiles * scale;
    for (let i = 0; i < topLevel; i++) {
        const name = `V${String(i + 1).padStart(4, '0')}__${app.Repo}.sql`;
        files[name] = { Content: `-- ${app.Name} ${name}\nSELECT ${i};\n`, Size: i < (app.LargeFiles ?? 0) ? LARGE_FILE_BYTES : undefined };
    }
    for (let i = 0; i < (app.NestedSqlFiles ?? 0) * scale; i++) {
        const name = `archive/V9${String(i + 1).padStart(3, '0')}__nested.sql`;
        files[name] = { Content: `-- ${app.Name} ${name}\n` };
    }
    files['_README.md'] = { Content: 'not a migration' };
    return files;
}

function repoFor(app: AppShape, all: AppShape[], scale: number): FakeRepo {
    const manifest: FakeFile = { Content: manifestFor(app, all) };
    const tagged: Record<string, FakeFile> = { 'mj-app.json': manifest };
    for (const [path, file] of Object.entries(migrationsFor(app, scale))) {
        tagged[`migrations/${path}`] = file;
    }
    return {
        Owner: app.Owner, Repo: app.Repo,
        Files: { HEAD: { 'mj-app.json': manifest }, [`v${app.Version}`]: tagged },
        ExtraTags: app.OtherTags,
    };
}

/** What each app's migration run actually received on disk, keyed by schema. */
const migrationsReceived = new Map<string, Record<string, string>>();
const installSequence: string[] = [];

function filesUnder(dir: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const entry of readdirSync(dir, { recursive: true }) as string[]) {
        const full = join(dir, entry);
        if (statSync(full).isFile()) {
            out[entry.split('\\').join('/')] = readFileSync(full, 'utf-8');
        }
    }
    return out;
}

function contextFor(platformKey: 'sqlserver' | 'postgresql', token?: string): OrchestratorContext {
    return {
        ContextUser: {},
        DatabaseProvider: { Dialect: { PlatformKey: platformKey, CanonicalSchemaName: (s: string) => s } },
        DatabaseConfig: {},
        GitHubOptions: token ? { Token: token } : {},
        RepoRoot: '/tmp/test-repo',
        MJVersion: '6.2.0',
    } as unknown as OrchestratorContext;
}

function installStubs(): void {
    vi.mocked(SchemaExists).mockResolvedValue(false);
    vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
    vi.mocked(AddAppPackages).mockReturnValue({ Success: true });
    vi.mocked(RunPackageInstall).mockReturnValue({ Success: true });
    vi.mocked(BumpPrefixedDependencies).mockReturnValue(0);
    vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
    vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true });
    vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
    vi.mocked(SetAppStatus).mockResolvedValue(undefined);
    vi.mocked(SetAppStep).mockResolvedValue(undefined);
    vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
    vi.mocked(RecordAppDependencies).mockResolvedValue(undefined);
    vi.mocked(FindInstalledApp).mockResolvedValue(undefined);
    vi.mocked(ListInstalledApps).mockResolvedValue([]);
    vi.mocked(RecordAppInstallation).mockImplementation(async (_user, manifest) => {
        installSequence.push(manifest.name);
        return `id-${manifest.name}`;
    });
    // The temp directory is deleted right after the run, so capture what landed on disk here.
    vi.mocked(RunAppMigrations).mockImplementation(async (options) => {
        const files = filesUnder(options.MigrationsDir);
        migrationsReceived.set(options.SchemaName, files);
        return { Success: true, MigrationsApplied: Object.keys(files).length, AppliedFiles: Object.keys(files) };
    });
}

/** Installs more-cheese against a fake GitHub and returns it, so the caller can inspect every request. */
async function installMoreCheese(scale: number, fakeOptions: FakeGitHubOptions = {}, platformKey: 'sqlserver' | 'postgresql' = 'sqlserver', token?: string) {
    const all = [MORE_CHEESE_ROOT, ...MORE_CHEESE_DEPS];
    const fake = new FakeGitHub(all.map(app => repoFor(app, all, scale)), fakeOptions);
    vi.stubGlobal('fetch', fake.Fetch);
    const result = await InstallApp({ Source: repoUrl(MORE_CHEESE_ROOT) }, contextFor(platformKey, token));
    return { fake, result, apps: all };
}

function budgetMessage(fake: FakeGitHub, apps: number): string {
    return `${fake.ApiCalls} REST calls for ${apps} apps (budget ${MAX_REST_CALLS_PER_APP}/app): ${JSON.stringify(fake.ApiBreakdown())}`;
}

beforeEach(() => {
    vi.clearAllMocks();
    ClearGitHubTagCache();
    migrationsReceived.clear();
    installSequence.length = 0;
    installStubs();
});

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('mj app install — GitHub REST budget (more-cheese shape)', () => {
    it('installs more-cheese and its 10 dependencies in a few REST calls per app, not one per file', async () => {
        const { fake, result, apps } = await installMoreCheese(1);

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(installSequence).toHaveLength(apps.length);
        expect(installSequence[installSequence.length - 1]).toBe(MORE_CHEESE_ROOT.Name);
        expect(fake.ApiCalls, budgetMessage(fake, apps.length)).toBeLessThanOrEqual(MAX_REST_CALLS_PER_APP * apps.length);
        // Content never goes through the REST API while raw.githubusercontent.com is reachable.
        expect(fake.ApiBreakdown().contents ?? 0, budgetMessage(fake, apps.length)).toBe(0);
        expect(fake.ApiBreakdown().blobs ?? 0, budgetMessage(fake, apps.length)).toBe(0);
    });

    it('fits inside GitHub\'s anonymous allowance of 60 requests per hour', async () => {
        const { fake, result, apps } = await installMoreCheese(1, { ApiBudget: 60 });

        expect(result.Success, `${result.ErrorMessage} — ${budgetMessage(fake, apps.length)}`).toBe(true);
        expect(fake.ApiCalls).toBeLessThan(60);
    });

    it('costs the same number of REST calls with ten times as many migration files', async () => {
        const baseline = await installMoreCheese(1);
        vi.unstubAllGlobals();
        ClearGitHubTagCache();
        const scaled = await installMoreCheese(10);

        expect(scaled.result.Success, scaled.result.ErrorMessage).toBe(true);
        expect(scaled.fake.ApiCalls, budgetMessage(scaled.fake, scaled.apps.length)).toBe(baseline.fake.ApiCalls);
    });

    it('stays inside the budget on PostgreSQL, where each app is first probed for migrations-pg/', async () => {
        const { fake, result, apps } = await installMoreCheese(1, {}, 'postgresql');

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(fake.ApiCalls, budgetMessage(fake, apps.length)).toBeLessThanOrEqual(MAX_REST_CALLS_PER_APP * apps.length);
    });

    it('delivers every migration file, byte for byte, with nested paths preserved', async () => {
        const { result, apps } = await installMoreCheese(1);
        expect(result.Success, result.ErrorMessage).toBe(true);

        for (const app of apps) {
            const expected: Record<string, string> = {};
            for (const [path, file] of Object.entries(migrationsFor(app, 1))) {
                if (path.endsWith('.sql')) {
                    expected[path] = file.Content;
                }
            }
            expect(migrationsReceived.get(schemaName(app)), app.Name).toEqual(expected);
        }
    });

    it('when the hourly limit runs out, fails with when it resets and how to raise it — never a bare 403', async () => {
        const resetEpoch = Math.floor(Date.UTC(2026, 9, 7, 21, 34, 0) / 1000);
        const { result } = await installMoreCheese(1, { ApiBudget: 5, RateLimitResetEpoch: resetEpoch });

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/rate limit/i);
        expect(result.ErrorMessage).toContain('2026-10-07 21:34:00 UTC');
        expect(result.ErrorMessage).toContain('GITHUB_TOKEN');
        expect(result.ErrorMessage).toContain('openApps.github.token');
    });

    it('sends the configured token to raw.githubusercontent.com and api.github.com only', async () => {
        const { fake, result } = await installMoreCheese(1, {}, 'sqlserver', 'ghp_budgettest');

        expect(result.Success, result.ErrorMessage).toBe(true);
        expect(fake.Requests.length).toBeGreaterThan(0);
        for (const request of fake.Requests) {
            expect(request.Authorization, request.Url).toMatch(/ ghp_budgettest$/);
        }
        expect(result.ErrorMessage ?? '').not.toContain('ghp_budgettest');
    });
});
