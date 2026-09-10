/**
 * Save/Delete-over-the-wire behavioral tests for the REAL GraphQLDataProvider.
 *
 * The entities are REAL BaseEntity instances over a real EntityInfo fixture, so
 * dirty-field tracking, ReadOnly rules, default values, and CodeName generation are
 * production behavior. Only graphql-request is faked (see ./support/graphQLWire.ts),
 * so every assertion is on the exact mutation document + variables the provider
 * would send to MJAPI, and on how the wire response is applied back to the result.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('graphql-request', async () => {
    const wire = await import('./support/graphQLWire');
    return { gql: wire.FakeGql, GraphQLClient: wire.FakeGraphQLClient };
});

import { EntityDeleteOptions, EntitySaveOptions, TransactionItem, UserInfo } from '@memberjunction/core';
import { GraphQLTransactionGroup } from '../graphQLTransactionGroup';
import { FakeGraphQLResponseError, GraphQLWire } from './support/graphQLWire';
import {
    BuildCustomerEntityInfo,
    BuildTestUser,
    CreateWireTestProvider,
    ResetGraphQLProviderSingleton,
    TestCustomerEntity,
    WireTestGraphQLProvider,
} from './support/wireTestHarness';

/** Narrow the last request's `input` variable to a record after a runtime shape check. */
function lastInputRecord(): Record<string, unknown> {
    const input = GraphQLWire.LastInput;
    expect(input).toBeTypeOf('object');
    return input as Record<string, unknown>;
}

const SIGNED_UP_AT_MS = 1_700_000_000_000;
const CREATED_AT = new Date('2026-01-01T00:00:00Z');
const UPDATED_AT = new Date('2026-02-01T00:00:00Z');

describe('GraphQLDataProvider Save/Delete wire behavior', () => {
    let provider: WireTestGraphQLProvider;
    let user: UserInfo;

    beforeEach(() => {
        GraphQLWire.Reset();
        provider = CreateWireTestProvider();
        provider.RegisterTestEntity(BuildCustomerEntityInfo());
        user = BuildTestUser(provider);
    });

    afterEach(() => {
        expect(GraphQLWire.PendingResponderCount).toBe(0);
        ResetGraphQLProviderSingleton();
    });

    function newCustomer(): TestCustomerEntity {
        const entity = new TestCustomerEntity(BuildCustomerEntityInfo(), provider);
        entity.NewRecord();
        return entity;
    }

    function loadedCustomer(): TestCustomerEntity {
        const entity = new TestCustomerEntity(BuildCustomerEntityInfo(), provider);
        entity.LoadFromData({
            ID: 'CUST-0001',
            Name: 'Old Name',
            'First Name': null,
            Tier: 'Gold',
            IsActive: true,
            Age: 42,
            SignedUpAt: new Date(SIGNED_UP_AT_MS),
            Photo: null,
            __mj_CreatedAt: CREATED_AT,
            __mj_UpdatedAt: UPDATED_AT,
        });
        return entity;
    }

    /** Successful create/update response echoing typical server output. */
    function saveResponse(mutationName: string, values: Record<string, unknown>): Record<string, unknown> {
        return { [mutationName]: values };
    }

    describe('Save — create', () => {
        it('builds a Create mutation named for the schema-prefixed type with a full mapped selection set', async () => {
            const entity = newCustomer();
            entity.Set('Name', 'Acme');
            GraphQLWire.EnqueueResponse(saveResponse('CreateCRMCustomer', { ID: 'NEW-1', Name: 'Acme' }));

            await provider.Save(entity, user, new EntitySaveOptions());

            expect(GraphQLWire.Requests).toHaveLength(1);
            const doc = GraphQLWire.LastRequest.document;
            expect(doc).toContain('mutation CreateCRMCustomer ($input: CreateCRMCustomerInput!)');
            expect(doc).toContain('CreateCRMCustomer(input: $input)');
            // The selection set asks for EVERY field back (mapped CodeNames) so the entity
            // can refresh itself from the server's post-save state
            for (const expected of ['ID', 'Name', 'First_Name', 'Tier', 'IsActive', 'Age', 'SignedUpAt', 'Photo', '_mj__CreatedAt', '_mj__UpdatedAt']) {
                expect(doc).toContain(expected);
            }
            expect(doc).not.toContain('__mj_CreatedAt');
        });

        it('sends only writable fields on create — primary key, read-only, and __mj_ fields are excluded', async () => {
            const entity = newCustomer();
            entity.Set('Name', 'Acme');
            GraphQLWire.EnqueueResponse(saveResponse('CreateCRMCustomer', { ID: 'NEW-1', Name: 'Acme' }));

            await provider.Save(entity, user, new EntitySaveOptions());

            const input = lastInputRecord();
            expect(Object.keys(input).sort()).toEqual(['Age', 'First_Name', 'IsActive', 'Name', 'SignedUpAt', 'Tier']);
        });

        it('converts values per field type: Date → epoch ms, numeric string → number, boolean-ish → boolean', async () => {
            const entity = newCustomer();
            entity.Set('Name', 'Acme');
            entity.Set('Age', '42');
            entity.Set('SignedUpAt', new Date(SIGNED_UP_AT_MS));
            entity.Set('IsActive', '1');
            GraphQLWire.EnqueueResponse(saveResponse('CreateCRMCustomer', { ID: 'NEW-1' }));

            await provider.Save(entity, user, new EntitySaveOptions());

            const input = lastInputRecord();
            expect(input['Age']).toBe(42);
            expect(input['SignedUpAt']).toBe(SIGNED_UP_AT_MS);
            expect(input['IsActive']).toBe(true);
        });

        it('backfills null non-nullable fields from DefaultValue, falling back to empty string', async () => {
            const entity = newCustomer();
            // Name: NOT NULL, no default, never set   → '' fallback
            // Tier: NOT NULL, default 'Standard' — explicitly nulled → default restored
            entity.Set('Tier', null);
            GraphQLWire.EnqueueResponse(saveResponse('CreateCRMCustomer', { ID: 'NEW-1' }));

            await provider.Save(entity, user, new EntitySaveOptions());

            const input = lastInputRecord();
            expect(input['Name']).toBe('');
            expect(input['Tier']).toBe('Standard');
            // Nullable field left null passes through as null
            expect(input['First_Name']).toBeNull();
        });

        it('applies the wire response back: reverse-maps _mj__ fields into NewValues and marks the result successful', async () => {
            const entity = newCustomer();
            entity.Set('Name', 'Acme');
            GraphQLWire.EnqueueResponse(
                saveResponse('CreateCRMCustomer', {
                    ID: 'NEW-1',
                    Name: 'Acme',
                    First_Name: null,
                    Tier: 'Standard',
                    IsActive: true,
                    Age: null,
                    SignedUpAt: null,
                    Photo: null,
                    _mj__CreatedAt: 1_750_000_000_000,
                    _mj__UpdatedAt: 1_750_000_000_000,
                })
            );

            const newValues = await provider.Save(entity, user, new EntitySaveOptions());

            expect(newValues).toEqual({
                ID: 'NEW-1',
                Name: 'Acme',
                First_Name: null,
                Tier: 'Standard',
                IsActive: true,
                Age: null,
                SignedUpAt: null,
                Photo: null,
                __mj_CreatedAt: 1_750_000_000_000,
                __mj_UpdatedAt: 1_750_000_000_000,
            });
            expect(entity.LatestResult.Success).toBe(true);
            expect(entity.LatestResult.Type).toBe('create');
            expect(entity.LatestResult.NewValues).toEqual(newValues);
            // OriginalValues captured for every field by CodeName
            expect(entity.LatestResult.OriginalValues).toHaveLength(10);
        });
    });

    describe('Save — update', () => {
        it('builds an Update mutation and includes the primary key in the input', async () => {
            const entity = loadedCustomer();
            entity.Set('Name', 'New Name');
            GraphQLWire.EnqueueResponse(saveResponse('UpdateCRMCustomer', { ID: 'CUST-0001', Name: 'New Name' }));

            await provider.Save(entity, user, new EntitySaveOptions());

            const doc = GraphQLWire.LastRequest.document;
            expect(doc).toContain('mutation UpdateCRMCustomer ($input: UpdateCRMCustomerInput!)');
            expect(doc).toContain('UpdateCRMCustomer(input: $input)');

            const input = lastInputRecord();
            expect(input['ID']).toBe('CUST-0001');
            expect(input['Name']).toBe('New Name');
            expect(input['Tier']).toBe('Gold');
            expect(input['IsActive']).toBe(true);
            expect(input['Age']).toBe(42);
            expect(input['SignedUpAt']).toBe(SIGNED_UP_AT_MS);
            expect(entity.LatestResult.Type).toBe('update');
        });

        it('sends OldValues___ for concurrency checking with per-type string encoding', async () => {
            const entity = loadedCustomer();
            entity.Set('Name', 'New Name');
            GraphQLWire.EnqueueResponse(saveResponse('UpdateCRMCustomer', { ID: 'CUST-0001', Name: 'New Name' }));

            await provider.Save(entity, user, new EntitySaveOptions()); // SkipOldValuesCheck defaults to false

            const input = lastInputRecord();
            const oldValues = input['OldValues___'];
            expect(Array.isArray(oldValues)).toBe(true);
            // one entry per field — the full pre-save record rides along
            expect(oldValues).toHaveLength(10);
            expect(oldValues).toEqual(
                expect.arrayContaining([
                    { Key: 'ID', Value: 'CUST-0001' },
                    { Key: 'Name', Value: 'Old Name' },          // the OLD value, not the dirty one
                    { Key: 'First_Name', Value: null },          // nulls stay null
                    { Key: 'IsActive', Value: '1' },             // booleans → '1'/'0'
                    { Key: 'Age', Value: '42' },                 // numbers → strings
                    { Key: 'SignedUpAt', Value: SIGNED_UP_AT_MS.toString() },       // dates → epoch-ms strings
                    { Key: '_mj__CreatedAt', Value: CREATED_AT.getTime().toString() }, // __mj_ keys mapped for transport
                ])
            );
        });

        it('omits OldValues___ when SkipOldValuesCheck is true', async () => {
            const entity = loadedCustomer();
            entity.Set('Name', 'New Name');
            GraphQLWire.EnqueueResponse(saveResponse('UpdateCRMCustomer', { ID: 'CUST-0001' }));

            const options = new EntitySaveOptions();
            options.SkipOldValuesCheck = true;
            await provider.Save(entity, user, options);

            expect(Object.prototype.hasOwnProperty.call(lastInputRecord(), 'OldValues___')).toBe(false);
        });

        it('mirrors the client-side RestoreContext onto the mutation input as RestoreContext___', async () => {
            const entity = loadedCustomer();
            entity.Set('Name', 'Restored Name');
            entity.SetRestoreContext('CHANGE-123', 'undo bad edit');
            GraphQLWire.EnqueueResponse(saveResponse('UpdateCRMCustomer', { ID: 'CUST-0001' }));

            await provider.Save(entity, user, new EntitySaveOptions());

            expect(lastInputRecord()['RestoreContext___']).toEqual({
                SourceChangeID: 'CHANGE-123',
                Reason: 'undo bad edit',
            });

            // and absent when no restore context is set
            const plain = loadedCustomer();
            plain.Set('Name', 'Another');
            GraphQLWire.EnqueueResponse(saveResponse('UpdateCRMCustomer', { ID: 'CUST-0001' }));
            await provider.Save(plain, user, new EntitySaveOptions());
            expect(Object.prototype.hasOwnProperty.call(lastInputRecord(), 'RestoreContext___')).toBe(false);
        });
    });

    describe('Save — short circuits and errors', () => {
        it('IsParentEntitySave returns current entity state without any wire call', async () => {
            const entity = loadedCustomer();
            const options = new EntitySaveOptions();
            options.IsParentEntitySave = true;

            const result = await provider.Save(entity, user, options);

            expect(GraphQLWire.Requests).toHaveLength(0);
            expect(result).toEqual(entity.GetAll());
            expect(entity.LatestResult.Success).toBe(true);
        });

        it('surfaces the first GraphQL error message into LatestResult and returns null', async () => {
            const entity = newCustomer();
            entity.Set('Name', 'Acme');
            GraphQLWire.EnqueueError(new FakeGraphQLResponseError('Permission denied for Customers', 'FORBIDDEN'));

            const result = await provider.Save(entity, user, new EntitySaveOptions());

            expect(result).toBeNull();
            expect(entity.LatestResult.Success).toBe(false);
            expect(entity.LatestResult.Message).toBe('Permission denied for Customers');
        });

        it('treats a response without the mutation key as a failure', async () => {
            const entity = newCustomer();
            entity.Set('Name', 'Acme');
            GraphQLWire.EnqueueResponse({ SomethingElse: {} });

            const result = await provider.Save(entity, user, new EntitySaveOptions());

            expect(result).toBeNull();
            expect(entity.LatestResult.Success).toBe(false);
            expect(entity.LatestResult.Message).toContain('Save failed for');
        });

        it('queues a TransactionItem (no wire call) when the entity belongs to a transaction group', async () => {
            class InspectableTransactionGroup extends GraphQLTransactionGroup {
                public get Pending(): TransactionItem[] {
                    return this.PendingTransactions;
                }
            }
            const group = new InspectableTransactionGroup(provider);
            const entity = newCustomer();
            entity.TransactionGroup = group;
            entity.Set('Name', 'Queued Co');

            const result = await provider.Save(entity, user, new EntitySaveOptions());

            expect(result).toBe(true); // TG saves always return true immediately
            expect(GraphQLWire.Requests).toHaveLength(0);
            expect(group.Pending).toHaveLength(1);
            const item = group.Pending[0];
            expect(item.OperationType).toBe('Create');
            expect(item.Instruction).toContain('CreateCRMCustomer(input: $input)');
            expect(item.ExtraData).toEqual({
                mutationName: 'CreateCRMCustomer',
                mutationInputTypes: [{ varName: 'input', inputType: 'CreateCRMCustomerInput!' }],
            });
            expect(item.Vars).toEqual({ input: expect.objectContaining({ Name: 'Queued Co' }) });
        });
    });

    describe('Delete', () => {
        it('builds the Delete mutation with typed primary-key parameters and a DeleteOptionsInput', async () => {
            const entity = loadedCustomer();
            GraphQLWire.EnqueueResponse({ DeleteCRMCustomer: { ID: 'CUST-0001' } });

            const deleted = await provider.Delete(entity, new EntityDeleteOptions(), user);

            expect(deleted).toBe(true);
            const doc = GraphQLWire.LastRequest.document;
            expect(doc).toContain('mutation DeleteCRMCustomer ($ID: String!, $options___: DeleteOptionsInput!)');
            expect(doc).toContain('DeleteCRMCustomer(ID: $ID, options___: $options___)');
            expect(GraphQLWire.LastRequest.variables).toEqual({
                ID: 'CUST-0001',
                options___: {
                    SkipEntityAIActions: false,
                    SkipEntityActions: false,
                    ReplayOnly: false,
                    IsParentEntityDelete: false,
                    SkipRecordChanges: false,
                },
            });
            expect(entity.LatestResult.Success).toBe(true);
            expect(entity.LatestResult.Type).toBe('delete');
        });

        it('passes explicit delete options through', async () => {
            const entity = loadedCustomer();
            GraphQLWire.EnqueueResponse({ DeleteCRMCustomer: { ID: 'CUST-0001' } });

            const options = new EntityDeleteOptions();
            options.SkipEntityAIActions = true;
            options.ReplayOnly = true;
            await provider.Delete(entity, options, user);

            expect(GraphQLWire.LastRequest.variables).toEqual({
                ID: 'CUST-0001',
                options___: {
                    SkipEntityAIActions: true,
                    SkipEntityActions: false,
                    ReplayOnly: true,
                    IsParentEntityDelete: false,
                    SkipRecordChanges: false,
                },
            });
        });

        it('fails when the server echoes a mismatched primary key', async () => {
            const entity = loadedCustomer();
            GraphQLWire.EnqueueResponse({ DeleteCRMCustomer: { ID: 'DIFFERENT-ID' } });

            const deleted = await provider.Delete(entity, new EntityDeleteOptions(), user);

            expect(deleted).toBe(false);
            expect(entity.LatestResult.Success).toBe(false);
            expect(entity.LatestResult.Message).toContain('Primary key value mismatch');
        });

        it('fails when the response lacks the mutation key', async () => {
            const entity = loadedCustomer();
            GraphQLWire.EnqueueResponse({ SomethingElse: {} });

            const deleted = await provider.Delete(entity, new EntityDeleteOptions(), user);

            expect(deleted).toBe(false);
            expect(entity.LatestResult.Message).toContain('Delete failed for Customers');
        });

        it('surfaces the first GraphQL error message on wire failure', async () => {
            const entity = loadedCustomer();
            GraphQLWire.EnqueueError(new FakeGraphQLResponseError('Delete blocked by dependency', 'DEPENDENCY_ERROR'));

            const deleted = await provider.Delete(entity, new EntityDeleteOptions(), user);

            expect(deleted).toBe(false);
            expect(entity.LatestResult.Success).toBe(false);
            expect(entity.LatestResult.Message).toBe('Delete blocked by dependency');
        });
    });
});
