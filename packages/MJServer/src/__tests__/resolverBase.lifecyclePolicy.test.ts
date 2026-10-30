import 'reflect-metadata';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    DatabaseProviderBase,
    EntityInfo,
    EntityLifecyclePolicyEngine,
    ProviderType,
    ServerOperationScopeManager,
    UserInfo,
} from '@memberjunction/core';
import type { PubSubEngine } from 'type-graphql';
import { ResolverBase } from '../generic/ResolverBase.js';
import type { UserPayload } from '../types.js';

class LifecycleResolverProbe extends ResolverBase {
    public CheckMustLoadTruth(
        entityInfo: EntityInfo,
        oldValues: Array<{ Key: string; Value: string | number | null }>,
        user: UserInfo,
    ): boolean {
        return this.MustLoadTruthFromDatabase(
            entityInfo,
            { OldValues___: oldValues },
            false,
            false,
            user,
        );
    }

    public async InvokeCreateRecord(
        entityName: string,
        input: Record<string, string | number | null>,
        provider: DatabaseProviderBase,
        userPayload: UserPayload,
    ): Promise<object | null> {
        const stubPubSub = {
            publish: () => Promise.resolve(),
            subscribe: () => Promise.resolve(1),
            unsubscribe: () => {},
        } as object as PubSubEngine;
        return (await this.CreateRecord(entityName, input, provider, userPayload, stubPubSub)) as object | null;
    }
}

class ProbeEntity extends BaseEntity {
    public override CheckPermissions(): boolean {
        return true;
    }
}

function buildProbeEntityInfo(options?: { configurationJson?: string | null }): EntityInfo {
    const entityId = '77777777-1111-2222-3333-444444444444';
    return new EntityInfo({
        ID: entityId,
        Name: 'Test Lifecycle Invoices',
        BaseTable: 'LifecycleInvoice',
        BaseView: 'vwLifecycleInvoices',
        SchemaName: 'billing',
        TrackRecordChanges: false,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        Configuration: options?.configurationJson ?? null,
        EntityFields: [
            {
                ID: 'inv-id',
                EntityID: entityId,
                Name: 'ID',
                CodeName: 'ID',
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                AllowsNull: false,
                Sequence: 1,
            },
            {
                ID: 'inv-status',
                EntityID: entityId,
                Name: 'Status',
                CodeName: 'Status',
                Type: 'varchar',
                Length: 50,
                AllowsNull: false,
                AllowUpdateAPI: true,
                Sequence: 2,
            },
            {
                ID: 'inv-total',
                EntityID: entityId,
                Name: 'TotalAmount',
                CodeName: 'TotalAmount',
                Type: 'decimal',
                AllowsNull: false,
                AllowUpdateAPI: true,
                Sequence: 3,
            },
        ],
    });
}

describe('ResolverBase lifecycle policy truth-loading & ClientCrudBoundary (3.1)', () => {
    const probe = new LifecycleResolverProbe();
    const user = new UserInfo(null, {
        ID: 'u-res-1',
        Name: 'Resolver Tester',
        Email: 'resolver@example.com',
        IsActive: true,
        UserRoles: [],
    });

    beforeEach(() => {
        EntityLifecyclePolicyEngine.Instance.ClearProgrammaticPolicies();
    });

    afterEach(() => {
        EntityLifecyclePolicyEngine.Instance.ClearProgrammaticPolicies();
    });

    it('forces MustLoadTruthFromDatabase = true for lifecycle-governed entities even when TrackRecordChanges === false and client supplies complete OldValues___', () => {
        const completeOldValues = [
            { Key: 'ID', Value: 'inv-100' },
            { Key: 'Status', Value: 'Draft' },
            { Key: 'TotalAmount', Value: 500 },
        ];

        // Control: plain non-tracked entity with complete OldValues___ skips DB reload
        const plainEntityInfo = buildProbeEntityInfo();
        expect(probe.CheckMustLoadTruth(plainEntityInfo, completeOldValues, user)).toBe(false);

        // Governed via Configuration.Lifecycle -> MUST load truth from DB so client cannot spoof stored Status!
        const governedByConfig = buildProbeEntityInfo({
            configurationJson: JSON.stringify({
                Lifecycle: {
                    stateMachine: {
                        statusField: 'Status',
                        initialStates: ['Draft'],
                        transitions: [{ from: 'Draft', to: 'Issued' }],
                        terminalStates: ['Paid'],
                    },
                },
            }),
        });
        expect(probe.CheckMustLoadTruth(governedByConfig, completeOldValues, user)).toBe(true);

        // Governed programmatically -> MUST load truth from DB
        EntityLifecyclePolicyEngine.Instance.RegisterPolicy('Test Lifecycle Invoices', {
            writeAuthority: { mode: 'ServerOperationOnly' },
        });
        expect(probe.CheckMustLoadTruth(plainEntityInfo, completeOldValues, user)).toBe(true);
    });

    it('blocks direct client CreateRecord against ServerOperationOnly entities even when an outer server operation scope is active', async () => {
        const governedInfo = buildProbeEntityInfo({
            configurationJson: JSON.stringify({
                Lifecycle: {
                    writeAuthority: {
                        mode: 'ServerOperationOnly',
                        allowedOperations: ['Billing.IssueInvoice'],
                    },
                },
            }),
        });

        const fakeProvider = {
            ProviderType: ProviderType.Database,
            Entities: [governedInfo],
            SupportsEntityTransactions: false,
            GetEntityObject: async () => {
                const ent = new ProbeEntity(governedInfo, fakeProvider as object as DatabaseProviderBase);
                ent.ContextCurrentUser = user;
                return ent;
            },
        } as object as DatabaseProviderBase;

        const payload: UserPayload = {
            userRecord: user,
            email: user.Email,
            sessionId: 'sess-1',
        };

        await ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: 'Billing.IssueInvoice', source: 'ServerEngine' },
            async () => {
                await expect(
                    probe.InvokeCreateRecord(
                        'Test Lifecycle Invoices',
                        { ID: 'inv-200', Status: 'Draft', TotalAmount: 120 },
                        fakeProvider,
                        payload,
                    ),
                ).rejects.toThrow(/requires an authorized server operation/);
            },
        );
    });
});
