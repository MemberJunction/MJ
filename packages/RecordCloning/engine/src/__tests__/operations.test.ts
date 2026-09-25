import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    EntityInfo,
    EntityFieldInfo,
    EntityRelationshipInfo,
    IMetadataProvider,
    UserInfo,
    RunView,
} from '@memberjunction/core';
import { RecordCloneOperationsHandler, ToPlanDetails } from '../operations';
import { ClonePlanner } from '../ClonePlanner';
import { CloneExecutor } from '../CloneExecutor';
import { GrantedCloneAuthorizations } from './helpers/cloneAuthorizations';

describe('RecordCloneOperationsHandler', () => {
    const mockUser: UserInfo = { ID: 'u-ops-1', Name: 'Ops User', Email: 'ops@test.com' } as UserInfo;
    const perms = (canCreate: boolean) => () => ({ CanCreate: canCreate, CanRead: true, CanUpdate: canCreate, CanDelete: canCreate });

    const mockChildRel: Partial<EntityRelationshipInfo> = {
        ID: 'rel-1',
        DisplayName: 'Items',
        RelatedEntity: 'ChildEntity',
        CloneConfig: { Policy: 'Deep', Locked: true },
    };

    const baseEntity = (overrides: Partial<EntityInfo>): EntityInfo =>
        ({
            PrimaryKeys: [{ Name: 'ID' } as EntityFieldInfo],
            FirstPrimaryKey: { Name: 'ID' } as EntityFieldInfo,
            Fields: [{ Name: 'ID', PrimaryKey: true } as EntityFieldInfo],
            RelatedEntities: [],
            GetUserPermisions: perms(true),
            ...overrides,
        }) as EntityInfo;

    const cloneable = baseEntity({
        ID: 'ent-ops-1',
        Name: 'ParentEntity',
        RelatedEntities: [mockChildRel as EntityRelationshipInfo],
        CloneConfig: {
            Enabled: true,
            UserEditable: 'scope',
            Presets: [{ Key: 'shallow', Label: 'Shallow copy', Options: { MaxDepth: 1 } }],
        },
    } as Partial<EntityInfo>);
    const disabled = baseEntity({ ID: 'ent-ops-2', Name: 'AuditLog', CloneConfig: { Enabled: false } } as Partial<EntityInfo>);
    const unconfigured = baseEntity({ ID: 'ent-ops-4', Name: 'Plain', CloneConfig: null } as Partial<EntityInfo>);
    const noCreate = baseEntity({ ID: 'ent-ops-3', Name: 'LockedEntity', GetUserPermisions: perms(false), CloneConfig: { Enabled: true } } as Partial<EntityInfo>);

    const entities = [cloneable, disabled, unconfigured, noCreate];
    const providerWith = (granted: boolean): IMetadataProvider =>
        ({
            Authorizations: GrantedCloneAuthorizations(granted),
            Entities: entities,
            EntityByName: (n: string) => entities.find((e) => e.Name === n) ?? null,
        }) as unknown as IMetadataProvider;

    let handler: RecordCloneOperationsHandler;
    const key = { KeyValuePairs: [{ FieldName: 'ID', Value: 'src-1' }] };

    const enginePlan = (overrides: Record<string, unknown> = {}) => ({
        PlanVersion: 1,
        Hash: 'hash-1',
        Roots: ['ParentEntity::src-1'],
        Nodes: [
            {
                Key: 'ParentEntity::src-1',
                EntityName: 'ParentEntity',
                SourceKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'src-1' }] },
                TargetKey: 'tgt-1',
                Action: 'Create',
                Reason: 'Clone record',
                Depth: 0,
                ParentKey: null,
                Via: null,
                DisplayName: 'Parent',
                FieldChanges: [{ Field: 'Config', Kind: 'json_remap', OldValue: { a: 1 }, NewValue: { a: 2 }, Reason: 'remap' }],
                Warnings: [],
                Route: 'RootSave',
            },
        ],
        Edges: [],
        Counts: { ByEntity: {}, Create: 1, Total: 1 },
        Warnings: [],
        Blocked: false,
        EffectiveOptions: {
            MaxDepth: 3, MaxRecords: 500, Subtypes: 'include', Hierarchy: 'subtree',
            SoftLinks: 'skip', EntityActions: 'suppress', AIActions: 'suppress', Embeddings: 'copy',
        },
        ...overrides,
    });

    beforeEach(() => {
        handler = new RecordCloneOperationsHandler(providerWith(true));
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Describe', () => {
        it('returns the contract shape for a cloneable entity', async () => {
            const desc = await handler.Describe({ EntityName: 'ParentEntity' }, mockUser);
            expect(desc).toEqual({
                CanClone: true,
                Presets: ['shallow'],
                UserEditable: 'scope',
                Relationships: [{ Name: 'Items', RelatedEntity: 'ChildEntity', DefaultPolicy: 'Deep', Locked: true }],
                Authorization: { Name: 'Clone Records in Custom Schemas', Granted: true },
                CanFireHooks: true,
                CanOverrideScope: true,
            });
        });

        it('lists presets written in the legacy keyed-object form instead of throwing', async () => {
            const legacy = { ...cloneable, CloneConfig: { Enabled: true, Presets: { 'deep-prompts': { Description: 'd' } } } } as unknown as EntityInfo;
            const provider = { ...providerWith(true), EntityByName: () => legacy } as unknown as IMetadataProvider;
            const desc = await new RecordCloneOperationsHandler(provider).Describe({ EntityName: 'ParentEntity' }, mockUser);
            expect(desc.Presets).toEqual(['deep-prompts']);
        });

        it('refuses an entity whose clone configuration is disabled', async () => {
            const desc = await handler.Describe({ EntityName: 'AuditLog' }, mockUser);
            expect(desc.CanClone).toBe(false);
            expect(desc.Reason).toContain('not enabled');
        });

        it('refuses an entity with no clone configuration at all', async () => {
            const desc = await handler.Describe({ EntityName: 'Plain' }, mockUser);
            expect(desc.CanClone).toBe(false);
            expect(desc.Reason).toContain('not enabled');
        });

        it('refuses when the user lacks CanCreate', async () => {
            const desc = await handler.Describe({ EntityName: 'LockedEntity' }, mockUser);
            expect(desc.CanClone).toBe(false);
            expect(desc.Reason).toContain('permission to create');
        });

        it('refuses and reports the authorization when the user lacks it', async () => {
            const desc = await new RecordCloneOperationsHandler(providerWith(false)).Describe({ EntityName: 'ParentEntity' }, mockUser);
            expect(desc.CanClone).toBe(false);
            expect(desc.Authorization).toEqual({ Name: 'Clone Records in Custom Schemas', Granted: false });
            expect(desc.CanFireHooks).toBe(false);
        });
    });

    describe('Plan', () => {
        it('maps the engine plan onto the contract with string keys and primitive values', async () => {
            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(enginePlan() as never);

            const res = await handler.Plan({ EntityName: 'ParentEntity', SourceRecordKey: key }, mockUser);

            const node = res.Plan.Nodes[0];
            expect(node.SourceKey).toBe('src-1');
            expect(node.TargetKey).toBe('tgt-1');
            expect(node.FieldChanges[0]).toEqual({ Field: 'Config', Kind: 'json_remap', OldValue: '{"a":1}', NewValue: '{"a":2}', Reason: 'remap' });
            expect(node).not.toHaveProperty('Via');
            expect(res.Plan.Hash).toBe('hash-1');
        });

        it('passes every key column to the planner (composite keys)', async () => {
            const spy = vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(enginePlan() as never);
            await handler.Plan(
                { EntityName: 'ParentEntity', SourceRecordKey: { KeyValuePairs: [{ FieldName: 'A', Value: '1' }, { FieldName: 'B', Value: '2' }] } },
                mockUser
            );
            const sent = spy.mock.calls[0][0].SourceRecordKey as { KeyValuePairs: Array<{ FieldName: string; Value: unknown }> };
            expect(sent.KeyValuePairs.map((p) => [p.FieldName, p.Value])).toEqual([['A', '1'], ['B', '2']]);
        });

        it('rejects a request without a key', async () => {
            await expect(handler.Plan({ EntityName: 'ParentEntity' }, mockUser)).rejects.toThrow('record key');
        });
    });

    describe('Execute', () => {
        it('refuses with PLAN_CHANGED when the plan moved since review', async () => {
            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(enginePlan({ Hash: 'hash-current' }) as never);
            const exec = vi.spyOn(CloneExecutor.prototype, 'Execute');

            const res = await handler.Execute({ EntityName: 'ParentEntity', SourceRecordKey: key, ExpectedPlanHash: 'hash-reviewed' }, mockUser);

            expect(res.Success).toBe(false);
            expect(res.ResultCode).toBe('PLAN_CHANGED');
            expect(res.Plan?.Hash).toBe('hash-current');
            expect(exec).not.toHaveBeenCalled();
        });

        it('returns the plan and writes nothing for a dry run', async () => {
            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(enginePlan({ Hash: 'hash-current' }) as never);
            const exec = vi.spyOn(CloneExecutor.prototype, 'Execute');

            const res = await handler.Execute({ EntityName: 'ParentEntity', SourceRecordKey: key, Options: { DryRun: true } }, mockUser);

            expect(exec).not.toHaveBeenCalled();
            expect(res.Success).toBe(true);
            expect(res.Created).toEqual([]);
            expect(res.CloneLogID).toBeNull();
            expect(res.Plan?.Hash).toBe('hash-current');
        });

        it('still refuses a blocked plan on a dry run', async () => {
            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(
                enginePlan({ Blocked: true, Warnings: [{ Code: 'CAP_EXCEEDED', Severity: 'Error', Message: 'too many' }] }) as never
            );
            const res = await handler.Execute({ EntityName: 'ParentEntity', SourceRecordKey: key, Options: { DryRun: true } }, mockUser);
            expect(res.ResultCode).toBe('BLOCKED');
        });

        it('refuses a blocked plan with FORBIDDEN when an authorization caused it', async () => {
            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(
                enginePlan({ Blocked: true, Warnings: [{ Code: 'FORBIDDEN', Severity: 'Error', Message: 'needs auth' }] }) as never
            );
            const res = await handler.Execute({ EntityName: 'ParentEntity', SourceRecordKey: key }, mockUser);
            expect(res.ResultCode).toBe('FORBIDDEN');
            expect(res.ErrorMessage).toContain('needs auth');
        });

        it('reports FORBIDDEN, not PLAN_CHANGED, when a now-blocked plan also has a new hash', async () => {
            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(
                enginePlan({ Hash: '', Blocked: true, Warnings: [{ Code: 'FORBIDDEN', Severity: 'Error', Message: 'needs auth' }] }) as never
            );
            const res = await handler.Execute({ EntityName: 'ParentEntity', SourceRecordKey: key, ExpectedPlanHash: 'hash-reviewed' }, mockUser);
            expect(res.ResultCode).toBe('FORBIDDEN');
        });

        it('refuses other blocked plans with BLOCKED', async () => {
            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(
                enginePlan({ Blocked: true, Warnings: [{ Code: 'CAP_EXCEEDED', Severity: 'Error', Message: 'too many' }] }) as never
            );
            const res = await handler.Execute({ EntityName: 'ParentEntity', SourceRecordKey: key }, mockUser);
            expect(res.ResultCode).toBe('BLOCKED');
        });

        it('returns EXECUTION_ERROR for an unknown entity', async () => {
            const res = await handler.Execute({ EntityName: 'Nope', SourceRecordKey: key }, mockUser);
            expect(res.ResultCode).toBe('EXECUTION_ERROR');
            expect(res.ErrorMessage).toContain('not found');
        });

        it('serializes engine keys to record-id strings on success', async () => {
            vi.spyOn(ClonePlanner.prototype, 'Plan').mockResolvedValue(enginePlan() as never);
            vi.spyOn(CloneExecutor.prototype, 'Execute').mockResolvedValue({
                Success: true,
                ResultCode: 'SUCCESS',
                CloneLogID: 'log-1',
                Roots: [{ EntityName: 'ParentEntity', SourceKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'src-1' }] }, TargetKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'tgt-new-1' }] } }],
                Created: [{ EntityName: 'ParentEntity', SourceKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'src-1' }] }, TargetKey: { KeyValuePairs: [{ FieldName: 'ID', Value: 'tgt-new-1' }] }, Depth: 0 }],
                Skipped: [],
                Warnings: [],
            } as never);

            const res = await handler.Execute({ EntityName: 'ParentEntity', SourceRecordKey: key, ExpectedPlanHash: 'hash-1' }, mockUser);

            expect(res).toMatchObject({ Success: true, ResultCode: 'SUCCESS', CloneLogID: 'log-1' });
            expect(res.Roots[0]).toEqual({ EntityName: 'ParentEntity', SourceKey: 'src-1', TargetKey: 'tgt-new-1', Depth: undefined });
            expect(res.Created[0].TargetKey).toBe('tgt-new-1');
            expect(res).not.toHaveProperty('RootTargetKey');
        });
    });

    describe('GetLineage', () => {
        const links = (params: unknown) => {
            const filter = (params as { ExtraFilter?: string }).ExtraFilter || '';
            if (filter.startsWith("SourceEntityID")) {
                return { Success: true, Results: [{ TargetRecordID: 'ancestor-rec-1', TargetEntityID: 'ent-ops-1', __mj_CreatedAt: '2026-09-01T00:00:00Z', Metadata: '{"CloneLogID":"log-a"}' }] };
            }
            if (filter.startsWith("TargetEntityID")) {
                return { Success: true, Results: [{ SourceRecordID: 'clone-rec-1', SourceEntityID: 'ent-ops-1', __mj_CreatedAt: '2026-09-10T00:00:00Z' }] };
            }
            return { Success: true, Results: [] };
        };

        it('reads ancestors and clones from MJ: Record Links', async () => {
            const spy = vi.spyOn(RunView.prototype, 'RunView').mockImplementation(async (p) => links(p) as never);

            const lineage = await handler.GetLineage({ EntityName: 'ParentEntity', Key: { KeyValuePairs: [{ FieldName: 'ID', Value: 'rec-mid' }] }, Direction: 'both' }, mockUser);

            expect(lineage.Ancestors).toEqual([{ RecordID: 'ancestor-rec-1', EntityName: 'ParentEntity', ClonedAt: '2026-09-01T00:00:00Z', CloneLogID: 'log-a' }]);
            expect(lineage.Clones[0].RecordID).toBe('clone-rec-1');
            expect(lineage.TotalClones).toBe(1);
            expect(spy.mock.calls.every(([p]) => (p as { EntityName: string }).EntityName === 'MJ: Record Links')).toBe(true);
        });

        it('escapes the record id in the filter', async () => {
            const spy = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({ Success: true, Results: [] } as never);

            await handler.GetLineage({ EntityName: 'ParentEntity', Key: { KeyValuePairs: [{ FieldName: 'ID', Value: "x' OR 1=1 --" }] }, Direction: 'up' }, mockUser);

            const filter = (spy.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter;
            expect(filter).toContain("SourceRecordID = 'x'' OR 1=1 --'");
        });

        it('only queries the requested direction', async () => {
            const spy = vi.spyOn(RunView.prototype, 'RunView').mockResolvedValue({ Success: true, Results: [] } as never);
            await handler.GetLineage({ EntityName: 'ParentEntity', Key: key, Direction: 'down' }, mockUser);
            expect(spy).toHaveBeenCalledTimes(1);
            expect((spy.mock.calls[0][0] as { ExtraFilter: string }).ExtraFilter.startsWith('TargetEntityID')).toBe(true);
        });
    });
});

describe('ToPlanDetails', () => {
    it('never puts an encrypted value on the wire', () => {
        const details = ToPlanDetails({
            PlanVersion: 1,
            Hash: 'h',
            Roots: ['n1'],
            Nodes: [
                {
                    Key: 'n1',
                    EntityName: 'MJ: Company Integrations',
                    SourceKey: 'ci-1',
                    TargetKey: 'ci-2',
                    Action: 'Create',
                    Reason: '',
                    Depth: 0,
                    ParentKey: null,
                    Via: null,
                    DisplayName: 'HubSpot',
                    FieldChanges: [
                        { Field: 'APIKey', Kind: 'Copy', OldValue: 'sk-live', NewValue: 'sk-live', Reason: '', Sensitive: true },
                        { Field: 'Name', Kind: 'Copy', OldValue: 'HubSpot', NewValue: 'HubSpot', Reason: '' },
                    ],
                    Warnings: [],
                    Route: 'RootSave',
                },
            ],
            Edges: [],
            Counts: { ByEntity: {}, Create: 1, Total: 1 },
            Warnings: [],
            Blocked: false,
            EffectiveOptions: {} as never,
        });
        expect(JSON.stringify(details)).not.toContain('sk-live');
        expect(details.Nodes[0].FieldChanges[1].NewValue).toBe('HubSpot');
    });
});
