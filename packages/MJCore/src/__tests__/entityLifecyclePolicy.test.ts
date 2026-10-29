import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RegisterClass, ValidationResult } from '@memberjunction/global';
import { BaseEntity } from '../generic/baseEntity';
import { BaseRemotableOperation, type RemoteOpServerContext } from '../generic/baseRemotableOperation';
import { DispatchRemoteOperationInProcess } from '../generic/remoteOperationDispatch';
import { SAVE_ENTITY_GRAPH_OPERATION_KEY } from '../generic/saveEntityGraphOperation';
import { EntityInfo } from '../generic/entityInfo';
import {
    EntityLifecyclePolicyEngine,
    ServerOperationScopeManager,
    StackServerOperationScopeTracker,
    type IEntityLifecyclePolicy,
} from '../generic/entityLifecyclePolicy';
import {
    EntityDeleteOptions,
    EntitySaveOptions,
    ProviderType,
    type IEntityDataProvider,
    type IMetadataProvider,
} from '../generic/interfaces';
import { UserInfo } from '../generic/securityInfo';
import { TestMetadataProvider } from './mocks/TestMetadataProvider';

// Import SaveEntityGraphOperation for its @RegisterClass side effect
import '../generic/saveEntityGraphOperation';

interface MockJournalRecordData {
    ID: string;
    EntryNumber: string;
    Status: string;
    Amount: number;
    ApprovedByUserID: string | null;
    HoldReason: string | null;
    Notes: string | null;
}

class TestJournalEntryEntity extends BaseEntity {
    public get ID(): string {
        return this.GetFieldByName('ID')?.Value as string;
    }
    public set ID(val: string) {
        const f = this.GetFieldByName('ID');
        if (f) f.Value = val;
    }

    public get EntryNumber(): string {
        return this.GetFieldByName('EntryNumber')?.Value as string;
    }
    public set EntryNumber(val: string) {
        const f = this.GetFieldByName('EntryNumber');
        if (f) f.Value = val;
    }

    public get Status(): string {
        return this.GetFieldByName('Status')?.Value as string;
    }
    public set Status(val: string) {
        const f = this.GetFieldByName('Status');
        if (f) f.Value = val;
    }

    public get Amount(): number {
        return this.GetFieldByName('Amount')?.Value as number;
    }
    public set Amount(val: number) {
        const f = this.GetFieldByName('Amount');
        if (f) f.Value = val;
    }

    public get ApprovedByUserID(): string | null {
        return (this.GetFieldByName('ApprovedByUserID')?.Value as string | null) ?? null;
    }
    public set ApprovedByUserID(val: string | null) {
        const f = this.GetFieldByName('ApprovedByUserID');
        if (f) f.Value = val;
    }

    public get HoldReason(): string | null {
        return (this.GetFieldByName('HoldReason')?.Value as string | null) ?? null;
    }
    public set HoldReason(val: string | null) {
        const f = this.GetFieldByName('HoldReason');
        if (f) f.Value = val;
    }

    public get Notes(): string | null {
        return (this.GetFieldByName('Notes')?.Value as string | null) ?? null;
    }
    public set Notes(val: string | null) {
        const f = this.GetFieldByName('Notes');
        if (f) f.Value = val;
    }

    public override CheckPermissions(): boolean {
        return true;
    }
}

class LifecycleMockDataProvider extends TestMetadataProvider implements IEntityDataProvider {
    private readonly _entities: EntityInfo[];
    private readonly _providerTypeValue: ProviderType;
    public readonly StoredRows = new Map<string, MockJournalRecordData>();

    constructor(entities: EntityInfo[], providerTypeValue: ProviderType = ProviderType.Database) {
        super();
        this._entities = entities;
        this._providerTypeValue = providerTypeValue;
    }

    public override get ProviderType(): ProviderType {
        return this._providerTypeValue;
    }

    public override get Entities(): EntityInfo[] {
        return this._entities;
    }

    public override get SupportsEntityTransactions(): boolean {
        return this._providerTypeValue === ProviderType.Database;
    }

    public override async GetEntityObject<T extends BaseEntity = BaseEntity>(
        entityName: string,
        contextUser?: UserInfo,
    ): Promise<T> {
        const info = this._entities.find((e) => e.Name.toLowerCase() === entityName.toLowerCase());
        if (!info) {
            throw new Error(`Entity '${entityName}' not found`);
        }
        const instance = new TestJournalEntryEntity(info, this);
        if (contextUser) {
            instance.ContextCurrentUser = contextUser;
        }
        return instance as object as T;
    }

    public async Load(
        entity: BaseEntity,
        compositeKey: { KeyValuePairs: Array<{ Value: string }> },
    ): Promise<Record<string, string | number | null> | null> {
        const id = String(compositeKey.KeyValuePairs[0]?.Value ?? '');
        const stored = this.StoredRows.get(id);
        if (!stored) {
            return null;
        }
        return { ...stored };
    }

    public async Save(
        entity: BaseEntity,
        _user: UserInfo,
        _options: EntitySaveOptions,
    ): Promise<Record<string, string | number | boolean | null>> {
        const all = entity.GetAll() as Record<string, string | number | boolean | null>;
        const id = String(all.ID || 'generated-id-1');
        const savedRow: MockJournalRecordData = {
            ID: id,
            EntryNumber: String(all.EntryNumber ?? 'JE-0001'),
            Status: String(all.Status ?? 'Draft'),
            Amount: Number(all.Amount ?? 0),
            ApprovedByUserID: (all.ApprovedByUserID as string | null) ?? null,
            HoldReason: (all.HoldReason as string | null) ?? null,
            Notes: (all.Notes as string | null) ?? null,
        };
        this.StoredRows.set(id, savedRow);
        return { ...savedRow };
    }

    public async Delete(
        entity: BaseEntity,
        _options: EntityDeleteOptions,
        _user: UserInfo,
    ): Promise<boolean> {
        const id = String(entity.GetFieldByName('ID')?.Value ?? '');
        this.StoredRows.delete(id);
        return true;
    }

    public BeginSaveExecute(): boolean {
        return true;
    }

    public BeginDeleteExecute(): boolean {
        return true;
    }

    public RefreshIfNeeded(): Promise<void> {
        return Promise.resolve();
    }
}

const POST_JOURNAL_OP_KEY = 'Test.Lifecycle.PostJournalEntry';

interface PostJournalOpInput {
    JournalEntryID: string;
    ApprovedByUserID: string;
}

interface PostJournalOpOutput {
    Posted: boolean;
    Status: string;
}

@RegisterClass(BaseRemotableOperation, POST_JOURNAL_OP_KEY)
class PostJournalEntryTestOperation extends BaseRemotableOperation<PostJournalOpInput, PostJournalOpOutput> {
    public readonly OperationKey = POST_JOURNAL_OP_KEY;

    protected override async InternalExecute(
        input: PostJournalOpInput,
        provider: IMetadataProvider,
        user: UserInfo,
        _context: RemoteOpServerContext,
    ): Promise<PostJournalOpOutput> {
        const entry = await provider.GetEntityObject<TestJournalEntryEntity>('Test Journal Entries', user);
        if (!entry.ID) {
            const dataProvider = provider as object as LifecycleMockDataProvider;
            const row = dataProvider.StoredRows.get(input.JournalEntryID);
            if (!row) {
                throw new Error(`Row ${input.JournalEntryID} missing`);
            }
            await entry.LoadFromData(row);
        }
        entry.ApprovedByUserID = input.ApprovedByUserID;
        entry.Status = 'Posted';
        const ok = await entry.Save();
        return {
            Posted: ok,
            Status: entry.Status,
        };
    }
}

function buildJournalEntityInfo(options?: {
    settings?: Array<{ Name: string; Value: string }>;
    configurationJson?: string | null;
}): EntityInfo {
    const id = '11111111-2222-3333-4444-555555555555';
    return new EntityInfo({
        ID: id,
        Name: 'Test Journal Entries',
        BaseTable: 'JournalEntry',
        BaseView: 'vwJournalEntries',
        SchemaName: 'acct',
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        TrackRecordChanges: false,
        Configuration: options?.configurationJson ?? null,
        EntitySettings: (options?.settings ?? []).map((s, idx) => ({
            ID: `00000000-0000-0000-0000-00000000000${idx + 1}`,
            EntityID: id,
            Name: s.Name,
            Value: s.Value,
        })),
        EntityFields: [
            {
                ID: 'f-id',
                EntityID: id,
                Name: 'ID',
                Type: 'uniqueidentifier',
                IsPrimaryKey: true,
                AllowsNull: false,
                Sequence: 1,
            },
            {
                ID: 'f-num',
                EntityID: id,
                Name: 'EntryNumber',
                Type: 'nvarchar',
                Length: 100,
                AllowsNull: false,
                AllowUpdateAPI: true,
                Sequence: 2,
            },
            {
                ID: 'f-status',
                EntityID: id,
                Name: 'Status',
                Type: 'nvarchar',
                Length: 100,
                AllowsNull: false,
                AllowUpdateAPI: true,
                Sequence: 3,
            },
            {
                ID: 'f-amt',
                EntityID: id,
                Name: 'Amount',
                Type: 'decimal',
                AllowsNull: false,
                AllowUpdateAPI: true,
                Sequence: 4,
            },
            {
                ID: 'f-app',
                EntityID: id,
                Name: 'ApprovedByUserID',
                Type: 'uniqueidentifier',
                AllowsNull: true,
                AllowUpdateAPI: true,
                Sequence: 5,
            },
            {
                ID: 'f-hold',
                EntityID: id,
                Name: 'HoldReason',
                Type: 'nvarchar',
                Length: 400,
                AllowsNull: true,
                AllowUpdateAPI: true,
                Sequence: 6,
            },
            {
                ID: 'f-notes',
                EntityID: id,
                Name: 'Notes',
                Type: 'nvarchar',
                Length: 1000,
                AllowsNull: true,
                AllowUpdateAPI: true,
                Sequence: 7,
            },
        ],
    });
}

function buildTestUser(roles: Array<{ Role: string; RoleID: string }> = []): UserInfo {
    return new UserInfo(null, {
        ID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        Name: 'Controller User',
        Email: 'controller@example.com',
        IsActive: true,
        UserRoles: roles.map((r) => ({
            UserID: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            Role: r.Role,
            RoleID: r.RoleID,
        })),
    });
}

describe('EntityLifecyclePolicyEngine & ServerOperationScopeManager (3.1)', () => {
    beforeEach(() => {
        EntityLifecyclePolicyEngine.Instance.ClearProgrammaticPolicies();
        ServerOperationScopeManager.Instance.SetTracker(new StackServerOperationScopeTracker());
    });

    afterEach(() => {
        EntityLifecyclePolicyEngine.Instance.ClearProgrammaticPolicies();
    });

    it('resolves declarative policies from both EntityInfo.Settings and IEntityConfiguration.Lifecycle', () => {
        const policy: IEntityLifecyclePolicy = {
            stateMachine: {
                statusField: 'Status',
                initialStates: ['Draft'],
                transitions: [{ from: 'Draft', to: 'Submitted' }],
                terminalStates: ['Posted'],
            },
            writeAuthority: {
                mode: 'Standard',
            },
        };

        const viaSetting = buildJournalEntityInfo({
            settings: [{ Name: 'LifecyclePolicy', Value: JSON.stringify(policy) }],
        });
        expect(viaSetting.LifecyclePolicy?.stateMachine?.initialStates).toEqual(['Draft']);
        expect(EntityLifecyclePolicyEngine.Instance.RequiresStoredTruthOnUpdate(viaSetting)).toBe(true);

        const viaConfiguration = buildJournalEntityInfo({
            configurationJson: JSON.stringify({ Lifecycle: policy }),
        });
        expect(viaConfiguration.LifecyclePolicy?.stateMachine?.terminalStates).toEqual(['Posted']);

        const plainEntity = buildJournalEntityInfo();
        expect(plainEntity.LifecyclePolicy).toBeNull();
        expect(EntityLifecyclePolicyEngine.Instance.RequiresStoredTruthOnUpdate(plainEntity)).toBe(false);
    });

    it('enforces initialStates on new records and directed transitions + role/field guards on saved records', async () => {
        const controllerRoleId = '99999999-8888-7777-6666-555555555555';
        const entityInfo = buildJournalEntityInfo({
            configurationJson: JSON.stringify({
                Lifecycle: {
                    stateMachine: {
                        statusField: 'Status',
                        initialStates: ['Draft'],
                        transitions: [
                            { from: 'Draft', to: 'OnHold', requiredFieldsOnEnter: ['HoldReason'] },
                            { from: 'OnHold', to: 'Draft', clearedFieldsOnTransition: ['HoldReason'] },
                            { from: 'Draft', to: 'Submitted' },
                            {
                                from: 'Submitted',
                                to: 'Posted',
                                allowedRoles: ['Finance Controller'],
                                requiredFieldsOnEnter: ['ApprovedByUserID'],
                            },
                        ],
                        terminalStates: ['Posted'],
                    },
                },
            }),
        });
        const clerkUser = buildTestUser([{ Role: 'Accounting Clerk', RoleID: '12121212-1212-1212-1212-121212121212' }]);
        const controllerUser = buildTestUser([{ Role: 'Finance Controller', RoleID: controllerRoleId }]);
        const provider = new LifecycleMockDataProvider([entityInfo]);

        // 1. Rejects create when Status is not in initialStates
        const record = await provider.GetEntityObject<TestJournalEntryEntity>('Test Journal Entries', clerkUser);
        record.NewRecord();
        record.ID = 'je-1';
        record.EntryNumber = 'JE-0001';
        record.Status = 'Posted';
        record.Amount = 250;
        const badCreateVal = record.Validate();
        expect(badCreateVal.Success).toBe(false);
        expect(badCreateVal.Errors.some((e) => e.Source === 'Status' && e.Message.includes('Draft'))).toBe(true);

        // 2. Succeeds when Status is 'Draft'
        record.Status = 'Draft';
        expect(record.Validate().Success).toBe(true);
        expect(await record.Save()).toBe(true);

        // 3. Rejects unconfigured edge Draft -> Posted
        record.Status = 'Posted';
        const skipEdgeVal = record.Validate();
        expect(skipEdgeVal.Success).toBe(false);
        expect(skipEdgeVal.Errors.some((e) => e.Message.includes("'Draft' -> 'Posted'"))).toBe(true);

        // 4. Enforces requiredFieldsOnEnter (Draft -> OnHold requires HoldReason)
        record.Status = 'OnHold';
        record.HoldReason = null;
        expect(record.Validate().Success).toBe(false);
        record.HoldReason = 'Awaiting vendor invoice';
        expect(record.Validate().Success).toBe(true);
        expect(await record.Save()).toBe(true);

        // 5. Enforces clearedFieldsOnTransition (OnHold -> Draft requires HoldReason cleared)
        record.Status = 'Draft';
        expect(record.Validate().Success).toBe(false);
        record.HoldReason = null;
        expect(record.Validate().Success).toBe(true);
        expect(await record.Save()).toBe(true);

        // 6. Move to Submitted, then test role guard & requiredFieldsOnEnter on Submitted -> Posted
        record.Status = 'Submitted';
        expect(await record.Save()).toBe(true);

        record.Status = 'Posted';
        record.ApprovedByUserID = 'approver-1';
        const clerkPostAttempt = record.Validate();
        expect(clerkPostAttempt.Success).toBe(false);
        expect(clerkPostAttempt.Errors.some((e) => e.Message.includes('Finance Controller'))).toBe(true);

        // Controller satisfies role gate
        record.ContextCurrentUser = controllerUser;
        expect(record.Validate().Success).toBe(true);
        expect(await record.Save()).toBe(true);

        // 7. Terminal state 'Posted' blocks outbound transitions, field edits, and Delete()
        record.Status = 'Draft';
        expect(record.Validate().Success).toBe(false);

        await record.LoadFromData({
            ID: 'je-1',
            EntryNumber: 'JE-0001',
            Status: 'Posted',
            Amount: 250,
            ApprovedByUserID: 'approver-1',
            HoldReason: null,
            Notes: null,
        });
        record.Amount = 999;
        const terminalEditVal = record.Validate();
        expect(terminalEditVal.Success).toBe(false);
        expect(terminalEditVal.Errors.some((e) => e.Source === 'Amount' && e.Message.includes('terminal state'))).toBe(
            true,
        );

        await record.LoadFromData({
            ID: 'je-1',
            EntryNumber: 'JE-0001',
            Status: 'Posted',
            Amount: 250,
            ApprovedByUserID: 'approver-1',
            HoldReason: null,
            Notes: null,
        });
        expect(await record.Delete()).toBe(false);
        expect(record.LatestResult?.Message).toContain("terminal state 'Posted'");
    });

    it('enforces immutableAfterCreateFields, editableFieldsByState, frozenFieldsByState, and fieldFreezeExemptOperations', async () => {
        const entityInfo = buildJournalEntityInfo();
        EntityLifecyclePolicyEngine.Instance.RegisterPolicy('Test Journal Entries', {
            stateMachine: {
                statusField: 'Status',
                initialStates: ['Draft'],
                transitions: [{ from: 'Draft', to: 'Submitted' }],
                immutableAfterCreateFields: ['EntryNumber'],
                editableFieldsByState: {
                    Submitted: ['Notes'],
                },
                frozenFieldsByState: {
                    Draft: ['ApprovedByUserID'],
                },
                fieldFreezeExemptOperations: ['Accounting.AdminAmend'],
            },
        });

        const user = buildTestUser();
        const provider = new LifecycleMockDataProvider([entityInfo]);
        const entry = await provider.GetEntityObject<TestJournalEntryEntity>('Test Journal Entries', user);
        await entry.LoadFromData({
            ID: 'je-2',
            EntryNumber: 'JE-2026-0002',
            Status: 'Draft',
            Amount: 100,
            ApprovedByUserID: null,
            HoldReason: null,
            Notes: null,
        });

        // EntryNumber is immutable after create
        entry.EntryNumber = 'JE-TAMPERED';
        const immutVal = entry.Validate();
        expect(immutVal.Success).toBe(false);
        expect(immutVal.Errors.some((e) => e.Source === 'EntryNumber')).toBe(true);

        // ApprovedByUserID is frozen in Draft
        entry.EntryNumber = 'JE-2026-0002';
        entry.ApprovedByUserID = 'self-approve';
        const draftFrozenVal = entry.Validate();
        expect(draftFrozenVal.Success).toBe(false);
        expect(draftFrozenVal.Errors.some((e) => e.Source === 'ApprovedByUserID')).toBe(true);

        // Transition to Submitted, where only Notes (plus Status) is editable
        entry.ApprovedByUserID = null;
        entry.Status = 'Submitted';
        expect(await entry.Save()).toBe(true);

        entry.Notes = 'Updated reviewer note';
        expect(entry.Validate().Success).toBe(true);

        entry.Amount = 500;
        const submittedFreezeVal = entry.Validate();
        expect(submittedFreezeVal.Success).toBe(false);
        expect(submittedFreezeVal.Errors.some((e) => e.Source === 'Amount')).toBe(true);

        // Exempt server operation may amend frozen field
        const exemptVal = new ValidationResult();
        exemptVal.Success = true;
        ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: 'Accounting.AdminAmend', source: 'ServerEngine' },
            () => {
                EntityLifecyclePolicyEngine.Instance.ValidateLifecycleOnEntity(entry, user, exemptVal);
            },
        );
        expect(exemptVal.Success).toBe(true);
    });

    it("enforces WriteAuthority: 'AppendOnly' (permits Create, blocks Update and Delete)", async () => {
        const entityInfo = buildJournalEntityInfo({
            settings: [
                {
                    Name: 'WriteAuthorityPolicy',
                    Value: JSON.stringify({ mode: 'AppendOnly' }),
                },
            ],
        });
        const user = buildTestUser();
        const provider = new LifecycleMockDataProvider([entityInfo]);
        const logEntry = await provider.GetEntityObject<TestJournalEntryEntity>('Test Journal Entries', user);
        logEntry.NewRecord();
        logEntry.ID = 'audit-1';
        logEntry.EntryNumber = 'AUD-1';
        logEntry.Status = 'Recorded';
        logEntry.Amount = 42;

        // Initial Create succeeds
        expect(await logEntry.Save()).toBe(true);

        // Subsequent Update fails both Validate() and Save()
        logEntry.Amount = 99;
        expect(logEntry.Validate().Success).toBe(false);
        expect(await logEntry.Save()).toBe(false);
        expect(logEntry.LatestResult?.Message).toContain('append-only');

        // Delete is refused
        expect(await logEntry.Delete()).toBe(false);
        expect(logEntry.LatestResult?.Message).toContain('append-only');
    });

    it("enforces WriteAuthority: 'ServerOperationOnly' across direct Save, ClientCrudBoundary, SaveEntityGraphOperation, and domain BaseRemotableOperation", async () => {
        const entityInfo = buildJournalEntityInfo({
            configurationJson: JSON.stringify({
                Lifecycle: {
                    writeAuthority: {
                        mode: 'ServerOperationOnly',
                        perOperationMode: {
                            Create: 'Standard',
                        },
                        allowedOperations: [POST_JOURNAL_OP_KEY],
                    },
                },
            }),
        });
        const user = buildTestUser();
        const serverProvider = new LifecycleMockDataProvider([entityInfo], ProviderType.Database);

        // Create is overridden to 'Standard', so initial draft creation succeeds
        const draft = await serverProvider.GetEntityObject<TestJournalEntryEntity>('Test Journal Entries', user);
        draft.NewRecord();
        draft.ID = 'je-srv-1';
        draft.EntryNumber = 'JE-SRV-001';
        draft.Status = 'Draft';
        draft.Amount = 750;
        expect(await draft.Save()).toBe(true);

        // 1. Direct unscoped Update is refused
        draft.Status = 'Posted';
        expect(await draft.Save()).toBe(false);
        expect(draft.LatestResult?.Message).toContain('requires an authorized server operation');

        // 2. Direct unscoped Delete is refused
        expect(await draft.Delete()).toBe(false);
        expect(draft.LatestResult?.Message).toContain('requires an authorized server operation');

        // 3. Generic MJ.SaveEntityGraph does NOT grant ServerOperationOnly authority (GrantsServerWriteAuthority === false)
        const graphBypassAttempt = await DispatchRemoteOperationInProcess<
            {
                EntityName: string;
                Fields: Record<string, string | number | null>;
                Companions: [];
                IsExistingRecord: boolean;
            },
            { Success: boolean; ErrorMessage?: string }
        >(
            SAVE_ENTITY_GRAPH_OPERATION_KEY,
            {
                EntityName: 'Test Journal Entries',
                Fields: {
                    ID: 'je-srv-1',
                    EntryNumber: 'JE-SRV-001',
                    Status: 'Posted',
                    Amount: 750,
                    ApprovedByUserID: 'hacker',
                    HoldReason: null,
                    Notes: null,
                },
                Companions: [],
                IsExistingRecord: true,
            },
            { user },
            serverProvider,
            user,
        );
        expect(graphBypassAttempt.Success).toBe(true);
        expect(graphBypassAttempt.Output?.Success).toBe(false);
        expect(graphBypassAttempt.Output?.ErrorMessage).toContain('requires an authorized server operation');

        // 4. Even if an outer server authority frame is active, RunInClientCrudBoundary masks it
        await ServerOperationScopeManager.Instance.RunWithAuthority(
            { operationKey: POST_JOURNAL_OP_KEY, source: 'ServerEngine' },
            async () => {
                await ServerOperationScopeManager.Instance.RunInClientCrudBoundary(async () => {
                    const clientEntity = await serverProvider.GetEntityObject<TestJournalEntryEntity>(
                        'Test Journal Entries',
                        user,
                    );
                    await clientEntity.LoadFromData(serverProvider.StoredRows.get('je-srv-1')!);
                    clientEntity.Status = 'Posted';
                    expect(await clientEntity.Save()).toBe(false);
                });
            },
        );

        // 5. Dispatching the authorized domain BaseRemotableOperation succeeds!
        const domainOpResult = await DispatchRemoteOperationInProcess<PostJournalOpInput, PostJournalOpOutput>(
            POST_JOURNAL_OP_KEY,
            {
                JournalEntryID: 'je-srv-1',
                ApprovedByUserID: 'controller-user-id',
            },
            { user },
            serverProvider,
            user,
        );
        expect(domainOpResult.Success).toBe(true);
        expect(domainOpResult.Output?.Posted).toBe(true);
        expect(domainOpResult.Output?.Status).toBe('Posted');
        expect(serverProvider.StoredRows.get('je-srv-1')?.Status).toBe('Posted');
    });
});
