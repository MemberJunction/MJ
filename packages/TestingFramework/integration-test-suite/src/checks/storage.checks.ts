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
 *
 * Read-only except ST4's single self-cleaning `MJ: Files` row (DeleteType='Hard', deleted in
 * a finally). No lifecycle registration needed.
 *
 * // CI-FIRST-RUN: designed from the real APIs against the migrated schema (seed rows read
 * // from the v5.38 baseline). Not yet executed against a live DB in the authoring session —
 * // watch ST1 (exact seeded key strings) and ST4 (Files entity has no CHECK on Status) on
 * // the first CI run.
 */
import { RunView } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import { MJFileEntity, MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { FileStorageEngine, FileStorageBase } from '@memberjunction/storage';
import { Assert, AssertEqual, IntegrationCheckRegistry } from '@memberjunction/testing-integration';
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
    }
];

for (const check of StorageChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
