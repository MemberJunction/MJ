/**
 * Remove-flow tests for the symmetric metadata teardown (HandleMetadataRetire).
 *
 * A metadata-extending app (`metadata.processOnInstall: true`, no schema) seeds rows into
 * the shared __mj schema at install. On remove, the engine must download the app's metadata
 * at the INSTALLED version, mark every record for deletion, and run the host's MetadataPusher
 * with `deleteDbOnly` — so mj-sync's DeletionAuditor removes the rows in FK-safe order. These
 * tests stub every external collaborator (GitHub fetch, DB records, packages, config) and
 * assert that teardown:
 *   1. marks every record (top-level + nested relatedEntities) with `deleteRecord`,
 *   2. invokes the pusher with `deleteDbOnly: true`,
 *   3. downloads from the persisted version + subpath, and
 *   4. fails the remove loudly when the host provides no pusher (never silently orphans).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../github/github-client.js', () => ({
    FetchManifestFromGitHub: vi.fn(),
    DownloadMigrations: vi.fn(),
    DownloadDirectory: vi.fn(),
    GetLatestVersion: vi.fn(),
    ValidateGitHubTag: vi.fn(),
    ParseGitHubUrl: (u: string) => {
        const m = u.match(/github\.com\/([^/?#]+)\/([^/?#]+)((?:\/[^?#]+)*)/);
        if (!m) return null;
        const sub = (m[3] ?? '').replace(/^\/+|\/+$/g, '');
        return { Owner: m[1], Repo: m[2].replace(/\.git$/, ''), Subpath: sub.length ? sub : undefined };
    },
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
    RemoveServerDynamicPackages: vi.fn(),
    ToggleServerDynamicPackages: vi.fn(),
    AddEntityPackageMapping: vi.fn(),
    RemoveEntityPackageMapping: vi.fn(),
}));
vi.mock('../install/client-bootstrap-gen.js', () => ({ RegenerateClientBootstrap: vi.fn() }));
vi.mock('../install/history-recorder.js', () => ({
    RecordAppInstallation: vi.fn(),
    RecordInstallHistoryEntry: vi.fn(),
    RecordAppDependencies: vi.fn(),
    DeleteAppDependencies: vi.fn(),
    SetAppStatus: vi.fn(),
    FindInstalledApp: vi.fn(),
    FindDependentApps: vi.fn(),
    ListInstalledApps: vi.fn(),
    UpdateAppRecord: vi.fn(),
}));
vi.mock('@memberjunction/core', () => ({
    Metadata: class { async CreateTransactionGroup() { return { Submit: async () => true }; } },
    RunView: class {},
    BaseEntity: class {},
    DatabaseProviderBase: class {},
}));

import { RemoveApp } from '../install/install-orchestrator.js';
import type { OrchestratorContext } from '../install/install-orchestrator.js';
import { DownloadDirectory } from '../github/github-client.js';
import { RunPackageInstall } from '../install/package-manager.js';
import {
    FindInstalledApp,
    FindDependentApps,
    ListInstalledApps,
    SetAppStatus,
    RecordInstallHistoryEntry,
    UpdateAppRecord,
} from '../install/history-recorder.js';

/** A schema-less, packages-less, metadata-extending connector-profile manifest. */
function connectorManifest(): string {
    return JSON.stringify({
        manifestVersion: 1,
        name: 'acme-connector',
        displayName: 'Acme Connector',
        description: 'Acme connector metadata-extending app for tests.',
        version: '1.2.0',
        publisher: { name: 'Acme' },
        repository: 'https://github.com/acme/mj-apps',
        mjVersionRange: '>=5.43.0 <6.0.0',
        metadata: { directory: 'metadata', processOnInstall: true },
        // intentionally NO schema and NO packages — the maximally-malleable connector form
    });
}

/** A nested connector record (Integration → IntegrationObjects → IntegrationObjectFields). */
const SAMPLE_RECORD = {
    fields: { Name: 'Acme' },
    primaryKey: { ID: 'int-1' },
    relatedEntities: {
        'MJ: Integration Objects': [
            {
                fields: { Name: 'contacts' },
                primaryKey: { ID: 'io-1' },
                relatedEntities: {
                    'MJ: Integration Object Fields': [
                        { fields: { Name: 'id' }, primaryKey: { ID: 'iof-1' } },
                    ],
                },
            },
        ],
    },
};

function installedConnector(): unknown {
    return {
        ID: 'app-1',
        Name: 'acme-connector',
        Version: '1.2.0',
        RepositoryURL: 'https://github.com/acme/mj-apps',
        Subpath: 'CRM/Acme',
        SchemaName: null,
        ManifestJSON: connectorManifest(),
        Status: 'Active',
    };
}

const baseContext = {
    ContextUser: {},
    DatabaseProvider: {},
    DatabaseConfig: {},
    GitHubOptions: {},
    RepoRoot: '/tmp/test-repo',
    MJVersion: '5.43.0',
};

describe('RemoveApp — symmetric metadata retire', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(FindDependentApps).mockResolvedValue([]);
        vi.mocked(ListInstalledApps).mockResolvedValue([]);
        vi.mocked(SetAppStatus).mockResolvedValue(undefined);
        vi.mocked(RecordInstallHistoryEntry).mockResolvedValue(undefined);
        vi.mocked(UpdateAppRecord).mockResolvedValue(undefined);
        vi.mocked(RunPackageInstall).mockReturnValue({ Success: true });
        vi.mocked(FindInstalledApp).mockResolvedValue(
            installedConnector() as unknown as Awaited<ReturnType<typeof FindInstalledApp>>,
        );
        // Serve a real metadata file into the engine's temp dir so the transform has records to mark.
        vi.mocked(DownloadDirectory).mockImplementation(
            async (_repo, _ver, _dir, localDir: string) => {
                writeFileSync(join(localDir, '.acme.integration.json'), JSON.stringify(SAMPLE_RECORD, null, 2));
                return { Success: true, Files: [join(localDir, '.acme.integration.json')] };
            },
        );
    });

    it('marks every record (top-level + nested) and pushes with deleteDbOnly', async () => {
        let capturedDeleteDbOnly: boolean | undefined;
        let pushedDir = '';
        const pusher = vi.fn(async ({ dir, deleteDbOnly }: { dir: string; deleteDbOnly?: boolean }) => {
            capturedDeleteDbOnly = deleteDbOnly;
            pushedDir = dir;
            return { Success: true, Deleted: 3 };
        });
        const context = { ...baseContext, MetadataPusher: pusher } as unknown as OrchestratorContext;

        const result = await RemoveApp({ AppName: 'acme-connector' }, context);

        expect(result.Success).toBe(true);
        expect(pusher).toHaveBeenCalledTimes(1);
        expect(capturedDeleteDbOnly).toBe(true);

        // Download used the persisted installed version + subpath (the manifest is the SOT).
        expect(DownloadDirectory).toHaveBeenCalledWith(
            'https://github.com/acme/mj-apps',
            '1.2.0',
            'metadata',
            expect.any(String),
            expect.anything(),
            'CRM/Acme',
        );

        // Every record node carries the deletion marker in the dir handed to the pusher.
        const file = readdirSync(pushedDir).find((f) => f.endsWith('.json'))!;
        const marked = JSON.parse(readFileSync(join(pushedDir, file), 'utf-8'));
        expect(marked.deleteRecord).toEqual({ delete: true });
        const io = marked.relatedEntities['MJ: Integration Objects'][0];
        expect(io.deleteRecord).toEqual({ delete: true });
        const iof = io.relatedEntities['MJ: Integration Object Fields'][0];
        expect(iof.deleteRecord).toEqual({ delete: true });
    });

    it('fails the remove loudly when the host provides no MetadataPusher (never silently orphans)', async () => {
        const context = { ...baseContext } as unknown as OrchestratorContext; // no MetadataPusher

        const result = await RemoveApp({ AppName: 'acme-connector' }, context);

        expect(result.Success).toBe(false);
        expect(result.ErrorMessage).toMatch(/MetadataPusher/i);
    });
});
