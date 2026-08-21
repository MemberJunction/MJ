/**
 * The delete-validation seam — `ValidateDelete()` / `ValidateDeleteAsync()` — driving the REAL
 * `BaseEntity.Delete()`.
 *
 * WHAT THIS PROTECTS (MJ #3971)
 *
 * `Save()` has a validation seam with a defined contract: return a `ValidationResult`, let the
 * framework decide, and get field-named errors in front of the user. `Delete()` had none. The only
 * way to refuse a delete with an explanation was to override `Delete()` itself, check by hand, and
 * return `false` before calling `super.Delete()`. Three consequences, all of them observed in
 * shipped apps:
 *
 *   1. **The reason was lost.** A `Delete()` override returns `boolean`. There is nowhere to put
 *      "this template is referenced by 5 signed contracts", so the caller got `false` and invented
 *      its own explanation — or the user got the raw FK error text.
 *   2. **Every app reimplemented it differently.** `JournalEntryTypeEntityServer.Delete()` and
 *      `JournalEntryLineEntityServer.Delete()` in `bizapps-accounting`, with four more about to be
 *      written in `bizapps-contracts`.
 *   3. **A `Delete()` override covers only callers that reach that subclass's method**, with no
 *      framework guarantee about ordering relative to permissions, events, or the companion delete
 *      graph. A refusal discovered late in a companion graph on a client provider (no local
 *      transaction) leaves earlier child deletions committed — the refusal costs data.
 *
 * These tests pin the seam: it runs, it runs at the right moment, its errors reach the caller with
 * their `Source` intact, and the async half is turned on by overriding it — not by also finding a
 * second getter, which is the exact trap that made `ValidateAsync` a silent no-op (see
 * `baseEntity.validateAsync.test.ts`).
 *
 * HONEST NARROWING (same as the companions and validateAsync suites): the test entities override
 * `CheckPermissions()` so `Delete()` reaches the provider branch without a permissions fixture, and
 * the provider's `Delete()` records the call and returns true. Neither is the logic under test — the
 * validation gate, the override inference and the delete-plan pre-flight in `baseEntity.ts` are real,
 * untouched production code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo, ValidationErrorInfo, ValidationResult, ValidationErrorType } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID, STANDALONE_ENTITY_ID } from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

let standaloneEntityInfo: EntityInfo;
let productEntityInfo: EntityInfo;

/** Rows the provider was actually asked to delete, in order. */
let deleteLog: string[] = [];
/** Incremented by every test entity whose ValidateDeleteAsync actually runs. */
let asyncRuns = 0;
/** Incremented by every test entity whose ValidateDelete actually runs. */
let syncRuns = 0;
/** Whether the provider claims local transaction support (server tier) for this test. */
let supportsTransactions = false;
/**
 * Class the provider instantiates for a companion child. Children come from
 * `provider.GetEntityObject()`, so this is the only way to give a CHILD a rule the root does not
 * have — which is the case that proves the pre-flight validates the whole plan, not just the root.
 */
let childEntityClass: new (...a: never[]) => BaseEntity;

function makeProvider() {
    const provider = {
        CurrentUser: MOCK_USER,
        get SupportsEntityTransactions() {
            return supportsTransactions;
        },
        get IsInTransaction() {
            return false;
        },
        async GetEntityObject<T extends BaseEntity>(): Promise<T> {
            return new (childEntityClass as never)(
                productEntityInfo,
                provider as unknown as IEntityDataProvider,
            ) as unknown as T;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            return entity.GetAll();
        },
        async Delete(entity: BaseEntity): Promise<boolean> {
            deleteLog.push(String(entity.Get('Name')));
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

/** No validation overrides at all — the overwhelming majority of entity classes. */
class PlainEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

/** The shape the issue asks for: a synchronous refusal carrying a reason and a Source. */
class RefusingEntity extends PlainEntity {
    public override ValidateDelete(): ValidationResult {
        syncRuns++;
        const result = super.ValidateDelete();
        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo(
                'Template',
                'This template is referenced by 5 signed contracts.',
                null,
                ValidationErrorType.Failure,
            ),
        );
        return result;
    }
}

/** A warning is advice, not a refusal — it must not block the delete. */
class WarningOnlyEntity extends PlainEntity {
    public override ValidateDelete(): ValidationResult {
        syncRuns++;
        const result = super.ValidateDelete();
        result.Errors.push(
            new ValidationErrorInfo('Notes', 'This record has notes that will be lost.', null, ValidationErrorType.Warning),
        );
        return result;
    }
}

/** Overrides ONLY the async half — the shape an app writes when the check needs a query. */
class AsyncRefusingEntity extends PlainEntity {
    public override async ValidateDeleteAsync(): Promise<ValidationResult> {
        asyncRuns++;
        const result = await super.ValidateDeleteAsync();
        result.Success = false;
        result.Errors.push(new ValidationErrorInfo('Lines', 'In use by 3 posted lines.', null, ValidationErrorType.Failure));
        return result;
    }
}

/** A server subclass on top of the class that declared the rule — the real MJ layering. */
class ServerAsyncRefusingEntity extends AsyncRefusingEntity {}

/** Both halves refuse: the caller must receive BOTH reasons, not the first one found. */
class BothRefusingEntity extends RefusingEntity {
    public override async ValidateDeleteAsync(): Promise<ValidationResult> {
        asyncRuns++;
        const result = new ValidationResult();
        result.Success = false;
        result.Errors.push(new ValidationErrorInfo('Lines', 'In use by 3 posted lines.', null, ValidationErrorType.Failure));
        return result;
    }
}

/**
 * Overrides the shared policy getter, opting OUT deliberately. One getter governs BOTH seams, so
 * this must suppress the delete rule too — a `true` returned by an override is a choice, unlike the
 * `true` inherited from the base.
 */
class DeliberatelyOptedOutEntity extends AsyncRefusingEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return true;
    }
}

/** Overrides the shared policy getter, opting IN — the 15 server classes in this repo. */
class DeliberatelyOptedInEntity extends AsyncRefusingEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }
}

/** Opted out of ASYNC validation, but still carries a SYNCHRONOUS refusal. */
class OptedOutWithSyncRuleEntity extends RefusingEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return true;
    }
}

/** Refuses at the permission layer, the way `CheckPermissions(_, true)` really does — by throwing. */
class UnauthorizedEntity extends RefusingEntity {
    public override CheckPermissions(): boolean {
        throw new Error('User does not have permission to delete Standalone Items');
    }
}

/** An application rule that blows up rather than returning a result. */
class ThrowingRuleEntity extends PlainEntity {
    public override async ValidateDeleteAsync(): Promise<ValidationResult> {
        asyncRuns++;
        throw new Error('the referential probe query failed');
    }
}

/** A parent that owns its children, so `Delete()` routes through the companion delete graph. */
class CompositeEntity extends BaseEntity {
    public readonly Lines = this.DeclareRelatedRecords<BaseEntity>({
        Name: 'Lines',
        RelatedEntity: 'Products',
        RelatedEntityJoinField: 'Name',
        OnRemove: 'delete',
    });

    public override CheckPermissions(): boolean {
        return true;
    }
}

/** A child that refuses. Reached only through a plan, never as the root. */
class RefusingChildEntity extends CompositeEntity {
    public override ValidateDelete(): ValidationResult {
        syncRuns++;
        const result = super.ValidateDelete();
        result.Success = false;
        result.Errors.push(new ValidationErrorInfo('Line', 'A posted line cannot be deleted.', null));
        return result;
    }
}

/** The same parent, refusing its own delete. The children must survive. */
class RefusingCompositeEntity extends CompositeEntity {
    public override ValidateDelete(): ValidationResult {
        syncRuns++;
        const result = super.ValidateDelete();
        result.Success = false;
        result.Errors.push(new ValidationErrorInfo('Status', 'A posted order cannot be deleted.', null));
        return result;
    }
}

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
    standaloneEntityInfo = entities.find(e => e.ID === STANDALONE_ENTITY_ID)!;
    productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
    Metadata.Provider = {
        Entities: entities,
        CurrentUser: MOCK_USER,
    } as unknown as ProviderBase;
});

afterAll(() => {
    Metadata.Provider = null as unknown as ProviderBase;
});

beforeEach(() => {
    deleteLog = [];
    asyncRuns = 0;
    syncRuns = 0;
    supportsTransactions = false;
    childEntityClass = CompositeEntity;
});

/** A loaded, saved-looking record of `cls`, ready to delete. */
function existingRecord<T extends BaseEntity>(cls: new (...a: never[]) => T, name = 'the-row'): T {
    const entity = new (cls as never)(
        standaloneEntityInfo,
        makeProvider() as unknown as IEntityDataProvider,
    ) as T;
    entity.NewRecord();
    entity.Set('Name', name);
    return entity;
}

describe('a synchronous refusal', () => {
    it('stops the delete before the provider is asked to do anything', async () => {
        // THE FIX. Before this, the override was never called: the row was deleted and the reason
        // the subclass had written down went nowhere.
        const entity = existingRecord(RefusingEntity);

        const deleted = await entity.Delete();

        expect(syncRuns, 'the override ran').toBe(1);
        expect(deleted, 'and its failure refused the delete').toBe(false);
        expect(deleteLog, 'no row was deleted').toEqual([]);
    });

    it('hands the caller the reason, with the Source intact', async () => {
        // Point 1 of the issue: a `Delete()` override returns boolean, so the explanation is lost.
        // A ValidationResult keeps it, and `Source` is what MJ forms use to mark the field.
        const entity = existingRecord(RefusingEntity);

        await entity.Delete();

        const result = entity.LatestResult;
        expect(result?.Success).toBe(false);
        expect(result?.Type).toBe('delete');
        expect(result?.Errors?.length).toBe(1);
        expect(result?.Errors[0].Source).toBe('Template');
        expect(result?.Errors[0].Message).toContain('5 signed contracts');
        // Also on Message, so a caller that only logs the message still says something useful.
        expect(result?.Message).toContain('5 signed contracts');
    });

    it('leaves the record loaded rather than wiping it', async () => {
        // A successful delete calls NewRecord() to flush the row. A refused one must not — the form
        // still needs the record it is showing the error against.
        const entity = existingRecord(RefusingEntity, 'still-here');

        await entity.Delete();

        expect(entity.Get('Name')).toBe('still-here');
    });
});

describe('the base implementation', () => {
    it('deletes normally for an entity that declares no delete rules', async () => {
        const entity = existingRecord(PlainEntity, 'plain');
        expect(await entity.Delete()).toBe(true);
        expect(deleteLog).toEqual(['plain']);
        expect(asyncRuns).toBe(0);
    });

    it('treats a Warning-only result as advice, not a refusal', async () => {
        // Symmetric with the save side: ValidationErrorType exists so a warning can be
        // distinguished from a refusal, and only Success governs.
        const entity = existingRecord(WarningOnlyEntity, 'warned');

        expect(await entity.Delete()).toBe(true);
        expect(syncRuns).toBe(1);
        expect(deleteLog).toEqual(['warned']);
    });
});

describe('the async half is turned on by overriding it', () => {
    it('runs ValidateDeleteAsync for a subclass that overrode it', async () => {
        // Deliberately NOT gated on DefaultSkipAsyncValidation: that getter defaults to true, which
        // is precisely how every hand-written ValidateAsync became a silent no-op. Overriding the
        // method IS the request to run it.
        const entity = existingRecord(AsyncRefusingEntity);

        expect(await entity.Delete()).toBe(false);
        expect(asyncRuns).toBe(1);
        expect(deleteLog).toEqual([]);
        expect(entity.LatestResult?.Errors[0].Source).toBe('Lines');
    });

    it('skips it for a subclass that did not', async () => {
        const entity = existingRecord(PlainEntity);
        expect(await entity.Delete()).toBe(true);
        expect(asyncRuns).toBe(0);
    });

    it('finds an override declared further up a multi-level chain', async () => {
        // Generated class -> app subclass -> server subclass is the normal MJ layering, and the rule
        // is rarely on the leaf.
        const entity = existingRecord(ServerAsyncRefusingEntity);
        expect(await entity.Delete()).toBe(false);
        expect(asyncRuns).toBe(1);
    });

    it('collects sync AND async errors rather than stopping at the first', async () => {
        // The user should see everything blocking the delete in one pass, exactly as Save() does.
        const entity = existingRecord(BothRefusingEntity);

        expect(await entity.Delete()).toBe(false);
        expect(syncRuns).toBe(1);
        expect(asyncRuns).toBe(1);
        expect(entity.LatestResult?.Errors.map(e => e.Source).sort()).toEqual(['Lines', 'Template']);
    });
});

describe('delete options outrank the inference', () => {
    it('SkipAsyncValidation: true suppresses an inferred run', async () => {
        const entity = existingRecord(AsyncRefusingEntity, 'skipped');
        expect(await entity.Delete({ SkipAsyncValidation: true } as never)).toBe(true);
        expect(asyncRuns).toBe(0);
        expect(deleteLog).toEqual(['skipped']);
    });

    it('SkipAsyncValidation: false forces a run on a class with no override', async () => {
        // Reaches the base implementation, which succeeds — the point is that the option is
        // consulted first and is not shadowed by the inference.
        const entity = existingRecord(PlainEntity, 'forced');
        expect(await entity.Delete({ SkipAsyncValidation: false } as never)).toBe(true);
        expect(deleteLog).toEqual(['forced']);
    });

    it('does NOT let SkipAsyncValidation suppress the synchronous half', async () => {
        // The flag is about the cost of async rules. Letting it disable a synchronous refusal would
        // turn an opt-out into a way to delete a row the entity said could not be deleted.
        const entity = existingRecord(RefusingEntity);
        expect(await entity.Delete({ SkipAsyncValidation: true } as never)).toBe(false);
        expect(deleteLog).toEqual([]);
    });

    it('ReplayOnly bypasses delete validation, as EntityDeleteOptions already documents', async () => {
        const entity = existingRecord(RefusingEntity, 'replayed');
        expect(await entity.Delete({ ReplayOnly: true } as never)).toBe(true);
        expect(syncRuns).toBe(0);
    });
});

describe('one async-validation policy, shared with the save seam', () => {
    // The design question this pins: DefaultSkipAsyncValidation governs BOTH seams. An entity states
    // its async-validation policy once, not once per verb. The alternative — a second
    // delete-specific getter — is a second flag for an author to not know about, which is the exact
    // failure mode that made hand-written ValidateAsync overrides dead code.

    it('honours a deliberate opt-out, suppressing the delete rule too', async () => {
        const entity = existingRecord(DeliberatelyOptedOutEntity, 'opted-out');

        expect(await entity.Delete(), 'the delete is not refused').toBe(true);
        expect(asyncRuns, 'the async rule did not run').toBe(0);
        expect(deleteLog).toEqual(['opted-out']);
    });

    it('honours a deliberate opt-in', async () => {
        const entity = existingRecord(DeliberatelyOptedInEntity);

        expect(await entity.Delete()).toBe(false);
        expect(asyncRuns).toBe(1);
    });

    it('lets delete options override a deliberate opt-out', async () => {
        // The precedence, top to bottom: option, then explicit policy, then inference.
        const entity = existingRecord(DeliberatelyOptedOutEntity);

        expect(await entity.Delete({ SkipAsyncValidation: false } as never)).toBe(false);
        expect(asyncRuns).toBe(1);
    });

    it('never lets an async opt-out suppress a synchronous refusal', async () => {
        // The policy is about the COST of async rules. If opting out of them could also delete a row
        // the entity synchronously said could not be deleted, the getter would be a data-loss switch.
        const entity = existingRecord(OptedOutWithSyncRuleEntity);

        expect(await entity.Delete()).toBe(false);
        expect(syncRuns).toBe(1);
        expect(deleteLog).toEqual([]);
    });
});

describe('the ordering guarantees the seam documents', () => {
    // Each of these is a promise the JSDoc makes to someone writing a rule. Untested, they are
    // just prose.

    it('checks permissions BEFORE running any rule', async () => {
        // A user without delete rights must get a permission error, not a validation message about a
        // record they may not be allowed to know the state of.
        const entity = existingRecord(UnauthorizedEntity);

        expect(await entity.Delete()).toBe(false);
        expect(syncRuns, 'the rule never ran').toBe(0);
        expect(entity.LatestResult?.Message).toContain('does not have permission');
    });

    it('does not raise delete_started when the delete is refused', async () => {
        // Nothing started, so nothing is announced. A listener that provisions on delete_started and
        // tears down on delete would otherwise leak on every refusal.
        const entity = existingRecord(RefusingEntity);
        const events: string[] = [];
        entity.RegisterEventHandler(e => events.push(e.type));

        await entity.Delete();

        expect(events).not.toContain('delete_started');
        expect(events).not.toContain('delete');
    });

    it('raises delete_started when the delete proceeds', async () => {
        // The control for the case above: the gate must not have silenced the normal path.
        const entity = existingRecord(PlainEntity);
        const events: string[] = [];
        entity.RegisterEventHandler(e => events.push(e.type));

        await entity.Delete();

        expect(events).toContain('delete_started');
    });
});

describe('a rule that throws rather than returning a result', () => {
    // An application rule is arbitrary code: a RunView that fails, a null dereference. `Delete()`
    // reports failure by RETURNING false, so a rejection must never escape it.

    it('reports failure rather than rejecting, on the single-record path', async () => {
        const entity = existingRecord(ThrowingRuleEntity);

        await expect(entity.Delete()).resolves.toBe(false);
        expect(asyncRuns).toBe(1);
        expect(deleteLog, 'and nothing was deleted').toEqual([]);
        expect(entity.LatestResult?.Message).toContain('referential probe query failed');
    });
});

describe('the IS-A parent chain', () => {
    /**
     * A saved child whose parent chain is a second entity, wired the way the IS-A suites do it. The
     * child's own row is deleted first (the FK requires it), then the delete cascades to the parent.
     */
    function childWithParent(parentClass: new (...a: never[]) => BaseEntity) {
        const child = existingRecord(PlainEntity, 'child-row');
        const parent = existingRecord(parentClass, 'parent-row');
        (child as unknown as { _parentEntity: BaseEntity })._parentEntity = parent;
        return { child, parent };
    }

    it('carries SkipAsyncValidation to the parent delete', async () => {
        // REGRESSION GUARD. `_InnerSave` copies this flag onto its parentSaveOptions; the delete path
        // built parentDeleteOptions without it, so an explicit opt-out was honoured for the child and
        // silently ignored one link up — the parent paid for a query the caller had opted out of, and
        // its refusal failed the whole delete. Found by auditing the two option-builders against each
        // other, not by a failure.
        const { child } = childWithParent(AsyncRefusingEntity);

        expect(await child.Delete({ SkipAsyncValidation: true } as never)).toBe(true);
        expect(asyncRuns, "the parent's async rule was skipped too").toBe(0);
        expect(deleteLog).toEqual(['child-row', 'parent-row']);
    });

    it('runs the parent rule when nothing opted out', async () => {
        // The control: without the flag, the parent's own rule still governs its own row.
        const { child } = childWithParent(AsyncRefusingEntity);

        expect(await child.Delete()).toBe(false);
        expect(asyncRuns).toBe(1);
    });

    it("surfaces the parent's reason on the CHILD, which is the object the caller holds", async () => {
        // `_parentEntity` is private, so a caller has no reference to the object the parent's result
        // was recorded on. KNOWN LIMITATION pinned here rather than hidden: unlike a companion plan,
        // the chain is NOT validated up front, so the child's own row is already gone when the parent
        // refuses. Inside a provider transaction that rolls back; this fixture has none, which is why
        // the child appears in the log.
        const { child } = childWithParent(RefusingEntity);

        expect(await child.Delete()).toBe(false);
        expect(child.LatestResult?.Message).toContain('5 signed contracts');
        expect(deleteLog).toEqual(['child-row']);
    });
});

describe('the companion delete graph', () => {
    /** A parent with `count` owned children attached, so the delete plan has more than one node. */
    async function makeParentWithChildren(count: number, cls = CompositeEntity) {
        const provider = makeProvider();
        const parent = new cls(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();
        parent.Set('Name', 'parent');
        for (let i = 0; i < count; i++) {
            const child = await parent.Lines.Create();
            child.Set('Name', `child-${i}`);
        }
        return parent;
    }

    it('deletes children then the parent when validation passes', async () => {
        // `Name` is the stand-in foreign key, so a child's own Name is overwritten with the parent's
        // key at execution time (same fixture note as the companions suite). Only the shape matters
        // here: three rows, parent last.
        const parent = await makeParentWithChildren(2);

        expect(await parent.Delete()).toBe(true);
        expect(deleteLog.length).toBe(3);
        expect(deleteLog[2]).toBe('parent');
    });

    it('refuses BEFORE any child row is deleted', async () => {
        // The ordering that matters. Companions contribute children FIRST — they hold the foreign
        // keys — so a refusal discovered when the root's own turn came would have already deleted
        // them. On a client provider there is no local transaction to roll that back, so the
        // refusal would cost data. The plan is validated before the first row goes.
        const parent = await makeParentWithChildren(2, RefusingCompositeEntity);

        expect(await parent.Delete()).toBe(false);
        expect(deleteLog, 'the children survived the refusal').toEqual([]);
        expect(parent.LatestResult?.Errors[0].Source).toBe('Status');
    });

    it('refuses the whole plan when a CHILD refuses, before any row is deleted', async () => {
        // The pre-flight validates every node, not just the root. Otherwise a child's rule would be
        // consulted only when its own turn came — after its siblings were already gone.
        childEntityClass = RefusingChildEntity;
        const parent = await makeParentWithChildren(2); // the ROOT has no rule of its own

        expect(await parent.Delete()).toBe(false);
        expect(deleteLog, 'no row was deleted, including the siblings').toEqual([]);
        expect(syncRuns, 'both children were asked').toBe(2);
        expect(parent.LatestResult?.Errors[0].Source).toBe('Line');
    });

    it('reports failure rather than rejecting when a rule throws mid-plan', async () => {
        const parent = await makeParentWithChildren(2);
        // Make the ROOT's rule throw, so the plan is already half-validated when it does.
        (parent as unknown as { ValidateDelete: () => ValidationResult }).ValidateDelete = () => {
            throw new Error('the referential probe query failed');
        };

        await expect(parent.Delete()).resolves.toBe(false);
        expect(deleteLog).toEqual([]);
        expect(parent.LatestResult?.Message).toContain('referential probe query failed');
    });

    it('validates the root exactly once for a graph delete', async () => {
        // A pre-flight plus a per-node gate would run the rule twice, doubling whatever query an
        // application's ValidateDeleteAsync does.
        const parent = await makeParentWithChildren(2, RefusingCompositeEntity);

        await parent.Delete();

        expect(syncRuns).toBe(1);
    });
});
