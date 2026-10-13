/**
 * Regression tests for entity-transaction-scope settlement in `_InnerSave` / `_InnerDelete`.
 *
 * The scope opened by an IS-A initiator (`beginEntityTransactionScope`) must be settled on EVERY
 * exit path. Three paths historically leaked it:
 *
 *   1. **Save of a fully-clean chain** — the not-dirty early return in `_InnerSave` returned `true`
 *      with the scope still open.
 *   2. **Provider `Delete()` returning false** — which is how the provider reports essentially every
 *      delete failure (RLS denial, FK violation, zero rows) — returned `false` with the scope open.
 *   3. **Provider `Save()` returning falsy data** (a validate-type entity action rejecting the save)
 *      — `_InnerSave` returned `false` but COMMITTED the scope, persisting the parent chain around
 *      a leaf that reported failure.
 *
 * A leaked scope is silent poison: the provider's ambient transaction stays open, every later write
 * joins it, later scopes become savepoints whose commits never really commit, and "successful"
 * saves are quietly non-durable. These tests pin that every exit settles the scope and leaves the
 * provider's depth at zero.
 *
 * IS-A wiring note: `_parentEntity` is wired manually (same technique as `baseEntity.isa.test.ts`)
 * because the branch under test only requires the chain to exist, not full metadata-driven
 * discovery.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import type { UserInfo } from '../generic/securityInfo';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID, WEBINAR_ENTITY_ID } from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] } as unknown as UserInfo;

let productEntityInfo: EntityInfo;
let webinarEntityInfo: EntityInfo;
let txnLog: string[] = [];
/**
 * When set, the provider's Save returns null (a logical, non-throwing failure — what a
 * validate-type entity action rejecting the save looks like) for the record whose Name matches.
 * Lets a test fail the LEAF's own save while its parent-chain saves succeed.
 */
let failSaveWhenNameIs: string | null = null;
/** What the provider's Delete should return; `false` is the ordinary failure signal. */
let deleteResult = true;
let currentDepth = 0;

class TestChainEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
    public WireParent(parent: BaseEntity): void {
        (this as unknown as { _parentEntity: BaseEntity | null })._parentEntity = parent;
    }
    public MarkSaved(): void {
        (this as unknown as { _everSaved: boolean })._everSaved = true;
    }
}

function makeProvider() {
    currentDepth = 0;
    const provider = {
        CurrentUser: MOCK_USER,
        get SupportsEntityTransactions() {
            return true;
        },
        get IsInTransaction() {
            return currentDepth > 0;
        },
        async BeginEntityTransaction() {
            currentDepth++;
            txnLog.push('begin');
            let settled = false;
            return {
                IsNested: currentDepth > 1,
                async Commit() {
                    if (settled) return;
                    settled = true;
                    currentDepth--;
                    txnLog.push('commit');
                },
                async Rollback() {
                    if (settled) return;
                    settled = true;
                    currentDepth--;
                    txnLog.push('rollback');
                },
            };
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown> | null> {
            if (failSaveWhenNameIs !== null && entity.Get('Name') === failSaveWhenNameIs) {
                return null;
            }
            return entity.GetAll();
        },
        async Delete(): Promise<boolean> {
            return deleteResult;
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

/** Builds a leaf entity with a manually wired parent, both bound to one provider. */
function makeChain(leafInfo: EntityInfo, parentInfo: EntityInfo) {
    const provider = makeProvider();
    const parent = new TestChainEntity(parentInfo, provider as unknown as IEntityDataProvider);
    const leaf = new TestChainEntity(leafInfo, provider as unknown as IEntityDataProvider);
    leaf.WireParent(parent);
    return { leaf, parent, provider };
}

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    webinarEntityInfo = entities.find(e => e.ID === WEBINAR_ENTITY_ID)!;
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
    failSaveWhenNameIs = null;
    deleteResult = true;
});

describe('save of a fully-clean IS-A chain', () => {
    it('settles the scope instead of leaking the ambient transaction open', async () => {
        // Both levels "loaded and clean": saved flags set, no field changes. The old code opened
        // the scope, hit the not-dirty early return, and returned true with the transaction open
        // forever.
        const { leaf, parent } = makeChain(productEntityInfo, productEntityInfo);
        leaf.MarkSaved();
        parent.MarkSaved();

        const ok = await leaf.Save();

        expect(ok).toBe(true);
        expect(txnLog).toEqual(['begin', 'commit']);
        expect(currentDepth).toBe(0); // the provider is free — nothing left in flight
    });
});

describe('delete where the provider returns false', () => {
    it('rolls the scope back instead of leaking the ambient transaction open', async () => {
        // DatabaseProviderBase.Delete converts essentially every failure — RLS denial, FK
        // violation, zero rows affected, even thrown SQL errors — into `return false`, so this is
        // the ORDINARY delete-failure path, not an exotic one.
        deleteResult = false;
        const { leaf, parent } = makeChain(webinarEntityInfo, productEntityInfo);
        leaf.NewRecord();
        leaf.MarkSaved();
        parent.MarkSaved();

        const ok = await leaf.Delete();

        expect(ok).toBe(false);
        expect(txnLog).toEqual(['begin', 'rollback']);
        expect(currentDepth).toBe(0);
    });
});

describe('save where the provider returns falsy data', () => {
    it('rolls the scope back rather than committing the parent chain around a failed leaf', async () => {
        // A validate-type entity action rejecting the save makes the provider RETURN falsy data
        // rather than throw. Committing on that path persisted the parent-chain writes under a
        // `false` return — exactly the torn-write class the unified scope exists to eliminate.
        // Only the LEAF's save fails; any parent-chain saves succeed, so the exit under test is
        // the leaf's own finalize-failed branch, not the parent-failure branch.
        const { leaf, parent } = makeChain(productEntityInfo, productEntityInfo);
        leaf.NewRecord();
        // The FIRST set of a field establishes old === new (NeverSet semantics) and lands clean, so
        // an "edit" needs a baseline set first — mirroring load-then-edit on a real record.
        leaf.Set('Name', 'original');
        parent.MarkSaved();
        leaf.MarkSaved();
        leaf.Set('Name', 'edited');
        failSaveWhenNameIs = 'edited';

        const ok = await leaf.Save();

        expect(ok).toBe(false);
        expect(txnLog).toEqual(['begin', 'rollback']);
        expect(currentDepth).toBe(0);
    });
});
