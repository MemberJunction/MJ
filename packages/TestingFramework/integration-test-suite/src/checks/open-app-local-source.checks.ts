/**
 * open-app-local-source.checks.ts — the 'open-app-local-source' bundle (OLS1–OLS11): live checks for
 * Open Apps installed from a folder in the consumer repository (a `file:` locator).
 *
 * The lifecycle builds a throwaway consumer repository in the OS temp directory: a pnpm workspace with
 * a server and a client workspace, an mj.config.cjs, and app folders under `openapps/`. The checks
 * drive the real InstallApp / UpgradeApp / RemoveApp against the live database:
 *   - OLS1–OLS5, one app in order: install with migrations in subfolders, upgrade when the folder
 *     version changes, the same-version no-op and Reapply, remove while the folder is at another
 *     version, and remove.
 *   - OLS6–OLS11, one app each: a requested version the folder does not have, an app package that is
 *     not in the workspace, workspace package versions, a `file:` dependency, a folder outside the
 *     repository, and an upgrade that moves a package from `shared` to `server` (#6789).
 *
 * OLS1–OLS5, OLS9 and OLS11 create and drop schemas; on a login that cannot, they skip. Server transport only.
 * Deterministic: no model calls and no network. Teardown removes every app, schema, row and folder
 * the bundle created.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { BaseEntity, DatabaseProviderBase, RunView } from '@memberjunction/core';
import type { MJOpenAppDependencyEntity, MJOpenAppEntity, MJOpenAppInstallHistoryEntity } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import {
    DropAppSchema,
    InstallApp,
    NormalizeAppSource,
    RemoveApp,
    SchemaExists,
    UpgradeApp,
    type AppOperationResult,
    type OrchestratorContext,
} from '@memberjunction/open-app-engine';
import {
    Assert,
    AssertEqual,
    IntegrationCheckRegistry,
    LoadDbConfig,
    SkipCheck,
    type IntegrationCheckContext,
    type NamedCheck,
    type OpenAppLocalSourceFixture,
} from '@memberjunction/testing-integration';

const BUNDLE = 'open-app-local-source';
const SERVER_WORKSPACE = 'packages/MJAPI';
const CLIENT_WORKSPACE = 'packages/MJExplorer';
const TEST_MJ_VERSION = '6.0.0';
const SCHEMA_PLACEHOLDER = '${flyway:defaultSchema}';

type AppRow = Pick<MJOpenAppEntity, 'ID' | 'Name' | 'Version' | 'Status' | 'RepositoryURL' | 'SchemaName'>;
type HistoryRow = Pick<MJOpenAppInstallHistoryEntity, 'Action' | 'Version' | 'PreviousVersion' | 'Success'>;
type DependencyRow = Pick<MJOpenAppDependencyEntity, 'DependsOnAppName' | 'InstalledVersion' | 'Status'>;

/** An engine context plus the errors and warnings the engine reported through it. */
interface EngineRun {
    Context: OrchestratorContext;
    Messages: string[];
}

// ─── Fixture access ──────────────────────────────────────────────────────────

function fx(ctx: IntegrationCheckContext): OpenAppLocalSourceFixture {
    const fixture = ctx.OpenAppLocalSourceFixture;
    if (!fixture) {
        throw new Error(`${BUNDLE} fixture missing (bundle Setup did not run)`);
    }
    return fixture;
}

function databaseProvider(ctx: IntegrationCheckContext): DatabaseProviderBase {
    if (!(ctx.Provider instanceof DatabaseProviderBase)) {
        throw new Error(`${BUNDLE} needs a database provider (server transport)`);
    }
    return ctx.Provider;
}

function appName(fixture: OpenAppLocalSourceFixture, role: string): string {
    return `ols-${fixture.Tag}-${role}`;
}

function schemaName(fixture: OpenAppLocalSourceFixture, role: string): string {
    return role === 'main' ? `ols_${fixture.Tag}` : `ols_${fixture.Tag}_${role}`;
}

function packageName(fixture: OpenAppLocalSourceFixture, role: string): string {
    return `@ols-it/${fixture.Tag}-${role}`;
}

/** Records an app and its schema for teardown, before the call that could create them. */
function track(fixture: OpenAppLocalSourceFixture, name: string, schema?: string): void {
    if (!fixture.AppNames.includes(name)) {
        fixture.AppNames.push(name);
    }
    if (schema && !fixture.SchemaNames.includes(schema)) {
        fixture.SchemaNames.push(schema);
    }
}

function requireSchemaRights(fixture: OpenAppLocalSourceFixture): void {
    if (!fixture.CanChangeSchemas) {
        SkipCheck('the test login cannot create or drop schemas; run the tier as a db_owner login (CI runs as sa)');
    }
}

// ─── Engine context ──────────────────────────────────────────────────────────

function engineRun(ctx: IntegrationCheckContext): EngineRun {
    const fixture = fx(ctx);
    const messages: string[] = [];
    const record = (phase: string, message: string): void => {
        messages.push(`[${phase}] ${message}`);
    };
    const context: OrchestratorContext = {
        ContextUser: ctx.User,
        DatabaseProvider: databaseProvider(ctx),
        DatabaseConfig: {
            Host: fixture.Db.Host,
            Port: fixture.Db.Port,
            Database: fixture.Db.Database,
            User: fixture.Db.User,
            Password: fixture.Db.Password,
        },
        GitHubOptions: {},
        RepoRoot: fixture.RepoRoot,
        MJVersion: TEST_MJ_VERSION,
        PackageManager: 'pnpm',
        MJCoreSchema: ctx.Schema ?? '__mj',
        Callbacks: { OnError: record, OnWarn: record },
    };
    return { Context: context, Messages: messages };
}

function describeResult(result: AppOperationResult, run: EngineRun): string {
    return `${result.Action} ${result.AppName}: ${result.ErrorPhase ?? 'no phase'} — ${result.ErrorMessage ?? result.Summary ?? 'no message'}`
        + (run.Messages.length > 0 ? ` | engine log: ${run.Messages.join(' | ')}` : '');
}

function assertSucceeded(result: AppOperationResult, run: EngineRun, what: string): void {
    Assert(result.Success, `${what} failed: ${describeResult(result, run)}`);
}

function assertRefused(result: AppOperationResult, run: EngineRun, what: string, mentions: string[]): void {
    Assert(!result.Success, `${what} must fail, but it succeeded: ${describeResult(result, run)}`);
    for (const text of mentions) {
        Assert((result.ErrorMessage ?? '').includes(text), `${what}: the error must name '${text}' — got: ${result.ErrorMessage}`);
    }
}

// ─── Consumer repository ─────────────────────────────────────────────────────

function writeText(path: string, text: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
}

function writeJson(path: string, value: object): void {
    writeText(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeConsumerRepo(root: string): void {
    writeJson(join(root, 'package.json'), { name: 'ols-host', private: true });
    // CI turns on frozen lockfiles by default; the throwaway repository must update its lockfile.
    writeText(join(root, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n  - 'openapps/*/packages/*'\nfrozenLockfile: false\n");
    writeText(join(root, 'mj.config.cjs'), 'module.exports = {};\n');
    writeJson(join(root, SERVER_WORKSPACE, 'package.json'), { name: 'ols-api', private: true, dependencies: {} });
    writeJson(join(root, CLIENT_WORKSPACE, 'package.json'), { name: 'ols-explorer', private: true, dependencies: {} });
}

function manifest(name: string, version: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        manifestVersion: 1,
        name,
        displayName: name,
        description: `Integration test app ${name}`,
        version,
        publisher: { name: 'MemberJunction Integration Tests' },
        repository: 'https://github.com/MemberJunction/MJ',
        mjVersionRange: '^6.0.0',
        ...extra,
    };
}

function writeManifest(folder: string, value: Record<string, unknown>): void {
    writeJson(join(folder, 'mj-app.json'), value);
}

function appFolder(fixture: OpenAppLocalSourceFixture, role: string): string {
    return join(fixture.RepoRoot, 'openapps', role);
}

function widgetLabel(step: number, platform: string): string {
    return `v${step}-${platform}`;
}

/** Writes migration step `step` for both platforms, each recording which directory it came from. */
function writeWidgetMigration(folder: string, step: number): void {
    const table = `${SCHEMA_PLACEHOLDER}.widget`;
    for (const [directory, platform] of [['migrations', 'sqlserver'], ['migrations-pg', 'postgresql']]) {
        const create = step === 1 ? `CREATE TABLE ${table} (id INT NOT NULL PRIMARY KEY, label VARCHAR(50) NOT NULL);\n` : '';
        const insert = `INSERT INTO ${table} (id, label) VALUES (${step}, '${widgetLabel(step, platform)}');\n`;
        writeText(join(folder, directory, `v${step}`, `V${step}__widget_step_${step}.sql`), create + insert);
    }
}

function writeTeardown(folder: string): void {
    for (const directory of ['teardown', 'teardown-pg']) {
        writeText(join(folder, directory, 'V1__teardown.sql'), 'SELECT 1 AS teardown_ran;\n');
    }
}

function mainManifest(fixture: OpenAppLocalSourceFixture, version: string): Record<string, unknown> {
    return manifest(appName(fixture, 'main'), version, {
        schema: { name: schemaName(fixture, 'main') },
        migrations: { directory: 'migrations', teardownDirectory: 'teardown' },
    });
}

function writeMainApp(fixture: OpenAppLocalSourceFixture): void {
    const folder = appFolder(fixture, 'main');
    writeManifest(folder, mainManifest(fixture, '1.0.0'));
    writeWidgetMigration(folder, 1);
    writeTeardown(folder);
}

function writeRefusedApps(fixture: OpenAppLocalSourceFixture): void {
    const pinned = appFolder(fixture, 'pinned');
    writeManifest(pinned, manifest(appName(fixture, 'pinned'), '1.0.0', {
        schema: { name: schemaName(fixture, 'pinned') },
        migrations: { directory: 'migrations' },
    }));
    writeWidgetMigration(pinned, 1);

    const unlinked = appFolder(fixture, 'unlinked');
    writeManifest(unlinked, manifest(appName(fixture, 'unlinked'), '1.0.0', {
        schema: { name: schemaName(fixture, 'unlinked') },
        migrations: { directory: 'migrations' },
        packages: { server: [{ name: packageName(fixture, 'missing'), role: 'library' }] },
    }));
    writeWidgetMigration(unlinked, 1);

    writeManifest(fixture.OutsideFolder, manifest(appName(fixture, 'outside'), '1.0.0'));
}

function writePackageApp(fixture: OpenAppLocalSourceFixture): void {
    const folder = appFolder(fixture, 'linked');
    writeManifest(folder, manifest(appName(fixture, 'linked'), '1.0.0', {
        packages: { server: [{ name: packageName(fixture, 'server'), role: 'library' }] },
    }));
    writeJson(join(folder, 'packages', 'server', 'package.json'), { name: packageName(fixture, 'server'), version: '1.0.0', main: 'index.js' });
    writeText(join(folder, 'packages', 'server', 'index.js'), 'module.exports = {};\n');
}

/** Each app owns a schema: on SQL Server, UQ_OpenApp_Schema allows only one Open App row without one. */
function writeDependencyApps(fixture: OpenAppLocalSourceFixture): void {
    writeManifest(appFolder(fixture, 'base'), manifest(appName(fixture, 'base'), '1.2.0', {
        schema: { name: schemaName(fixture, 'base') },
    }));
    writeManifest(appFolder(fixture, 'consumer'), manifest(appName(fixture, 'consumer'), '1.0.0', {
        schema: { name: schemaName(fixture, 'consumer') },
        dependencies: { [appName(fixture, 'base')]: { version: '^1.0.0', repository: 'file:openapps/base' } },
    }));
}

/**
 * `moved` v1.0.0 declares its library under `shared`, so it is pinned in both workspaces; v1.1.0
 * (written by OLS11) moves it to `server`. The real bizapps-forms 0.14.0 → 1.0.0 shape (#6789).
 */
function movedManifest(fixture: OpenAppLocalSourceFixture, version: string): Record<string, unknown> {
    const server = { name: packageName(fixture, 'moved-server'), role: 'library' };
    const lib = { name: packageName(fixture, 'moved-lib'), role: 'library' };
    return manifest(appName(fixture, 'moved'), version, {
        schema: { name: schemaName(fixture, 'moved') },
        packages: version === '1.0.0' ? { server: [server], shared: [lib] } : { server: [server, lib] },
    });
}

function writeMovedApp(fixture: OpenAppLocalSourceFixture): void {
    const folder = appFolder(fixture, 'moved');
    writeManifest(folder, movedManifest(fixture, '1.0.0'));
    for (const role of ['moved-server', 'moved-lib']) {
        writeJson(join(folder, 'packages', role, 'package.json'), { name: packageName(fixture, role), version: '1.0.0', main: 'index.js' });
        writeText(join(folder, 'packages', role, 'index.js'), 'module.exports = {};\n');
    }
}

function serverPackageJsonPath(fixture: OpenAppLocalSourceFixture): string {
    return join(fixture.RepoRoot, SERVER_WORKSPACE, 'package.json');
}

function workspaceDependency(fixture: OpenAppLocalSourceFixture, workspace: string, name: string): string | undefined {
    const pkg: { dependencies?: Record<string, string> } = JSON.parse(readFileSync(join(fixture.RepoRoot, workspace, 'package.json'), 'utf-8'));
    return pkg.dependencies?.[name];
}

function workspaceLink(fixture: OpenAppLocalSourceFixture, workspace: string, name: string): string {
    return join(fixture.RepoRoot, workspace, 'node_modules', ...name.split('/'));
}

// ─── Database reads ──────────────────────────────────────────────────────────

async function findApp(ctx: IntegrationCheckContext, name: string): Promise<AppRow | undefined> {
    const result = await new RunView(databaseProvider(ctx)).RunView<AppRow>({
        EntityName: 'MJ: Open Apps',
        ExtraFilter: `Name = '${EscapeSQLString(name)}'`,
        Fields: ['ID', 'Name', 'Version', 'Status', 'RepositoryURL', 'SchemaName'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    Assert(result.Success, `Open Apps lookup failed: ${result.ErrorMessage}`);
    return result.Results[0];
}

async function requireApp(ctx: IntegrationCheckContext, name: string): Promise<AppRow> {
    const app = await findApp(ctx, name);
    if (!app) {
        throw new Error(`no MJ: Open Apps row for '${name}'`);
    }
    return app;
}

async function historyOf(ctx: IntegrationCheckContext, app: AppRow): Promise<HistoryRow[]> {
    const result = await new RunView(databaseProvider(ctx)).RunView<HistoryRow>({
        EntityName: 'MJ: Open App Install Histories',
        ExtraFilter: `OpenAppID = '${EscapeSQLString(app.ID)}'`,
        Fields: ['Action', 'Version', 'PreviousVersion', 'Success'],
        OrderBy: 'StartedAt ASC',
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    Assert(result.Success, `install history lookup failed: ${result.ErrorMessage}`);
    return result.Results;
}

async function dependenciesOf(ctx: IntegrationCheckContext, app: AppRow): Promise<DependencyRow[]> {
    const result = await new RunView(databaseProvider(ctx)).RunView<DependencyRow>({
        EntityName: 'MJ: Open App Dependencies',
        ExtraFilter: `OpenAppID = '${EscapeSQLString(app.ID)}'`,
        Fields: ['DependsOnAppName', 'InstalledVersion', 'Status'],
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    Assert(result.Success, `dependency lookup failed: ${result.ErrorMessage}`);
    return result.Results;
}

async function schemaExists(ctx: IntegrationCheckContext, schema: string): Promise<boolean> {
    const db = databaseProvider(ctx);
    return SchemaExists(db.Dialect.CanonicalSchemaName(schema), db);
}

/** The widget labels in id order, joined with commas. */
async function widgetLabels(ctx: IntegrationCheckContext, schema: string): Promise<string> {
    const db = databaseProvider(ctx);
    const table = db.Dialect.QuoteSchema(db.Dialect.CanonicalSchemaName(schema), 'widget');
    const rows = await db.ExecuteSQL<{ label: string }>(`SELECT label FROM ${table} ORDER BY id`);
    return rows.map((row) => row.label).join(',');
}

function expectedLabels(ctx: IntegrationCheckContext, steps: number): string {
    const platform = databaseProvider(ctx).Dialect.PlatformKey;
    return Array.from({ length: steps }, (_, index) => widgetLabel(index + 1, platform)).join(',');
}

function countActions(history: HistoryRow[], action: HistoryRow['Action']): number {
    return history.filter((row) => row.Action === action).length;
}

/** True when the login can create and drop schemas. */
async function canChangeSchemas(db: DatabaseProviderBase): Promise<boolean> {
    const sql = db.Dialect.PlatformKey === 'postgresql'
        ? `SELECT CASE WHEN has_database_privilege(current_database(), 'CREATE') THEN 1 ELSE 0 END AS n`
        : `SELECT CASE WHEN IS_SRVROLEMEMBER('sysadmin') = 1 OR IS_ROLEMEMBER('db_owner') = 1 THEN 1 ELSE 0 END AS n`;
    const rows = await db.ExecuteSQL<{ n: number }>(sql);
    return Number(rows[0]?.n) === 1;
}

// ─── Checks ──────────────────────────────────────────────────────────────────

async function checkInstallFromFolder(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    requireSchemaRights(fixture);
    const name = appName(fixture, 'main');
    const schema = schemaName(fixture, 'main');
    const normalized = NormalizeAppSource(appFolder(fixture, 'main'), fixture.RepoRoot);
    if ('ErrorMessage' in normalized) {
        throw new Error(`NormalizeAppSource refused the app folder: ${normalized.ErrorMessage}`);
    }
    AssertEqual(normalized.Source, 'file:openapps/main', 'an absolute folder path becomes a file: locator relative to the repository');

    track(fixture, name, schema);
    const run = engineRun(ctx);
    assertSucceeded(await InstallApp({ Source: normalized.Source }, run.Context), run, 'install from the folder');

    const app = await requireApp(ctx, name);
    AssertEqual(app.RepositoryURL, 'file:openapps/main', 'the app records its folder locator');
    AssertEqual(app.Version, '1.0.0', 'the app records the folder version');
    AssertEqual(app.Status, 'Active', 'the app is active');
    AssertEqual(await widgetLabels(ctx, schema), expectedLabels(ctx, 1), 'the migration in a subfolder ran, from the directory for this platform');
    const history = await historyOf(ctx, app);
    Assert(history.some((row) => row.Action === 'Install' && row.Success), 'a successful Install history row exists');
}

async function checkUpgradeToFolderVersion(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    requireSchemaRights(fixture);
    const name = appName(fixture, 'main');
    const folder = appFolder(fixture, 'main');
    writeManifest(folder, mainManifest(fixture, '1.1.0'));
    writeWidgetMigration(folder, 2);

    const run = engineRun(ctx);
    assertSucceeded(await UpgradeApp({ AppName: name }, run.Context), run, 'upgrade to the folder version');

    const app = await requireApp(ctx, name);
    AssertEqual(app.Version, '1.1.0', 'the app records the new folder version');
    AssertEqual(app.RepositoryURL, 'file:openapps/main', 'the upgrade keeps the folder locator');
    AssertEqual(await widgetLabels(ctx, schemaName(fixture, 'main')), expectedLabels(ctx, 2), 'only the new migration ran');
    const upgrade = (await historyOf(ctx, app)).filter((row) => row.Action === 'Upgrade');
    Assert(upgrade.some((row) => row.Success && row.Version === '1.1.0' && row.PreviousVersion === '1.0.0'), 'a successful 1.0.0 → 1.1.0 Upgrade history row exists');
}

async function checkSameVersionAndReapply(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    requireSchemaRights(fixture);
    const name = appName(fixture, 'main');
    const before = countActions(await historyOf(ctx, await requireApp(ctx, name)), 'Upgrade');

    const noop = engineRun(ctx);
    assertSucceeded(await UpgradeApp({ AppName: name }, noop.Context), noop, 'upgrade at the installed version');
    AssertEqual(countActions(await historyOf(ctx, await requireApp(ctx, name)), 'Upgrade'), before, 'an upgrade at the installed version does nothing');

    const reapply = engineRun(ctx);
    assertSucceeded(await UpgradeApp({ AppName: name, Reapply: true }, reapply.Context), reapply, 'reapply at the installed version');
    const app = await requireApp(ctx, name);
    AssertEqual(countActions(await historyOf(ctx, app), 'Upgrade'), before + 1, 'Reapply runs the upgrade again');
    AssertEqual(app.Version, '1.1.0', 'Reapply keeps the version');
    AssertEqual(await widgetLabels(ctx, schemaName(fixture, 'main')), expectedLabels(ctx, 2), 'Reapply does not run applied migrations again');
}

async function checkRemoveRefusedWhileFolderMoved(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    requireSchemaRights(fixture);
    const name = appName(fixture, 'main');
    const schema = schemaName(fixture, 'main');
    const folder = appFolder(fixture, 'main');
    writeManifest(folder, mainManifest(fixture, '1.2.0'));
    try {
        const run = engineRun(ctx);
        assertRefused(await RemoveApp({ AppName: name }, run.Context), run, 'remove while the folder is at another version', ['1.1.0', '1.2.0']);

        Assert(await schemaExists(ctx, schema), 'the refused remove keeps the schema');
        AssertEqual(await widgetLabels(ctx, schema), expectedLabels(ctx, 2), 'the refused remove keeps the data');
        AssertEqual((await requireApp(ctx, name)).Status, 'Active', 'the refused remove leaves the app active');
    } finally {
        writeManifest(folder, mainManifest(fixture, '1.1.0'));
    }
}

async function checkRemove(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    requireSchemaRights(fixture);
    const name = appName(fixture, 'main');
    const run = engineRun(ctx);
    assertSucceeded(await RemoveApp({ AppName: name }, run.Context), run, 'remove');

    const app = await requireApp(ctx, name);
    AssertEqual(app.Status, 'Removed', 'the app is removed');
    Assert(!(await schemaExists(ctx, schemaName(fixture, 'main'))), 'the schema is dropped');
    Assert((await historyOf(ctx, app)).some((row) => row.Action === 'Remove' && row.Success), 'a successful Remove history row exists');
}

async function checkRequestedVersionNotInFolder(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    const name = appName(fixture, 'pinned');
    const schema = schemaName(fixture, 'pinned');
    track(fixture, name, schema);
    const run = engineRun(ctx);
    const result = await InstallApp({ Source: 'file:openapps/pinned', Version: '2.0.0' }, run.Context);

    assertRefused(result, run, 'install of a version the folder does not have', ['1.0.0', '2.0.0']);
    AssertEqual(await findApp(ctx, name), undefined, 'no app row is written');
    Assert(!(await schemaExists(ctx, schema)), 'no schema is created');
}

async function checkPackageNotInWorkspace(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    const name = appName(fixture, 'unlinked');
    const schema = schemaName(fixture, 'unlinked');
    const serverPackageJson = readFileSync(serverPackageJsonPath(fixture), 'utf-8');
    track(fixture, name, schema);
    const run = engineRun(ctx);
    const result = await InstallApp({ Source: 'file:openapps/unlinked' }, run.Context);

    assertRefused(result, run, 'install with an app package outside the workspace', [packageName(fixture, 'missing'), 'pnpm-workspace.yaml']);
    AssertEqual(await findApp(ctx, name), undefined, 'no app row is written');
    Assert(!(await schemaExists(ctx, schema)), 'no schema is created');
    AssertEqual(readFileSync(serverPackageJsonPath(fixture), 'utf-8'), serverPackageJson, 'the server package.json is unchanged');
}

async function checkWorkspacePackages(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    const name = appName(fixture, 'linked');
    const pkg = packageName(fixture, 'server');
    const link = workspaceLink(fixture, SERVER_WORKSPACE, pkg);
    track(fixture, name);
    const install = engineRun(ctx);
    assertSucceeded(await InstallApp({ Source: 'file:openapps/linked' }, install.Context), install, 'install with workspace packages');

    AssertEqual(workspaceDependency(fixture, SERVER_WORKSPACE, pkg), 'workspace:*', 'the server workspace depends on the app package as workspace:*');
    Assert(existsSync(link), `pnpm linked the app package into the server workspace (${link})`);
    AssertEqual(realpathSync(link), realpathSync(join(appFolder(fixture, 'linked'), 'packages', 'server')), 'the link points at the app folder package');
    AssertEqual((await requireApp(ctx, name)).Status, 'Active', 'the app is active, so its packages installed');

    const remove = engineRun(ctx);
    assertSucceeded(await RemoveApp({ AppName: name }, remove.Context), remove, 'remove with workspace packages');
    AssertEqual(workspaceDependency(fixture, SERVER_WORKSPACE, pkg), undefined, 'remove takes the app package out of the server workspace');
}

async function checkUpgradeDropsMovedPackagePin(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    requireSchemaRights(fixture);
    const name = appName(fixture, 'moved');
    const lib = packageName(fixture, 'moved-lib');
    track(fixture, name, schemaName(fixture, 'moved'));
    const install = engineRun(ctx);
    assertSucceeded(await InstallApp({ Source: 'file:openapps/moved' }, install.Context), install, 'install with a shared package');
    AssertEqual(workspaceDependency(fixture, CLIENT_WORKSPACE, lib), 'workspace:*', 'a shared package is pinned in the client workspace');
    Assert(existsSync(workspaceLink(fixture, CLIENT_WORKSPACE, lib)), 'pnpm linked the shared package into the client workspace');

    writeManifest(appFolder(fixture, 'moved'), movedManifest(fixture, '1.1.0'));
    const upgrade = engineRun(ctx);
    assertSucceeded(await UpgradeApp({ AppName: name }, upgrade.Context), upgrade, 'upgrade that moves the package to server');

    AssertEqual(workspaceDependency(fixture, CLIENT_WORKSPACE, lib), undefined, 'the upgrade removes the client pin the new version no longer lists');
    Assert(!existsSync(workspaceLink(fixture, CLIENT_WORKSPACE, lib)), 'the install unlinked the package from the client workspace');
    AssertEqual(workspaceDependency(fixture, SERVER_WORKSPACE, lib), 'workspace:*', 'the server workspace keeps the package');
    AssertEqual((await requireApp(ctx, name)).Version, '1.1.0', 'the app records the new folder version');
}

async function checkFileDependency(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    requireSchemaRights(fixture);
    const baseName = appName(fixture, 'base');
    const consumerName = appName(fixture, 'consumer');
    track(fixture, baseName, schemaName(fixture, 'base'));
    track(fixture, consumerName, schemaName(fixture, 'consumer'));
    const run = engineRun(ctx);
    assertSucceeded(await InstallApp({ Source: 'file:openapps/consumer' }, run.Context), run, 'install with a file: dependency');

    const base = await requireApp(ctx, baseName);
    AssertEqual(base.RepositoryURL, 'file:openapps/base', 'the dependency records its own folder locator');
    AssertEqual(base.Version, '1.2.0', 'the dependency is installed at its folder version');
    AssertEqual(base.Status, 'Active', 'the dependency is active');
    const consumer = await requireApp(ctx, consumerName);
    AssertEqual(consumer.RepositoryURL, 'file:openapps/consumer', 'the app records its folder locator');
    const dependencies = await dependenciesOf(ctx, consumer);
    Assert(
        dependencies.some((row) => row.DependsOnAppName === baseName && row.Status === 'Satisfied'),
        `the app records a satisfied dependency on '${baseName}' — got ${JSON.stringify(dependencies)}`,
    );
}

async function checkFolderOutsideRepository(ctx: IntegrationCheckContext): Promise<void> {
    const fixture = fx(ctx);
    const name = appName(fixture, 'outside');
    const normalized = NormalizeAppSource(fixture.OutsideFolder, fixture.RepoRoot);
    Assert('ErrorMessage' in normalized && normalized.ErrorMessage.includes('outside the repository root'), 'NormalizeAppSource refuses a folder outside the repository');

    track(fixture, name);
    const run = engineRun(ctx);
    const result = await InstallApp({ Source: `file:../${basename(fixture.OutsideFolder)}` }, run.Context);
    assertRefused(result, run, 'install from a folder outside the repository', ['outside the repository root']);
    AssertEqual(await findApp(ctx, name), undefined, 'no app row is written');
}

export const OpenAppLocalSourceChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.OLS1`, Name: 'OLS1: install from a folder records its file: locator and runs migrations in subfolders', Fn: checkInstallFromFolder },
    { Id: `${BUNDLE}.OLS2`, Name: 'OLS2: upgrade to a new folder version runs only the new migration', Fn: checkUpgradeToFolderVersion },
    { Id: `${BUNDLE}.OLS3`, Name: 'OLS3: upgrade at the folder version does nothing; Reapply runs it again', Fn: checkSameVersionAndReapply },
    { Id: `${BUNDLE}.OLS4`, Name: 'OLS4: remove while the folder is at another version changes nothing', Fn: checkRemoveRefusedWhileFolderMoved },
    { Id: `${BUNDLE}.OLS5`, Name: 'OLS5: remove drops the schema and marks the app removed', Fn: checkRemove },
    { Id: `${BUNDLE}.OLS6`, Name: 'OLS6: a requested version the folder does not have stops before any change', Fn: checkRequestedVersionNotInFolder },
    { Id: `${BUNDLE}.OLS7`, Name: 'OLS7: an app package that is not in the workspace stops before any change', Fn: checkPackageNotInWorkspace },
    { Id: `${BUNDLE}.OLS8`, Name: 'OLS8: app packages are written as workspace:* and linked by pnpm', Fn: checkWorkspacePackages },
    { Id: `${BUNDLE}.OLS9`, Name: 'OLS9: a file: dependency installs from its folder first', Fn: checkFileDependency },
    { Id: `${BUNDLE}.OLS10`, Name: 'OLS10: a folder outside the repository is refused', Fn: checkFolderOutsideRepository },
    { Id: `${BUNDLE}.OLS11`, Name: 'OLS11: an upgrade that moves a package from shared to server removes its client pin', Fn: checkUpgradeDropsMovedPackagePin },
];

for (const check of OpenAppLocalSourceChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

/** Runs every teardown step, then throws one error that lists the steps that failed. */
class TeardownSteps {
    private readonly failures: string[] = [];

    public async Run(label: string, work: () => Promise<void>): Promise<void> {
        try {
            await work();
        } catch (error: unknown) {
            this.failures.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public ThrowIfAnyFailed(): void {
        if (this.failures.length > 0) {
            throw new Error(`${BUNDLE} teardown left work undone — ${this.failures.join('; ')}`);
        }
    }
}

async function removeIfInstalled(ctx: IntegrationCheckContext, name: string): Promise<void> {
    const app = await findApp(ctx, name);
    if (!app || app.Status === 'Removed') {
        return;
    }
    const result = await RemoveApp({ AppName: name, Force: true }, engineRun(ctx).Context);
    if (!result.Success) {
        throw new Error(result.ErrorMessage ?? 'RemoveApp failed');
    }
}

async function dropIfPresent(ctx: IntegrationCheckContext, schema: string): Promise<void> {
    if (!(await schemaExists(ctx, schema))) {
        return;
    }
    const result = await DropAppSchema(schema, databaseProvider(ctx), { CoreSchema: ctx.Schema ?? '__mj' });
    if (!result.Success) {
        throw new Error(result.ErrorMessage ?? 'DropAppSchema failed');
    }
}

async function deleteRows(rows: BaseEntity[]): Promise<void> {
    for (const row of rows) {
        if (!(await row.Delete())) {
            throw new Error(row.LatestResult?.CompleteMessage ?? `could not delete a ${row.EntityInfo.Name} row`);
        }
    }
}

/** Deletes the bundle's Open App rows and their history and dependency rows. */
async function deleteAppRows(ctx: IntegrationCheckContext, fixture: OpenAppLocalSourceFixture): Promise<void> {
    const rv = new RunView(databaseProvider(ctx));
    const apps = await rv.RunView<MJOpenAppEntity>({
        EntityName: 'MJ: Open Apps',
        ExtraFilter: `Name LIKE 'ols-${EscapeSQLString(fixture.Tag)}-%'`,
        ResultType: 'entity_object',
        BypassCache: true,
    }, ctx.User);
    if (!apps.Success) {
        throw new Error(apps.ErrorMessage);
    }
    if (apps.Results.length === 0) {
        return;
    }
    const ids = apps.Results.map((app) => `'${EscapeSQLString(app.ID)}'`).join(', ');
    const children = await rv.RunViews<BaseEntity>([
        { EntityName: 'MJ: Open App Install Histories', ExtraFilter: `OpenAppID IN (${ids})`, ResultType: 'entity_object', BypassCache: true },
        { EntityName: 'MJ: Open App Dependencies', ExtraFilter: `OpenAppID IN (${ids}) OR DependsOnAppID IN (${ids})`, ResultType: 'entity_object', BypassCache: true },
    ], ctx.User);
    for (const child of children) {
        await deleteRows(child.Results);
    }
    await deleteRows(apps.Results);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        const tag = `${Date.now().toString(36)}${randomBytes(2).toString('hex')}`;
        const repoRoot = mkdtempSync(join(tmpdir(), `ols-${tag}-`));
        const fixture: OpenAppLocalSourceFixture = {
            Tag: tag,
            RepoRoot: repoRoot,
            OutsideFolder: `${repoRoot}-outside`,
            Db: await LoadDbConfig(),
            CanChangeSchemas: false,
            AppNames: [],
            SchemaNames: [],
        };
        // Published before the first write, so teardown can clean up a partial setup.
        ctx.OpenAppLocalSourceFixture = fixture;
        fixture.CanChangeSchemas = await canChangeSchemas(databaseProvider(ctx));
        writeConsumerRepo(repoRoot);
        writeMainApp(fixture);
        writeRefusedApps(fixture);
        writePackageApp(fixture);
        writeDependencyApps(fixture);
        writeMovedApp(fixture);
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const fixture = ctx.OpenAppLocalSourceFixture;
        if (!fixture) {
            return;
        }
        const steps = new TeardownSteps();
        for (const name of [...fixture.AppNames].reverse()) {
            await steps.Run(`remove ${name}`, () => removeIfInstalled(ctx, name));
        }
        if (fixture.CanChangeSchemas) {
            for (const schema of fixture.SchemaNames) {
                await steps.Run(`drop schema ${schema}`, () => dropIfPresent(ctx, schema));
            }
        }
        await steps.Run('delete Open App rows', () => deleteAppRows(ctx, fixture));
        rmSync(fixture.RepoRoot, { recursive: true, force: true });
        rmSync(fixture.OutsideFolder, { recursive: true, force: true });
        ctx.OpenAppLocalSourceFixture = undefined;
        steps.ThrowIfAnyFailed();
    },
});
