/**
 * Ciphertext at rest in the RunView cache (IT152, server transport, mutating).
 *
 * A record with an encrypted field (`MJ: Credentials.Values`) is written, read through `RunView`,
 * and the raw `RunViewCache` entry is inspected: the table and the cache hold only ciphertext, the
 * caller sees plaintext on the miss, on the hit (materialized from ciphertext), and as an entity
 * object.
 */
import { RunView } from '@memberjunction/core';
import type { RunViewParams } from '@memberjunction/core';
import { MJCredentialEntity } from '@memberjunction/core-entities';
import { IsValueEncrypted } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck, UniqueFilter } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { EncryptionUnavailableReason, MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';

const BUNDLE = 'ciphertext-cache';
const ENTITY = 'MJ: Credentials';
const FIELD = 'Values';
const CACHE_CATEGORY = 'RunViewCache';

interface CiphertextCacheFixture {
    RecordID: string;
    Secret: string;
    /** Filter unique to this run so the first RunView is a guaranteed cache miss. */
    Params: RunViewParams;
    /** RunViewCache keys that existed before the bundle's first read. */
    KeysBefore: Set<string>;
}

let fixture: CiphertextCacheFixture | undefined;
/** Set by Setup when the fixture was deliberately not created; every check then skips with it. */
let skipReason: string | undefined;

function fx(): CiphertextCacheFixture {
    if (skipReason) {
        SkipCheck(skipReason);
    }
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

async function firstCredentialTypeId(ctx: IntegrationCheckContext): Promise<string> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: 'MJ: Credential Types', Fields: ['ID'], MaxRows: 1, ResultType: 'simple'
    }, ctx.User);
    Assert(result.Success && result.Results.length > 0, 'no MJ: Credential Types row is seeded');
    return result.Results[0].ID;
}

/** New RunViewCache keys written since the fixture was created. */
async function newCacheKeys(ctx: IntegrationCheckContext): Promise<string[]> {
    const keys = await ctx.Storage.GetCategoryKeys(CACHE_CATEGORY);
    return keys.filter(key => !fx().KeysBefore.has(key));
}

function hasEncryptedLookingValue(serialized: string): boolean {
    const quoted = serialized.match(/"([^"]*)"/g) ?? [];
    return quoted.some(q => IsValueEncrypted(q.slice(1, -1)));
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Setup writes nothing on a deterministic-only run.
        if (!MutationTierOn(ctx)) {
            skipReason = MUTATION_TIER_OFF_REASON;
            return;
        }
        const tag = `it150-${Date.now()}`;
        const secret = `it150-secret-${tag}`;
        const credential = await ctx.Provider.GetEntityObject<MJCredentialEntity>(ENTITY, ctx.User);
        credential.NewRecord();
        credential.CredentialTypeID = await firstCredentialTypeId(ctx);
        credential.Name = `it150-credential-${tag}`;
        credential.Values = secret;
        if (!await credential.Save()) {
            const message = credential.LatestResult?.CompleteMessage ?? '';
            // A process without a base encryption key refuses the write; that is a missing credential, not a defect.
            skipReason = EncryptionUnavailableReason(message);
            Assert(skipReason != null, `fixture create failed: ${message}`);
            return;
        }
        fixture = {
            RecordID: credential.ID,
            Secret: secret,
            Params: { EntityName: ENTITY, ExtraFilter: `ID='${credential.ID}' AND ${UniqueFilter('Name', tag)}`, ResultType: 'simple' },
            KeysBefore: new Set(await ctx.Storage.GetCategoryKeys(CACHE_CATEGORY))
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        fixture = undefined;
        skipReason = undefined;
        if (!f) {
            return;
        }
        const row = await ctx.Provider.GetEntityObject<MJCredentialEntity>(ENTITY, ctx.User);
        if (await row.Load(f.RecordID)) {
            await row.Delete();
        }
    }
});

async function checkCt0TableHoldsCiphertext(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    Assert(ctx.Pool != null, 'CT0: the server transport did not supply a SQL pool');
    const info = ctx.Provider.EntityByName(ENTITY);
    Assert(info != null, `CT0: ${ENTITY} not in metadata`);
    const result = await ctx.Pool!.request().query<{ v: string }>(
        `SELECT [${FIELD}] AS v FROM [${info!.SchemaName}].[${info!.BaseTable}] WHERE ID = '${f.RecordID}'`
    );
    const stored = String(result.recordset[0]?.v ?? '');
    Assert(!stored.includes(f.Secret), 'CT0: the plaintext secret is stored in the table');
    Assert(IsValueEncrypted(stored), `CT0: the stored value does not look encrypted: ${stored.slice(0, 24)}`);
}

async function checkCt1MissReturnsPlaintextAndWritesCache(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const setsBefore = ctx.Storage.SetCount(CACHE_CATEGORY);
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<Record<string, unknown>>(f.Params, ctx.User);
    Assert(result.Success && result.Results.length === 1, `CT1: RunView failed: ${result.ErrorMessage ?? 'no row'}`);
    AssertEqual(result.Results[0][FIELD], f.Secret, 'CT1: the caller sees plaintext on the miss');
    Assert(ctx.Storage.SetCount(CACHE_CATEGORY) > setsBefore, 'CT1: the miss wrote nothing to RunViewCache');
}

async function checkCt2CacheEntryHoldsCiphertextOnly(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const keys = await newCacheKeys(ctx);
    Assert(keys.length > 0, 'CT2: no new RunViewCache key after the miss (run CT1 first)');
    let sawCiphertext = false;
    for (const key of keys) {
        const serialized = JSON.stringify(await ctx.Storage.GetItem<unknown>(key, CACHE_CATEGORY));
        Assert(!serialized.includes(f.Secret), `CT2: plaintext secret found in cache key ${key}`);
        sawCiphertext = sawCiphertext || hasEncryptedLookingValue(serialized);
    }
    Assert(sawCiphertext, 'CT2: no cache entry carries an encrypted-looking value (field missing from the cached row?)');
}

async function checkCt3HitReturnsPlaintext(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const setsBefore = ctx.Storage.SetCount(CACHE_CATEGORY);
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<Record<string, unknown>>(f.Params, ctx.User);
    Assert(result.Success && result.Results.length === 1, `CT3: RunView failed: ${result.ErrorMessage ?? 'no row'}`);
    AssertEqual(ctx.Storage.SetCount(CACHE_CATEGORY), setsBefore, 'CT3: RunViewCache writes during the hit');
    AssertEqual(result.Results[0][FIELD], f.Secret, 'CT3: the caller sees plaintext on the hit');
}

async function checkCt4EntityObjectResultDecrypts(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<MJCredentialEntity>({ ...f.Params, ResultType: 'entity_object' }, ctx.User);
    Assert(result.Success && result.Results.length === 1, `CT4: RunView failed: ${result.ErrorMessage ?? 'no row'}`);
    AssertEqual(result.Results[0].Values, f.Secret, 'CT4: the entity object holds plaintext');
}

export const CiphertextCacheChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.CT0`, Name: 'CT0: the table column holds ciphertext, not the secret', Fn: checkCt0TableHoldsCiphertext, RequiresMutation: true },
    { Id: `${BUNDLE}.CT1`, Name: 'CT1: a RunView miss returns plaintext to the caller and writes the cache', Fn: checkCt1MissReturnsPlaintextAndWritesCache, RequiresMutation: true },
    { Id: `${BUNDLE}.CT2`, Name: 'CT2: the cached entry holds ciphertext only', Fn: checkCt2CacheEntryHoldsCiphertextOnly, RequiresMutation: true },
    { Id: `${BUNDLE}.CT3`, Name: 'CT3: a cache hit still returns plaintext without rewriting the cache', Fn: checkCt3HitReturnsPlaintext, RequiresMutation: true },
    { Id: `${BUNDLE}.CT4`, Name: 'CT4: an entity_object result also decrypts', Fn: checkCt4EntityObjectResultDecrypts, RequiresMutation: true }
];

for (const check of CiphertextCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
