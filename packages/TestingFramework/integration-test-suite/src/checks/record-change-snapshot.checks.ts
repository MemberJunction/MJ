/**
 * Record Change snapshots record the stored row (IT169, server transport, mutating).
 *
 * A tracked save writes its Record Change `FullRecordJSON` from the row the save returned, in the
 * same statement as the save. The bundle runs on the server transport because that is where a
 * stale object saves directly — agents, scheduled jobs and engines hold entity objects across
 * other servers' writes — and, with delta updates, the table keeps the other writer's change while
 * a snapshot built from the object in memory did not.
 *
 *   - RCS1 A create's snapshot holds the values the database set: the stored ID, both timestamps,
 *          and the joined `Parent` display name.
 *   - RCS2 A stale writer's update snapshot carries the change another writer committed after it
 *          loaded the record, and the stored `__mj_UpdatedAt`; ChangesJSON still lists only its own
 *          change.
 *   - RCS3 Text with an apostrophe is recorded as written (PostgreSQL once stored it doubled).
 *   - RCS4 An encrypted column is recorded as its stored ciphertext, never the plaintext the saving
 *          object holds.
 *
 * Fixtures are throwaway `MJ: Action Categories` rows and one `MJ: Credentials` row, name-prefixed
 * per run, deleted in Teardown.
 */
import { RunView } from '@memberjunction/core';
import { IsValueEncrypted, UUIDsEqual } from '@memberjunction/global';
import { MJActionCategoryEntity, MJCredentialEntity } from '@memberjunction/core-entities';
import { Assert, AssertEqual, IntegrationCheckRegistry, SkipCheck } from '@memberjunction/testing-integration';
import type { IntegrationCheckContext, NamedCheck } from '@memberjunction/testing-integration';
import { EncryptionUnavailableReason, MUTATION_TIER_OFF_REASON, MutationTierOn } from './fixture-gates';

const BUNDLE = 'record-change-snapshot';
const CATEGORY_ENTITY = 'MJ: Action Categories';
const CREDENTIAL_ENTITY = 'MJ: Credentials';
const RECORD_CHANGE_ENTITY = 'MJ: Record Changes';
const FIXTURE_TAG = '(mj-integration-test — safe to delete)';

interface RecordChangeSnapshotFixture {
    Prefix: string;
    /** Lower bound for the Record Change reads, back-dated a second against clock skew. */
    StartedAtIso: string;
    CategoryIds: string[];
    CredentialIds: string[];
}

/** One row of `MJ: Record Changes` (simple result). */
interface RecordChangeRow {
    ID: string;
    RecordID: string;
    Type: string;
    ChangesJSON: string | null;
    FullRecordJSON: string | null;
}

let fixture: RecordChangeSnapshotFixture | undefined;
/** Set by Setup when the bundle deliberately writes nothing; every check then skips with it. */
let skipReason: string | undefined;

function fx(): RecordChangeSnapshotFixture {
    if (skipReason) {
        SkipCheck(skipReason);
    }
    Assert(fixture != null, `${BUNDLE} fixture missing (bundle Setup did not run)`);
    return fixture!;
}

/** Creates a throwaway Action Category, registered for teardown before its save is asserted. */
async function createCategory(ctx: IntegrationCheckContext, suffix: string, parentID?: string): Promise<MJActionCategoryEntity> {
    const f = fx();
    const category = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
    category.NewRecord();
    category.Name = `${f.Prefix}-${suffix} ${FIXTURE_TAG}`;
    category.Status = 'Active';
    if (parentID) {
        category.ParentID = parentID;
    }
    const saved = await category.Save();
    if (category.ID) {
        f.CategoryIds.push(category.ID);
    }
    Assert(saved, `creating fixture category '${suffix}' failed: ${category.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    return category;
}

async function loadCategory(ctx: IntegrationCheckContext, id: string): Promise<MJActionCategoryEntity> {
    const category = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User);
    Assert(await category.Load(id), `loading fixture category ${id} failed`);
    return category;
}

/** The Record Changes written for one record since the bundle started, oldest first. */
async function recordChanges(ctx: IntegrationCheckContext, entityName: string, recordID: string): Promise<RecordChangeRow[]> {
    const entityID = ctx.Provider.EntityByName(entityName)?.ID;
    Assert(!!entityID, `could not resolve the entity ID for '${entityName}'`);
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<RecordChangeRow>({
        EntityName: RECORD_CHANGE_ENTITY,
        ExtraFilter: `EntityID='${entityID}' AND ChangedAt >= '${fx().StartedAtIso}'`,
        OrderBy: 'ChangedAt ASC',
        ResultType: 'simple',
        BypassCache: true,
    }, ctx.User);
    Assert(result.Success, `reading ${RECORD_CHANGE_ENTITY} failed: ${result.ErrorMessage}`);
    // RecordID holds the key's text form ("ID|<uuid>").
    return (result.Results ?? []).filter((row) => UUIDsEqual(row.RecordID.split('|').pop()?.trim() ?? '', recordID));
}

function snapshotOf(row: RecordChangeRow | undefined, label: string): Record<string, unknown> {
    Assert(row != null, `${label}: no Record Change row`);
    Assert(!!row!.FullRecordJSON, `${label}: FullRecordJSON is empty`);
    const parsed: unknown = JSON.parse(row!.FullRecordJSON!);
    Assert(parsed != null && typeof parsed === 'object', `${label}: FullRecordJSON did not parse to an object`);
    return parsed as Record<string, unknown>;
}

async function firstCredentialTypeId(ctx: IntegrationCheckContext): Promise<string> {
    const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<{ ID: string }>({
        EntityName: 'MJ: Credential Types', Fields: ['ID'], MaxRows: 1, ResultType: 'simple',
    }, ctx.User);
    Assert(result.Success && result.Results.length > 0, 'no MJ: Credential Types row is seeded');
    return result.Results[0].ID;
}

async function checkRcs1CreateHoldsStoredValues(ctx: IntegrationCheckContext): Promise<void> {
    const parent = await createCategory(ctx, 'rcs1-parent');
    const child = await createCategory(ctx, 'rcs1-child', parent.ID);

    const [create] = (await recordChanges(ctx, CATEGORY_ENTITY, child.ID)).filter((c) => c.Type === 'Create');
    const full = snapshotOf(create, 'RCS1 create');
    Assert(UUIDsEqual(String(full.ID), child.ID), `RCS1: snapshot ID ${String(full.ID)} is not the stored ID ${child.ID}`);
    AssertEqual(full.__mj_CreatedAt, child.__mj_CreatedAt.toISOString(), 'RCS1: snapshot __mj_CreatedAt is the stored value');
    AssertEqual(full.__mj_UpdatedAt, child.__mj_UpdatedAt.toISOString(), 'RCS1: snapshot __mj_UpdatedAt is the stored value');
    AssertEqual(full.Parent, parent.Name, 'RCS1: snapshot carries the joined Parent display name');
    console.log('      → create snapshot holds the stored ID, timestamps and joined Parent name');
}

async function checkRcs2StaleWriterCarriesOtherChange(ctx: IntegrationCheckContext): Promise<void> {
    const created = await createCategory(ctx, 'rcs2');
    const writerA = await loadCategory(ctx, created.ID);
    const writerB = await loadCategory(ctx, created.ID); // loaded before A saves: B is stale

    writerA.Description = 'RCS2 written by A';
    Assert(await writerA.Save(), `RCS2 writer A save failed: ${writerA.LatestResult?.CompleteMessage ?? 'unknown error'}`);
    writerB.Status = 'Pending';
    Assert(await writerB.Save(), `RCS2 writer B save failed: ${writerB.LatestResult?.CompleteMessage ?? 'unknown error'}`);

    const updates = (await recordChanges(ctx, CATEGORY_ENTITY, created.ID)).filter((c) => c.Type === 'Update');
    const bUpdate = updates.find((u) => u.ChangesJSON != null && 'Status' in (JSON.parse(u.ChangesJSON) as object));
    Assert(bUpdate != null, 'RCS2: no Update row recorded writer B\'s Status change');
    AssertEqual(Object.keys(JSON.parse(bUpdate!.ChangesJSON!) as object).join(','), 'Status', 'RCS2: ChangesJSON lists only writer B\'s change');
    const full = snapshotOf(bUpdate, 'RCS2 writer B update');
    AssertEqual(full.Description, 'RCS2 written by A', 'RCS2: writer B\'s snapshot carries writer A\'s committed Description');
    AssertEqual(full.Status, 'Pending', 'RCS2: writer B\'s snapshot carries its own Status');
    AssertEqual(full.__mj_UpdatedAt, writerB.__mj_UpdatedAt.toISOString(), 'RCS2: snapshot __mj_UpdatedAt is the value the save stored');
    console.log('      → the stale writer\'s snapshot holds the other writer\'s change and the stored __mj_UpdatedAt');
}

async function checkRcs3ApostropheRecordedAsWritten(ctx: IntegrationCheckContext): Promise<void> {
    const created = await createCategory(ctx, 'rcs3');
    const text = "RCS3 it's O'Brien's";
    const category = await loadCategory(ctx, created.ID);
    category.Description = text;
    Assert(await category.Save(), `RCS3 save failed: ${category.LatestResult?.CompleteMessage ?? 'unknown error'}`);

    const [update] = (await recordChanges(ctx, CATEGORY_ENTITY, created.ID)).filter((c) => c.Type === 'Update');
    AssertEqual(snapshotOf(update, 'RCS3 update').Description, text, 'RCS3: snapshot Description is stored as written');
    console.log('      → apostrophes are recorded as written');
}

async function checkRcs4EncryptedRecordedAsCiphertext(ctx: IntegrationCheckContext): Promise<void> {
    const f = fx();
    const apiKey = `${f.Prefix}-rcs4-secret`;
    const credential = await ctx.Provider.GetEntityObject<MJCredentialEntity>(CREDENTIAL_ENTITY, ctx.User);
    credential.NewRecord();
    credential.CredentialTypeID = await firstCredentialTypeId(ctx);
    credential.Name = `${f.Prefix}-rcs4 ${FIXTURE_TAG}`;
    credential.Values = JSON.stringify({ apiKey });
    if (!(await credential.Save())) {
        const message = credential.LatestResult?.CompleteMessage ?? '';
        const unavailable = EncryptionUnavailableReason(message);
        if (unavailable) {
            SkipCheck(unavailable);
        }
        Assert(false, `RCS4 credential create failed: ${message}`);
    }
    f.CredentialIds.push(credential.ID);
    credential.Description = 'RCS4 touched';
    Assert(await credential.Save(), `RCS4 credential update failed: ${credential.LatestResult?.CompleteMessage ?? 'unknown error'}`);

    const changes = await recordChanges(ctx, CREDENTIAL_ENTITY, credential.ID);
    AssertEqual(changes.map((c) => c.Type).join(','), 'Create,Update', 'RCS4: Record Changes for the credential');
    for (const change of changes) {
        Assert(!(change.FullRecordJSON ?? '').includes(apiKey), `RCS4: the ${change.Type} snapshot contains the plaintext secret`);
        Assert(IsValueEncrypted(String(snapshotOf(change, `RCS4 ${change.Type}`).Values)), `RCS4: the ${change.Type} snapshot's Values is not ciphertext`);
    }
    console.log('      → the encrypted column is recorded as ciphertext on create and update');
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        // Every check writes; a deterministic-only run writes nothing.
        if (!MutationTierOn(ctx)) {
            skipReason = MUTATION_TIER_OFF_REASON;
            return;
        }
        fixture = {
            Prefix: `mj-rcs-${Date.now()}`,
            StartedAtIso: new Date(Date.now() - 1000).toISOString(),
            CategoryIds: [],
            CredentialIds: [],
        };
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        fixture = undefined;
        skipReason = undefined;
        if (!f) {
            return;
        }
        for (const id of f.CredentialIds) {
            const credential = await ctx.Provider.GetEntityObject<MJCredentialEntity>(CREDENTIAL_ENTITY, ctx.User).catch(() => undefined);
            if (credential && (await credential.Load(id).catch(() => false))) {
                await credential.Delete().catch(() => undefined);
            }
        }
        // Reverse creation order deletes children before their parents.
        for (const id of [...f.CategoryIds].reverse()) {
            const category = await ctx.Provider.GetEntityObject<MJActionCategoryEntity>(CATEGORY_ENTITY, ctx.User).catch(() => undefined);
            if (category && (await category.Load(id).catch(() => false))) {
                await category.Delete().catch(() => undefined);
            }
        }
    },
});

export const RecordChangeSnapshotChecks: NamedCheck[] = [
    { Id: `${BUNDLE}.RCS1`, Name: 'RCS1: a create\'s snapshot holds the stored ID, timestamps and joined display values', Fn: checkRcs1CreateHoldsStoredValues, RequiresMutation: true },
    { Id: `${BUNDLE}.RCS2`, Name: 'RCS2: a stale writer\'s snapshot carries another writer\'s committed change', Fn: checkRcs2StaleWriterCarriesOtherChange, RequiresMutation: true },
    { Id: `${BUNDLE}.RCS3`, Name: 'RCS3: an apostrophe is recorded as written', Fn: checkRcs3ApostropheRecordedAsWritten, RequiresMutation: true },
    { Id: `${BUNDLE}.RCS4`, Name: 'RCS4: an encrypted column is recorded as its stored ciphertext', Fn: checkRcs4EncryptedRecordedAsCiphertext, RequiresMutation: true },
];

for (const check of RecordChangeSnapshotChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
