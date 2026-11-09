/**
 * An IS-A chain save that fails must leave every object in the chain as it was before the save.
 *
 * A Table-Per-Type save writes the parent chain first (root → branch → the leaf's parent), each one
 * finalized in memory as it returns: saved, clean, its old values replaced by what the database sent
 * back. Only then does the leaf write its own row. When that write fails — a foreign key the
 * database refuses, a validate-type action, a throw, a failed commit — the leaf rolls the whole
 * chain back. The database is right, but the in-memory parents are not: before this fix each parent
 * still said `IsSaved === true` about a row that no longer exists, and its edits read as clean.
 *
 * Two consequences, both silent:
 *  - A new chain retried after the failure UPDATEs a parent row that was never committed, and fails
 *    again for a reason that has nothing to do with the first one.
 *  - An existing chain retried after the failure skips the parent entirely, because the parent's
 *    edits look already saved. The retry returns true and the parent's change is lost.
 *
 * The same holds on the client, where the parent saves are recorded in memory and the leaf's single
 * mutation carries the whole chain: a failed mutation wrote nothing, so no parent may claim a save.
 *
 * A chain DELETE has the same shape the other way up: the leaf deletes its own row, then each parent
 * deletes its row, and only then does the chain commit. Each parent used to reset itself with
 * `NewRecord()` as its own delete returned, so a commit that failed left every parent unsaved, under a
 * new key and unlinked from its child, while its row still existed, and the retry failed. A chain
 * delete that holds a transaction now resets its records only once it commits.
 *
 * The mock's subtypes declare no key of their own, so a publication reads the product's key through
 * its link; a real subtype carries a copy, which `NewRecord()` sets from the parent's.
 *
 * IS-A wiring note: `_parentEntity` is wired by hand (as in `baseEntity.transactionSettle.test.ts`)
 * because what's under test is the chain's save and rollback, not metadata-driven discovery.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity, BaseEntityResult } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { EntityDeleteOptions, EntitySaveOptions, IEntityDataProvider } from '../generic/interfaces';
import type { RelatedRecordCollection } from '../generic/relatedRecordCollection';
import type { UserInfo } from '../generic/securityInfo';
import {
    ALL_ENTITY_DATA,
    PRODUCT_ENTITY_ID,
    MEETING_ENTITY_ID,
    WEBINAR_ENTITY_ID,
    PUBLICATION_ENTITY_ID,
    STANDALONE_ENTITY_ID,
} from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] } as unknown as UserInfo;

let productInfo: EntityInfo;
let meetingInfo: EntityInfo;
let webinarInfo: EntityInfo;
let publicationInfo: EntityInfo;
let standaloneInfo: EntityInfo;

/** What the database does with one entity's write. */
type Failure = 'returns-null' | 'throws';

/** One provider Save call, as the provider saw it. */
interface SaveCall {
    Entity: string;
    WasSaved: boolean;
    /** What the record would write: `GetAll()`, which leaves out not-loaded fields. */
    Values: Record<string, unknown>;
    IsParentEntitySave: boolean;
}

/** One provider Delete call, as the provider saw it. */
interface DeleteCall {
    Entity: string;
    Key: unknown;
    IsParentEntityDelete: boolean;
}

let txnLog: string[] = [];
let saveCalls: SaveCall[] = [];
let deleteCalls: DeleteCall[] = [];
/** Entities whose delete the database refuses. */
let deleteFailures: Set<string> = new Set();
/** Run as the outermost transaction starts to commit, to see what the records say at that moment. */
let duringCommit: (() => void) | null = null;
let failures: Map<string, Failure> = new Map();
/** Values the database changed on the way back, such as a trigger or a view column. */
let rewrites: Map<string, Record<string, unknown>> = new Map();
/** Fields a successful write leaves out of what it returns. */
let omissions: Map<string, string[]> = new Map();
/** Run when the named entity's write starts: someone editing while the save is in flight. */
let duringWrite: Map<string, () => void> = new Map();
/** Whether the outermost commit fails. A savepoint's release still succeeds. */
let commitFails = false;
let depth = 0;

class ChainEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
    public WireParent(parent: BaseEntity): void {
        (this as unknown as { _parentEntity: BaseEntity | null })._parentEntity = parent;
        (this as unknown as { _parentEntityFieldNames: Set<string> | null })._parentEntityFieldNames =
            this.EntityInfo.ParentEntityFieldNames;
    }
    public MarkSaved(): void {
        (this as unknown as { _everSaved: boolean })._everSaved = true;
    }
}

/** Opens a depth-counted scope, the way `DatabaseProviderBase` does. */
async function beginEntityTransaction() {
    depth++;
    txnLog.push('begin');
    let settled = false;
    return {
        IsNested: depth > 1,
        async Commit() {
            if (settled) return;
            settled = true;
            const outermost = depth === 1;
            if (outermost) {
                duringCommit?.();
            }
            depth--;
            if (commitFails && outermost) {
                txnLog.push('commit failed');
                throw new Error('the transaction could not be committed');
            }
            txnLog.push('commit');
        },
        async Rollback() {
            if (settled) return;
            settled = true;
            depth--;
            txnLog.push('rollback');
        },
    };
}

/**
 * A provider that records each save, fails the entities named in `failures`, and — when
 * `transactional` — opens depth-counted scopes the way `DatabaseProviderBase` does. Without it,
 * parent saves are answered in memory, as `GraphQLDataProvider` answers them. `opensScopes: false`
 * with `transactional` is a provider that says it has transactions but opens no scope, so each
 * parent's write stands.
 */
function makeProvider(transactional: boolean, opensScopes: boolean = transactional) {
    depth = 0;
    const provider = {
        CurrentUser: MOCK_USER,
        get SupportsEntityTransactions() {
            return transactional;
        },
        BeginEntityTransaction: opensScopes ? beginEntityTransaction : undefined,
        async Save(entity: BaseEntity, _user: UserInfo, options: EntitySaveOptions): Promise<Record<string, unknown> | null> {
            const name = entity.EntityInfo.Name;
            saveCalls.push({
                Entity: name,
                WasSaved: entity.IsSaved,
                Values: entity.GetAll(),
                IsParentEntitySave: !!options?.IsParentEntitySave,
            });
            duringWrite.get(name)?.();
            const failure = failures.get(name);
            if (failure === 'throws') {
                throw new Error(`The INSERT statement conflicted with a FOREIGN KEY constraint on ${name}`);
            }
            if (failure === 'returns-null') {
                return null;
            }
            const returned: Record<string, unknown> = { ...entity.GetAll(), ...rewrites.get(name) };
            for (const omitted of omissions.get(name) ?? []) {
                delete returned[omitted];
            }
            return returned;
        },
        async GetEntityObject<T extends BaseEntity>(): Promise<T> {
            return new ChainEntity(standaloneInfo, provider as unknown as IEntityDataProvider) as unknown as T;
        },
        async Delete(entity: BaseEntity, options: EntityDeleteOptions): Promise<boolean> {
            const name = entity.EntityInfo.Name;
            deleteCalls.push({ Entity: name, Key: entity.Get('ID'), IsParentEntityDelete: !!options?.IsParentEntityDelete });
            // Like DatabaseProviderBase: the provider puts its own result on the record before the
            // statement runs, gives a failure its reason, and returns whether the row went. It leaves
            // the result's Success false even when the row went, and a record that was never saved
            // has no row to delete.
            const result = new BaseEntityResult(false, '', 'delete');
            entity.RegisterResultHistoryEntry(result);
            if (!entity.IsSaved) {
                result.Message = `There is no ${name} row to delete: the record was never saved`;
                return false;
            }
            if (deleteFailures.has(name)) {
                result.Message = `The DELETE statement conflicted with a REFERENCE constraint on ${name}`;
                return false;
            }
            return true;
        },
        SetCachedRecordName(): void {
            /* no-op */
        },
        GetCachedRecordName(): string | undefined {
            return undefined;
        },
    };
    return provider;
}

/** A new Meeting IS-A Product, with a name on the product and a capacity on the meeting. */
function newMeetingChain(transactional = true) {
    const provider = makeProvider(transactional) as unknown as IEntityDataProvider;
    const product = new ChainEntity(productInfo, provider);
    const meeting = new ChainEntity(meetingInfo, provider);
    meeting.WireParent(product);
    meeting.NewRecord();
    meeting.Set('Name', 'Annual Conference');
    meeting.Set('MaxAttendees', 100);
    return { product, meeting };
}

/** A Meeting IS-A Product that already exists, loaded and then edited on both levels. */
function editedMeetingChain() {
    const provider = makeProvider(true) as unknown as IEntityDataProvider;
    const product = new ChainEntity(productInfo, provider);
    const meeting = new ChainEntity(meetingInfo, provider);
    meeting.WireParent(product);
    meeting.NewRecord();
    // The first set of a field sets its baseline too, so these read as loaded values.
    meeting.Set('Name', 'Annual Conference');
    meeting.Set('MaxAttendees', 100);
    product.MarkSaved();
    meeting.MarkSaved();
    meeting.Set('Name', 'Annual Conference 2027');
    meeting.Set('MaxAttendees', 250);
    return { product, meeting };
}

/** A product that owns a collection of related records, which its delete deletes too. */
class ProductWithItems extends ChainEntity {
    public readonly Items = this.DeclareRelatedRecords<BaseEntity>({
        Name: 'Items',
        RelatedEntity: 'Standalone Items',
        RelatedEntityJoinField: 'Name',
        OnRemove: 'delete',
    });
}

/**
 * A Publication IS-A Product that already exists, loaded and not edited. A publication is not itself a
 * parent type, so its delete runs no query for subtype rows.
 */
function savedPublicationChain(
    transactional = true,
    makeProduct: (provider: IEntityDataProvider) => ChainEntity = provider => new ChainEntity(productInfo, provider),
) {
    const provider = makeProvider(transactional) as unknown as IEntityDataProvider;
    const product = makeProduct(provider);
    const publication = new ChainEntity(publicationInfo, provider);
    publication.WireParent(product);
    publication.NewRecord();
    // The first set of a field sets its baseline too, so these read as loaded values.
    publication.Set('Name', 'Field Guide');
    publication.Set('ISBN', '978-0-00-000000-2');
    product.MarkSaved();
    publication.MarkSaved();
    return { product, publication, key: publication.Get('ID') };
}

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    meetingInfo = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
    webinarInfo = entities.find(e => e.ID === WEBINAR_ENTITY_ID)!;
    publicationInfo = entities.find(e => e.ID === PUBLICATION_ENTITY_ID)!;
    standaloneInfo = entities.find(e => e.ID === STANDALONE_ENTITY_ID)!;
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: MOCK_USER,
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    txnLog = [];
    saveCalls = [];
    failures = new Map();
    rewrites = new Map();
    omissions = new Map();
    duringWrite = new Map();
    deleteCalls = [];
    deleteFailures = new Set();
    duringCommit = null;
    commitFails = false;
});

describe('a new IS-A chain whose leaf write fails', () => {
    it.each<Failure>(['returns-null', 'throws'])('leaves the parent unsaved when the leaf %s', async failure => {
        const { product, meeting } = newMeetingChain();
        failures.set(meetingInfo.Name, failure);

        const ok = await meeting.Save();

        expect(ok).toBe(false);
        expect(txnLog).toEqual(['begin', 'rollback']);
        expect(product.IsSaved, 'the product row was rolled back').toBe(false);
        expect(meeting.IsSaved).toBe(false);
        expect(product.Get('Name')).toBe('Annual Conference');
        expect(meeting.Get('MaxAttendees')).toBe(100);
    });

    it('creates the parent again on the retry, under the same key', async () => {
        const { product, meeting } = newMeetingChain();
        const key = meeting.Get('ID');
        failures.set(meetingInfo.Name, 'throws');
        expect(await meeting.Save()).toBe(false);

        failures.clear();
        saveCalls = [];
        const ok = await meeting.Save();

        expect(ok).toBe(true);
        const productSave = saveCalls.find(c => c.Entity === productInfo.Name);
        expect(productSave, 'the retry writes the product').toBeDefined();
        expect(productSave!.WasSaved, 'as a create, since its first write never committed').toBe(false);
        expect(product.Get('ID')).toBe(key);
        expect(meeting.Get('ID')).toBe(key);
        expect(product.IsSaved).toBe(true);
        expect(meeting.IsSaved).toBe(true);
    });

    it('keeps the failure on the leaf', async () => {
        const { meeting } = newMeetingChain();
        failures.set(meetingInfo.Name, 'throws');

        await meeting.Save();

        expect(meeting.LatestResult?.Success).toBe(false);
        expect(meeting.LatestResult?.Message).toContain('FOREIGN KEY');
    });
});

describe('an existing IS-A chain whose leaf write fails', () => {
    it("keeps the parent's edit pending, so the retry writes it", async () => {
        const { product, meeting } = editedMeetingChain();
        failures.set(meetingInfo.Name, 'returns-null');

        expect(await meeting.Save()).toBe(false);

        expect(product.IsSaved, 'the product row existed before, and still does').toBe(true);
        const name = product.GetFieldByName('Name')!;
        expect(name.Dirty, "the product's rolled-back edit is still an edit").toBe(true);
        expect(name.OldValue).toBe('Annual Conference');
        expect(meeting.GetFieldByName('MaxAttendees')!.Dirty).toBe(true);

        failures.clear();
        saveCalls = [];
        expect(await meeting.Save()).toBe(true);

        const productSave = saveCalls.find(c => c.Entity === productInfo.Name);
        expect(productSave, 'the retry writes the product again').toBeDefined();
        expect(productSave!.WasSaved).toBe(true);
        expect(productSave!.Values.Name).toBe('Annual Conference 2027');
        expect(product.GetFieldByName('Name')!.Dirty).toBe(false);
    });
});

describe('a chain where only the parent was edited', () => {
    it("keeps the parent's edit pending when the leaf's write is refused, so the retry writes it", async () => {
        // The leaf has nothing of its own to save. It saves because its parent is dirty, and a
        // validate-type action refusing the leaf's write returns a falsy result rather than throwing.
        const { product, meeting } = editedMeetingChain();
        meeting.Set('MaxAttendees', 100);
        failures.set(meetingInfo.Name, 'returns-null');

        expect(await meeting.Save()).toBe(false);

        expect(product.GetFieldByName('Name')!.Dirty).toBe(true);
        expect(meeting.Dirty, 'the chain still has something to save').toBe(true);

        failures.clear();
        saveCalls = [];
        expect(await meeting.Save()).toBe(true);
        expect(saveCalls.find(c => c.Entity === productInfo.Name)!.Values.Name).toBe('Annual Conference 2027');
    });
});

describe('what the rolled-back writes changed in memory', () => {
    it('puts back a value the database changed on the way back', async () => {
        // A trigger, a column default or a view join can change what the write returns. The
        // database rolled all of it back, so the product holds what it held before the save.
        const { product, meeting } = newMeetingChain();
        rewrites.set(productInfo.Name, { Name: 'ANNUAL CONFERENCE', CategoryName: 'Events' });
        failures.set(meetingInfo.Name, 'throws');

        expect(await meeting.Save()).toBe(false);

        expect(product.Get('Name')).toBe('Annual Conference');
        expect(product.Get('CategoryName'), 'a view column of a row that no longer exists').toBeNull();
    });

    it("puts back a field the write's response left out, so the retry writes it", async () => {
        // A response that omits a field marks it not loaded. Left that way, the retry's GetAll()
        // would leave the price out, and an update would keep whatever the row held instead.
        const { product, meeting } = newMeetingChain();
        meeting.Set('Price', 49);
        omissions.set(productInfo.Name, ['Price']);
        failures.set(meetingInfo.Name, 'throws');

        expect(await meeting.Save()).toBe(false);

        const price = product.GetFieldByName('Price')!;
        expect(price.NotLoaded).toBe(false);
        expect(price.Value).toBe(49);

        failures.clear();
        omissions.clear();
        saveCalls = [];
        expect(await meeting.Save()).toBe(true);
        expect(saveCalls.find(c => c.Entity === productInfo.Name)!.Values.Price).toBe(49);
    });

    it('keeps an edit made while the save was in flight, as an edit', async () => {
        const { product, meeting } = editedMeetingChain();
        // The product has saved; someone edits it while the meeting's write is out.
        duringWrite.set(meetingInfo.Name, () => product.Set('Name', 'Annual Conference 2028'));
        failures.set(meetingInfo.Name, 'returns-null');

        expect(await meeting.Save()).toBe(false);

        const name = product.GetFieldByName('Name')!;
        expect(name.Value).toBe('Annual Conference 2028');
        expect(name.OldValue, 'compared with what the database holds after the rollback').toBe('Annual Conference');
        expect(name.Dirty).toBe(true);
    });

    it('leaves a level that never saved as it is', async () => {
        const { meeting } = newMeetingChain();
        const maxAttendees = meeting.GetFieldByName('MaxAttendees')!;
        failures.set(meetingInfo.Name, 'throws');

        expect(await meeting.Save()).toBe(false);

        expect(meeting.GetFieldByName('MaxAttendees'), 'the same field object: nothing replaced it').toBe(maxAttendees);
        expect(maxAttendees.Value).toBe(100);
    });
});

describe('a chain whose commit fails', () => {
    it('leaves the leaf and its parent as they were before the save', async () => {
        const { product, meeting } = newMeetingChain();
        commitFails = true;

        const ok = await meeting.Save();

        expect(ok).toBe(false);
        expect(txnLog).toEqual(['begin', 'commit failed']);
        expect(product.IsSaved).toBe(false);
        expect(meeting.IsSaved, 'the leaf was finalized before the commit failed').toBe(false);
        expect(meeting.GetFieldByName('MaxAttendees')!.OldValue).toBe(100);
    });
});

describe('a chain whose commit fails after an earlier failed attempt', () => {
    it('records the commit failure on the leaf', async () => {
        // finalizeSave() empties the leaf's result history, and a save records its failure only when
        // the history is as long as it was when the save started. Without the leaf's history put
        // back, the second attempt's failure went unrecorded.
        const { meeting } = newMeetingChain();
        failures.set(meetingInfo.Name, 'throws');
        expect(await meeting.Save()).toBe(false);
        expect(meeting.ResultHistory).toHaveLength(1);

        failures.clear();
        commitFails = true;
        expect(await meeting.Save()).toBe(false);

        expect(meeting.ResultHistory).toHaveLength(2);
        expect(meeting.LatestResult?.Success).toBe(false);
        expect(meeting.LatestResult?.Message).toContain('could not be committed');
        expect(meeting.LatestResult?.Type).toBe('create');
    });
});

describe('a three-level chain whose middle write fails', () => {
    it('leaves the root unsaved', async () => {
        const provider = makeProvider(true) as unknown as IEntityDataProvider;
        const product = new ChainEntity(productInfo, provider);
        const meeting = new ChainEntity(meetingInfo, provider);
        const webinar = new ChainEntity(webinarInfo, provider);
        meeting.WireParent(product);
        webinar.WireParent(meeting);
        webinar.NewRecord();
        webinar.Set('Name', 'Launch Webinar');
        webinar.Set('MaxAttendees', 500);
        webinar.Set('PlatformURL', 'https://example.com/webinar');
        failures.set(meetingInfo.Name, 'throws');

        const ok = await webinar.Save();

        expect(ok).toBe(false);
        expect(saveCalls.map(c => c.Entity)).toEqual([productInfo.Name, meetingInfo.Name]);
        expect(txnLog).toEqual(['begin', 'rollback']);
        expect(product.IsSaved, 'the root was written, then rolled back').toBe(false);
        expect(meeting.IsSaved).toBe(false);
        expect(webinar.IsSaved).toBe(false);
    });
});

describe('a chain saved through a provider with no transactions of its own', () => {
    it('leaves the parent unsaved when the leaf write fails, since the leaf carried the whole chain', async () => {
        // GraphQLDataProvider records a parent save in memory (`IsParentEntitySave`) and sends one
        // mutation for the whole chain, which the server runs in one transaction. When that
        // mutation fails, nothing was written, so no parent may claim a save.
        const { product, meeting } = newMeetingChain(false);
        failures.set(meetingInfo.Name, 'returns-null');

        const ok = await meeting.Save();

        expect(ok).toBe(false);
        expect(txnLog).toEqual([]);
        expect(saveCalls.map(c => [c.Entity, c.IsParentEntitySave])).toEqual([
            [productInfo.Name, true],
            [meetingInfo.Name, false],
        ]);
        expect(product.IsSaved).toBe(false);
        expect(meeting.IsSaved).toBe(false);
    });
});

describe('a provider whose parent writes are not undone', () => {
    it('leaves a parent that really wrote as saved, so the retry updates it rather than inserting it twice', async () => {
        // A provider that reports entity transactions but opens no scope: nothing rolls the
        // product's write back, so it still exists and must still say so.
        const provider = makeProvider(true, false) as unknown as IEntityDataProvider;
        const product = new ChainEntity(productInfo, provider);
        const meeting = new ChainEntity(meetingInfo, provider);
        meeting.WireParent(product);
        meeting.NewRecord();
        meeting.Set('Name', 'Annual Conference');
        meeting.Set('MaxAttendees', 100);
        failures.set(meetingInfo.Name, 'throws');

        expect(await meeting.Save()).toBe(false);

        expect(txnLog).toEqual([]);
        expect(product.IsSaved).toBe(true);
    });
});

describe('a graph whose root is an IS-A child', () => {
    /** A meeting with a collection of related records, saved as one graph. */
    class MeetingWithItems extends ChainEntity {
        public readonly Items = this.DeclareRelatedRecords<BaseEntity>({
            Name: 'Items',
            RelatedEntity: 'Standalone Items',
            RelatedEntityJoinField: 'Name',
        });
    }

    it("puts the root's parent back when a related record's write fails", async () => {
        // The graph's root node saves as an IS-A chain: product, then meeting. A related record's
        // write fails after that, and the graph rolls everything back, the product included.
        const provider = makeProvider(true) as unknown as IEntityDataProvider;
        const product = new ChainEntity(productInfo, provider);
        const meeting = new MeetingWithItems(meetingInfo, provider);
        meeting.WireParent(product);
        meeting.NewRecord();
        meeting.Set('Name', 'Annual Conference');
        meeting.Set('MaxAttendees', 100);
        await meeting.GetCompanion<RelatedRecordCollection>('Items')!.Create();
        failures.set(standaloneInfo.Name, 'throws');

        const ok = await meeting.Save();

        expect(ok).toBe(false);
        expect(saveCalls.map(c => c.Entity)).toEqual([productInfo.Name, meetingInfo.Name, standaloneInfo.Name]);
        expect(txnLog, "the graph's transaction, and the chain's savepoint inside it").toEqual(['begin', 'begin', 'commit', 'rollback']);
        expect(product.IsSaved, 'the product row was rolled back with the graph').toBe(false);
        expect(meeting.IsSaved).toBe(false);

        failures.clear();
        saveCalls = [];
        expect(await meeting.Save()).toBe(true);
        expect(saveCalls.find(c => c.Entity === productInfo.Name)!.WasSaved, 'the retry creates the product again').toBe(false);
    });
});

describe('a chain save that succeeds', () => {
    it('leaves every level saved and clean', async () => {
        const { product, meeting } = editedMeetingChain();

        const ok = await meeting.Save();

        expect(ok).toBe(true);
        expect(txnLog).toEqual(['begin', 'commit']);
        expect(product.IsSaved).toBe(true);
        expect(product.GetFieldByName('Name')!.Dirty).toBe(false);
        expect(meeting.GetFieldByName('MaxAttendees')!.Dirty).toBe(false);
    });
});

describe('an IS-A chain delete whose commit fails', () => {
    it('leaves both levels as they were, so the retry deletes both rows', async () => {
        const { product, publication, key } = savedPublicationChain();
        commitFails = true;

        expect(await publication.Delete()).toBe(false);

        expect(txnLog).toEqual(['begin', 'commit failed']);
        expect(deleteCalls.map(c => c.Entity)).toEqual([publicationInfo.Name, productInfo.Name]);
        expect(product.IsSaved, 'the product row was rolled back, so it still exists').toBe(true);
        expect(product.Get('ID'), 'under the key it had').toBe(key);
        expect(product.Get('Name')).toBe('Field Guide');
        expect(product.ISAChild, 'still linked to the publication').toBe(publication);
        expect(publication.IsSaved).toBe(true);
        expect(publication.Get('ID'), "the publication reads the shared key from the product").toBe(key);

        commitFails = false;
        deleteCalls = [];
        expect(await publication.Delete()).toBe(true);
        expect(deleteCalls.map(c => [c.Entity, c.Key])).toEqual([
            [publicationInfo.Name, key],
            [productInfo.Name, key],
        ]);
    });

    it('records the failed commit on the leaf', async () => {
        // The leaf's own delete succeeded first, and the provider recorded that on it. Without its
        // own entry after that one, the caller reads the provider's entry for a delete that was undone.
        const { publication } = savedPublicationChain();
        commitFails = true;

        expect(await publication.Delete()).toBe(false);

        expect(publication.LatestResult?.Success).toBe(false);
        expect(publication.LatestResult?.Type).toBe('delete');
        expect(publication.LatestResult?.Message).toContain('could not be committed');
    });
});

describe('an IS-A chain delete whose parent delete fails', () => {
    it("records the parent's failure on the leaf, and leaves both levels as they were", async () => {
        const { product, publication } = savedPublicationChain();
        deleteFailures.add(productInfo.Name);

        expect(await publication.Delete()).toBe(false);

        expect(txnLog).toEqual(['begin', 'rollback']);
        expect(publication.LatestResult?.Success).toBe(false);
        expect(publication.LatestResult?.Message).toContain(`Failed to delete parent entity '${productInfo.Name}'`);
        expect(publication.LatestResult?.Message).toContain('REFERENCE constraint');
        expect(product.IsSaved).toBe(true);
        expect(publication.IsSaved).toBe(true);
    });

    it("carries the root's failure up through every level", async () => {
        const provider = makeProvider(true) as unknown as IEntityDataProvider;
        const product = new ChainEntity(productInfo, provider);
        const meeting = new ChainEntity(meetingInfo, provider);
        const webinar = new ChainEntity(webinarInfo, provider);
        meeting.WireParent(product);
        webinar.WireParent(meeting);
        webinar.NewRecord();
        webinar.Set('Name', 'Launch Webinar');
        product.MarkSaved();
        meeting.MarkSaved();
        webinar.MarkSaved();
        deleteFailures.add(productInfo.Name);

        expect(await webinar.Delete()).toBe(false);

        expect(deleteCalls.map(c => c.Entity)).toEqual([webinarInfo.Name, meetingInfo.Name, productInfo.Name]);
        expect(webinar.LatestResult?.Message).toContain(`Failed to delete parent entity '${meetingInfo.Name}'`);
        expect(webinar.LatestResult?.Message, "the root's own reason, not a message that says nothing").toContain(
            'REFERENCE constraint',
        );
        expect(meeting.IsSaved).toBe(true);
        expect(product.IsSaved).toBe(true);
    });
});

describe('an IS-A chain delete that succeeds', () => {
    it('resets every level once the chain commits, still linked and sharing one key', async () => {
        const { product, publication, key } = savedPublicationChain();
        let productSavedAtCommit: boolean | undefined;
        duringCommit = () => {
            productSavedAtCommit = product.IsSaved;
        };

        expect(await publication.Delete()).toBe(true);

        expect(txnLog).toEqual(['begin', 'commit']);
        expect(productSavedAtCommit, 'the product is not reset before the chain commits').toBe(true);
        expect(product.IsSaved).toBe(false);
        expect(publication.IsSaved).toBe(false);
        expect(product.Get('ID'), 'a new record, with a new key').not.toBe(key);
        expect(publication.Get('ID'), 'the publication reads the new key through its link to the product').toBe(
            product.Get('ID'),
        );
        expect(product.ISAChild, 'and the product still links back to it').toBe(publication);
    });
});

describe('an IS-A chain delete through a provider with no transactions of its own', () => {
    it('resets every level, as before', async () => {
        // GraphQLDataProvider sends the leaf's delete, which the server runs for the whole chain in
        // one transaction, and answers each parent's delete in memory. Nothing here can roll back
        // what already happened, so each record resets as its delete returns.
        const { product, publication, key } = savedPublicationChain(false);

        expect(await publication.Delete()).toBe(true);

        expect(txnLog).toEqual([]);
        expect(deleteCalls.map(c => [c.Entity, c.IsParentEntityDelete])).toEqual([
            [publicationInfo.Name, false],
            [productInfo.Name, true],
        ]);
        expect(product.IsSaved).toBe(false);
        expect(publication.IsSaved).toBe(false);
        expect(product.Get('ID')).not.toBe(key);
        expect(publication.Get('ID')).toBe(product.Get('ID'));
        expect(product.ISAChild).toBe(publication);
    });
});

describe("an IS-A chain delete whose parent's companions delete records", () => {
    it("leaves the parent's related record as it was when the chain's commit fails", async () => {
        // The product owns a collection of related records, so its delete runs as a graph: the
        // records, then the product, in a savepoint of the chain's transaction. Releasing the
        // savepoint commits nothing, and the chain's commit then fails.
        const { product, publication } = savedPublicationChain(true, provider => new ProductWithItems(productInfo, provider));
        const item = await product.GetCompanion<RelatedRecordCollection>('Items')!.Create();
        (item as ChainEntity).MarkSaved();
        const itemKey = item.Get('ID');
        commitFails = true;

        expect(await publication.Delete()).toBe(false);

        expect(txnLog, "the chain's transaction, and the graph's savepoint inside it").toEqual([
            'begin',
            'begin',
            'commit',
            'commit failed',
        ]);
        expect(deleteCalls.map(c => c.Entity)).toEqual([publicationInfo.Name, standaloneInfo.Name, productInfo.Name]);
        expect(item.IsSaved, "the item's row was rolled back with the chain").toBe(true);
        expect(item.Get('ID')).toBe(itemKey);
        expect(product.IsSaved).toBe(true);

        commitFails = false;
        deleteCalls = [];
        expect(await publication.Delete()).toBe(true);
        expect(deleteCalls.map(c => c.Entity)).toEqual([publicationInfo.Name, standaloneInfo.Name, productInfo.Name]);
        expect(item.IsSaved, 'reset once the chain committed').toBe(false);
    });
});
