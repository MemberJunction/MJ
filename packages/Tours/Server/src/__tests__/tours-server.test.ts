import { describe, it, expect, beforeEach } from 'vitest';
import {
    AuthorizationInfo,
    AuthorizationRoleInfo,
    BaseEntity,
    CompositeKey,
    EntityInfo,
    ProviderBase,
    ProviderType,
    RemoteOperationError,
    TransactionGroupBase,
    UserInfo,
    UserRoleInfo,
    type DatasetItemFilterType,
    type DatasetResultType,
    type DatasetStatusResultType,
    type EntityDeleteOptions,
    type EntityMergeOptions,
    type EntityRecordNameInput,
    type EntityRecordNameResult,
    type EntitySaveOptions,
    type GetEntityObjectOptions,
    type IEntityDataProvider,
    type ILocalStorageProvider,
    type IMetadataProvider,
    type PotentialDuplicateRequest,
    type PotentialDuplicateResponse,
    type QueryExecutionSpec,
    type RecordChange,
    type RecordDependency,
    type RecordMergeRequest,
    type RecordMergeResult,
    type RemoteOpServerContext,
    type RunQueryParams,
    type RunQueryResult,
    type RunViewParams,
    type RunViewResult,
    type ScoredCandidate,
} from '@memberjunction/core';
import {
    MJTourEntity,
    MJTourRunEntity,
    MJTourRunStepEntity,
    MJTourStepEntity,
    MJTourStepPathEntity,
    MJTourStepTypeEntity,
    MJTourSurfaceEntity,
    MJTourSurfaceTourEntity,
    MJTourTriggerEntity,
    MJTourVersionEntity,
} from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import {
    AuthorizationHeldPredicate,
    BaseTourServerPredicate,
    CanonicalizeJsonValue,
    ComputeCanonicalTourContentHash,
    HasRecordsPredicate,
    LoadToursServer,
    MJTourEntityServer,
    MJTourStepEntityServer,
    MJTourVersionEntityServer,
    QueryReturnsRowsPredicate,
    TourPublisherService,
    ToursClaimGuestRunsServerOperation,
    ToursEvaluatePredicatesServerOperation,
    ToursRecordEventsServerOperation,
} from '../index.js';

LoadToursServer();

const TEST_ROLE_ID = 'e1000000-0000-4000-8000-000000000001';

interface MockColumnDef {
    readonly Name: string;
    readonly Type: string;
    readonly AllowsNull: boolean;
    readonly IsPrimaryKey?: boolean;
}

function buildEntityInfo(id: string, name: string, columns: readonly MockColumnDef[]): EntityInfo {
    const clean = name.replace(/\W/g, '');
    return new EntityInfo({
        ID: id,
        Name: name,
        SchemaName: '__mj',
        BaseTable: clean,
        BaseView: `vw${clean}`,
        Status: 'Active',
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        TrackRecordChanges: false,
        EnableFieldLevelSecurity: false,
        EntityPermissions: [
            {
                ID: `P${id.substring(1)}`,
                EntityID: id,
                RoleID: TEST_ROLE_ID,
                CanCreate: true,
                CanRead: true,
                CanUpdate: true,
                CanDelete: true,
            },
        ],
        EntityFields: columns.map((c, idx) => ({
            ID: `F${id.substring(1, 24)}${(1000 + idx).toString()}`,
            EntityID: id,
            Sequence: idx + 1,
            Length: 0,
            Precision: 0,
            Scale: 0,
            AllowUpdateAPI: true,
            ...c,
        })),
    });
}

const TOUR_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000001', 'MJ: Tours', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'TourKey', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Name', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Description', Type: 'nvarchar', AllowsNull: true },
    { Name: 'ApplicationID', Type: 'uniqueidentifier', AllowsNull: true },
    { Name: 'Application', Type: 'nvarchar', AllowsNull: true },
    { Name: 'CurrentVersionID', Type: 'uniqueidentifier', AllowsNull: true },
    { Name: 'Status', Type: 'nvarchar', AllowsNull: false },
    { Name: 'DefaultGuideMode', Type: 'nvarchar', AllowsNull: false },
    { Name: 'AllowAgentActions', Type: 'bit', AllowsNull: false },
    { Name: 'Priority', Type: 'int', AllowsNull: false },
    { Name: 'EstimatedMinutes', Type: 'int', AllowsNull: true },
    { Name: 'RunInAuthenticatedHosts', Type: 'bit', AllowsNull: false },
    { Name: 'StartLocation', Type: 'nvarchar', AllowsNull: true },
    { Name: 'Goal', Type: 'nvarchar', AllowsNull: true },
    { Name: 'Configuration', Type: 'nvarchar', AllowsNull: true },
]);

const TOUR_VERSION_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000002', 'MJ: Tour Versions', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'TourID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'VersionNumber', Type: 'int', AllowsNull: false },
    { Name: 'Definition', Type: 'nvarchar', AllowsNull: false },
    { Name: 'ContentHash', Type: 'nvarchar', AllowsNull: true },
    { Name: 'ChangeSummary', Type: 'nvarchar', AllowsNull: true },
    { Name: 'PublishedByUserID', Type: 'uniqueidentifier', AllowsNull: true },
    { Name: 'PublishedAt', Type: 'datetimeoffset', AllowsNull: false },
]);

const TOUR_STEP_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000003', 'MJ: Tour Steps', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'TourID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'StepKey', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Sequence', Type: 'int', AllowsNull: false },
    { Name: 'StepTypeID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'StepType', Type: 'nvarchar', AllowsNull: true },
    { Name: 'DriverClass', Type: 'nvarchar', AllowsNull: true },
    { Name: 'Title', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Body', Type: 'nvarchar', AllowsNull: true },
    { Name: 'Configuration', Type: 'nvarchar', AllowsNull: true },
    { Name: 'Anchor', Type: 'nvarchar', AllowsNull: true },
    { Name: 'Placement', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Mode', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Prepare', Type: 'nvarchar', AllowsNull: true },
    { Name: 'Completion', Type: 'nvarchar', AllowsNull: true },
    { Name: 'SkipWhen', Type: 'nvarchar', AllowsNull: true },
    { Name: 'OnMissing', Type: 'nvarchar', AllowsNull: false },
    { Name: 'IsOptional', Type: 'bit', AllowsNull: false },
    { Name: 'GuideNotes', Type: 'nvarchar', AllowsNull: true },
    { Name: 'VoiceScript', Type: 'nvarchar', AllowsNull: true },
]);

const TOUR_STEP_PATH_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000004', 'MJ: Tour Step Paths', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'TourID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'FromStepID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'ToStepID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'Condition', Type: 'nvarchar', AllowsNull: true },
    { Name: 'Label', Type: 'nvarchar', AllowsNull: true },
    { Name: 'Priority', Type: 'int', AllowsNull: false },
    { Name: 'Sequence', Type: 'int', AllowsNull: false },
    { Name: 'IsDefault', Type: 'bit', AllowsNull: false },
    { Name: 'Configuration', Type: 'nvarchar', AllowsNull: true },
]);

const TOUR_STEP_TYPE_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000005', 'MJ: Tour Step Types', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'Name', Type: 'nvarchar', AllowsNull: false },
    { Name: 'DriverClass', Type: 'nvarchar', AllowsNull: false },
    { Name: 'RendererClass', Type: 'nvarchar', AllowsNull: true },
    { Name: 'ComponentID', Type: 'uniqueidentifier', AllowsNull: true },
    { Name: 'ConfigSchema', Type: 'nvarchar', AllowsNull: true },
    { Name: 'SupportedModes', Type: 'nvarchar', AllowsNull: false },
    { Name: 'IsAgentCapable', Type: 'bit', AllowsNull: false },
    { Name: 'Status', Type: 'nvarchar', AllowsNull: false },
]);

const TOUR_SURFACE_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000006', 'MJ: Tour Surfaces', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'SurfaceKey', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Name', Type: 'nvarchar', AllowsNull: false },
    { Name: 'PublicKey', Type: 'nvarchar', AllowsNull: false },
    { Name: 'AllowedOrigins', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Status', Type: 'nvarchar', AllowsNull: false },
]);

const TOUR_SURFACE_TOUR_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000007', 'MJ: Tour Surface Tours', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'SurfaceID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'TourID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'Sequence', Type: 'int', AllowsNull: false },
    { Name: 'Status', Type: 'nvarchar', AllowsNull: false },
]);

const TOUR_RUN_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000008', 'MJ: Tour Runs', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'UserID', Type: 'uniqueidentifier', AllowsNull: true },
    { Name: 'VisitorKey', Type: 'nvarchar', AllowsNull: true },
    { Name: 'SurfaceID', Type: 'uniqueidentifier', AllowsNull: true },
    { Name: 'TourID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'TourVersionID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'Status', Type: 'nvarchar', AllowsNull: false },
    { Name: 'GuideMode', Type: 'nvarchar', AllowsNull: false },
    { Name: 'DirectorType', Type: 'nvarchar', AllowsNull: false },
    { Name: 'LaunchSource', Type: 'nvarchar', AllowsNull: false },
    { Name: 'LaunchedByAgentRunID', Type: 'uniqueidentifier', AllowsNull: true },
    { Name: 'CurrentStepKey', Type: 'nvarchar', AllowsNull: true },
    { Name: 'PathTaken', Type: 'nvarchar', AllowsNull: true },
    { Name: 'IsHoldout', Type: 'bit', AllowsNull: false },
    { Name: 'ConversationID', Type: 'uniqueidentifier', AllowsNull: true },
    { Name: 'AgentSessionID', Type: 'uniqueidentifier', AllowsNull: true },
    { Name: 'StartedAt', Type: 'datetimeoffset', AllowsNull: false },
    { Name: 'CompletedAt', Type: 'datetimeoffset', AllowsNull: true },
    { Name: 'SnoozedUntil', Type: 'datetimeoffset', AllowsNull: true },
    { Name: 'GoalMetAt', Type: 'datetimeoffset', AllowsNull: true },
]);

const TOUR_RUN_STEP_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000009', 'MJ: Tour Run Steps', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'TourRunID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'StepKey', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Sequence', Type: 'int', AllowsNull: false },
    { Name: 'EnteredAt', Type: 'datetimeoffset', AllowsNull: false },
    { Name: 'ExitedAt', Type: 'datetimeoffset', AllowsNull: true },
    { Name: 'Outcome', Type: 'nvarchar', AllowsNull: false },
    { Name: 'AnchorResolution', Type: 'nvarchar', AllowsNull: false },
    { Name: 'QuestionCount', Type: 'int', AllowsNull: false },
    { Name: 'Details', Type: 'nvarchar', AllowsNull: true },
]);

const TOUR_TRIGGER_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000010', 'MJ: Tour Triggers', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
    { Name: 'TourID', Type: 'uniqueidentifier', AllowsNull: false },
    { Name: 'TriggerType', Type: 'nvarchar', AllowsNull: false },
    { Name: 'Status', Type: 'nvarchar', AllowsNull: false },
]);

const CUSTOM_LEADS_INFO = buildEntityInfo('e0000000-0000-4000-8000-000000000011', 'CustomLeads', [
    { Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true },
]);

const ALL_ENTITY_INFOS: EntityInfo[] = [
    TOUR_INFO,
    TOUR_VERSION_INFO,
    TOUR_STEP_INFO,
    TOUR_STEP_PATH_INFO,
    TOUR_STEP_TYPE_INFO,
    TOUR_SURFACE_INFO,
    TOUR_SURFACE_TOUR_INFO,
    TOUR_RUN_INFO,
    TOUR_RUN_STEP_INFO,
    TOUR_TRIGGER_INFO,
    CUSTOM_LEADS_INFO,
];

function makeUser(overrides: Partial<UserInfo> & { ID?: string; Email?: string; RoleIds?: string[] } = {}): UserInfo {
    const userId = overrides.ID ?? '11111111-1111-4111-8111-111111111111';
    const roleIds = overrides.RoleIds ?? [TEST_ROLE_ID];
    const user = new UserInfo(undefined, {
        ID: userId,
        Name: 'Test User',
        Email: overrides.Email ?? 'user@example.com',
        IsActive: true,
        Type: 'User',
        UserRoles: roleIds.map(
            (roleId) =>
                new UserRoleInfo({
                    UserID: userId,
                    RoleID: roleId,
                    Role: 'TestRole',
                }),
        ),
    });
    if (overrides.IsMagicLinkAnonymous !== undefined) {
        user.IsMagicLinkAnonymous = overrides.IsMagicLinkAnonymous;
    }
    if (overrides.MagicLinkScope !== undefined) {
        user.MagicLinkScope = overrides.MagicLinkScope;
    }
    if (overrides.AnonymousVisitorID !== undefined) {
        user.AnonymousVisitorID = overrides.AnonymousVisitorID;
    }
    if (overrides.ReturningVisitorContext !== undefined) {
        user.ReturningVisitorContext = overrides.ReturningVisitorContext;
    }
    if (overrides.WidgetGuestContext !== undefined) {
        user.WidgetGuestContext = overrides.WidgetGuestContext;
    }
    return user;
}

class InMemoryTourMockProvider extends ProviderBase implements IMetadataProvider, IEntityDataProvider {
    public Steps: MJTourStepEntity[] = [];
    public Paths: MJTourStepPathEntity[] = [];
    public StepTypes: MJTourStepTypeEntity[] = [];
    public Versions: MJTourVersionEntity[] = [];
    public Tours: MJTourEntity[] = [];
    public Surfaces: MJTourSurfaceEntity[] = [];
    public SurfaceTourPairs: Array<{ SurfaceID: string; TourID: string }> = [];
    public Runs: MJTourRunEntity[] = [];
    public RunSteps: MJTourRunStepEntity[] = [];
    public Triggers: MJTourTriggerEntity[] = [];
    public MockAuthorizations: AuthorizationInfo[] = [];
    public MockAuthorizationRoles: AuthorizationRoleInfo[] = [];
    public LastRunViewUser: UserInfo | undefined;
    public LastRunQueryUser: UserInfo | undefined;
    public HasRecordsCount = 0;
    public QueryRows: Array<Record<string, string>> = [];

    private idCounter = 1;

    private nextUuid(): string {
        const hex = (this.idCounter++).toString(16).padStart(12, '0');
        return `aaaaaaaa-aaaa-4aaa-8aaa-${hex}`;
    }

    protected override get AllowRefresh(): boolean {
        return false;
    }

    public override get ProviderType(): ProviderType {
        return ProviderType.Database;
    }

    protected override get Metadata(): IMetadataProvider {
        return this;
    }

    public override get LocalStorageProvider(): ILocalStorageProvider {
        throw new Error('LocalStorageProvider not used in tests');
    }

    public override get Entities(): EntityInfo[] {
        return ALL_ENTITY_INFOS;
    }

    public override get Authorizations(): AuthorizationInfo[] {
        return this.MockAuthorizations;
    }

    public override get AuthorizationRoles(): AuthorizationRoleInfo[] {
        return this.MockAuthorizationRoles;
    }

    public override get DatabaseConnection(): never {
        throw new Error('Not used in unit tests');
    }

    public override get InstanceConnectionString(): string {
        return 'in-memory://tours-server-test';
    }

    public override async Config(): Promise<boolean> {
        return true;
    }

    public async GetRecordChanges(): Promise<RecordChange[]> {
        return [];
    }

    protected override async GetCurrentUser(): Promise<UserInfo> {
        return makeUser();
    }

    protected override async InternalGetEntityRecordName(): Promise<string> {
        return '';
    }

    protected override async InternalGetEntityRecordNames(
        _info: EntityRecordNameInput[],
    ): Promise<EntityRecordNameResult[]> {
        return [];
    }

    public override async GetRecordFavoriteStatus(): Promise<boolean> {
        return false;
    }

    public override async SetRecordFavoriteStatus(): Promise<void> {}

    protected override async InternalRunQueries(paramsArray: RunQueryParams[], contextUser?: UserInfo): Promise<RunQueryResult[]> {
        const out: RunQueryResult[] = [];
        for (const p of paramsArray) {
            out.push(await this.InternalRunQuery(p, contextUser));
        }
        return out;
    }

    protected override async InternalExecuteQueryFromSpec(_spec: QueryExecutionSpec, contextUser?: UserInfo): Promise<RunQueryResult> {
        this.LastRunQueryUser = contextUser;
        return {
            Success: true,
            Results: this.QueryRows,
            TotalRowCount: this.QueryRows.length,
            RowCount: this.QueryRows.length,
            ExecutionTime: 1,
            ErrorMessage: '',
            QueryID: 'q-1',
            QueryName: 'MockQuery',
        };
    }

    protected override async searchEntitiesSemanticPass(): Promise<ScoredCandidate[]> {
        return [];
    }

    public override async GetRecordDependencies(): Promise<RecordDependency[]> {
        return [];
    }

    public override async GetRecordDuplicates(_params: PotentialDuplicateRequest): Promise<PotentialDuplicateResponse> {
        return { Status: 'Success', PotentialDuplicateResult: [] };
    }

    public override async MergeRecords(request: RecordMergeRequest): Promise<RecordMergeResult> {
        return { Request: request, Success: false, OverallStatus: 'Not supported', RecordMergeLogID: '', RecordStatus: [] };
    }

    public override async GetDatasetByName(
        datasetName: string,
        _itemFilters?: DatasetItemFilterType[],
    ): Promise<DatasetResultType> {
        return { DatasetID: '', DatasetName: datasetName, Success: false, Status: 'Not supported', Results: [], LatestUpdateDate: new Date() };
    }

    public override async GetDatasetStatusByName(datasetName: string): Promise<DatasetStatusResultType> {
        return { DatasetID: '', DatasetName: datasetName, EntityUpdateDates: [], Success: false, Status: 'Not supported', LatestUpdateDate: new Date() };
    }

    public override async CreateTransactionGroup(): Promise<TransactionGroupBase> {
        throw new Error('CreateTransactionGroup not used in tests');
    }

    protected override async InternalRunView<T>(params: RunViewParams, contextUser?: UserInfo): Promise<RunViewResult<T>> {
        this.LastRunViewUser = contextUser;
        const entity = params.EntityName ?? '';
        const filter = typeof params.ExtraFilter === 'string' ? params.ExtraFilter : '';

        const wrap = (items: unknown[]): RunViewResult<T> => ({
            Success: true,
            Results: items as T[],
            RowCount: items.length,
            TotalRowCount: items.length,
            ExecutionTime: 1,
            ErrorMessage: '',
            UserViewRunID: '',
        });

        if (entity === 'MJ: Tour Steps') {
            return wrap(this.Steps);
        }
        if (entity === 'MJ: Tour Step Paths') {
            return wrap(this.Paths);
        }
        if (entity === 'MJ: Tour Step Types') {
            const matched = filter.includes("ID='")
                ? this.StepTypes.filter((st) => filter.includes(st.ID))
                : this.StepTypes;
            return wrap(matched);
        }
        if (entity === 'MJ: Tour Versions') {
            const matched = filter.includes("TourID='")
                ? this.Versions.filter((v) => filter.includes(v.TourID))
                : this.Versions;
            return wrap(matched);
        }
        if (entity === 'MJ: Tours') {
            const matched = this.Tours.filter((t) => {
                if (filter.includes("CurrentVersionID='")) {
                    return t.CurrentVersionID != null && filter.includes(t.CurrentVersionID);
                }
                if (filter.includes("TourKey='")) {
                    return filter.includes(t.TourKey);
                }
                if (filter.includes("ID='")) {
                    return filter.includes(t.ID);
                }
                return true;
            });
            return wrap(matched);
        }
        if (entity === 'MJ: Tour Surfaces') {
            const matched = this.Surfaces.filter(
                (s) => !filter || filter.includes(s.ID) || filter.includes(s.SurfaceKey),
            );
            return wrap(matched);
        }
        if (entity === 'MJ: Tour Surface Tours') {
            const matched = this.SurfaceTourPairs.filter(
                (p) => filter.includes(p.SurfaceID) && filter.includes(p.TourID),
            );
            return wrap(matched);
        }
        if (entity === 'MJ: Tour Runs') {
            let matched = [...this.Runs];
            if (filter.includes('UserID IS NULL')) {
                matched = matched.filter((r) => r.UserID == null);
            }
            const vkMatch = /VisitorKey='([^']+)'/.exec(filter);
            if (vkMatch) {
                matched = matched.filter((r) => r.VisitorKey === vkMatch[1]);
            }
            const surfMatch = /SurfaceID='([^']+)'/.exec(filter);
            if (surfMatch) {
                matched = matched.filter((r) => r.SurfaceID?.toLowerCase() === surfMatch[1].toLowerCase());
            }
            if (filter.includes("TourVersionID='")) {
                matched = matched.filter((r) => filter.includes(r.TourVersionID));
            }
            if (filter.includes("TourID='")) {
                matched = matched.filter((r) => filter.includes(r.TourID));
            }
            return wrap(matched);
        }
        if (entity === 'MJ: Tour Run Steps') {
            const matched = this.RunSteps.filter((rs) => {
                if (filter.includes('TourRunID IN')) {
                    return filter.includes(rs.TourRunID);
                }
                if (filter.includes("TourRunID='")) {
                    return filter.includes(rs.TourRunID) && filter.includes(rs.StepKey);
                }
                return true;
            });
            return wrap(matched);
        }
        if (entity === 'MJ: Tour Triggers') {
            const matched = this.Triggers.filter(
                (tr) =>
                    (!filter.includes("TourID='") || filter.includes(tr.TourID)) &&
                    (!filter.includes("Status='Active'") || tr.Status === 'Active'),
            );
            return wrap(matched);
        }
        if (entity === 'CustomLeads') {
            const results = Array.from({ length: this.HasRecordsCount }, (_, idx) => ({ ID: `lead-${idx}` }));
            return {
                Success: true,
                Results: results.slice(0, params.MaxRows ?? 1) as T[],
                RowCount: Math.min(results.length, params.MaxRows ?? 1),
                TotalRowCount: this.HasRecordsCount,
                ExecutionTime: 1,
                ErrorMessage: '',
                UserViewRunID: '',
            };
        }
        return wrap([]);
    }

    protected override async InternalRunViews<T>(paramsArray: RunViewParams[], contextUser?: UserInfo): Promise<RunViewResult<T>[]> {
        const out: RunViewResult<T>[] = [];
        for (const p of paramsArray) {
            out.push(await this.InternalRunView<T>(p, contextUser));
        }
        return out;
    }

    protected override async InternalRunQuery(_params: RunQueryParams, contextUser?: UserInfo): Promise<RunQueryResult> {
        this.LastRunQueryUser = contextUser;
        return {
            Success: true,
            Results: this.QueryRows,
            TotalRowCount: this.QueryRows.length,
            RowCount: this.QueryRows.length,
            ExecutionTime: 1,
            ErrorMessage: '',
            QueryID: 'q-1',
            QueryName: 'MockQuery',
        };
    }

    public async Load(
        entity: BaseEntity,
        compositeKey: CompositeKey,
        _entityRelationshipsToLoad: string[],
        _user: UserInfo,
    ): Promise<Record<string, unknown>> {
        const id = compositeKey.KeyValuePairs[0]?.Value;
        const name = entity.EntityInfo.Name;
        let found: BaseEntity | undefined;
        if (name === 'MJ: Tours') found = this.Tours.find((t) => t.ID === id);
        else if (name === 'MJ: Tour Runs') found = this.Runs.find((r) => r.ID === id);
        else if (name === 'MJ: Tour Versions') found = this.Versions.find((v) => v.ID === id);
        return found ? found.GetAll() : {};
    }

    public async Save(
        entity: BaseEntity,
        _user: UserInfo,
        _options: EntitySaveOptions,
    ): Promise<Record<string, unknown>> {
        const data = { ...entity.GetAll() };
        if (!data['ID']) {
            data['ID'] = this.nextUuid();
        }
        const id = String(data['ID']);
        const name = entity.EntityInfo.Name;
        if (name === 'MJ: Tour Versions') {
            const ver = new MJTourVersionEntityServer(TOUR_VERSION_INFO, this);
            ver.SetMany(data, true);
            this.upsert(this.Versions, ver, id);
        } else if (name === 'MJ: Tours') {
            const tour = new MJTourEntity(TOUR_INFO, this);
            tour.SetMany(data, true);
            this.upsert(this.Tours, tour, id);
        } else if (name === 'MJ: Tour Runs') {
            const run = new MJTourRunEntity(TOUR_RUN_INFO, this);
            run.SetMany(data, true);
            this.upsert(this.Runs, run, id);
        } else if (name === 'MJ: Tour Run Steps') {
            const rs = new MJTourRunStepEntity(TOUR_RUN_STEP_INFO, this);
            rs.SetMany(data, true);
            this.upsert(this.RunSteps, rs, id);
        } else if (name === 'MJ: Tour Triggers') {
            const tr = new MJTourTriggerEntity(TOUR_TRIGGER_INFO, this);
            tr.SetMany(data, true);
            this.upsert(this.Triggers, tr, id);
        }
        return data;
    }

    public async Delete(
        entity: BaseEntity,
        _options: EntityDeleteOptions,
        _user: UserInfo,
    ): Promise<boolean> {
        const name = entity.EntityInfo.Name;
        const id = String(entity.GetAll()['ID'] ?? '');
        if (name === 'MJ: Tour Versions') {
            this.Versions = this.Versions.filter((v) => v.ID !== id);
        }
        return true;
    }

    public override async GetEntityObject<T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T>;
    public override async GetEntityObject<T extends BaseEntity>(entityName: string, options: GetEntityObjectOptions, contextUser?: UserInfo): Promise<T>;
    public override async GetEntityObject<T extends BaseEntity>(entityName: string, loadKey: CompositeKey, contextUser?: UserInfo): Promise<T>;
    public override async GetEntityObject<T extends BaseEntity>(
        entityName: string,
        contextUserOrOptions?: UserInfo | GetEntityObjectOptions | CompositeKey,
        contextUser?: UserInfo,
    ): Promise<T> {
        const resolvedUser = contextUserOrOptions instanceof UserInfo ? contextUserOrOptions : contextUser;
        let instance: BaseEntity;
        if (entityName === 'MJ: Tour Versions') {
            instance = new MJTourVersionEntityServer(TOUR_VERSION_INFO, this);
        } else if (entityName === 'MJ: Tours') {
            instance = new MJTourEntityServer(TOUR_INFO, this);
        } else if (entityName === 'MJ: Tour Runs') {
            instance = new MJTourRunEntity(TOUR_RUN_INFO, this);
        } else if (entityName === 'MJ: Tour Run Steps') {
            instance = new MJTourRunStepEntity(TOUR_RUN_STEP_INFO, this);
        } else if (entityName === 'MJ: Tour Triggers') {
            instance = new MJTourTriggerEntity(TOUR_TRIGGER_INFO, this);
        } else {
            throw new Error(`Unexpected entity '${entityName}' in mock provider`);
        }
        instance.ContextCurrentUser = resolvedUser ?? makeUser();
        instance.NewRecord();
        return instance as T;
    }

    private upsert<T extends { ID: string }>(arr: T[], item: T, id: string): void {
        const idx = arr.findIndex((x) => x.ID === id);
        if (idx >= 0) {
            arr[idx] = item;
        } else {
            arr.push(item);
        }
    }
}

function makeFakeStepType(
    provider: InMemoryTourMockProvider,
    id: string,
    name: string,
    configSchema: string | null = null,
): MJTourStepTypeEntity {
    const st = new MJTourStepTypeEntity(TOUR_STEP_TYPE_INFO, provider);
    st.SetMany(
        {
            ID: id,
            Name: name,
            DriverClass: name,
            RendererClass: null,
            ComponentID: null,
            ConfigSchema: configSchema,
            SupportedModes: 'Show,Guide',
            IsAgentCapable: true,
            Status: 'Active',
        },
        true,
    );
    return st;
}

function makeFakeStep(
    provider: InMemoryTourMockProvider,
    id: string,
    tourId: string,
    stepKey: string,
    seq: number,
    stepTypeId: string,
    title: string,
    config: Record<string, unknown> | null = null,
): MJTourStepEntity {
    const step = new MJTourStepEntity(TOUR_STEP_INFO, provider);
    step.SetMany(
        {
            ID: id,
            TourID: tourId,
            StepKey: stepKey,
            Sequence: seq,
            StepTypeID: stepTypeId,
            Title: title,
            Body: `Body for ${stepKey}`,
            Configuration: config ? JSON.stringify(config) : null,
            Placement: 'Auto',
            Mode: 'Guide',
            OnMissing: 'Center',
            IsOptional: false,
        },
        true,
    );
    return step;
}

describe('TourPublisherService — canonical hash idempotency & version increment', () => {
    it('CanonicalizeJsonValue produces identical hashes regardless of key ordering', () => {
        const a = CanonicalizeJsonValue({ b: 2, a: { y: true, x: 'hi' } });
        const b = CanonicalizeJsonValue({ a: { x: 'hi', y: true }, b: 2 });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));

        const h1 = ComputeCanonicalTourContentHash({
            TourKey: 'core.welcome',
            Name: 'Welcome',
            DefaultGuideMode: 'Visual',
            AllowAgentActions: false,
            Steps: [],
            Paths: [],
            Configuration: { b: 1, a: 2 },
        });
        const h2 = ComputeCanonicalTourContentHash({
            TourKey: 'core.welcome',
            Name: 'Welcome',
            DefaultGuideMode: 'Visual',
            AllowAgentActions: false,
            Steps: [],
            Paths: [],
            Configuration: { a: 2, b: 1 },
        });
        expect(h1).toBe(h2);
    });

    it('creates v1 on first publish, skips duplicate version on identical re-publish, and creates v2 on step edit', async () => {
        const provider = new InMemoryTourMockProvider();
        const user = makeUser();

        const stepTypeId = '22222222-2222-4222-8222-222222222222';
        provider.StepTypes.push(makeFakeStepType(provider, stepTypeId, 'Modal'));

        const tour = await provider.GetEntityObject<MJTourEntity>('MJ: Tours', user);
        tour.SetMany(
            {
                ID: '33333333-3333-4333-8333-333333333333',
                TourKey: 'core.welcome',
                Name: 'Welcome to MJ',
                Status: 'Active',
                DefaultGuideMode: 'Visual',
                AllowAgentActions: false,
                Priority: 100,
                RunInAuthenticatedHosts: true,
            },
            true,
        );
        provider.Tours.push(tour);

        const step1 = makeFakeStep(
            provider,
            '44444444-4444-4444-8444-444444444444',
            tour.ID,
            'welcome-card',
            1,
            stepTypeId,
            'Welcome!',
            { Variant: 'welcome' },
        );
        provider.Steps.push(step1);

        // First publish -> v1
        const r1 = await TourPublisherService.Instance.SnapshotIfChanged(tour, user, provider);
        expect(r1.Success).toBe(true);
        expect(r1.VersionNumber).toBe(1);
        expect(r1.UnchangedSnapshot).toBe(false);
        expect(provider.Versions).toHaveLength(1);
        expect(tour.CurrentVersionID).toBe(r1.TourVersionId);

        // Second idempotent publish -> unchanged, still 1 version
        const r2 = await TourPublisherService.Instance.SnapshotIfChanged(tour, user, provider);
        expect(r2.Success).toBe(true);
        expect(r2.VersionNumber).toBe(1);
        expect(r2.UnchangedSnapshot).toBe(true);
        expect(provider.Versions).toHaveLength(1);

        // Mutate step title -> v2
        step1.Title = 'Welcome to MemberJunction!';
        const r3 = await TourPublisherService.Instance.SnapshotIfChanged(tour, user, provider);
        expect(r3.Success).toBe(true);
        expect(r3.VersionNumber).toBe(2);
        expect(r3.UnchangedSnapshot).toBe(false);
        expect(provider.Versions).toHaveLength(2);
        expect(tour.CurrentVersionID).toBe(r3.TourVersionId);
    });
});

describe('MJTourVersionEntityServer — immutability & delete guards', () => {
    it('rejects mutations to Definition or VersionNumber on an existing saved TourVersion', async () => {
        const provider = new InMemoryTourMockProvider();
        const user = makeUser();
        const version = new MJTourVersionEntityServer(TOUR_VERSION_INFO, provider);
        version.ContextCurrentUser = user;
        version.NewRecord();
        version.ID = '55555555-5555-4555-8555-555555555555';
        version.TourID = '33333333-3333-4333-8333-333333333333';
        version.VersionNumber = 1;
        version.Definition = JSON.stringify({
            TourKey: 'core.welcome',
            Name: 'Welcome',
            DefaultGuideMode: 'Visual',
            AllowAgentActions: false,
            Steps: [],
            Paths: [],
        });
        version.PublishedAt = new Date();
        expect(await version.Save()).toBe(true);
        expect(version.IsSaved).toBe(true);

        version.Definition = JSON.stringify({
            TourKey: 'core.welcome',
            Name: 'Mutated',
            DefaultGuideMode: 'Visual',
            AllowAgentActions: false,
            Steps: [],
            Paths: [],
        });
        const validation = await version.ValidateAsync();
        expect(validation.Success).toBe(false);
        expect(validation.Errors.some((e) => e.Source === 'Definition')).toBe(true);

        const saved = await version.Save();
        expect(saved).toBe(false);
    });

    it('rejects Delete() when referenced by Tour.CurrentVersionID or TourRun.TourVersionID', async () => {
        const provider = new InMemoryTourMockProvider();
        const user = makeUser();

        const version = new MJTourVersionEntityServer(TOUR_VERSION_INFO, provider);
        version.ContextCurrentUser = user;
        version.SetMany(
            {
                ID: '55555555-5555-4555-8555-555555555555',
                TourID: '33333333-3333-4333-8333-333333333333',
                VersionNumber: 1,
                Definition: '{}',
                PublishedAt: new Date(),
            },
            true,
        );

        const tour = new MJTourEntity(TOUR_INFO, provider);
        tour.SetMany(
            { ID: '33333333-3333-4333-8333-333333333333', TourKey: 'core.welcome', CurrentVersionID: version.ID },
            true,
        );
        provider.Tours.push(tour);

        const deletedWhileCurrent = await version.Delete();
        expect(deletedWhileCurrent).toBe(false);

        tour.CurrentVersionID = null;
        const run = new MJTourRunEntity(TOUR_RUN_INFO, provider);
        run.SetMany({ ID: '66666666-6666-4666-8666-666666666666', TourID: tour.ID, TourVersionID: version.ID }, true);
        provider.Runs.push(run);

        const deletedWhileReferencedByRun = await version.Delete();
        expect(deletedWhileReferencedByRun).toBe(false);
    });
});

describe('MJTourStepEntityServer — ConfigSchema validation', () => {
    it('validates step Configuration against TourStepType.ConfigSchema', async () => {
        const provider = new InMemoryTourMockProvider();
        const user = makeUser();
        const stepTypeId = '77777777-7777-4777-8777-777777777777';
        const schema = JSON.stringify({
            type: 'object',
            required: ['SeedPrompt'],
            properties: {
                SeedPrompt: { type: 'string' },
                PreferVoice: { type: 'boolean' },
            },
        });
        provider.StepTypes.push(makeFakeStepType(provider, stepTypeId, 'AskAgent', schema));

        const step = new MJTourStepEntityServer(TOUR_STEP_INFO, provider);
        step.ContextCurrentUser = user;
        step.NewRecord();
        step.ID = '44444444-4444-4444-8444-444444444499';
        step.TourID = '33333333-3333-4333-8333-333333333333';
        step.StepKey = 'ask-sage';
        step.Sequence = 1;
        step.StepTypeID = stepTypeId;
        step.Title = 'Ask Sage';
        step.Placement = 'Auto';
        step.Mode = 'Guide';
        step.OnMissing = 'Center';
        step.IsOptional = false;
        step.Configuration = JSON.stringify({ PreferVoice: 'not-a-boolean' });

        const badValidation = await step.ValidateAsync();
        expect(badValidation.Success).toBe(false);
        expect(badValidation.Errors.some((e) => e.Message.includes('SeedPrompt'))).toBe(true);
        expect(badValidation.Errors.some((e) => e.Message.includes('PreferVoice'))).toBe(true);

        step.Configuration = JSON.stringify({ SeedPrompt: 'Tell me about this record', PreferVoice: false });
        const goodValidation = await step.ValidateAsync();
        expect(goodValidation.Errors.filter((e) => e.Source === 'Configuration')).toHaveLength(0);
    });
});

describe('ToursRecordEventsServerOperation — guest JWT claim enforcement & anchor-miss auto-pause', () => {
    let provider: InMemoryTourMockProvider;
    let op: ToursRecordEventsServerOperation;

    beforeEach(() => {
        provider = new InMemoryTourMockProvider();
        op = new ToursRecordEventsServerOperation();
    });

    it('rejects guest callers lacking Tour Surface scope or VisitorKey/mj_sid', async () => {
        const guestMissingScope = makeUser({
            IsMagicLinkAnonymous: true,
            AnonymousVisitorID: 'sid-123',
        });
        const ctx: RemoteOpServerContext = {
            provider,
            user: guestMissingScope,
            emitProgress: () => undefined,
        };
        const denied = await op.ExecuteServer({ Events: [] }, ctx);
        expect(denied.Success).toBe(false);
        expect(denied.ResultCode).toBe('FORBIDDEN');
    });

    it('derives SurfaceID and VisitorKey (falling back to mj_sid) strictly from verified guest claims and rejects unassigned tours', async () => {
        const surfaceId = '88888888-8888-4888-8888-888888888888';
        const tourId = '99999999-9999-4999-8999-999999999999';
        const versionId = 'abababab-abab-4bab-8bab-abababababab';
        const otherTourId = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';

        const tour = new MJTourEntity(TOUR_INFO, provider);
        tour.SetMany({ ID: tourId, TourKey: 'public.welcome', CurrentVersionID: versionId, Status: 'Active' }, true);
        const otherTour = new MJTourEntity(TOUR_INFO, provider);
        otherTour.SetMany(
            { ID: otherTourId, TourKey: 'internal.secret', CurrentVersionID: versionId, Status: 'Active' },
            true,
        );
        provider.Tours.push(tour, otherTour);
        provider.SurfaceTourPairs.push({ SurfaceID: surfaceId, TourID: tourId });

        const guest = makeUser({
            ID: '00000000-0000-0000-0000-000000000001',
            IsMagicLinkAnonymous: true,
            MagicLinkScope: { ResourceType: 'Tour Surface', ResourceID: surfaceId },
            AnonymousVisitorID: 'mj-sid-fallback-token',
        });

        const ctx: RemoteOpServerContext = {
            provider,
            user: guest,
            emitProgress: () => undefined,
        };

        // Allowed surface tour -> records run under verified SurfaceID + mj_sid fallback VisitorKey, UserID = null
        const res = await op.ExecuteServer(
            {
                Events: [
                    {
                        RunClientId: 'client-1',
                        TourKey: 'public.welcome',
                        EventType: 'RunStarted',
                        Timestamp: new Date().toISOString(),
                        LaunchSource: 'Trigger',
                    },
                ],
            },
            ctx,
        );
        expect(res.Success).toBe(true);
        expect(res.Output?.ProcessedCount).toBe(1);
        expect(provider.Runs).toHaveLength(1);
        expect(provider.Runs[0].UserID).toBeNull();
        expect(provider.Runs[0].SurfaceID).toBe(surfaceId);
        expect(provider.Runs[0].VisitorKey).toBe('mj-sid-fallback-token');

        // Unassigned tour on this surface -> rejected with FORBIDDEN
        const forbiddenRes = await op.ExecuteServer(
            {
                Events: [
                    {
                        TourKey: 'internal.secret',
                        EventType: 'RunStarted',
                        Timestamp: new Date().toISOString(),
                    },
                ],
            },
            ctx,
        );
        expect(forbiddenRes.Success).toBe(false);
        expect(forbiddenRes.ResultCode).toBe('FORBIDDEN');
    });

    it('auto-pauses active triggers when AnchorResolution === Failed crosses threshold', async () => {
        const tourId = '12121212-1212-4121-8121-121212121212';
        const versionId = '34343434-3434-4343-8343-343434343434';
        const tour = new MJTourEntity(TOUR_INFO, provider);
        tour.SetMany({ ID: tourId, TourKey: 'core.broken', CurrentVersionID: versionId, Status: 'Active' }, true);
        provider.Tours.push(tour);

        const trigger = new MJTourTriggerEntity(TOUR_TRIGGER_INFO, provider);
        trigger.SetMany(
            { ID: '56565656-5656-4565-8565-565656565656', TourID: tourId, TriggerType: 'FirstVisit', Status: 'Active' },
            true,
        );
        provider.Triggers.push(trigger);

        // Seed 4 prior failed steps so the 5th crosses ANCHOR_MISS_MIN_SAMPLES (5)
        const existingRun = new MJTourRunEntity(TOUR_RUN_INFO, provider);
        existingRun.SetMany(
            {
                ID: '78787878-7878-4787-8787-787878787878',
                UserID: '11111111-1111-4111-8111-111111111111',
                TourID: tourId,
                TourVersionID: versionId,
            },
            true,
        );
        provider.Runs.push(existingRun);
        for (let i = 0; i < 4; i++) {
            const rs = new MJTourRunStepEntity(TOUR_RUN_STEP_INFO, provider);
            rs.SetMany(
                {
                    ID: `rs-${i}`,
                    TourRunID: existingRun.ID,
                    StepKey: 's1',
                    Sequence: i,
                    AnchorResolution: 'Failed',
                    Outcome: 'Anchor Missing',
                },
                true,
            );
            provider.RunSteps.push(rs);
        }

        const user = makeUser();
        const res = await op.ExecuteServer(
            {
                Events: [
                    {
                        RunClientId: 'r1',
                        TourKey: 'core.broken',
                        EventType: 'StepCompleted',
                        CurrentStepKey: 's1',
                        StepSequence: 1,
                        StepOutcome: 'Anchor Missing',
                        AnchorResolution: 'Failed',
                        Timestamp: new Date().toISOString(),
                    },
                ],
            },
            { provider, user, emitProgress: () => undefined },
        );

        expect(res.Success).toBe(true);
        expect(res.Output?.AutoPausedTourKeys).toContain('core.broken');
        expect(provider.Triggers[0].Status).toBe('Paused');
    });
});

describe('ToursClaimGuestRunsServerOperation & BaseTourServerPredicate', () => {
    it('claims anonymous guest runs for an authenticated user and rejects guest callers', async () => {
        const provider = new InMemoryTourMockProvider();
        const guestRun = new MJTourRunEntity(TOUR_RUN_INFO, provider);
        guestRun.ContextCurrentUser = makeUser();
        guestRun.SetMany(
            {
                ID: '90909090-9090-4090-8090-909090909090',
                UserID: null,
                VisitorKey: 'vk_abc1234567890123',
                TourID: '33333333-3333-4333-8333-333333333333',
                TourVersionID: '55555555-5555-4555-8555-555555555555',
                Status: 'In Progress',
                GuideMode: 'Visual',
                DirectorType: 'Visual',
                LaunchSource: 'Trigger',
                IsHoldout: false,
                StartedAt: new Date(),
            },
            true,
        );
        provider.Runs.push(guestRun);

        const claimOp = new ToursClaimGuestRunsServerOperation();
        const guestUser = makeUser({ IsMagicLinkAnonymous: true, AnonymousVisitorID: 'vk_abc1234567890123' });
        const denied = await claimOp.ExecuteServer(
            { VisitorKey: 'vk_abc1234567890123' },
            { provider, user: guestUser, emitProgress: () => undefined },
        );
        expect(denied.Success).toBe(false);
        expect(denied.ResultCode).toBe('FORBIDDEN');

        const authUser = makeUser({ ID: 'fefefefe-fefe-4efe-8efe-fefefefefefe' });
        const ok = await claimOp.ExecuteServer(
            { VisitorKey: 'vk_abc1234567890123' },
            { provider, user: authUser, emitProgress: () => undefined },
        );
        expect(ok.Success).toBe(true);
        expect(ok.Output?.ClaimedRunCount).toBe(1);
        expect(provider.Runs[0].UserID).toBe(authUser.ID);
    });

    it('evaluates HasRecords, QueryReturnsRows, and AuthorizationHeld under contextUser', async () => {
        const provider = new InMemoryTourMockProvider();
        provider.HasRecordsCount = 3;
        provider.QueryRows = [{ ID: '1' }];
        provider.MockAuthorizationRoles = [
            new AuthorizationRoleInfo({
                ID: 'ar-1',
                RoleID: 'role-admin',
                AuthorizationID: 'auth-1',
                Type: 'Allow',
            }),
        ];
        provider.MockAuthorizations = [
            new AuthorizationInfo(
                {
                    ID: 'auth-1',
                    Name: 'Tour Studio: Admin',
                    ParentID: null,
                    IsActive: true,
                    UseAuditLog: false,
                },
                provider,
            ),
        ];

        const adminUser = makeUser({ ID: 'user-admin', RoleIds: ['role-admin'] });
        const plainUser = makeUser({ ID: 'user-plain', RoleIds: [TEST_ROLE_ID] });

        const evalOp = new ToursEvaluatePredicatesServerOperation();
        const resAdmin = await evalOp.ExecuteServer(
            {
                Predicates: [
                    { RequestKey: 'p1', PredicateType: 'HasRecords', EntityName: 'CustomLeads' },
                    { RequestKey: 'p2', PredicateType: 'QueryReturnsRows', QueryName: 'ActiveLeads' },
                    { RequestKey: 'p3', PredicateType: 'AuthorizationHeld', AuthorizationName: 'Tour Studio: Admin' },
                ],
            },
            { provider, user: adminUser, emitProgress: () => undefined },
        );

        expect(resAdmin.Success).toBe(true);
        expect(resAdmin.Output?.Results['p1']).toMatchObject({ Satisfied: true, RowCount: 3 });
        expect(resAdmin.Output?.Results['p2']).toMatchObject({ Satisfied: true, RowCount: 1 });
        expect(resAdmin.Output?.Results['p3']).toMatchObject({ Satisfied: true });
        expect(provider.LastRunViewUser?.ID).toBe('user-admin');
        expect(provider.LastRunQueryUser?.ID).toBe('user-admin');

        const authPred = new AuthorizationHeldPredicate();
        const plainAuth = await authPred.Evaluate(
            { RequestKey: 'p3', PredicateType: 'AuthorizationHeld', AuthorizationName: 'Tour Studio: Admin' },
            provider,
            plainUser,
        );
        expect(plainAuth.Satisfied).toBe(false);

        // Ensure ClassFactory registrations are active
        expect(MJGlobal.Instance.ClassFactory.CreateInstance(BaseTourServerPredicate, 'HasRecords')).toBeInstanceOf(HasRecordsPredicate);
        expect(MJGlobal.Instance.ClassFactory.CreateInstance(BaseTourServerPredicate, 'QueryReturnsRows')).toBeInstanceOf(QueryReturnsRowsPredicate);
        expect(MJGlobal.Instance.ClassFactory.CreateInstance(BaseTourServerPredicate, 'AuthorizationHeld')).toBeInstanceOf(AuthorizationHeldPredicate);
    });
});
