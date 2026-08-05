/**
 * Regression tests for issue #3457 — the installer must not silently disable CodeGen entity
 * registration for the app's schema.
 *
 * `excludeSchemas` gates THREE things in CodeGen, not one: entity DISCOVERY
 * (`createNewEntities` -> `createExcludeTablesAndSchemasFilter`), SQL ownership (base views +
 * CRUD procs, `sql_codegen.ts`), and TS/GraphQL/Angular emission (`runCodeGen.ts`). Only the
 * third is what an installed app needs suppressed, and `entityPackageName` already does exactly
 * that. Writing the app's schema into `excludeSchemas` therefore also turned OFF the entity
 * registration that the documented app contract (README "Migration Content": *"MJ's CodeGen
 * handles those automatically after entity registration"*) depends on — producing an app with
 * tables and zero entities, with no error anywhere in the sequence.
 *
 * The contract pinned here:
 *   - default (no `schema.selfManagedMetadata`): NEVER exclude, and actively UN-exclude, so a
 *     host broken by an earlier installer version heals on the next install/upgrade instead of
 *     having the write re-armed.
 *   - `selfManagedMetadata: true`: the app owns its own `__mj.Entity` seed and generated SQL, so
 *     excluding is correct and must still happen.
 *   - `entityPackageName` is written either way — it is what suppresses duplicate entity
 *     subclasses / GraphQL ObjectTypes, and it must not be collateral damage of this fix.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../github/github-client.js', () => ({
    ParseGitHubUrl: vi.fn(() => ({ Owner: 'test', Repo: 'caliber' })),
    FetchManifestFromGitHub: vi.fn(),
    DownloadMigrations: vi.fn(async () => ({ Success: true, LocalPath: '/tmp/migrations' })),
    GetLatestVersion: vi.fn(async () => '2.0.0'),
    ListGitHubReleases: vi.fn(),
    ListGitHubTags: vi.fn(),
    ValidateGitHubTag: vi.fn(),
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
    AddExcludeSchema: vi.fn(() => ({ Success: true })),
    RemoveExcludeSchema: vi.fn(() => ({ Success: true })),
    AddIncludeSchema: vi.fn(() => ({ Success: true })),
    RemoveIncludeSchema: vi.fn(() => ({ Success: true })),
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
    CheckSchemaSharedByOtherApps: vi.fn(),
    ListInstalledApps: vi.fn(),
    UpdateAppRecord: vi.fn(),
}));
vi.mock('@memberjunction/core', () => ({
    Metadata: class { async CreateTransactionGroup() { return { Submit: async () => true }; } },
    RunView: class {},
    BaseEntity: class {},
    DatabaseProviderBase: class {},
}));

import { InstallApp, UpgradeApp } from '../install/install-orchestrator.js';
import type { OrchestratorContext } from '../install/install-orchestrator.js';
import {
    FetchManifestFromGitHub,
    ListGitHubReleases,
    ListGitHubTags,
    ValidateGitHubTag,
} from '../github/github-client.js';
import { CreateAppSchema, SchemaExists } from '../install/schema-manager.js';
import { RunAppMigrations } from '../install/migration-runner.js';
import { AddAppPackages, RunPackageInstall, BumpPrefixedDependencies } from '../install/package-manager.js';
import {
    AddServerDynamicPackages,
    AddClientDynamicPackages,
    AddEntityPackageMapping,
    AddExcludeSchema,
    RemoveExcludeSchema,
} from '../install/config-manager.js';
import {
    RecordAppInstallation,
    RecordInstallHistoryEntry,
    RecordAppDependencies,
    SetAppStatus,
    FindInstalledApp,
    ListInstalledApps,
    UpdateAppRecord,
} from '../install/history-recorder.js';

const APP_NAME = 'caliber';
const APP_SCHEMA = '__mj_BizAppsCaliber';
const REPO_URL = `https://github.com/test/${APP_NAME}`;

/**
 * Builds a valid mj-app.json. `selfManagedMetadata` is omitted entirely when undefined so the
 * default-path tests exercise a manifest written by an app that has never heard of the flag —
 * which is every app published before this fix.
 */
function manifestJSON(selfManagedMetadata?: boolean, version = '1.0.0'): string {
    return JSON.stringify({
        manifestVersion: 1,
        name: APP_NAME,
        displayName: 'Caliber',
        description: 'Caliber test app description',
        version,
        publisher: { name: 'Test' },
        repository: REPO_URL,
        mjVersionRange: '>=5.0.0 <7.0.0',
        schema: {
            name: APP_SCHEMA,
            entityPackage: '@caliber/app-entities',
            ...(selfManagedMetadata === undefined ? {} : { selfManagedMetadata }),
        },
        packages: {},
        dependencies: {},
    });
}

const context = {
    ContextUser: {},
    DatabaseProvider: {
        Dialect: { CanonicalSchemaName: (s: string) => s },
        // No seeded entities — the bizapps-caliber shape, where the host's CodeGen must register them.
        ExecuteSQL: async () => [{ EntityCount: 0 }],
    },
    DatabaseConfig: {},
    GitHubOptions: {},
    RepoRoot: '/tmp/test-repo',
    MJVersion: '6.0.0',
} as unknown as OrchestratorContext;

/** An installed-app record for the upgrade path. */
function installedApp() {
    return {
        ID: 'app-id-1',
        Name: APP_NAME,
        Version: '1.0.0',
        SchemaName: APP_SCHEMA,
        RepositoryURL: REPO_URL,
        Status: 'Active',
        ManifestJSON: manifestJSON(),
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(SchemaExists).mockResolvedValue(false);
    vi.mocked(CreateAppSchema).mockResolvedValue({ Success: true });
    vi.mocked(RunAppMigrations).mockResolvedValue({ Success: true });
    vi.mocked(AddAppPackages).mockReturnValue({ Success: true });
    vi.mocked(RunPackageInstall).mockReturnValue({ Success: true });
    vi.mocked(BumpPrefixedDependencies).mockReturnValue(0);
    vi.mocked(AddServerDynamicPackages).mockReturnValue({ Success: true });
    vi.mocked(AddClientDynamicPackages).mockReturnValue({ Success: true });
    vi.mocked(AddEntityPackageMapping).mockReturnValue({ Success: true });
    vi.mocked(AddExcludeSchema).mockReturnValue({ Success: true });
    vi.mocked(RemoveExcludeSchema).mockReturnValue({ Success: true });
    vi.mocked(SetAppStatus).mockResolvedValue(undefined);
    vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
    vi.mocked(RecordAppDependencies).mockResolvedValue(undefined);
    vi.mocked(RecordAppInstallation).mockResolvedValue('app-id-1');
    vi.mocked(UpdateAppRecord).mockResolvedValue(undefined);
    vi.mocked(FindInstalledApp).mockResolvedValue(undefined);
    vi.mocked(ListInstalledApps).mockResolvedValue([]);
    vi.mocked(ListGitHubTags).mockResolvedValue(['1.0.0', '2.0.0']);
    vi.mocked(ListGitHubReleases).mockResolvedValue([]);
    vi.mocked(ValidateGitHubTag).mockResolvedValue({ Exists: true });
});

function serve(json: string): void {
    vi.mocked(FetchManifestFromGitHub).mockResolvedValue({ Success: true, ManifestJSON: json });
}

describe('mj app install — excludeSchemas (issue #3457)', () => {
    it('does NOT add the app schema to excludeSchemas by default', async () => {
        serve(manifestJSON());

        const result = await InstallApp({ Source: REPO_URL }, context);

        expect(result.Success).toBe(true);
        expect(AddExcludeSchema).not.toHaveBeenCalled();
    });

    it('actively REMOVES the app schema from excludeSchemas so an already-broken host heals', async () => {
        // Deleting the write alone would leave every host installed by an earlier version
        // permanently broken — the schema is already sitting in their mj.config.cjs.
        serve(manifestJSON());

        await InstallApp({ Source: REPO_URL }, context);

        expect(RemoveExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA, undefined);
    });

    it('still writes entityPackageName — duplicate subclass/ObjectType suppression is untouched', async () => {
        serve(manifestJSON());

        await InstallApp({ Source: REPO_URL }, context);

        expect(AddEntityPackageMapping).toHaveBeenCalledTimes(1);
    });

    it('DOES exclude when the app declares it manages its own entity metadata + SQL', async () => {
        serve(manifestJSON(true));

        const result = await InstallApp({ Source: REPO_URL }, context);

        expect(result.Success).toBe(true);
        expect(AddExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA, undefined);
        expect(RemoveExcludeSchema).not.toHaveBeenCalled();
    });

    it('fails the install when the exclude write itself fails (no silent config drift)', async () => {
        serve(manifestJSON(true));
        vi.mocked(AddExcludeSchema).mockReturnValue({ Success: false, ErrorMessage: 'config unreadable' });

        const result = await InstallApp({ Source: REPO_URL }, context);

        expect(result.Success).toBe(false);
    });
});

describe('schema name written to the host config is dialect-canonical', () => {
    // PostgreSQL folds unquoted DDL identifiers to lowercase, so `CREATE SCHEMA __mj_BizAppsCaliber`
    // produces `__mj_bizappscaliber`. CodeGen's discovery filter compares the excludeSchemas value
    // against that physical name with a case-SENSITIVE SQL `<>` on PG, so writing the raw manifest
    // casing makes the exclusion silently never match. The orchestrator already canonicalizes for
    // SchemaInfo; the config write must agree or the two disagree about the same schema.
    const pgContext = {
        ...(context as unknown as Record<string, unknown>),
        DatabaseProvider: {
            Dialect: { CanonicalSchemaName: (s: string) => s.toLowerCase() },
            ExecuteSQL: async () => [{ EntityCount: 0 }],
        },
    } as unknown as OrchestratorContext;

    it('writes the lowercased schema on PostgreSQL (opt-in path)', async () => {
        serve(manifestJSON(true));

        await InstallApp({ Source: REPO_URL }, pgContext);

        expect(AddExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA.toLowerCase(), undefined);
    });

    it('removes the lowercased schema on PostgreSQL (default path)', async () => {
        serve(manifestJSON());

        await InstallApp({ Source: REPO_URL }, pgContext);

        expect(RemoveExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA.toLowerCase(), undefined);
    });

    it('preserves the manifest casing on SQL Server, which is case-insensitive', async () => {
        serve(manifestJSON(true));

        await InstallApp({ Source: REPO_URL }, context);

        expect(AddExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA, undefined);
    });
});

describe('mj app upgrade — excludeSchemas (issue #3457)', () => {
    beforeEach(() => {
        vi.mocked(FindInstalledApp).mockResolvedValue(
            installedApp() as unknown as Awaited<ReturnType<typeof FindInstalledApp>>,
        );
        vi.mocked(SchemaExists).mockResolvedValue(true);
    });

    it('does not RE-ARM the exclusion — the write must not come back on upgrade', async () => {
        // The re-arm is what made this bug survive a manual fix: a host that hand-removed the
        // line got it back on the next upgrade, and the next CodeGen silently re-broke.
        serve(manifestJSON(undefined, '2.0.0'));

        const result = await UpgradeApp({ AppName: APP_NAME, Version: '2.0.0' }, context);

        expect(result.Success).toBe(true);
        expect(AddExcludeSchema).not.toHaveBeenCalled();
        expect(RemoveExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA, undefined);
    });

    it('keeps the exclusion for a self-managed app across an upgrade', async () => {
        serve(manifestJSON(true, '2.0.0'));

        await UpgradeApp({ AppName: APP_NAME, Version: '2.0.0' }, context);

        expect(AddExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA, undefined);
        expect(RemoveExcludeSchema).not.toHaveBeenCalled();
    });
});

/**
 * Shared schemas are a first-class scenario in this engine (`CheckSchemaSharedByOtherApps` exists
 * for exactly this), and the excludeSchemas decision is per-app. Without reconciliation, installing
 * a default-path app onto a schema another installed app has declared self-managed silently strips
 * that app's exclusion, and the host's CodeGen starts co-owning its tables. Reversing the install
 * order reverses the outcome — the failure is order-dependent and silent, the worst combination.
 *
 * The sibling `HandleAngularPrebundleExcludeRemoval` already resolves this by consulting the other
 * installed apps' manifests before removing anything; this mirrors that rule.
 */
describe('shared-schema reconciliation', () => {
    /** Another installed app that owns the SAME schema and manages its own metadata. */
    function selfManagedSibling() {
        return {
            Name: 'sibling-app',
            Version: '1.0.0',
            RepositoryURL: 'https://github.com/test/sibling-app',
            Status: 'Active',
            SchemaName: APP_SCHEMA,
            ManifestJSON: JSON.stringify({
                manifestVersion: 1,
                name: 'sibling-app',
                displayName: 'Sibling',
                description: 'Sibling app sharing the schema.',
                version: '1.0.0',
                publisher: { name: 'Test' },
                repository: 'https://github.com/test/sibling-app',
                mjVersionRange: '>=5.0.0 <7.0.0',
                schema: { name: APP_SCHEMA, selfManagedMetadata: true },
                packages: {},
                dependencies: {},
            }),
        };
    }

    it('does not un-exclude a schema another installed app declares self-managed', async () => {
        vi.mocked(ListInstalledApps).mockResolvedValue(
            [selfManagedSibling()] as unknown as Awaited<ReturnType<typeof ListInstalledApps>>,
        );
        serve(manifestJSON()); // this app takes the default path

        const result = await InstallApp({ Source: REPO_URL }, context);

        expect(result.Success).toBe(true);
        expect(RemoveExcludeSchema).not.toHaveBeenCalled();
    });

    it('still un-excludes when the other app on that schema is NOT self-managed', async () => {
        const sibling = selfManagedSibling();
        sibling.ManifestJSON = sibling.ManifestJSON.replace('"selfManagedMetadata":true', '"selfManagedMetadata":false');
        vi.mocked(ListInstalledApps).mockResolvedValue(
            [sibling] as unknown as Awaited<ReturnType<typeof ListInstalledApps>>,
        );
        serve(manifestJSON());

        await InstallApp({ Source: REPO_URL }, context);

        expect(RemoveExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA, undefined);
    });

    it('ignores a sibling whose ManifestJSON cannot be parsed rather than failing the install', async () => {
        const corrupt = { ...selfManagedSibling(), ManifestJSON: '{not json' };
        vi.mocked(ListInstalledApps).mockResolvedValue(
            [corrupt] as unknown as Awaited<ReturnType<typeof ListInstalledApps>>,
        );
        serve(manifestJSON());

        const result = await InstallApp({ Source: REPO_URL }, context);

        expect(result.Success).toBe(true);
        expect(RemoveExcludeSchema).toHaveBeenCalled();
    });
});

/**
 * Detection-based default (the manifest flag is an override, not the primary signal).
 *
 * Whether an app self-manages its entity metadata is observable at install time — its seed
 * migration has already run by the time config is written — so the installer reads the fact
 * instead of asking the manifest for it. That matters because the apps whose behaviour we need to
 * respect are already published: `mj-bizapps-common`, `-forms` and `-tasks` all seed their own
 * `__mj.Entity` rows in their baseline (`INSERT INTO [__mj].Entity`), and none of them declares
 * `selfManagedMetadata`. A manifest-only default would un-exclude all three on the next upgrade and
 * hand the host's CodeGen co-ownership of entities the apps already own.
 *
 * `mj-bizapps-caliber`, by contrast, seeds nothing — which is why it was the one that broke.
 */
describe('self-management is DETECTED, with the manifest flag as an override', () => {
    /** Stubs the entity-count probe the installer runs against the app's schema. */
    function contextWithSeededEntities(count: number, opts: { failQuery?: boolean } = {}) {
        return {
            ...(context as unknown as Record<string, unknown>),
            DatabaseProvider: {
                Dialect: { CanonicalSchemaName: (s: string) => s },
                ExecuteSQL: vi.fn(async () => {
                    if (opts.failQuery) throw new Error('connection reset');
                    return count > 0 ? [{ EntityCount: count }] : [{ EntityCount: 0 }];
                }),
            },
        } as unknown as OrchestratorContext;
    }

    it('KEEPS the exclusion when the app seeded its own entities (bizapps-common shape)', async () => {
        serve(manifestJSON()); // no selfManagedMetadata declared — every published app today

        const result = await InstallApp({ Source: REPO_URL }, contextWithSeededEntities(10));

        expect(result.Success).toBe(true);
        expect(AddExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA, undefined);
        expect(RemoveExcludeSchema).not.toHaveBeenCalled();
    });

    it('REMOVES the exclusion when the app seeded nothing (bizapps-caliber shape)', async () => {
        serve(manifestJSON());

        await InstallApp({ Source: REPO_URL }, contextWithSeededEntities(0));

        expect(RemoveExcludeSchema).toHaveBeenCalledWith('/tmp/test-repo', APP_SCHEMA, undefined);
        expect(AddExcludeSchema).not.toHaveBeenCalled();
    });

    it('an explicit selfManagedMetadata:true wins over a zero-entity probe', async () => {
        serve(manifestJSON(true));

        await InstallApp({ Source: REPO_URL }, contextWithSeededEntities(0));

        expect(AddExcludeSchema).toHaveBeenCalled();
        expect(RemoveExcludeSchema).not.toHaveBeenCalled();
    });

    it('an explicit selfManagedMetadata:false wins over a seeded-entity probe', async () => {
        serve(manifestJSON(false));

        await InstallApp({ Source: REPO_URL }, contextWithSeededEntities(10));

        expect(RemoveExcludeSchema).toHaveBeenCalled();
        expect(AddExcludeSchema).not.toHaveBeenCalled();
    });

    it('changes NOTHING when the probe fails — never guess with a destructive edit', async () => {
        serve(manifestJSON());

        const result = await InstallApp({ Source: REPO_URL }, contextWithSeededEntities(0, { failQuery: true }));

        expect(result.Success).toBe(true);
        expect(AddExcludeSchema).not.toHaveBeenCalled();
        expect(RemoveExcludeSchema).not.toHaveBeenCalled();
    });
});
