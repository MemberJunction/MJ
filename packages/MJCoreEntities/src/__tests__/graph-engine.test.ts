import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityInfo, IMetadataProvider, IRunQueryProvider, IRunViewProvider, RunViewParams, UserInfo } from '@memberjunction/core';
import {
    AlternateBaseViewEdgeProvider,
    BaseGraphEdgeProvider,
    BuildDerivedGraphEdgeID,
    BuildGraphNodeKey,
    CanonGraphEngine,
    EntityMetadataEdgeProvider,
    ForeignKeyEdgeProvider,
    GraphEngine,
    JoinEntityEdgeProvider,
    LoadGraphEdgeProviders,
    MatchesGraphEdgeRequest,
    QueryEdgeProvider,
    QueryMetadataEdgeProvider,
    RecordLinkEdgeProvider,
} from '../index';
import { QueryEngine } from '../engines/QueryEngine';
import type {
    MJGraphConceptEntity,
    MJGraphConceptTypeEntity,
    MJGraphEdgeEntity,
    MJGraphEdgeProviderEntity,
    MJGraphEdgeTypeEndpointEntity,
    MJGraphEdgeTypeEntity,
    MJGraphEntity,
    MJGraphTypeEntity,
    MJQueryDependencyEntity,
    MJQueryEntityEntity,
} from '../generated/entity_subclasses';
import type { MJQueryEntityExtended } from '../custom/MJQueryEntityExtended';

// ============================================================================
// Fixtures & Helpers
// ============================================================================

const GRAPH_CANON_ID = '201B3BC8-2F16-45EF-9FCE-7490D755EF88';
const GRAPH_TYPE_CANON_ID = '9D33BA0C-89F1-4625-B2D7-2C719D49129E';

const ENTITY_MEMBERS_ID = 'AA104832-F36B-1410-8DB1-00021F8B792E';
const ENTITY_INVOICES_ID = 'BB204832-F36B-1410-8DB1-00021F8B792E';
const ENTITY_PAYMENTS_ID = 'CC304832-F36B-1410-8DB1-00021F8B792E';
const ENTITY_SECRET_ID = 'DD404832-F36B-1410-8DB1-00021F8B792E';

const ENTITY_META_ENTITIES_ID = 'E0004832-F36B-1410-8DB1-00021F8B792E';
const ENTITY_META_FIELDS_ID = 'E1004832-F36B-1410-8DB1-00021F8B792E';
const ENTITY_META_ABV_ID = 'E2004832-F36B-1410-8DB1-00021F8B792E';
const ENTITY_META_QUERIES_ID = 'E3004832-F36B-1410-8DB1-00021F8B792E';
const ENTITY_META_CONCEPTS_ID = 'E4004832-F36B-1410-8DB1-00021F8B792E';

const FIELD_INVOICE_TOTAL_ID = 'F1004832-F36B-1410-8DB1-00021F8B792E';
const FIELD_INVOICE_LEGACY_TOTAL_ID = 'F2004832-F36B-1410-8DB1-00021F8B792E';

const ABV_MEMBERS_ACTIVE_ID = 'AB104832-F36B-1410-8DB1-00021F8B792E';
const ABV_MEMBERS_AUTORENEW_ID = 'AB204832-F36B-1410-8DB1-00021F8B792E';
const ABV_INVOICES_OPEN_ID = 'AB304832-F36B-1410-8DB1-00021F8B792E';
const ABV_MEMBERS_DISABLED_ID = 'AB404832-F36B-1410-8DB1-00021F8B792E';

const QUERY_OPEN_AR_ID = 'A1104832-F36B-1410-8DB1-00021F8B792E';
const QUERY_BASE_AR_ID = 'A2204832-F36B-1410-8DB1-00021F8B792E';
const QUERY_RESTRICTED_ID = 'A3304832-F36B-1410-8DB1-00021F8B792E';

const CONCEPT_ACTIVE_MEMBER_ID = 'C1104832-F36B-1410-8DB1-00021F8B792E';
const CONCEPT_OPEN_AR_ID = 'C2204832-F36B-1410-8DB1-00021F8B792E';
const CONCEPT_AR_ID = 'C3304832-F36B-1410-8DB1-00021F8B792E';

const EDGE_TYPE_DEFINES_ID = 'FD68DC67-5135-4457-BB29-CD1BE6B28D7C';
const EDGE_TYPE_MEASURES_ID = '9D519621-DB8C-456E-9B42-81EC6AA02B72';
const EDGE_TYPE_DESCRIBES_ID = '112F91BC-B0D0-45B7-A660-1C28CAEBAC31';
const EDGE_TYPE_BROADER_ID = 'B5EA267A-0C34-4D37-AD5E-458FA0CA30CE';
const EDGE_TYPE_PREFERRED_ID = '853EDF46-947C-4114-83D9-B308762281E6';

function createTestUser(canReadSecret = false): UserInfo {
    return {
        ID: 'U1004832-F36B-1410-8DB1-00021F8B792E',
        Name: 'Test User',
        UserRoles: [{ Role: 'Users', RoleID: canReadSecret ? 'role-admin' : 'role-user' }],
    } as unknown as UserInfo;
}

function buildMockEntities(canReadSecret = false): EntityInfo[] {
    const makeEntity = (partial: Record<string, unknown>): EntityInfo => {
        const allowRead = partial['AllowRead'] !== false;
        return {
            ID: partial['ID'],
            Name: partial['Name'],
            DisplayNameOrName: partial['Name'],
            SchemaName: 'dbo',
            BaseView: `vw${String(partial['Name']).replace(/\W+/g, '')}`,
            Description: partial['Description'] ?? `${String(partial['Name'])} entity`,
            Icon: 'fa-solid fa-table',
            ParentID: partial['ParentID'] ?? null,
            ParentEntityInfo: partial['ParentEntityInfo'] ?? null,
            Fields: partial['Fields'] ?? [
                { ID: `${String(partial['ID'])}-pk`, Name: 'ID', IsPrimaryKey: true, IsNameField: false },
                { ID: `${String(partial['ID'])}-name`, Name: 'Name', IsPrimaryKey: false, IsNameField: true },
            ],
            FirstPrimaryKey: { Name: 'ID', IsPrimaryKey: true },
            NameField: { Name: 'Name', IsNameField: true },
            AlternateBaseViews: partial['AlternateBaseViews'] ?? [],
            Permissions: [{ RoleID: 'role-user', CanRead: allowRead }],
            GetUserPermisions: () => ({ CanRead: allowRead }),
        } as unknown as EntityInfo;
    };

    const membersEntity = makeEntity({
        ID: ENTITY_MEMBERS_ID,
        Name: 'Members',
        Description: 'Association member organizations and individuals.',
        AlternateBaseViews: [
            {
                ID: ABV_MEMBERS_ACTIVE_ID,
                EntityID: ENTITY_MEMBERS_ID,
                ParentID: null,
                Name: 'Active',
                EffectiveDisplayName: 'Active Members',
                EffectiveSchemaName: 'dbo',
                ViewName: 'vwActiveMembers',
                Description: 'Members with Status = Active and paid through current term.',
                Status: 'Active',
                IsUsable: true,
            },
            {
                ID: ABV_MEMBERS_AUTORENEW_ID,
                EntityID: ENTITY_MEMBERS_ID,
                ParentID: ABV_MEMBERS_ACTIVE_ID,
                Parent: 'Active',
                Name: 'ActiveAutoRenew',
                EffectiveDisplayName: 'Active Auto-Renew Members',
                EffectiveSchemaName: 'dbo',
                ViewName: 'vwActiveAutoRenewMembers',
                Description: 'Active members enrolled in automatic renewal.',
                Status: 'Active',
                IsUsable: true,
            },
            {
                ID: ABV_MEMBERS_DISABLED_ID,
                EntityID: ENTITY_MEMBERS_ID,
                ParentID: null,
                Name: 'DisabledView',
                EffectiveDisplayName: 'Disabled View',
                EffectiveSchemaName: 'dbo',
                ViewName: 'vwDisabledMembers',
                Description: 'Disabled view.',
                Status: 'Disabled',
                IsUsable: false,
            },
        ],
    });

    const invoicesEntity = makeEntity({
        ID: ENTITY_INVOICES_ID,
        Name: 'Invoices',
        Description: 'Customer billing invoices.',
        Fields: [
            { ID: 'inv-pk', Name: 'ID', IsPrimaryKey: true },
            { ID: 'inv-member', Name: 'MemberID', RelatedEntityID: ENTITY_MEMBERS_ID, RelatedEntity: 'Members' },
            { ID: 'inv-billto', Name: 'BillToMemberID', RelatedEntityID: ENTITY_MEMBERS_ID, RelatedEntity: 'Members' },
            { ID: FIELD_INVOICE_TOTAL_ID, Name: 'BalanceDue', DisplayNameOrName: 'Balance Due', Description: 'Canonical net remaining balance on the invoice.' },
            { ID: FIELD_INVOICE_LEGACY_TOTAL_ID, Name: 'LegacyBalance', DisplayNameOrName: 'Legacy Balance', Description: 'Deprecated pre-2024 balance column.' },
        ],
        AlternateBaseViews: [
            {
                ID: ABV_INVOICES_OPEN_ID,
                EntityID: ENTITY_INVOICES_ID,
                ParentID: null,
                Name: 'Open',
                EffectiveDisplayName: 'Open Invoices',
                EffectiveSchemaName: 'dbo',
                ViewName: 'vwInvoicesOpen',
                Description: 'Unpaid and partially paid posted invoices with BalanceDue > 0.',
                Status: 'Active',
                IsUsable: true,
            },
        ],
    });

    const paymentsEntity = makeEntity({
        ID: ENTITY_PAYMENTS_ID,
        Name: 'Invoice Payments',
        ParentID: ENTITY_INVOICES_ID,
        ParentEntityInfo: invoicesEntity,
        Fields: [
            { ID: 'pay-pk', Name: 'ID', IsPrimaryKey: true },
            { ID: 'pay-inv', Name: 'InvoiceID', RelatedEntityID: ENTITY_INVOICES_ID, RelatedEntity: 'Invoices' },
            { ID: 'pay-mem', Name: 'MemberID', RelatedEntityID: ENTITY_MEMBERS_ID, RelatedEntity: 'Members' },
            { ID: 'pay-wt', Name: 'AllocationWeight' },
            { ID: 'pay-method', Name: 'PaymentMethod' },
        ],
    });

    const secretEntity = makeEntity({
        ID: ENTITY_SECRET_ID,
        Name: 'Restricted Payroll',
        AllowRead: canReadSecret,
    });

    const metaEntities = [
        makeEntity({ ID: ENTITY_META_ENTITIES_ID, Name: 'MJ: Entities' }),
        makeEntity({ ID: ENTITY_META_FIELDS_ID, Name: 'MJ: Entity Fields' }),
        makeEntity({ ID: ENTITY_META_ABV_ID, Name: 'MJ: Entity Alternate Base Views' }),
        makeEntity({ ID: ENTITY_META_QUERIES_ID, Name: 'MJ: Queries' }),
        makeEntity({ ID: ENTITY_META_CONCEPTS_ID, Name: 'MJ: Graph Concepts' }),
    ];

    return [membersEntity, invoicesEntity, paymentsEntity, secretEntity, ...metaEntities];
}

function buildMockProvider(
    entities: EntityInfo[],
    runViewHandler?: (params: RunViewParams) => Promise<{ Success: boolean; Results: unknown[] }>,
    runQueryHandler?: (params: Record<string, unknown>) => Promise<{ Success: boolean; Results: unknown[] }>,
): IMetadataProvider & IRunViewProvider & IRunQueryProvider {
    return {
        Entities: entities,
        EntityByID: (id: string) => entities.find(e => e.ID.toLowerCase() === id?.toLowerCase()),
        EntityByName: (name: string) =>
            entities.find(e => e.Name.toLowerCase() === name?.trim().toLowerCase()),
        RunView: async (params: RunViewParams) =>
            runViewHandler ? runViewHandler(params) : { Success: true, Results: [] },
        RunViews: async (paramsList: RunViewParams[]) => {
            const out = [];
            for (const p of paramsList) {
                out.push(runViewHandler ? await runViewHandler(p) : { Success: true, Results: [] });
            }
            return out;
        },
        RunQuery: async (params: Record<string, unknown>) =>
            runQueryHandler ? runQueryHandler(params) : { Success: true, Results: [] },
    } as unknown as IMetadataProvider & IRunViewProvider & IRunQueryProvider;
}

function seedGraphAndQueryEngines(provider: IMetadataProvider, canRunRestrictedQuery = false): void {
    const graphEngine = GraphEngine.Instance as unknown as Record<string, unknown>;
    const queryEngine = QueryEngine.Instance as unknown as Record<string, unknown>;

    const canonGraph = {
        ID: GRAPH_CANON_ID,
        Name: 'MJ Canon',
        GraphTypeID: GRAPH_TYPE_CANON_ID,
        LoadMode: 'Preload',
        Status: 'Active',
    } as unknown as MJGraphEntity;

    const graphTypes: MJGraphTypeEntity[] = [
        {
            ID: GRAPH_TYPE_CANON_ID,
            Name: 'Canon',
            IsCanon: true,
            Rank: 10,
            Status: 'Active',
        } as unknown as MJGraphTypeEntity,
    ];

    const conceptTypes: MJGraphConceptTypeEntity[] = [
        {
            ID: 'CT-TERM-ID',
            Name: 'Term',
            IconClass: 'fa-solid fa-book-bookmark',
            Rank: 60,
            Status: 'Active',
        } as unknown as MJGraphConceptTypeEntity,
        {
            ID: 'CT-METRIC-ID',
            Name: 'Metric',
            IconClass: 'fa-solid fa-chart-line',
            Rank: 20,
            Status: 'Active',
        } as unknown as MJGraphConceptTypeEntity,
    ];

    const edgeTypes: MJGraphEdgeTypeEntity[] = [
        { ID: EDGE_TYPE_DEFINES_ID, GraphID: null, Name: 'Defines', IsDirected: true, DefaultWeight: 1.0, AllowStored: true },
        { ID: EDGE_TYPE_MEASURES_ID, GraphID: null, Name: 'Measures', IsDirected: true, DefaultWeight: 0.9, AllowStored: true },
        { ID: EDGE_TYPE_DESCRIBES_ID, GraphID: null, Name: 'Describes', IsDirected: true, DefaultWeight: 0.85, AllowStored: true },
        { ID: EDGE_TYPE_BROADER_ID, GraphID: null, Name: 'Broader Than', IsDirected: true, DefaultWeight: 0.85, AllowStored: true },
        { ID: EDGE_TYPE_PREFERRED_ID, GraphID: null, Name: 'Preferred Over', IsDirected: true, DefaultWeight: 0.9, AllowStored: true },
        { ID: 'ET-SUBSETS', GraphID: null, Name: 'Subsets', IsDirected: true, DefaultWeight: 1.0, AllowStored: false },
        { ID: 'ET-READS', GraphID: null, Name: 'Reads', IsDirected: true, DefaultWeight: 0.8, AllowStored: false },
        { ID: 'ET-COMPOSES', GraphID: null, Name: 'Composes', IsDirected: true, DefaultWeight: 0.9, AllowStored: false },
        { ID: 'ET-REFS', GraphID: null, Name: 'References', IsDirected: true, DefaultWeight: 0.6, AllowStored: false },
        { ID: 'ET-ISA', GraphID: null, Name: 'Is A', IsDirected: true, DefaultWeight: 1.0, AllowStored: false },
        { ID: 'ET-FIELDOF', GraphID: null, Name: 'Field Of', IsDirected: true, DefaultWeight: 1.0, AllowStored: false },
    ] as unknown as MJGraphEdgeTypeEntity[];

    const edgeProviders: MJGraphEdgeProviderEntity[] = [
        {
            ID: 'PROV-1',
            GraphID: GRAPH_CANON_ID,
            Name: 'Canon ABV Provider',
            DriverClass: 'AlternateBaseViewEdgeProvider',
            Configuration: '{}',
            Sequence: 10,
            IsActive: true,
        },
        {
            ID: 'PROV-2',
            GraphID: GRAPH_CANON_ID,
            Name: 'Canon Query Provider',
            DriverClass: 'QueryMetadataEdgeProvider',
            Configuration: '{"Include":["Reads","Composes"]}',
            Sequence: 20,
            IsActive: true,
        },
        {
            ID: 'PROV-3',
            GraphID: GRAPH_CANON_ID,
            Name: 'Canon Entity Provider',
            DriverClass: 'EntityMetadataEdgeProvider',
            Configuration: '{"Include":["References","IsA","FieldOf"]}',
            Sequence: 30,
            IsActive: true,
        },
    ] as unknown as MJGraphEdgeProviderEntity[];

    const concepts: MJGraphConceptEntity[] = [
        {
            ID: CONCEPT_ACTIVE_MEMBER_ID,
            GraphID: GRAPH_CANON_ID,
            Name: 'Active Member',
            ConceptTypeID: 'CT-TERM-ID',
            ConceptType: 'Term',
            AuthorityTier: 'Bylaws',
            Description: 'A member in good standing with an active membership term.',
            Specification: 'Filter Members using AlternateBaseView = Active (vwActiveMembers).',
            Synonyms: JSON.stringify(['Current Member', 'Good Standing Member']),
            Status: 'Approved',
        },
        {
            ID: CONCEPT_OPEN_AR_ID,
            GraphID: GRAPH_CANON_ID,
            Name: 'Open Accounts Receivable',
            ConceptTypeID: 'CT-METRIC-ID',
            ConceptType: 'Metric',
            AuthorityTier: 'Board Policy',
            Description: 'Total unpaid balance across posted open invoices.',
            Specification: 'Sum BalanceDue from vwInvoicesOpen or run Open AR by Quarter.',
            Synonyms: JSON.stringify(['Open AR', 'Outstanding Receivables']),
            Status: 'Approved',
        },
        {
            ID: CONCEPT_AR_ID,
            GraphID: GRAPH_CANON_ID,
            Name: 'Accounts Receivable',
            ConceptTypeID: 'CT-METRIC-ID',
            ConceptType: 'Metric',
            AuthorityTier: 'Board Policy',
            Description: 'Umbrella financial domain covering all billed receivables.',
            Specification: null,
            Synonyms: JSON.stringify(['AR']),
            Status: 'Approved',
        },
    ] as unknown as MJGraphConceptEntity[];

    const storedEdges: MJGraphEdgeEntity[] = [
        // Members.Active --Defines--> Concept: Active Member
        {
            ID: 'SE-1',
            GraphID: GRAPH_CANON_ID,
            EdgeTypeID: EDGE_TYPE_DEFINES_ID,
            EdgeType: 'Defines',
            SourceEntityID: ENTITY_META_ABV_ID,
            SourceEntity: 'MJ: Entity Alternate Base Views',
            SourceRecordID: ABV_MEMBERS_ACTIVE_ID,
            TargetEntityID: ENTITY_META_CONCEPTS_ID,
            TargetEntity: 'MJ: Graph Concepts',
            TargetRecordID: CONCEPT_ACTIVE_MEMBER_ID,
            Weight: 1.0,
            Description: 'vwActiveMembers is the canonical cohort filter for Active Member',
            Origin: 'Declared',
            Status: 'Approved',
            Confidence: null,
        },
        // Invoices.Open --Defines--> Concept: Open Accounts Receivable
        {
            ID: 'SE-2',
            GraphID: GRAPH_CANON_ID,
            EdgeTypeID: EDGE_TYPE_DEFINES_ID,
            EdgeType: 'Defines',
            SourceEntityID: ENTITY_META_ABV_ID,
            SourceEntity: 'MJ: Entity Alternate Base Views',
            SourceRecordID: ABV_INVOICES_OPEN_ID,
            TargetEntityID: ENTITY_META_CONCEPTS_ID,
            TargetEntity: 'MJ: Graph Concepts',
            TargetRecordID: CONCEPT_OPEN_AR_ID,
            Weight: 1.0,
            Description: 'vwInvoicesOpen defines the open invoice population',
            Origin: 'Declared',
            Status: 'Approved',
            Confidence: null,
        },
        // Query: Open AR by Quarter --Measures--> Concept: Open Accounts Receivable
        {
            ID: 'SE-3',
            GraphID: GRAPH_CANON_ID,
            EdgeTypeID: EDGE_TYPE_MEASURES_ID,
            EdgeType: 'Measures',
            SourceEntityID: ENTITY_META_QUERIES_ID,
            SourceEntity: 'MJ: Queries',
            SourceRecordID: QUERY_OPEN_AR_ID,
            TargetEntityID: ENTITY_META_CONCEPTS_ID,
            TargetEntity: 'MJ: Graph Concepts',
            TargetRecordID: CONCEPT_OPEN_AR_ID,
            Weight: 0.95,
            Description: 'Computes quarterly Open AR totals',
            Origin: 'Declared',
            Status: 'Approved',
            Confidence: null,
        },
        // Concept: Accounts Receivable --Broader Than--> Concept: Open Accounts Receivable
        {
            ID: 'SE-4',
            GraphID: GRAPH_CANON_ID,
            EdgeTypeID: EDGE_TYPE_BROADER_ID,
            EdgeType: 'Broader Than',
            SourceEntityID: ENTITY_META_CONCEPTS_ID,
            SourceEntity: 'MJ: Graph Concepts',
            SourceRecordID: CONCEPT_AR_ID,
            TargetEntityID: ENTITY_META_CONCEPTS_ID,
            TargetEntity: 'MJ: Graph Concepts',
            TargetRecordID: CONCEPT_OPEN_AR_ID,
            Weight: 0.85,
            Description: 'Accounts Receivable encompasses Open Accounts Receivable',
            Origin: 'Declared',
            Status: 'Approved',
            Confidence: null,
        },
        // Field: Invoices.BalanceDue --Preferred Over--> Field: Invoices.LegacyBalance
        {
            ID: 'SE-5',
            GraphID: GRAPH_CANON_ID,
            EdgeTypeID: EDGE_TYPE_PREFERRED_ID,
            EdgeType: 'Preferred Over',
            SourceEntityID: ENTITY_META_FIELDS_ID,
            SourceEntity: 'MJ: Entity Fields',
            SourceRecordID: FIELD_INVOICE_TOTAL_ID,
            TargetEntityID: ENTITY_META_FIELDS_ID,
            TargetEntity: 'MJ: Entity Fields',
            TargetRecordID: FIELD_INVOICE_LEGACY_TOTAL_ID,
            Weight: 0.95,
            Description: 'Always use BalanceDue instead of deprecated LegacyBalance',
            Origin: 'Declared',
            Status: 'Approved',
            Confidence: null,
        },
        // Entity: Invoices --Describes--> Concept: Open Accounts Receivable
        {
            ID: 'SE-6',
            GraphID: GRAPH_CANON_ID,
            EdgeTypeID: EDGE_TYPE_DESCRIBES_ID,
            EdgeType: 'Describes',
            SourceEntityID: ENTITY_META_ENTITIES_ID,
            SourceEntity: 'MJ: Entities',
            SourceRecordID: ENTITY_INVOICES_ID,
            TargetEntityID: ENTITY_META_CONCEPTS_ID,
            TargetEntity: 'MJ: Graph Concepts',
            TargetRecordID: CONCEPT_OPEN_AR_ID,
            Weight: 0.8,
            Description: 'Invoices holds the billing rows for Open AR',
            Origin: 'Declared',
            Status: 'Approved',
            Confidence: null,
        },
    ] as unknown as MJGraphEdgeEntity[];

    const queries: MJQueryEntityExtended[] = [
        {
            ID: QUERY_OPEN_AR_ID,
            Name: 'Open AR by Quarter',
            CategoryPath: 'Finance/AR',
            Description: 'Quarterly breakdown of open accounts receivable by member tier.',
            Status: 'Approved',
            UserCanRun: () => ({ canRun: true, deniedEntities: [] }),
        } as unknown as MJQueryEntityExtended,
        {
            ID: QUERY_BASE_AR_ID,
            Name: 'Base Open Invoice Ledger',
            CategoryPath: 'Finance/AR',
            Description: 'Base reusable query over vwInvoicesOpen.',
            Status: 'Approved',
            UserCanRun: () => ({ canRun: true, deniedEntities: [] }),
        } as unknown as MJQueryEntityExtended,
        {
            ID: QUERY_RESTRICTED_ID,
            Name: 'Restricted Executive AR Audit',
            CategoryPath: 'Finance/Internal',
            Description: 'Executive-only audit query.',
            Status: 'Approved',
            UserCanRun: () => ({ canRun: canRunRestrictedQuery, deniedEntities: canRunRestrictedQuery ? [] : ['Restricted Payroll'] }),
        } as unknown as MJQueryEntityExtended,
    ];

    const queryEntities: MJQueryEntityEntity[] = [
        {
            ID: 'QE-1',
            QueryID: QUERY_OPEN_AR_ID,
            Query: 'Open AR by Quarter',
            EntityID: ENTITY_INVOICES_ID,
            Entity: 'Invoices',
            AlternateBaseViewID: ABV_INVOICES_OPEN_ID,
            AlternateBaseView: 'Open',
            DetectionMethod: 'Parser',
            AutoDetectConfidenceScore: null,
        },
        {
            ID: 'QE-2',
            QueryID: QUERY_OPEN_AR_ID,
            Query: 'Open AR by Quarter',
            EntityID: ENTITY_MEMBERS_ID,
            Entity: 'Members',
            AlternateBaseViewID: ABV_MEMBERS_ACTIVE_ID,
            AlternateBaseView: 'Active',
            DetectionMethod: 'Parser',
            AutoDetectConfidenceScore: null,
        },
        {
            ID: 'QE-3',
            QueryID: QUERY_BASE_AR_ID,
            Query: 'Base Open Invoice Ledger',
            EntityID: ENTITY_INVOICES_ID,
            Entity: 'Invoices',
            AlternateBaseViewID: null,
            AlternateBaseView: null,
            DetectionMethod: 'Parser',
            AutoDetectConfidenceScore: null,
        },
        {
            ID: 'QE-4',
            QueryID: QUERY_RESTRICTED_ID,
            Query: 'Restricted Executive AR Audit',
            EntityID: ENTITY_INVOICES_ID,
            Entity: 'Invoices',
            AlternateBaseViewID: ABV_INVOICES_OPEN_ID,
            AlternateBaseView: 'Open',
            DetectionMethod: 'Parser',
            AutoDetectConfidenceScore: null,
        },
    ] as unknown as MJQueryEntityEntity[];

    const queryDependencies: MJQueryDependencyEntity[] = [
        {
            ID: 'QD-1',
            QueryID: QUERY_OPEN_AR_ID,
            Query: 'Open AR by Quarter',
            DependsOnQueryID: QUERY_BASE_AR_ID,
            DependsOnQuery: 'Base Open Invoice Ledger',
            ReferencePath: 'Finance/AR/Base Open Invoice Ledger',
            Alias: 'base_ledger',
            DetectionMethod: 'Auto',
        },
    ] as unknown as MJQueryDependencyEntity[];

    queryEngine['_queries'] = queries;
    queryEngine['_queryEntities'] = queryEntities;
    queryEngine['_dependencies'] = queryDependencies;

    graphEngine['_graphs'] = [canonGraph];
    graphEngine['_graphTypes'] = graphTypes;
    graphEngine['_conceptTypes'] = conceptTypes;
    graphEngine['_authorityTiers'] = [];
    graphEngine['_edgeTypes'] = edgeTypes;
    graphEngine['_edgeTypeEndpoints'] = [] as MJGraphEdgeTypeEndpointEntity[];
    graphEngine['_edgeProviders'] = edgeProviders;
    graphEngine['_concepts'] = concepts;
    graphEngine['_storedEdges'] = storedEdges;
    graphEngine['_provider'] = provider;
    (GraphEngine.Instance as unknown as { _preloadedGraphMemos: { Clear: () => void } })._preloadedGraphMemos.Clear();
}

// ============================================================================
// Tests
// ============================================================================

describe('Semantic Graph Engine & Derived Edge Providers', () => {
    let entities: EntityInfo[];
    let provider: IMetadataProvider & IRunViewProvider & IRunQueryProvider;
    let user: UserInfo;

    beforeEach(() => {
        LoadGraphEdgeProviders();
        entities = buildMockEntities(false);
        provider = buildMockProvider(entities);
        user = createTestUser(false);
        seedGraphAndQueryEngines(provider, false);
    });

    describe('BaseGraphEdgeProvider utilities', () => {
        it('normalizes node keys and derived edge IDs case-insensitively', () => {
            const keyUpper = BuildGraphNodeKey('MJ: Entities', 'AA104832-F36B-1410-8DB1-00021F8B792E');
            const keyLower = BuildGraphNodeKey('MJ: Entities', 'aa104832-f36b-1410-8db1-00021f8b792e');
            expect(keyUpper).toBe(keyLower);

            const id = BuildDerivedGraphEdgeID(
                'AlternateBaseViewEdgeProvider',
                'Subsets',
                { EntityName: 'MJ: Entity Alternate Base Views', RecordID: ABV_MEMBERS_ACTIVE_ID },
                { EntityName: 'MJ: Entities', RecordID: ENTITY_MEMBERS_ID },
            );
            expect(id).toContain('derived:AlternateBaseViewEdgeProvider:Subsets:');
        });

        it('matches edge requests by Direction and EdgeTypes', () => {
            const edge = {
                TypeName: 'Subsets',
                Source: { EntityName: 'MJ: Entity Alternate Base Views', RecordID: ABV_MEMBERS_ACTIVE_ID },
                Target: { EntityName: 'MJ: Entities', RecordID: ENTITY_MEMBERS_ID },
                IsDirected: true,
            };

            expect(
                MatchesGraphEdgeRequest(edge, {
                    Nodes: [{ EntityName: 'MJ: Entity Alternate Base Views', RecordID: ABV_MEMBERS_ACTIVE_ID.toLowerCase() }],
                    Direction: 'Out',
                }),
            ).toBe(true);

            expect(
                MatchesGraphEdgeRequest(edge, {
                    Nodes: [{ EntityName: 'MJ: Entity Alternate Base Views', RecordID: ABV_MEMBERS_ACTIVE_ID }],
                    Direction: 'In',
                }),
            ).toBe(false);

            expect(
                MatchesGraphEdgeRequest(edge, {
                    Nodes: [{ EntityName: 'MJ: Entities', RecordID: ENTITY_MEMBERS_ID }],
                    Direction: 'In',
                    EdgeTypes: ['subsets'],
                }),
            ).toBe(true);
        });
    });

    describe('Metadata-Scale Edge Providers', () => {
        it('AlternateBaseViewEdgeProvider emits Subsets edges to owning entity and parent view, skipping Disabled views', async () => {
            const abvProvider = new AlternateBaseViewEdgeProvider();
            expect(abvProvider.SupportsEnumeration).toBe(true);

            const edges = await abvProvider.GetEdges(
                { Direction: 'Both' },
                {
                    Graph: GraphEngine.Instance.Graphs[0],
                    Config: {},
                    User: user,
                    Provider: provider,
                },
            );

            // 3 Subsets edges:
            // 1. Active -> Members
            // 2. ActiveAutoRenew -> Members
            // 3. ActiveAutoRenew -> Active (parent ABV)
            // 4. Open -> Invoices
            expect(edges).toHaveLength(4);
            expect(edges.every(e => e.TypeName === 'Subsets' && e.Origin === 'Derived')).toBe(true);
            expect(edges.some(e => e.Source.RecordID === ABV_MEMBERS_DISABLED_ID)).toBe(false);
            expect(
                edges.some(
                    e =>
                        e.Source.RecordID === ABV_MEMBERS_AUTORENEW_ID &&
                        e.Target.EntityName === 'MJ: Entity Alternate Base Views' &&
                        e.Target.RecordID === ABV_MEMBERS_ACTIVE_ID,
                ),
            ).toBe(true);
        });

        it('EntityMetadataEdgeProvider emits References (grouped by target), Is A, and Field Of for stored-edge fields', async () => {
            const entityProvider = new EntityMetadataEdgeProvider();
            expect(entityProvider.SupportsEnumeration).toBe(true);

            const edges = await entityProvider.GetEdges(
                { Direction: 'Both' },
                {
                    Graph: GraphEngine.Instance.Graphs[0],
                    Config: { Include: ['References', 'IsA', 'FieldOf'] },
                    User: user,
                    Provider: provider,
                    StoredEdgeFieldIDs: new Set([
                        FIELD_INVOICE_TOTAL_ID.toLowerCase(),
                        FIELD_INVOICE_LEGACY_TOTAL_ID.toLowerCase(),
                    ]),
                },
            );

            const refEdges = edges.filter(e => e.TypeName === 'References');
            const isAEdges = edges.filter(e => e.TypeName === 'Is A');
            const fieldOfEdges = edges.filter(e => e.TypeName === 'Field Of');

            // Invoices has 2 FK fields to Members (MemberID, BillToMemberID) -> combined into 1 References edge
            const invToMembers = refEdges.find(
                e => e.Source.RecordID === ENTITY_INVOICES_ID && e.Target.RecordID === ENTITY_MEMBERS_ID,
            );
            expect(invToMembers).toBeDefined();
            expect(invToMembers?.Description).toBe('via MemberID, BillToMemberID');

            // Invoice Payments Is A Invoices
            expect(isAEdges).toHaveLength(1);
            expect(isAEdges[0].Source.RecordID).toBe(ENTITY_PAYMENTS_ID);
            expect(isAEdges[0].Target.RecordID).toBe(ENTITY_INVOICES_ID);

            // Field Of emitted only for the 2 fields in StoredEdgeFieldIDs
            expect(fieldOfEdges).toHaveLength(2);
            expect(fieldOfEdges.every(e => e.Target.RecordID === ENTITY_INVOICES_ID)).toBe(true);
        });

        it('QueryMetadataEdgeProvider emits Reads (to ABV when AlternateBaseViewID is set, else Entity) and Composes', async () => {
            const queryProvider = new QueryMetadataEdgeProvider();
            expect(queryProvider.SupportsEnumeration).toBe(true);

            const edges = await queryProvider.GetEdges(
                { Direction: 'Both' },
                {
                    Graph: GraphEngine.Instance.Graphs[0],
                    Config: { Include: ['Reads', 'Composes'] },
                    User: user,
                    Provider: provider,
                },
            );

            const readsEdges = edges.filter(e => e.TypeName === 'Reads');
            const composesEdges = edges.filter(e => e.TypeName === 'Composes');

            // Open AR by Quarter reads Invoices.Open (ABV) and Members.Active (ABV)
            expect(
                readsEdges.some(
                    e =>
                        e.Source.RecordID === QUERY_OPEN_AR_ID &&
                        e.Target.EntityName === 'MJ: Entity Alternate Base Views' &&
                        e.Target.RecordID === ABV_INVOICES_OPEN_ID,
                ),
            ).toBe(true);

            // Base Open Invoice Ledger reads Invoices (Entity directly)
            expect(
                readsEdges.some(
                    e =>
                        e.Source.RecordID === QUERY_BASE_AR_ID &&
                        e.Target.EntityName === 'MJ: Entities' &&
                        e.Target.RecordID === ENTITY_INVOICES_ID,
                ),
            ).toBe(true);

            // Open AR by Quarter composes Base Open Invoice Ledger
            expect(composesEdges).toHaveLength(1);
            expect(composesEdges[0].Source.RecordID).toBe(QUERY_OPEN_AR_ID);
            expect(composesEdges[0].Target.RecordID).toBe(QUERY_BASE_AR_ID);
            expect(composesEdges[0].Description).toContain('base_ledger');
        });
    });

    describe('Data-Scale Edge Providers', () => {
        it('ForeignKeyEdgeProvider projects FK rows via batched RunView and supports Reverse orientation', async () => {
            const capturedParams: RunViewParams[] = [];
            const dataProvider = buildMockProvider(entities, async (params) => {
                capturedParams.push(params);
                return {
                    Success: true,
                    Results: [
                        { ID: 'INV-100', MemberID: 'MEM-1' },
                        { ID: 'INV-101', MemberID: 'MEM-1' },
                    ],
                };
            });

            const fkProvider = new ForeignKeyEdgeProvider();
            expect(fkProvider.SupportsEnumeration).toBe(false);

            const edges = await fkProvider.GetEdges(
                {
                    Nodes: [{ EntityName: 'Members', RecordID: 'MEM-1' }],
                    Direction: 'Out',
                },
                {
                    Graph: GraphEngine.Instance.Graphs[0],
                    Config: {
                        EntityName: 'Invoices',
                        ForeignKeyField: 'MemberID',
                        EdgeType: 'Has Invoice',
                        Reverse: true,
                    },
                    User: user,
                    Provider: dataProvider,
                },
            );

            expect(capturedParams).toHaveLength(1);
            expect(capturedParams[0].EntityName).toBe('Invoices');
            expect(capturedParams[0].ExtraFilter).toContain("MemberID IN ('MEM-1')");
            expect(edges).toHaveLength(2);
            expect(edges[0].Source).toEqual({ EntityName: 'Members', RecordID: 'MEM-1' });
            expect(edges[0].Target).toEqual({ EntityName: 'Invoices', RecordID: 'INV-100' });
        });

        it('JoinEntityEdgeProvider projects many-to-many rows with WeightField and AttributeFields', async () => {
            const dataProvider = buildMockProvider(entities, async () => ({
                Success: true,
                Results: [
                    {
                        InvoiceID: 'INV-100',
                        MemberID: 'MEM-1',
                        AllocationWeight: 0.75,
                        PaymentMethod: 'ACH',
                    },
                ],
            }));

            const joinProvider = new JoinEntityEdgeProvider();
            const edges = await joinProvider.GetEdges(
                {
                    Nodes: [{ EntityName: 'Invoices', RecordID: 'INV-100' }],
                    Direction: 'Out',
                },
                {
                    Graph: GraphEngine.Instance.Graphs[0],
                    Config: {
                        JoinEntity: 'Invoice Payments',
                        SourceField: 'InvoiceID',
                        TargetField: 'MemberID',
                        EdgeType: 'Paid By',
                        WeightField: 'AllocationWeight',
                        AttributeFields: ['PaymentMethod'],
                    },
                    User: user,
                    Provider: dataProvider,
                },
            );

            expect(edges).toHaveLength(1);
            expect(edges[0].TypeName).toBe('Paid By');
            expect(edges[0].Weight).toBe(0.75);
            expect(edges[0].Attributes).toEqual({ PaymentMethod: 'ACH' });
            expect(edges[0].Source).toEqual({ EntityName: 'Invoices', RecordID: 'INV-100' });
            expect(edges[0].Target).toEqual({ EntityName: 'Members', RecordID: 'MEM-1' });
        });

        it('QueryEdgeProvider executes an MJ Query via RunQuery and maps result rows into edges', async () => {
            const dataProvider = buildMockProvider(
                entities,
                undefined,
                async () => ({
                    Success: true,
                    Results: [
                        {
                            SourceEntity: 'Members',
                            SourceRecordID: 'MEM-1',
                            TargetEntity: 'Members',
                            TargetRecordID: 'MEM-2',
                            EdgeType: 'Co-Attended With',
                            Weight: 0.88,
                            Description: 'Shared 4 annual conferences',
                            SharedEventCount: 4,
                        },
                    ],
                }),
            );

            const qEdgeProvider = new QueryEdgeProvider();
            const edges = await qEdgeProvider.GetEdges(
                {
                    Nodes: [{ EntityName: 'Members', RecordID: 'MEM-1' }],
                    Direction: 'Both',
                },
                {
                    Graph: GraphEngine.Instance.Graphs[0],
                    Config: {
                        QueryName: 'Member Co-Attendance',
                        IsDirected: false,
                    },
                    User: user,
                    Provider: dataProvider,
                },
            );

            expect(edges).toHaveLength(1);
            expect(edges[0].TypeName).toBe('Co-Attended With');
            expect(edges[0].IsDirected).toBe(false);
            expect(edges[0].Weight).toBe(0.88);
            expect(edges[0].Attributes).toEqual({ SharedEventCount: 4 });
        });

        it('RecordLinkEdgeProvider projects MJ: Record Links rows into edges', async () => {
            const dataProvider = buildMockProvider(entities, async () => ({
                Success: true,
                Results: [
                    {
                        ID: 'RL-1',
                        SourceEntityID: ENTITY_INVOICES_ID,
                        SourceEntity: 'Invoices',
                        SourceRecordID: 'INV-100',
                        TargetEntityID: ENTITY_MEMBERS_ID,
                        TargetEntity: 'Members',
                        TargetRecordID: 'MEM-1',
                        LinkType: 'Escalation Contact',
                        Metadata: '{"Priority":"High"}',
                    },
                ],
            }));

            const rlProvider = new RecordLinkEdgeProvider();
            const edges = await rlProvider.GetEdges(
                {
                    Nodes: [{ EntityName: 'Invoices', RecordID: 'INV-100' }],
                    Direction: 'Out',
                },
                {
                    Graph: GraphEngine.Instance.Graphs[0],
                    Config: { LinkTypes: ['Escalation Contact'] },
                    User: user,
                    Provider: dataProvider,
                },
            );

            expect(edges).toHaveLength(1);
            expect(edges[0].TypeName).toBe('Escalation Contact');
            expect(edges[0].Attributes).toEqual({ Priority: 'High' });
        });
    });

    describe('GraphEngine Subgraph, Permissions & CanonGraphEngine', () => {
        it('expands a multi-hop Canon subgraph combining stored concept edges and derived metadata edges', async () => {
            vi.spyOn(
                await import('@memberjunction/core'),
                'Metadata',
                'get' as never,
            ).mockReturnValue({ Provider: provider } as never);
            // Set Metadata.Provider directly as well
            const coreMod = await import('@memberjunction/core');
            (coreMod.Metadata as unknown as { Provider: unknown }).Provider = provider;

            const subgraph = await GraphEngine.Instance.Subgraph(
                'MJ Canon',
                [{ EntityName: 'MJ: Graph Concepts', RecordID: CONCEPT_OPEN_AR_ID }],
                { Depth: 2, Direction: 'Both', MaxNodes: 25 },
                user,
            );

            const labels = subgraph.Nodes.map(n => n.Label);
            // Hop 0: Open Accounts Receivable
            expect(labels).toContain('Open Accounts Receivable');
            // Hop 1 via stored Defines / Measures / Broader Than:
            // - Invoices.Open Invoices (vwInvoicesOpen)
            // - Finance/AR/Open AR by Quarter
            // - Accounts Receivable
            expect(labels.some(l => l.includes('vwInvoicesOpen'))).toBe(true);
            expect(labels).toContain('Finance/AR/Open AR by Quarter');
            expect(labels).toContain('Accounts Receivable');
            // Hop 2 via derived Subsets / Composes / Reads:
            // - Invoices entity (via Invoices.Open --Subsets--> Invoices)
            // - Base Open Invoice Ledger (via Open AR by Quarter --Composes--> Base Open Invoice Ledger)
            // - Members.Active (via Open AR by Quarter --Reads--> Members.Active)
            expect(labels).toContain('Invoices');
            expect(labels).toContain('Finance/AR/Base Open Invoice Ledger');
            expect(labels.some(l => l.includes('vwActiveMembers'))).toBe(true);

            // Restricted query (QUERY_RESTRICTED_ID) also reads Invoices.Open, but UserCanRun is false -> must be dropped!
            expect(
                subgraph.Nodes.some(n => n.RecordID.toLowerCase() === QUERY_RESTRICTED_ID.toLowerCase()),
            ).toBe(false);
            expect(
                subgraph.Edges.some(
                    e =>
                        e.Source.RecordID.toLowerCase() === QUERY_RESTRICTED_ID.toLowerCase() ||
                        e.Target.RecordID.toLowerCase() === QUERY_RESTRICTED_ID.toLowerCase(),
                ),
            ).toBe(false);
        });

        it('drops RLS-hidden data nodes and their incident edges during label resolution', async () => {
            const coreMod = await import('@memberjunction/core');
            const onDemandGraph: MJGraphEntity = {
                ID: 'OD-GRAPH-1',
                Name: 'Member Network',
                GraphTypeID: GRAPH_TYPE_CANON_ID,
                LoadMode: 'OnDemand',
                Status: 'Active',
            } as unknown as MJGraphEntity;

            const fkProviderRow: MJGraphEdgeProviderEntity = {
                ID: 'OD-PROV-1',
                GraphID: 'OD-GRAPH-1',
                Name: 'Invoice To Member FK',
                DriverClass: 'ForeignKeyEdgeProvider',
                Configuration: JSON.stringify({
                    EntityName: 'Invoices',
                    ForeignKeyField: 'MemberID',
                    EdgeType: 'Billed To',
                }),
                Sequence: 10,
                IsActive: true,
            } as unknown as MJGraphEdgeProviderEntity;

            const rlsProvider = buildMockProvider(entities, async (params) => {
                if (
                    params.EntityName === 'Invoices' &&
                    typeof params.ExtraFilter === 'string' &&
                    params.ExtraFilter.includes('MemberID IS NOT NULL')
                ) {
                    // FK provider returns edges to MEM-VISIBLE and MEM-RLS-HIDDEN
                    return {
                        Success: true,
                        Results: [
                            { ID: 'INV-1', MemberID: 'MEM-VISIBLE' },
                            { ID: 'INV-1', MemberID: 'MEM-RLS-HIDDEN' },
                        ],
                    };
                }
                if (params.EntityName === 'Invoices') {
                    return {
                        Success: true,
                        Results: [{ ID: 'INV-1', Name: 'Invoice #1001' }],
                    };
                }
                if (params.EntityName === 'Members') {
                    // Only MEM-VISIBLE comes back under caller's RLS; MEM-RLS-HIDDEN is filtered out by RLS
                    return {
                        Success: true,
                        Results: [{ ID: 'MEM-VISIBLE', Name: 'Acme Corp' }],
                    };
                }
                return { Success: true, Results: [] };
            });

            (coreMod.Metadata as unknown as { Provider: unknown }).Provider = rlsProvider;
            const ge = GraphEngine.Instance as unknown as Record<string, unknown>;
            ge['_graphs'] = [onDemandGraph];
            ge['_edgeProviders'] = [fkProviderRow];
            ge['_storedEdges'] = [];
            ge['_provider'] = rlsProvider;

            const subgraph = await GraphEngine.Instance.Subgraph(
                'Member Network',
                [{ EntityName: 'Invoices', RecordID: 'INV-1' }],
                { Depth: 1, Direction: 'Out' },
                user,
            );

            expect(subgraph.Nodes.map(n => n.RecordID)).toEqual(['INV-1', 'MEM-VISIBLE']);
            expect(subgraph.Edges).toHaveLength(1);
            expect(subgraph.Edges[0].Target.RecordID).toBe('MEM-VISIBLE');
        });

        it('CanonGraphEngine.FindConcepts matches exact names, synonyms, and stemmed plurals', async () => {
            const coreMod = await import('@memberjunction/core');
            (coreMod.Metadata as unknown as { Provider: unknown }).Provider = provider;

            // Synonym match: "Open AR" -> "Open Accounts Receivable"
            const bySynonym = CanonGraphEngine.Instance.FindConcepts('What is our Open AR?', user);
            expect(bySynonym.length).toBeGreaterThan(0);
            expect(bySynonym[0].Label).toBe('Open Accounts Receivable');

            // Stemmed plural match: "active members" -> "Active Member"
            const byStem = CanonGraphEngine.Instance.FindConcepts(
                'How many active members renewed this quarter?',
                user,
            );
            expect(byStem.some(c => c.Label === 'Active Member')).toBe(true);
        });

        it('CanonGraphEngine.CanonContext & DescribeForPrompt surface concepts, views, queries, and Preferred Over rules', async () => {
            const coreMod = await import('@memberjunction/core');
            (coreMod.Metadata as unknown as { Provider: unknown }).Provider = provider;

            const subgraph = await CanonGraphEngine.Instance.CanonContext(
                'Show me Open AR for Invoices',
                { Depth: 2, MaxNodes: 30 },
                user,
            );

            const prompt = GraphEngine.Instance.DescribeForPrompt(subgraph);
            expect(prompt).toContain('### Governed Concepts');
            expect(prompt).toContain('**Open Accounts Receivable**');
            expect(prompt).toContain('### Governance & Precedence Rules');
            expect(prompt).toContain('-[Preferred Over]->');
            expect(prompt).toContain('Invoices.Balance Due');
            expect(prompt).toContain('Invoices.Legacy Balance');
            expect(prompt).toContain('### Canonical Alternate Base Views');
            expect(prompt).toContain('vwInvoicesOpen');
            expect(prompt).toContain('### Governed Queries');
            expect(prompt).toContain('Finance/AR/Open AR by Quarter');

            const summary = await CanonGraphEngine.Instance.GetEntityCanonSummary('Invoices', user);
            expect(summary).not.toBeNull();
            expect(summary?.Concepts.some(c => c.Name === 'Open Accounts Receivable')).toBe(true);
            expect(summary?.AlternateBaseViews.some(v => v.ViewName === 'vwInvoicesOpen')).toBe(true);
            expect(summary?.Queries.some(q => q.Name === 'Open AR by Quarter')).toBe(true);
            expect(summary?.PrecedenceRules).toHaveLength(1);
        });

        it('CanonGraphEngine.RenderCanonDocument collapses full Canon and query/subgraph slices into deterministic Markdown', async () => {
            const coreMod = await import('@memberjunction/core');
            (coreMod.Metadata as unknown as { Provider: unknown }).Provider = provider;

            // 1. Full Canon document collapse
            const fullDoc = CanonGraphEngine.Instance.RenderCanonDocument({}, user);
            expect(fullDoc).toContain('# Organizational Canon & Domain Knowledge (MJ Canon)');
            expect(fullDoc).toContain('## 1. Precedence & Deprecation Rules');
            expect(fullDoc).toContain('**Invoices.BalanceDue** is PREFERRED OVER **Invoices.LegacyBalance**');
            expect(fullDoc).toContain('## 2. Domain Concepts & Definitions');
            expect(fullDoc).toContain('### Active Member (Term) — Authority: Bylaws');
            expect(fullDoc).toContain('### Open Accounts Receivable (Metric) — Authority: Board Policy');
            expect(fullDoc).toContain('- **Broader Concept:** Accounts Receivable');
            expect(fullDoc).toContain('## 3. Canonical Entity Subsets (Alternate Base Views)');
            expect(fullDoc).toContain('`[dbo].[vwActiveMembers]`');
            expect(fullDoc).toContain('`[dbo].[vwInvoicesOpen]`');
            expect(fullDoc).toContain('## 4. Governed Ground-Truth Queries');
            expect(fullDoc).toContain('`Finance/AR/Open AR by Quarter`');

            // 2. Question-sliced collapse (only "Active Member" / Members subgraph)
            const memberSliceDoc = CanonGraphEngine.Instance.RenderCanonDocument(
                { Question: 'Who is an active member?' },
                user,
            );
            expect(memberSliceDoc).toContain('### Active Member (Term) — Authority: Bylaws');
            expect(memberSliceDoc).toContain('`[dbo].[vwActiveMembers]`');
            expect(memberSliceDoc).not.toContain('### Open Accounts Receivable');
            expect(memberSliceDoc).not.toContain('`Finance/AR/Base Open Invoice Ledger`');

            // 3. Pre-expanded Subgraph collapse
            const arSubgraph = await CanonGraphEngine.Instance.CanonContext(
                'Show me Open AR for Invoices',
                { Depth: 2, MaxNodes: 30 },
                user,
            );
            const arSubgraphDoc = CanonGraphEngine.Instance.RenderCanonDocument(
                { Subgraph: arSubgraph },
                user,
            );
            expect(arSubgraphDoc).toContain('### Open Accounts Receivable (Metric)');
            expect(arSubgraphDoc).toContain('**Invoices.BalanceDue** is PREFERRED OVER **Invoices.LegacyBalance**');
            expect(arSubgraphDoc).toContain('`Finance/AR/Open AR by Quarter`');
        });
    });
});
