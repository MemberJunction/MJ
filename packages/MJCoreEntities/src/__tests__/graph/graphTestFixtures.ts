/**
 * Shared fixtures for the semantic-graph unit tests: a fake metadata + RunView + RunQuery provider
 * whose reads honour the user they run as (a per-user row filter stands in for row-level security),
 * and builders for users, entities and graph rows.
 *
 * The fake answers only the filter shapes graph code emits (`[GraphID] = '…'`, `[GraphID] IN (…)`,
 * `[Status] IN (…)`, `[Status] = '…'`, and a whole-filter `[pk] IN (…)`); everything else is ignored,
 * and the engine's own frontier matching does the rest. Every read is logged with the user it ran as.
 */
import type { EntityInfo, RunQueryParams, RunQueryResult, RunViewParams, RunViewResult, UserInfo } from '@memberjunction/core';
import { NormalizeUUID, UUIDsEqual } from '@memberjunction/global';

export const IDS = {
    GraphTypeCanon: '11111111-1111-4111-8111-111111111101',
    GraphCanon: '11111111-1111-4111-8111-111111111102',
    GraphNetwork: '11111111-1111-4111-8111-111111111103',
    GraphDisabled: '11111111-1111-4111-8111-111111111104',
    EntityMeta: '22222222-2222-4222-8222-222222222201',
    FieldMeta: '22222222-2222-4222-8222-222222222202',
    AbvMeta: '22222222-2222-4222-8222-222222222203',
    QueryMeta: '22222222-2222-4222-8222-222222222204',
    ConceptMeta: '22222222-2222-4222-8222-222222222205',
    EdgesMeta: '22222222-2222-4222-8222-222222222206',
    Invoices: '33333333-3333-4333-8333-333333333301',
    Accounts: '33333333-3333-4333-8333-333333333302',
    Contacts: '33333333-3333-4333-8333-333333333303',
    AccountContacts: '33333333-3333-4333-8333-333333333304',
    SecretDeals: '33333333-3333-4333-8333-333333333305',
    InvoicesAccountFkField: '44444444-4444-4444-8444-444444444401',
    InvoicesOpenAbv: '55555555-5555-4555-8555-555555555501',
    InvoicesBrokenAbv: '55555555-5555-4555-8555-555555555502',
    QueryArAging: '66666666-6666-4666-8666-666666666601',
    QueryBaseInvoices: '66666666-6666-4666-8666-666666666602',
    QueryRestricted: '66666666-6666-4666-8666-666666666603',
    ConceptOpenAr: '77777777-7777-4777-8777-777777777701',
    ConceptRevenue: '77777777-7777-4777-8777-777777777702',
    ConceptHidden: '77777777-7777-4777-8777-777777777703',
    EdgeTypeDescribes: '88888888-8888-4888-8888-888888888801',
    EdgeTypeMeasures: '88888888-8888-4888-8888-888888888802',
    EdgeTypeBroader: '88888888-8888-4888-8888-888888888803',
    EdgeTypeRelated: '88888888-8888-4888-8888-888888888804',
    EdgeTypeReads: '88888888-8888-4888-8888-888888888805',
} as const;

export type FakeRow = Record<string, unknown>;

export function MakeUser(id: string, roles: string[] = ['Analyst'], type: 'User' | 'Owner' = 'User'): UserInfo {
    return {
        ID: id,
        Name: `User ${id}`,
        Email: `${id}@example.com`,
        Type: type,
        IsActive: true,
        UserRoles: roles.map((r) => ({ UserID: id, RoleID: `role-${r}`, Role: r })),
    } as unknown as UserInfo;
}

/** Entity read rule for the fake: which roles may read, and whether reads are row-filtered (RLS). */
export interface FakeEntityRule {
    ReadRoles?: string[] | 'all';
    RowFiltered?: boolean;
}

export interface FakeEntitySpec {
    ID: string;
    Name: string;
    NameField?: string;
    Description?: string;
    Icon?: string;
    ParentID?: string;
    Fields?: Array<{ ID: string; Name: string; RelatedEntityID?: string; RelatedEntity?: string; Description?: string }>;
    AlternateBaseViews?: Array<{ ID: string; Name: string; Description?: string; IsUsable: boolean; ParentID?: string; ViewName?: string; Status?: string }>;
    Rule?: FakeEntityRule;
}

function roleNames(user: UserInfo): string[] {
    return (user.UserRoles ?? []).map((r) => String(r.Role));
}

function makeEntity(spec: FakeEntitySpec): EntityInfo {
    const rule = spec.Rule ?? { ReadRoles: 'all' };
    const canRead = (user: UserInfo): boolean =>
        rule.ReadRoles === 'all' || rule.ReadRoles === undefined || roleNames(user).some((r) => (rule.ReadRoles as string[]).includes(r));
    const entity = {
        ID: spec.ID,
        Name: spec.Name,
        DisplayNameOrName: spec.Name,
        Description: spec.Description ?? null,
        Icon: spec.Icon ?? null,
        ParentID: spec.ParentID ?? null,
        FirstPrimaryKey: { Name: 'ID' },
        NameField: spec.NameField ? { Name: spec.NameField } : undefined,
        Fields: (spec.Fields ?? []).map((f) => ({ ...f, RelatedEntityID: f.RelatedEntityID ?? null })),
        AlternateBaseViews: spec.AlternateBaseViews ?? [],
        GetUserPermisions: (user: UserInfo) => ({ CanRead: canRead(user), CanCreate: false, CanUpdate: false, CanDelete: false }),
        UserExemptFromRowLevelSecurity: (user: UserInfo) => canRead(user) && rule.RowFiltered !== true,
    };
    return entity as unknown as EntityInfo;
}

/** Entities every graph test shares: the metadata entities plus a small business schema. */
export function StandardEntitySpecs(overrides: Partial<Record<string, FakeEntityRule>> = {}): FakeEntitySpec[] {
    const rule = (name: string): FakeEntityRule | undefined => overrides[name];
    return [
        { ID: IDS.EntityMeta, Name: 'MJ: Entities', NameField: 'Name', Rule: rule('MJ: Entities') },
        { ID: IDS.FieldMeta, Name: 'MJ: Entity Fields', NameField: 'Name', Rule: rule('MJ: Entity Fields') },
        { ID: IDS.AbvMeta, Name: 'MJ: Entity Alternate Base Views', NameField: 'Name', Rule: rule('MJ: Entity Alternate Base Views') },
        { ID: IDS.QueryMeta, Name: 'MJ: Queries', NameField: 'Name', Rule: rule('MJ: Queries') },
        {
            ID: IDS.ConceptMeta,
            Name: 'MJ: Graph Concepts',
            NameField: 'Name',
            Fields: [{ ID: 'f-concept-desc', Name: 'Description' }],
            Rule: rule('MJ: Graph Concepts'),
        },
        { ID: IDS.EdgesMeta, Name: 'MJ: Graph Edges', Rule: rule('MJ: Graph Edges') },
        { ID: '22222222-2222-4222-8222-222222222210', Name: 'MJ: Graphs', NameField: 'Name' },
        { ID: '22222222-2222-4222-8222-222222222211', Name: 'MJ: Graph Types', NameField: 'Name' },
        { ID: '22222222-2222-4222-8222-222222222212', Name: 'MJ: Graph Edge Types', NameField: 'Name' },
        { ID: '22222222-2222-4222-8222-222222222213', Name: 'MJ: Graph Edge Type Endpoints' },
        { ID: '22222222-2222-4222-8222-222222222214', Name: 'MJ: Graph Edge Providers', NameField: 'Name' },
        { ID: '22222222-2222-4222-8222-222222222215', Name: 'MJ: Graph Concept Types', NameField: 'Name' },
        { ID: '22222222-2222-4222-8222-222222222216', Name: 'MJ: Graph Authority Tiers', NameField: 'Name' },
        { ID: IDS.Accounts, Name: 'Accounts', NameField: 'Name', Rule: rule('Accounts') },
        {
            ID: IDS.Invoices,
            Name: 'Invoices',
            NameField: 'InvoiceNumber',
            Description: 'Customer billing invoices',
            ParentID: IDS.Accounts,
            Fields: [{ ID: IDS.InvoicesAccountFkField, Name: 'AccountID', RelatedEntityID: IDS.Accounts, RelatedEntity: 'Accounts', Description: 'Owning account FK' }],
            AlternateBaseViews: [
                { ID: IDS.InvoicesOpenAbv, Name: 'vwInvoicesOpen', Description: 'Unpaid open invoices', IsUsable: true, ViewName: 'vwInvoicesOpen', Status: 'Active' },
                { ID: IDS.InvoicesBrokenAbv, Name: 'vwInvoicesBroken', Description: 'Unusable view', IsUsable: false, ViewName: 'vwInvoicesBroken', Status: 'Disabled' },
            ],
            Rule: rule('Invoices'),
        },
        { ID: IDS.Contacts, Name: 'Contacts', NameField: 'FullName', Rule: rule('Contacts') },
        {
            ID: IDS.AccountContacts,
            Name: 'AccountContacts',
            Fields: [
                { ID: 'f-ac-account', Name: 'AccountID', RelatedEntityID: IDS.Accounts, RelatedEntity: 'Accounts' },
                { ID: 'f-ac-contact', Name: 'ContactID', RelatedEntityID: IDS.Contacts, RelatedEntity: 'Contacts' },
                { ID: 'f-ac-role', Name: 'Role' },
            ],
            Rule: rule('AccountContacts'),
        },
        { ID: IDS.SecretDeals, Name: 'SecretDeals', NameField: 'Title', Rule: rule('SecretDeals') ?? { ReadRoles: ['Executive'] } },
    ];
}

export interface ReadLogEntry {
    EntityName: string;
    UserID: string | undefined;
    Filter: string;
    MaxRows?: number;
    OrderBy?: string;
}

/**
 * Fake provider. `Rows[entityName]` holds the table; `HiddenFor[userId]` lists `entityName|recordId`
 * keys that user's reads never return (row-level security). Reads by a user without read permission
 * on the entity fail, as the server does.
 */
export class FakeGraphProvider {
    public Entities: EntityInfo[];
    public Rows: Record<string, FakeRow[]> = {};
    public HiddenFor: Record<string, string[]> = {};
    public ReadLog: ReadLogEntry[] = [];
    public QueryLog: Array<{ Params: RunQueryParams; UserID: string | undefined }> = [];
    public QueryRows: FakeRow[] = [];
    public Authorizations = [];
    public ProviderType: 'Database' | 'Network' | undefined = undefined;
    public CurrentUser = undefined;

    public constructor(specs: FakeEntitySpec[] = StandardEntitySpecs()) {
        this.Entities = specs.map(makeEntity);
    }

    /**
     * Engines bind the FIRST provider they are configured with (`BaseEngine.SetProvider` is
     * first-wins), so a test file shares one fake and resets it per test instead of making new ones.
     */
    public Reset(rows: Record<string, FakeRow[]>, specs: FakeEntitySpec[] = StandardEntitySpecs()): this {
        this.Entities = specs.map(makeEntity);
        this.Rows = rows;
        this.HiddenFor = {};
        this.ReadLog = [];
        this.QueryLog = [];
        this.QueryRows = [];
        this.ProviderType = undefined;
        return this;
    }

    public EntityByName(name: string): EntityInfo | undefined {
        const lower = name?.trim().toLowerCase();
        return this.Entities.find((e) => e.Name.toLowerCase() === lower);
    }

    public EntityByID(id: string): EntityInfo | undefined {
        return this.Entities.find((e) => UUIDsEqual(e.ID, id));
    }

    public async RunView<T = FakeRow>(params: RunViewParams, user?: UserInfo): Promise<RunViewResult<T>> {
        const entityName = params.EntityName ?? '';
        this.ReadLog.push({ EntityName: entityName, UserID: user?.ID, Filter: params.ExtraFilter ?? '', MaxRows: params.MaxRows, OrderBy: params.OrderBy });
        const entity = this.EntityByName(entityName);
        if (entity && user && !entity.GetUserPermisions(user).CanRead) {
            return Result<T>([], false, `User ${user.ID} cannot read ${entityName}`);
        }
        const hidden = new Set((user ? this.HiddenFor[user.ID] ?? [] : []).map((k) => k.toLowerCase()));
        let rows = (this.Rows[entityName] ?? []).filter((r) => !hidden.has(`${entityName}|${String(r['ID'])}`.toLowerCase()));
        rows = ApplyKnownFilters(rows, params.ExtraFilter ?? '');
        if (params.MaxRows && params.MaxRows > 0) {
            rows = rows.slice(0, params.MaxRows);
        }
        return Result<T>(rows as T[], true, '');
    }

    public async RunViews<T = FakeRow>(params: RunViewParams[], user?: UserInfo): Promise<RunViewResult<T>[]> {
        return Promise.all(params.map((p) => this.RunView<T>(p, user)));
    }

    public async RunQuery(params: RunQueryParams, user?: UserInfo): Promise<RunQueryResult> {
        this.QueryLog.push({ Params: params, UserID: user?.ID });
        const rows = params.MaxRows ? this.QueryRows.slice(0, params.MaxRows) : this.QueryRows;
        return {
            Success: true,
            QueryID: 'q',
            QueryName: params.QueryName ?? '',
            Results: rows,
            RowCount: rows.length,
            TotalRowCount: this.QueryRows.length,
            ExecutionTime: 1,
            ErrorMessage: '',
        } as RunQueryResult;
    }

    /** Reads of `entityName`, optionally only those run as `userId`. */
    public ReadsOf(entityName: string, userId?: string): ReadLogEntry[] {
        return this.ReadLog.filter((r) => r.EntityName === entityName && (userId === undefined || r.UserID === userId));
    }
}

function Result<T>(rows: T[], success: boolean, error: string): RunViewResult<T> {
    return { Success: success, Results: rows, RowCount: rows.length, TotalRowCount: rows.length, ExecutionTime: 1, ErrorMessage: error, UserViewRunID: '' } as RunViewResult<T>;
}

function ListValues(list: string): string[] {
    return Array.from(list.matchAll(/'([^']*)'/g)).map((m) => m[1]);
}

/** Applies the filter shapes graph code emits; unknown clauses are ignored. */
function ApplyKnownFilters(rows: FakeRow[], filter: string): FakeRow[] {
    let result = rows;
    const graphEq = /\[GraphID\] = '([^']+)'/.exec(filter);
    if (graphEq) {
        result = result.filter((r) => UUIDsEqual(String(r['GraphID']), graphEq[1]));
    }
    const graphIn = /\[GraphID\] IN \(([^)]*)\)/.exec(filter);
    if (graphIn) {
        const ids = ListValues(graphIn[1]).map((v) => NormalizeUUID(v));
        result = result.filter((r) => ids.includes(NormalizeUUID(String(r['GraphID']))));
    }
    const statusIn = /\[Status\] IN \(([^)]*)\)/.exec(filter);
    if (statusIn) {
        const statuses = ListValues(statusIn[1]);
        result = result.filter((r) => statuses.includes(String(r['Status'])));
    }
    const statusEq = /\[Status\] = '([^']+)'/.exec(filter);
    if (statusEq) {
        result = result.filter((r) => String(r['Status']) === statusEq[1]);
    }
    const pkIn = /^\[(\w+)\] IN \(([^)]*)\)$/.exec(filter.trim());
    if (pkIn) {
        const ids = ListValues(pkIn[2]).map((v) => v.toLowerCase());
        result = result.filter((r) => ids.includes(String(r[pkIn[1]]).toLowerCase()));
    }
    const pkEq = /^\[ID\] = '([^']+)'$/.exec(filter.trim());
    if (pkEq) {
        result = result.filter((r) => String(r['ID']).toLowerCase() === pkEq[1].toLowerCase());
    }
    return result;
}

/** Graph metadata rows for the engine's configs. */
export function CanonMetadataRows(): Record<string, FakeRow[]> {
    return {
        'MJ: Graph Types': [{ ID: IDS.GraphTypeCanon, Name: 'Canon', IsCanon: true, Status: 'Active' }],
        'MJ: Graphs': [
            { ID: IDS.GraphCanon, Name: 'MJ Canon', GraphTypeID: IDS.GraphTypeCanon, GraphType: 'Canon', LoadMode: 'Preload', Status: 'Active' },
            { ID: IDS.GraphNetwork, Name: 'Member Network', GraphTypeID: IDS.GraphTypeCanon, GraphType: 'Canon', LoadMode: 'OnDemand', Status: 'Active' },
            { ID: IDS.GraphDisabled, Name: 'Old Graph', GraphTypeID: IDS.GraphTypeCanon, GraphType: 'Canon', LoadMode: 'Preload', Status: 'Disabled' },
        ],
        'MJ: Graph Edge Types': [
            { ID: IDS.EdgeTypeDescribes, Name: 'Describes', InverseName: 'Described By', IsDirected: true, DefaultWeight: 0.7, AllowStored: true, GraphID: null },
            { ID: IDS.EdgeTypeMeasures, Name: 'Measures', InverseName: 'Measured By', IsDirected: true, DefaultWeight: 0.9, AllowStored: true, GraphID: null },
            { ID: IDS.EdgeTypeBroader, Name: 'Broader Than', InverseName: 'Narrower Than', IsDirected: true, DefaultWeight: 0.8, AllowStored: true, GraphID: null },
            { ID: IDS.EdgeTypeRelated, Name: 'Related To', InverseName: null, IsDirected: false, DefaultWeight: 0.5, AllowStored: true, GraphID: null },
        ],
        'MJ: Graph Edge Type Endpoints': [],
        'MJ: Graph Edge Providers': [],
        'MJ: Graph Concepts': [
            {
                ID: IDS.ConceptOpenAr,
                GraphID: IDS.GraphCanon,
                Graph: 'MJ Canon',
                Name: 'Open AR',
                Synonyms: JSON.stringify(['Unpaid Invoices', 'Receivables']),
                Description: 'Unpaid customer invoices past billing date',
                Specification: 'Balance > 0 AND Status = Open',
                AuthorityTier: 'BoardPolicy',
                ConceptType: 'Metric',
                Status: 'Canonical',
            },
            { ID: IDS.ConceptRevenue, GraphID: IDS.GraphCanon, Graph: 'MJ Canon', Name: 'Net Revenue', Synonyms: 'Bookings', Description: 'Recognized net revenue', ConceptType: 'Metric', Status: 'Canonical' },
            { ID: IDS.ConceptHidden, GraphID: IDS.GraphCanon, Graph: 'MJ Canon', Name: 'Executive Bonus Pool', Synonyms: null, Description: 'Confidential', ConceptType: 'Metric', Status: 'Canonical' },
        ],
        'MJ: Graph Concept Types': [],
        'MJ: Graph Authority Tiers': [],
        'MJ: Graph Edges': [],
    };
}

let edgeSeq = 0;

/** A stored edge row between two nodes. */
export function StoredEdge(
    graphId: string,
    edgeTypeId: string,
    edgeTypeName: string,
    source: { EntityID: string; EntityName: string; RecordID: string },
    target: { EntityID: string; EntityName: string; RecordID: string },
    weight: number,
    status: 'Approved' | 'Proposed' | 'Rejected' = 'Approved',
    id?: string,
): FakeRow {
    edgeSeq++;
    return {
        ID: id ?? `e0000000-0000-4000-8000-${String(edgeSeq).padStart(12, '0')}`,
        GraphID: graphId,
        Graph: '',
        EdgeTypeID: edgeTypeId,
        EdgeType: edgeTypeName,
        SourceEntityID: source.EntityID,
        SourceEntity: source.EntityName,
        SourceRecordID: source.RecordID,
        TargetEntityID: target.EntityID,
        TargetEntity: target.EntityName,
        TargetRecordID: target.RecordID,
        Weight: weight,
        Description: null,
        Attributes: null,
        Origin: 'Declared',
        Status: status,
        Confidence: null,
    };
}

export const NODE = {
    Concept: (id: string) => ({ EntityID: IDS.ConceptMeta, EntityName: 'MJ: Graph Concepts', RecordID: id }),
    Abv: (id: string) => ({ EntityID: IDS.AbvMeta, EntityName: 'MJ: Entity Alternate Base Views', RecordID: id }),
    Query: (id: string) => ({ EntityID: IDS.QueryMeta, EntityName: 'MJ: Queries', RecordID: id }),
    Entity: (id: string) => ({ EntityID: IDS.EntityMeta, EntityName: 'MJ: Entities', RecordID: id }),
    Account: (id: string) => ({ EntityID: IDS.Accounts, EntityName: 'Accounts', RecordID: id }),
    Deal: (id: string) => ({ EntityID: IDS.SecretDeals, EntityName: 'SecretDeals', RecordID: id }),
};
