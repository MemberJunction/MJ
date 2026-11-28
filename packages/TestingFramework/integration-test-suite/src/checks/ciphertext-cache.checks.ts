/**
 * Ciphertext at rest in the RunView cache (IT161, server transport, mutating).
 *
 * A record with an encrypted field (`MJ: Credentials.Values`) is written, read through `RunView`,
 * and the raw `RunViewCache` entry is inspected: the table and the cache hold only ciphertext, the
 * caller sees plaintext on the miss, on the hit (materialized from ciphertext), and as an entity
 * object.
 *
 * CT5–CT6 cover the other reader of those stored rows: a peer server's cache event. A peer that
 * rewrites the slot publishes its stored rows, ciphertext included, and `BaseEngine` applied them
 * without decrypting, so `CredentialEngine` held `$ENC$…` and `GetCredential` returned no values.
 * The event is replayed at the wire (`LocalCacheManager.DispatchCacheChange` with a foreign
 * `SourceServerId`, the one field the Redis provider uses to drop its own events) using the slot's
 * real key and real stored rows, so the routing, the engine and the metadata are all real. The
 * fixture row's `__mj_UpdatedAt` is moved forward, as a peer's newer save would move it: an engine
 * skips a payload whose versions match what it holds.
 */
import { LocalCacheManager, RunView } from '@memberjunction/core';
import type { CacheChangedEvent, CacheRowDeltaPayload, RunViewParams } from '@memberjunction/core';
import { MJCredentialEntity } from '@memberjunction/core-entities';
import { CredentialEngine } from '@memberjunction/credentials';
import { IsValueEncrypted, UUIDsEqual } from '@memberjunction/global';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck, UniqueFilter } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { EncryptionUnavailableReason, MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';

const BUNDLE = 'ciphertext-cache';
const ENTITY = 'MJ: Credentials';
const FIELD = 'Values';
const CACHE_CATEGORY = 'RunViewCache';
/** The `CredentialEngine` property that holds `MJ: Credentials`. */
const ENGINE_PROPERTY = '_credentials';
/** A process id no server has, so a dispatched event reads as a peer's. */
const PEER_SERVER_ID = 'integration-test-foreign-process';
/** How long a dispatched event gets to reach the engine and finish applying or reloading. */
const EVENT_SETTLE_MS = 10_000;

interface CiphertextCacheFixture {
    RecordID: string;
    /** The credential's `Values`: JSON, so `GetCredential` can resolve it. */
    Secret: string;
    /** The plaintext token inside {@link Secret}; it must never appear in the table or the cache. */
    ApiKey: string;
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
        const apiKey = `it150-secret-${tag}`;
        const secret = JSON.stringify({ apiKey });
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
            ApiKey: apiKey,
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
    Assert(!stored.includes(f.ApiKey), 'CT0: the plaintext secret is stored in the table');
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
        Assert(!serialized.includes(f.ApiKey), `CT2: plaintext secret found in cache key ${key}`);
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

/** `CredentialEngine`'s shared slot: its key and the rows stored in it (copies). */
interface EngineSlot {
    Key: string;
    Rows: Array<Record<string, unknown>>;
    SchemaHash: string | undefined;
}

/**
 * Brings `CredentialEngine` up to date through the shared cache and returns its slot. A refresh
 * reads through the cache, so on a miss it rewrites the slot from the database: afterwards the slot
 * exists and the engine holds the fixture.
 */
async function loadEngineSlot(ctx: IntegrationCheckContext, label: string): Promise<EngineSlot> {
    const f = fx();
    await CredentialEngine.Instance.Config(false, ctx.User);
    await CredentialEngine.Instance.RefreshItem(ENGINE_PROPERTY);
    const keys = (await ctx.Storage.GetCategoryKeys(CACHE_CATEGORY))
        .filter(key => key.startsWith(`${ENTITY}|_|_|`) && key.includes('|imr:1'));
    Assert(keys.length === 1, `${label}: expected one unfiltered ${ENTITY} engine slot, found ${keys.length}`);
    const entry = await ctx.Storage.GetItem<{ results?: Array<Record<string, unknown>>; schemaHash?: string }>(keys[0], CACHE_CATEGORY);
    Assert(Array.isArray(entry?.results), `${label}: the engine slot holds no rows`);
    const rows = entry!.results!.map(row => ({ ...row }));
    const fixtureRow = rows.find(row => UUIDsEqual(String(row.ID), f.RecordID));
    Assert(fixtureRow != null, `${label}: the engine slot does not hold the fixture credential`);
    // The defect's precondition, not its fix: the stored row a peer publishes carries ciphertext.
    Assert(IsValueEncrypted(String(fixtureRow![FIELD] ?? '')), `${label}: the engine slot stores the fixture's Values unencrypted`);
    return { Key: keys[0], Rows: rows, SchemaHash: entry!.schemaHash };
}

/** The fixture row as a peer's newer save would publish it: same stored values, a later version. */
function advancedFixtureRow(slot: EngineSlot): Record<string, unknown> {
    const row = slot.Rows.find(r => UUIDsEqual(String(r.ID), fx().RecordID))!;
    return { ...row, __mj_UpdatedAt: new Date(Date.now() + 60_000).toISOString() };
}

function peerEvent(key: string, action: CacheChangedEvent['Action'], data: string): CacheChangedEvent {
    return { CacheKey: key, Category: CACHE_CATEGORY, Action: action, Timestamp: Date.now(), SourceServerId: PEER_SERVER_ID, Data: data };
}

/**
 * Dispatches a peer event and waits until the engine has acted on it. Both outcomes, applying the
 * payload and reloading instead, end by emitting the property, so an emission proves the event
 * reached the engine rather than being dropped on the way.
 */
async function dispatchToEngine(event: CacheChangedEvent, label: string): Promise<void> {
    let emissions = 0;
    let replayed = false;
    const sub = CredentialEngine.Instance.ObserveProperty(ENGINE_PROPERTY).subscribe(() => {
        if (replayed) emissions++;
    });
    replayed = true; // ObserveProperty replays the current value on subscribe
    try {
        LocalCacheManager.Instance.DispatchCacheChange(event);
        const deadline = Date.now() + EVENT_SETTLE_MS;
        while (emissions === 0 && Date.now() < deadline) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        Assert(emissions > 0, `${label}: the peer event never reached CredentialEngine (no '${ENGINE_PROPERTY}' emission)`);
    } finally {
        sub.unsubscribe();
    }
}

/** After a peer event: the engine holds plaintext and `GetCredential` resolves the key. */
async function assertEngineHoldsPlaintext(ctx: IntegrationCheckContext, label: string): Promise<void> {
    const f = fx();
    const held = CredentialEngine.Instance.GetCredentialById(f.RecordID);
    Assert(held != null, `${label}: CredentialEngine no longer holds the fixture`);
    Assert(!IsValueEncrypted(held!.Values), `${label}: CredentialEngine holds the fixture's Values as ciphertext`);
    AssertEqual(held!.Values, f.Secret, `${label}: CredentialEngine holds the fixture's plaintext Values`);
    const resolved = await CredentialEngine.Instance.GetCredential<{ apiKey: string }>('API Key', { credentialId: f.RecordID, contextUser: ctx.User });
    AssertEqual(resolved.values.apiKey, f.ApiKey, `${label}: GetCredential resolves the key`);
}

async function checkCt5PeerSetEventLeavesEnginePlaintext(ctx: IntegrationCheckContext): Promise<void> {
    try {
        const slot = await loadEngineSlot(ctx, 'CT5');
        const advanced = advancedFixtureRow(slot);
        const rows = slot.Rows.map(r => (UUIDsEqual(String(r.ID), fx().RecordID) ? advanced : r));
        const data = JSON.stringify({ results: rows, totalRowCount: rows.length, maxUpdatedAt: advanced.__mj_UpdatedAt, schemaHash: slot.SchemaHash });
        await dispatchToEngine(peerEvent(slot.Key, 'set', data), 'CT5');
        await assertEngineHoldsPlaintext(ctx, 'CT5');
    } finally {
        await CredentialEngine.Instance.RefreshItem(ENGINE_PROPERTY);
    }
}

async function checkCt6PeerRowDeltaLeavesEnginePlaintext(ctx: IntegrationCheckContext): Promise<void> {
    try {
        const slot = await loadEngineSlot(ctx, 'CT6');
        const advanced = advancedFixtureRow(slot);
        const delta: CacheRowDeltaPayload = {
            upsertedRows: [advanced] as CacheRowDeltaPayload['upsertedRows'],
            deletedPrimaryKeys: [],
            primaryKeyFields: ['ID'],
            maxUpdatedAt: String(advanced.__mj_UpdatedAt),
            rowCount: slot.Rows.length,
            totalRowCount: slot.Rows.length,
            schemaHash: slot.SchemaHash,
        };
        await dispatchToEngine(peerEvent(slot.Key, 'row_delta', JSON.stringify(delta)), 'CT6');
        await assertEngineHoldsPlaintext(ctx, 'CT6');
    } finally {
        await CredentialEngine.Instance.RefreshItem(ENGINE_PROPERTY);
    }
}

export const CiphertextCacheChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.CT0`, Name: 'CT0: the table column holds ciphertext, not the secret', Fn: checkCt0TableHoldsCiphertext, RequiresMutation: true },
    { Id: `${BUNDLE}.CT1`, Name: 'CT1: a RunView miss returns plaintext to the caller and writes the cache', Fn: checkCt1MissReturnsPlaintextAndWritesCache, RequiresMutation: true },
    { Id: `${BUNDLE}.CT2`, Name: 'CT2: the cached entry holds ciphertext only', Fn: checkCt2CacheEntryHoldsCiphertextOnly, RequiresMutation: true },
    { Id: `${BUNDLE}.CT3`, Name: 'CT3: a cache hit still returns plaintext without rewriting the cache', Fn: checkCt3HitReturnsPlaintext, RequiresMutation: true },
    { Id: `${BUNDLE}.CT4`, Name: 'CT4: an entity_object result also decrypts', Fn: checkCt4EntityObjectResultDecrypts, RequiresMutation: true },
    { Id: `${BUNDLE}.CT5`, Name: 'CT5: a peer\'s set event carrying stored ciphertext leaves CredentialEngine holding plaintext', Fn: checkCt5PeerSetEventLeavesEnginePlaintext, RequiresMutation: true },
    { Id: `${BUNDLE}.CT6`, Name: 'CT6: a peer\'s row_delta event carrying stored ciphertext leaves CredentialEngine holding plaintext', Fn: checkCt6PeerRowDeltaLeavesEnginePlaintext, RequiresMutation: true }
];

for (const check of CiphertextCacheChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
