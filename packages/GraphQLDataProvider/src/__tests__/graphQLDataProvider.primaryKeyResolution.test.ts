/**
 * Primary-key resolution over the wire for the REAL GraphQLDataProvider.
 *
 * `Load` and `Delete` both have to turn a CompositeKey's `FieldName` into the entity's
 * `EntityField` so they can emit the GraphQL parameter's type and CodeName. Both did it with an
 * unguarded `entity.Fields.find(...).EntityFieldInfo`.
 *
 * A caller that builds the key from a hardcoded column name — `CompositeKey.FromID(id)` invents
 * `'ID'` — hands over a name a soft-keyed entity does not have. `find` returns `undefined`, the
 * dereference throws `Cannot read properties of undefined (reading 'EntityFieldInfo')`, and the
 * user gets that bare TypeError with no mention of which entity or which key. Every MJ core
 * entity is `ID`-keyed, so this is invisible across the whole core product and fires on the first
 * entity mapped from an external schema (a NetForum `*_key` table).
 *
 * These tests are on the REAL provider over the REAL EntityInfo/BaseEntity construction path;
 * only graphql-request is faked (see ./support/graphQLWire.ts), so every assertion is on the
 * exact document and variables that would reach MJAPI.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { CompositeKey, EntityDeleteOptions, UserInfo } from '@memberjunction/core';
import { GraphQLWire } from './support/graphQLWire';
import {
    BuildCompositeKeyedEntityInfo,
    BuildSoftKeyedEntityInfo,
    BuildTestUser,
    CreateWireTestProvider,
    ResetGraphQLProviderSingleton,
    TestCompositeKeyedEntity,
    TestSoftKeyedEntity,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

/** The TypeError text the unguarded dereference produced — no test may accept this as the outcome. */
const BARE_TYPE_ERROR = "Cannot read properties of undefined (reading 'EntityFieldInfo')";

describe('GraphQLDataProvider primary-key field resolution', () => {
    let provider: WireTestGraphQLProvider;
    let user: UserInfo;
    let consoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
        provider.RegisterTestEntity(BuildSoftKeyedEntityInfo());
        provider.RegisterTestEntity(BuildCompositeKeyedEntityInfo());
        user = BuildTestUser(provider);
        // Load()/Delete() funnel every failure through LogError, which lands on console.error.
        // Capturing it is how a swallowed throw's MESSAGE is asserted through the public API.
        consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleError.mockRestore();
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        ResetGraphQLProviderSingleton();
    });

    /** Everything console.error saw, joined — the provider logs one string per failure. */
    function loggedText(): string {
        return consoleError.mock.calls.map(call => call.map(a => String(a)).join(' ')).join('\n');
    }

    function softKeyed(): TestSoftKeyedEntity {
        return new TestSoftKeyedEntity(BuildSoftKeyedEntityInfo(), provider);
    }

    function loadedSoftKeyed(): TestSoftKeyedEntity {
        const entity = softKeyed();
        entity.LoadFromData({ cst_key: 'CST-0099', cst_name: 'Acme Society', cst_active: true });
        return entity;
    }

    function compositeKeyed(): TestCompositeKeyedEntity {
        return new TestCompositeKeyedEntity(BuildCompositeKeyedEntityInfo(), provider);
    }

    describe('Load — the soft-keyed fallback', () => {
        it("resolves a key named 'ID' to the entity's single primary key (cst_key) and sends THAT on the wire", async () => {
            const entity = softKeyed();
            // Exactly what CompositeKey.FromID(id) produces: the invented field name 'ID'.
            const key = new CompositeKey([{ FieldName: 'ID', Value: 'CST-0099' }]);
            GraphQLWire.EnqueueResponse({
                netforumcustomer: { cst_key: 'CST-0099', cst_name: 'Acme Society', cst_active: true },
            });

            const loaded = await provider.Load(entity, key, null, user);

            expect(loggedText(), 'nothing was logged — the load did not fail').not.toContain(BARE_TYPE_ERROR);
            expect(GraphQLWire.Requests).toHaveLength(1);
            const doc = GraphQLWire.LastRequest.document;
            // The parameter is typed and named for the REAL key column, not the one it was handed
            expect(doc).toContain('$cst_key: String!');
            expect(doc).toContain('cst_key: $cst_key');
            expect(doc).not.toContain('$ID:');
            // ...and the value travels under the real column's CodeName
            expect(GraphQLWire.LastRequest.variables).toEqual({ cst_key: 'CST-0099' });
            expect(loaded).toMatchObject({ cst_key: 'CST-0099', cst_name: 'Acme Society' });
        });

        it('an exact key name still resolves directly — the fallback changes nothing on the normal path', async () => {
            const entity = softKeyed();
            const key = new CompositeKey([{ FieldName: 'cst_key', Value: 'CST-0100' }]);
            GraphQLWire.EnqueueResponse({ netforumcustomer: { cst_key: 'CST-0100' } });

            await provider.Load(entity, key, null, user);

            expect(GraphQLWire.LastRequest.variables).toEqual({ cst_key: 'CST-0100' });
        });

        it('the fallback is name-agnostic, not ID-specific — any single invented name resolves to the single key', async () => {
            const entity = softKeyed();
            const key = new CompositeKey([{ FieldName: 'RecordID', Value: 'CST-0101' }]);
            GraphQLWire.EnqueueResponse({ netforumcustomer: { cst_key: 'CST-0101' } });

            await provider.Load(entity, key, null, user);

            expect(GraphQLWire.LastRequest.variables).toEqual({ cst_key: 'CST-0101' });
        });
    });

    describe('Load — a genuine mismatch is NAMED, not a TypeError', () => {
        it('names the entity and the offending key when the entity has more than one primary key', async () => {
            const entity = compositeKeyed();
            // One key column against a two-column primary key: there is no unambiguous
            // "the primary key" for 'ID' to mean, and guessing would truncate the key.
            const key = new CompositeKey([{ FieldName: 'ID', Value: 'ORD-1' }]);

            const loaded = await provider.Load(entity, key, null, user);

            expect(loaded).toBeNull();
            expect(GraphQLWire.Requests, 'no query is sent on an unresolvable key').toHaveLength(0);
            const logged = loggedText();
            expect(logged, 'the entity is named').toContain('Order Lines');
            expect(logged, 'the key it was handed is named').toContain("'ID'");
            expect(logged, "the entity's real key columns are named").toContain('OrderID, LineNo');
            expect(logged, 'not the bare dereference TypeError').not.toContain(BARE_TYPE_ERROR);
        });

        it('a multi-column key with one bad name is reported, never silently truncated to the good one', async () => {
            const entity = softKeyed();
            // Two key columns handed to a single-PK entity: the fallback must not fire, because
            // accepting it would drop a column the caller believed it was keying on.
            const key = new CompositeKey([
                { FieldName: 'cst_key', Value: 'CST-0099' },
                { FieldName: 'cst_revision', Value: '2' },
            ]);

            const loaded = await provider.Load(entity, key, null, user);

            expect(loaded).toBeNull();
            expect(GraphQLWire.Requests).toHaveLength(0);
            const logged = loggedText();
            expect(logged).toContain('NetForum Customers');
            expect(logged).toContain("'cst_revision'");
            expect(logged).not.toContain(BARE_TYPE_ERROR);
        });
    });

    describe('Delete — the same resolution, from the same helper', () => {
        it('builds the Delete mutation from the real key column on a soft-keyed entity', async () => {
            const entity = loadedSoftKeyed();
            GraphQLWire.EnqueueResponse({ Deletenetforumcustomer: { cst_key: 'CST-0099' } });

            const deleted = await provider.Delete(entity, new EntityDeleteOptions(), user);

            expect(deleted).toBe(true);
            const doc = GraphQLWire.LastRequest.document;
            expect(doc).toContain('$cst_key: String!');
            expect(doc).toContain('cst_key: $cst_key');
            expect(GraphQLWire.LastRequest.variables).toMatchObject({ cst_key: 'CST-0099' });
        });
    });

    describe('ResolvePrimaryKeyField — the one helper both call sites use', () => {
        it('throws an Error (not a TypeError) naming the entity and the key, for both call sites', () => {
            const entity = compositeKeyed();
            entity.LoadFromData({ OrderID: 'ORD-1', LineNo: 3, Quantity: 5 });

            let thrown: unknown;
            try {
                provider.CallResolvePrimaryKeyField(entity, 'ID', 1);
            } catch (e) {
                thrown = e;
            }

            expect(thrown).toBeInstanceOf(Error);
            expect(thrown).not.toBeInstanceOf(TypeError);
            const message = (thrown as Error).message;
            expect(message).toContain('Order Lines');
            expect(message).toContain("'ID'");
            expect(message).toContain('OrderID, LineNo');
            expect(message).not.toContain(BARE_TYPE_ERROR);
        });

        it('returns the single primary key for a one-column key on a one-PK entity', () => {
            const entity = loadedSoftKeyed();

            const field = provider.CallResolvePrimaryKeyField(entity, 'ID', 1);

            expect(field.Name).toBe('cst_key');
            expect(field.EntityFieldInfo.IsPrimaryKey).toBe(true);
        });

        it('does not fall back when the key names more than one column', () => {
            const entity = loadedSoftKeyed();

            expect(() => provider.CallResolvePrimaryKeyField(entity, 'ID', 2)).toThrow(/NetForum Customers/);
        });
    });
});
