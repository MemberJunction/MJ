// ResolverBase transitively pulls in type-graphql decorators, which need the
// Reflect.metadata polyfill at import time.
import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import type { DatabaseProviderBase, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import type { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import { FieldMapper } from '@memberjunction/graphql-dataprovider';
import { ResolverBase } from '../generic/ResolverBase.js';
import type { UserPayload } from '../types.js';

/**
 * Regression guard for the server-cache corruption behind
 * "Field _mj__CreatedAt does not exist on MJ: Template Categories".
 *
 * GraphQL reserves the `__` prefix, so MJ renames `__mj_*` columns to the
 * transport alias `_mj__*` on the way out. `ResolverBase` used to apply that
 * rename IN PLACE over `result.Results` — but those are the data provider's own
 * row objects, and the server's cache holds them BY REFERENCE. Preparing one
 * GraphQL response therefore rewrote the keys inside the live cache, and every
 * subsequent read served from it handed the client transport-shaped rows that
 * `BaseEntity.SetMany` rejects. Process-wide cache ⇒ one response poisoned every
 * later request, across all workers.
 *
 * The fix is copy-then-map. The first block exercises the REAL resolver path (so a
 * revert to in-place mapping fails here); the second pins the two `FieldMapper`
 * invariants that make the fix correct.
 */

/** A cache-held row, shaped the way the provider hands them back. */
type CachedRow = Record<string, unknown>;

/**
 * Reaches the protected `RunViewGenericInternal` and records what
 * `ArrayFilterEncryptedFieldsForAPI` was handed — the second in-place mutator that
 * must also see copies, and stubbed here so the assertion needs no live Metadata.
 */
class Probe extends ResolverBase {
    public filteredRows: Record<string, unknown>[] | null = null;

    protected override async ArrayFilterEncryptedFieldsForAPI(
        _entityName: string,
        dataObjectArray: Record<string, unknown>[]
    ): Promise<Record<string, unknown>[]> {
        this.filteredRows = dataObjectArray;
        return dataObjectArray;
    }

    public Run(provider: DatabaseProviderBase, viewInfo: MJUserViewEntityExtended, userPayload: UserPayload) {
        return this.RunViewGenericInternal(
            provider,
            viewInfo,
            '', // extraFilter
            '', // orderBy
            '', // userSearchString
            undefined, // excludeUserViewRunID
            undefined, // overrideExcludeFilter
            undefined, // saveViewResults
            undefined, // fields
            undefined, // ignoreMaxRows
            undefined, // excludeDataFromAllPriorViewRuns
            undefined, // forceAuditLog
            undefined, // auditLogDescription
            'simple', // resultType
            userPayload,
            undefined, // maxRows
            undefined // startRow
        );
    }
}

const ENTITY_NAME = 'MJ: Template Categories';

/** Minimal provider: the entity lookup + the RunView the resolver awaits. */
function fakeProvider(rows: CachedRow[]): DatabaseProviderBase {
    return {
        Entities: [{ Name: ENTITY_NAME, PrimaryKeys: [{ Name: 'ID' }] }],
        RunView: async (_params: RunViewParams): Promise<RunViewResult> =>
            ({ Success: true, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ErrorMessage: '' } as RunViewResult),
    } as unknown as DatabaseProviderBase;
}

const fakeViewInfo = () =>
    ({ ID: 'view-1', Name: 'Test View', Entity: ENTITY_NAME } as unknown as MJUserViewEntityExtended);

/** `userRecord` short-circuits the UserCache lookup; no apiKeyHash skips the scope check. */
const fakePayload = () =>
    ({ email: 'tester@example.com', userRecord: { Email: 'tester@example.com' } as UserInfo } as UserPayload);

describe('ResolverBase.RunViewGenericInternal — cache safety', () => {
    it('leaves the provider\'s (cache-held) rows untouched while returning transport keys', async () => {
        const cachedRow: CachedRow = { ID: 'a1', Name: 'Cat', __mj_CreatedAt: 'T0', __mj_UpdatedAt: 'T1' };
        const probe = new Probe();

        const result = await probe.Run(fakeProvider([cachedRow]), fakeViewInfo(), fakePayload());

        // The pre-fix code renamed these keys in place — this is the assertion that fails on a revert.
        expect(cachedRow.__mj_CreatedAt).toBe('T0');
        expect(cachedRow.__mj_UpdatedAt).toBe('T1');
        expect(cachedRow._mj__CreatedAt).toBeUndefined();

        // The outgoing rows carry the GraphQL-legal aliases, and are NOT the cached objects.
        const wire = result?.Results as Record<string, unknown>[];
        expect(wire[0]._mj__CreatedAt).toBe('T0');
        expect(wire[0]).not.toBe(cachedRow);
    });

    it('hands the encrypted-field filter the copies, not the cached rows', async () => {
        const cachedRow: CachedRow = { ID: 'a1', Secret: 'plaintext', __mj_CreatedAt: 'T0' };
        const probe = new Probe();

        await probe.Run(fakeProvider([cachedRow]), fakeViewInfo(), fakePayload());

        expect(probe.filteredRows).not.toBeNull();
        expect(probe.filteredRows![0]).not.toBe(cachedRow);
    });
});

describe('FieldMapper transport mapping — the invariants the fix rests on', () => {
    it('MapFields MUTATES its argument (the hazard the resolver must not expose the cache to)', () => {
        // Documents WHY the resolver must copy. If this ever becomes non-mutating,
        // the copy in ResolverBase is redundant rather than load-bearing — and this
        // test failing is the signal to revisit it.
        const row: Record<string, unknown> = { ID: 'a1', Name: 'Cat', __mj_CreatedAt: 'T0' };

        new FieldMapper().MapFields(row);

        expect(row.__mj_CreatedAt).toBeUndefined();
        expect(row._mj__CreatedAt).toBe('T0');
    });

    it('post-map mutation of the copy cannot reach the cached row', () => {
        // ArrayFilterEncryptedFieldsForAPI redacts in place after mapping; on the
        // pre-fix code that stripped secrets out of the CACHED row too.
        const mapper = new FieldMapper();
        const cachedRow: Record<string, unknown> = { ID: 'a1', Secret: 'plaintext', __mj_CreatedAt: 'T0' };

        const wireRow = mapper.MapFields({ ...cachedRow })!;
        wireRow.Secret = null; // stand-in for the encrypted-field filter

        expect(cachedRow.Secret).toBe('plaintext');
        expect(wireRow.Secret).toBeNull();
    });

    it('round-trips a mapped copy back to entity field names', () => {
        // The client's ConvertBackToMJFields must undo exactly what the server did.
        const mapper = new FieldMapper();
        const original: Record<string, unknown> = { ID: 'a1', __mj_CreatedAt: 'T0', __mj_UpdatedAt: 'T1' };

        const wire = mapper.MapFields({ ...original })!;
        const back = mapper.ReverseMapFields({ ...wire });

        expect(back).toEqual(original);
    });

    it('leaves rows without __mj_ fields structurally unchanged', () => {
        const mapper = new FieldMapper();
        const row = { ID: 'a1', Name: 'Cat' };

        expect(mapper.MapFields({ ...row })).toEqual(row);
    });
});
