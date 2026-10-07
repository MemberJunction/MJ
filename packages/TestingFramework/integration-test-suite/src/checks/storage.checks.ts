/**
 * storage.checks.ts — the 'storage' bundle (ST1–ST6): the file-storage abstraction's
 * DETERMINISTIC seams, exercised against the live DB + the real compiled driver registry
 * (packages/MJStorage — a subsystem that previously had zero integration coverage).
 *
 * SERVER TRANSPORT, no cloud credentials: every shipped storage driver (AWS S3, Azure Blob,
 * GCS, Google Drive, Dropbox, Box, SharePoint) demands provider credentials in its CONSTRUCTOR
 * (env-var `.required()` calls), and there is no filesystem/local driver in the package — so a
 * real put/get/list/delete round-trip is structurally impossible in the credential-free CI
 * environment. What IS real and deterministic without credentials — and what this bundle pins:
 *
 *   - ST1  The seeded provider catalog: `FileStorageEngine.Config` against the live DB loads
 *          the 7 canonical `MJ: File Storage Providers` rows with their EXACT
 *          ServerDriverKey/ClientDriverKey values (the DB half of the dispatch seam).
 *   - ST2  Metadata↔ClassFactory parity: every canonical ServerDriverKey resolves to a REAL
 *          compiled `FileStorageBase` subclass registration — a renamed driver key (either
 *          side) breaks upload/download dispatch for that provider, and ONLY this seam-level
 *          check catches it. (No instantiation: constructors require credentials by design.)
 *   - ST3  Unknown-account contract: GetAccountById → undefined, GetAccountWithProvider →
 *          null, ResolveStorageAccount(explicitId) → null — an EXPLICIT account ID is never
 *          silently substituted with some other account — and GetDriver(unknownId) throws
 *          the documented "not found in cached metadata" error.
 *   - ST4  The `MJ: Files` record substrate (step 4 of `UploadFile`, headless): a Files row
 *          FK'd to a canonical provider round-trips (Status/ProviderKey/ContentType + the
 *          view-only `Provider` name), then hard-deletes clean. Self-cleaning in-check.
 *   - ST5  Account-resolution contract, both legs honestly: with ZERO accounts (the fresh-CI
 *          state) `ResolveStorageAccount()` → null and `UploadFile` throws its documented
 *          "no file storage accounts configured" error; when a deployment DOES have accounts,
 *          resolution returns a real account whose provider join is intact.
 *   - ST6  Engine lifecycle: Config is idempotent (second call keeps state), forceRefresh
 *          reloads without losing the canonical catalog, and HasStorageAccounts agrees with
 *          AccountsWithProviders.
 *   - ST7  The storage-account gate refuses an account that does not exist with the SAME
 *          access-denied message as a restricted one (`StorageAccessEvaluator`), so the refusal
 *          never reveals whether an account ID is real — and it does so before `GetDriver`.
 *   - ST8  Account permissions are evaluated per call against `MJ: File Storage Account
 *          Permissions` (A12.1/A12.16): on a fixture account, zero rows → open (the current
 *          product rule, pinned); a Role row the seeded no-grant user lacks → that user is refused
 *          with the access-denied error while the context user passes the gate (the driver's own
 *          credential error proves the gate was passed); CanWrite is decided separately from
 *          CanRead; a grant added mid-check is seen on the next call. Fixture rows are deleted and
 *          asserted gone.
 *
 * Read-only except ST4's single self-cleaning `MJ: Files` row and ST8's fixture (a credential
 * when none exists, a storage account and its permission rows), all deleted in a finally. No
 * lifecycle registration needed.
 *
 * // CI-FIRST-RUN: designed from the real APIs against the migrated schema (seed rows read
 * // from the v5.38 baseline). Not yet executed against a live DB in the authoring session —
 * // watch ST1 (exact seeded key strings) and ST4 (Files entity has no CHECK on Status) on
 * // the first CI run.
 */
import { BaseEntity, RunView, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    MJCredentialEntity,
    MJFileEntity,
    MJFileStorageAccountEntity,
    MJFileStorageAccountPermissionEntity,
    MJFileStorageProviderEntity
} from '@memberjunction/core-entities';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
    FileStorageEngine,
    FileStorageBase,
    StorageAccessEvaluator,
    StorageAccountAccessDeniedError,
    STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE
} from '@memberjunction/storage';
import {
    Assert,
    AssertEqual,
    FindUserByEmail,
    IntegrationCheckRegistry,
    SEEDED_NOGRANT_EMAIL,
    SEED_FIXTURES_COMMAND
} from '@memberjunction/testing-integration';
import { NamedCheck, IntegrationCheckContext } from '@memberjunction/testing-integration';

const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

/** An account ID that can never exist (valid uniqueidentifier, all zeros + fe suffix). */
const UNKNOWN_ACCOUNT_ID = '00000000-0000-0000-0000-0000000000fe';

/**
 * The canonical provider catalog seeded by the baseline migration: display Name → the exact
 * ServerDriverKey each row must carry, which must in turn resolve on the ClassFactory. These
 * strings are the dispatch contract between `MJ: File Storage Providers` rows and the
 * `@RegisterClass(FileStorageBase, '<key>')` decorations in packages/MJStorage/src/drivers.
 */
const CANONICAL_PROVIDERS: ReadonlyArray<{ Name: string; ServerDriverKey: string }> = [
    { Name: 'AWS S3 Storage', ServerDriverKey: 'AWS S3 Storage' },
    { Name: 'Azure Blob Storage', ServerDriverKey: 'Azure Blob Storage' },
    { Name: 'Google Cloud Storage', ServerDriverKey: 'Google Cloud Storage' },
    { Name: 'Google Drive', ServerDriverKey: 'Google Drive Storage' },
    { Name: 'Dropbox', ServerDriverKey: 'Dropbox Storage' },
    { Name: 'Box.com', ServerDriverKey: 'Box.com Storage' },
    { Name: 'SharePoint Storage', ServerDriverKey: 'SharePoint Storage' }
];

/** Ensures the engine is configured against the run-scoped provider before any assertion. */
async function configuredEngine(ctx: IntegrationCheckContext): Promise<FileStorageEngine> {
    const engine = FileStorageEngine.Instance;
    await engine.Config(false, ctx.User, ctx.Provider);
    Assert(engine.Loaded, 'FileStorageEngine.Config completed but Loaded is false');
    return engine;
}

/** Finds a canonical provider row in the engine cache by display Name, failing loudly. */
function requireProvider(engine: FileStorageEngine, name: string): MJFileStorageProviderEntity {
    const provider = engine.Providers.find(p => p.Name === name);
    Assert(provider != null, `canonical file storage provider '${name}' is missing from the engine cache — the baseline seed did not land or was renamed`);
    return provider!;
}

/** What a refused call threw: the message, or null when it did not throw. */
async function refusalOf(call: () => Promise<unknown>): Promise<string | null> {
    try {
        await call();
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : String(error);
    }
}

/** ST8's fixture: a storage account (and, when no credential existed to reuse, the credential it points at). */
interface AccountFixture {
    Account: MJFileStorageAccountEntity;
    CreatedCredential: MJCredentialEntity | null;
    Permissions: MJFileStorageAccountPermissionEntity[];
}

/**
 * The credential a fixture account points at: an existing one when the deployment has any (it is never decrypted —
 * no driver call succeeds in this bundle), else a fresh fixture credential. Null (with the reason) when neither works.
 */
async function fixtureCredential(ctx: IntegrationCheckContext): Promise<{ ID: string; Created: MJCredentialEntity | null } | string> {
    const existing = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Credentials', Fields: ['ID'], MaxRows: 1, ResultType: 'simple' }, ctx.User);
    if (existing.Success && existing.Results.length > 0) {
        return { ID: existing.Results[0].ID, Created: null };
    }
    const types = await new RunView().RunView<{ ID: string }>(
        { EntityName: 'MJ: Credential Types', Fields: ['ID'], MaxRows: 1, ResultType: 'simple' }, ctx.User);
    if (!types.Success || types.Results.length === 0) {
        return `no MJ: Credential Types row to create a fixture credential from (${types.ErrorMessage ?? 'none seeded'})`;
    }
    const credential = await ctx.Provider.GetEntityObject<MJCredentialEntity>('MJ: Credentials', ctx.User);
    credential.NewRecord();
    credential.CredentialTypeID = types.Results[0].ID;
    credential.Name = `mj-it-storage-acl-${Date.now()} ${FIXTURE_TAG}`;
    credential.Values = '{}';
    let saved = false;
    let thrown = '';
    try {
        saved = await credential.Save();
    } catch (error) {
        // Values is field-encrypted; a deployment without an encryption key throws here rather than returning false.
        thrown = error instanceof Error ? error.message : String(error);
    }
    if (!saved) {
        return `fixture credential save failed: ${thrown || credential.LatestResult?.CompleteMessage || 'unknown error'}`;
    }
    return { ID: credential.ID, Created: credential };
}

/** Creates ST8's fixture account on the AWS S3 provider, or returns why it could not. */
async function createAccountFixture(ctx: IntegrationCheckContext, engine: FileStorageEngine): Promise<AccountFixture | string> {
    const credential = await fixtureCredential(ctx);
    if (typeof credential === 'string') {
        return credential;
    }
    const account = await ctx.Provider.GetEntityObject<MJFileStorageAccountEntity>('MJ: File Storage Accounts', ctx.User);
    account.NewRecord();
    account.Name = `mj-it-storage-acl-${Date.now()} ${FIXTURE_TAG}`;
    account.ProviderID = requireProvider(engine, 'AWS S3 Storage').ID;
    account.CredentialID = credential.ID;
    account.IncludeInGlobalSearch = false;
    if (!(await account.Save())) {
        await credential.Created?.Delete().catch(() => undefined);
        return `fixture account save failed: ${account.LatestResult?.CompleteMessage ?? 'unknown error'}`;
    }
    return { Account: account, CreatedCredential: credential.Created, Permissions: [] };
}

/** Adds a permission row to the fixture account (tracked for cleanup). */
async function addPermission(
    ctx: IntegrationCheckContext,
    fixture: AccountFixture,
    row: Pick<MJFileStorageAccountPermissionEntity, 'Type' | 'CanRead' | 'CanWrite'> & { RoleID?: string; UserID?: string }
): Promise<MJFileStorageAccountPermissionEntity> {
    const permission = await ctx.Provider.GetEntityObject<MJFileStorageAccountPermissionEntity>('MJ: File Storage Account Permissions', ctx.User);
    permission.NewRecord();
    permission.FileStorageAccountID = fixture.Account.ID;
    permission.Type = row.Type;
    permission.RoleID = row.RoleID ?? null;
    permission.UserID = row.UserID ?? null;
    permission.CanRead = row.CanRead;
    permission.CanWrite = row.CanWrite;
    Assert(await permission.Save(), `permission fixture save failed: ${permission.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    fixture.Permissions.push(permission);
    return permission;
}

/** Deletes one fixture row; returns a failure description, or null when it was deleted. */
async function deleteFixtureRow(row: BaseEntity, label: string): Promise<string | null> {
    const deleted = await row.Delete().catch(() => false);
    return deleted ? null : `${label} delete failed: ${row.LatestResult?.CompleteMessage ?? 'unknown error'}`;
}

/**
 * Deletes the whole fixture in FK order — every row is attempted even when one fails — then asserts the account and
 * its permission rows are gone.
 */
async function deleteAccountFixture(ctx: IntegrationCheckContext, fixture: AccountFixture): Promise<void> {
    const failures: Array<string | null> = [];
    for (const permission of fixture.Permissions) {
        failures.push(await deleteFixtureRow(permission, 'permission'));
    }
    const accountID = EscapeSQLString(fixture.Account.ID);
    failures.push(await deleteFixtureRow(fixture.Account, 'account'));
    if (fixture.CreatedCredential) {
        failures.push(await deleteFixtureRow(fixture.CreatedCredential, 'credential'));
    }
    const [permissions, accounts] = await new RunView().RunViews<{ ID: string }>([
        {
            EntityName: 'MJ: File Storage Account Permissions',
            ExtraFilter: `FileStorageAccountID='${accountID}'`,
            Fields: ['ID'],
            ResultType: 'simple',
            BypassCache: true
        },
        { EntityName: 'MJ: File Storage Accounts', ExtraFilter: `ID='${accountID}'`, Fields: ['ID'], ResultType: 'simple', BypassCache: true },
    ], ctx.User);
    const reported = failures.filter((f): f is string => f !== null);
    Assert(reported.length === 0, `ST8 fixture cleanup: ${reported.join('; ')}`);
    AssertEqual(permissions.Results?.length ?? -1, 0, 'fixture permission rows left behind');
    AssertEqual(accounts.Results?.length ?? -1, 0, 'fixture account left behind');
}

/** Asserts `user` is refused `access` on the account with the access-denied error, before any driver call. */
async function assertRefused(ctx: IntegrationCheckContext, accountID: string, user: UserInfo, access: 'Read' | 'Write', why: string): Promise<void> {
    const evaluator = StorageAccessEvaluator.Instance;
    let error: Error | null = null;
    try {
        await evaluator.AssertAccountAccess(accountID, user, access, ctx.Provider);
    } catch (e) {
        error = e instanceof Error ? e : new Error(String(e));
    }
    Assert(error instanceof StorageAccountAccessDeniedError, `${why}: expected StorageAccountAccessDeniedError, got ${error?.message ?? 'no refusal'}`);
    AssertEqual(error!.message, STORAGE_ACCOUNT_ACCESS_DENIED_MESSAGE, `${why}: refusal message`);
}

/** The ST8 assertions proper, run against a live fixture account. */
async function assertAccountGate(ctx: IntegrationCheckContext, fixture: AccountFixture, noGrant: UserInfo, roleID: string): Promise<void> {
    const evaluator = StorageAccessEvaluator.Instance;
    const accountID = fixture.Account.ID;

    // Zero rows → open to everyone (the current product rule, pinned).
    Assert(await evaluator.UserCanAccessAccount(accountID, noGrant, 'Read', ctx.Provider),
        'a zero-row account must be open (current rule) to the no-grant user');

    // Restrict to a role the no-grant user lacks: refused for them, while the context user (who holds the role) passes the
    // same gate every account-keyed FileResolver route runs before it loads the account or touches a driver.
    await addPermission(ctx, fixture, { Type: 'Role', RoleID: roleID, CanRead: true, CanWrite: false });
    await assertRefused(ctx, accountID, noGrant, 'Read', 'no-grant user on a role-restricted account');
    const gate = await refusalOf(() => evaluator.AssertAccountAccess(accountID, ctx.User, 'Read', ctx.Provider));
    AssertEqual(gate, null, 'the context user holds the role, so the gate must let it through');
    await assertRefused(ctx, accountID, ctx.User, 'Write', 'CanWrite=0 must refuse Write even with CanRead');

    // Per call, no snapshot: a grant added now is seen by the very next call, and a revocation likewise.
    const grant = await addPermission(ctx, fixture, { Type: 'User', UserID: noGrant.ID, CanRead: true, CanWrite: false });
    Assert(await evaluator.UserCanAccessAccount(accountID, noGrant, 'Read', ctx.Provider), 'a User grant added mid-check must be seen on the next call');
    Assert((await deleteFixtureRow(grant, 'permission')) === null, 'revoking the mid-check User grant failed');
    fixture.Permissions = fixture.Permissions.filter(p => p !== grant);
    await assertRefused(ctx, accountID, noGrant, 'Read', 'a revoked User grant must stop applying on the next call');
    console.log('      → zero rows open; role-restricted: no-grant refused, context user passed; CanWrite separate; grant/revoke seen per call');
}

export const StorageChecks: NamedCheck[] = [
    {
        Id: 'storage.ST1',
        Name: 'ST1: Config loads the seeded provider catalog with exact server/client driver keys',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredEngine(ctx);
            Assert(engine.Providers.length >= CANONICAL_PROVIDERS.length,
                `expected at least the ${CANONICAL_PROVIDERS.length} canonical providers, engine cache has ${engine.Providers.length}`);

            for (const canonical of CANONICAL_PROVIDERS) {
                const row = requireProvider(engine, canonical.Name);
                AssertEqual(row.ServerDriverKey, canonical.ServerDriverKey, `ServerDriverKey for '${canonical.Name}'`);
                Assert(!!row.ClientDriverKey && row.ClientDriverKey.trim().length > 0,
                    `ClientDriverKey for '${canonical.Name}' must be non-empty`);
                // Lookup surface agreement: the by-ID path returns the same row the array holds.
                const byId = engine.GetProviderById(row.ID);
                Assert(byId != null && UUIDsEqual(byId.ID, row.ID), `GetProviderById round-trip failed for '${canonical.Name}'`);
            }
            console.log(`      → ${CANONICAL_PROVIDERS.length} canonical providers present with exact driver keys (${engine.Providers.length} total rows)`);
        }
    },
    {
        Id: 'storage.ST2',
        Name: 'ST2: every canonical ServerDriverKey resolves to a compiled FileStorageBase subclass (metadata↔ClassFactory parity)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredEngine(ctx);
            const factory = MJGlobal.Instance.ClassFactory;
            for (const canonical of CANONICAL_PROVIDERS) {
                const row = requireProvider(engine, canonical.Name);
                // GetRegistration (never CreateInstance): driver constructors demand provider
                // credentials via env — resolution is the deterministic half of the seam.
                const reg = factory.GetRegistration(FileStorageBase, row.ServerDriverKey);
                Assert(reg != null,
                    `no ClassFactory registration for FileStorageBase + '${row.ServerDriverKey}' — the '${canonical.Name}' provider row cannot dispatch to a driver`);
                const subclass = reg!.SubClass as { prototype: object; name: string };
                Assert(subclass.prototype instanceof FileStorageBase,
                    `registration for '${row.ServerDriverKey}' resolves to ${subclass.name}, which is not a proper FileStorageBase subclass`);
            }
            console.log(`      → all ${CANONICAL_PROVIDERS.length} ServerDriverKeys resolve to compiled FileStorageBase subclasses`);
        }
    },
    {
        Id: 'storage.ST3',
        Name: 'ST3: unknown-account lookups fail explicitly — no silent fallback for an explicit account ID',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredEngine(ctx);
            AssertEqual(engine.GetAccountById(UNKNOWN_ACCOUNT_ID), undefined, 'GetAccountById on an unknown ID');
            AssertEqual(engine.GetAccountWithProvider(UNKNOWN_ACCOUNT_ID), null, 'GetAccountWithProvider on an unknown ID');
            // The load-bearing precision contract: an EXPLICIT accountId must resolve to exactly
            // that account or nothing — never fall through to "the first active account".
            AssertEqual(engine.ResolveStorageAccount(UNKNOWN_ACCOUNT_ID), null,
                'ResolveStorageAccount(explicit unknown ID) must be null, never a substitute account');

            let threw = false;
            let message = '';
            try {
                await engine.GetDriver(UNKNOWN_ACCOUNT_ID, ctx.User);
            } catch (error) {
                threw = true;
                message = error instanceof Error ? error.message : String(error);
            }
            Assert(threw, 'GetDriver on an unknown account must throw, not return a driver');
            Assert(message.includes('not found in cached metadata'),
                `GetDriver's refusal must carry the documented message; got: ${message.slice(0, 300)}`);
            console.log(`      → unknown account: undefined/null/null lookups + GetDriver threw the documented error`);
        }
    },
    {
        Id: 'storage.ST4',
        Name: 'ST4: an MJ: Files record FK-ed to a canonical provider round-trips and hard-deletes (the UploadFile record substrate)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredEngine(ctx);
            const provider = requireProvider(engine, 'AWS S3 Storage');

            const file = await ctx.Provider.GetEntityObject<MJFileEntity>('MJ: Files', ctx.User);
            file.NewRecord();
            file.Name = `mj-it-storage-file-${Date.now()} ${FIXTURE_TAG}`;
            file.ProviderID = provider.ID;
            file.ContentType = 'text/plain';
            file.ProviderKey = `artifacts/mj-integration-test/${Date.now()}/probe.txt`;
            file.Status = 'Uploaded';
            Assert(await file.Save(), `MJ: Files fixture save failed: ${file.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            try {
                const readBack = await new RunView().RunView<{ ID: string; Status: string; ProviderKey: string; ContentType: string; Provider: string }>({
                    EntityName: 'MJ: Files',
                    ExtraFilter: `ID='${file.ID}'`,
                    Fields: ['ID', 'Status', 'ProviderKey', 'ContentType', 'Provider'],
                    ResultType: 'simple',
                    BypassCache: true
                }, ctx.User);
                Assert(readBack.Success, `reading back the Files fixture failed: ${readBack.ErrorMessage}`);
                AssertEqual(readBack.Results?.length ?? 0, 1, 'Files fixture rows found');
                const row = readBack.Results![0];
                AssertEqual(row.Status, 'Uploaded', 'persisted Status');
                AssertEqual(row.ProviderKey, file.ProviderKey, 'persisted ProviderKey (the storage path)');
                AssertEqual(row.ContentType, 'text/plain', 'persisted ContentType');
                // The view-only Provider name proves the FK actually joined the canonical row.
                AssertEqual(row.Provider, provider.Name, 'view-only Provider name from the FK join');
            } finally {
                await file.Delete().catch(() => undefined);
            }
            console.log(`      → Files row round-tripped against '${provider.Name}' and hard-deleted clean`);
        }
    },
    {
        Id: 'storage.ST5',
        Name: 'ST5: account resolution is honest in both states — null + documented UploadFile refusal with zero accounts, intact join otherwise',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredEngine(ctx);
            const accounts = engine.AccountsWithProviders;
            if (accounts.length === 0) {
                // The fresh-CI state: no accounts are seeded anywhere in the metadata tree.
                AssertEqual(engine.ResolveStorageAccount(), null, 'ResolveStorageAccount() with zero accounts');
                let threw = false;
                let message = '';
                try {
                    await engine.UploadFile({
                        content: Buffer.from('mj-integration-test probe'),
                        fileName: 'mj-it-storage-probe.txt',
                        mimeType: 'text/plain',
                        contextUser: ctx.User,
                        provider: ctx.Provider
                    });
                } catch (error) {
                    threw = true;
                    message = error instanceof Error ? error.message : String(error);
                }
                Assert(threw, 'UploadFile with zero accounts must throw, not attempt an upload');
                Assert(message.includes('no file storage accounts configured'),
                    `UploadFile's refusal must carry the documented message; got: ${message.slice(0, 300)}`);
                console.log(`      → zero accounts: ResolveStorageAccount()=null, UploadFile refused with the documented error`);
            } else {
                // A deployment with accounts: resolution must return a real, fully-joined pair.
                const resolved = engine.ResolveStorageAccount();
                Assert(resolved != null, `ResolveStorageAccount() returned null despite ${accounts.length} account(s)`);
                Assert(UUIDsEqual(resolved!.account.ProviderID, resolved!.provider.ID),
                    'resolved account/provider join is inconsistent (account.ProviderID != provider.ID)');
                const again = engine.GetAccountWithProvider(resolved!.account.ID);
                Assert(again != null && UUIDsEqual(again.account.ID, resolved!.account.ID),
                    'GetAccountWithProvider disagrees with ResolveStorageAccount for the same ID');
                console.log(`      → ${accounts.length} account(s): resolution returned '${resolved!.account.Name}' with an intact provider join`);
            }
        }
    },
    {
        Id: 'storage.ST6',
        Name: 'ST6: Config is idempotent and forceRefresh reloads without losing the canonical catalog',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredEngine(ctx);
            const countBefore = engine.Providers.length;
            // Idempotent path: a second non-forced Config must keep the loaded state intact.
            await engine.Config(false, ctx.User, ctx.Provider);
            Assert(engine.Loaded, 'second Config(false) dropped the loaded state');
            AssertEqual(engine.Providers.length, countBefore, 'provider count after the idempotent Config');

            // Forced refresh: a full reload against the same DB must land in the same state.
            await engine.Config(true, ctx.User, ctx.Provider);
            Assert(engine.Loaded, 'Config(true) did not restore the loaded state');
            for (const canonical of CANONICAL_PROVIDERS) {
                requireProvider(engine, canonical.Name);
            }
            AssertEqual(engine.HasStorageAccounts, engine.AccountsWithProviders.length > 0,
                'HasStorageAccounts must agree with AccountsWithProviders');
            console.log(`      → idempotent Config kept ${countBefore} providers; forceRefresh reloaded the full canonical catalog`);
        }
    },
    {
        Id: 'storage.ST7',
        Name: 'ST7: the account gate refuses an unknown account exactly like a restricted one — before GetDriver',
        Fn: async (ctx: IntegrationCheckContext) => {
            await configuredEngine(ctx);
            await assertRefused(ctx, UNKNOWN_ACCOUNT_ID, ctx.User, 'Read', 'an account that does not exist');
            await assertRefused(ctx, UNKNOWN_ACCOUNT_ID, ctx.User, 'Write', 'an account that does not exist');
            const readable = await StorageAccessEvaluator.Instance.AccessibleAccountIDs([UNKNOWN_ACCOUNT_ID, 'not-a-uuid'], ctx.User, 'Read', ctx.Provider);
            AssertEqual(readable.size, 0, 'unknown and malformed account IDs must never be reported accessible');
            console.log('      → unknown account refused with the access-denied message (Read and Write); malformed IDs never accessible');
        }
    },
    {
        Id: 'storage.ST8',
        Name: 'ST8: account permissions are evaluated per call — zero rows open, role restriction refuses the no-grant user, grants seen immediately',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredEngine(ctx);
            const noGrant = FindUserByEmail(UserCache.Instance.Users, SEEDED_NOGRANT_EMAIL);
            if (!noGrant || UUIDsEqual(noGrant.ID, ctx.User.ID)) {
                console.warn(`  ⚠ storage.ST8 SKIPPED — seeded no-grant user '${SEEDED_NOGRANT_EMAIL}' not in the user cache; `
                    + `seed with: ${SEED_FIXTURES_COMMAND}`);
                return;
            }
            AssertEqual(noGrant.UserRoles.length, 0, `fixture invalid: '${SEEDED_NOGRANT_EMAIL}' has roles; it must have none`);
            const roleID = ctx.User.UserRoles?.[0]?.RoleID;
            if (!roleID) {
                console.warn('  ⚠ storage.ST8 SKIPPED — the context user has no role to restrict the fixture account to');
                return;
            }
            const fixture = await createAccountFixture(ctx, engine);
            if (typeof fixture === 'string') {
                console.warn(`  ⚠ storage.ST8 NOTE — SKIPPED, no fixture storage account could be created: ${fixture}`);
                return;
            }
            try {
                await assertAccountGate(ctx, fixture, noGrant, roleID);
            } finally {
                await deleteAccountFixture(ctx, fixture);
            }
        }
    }
];

for (const check of StorageChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
