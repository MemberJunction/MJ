/**
 * When `ValidateAsync` runs — driving the REAL `BaseEntity.Save()`.
 *
 * WHAT THIS PROTECTS
 *
 * `DefaultSkipAsyncValidation` returns `true`, so `Save()` reached `ValidateAsync()` only for a
 * subclass that overrode a *second*, separate getter. The `ValidateAsync` docstring promised the
 * method was "automatically called by Save()" and never mentioned that getter, so an override
 * written against the documentation alone was a silent no-op: it reads as enforced, reviews as
 * enforced, and never runs.
 *
 * That is not hypothetical. It is how `OrderEntityServer.ValidateAsync` — holding both the "cannot
 * confirm an order with no lines" guard and an entire per-line validation loop — was dead on every
 * save in production, and it is the same reasoning that already exempts companion validation from
 * the flag.
 *
 * The base `ValidateAsync` just returns success, so skipping it costs a subclass that did not
 * override it nothing at all. The flag's only reachable effect was therefore to disable the async
 * rules of subclasses that had written async rules. Overriding the method is now what turns it on.
 *
 * THE PRECEDENCE, WHICH IS THE WHOLE DESIGN
 *   1. `EntitySaveOptions.SkipAsyncValidation`, when set, wins outright.
 *   2. An explicit `DefaultSkipAsyncValidation` override wins next — EITHER value. This is what
 *      keeps the change inert for the 16 classes in this repo that already override both.
 *   3. Only when nobody stated a policy is it inferred from whether `ValidateAsync` was overridden.
 *
 * HONEST NARROWING (same as the companions suite): the test entities override `CheckPermissions()`
 * so `Save()` reaches the persistence branch without a permissions fixture, and the provider's
 * `Save()` echoes the record back. Neither is the logic under test — the precedence computation and
 * override detection in `baseEntity.ts` are real, untouched production code.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { IsMemberOverridden } from '@memberjunction/global';
import { BaseEntity } from '../generic/baseEntity';
import { EntityInfo, ValidationErrorInfo, ValidationResult, ValidationErrorType } from '../generic/entityInfo';
import { Metadata } from '../generic/metadata';
import { ProviderBase } from '../generic/providerBase';
import type { IEntityDataProvider } from '../generic/interfaces';
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID } from './mocks/MockEntityData';

const MOCK_USER = { ID: 'u-1', Name: 'T', Email: 't@t', UserRoles: [] };

let productEntityInfo: EntityInfo;
/** Incremented by every test entity whose ValidateAsync actually runs. */
let asyncRuns = 0;

function makeProvider() {
    return {
        CurrentUser: MOCK_USER,
        get SupportsEntityTransactions() {
            return true;
        },
        get IsInTransaction() {
            return false;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            return entity.GetAll();
        },
        async Delete(): Promise<boolean> {
            return true;
        },
        SetCachedRecordName(): void {
            /* no-op */
        },
        GetCachedRecordName(): string | undefined {
            return undefined;
        },
    };
}

/** No overrides at all — the overwhelming majority of entity classes. */
class PlainEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

/**
 * Overrides ONLY `ValidateAsync` — the shape every application writes, and the shape that was
 * silently dead. Its rule always fails, so "did it run" is observable as a refused save rather than
 * only as a counter.
 */
class RulesEntity extends PlainEntity {
    public override async ValidateAsync(): Promise<ValidationResult> {
        asyncRuns++;
        const result = await super.ValidateAsync();
        result.Success = false;
        result.Errors.push(
            new ValidationErrorInfo('Name', 'async rule refused', null, ValidationErrorType.Failure),
        );
        return result;
    }
}

/** A server subclass on top of the class that declared the rule — the real MJ layering. */
class ServerRulesEntity extends RulesEntity {}

/** Overrides both, opting OUT deliberately. That choice must survive. */
class DeliberatelyOptedOutEntity extends RulesEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return true;
    }
}

/** Overrides both, opting IN — the 16 classes already in this repo. Behaviour must not change. */
class DeliberatelyOptedInEntity extends RulesEntity {
    public override get DefaultSkipAsyncValidation(): boolean {
        return false;
    }
}

beforeAll(() => {
    const entities = ALL_ENTITY_DATA.map(d => new EntityInfo(d));
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
    asyncRuns = 0;
});

/** A dirty, newly-created record of `cls`, ready to save. */
function newRecord<T extends BaseEntity>(cls: new (...a: never[]) => T): T {
    const entity = new (cls as never)(
        productEntityInfo,
        makeProvider() as unknown as IEntityDataProvider,
    ) as T;
    entity.NewRecord();
    entity.Set('Name', 'a-name');
    return entity;
}

describe('inferring the policy when nobody stated one', () => {
    it('runs ValidateAsync for a subclass that overrode it', async () => {
        // THE FIX. Before this, the override was never called and the save succeeded, carrying
        // whatever the rule existed to prevent.
        const entity = newRecord(RulesEntity);
        const saved = await entity.Save();

        expect(asyncRuns, 'the override ran').toBe(1);
        expect(saved, 'and its failure refused the save').toBe(false);
        expect(entity.LatestResult?.Success, 'recorded as a failed save').toBe(false);
    });

    it('skips it for a subclass that did not', async () => {
        // Nothing to run — the base implementation returns success — so this is about not paying
        // for an await, and about `DefaultSkipAsyncValidation` still reading `true` for these.
        const entity = newRecord(PlainEntity);
        expect(await entity.Save()).toBe(true);
        expect(asyncRuns).toBe(0);
    });

    it('finds an override declared further up a multi-level chain', async () => {
        // Generated class -> app subclass -> server subclass is the normal MJ layering, and the
        // rule is rarely on the leaf. Checking only the instance's own prototype would miss it.
        const entity = newRecord(ServerRulesEntity);
        expect(await entity.Save()).toBe(false);
        expect(asyncRuns).toBe(1);
    });
});

describe('an explicit policy always wins', () => {
    it('honours a deliberate opt-out even though ValidateAsync is overridden', async () => {
        // The distinction the fix rests on: `true` returned by an override is a CHOICE, while
        // `true` inherited from the base is the absence of one. They must not behave alike.
        const entity = newRecord(DeliberatelyOptedOutEntity);
        expect(await entity.Save(), 'the save is not refused').toBe(true);
        expect(asyncRuns, 'the rule did not run').toBe(0);
    });

    it('honours a deliberate opt-in, exactly as before', async () => {
        // The 16 classes in this repo that already override both. Their behaviour is unchanged,
        // which is why this change has no blast radius inside MJ.
        const entity = newRecord(DeliberatelyOptedInEntity);
        expect(await entity.Save()).toBe(false);
        expect(asyncRuns).toBe(1);
    });
});

describe('save options outrank everything', () => {
    it('SkipAsyncValidation: true suppresses an inferred run', async () => {
        const entity = newRecord(RulesEntity);
        expect(await entity.Save({ SkipAsyncValidation: true } as never)).toBe(true);
        expect(asyncRuns).toBe(0);
    });

    it('SkipAsyncValidation: false forces a run on a class with no override', async () => {
        // Reaches the base implementation, which succeeds — the point is that the option is still
        // consulted first and is not shadowed by the inference.
        const entity = newRecord(PlainEntity);
        expect(await entity.Save({ SkipAsyncValidation: false } as never)).toBe(true);
    });

    it('SkipAsyncValidation: false overrides a deliberate opt-out', async () => {
        const entity = newRecord(DeliberatelyOptedOutEntity);
        expect(await entity.Save({ SkipAsyncValidation: false } as never)).toBe(false);
        expect(asyncRuns).toBe(1);
    });
});

describe('override detection', () => {
    // Exercised through the entity classes above because the inference is only as good as this, and
    // the getter-vs-method distinction is easy to get wrong: a property descriptor carries an
    // overridden accessor on `get` and an overridden method on `value`, never both. The general
    // behaviour of the helper itself is covered in @memberjunction/global's ClassUtils tests.
    const isOverridden = (instance: object, member: string): boolean =>
        IsMemberOverridden(instance, member, BaseEntity);

    it('detects an overridden method', () => {
        expect(isOverridden(newRecord(RulesEntity), 'ValidateAsync')).toBe(true);
    });

    it('detects an overridden getter', () => {
        expect(isOverridden(newRecord(DeliberatelyOptedOutEntity), 'DefaultSkipAsyncValidation')).toBe(true);
    });

    it('reports no override when a subclass declares neither', () => {
        const plain = newRecord(PlainEntity);
        expect(isOverridden(plain, 'ValidateAsync')).toBe(false);
        expect(isOverridden(plain, 'DefaultSkipAsyncValidation')).toBe(false);
    });

    it('does not confuse the two members', () => {
        // RulesEntity overrides the method only. Reporting the getter as overridden here would
        // make the inference defer to a policy nobody stated — the original bug, reintroduced.
        const rules = newRecord(RulesEntity);
        expect(isOverridden(rules, 'ValidateAsync')).toBe(true);
        expect(isOverridden(rules, 'DefaultSkipAsyncValidation')).toBe(false);
    });

    it('returns false for a member BaseEntity does not declare', () => {
        expect(isOverridden(newRecord(PlainEntity), 'NoSuchMember')).toBe(false);
    });

    it('answers identically on repeat calls, once the answer is cached', () => {
        // The result is cached per constructor. A cache keyed wrongly — or one that memoised the
        // first member asked about and returned it for every other — would pass a single-call test
        // and fail here.
        const rules = newRecord(RulesEntity);
        for (let i = 0; i < 3; i++) {
            expect(isOverridden(rules, 'ValidateAsync')).toBe(true);
            expect(isOverridden(rules, 'DefaultSkipAsyncValidation')).toBe(false);
        }
    });

    it('answers per class, not per instance', () => {
        // Two classes sharing a cache entry would make whichever ran first decide for both.
        expect(isOverridden(newRecord(RulesEntity), 'ValidateAsync')).toBe(true);
        expect(isOverridden(newRecord(PlainEntity), 'ValidateAsync')).toBe(false);
        expect(isOverridden(newRecord(RulesEntity), 'ValidateAsync')).toBe(true);
    });
});
