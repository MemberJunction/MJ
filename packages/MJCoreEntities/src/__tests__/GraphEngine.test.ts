import { describe, it, expect, beforeEach } from 'vitest';
import type {
    EntityInfo,
    IMetadataProvider,
    IRunQueryProvider,
    IRunViewProvider,
    RunQueryResult,
    RunViewParams,
    RunViewResult,
    UserInfo,
} from '@memberjunction/core';
import {
    GraphEngine,
    LoadGraphEdgeProviders,
    ForeignKeyEdgeProvider,
    JoinEntityEdgeProvider,
    QueryEdgeProvider,
    RecordLinkEdgeProvider,
    EntityMetadataEdgeProvider,
    QueryMetadataEdgeProvider,
    AlternateBaseViewEdgeProvider,
    type GraphProviderContext,
} from '../graph';
import { CanonGraphEngine, CreateCanonGraphExpansionService } from '../engines/CanonGraphEngine';
import { QueryEngine } from '../engines/QueryEngine';
import type {
    MJGraphEntity,
    MJGraphTypeEntity,
    MJGraphConceptEntity,
    MJGraphEdgeTypeEntity,
    MJGraphEdgeTypeEndpointEntity,
    MJGraphEdgeProviderEntity,
} from '../generated/entity_subclasses';
import type { MJGraphEdgeEntityType } from '../generated/entities/__mj';

const GRAPH_TYPE_CANON_ID = '11111111-1111-4111-8111-111111111101';
const GRAPH_CANON_ID = '11111111-1111-4111-8111-111111111102';
const ENTITY_META_ID = '22222222-2222-4222-8222-222222222201';
const FIELD_META_ID = '22222222-2222-4222-8222-222222222202';
const ABV_META_ID = '22222222-2222-4222-8222-222222222203';
const QUERY_META_ID = '22222222-2222-4222-8222-222222222204';
const CONCEPT_META_ID = '22222222-2222-4222-8222-222222222205';

const INVOICES_ENTITY_ID = '33333333-3333-4333-8333-333333333301';
const ACCOUNTS_ENTITY_ID = '33333333-3333-4333-8333-333333333302';
const CONTACTS_ENTITY_ID = '33333333-3333-4333-8333-333333333303';
const ACCOUNT_CONTACTS_ENTITY_ID = '33333333-3333-4333-8333-333333333304';
const SECRET_ENTITY_ID = '33333333-3333-4333-8333-333333333305';

const INVOICES_ACCOUNT_FK_FIELD_ID = '44444444-4444-4444-8444-444444444401';
const INVOICES_OPEN_ABV_ID = '55555555-5555-4555-8555-555555555501';
const INVOICES_BROKEN_ABV_ID = '55555555-5555-4555-8555-555555555502';

const QUERY_AR_AGING_ID = '66666666-6666-4666-8666-666666666601';
const QUERY_BASE_INVOICES_ID = '66666666-6666-4666-8666-666666666602';
const QUERY_RESTRICTED_ID = '66666666-6666-4666-8666-666666666603';

const CONCEPT_OPEN_AR_ID = '77777777-7777-4777-8777-777777777701';
const CONCEPT_REVENUE_ID = '77777777-7777-4777-8777-777777777702';

const EDGE_TYPE_DESCRIBES_ID = '88888888-8888-4888-8888-888888888801';
const EDGE_TYPE_MEASURES_ID = '88888888-8888-4888-8888-888888888802';
const EDGE_TYPE_NARROWER_ID = '88888888-8888-4888-8888-888888888803';

function makeUser(id: string, roles: string[] = ['Analyst']): UserInfo {
    return {
        ID: id,
        Name: `User ${id}`,
        Email: `${id}@example.com`,
        Type: 'User',
        IsActive: true,
        UserRoles: roles.map((r) => ({ UserID: id, RoleID: `role-${r}`, Role: r })),
    } as unknown as UserInfo;
}

interface MockProviderOptions {
    deniedEntities?: string[];
    runViewHandler?: (param: RunViewParams, user?: UserInfo) => Record<string, unknown>[];
}

function makeMockProvider(options: MockProviderOptions = {}): IMetadataProvider & IRunViewProvider {
    const deniedSet = new Set((options.deniedEntities ?? []).map((e) => e.toLowerCase()));
    const canReadFn = (entityName: string) => (_user: UserInfo) => ({
        CanRead: !deniedSet.has(entityName.toLowerCase()),
    });

    const entities: Partial<EntityInfo>[] = [
        {
            ID: ENTITY_META_ID,
            Name: 'MJ: Entities',
            DisplayNameOrName: 'Entities',
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            NameField: { Name: 'Name' } as EntityInfo['NameField'],
            GetUserPermisions: canReadFn('MJ: Entities') as EntityInfo['GetUserPermisions'],
        },
        {
            ID: FIELD_META_ID,
            Name: 'MJ: Entity Fields',
            DisplayNameOrName: 'Entity Fields',
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            NameField: { Name: 'Name' } as EntityInfo['NameField'],
            GetUserPermisions: canReadFn('MJ: Entity Fields') as EntityInfo['GetUserPermisions'],
        },
        {
            ID: ABV_META_ID,
            Name: 'MJ: Entity Alternate Base Views',
            DisplayNameOrName: 'Entity Alternate Base Views',
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            NameField: { Name: 'Name' } as EntityInfo['NameField'],
            GetUserPermisions: canReadFn('MJ: Entity Alternate Base Views') as EntityInfo['GetUserPermisions'],
        },
        {
            ID: QUERY_META_ID,
            Name: 'MJ: Queries',
            DisplayNameOrName: 'Queries',
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            NameField: { Name: 'Name' } as EntityInfo['NameField'],
            GetUserPermisions: canReadFn('MJ: Queries') as EntityInfo['GetUserPermisions'],
        },
        {
            ID: CONCEPT_META_ID,
            Name: 'MJ: Graph Concepts',
            DisplayNameOrName: 'Graph Concepts',
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            NameField: { Name: 'Name' } as EntityInfo['NameField'],
            GetUserPermisions: canReadFn('MJ: Graph Concepts') as EntityInfo['GetUserPermisions'],
        },
        {
            ID: ACCOUNTS_ENTITY_ID,
            Name: 'Accounts',
            DisplayNameOrName: 'Accounts',
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            NameField: { Name: 'Name' } as EntityInfo['NameField'],
            Fields: [],
            AlternateBaseViews: [],
            GetUserPermisions: canReadFn('Accounts') as EntityInfo['GetUserPermisions'],
        },
        {
            ID: INVOICES_ENTITY_ID,
            Name: 'Invoices',
            DisplayNameOrName: 'Invoices',
            Description: 'Customer billing invoices',
            ParentID: ACCOUNTS_ENTITY_ID,
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            NameField: { Name: 'InvoiceNumber' } as EntityInfo['NameField'],
            Fields: [
                {
                    ID: INVOICES_ACCOUNT_FK_FIELD_ID,
                    Name: 'AccountID',
                    RelatedEntityID: ACCOUNTS_ENTITY_ID,
                    RelatedEntity: 'Accounts',
                    Description: 'Owning account FK',
                },
            ] as EntityInfo['Fields'],
            AlternateBaseViews: [
                {
                    ID: INVOICES_OPEN_ABV_ID,
                    Name: 'vwInvoicesOpen',
                    Description: 'Unpaid open invoices',
                    IsUsable: true,
                },
                {
                    ID: INVOICES_BROKEN_ABV_ID,
                    Name: 'vwInvoicesBroken',
                    Description: 'Unusable view',
                    IsUsable: false,
                },
            ] as EntityInfo['AlternateBaseViews'],
            GetUserPermisions: canReadFn('Invoices') as EntityInfo['GetUserPermisions'],
        },
        {
            ID: CONTACTS_ENTITY_ID,
            Name: 'Contacts',
            DisplayNameOrName: 'Contacts',
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            NameField: { Name: 'FullName' } as EntityInfo['NameField'],
            Fields: [],
            AlternateBaseViews: [],
            GetUserPermisions: canReadFn('Contacts') as EntityInfo['GetUserPermisions'],
        },
        {
            ID: ACCOUNT_CONTACTS_ENTITY_ID,
            Name: 'AccountContacts',
            DisplayNameOrName: 'Account Contacts',
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            Fields: [],
            AlternateBaseViews: [],
            GetUserPermisions: canReadFn('AccountContacts') as EntityInfo['GetUserPermisions'],
        },
        {
            ID: SECRET_ENTITY_ID,
            Name: 'SecretDeals',
            DisplayNameOrName: 'Secret Deals',
            FirstPrimaryKey: { Name: 'ID' } as EntityInfo['FirstPrimaryKey'],
            NameField: { Name: 'Title' } as EntityInfo['NameField'],
            Fields: [],
            AlternateBaseViews: [],
            GetUserPermisions: canReadFn('SecretDeals') as EntityInfo['GetUserPermisions'],
        },
    ];

    const runSingleView = async (param: RunViewParams, user?: UserInfo): Promise<RunViewResult> => {
        const rows = options.runViewHandler ? options.runViewHandler(param, user) : [];
        return {
            Success: true,
            Results: rows,
            RowCount: rows.length,
            TotalRowCount: rows.length,
            ExecutionTime: 1,
            ErrorMessage: '',
        } as unknown as RunViewResult;
    };

    return {
        Entities: entities as EntityInfo[],
        EntityByName: (name: string) =>
            (entities as EntityInfo[]).find((e) => e.Name.toLowerCase() === name.trim().toLowerCase()),
        EntityByID: (id: string) =>
            (entities as EntityInfo[]).find((e) => e.ID.toLowerCase() === id.trim().toLowerCase()),
        RunView: runSingleView,
        RunViews: async (params: RunViewParams[], user?: UserInfo) =>
            Promise.all(params.map((p) => runSingleView(p, user))),
    } as unknown as IMetadataProvider & IRunViewProvider;
}

function seedEngineCache(
    engine: GraphEngine,
    data: {
        graphTypes?: Partial<MJGraphTypeEntity>[];
        graphs?: Partial<MJGraphEntity>[];
        concepts?: Partial<MJGraphConceptEntity>[];
        edgeTypes?: Partial<MJGraphEdgeTypeEntity>[];
        endpoints?: Partial<MJGraphEdgeTypeEndpointEntity>[];
        providers?: Partial<MJGraphEdgeProviderEntity>[];
        storedEdges?: Array<Partial<MJGraphEdgeEntityType>>;
    },
    provider: IMetadataProvider & IRunViewProvider,
): void {
    const internal = engine as unknown as Record<string, unknown>;
    internal['_graphTypes'] = (data.graphTypes ?? []) as MJGraphTypeEntity[];
    internal['_graphs'] = (data.graphs ?? []) as MJGraphEntity[];
    internal['_concepts'] = (data.concepts ?? []) as MJGraphConceptEntity[];
    internal['_edgeTypes'] = (data.edgeTypes ?? []) as MJGraphEdgeTypeEntity[];
    internal['_edgeTypeEndpoints'] = (data.endpoints ?? []) as MJGraphEdgeTypeEndpointEntity[];
    internal['_edgeProviders'] = (data.providers ?? []) as MJGraphEdgeProviderEntity[];
    internal['_storedEdges'] = (data.storedEdges ?? []) as MJGraphEdgeEntityType[];
    internal['getMetadataProvider'] = () => provider;
}

describe('GraphEngine, CanonGraphEngine & 7 Derived Edge Providers (WS-4.2)', () => {
    beforeEach(() => {
        LoadGraphEdgeProviders();
    });

    describe('7 Built-In Derived Edge Providers', () => {
        it('ForeignKeyEdgeProvider should derive edges across an FK column in a single RunView', async () => {
            const provider = makeMockProvider({
                runViewHandler: (param) => {
                    if (param.EntityName === 'Invoices') {
                        return [
                            { ID: 'inv-1', AccountID: 'acc-100' },
                            { ID: 'inv-2', AccountID: 'acc-200' },
                        ];
                    }
                    return [];
                },
            });
            const fkProvider = new ForeignKeyEdgeProvider();
            const ctx: GraphProviderContext<{
                SourceEntity: string;
                ForeignKeyField: string;
                TargetEntity: string;
                EdgeTypeName: string;
                Weight?: number;
            }> = {
                Graph: { ID: GRAPH_CANON_ID, Name: 'Enterprise Data' } as MJGraphEntity,
                Config: {
                    SourceEntity: 'Invoices',
                    ForeignKeyField: 'AccountID',
                    TargetEntity: 'Accounts',
                    EdgeTypeName: 'Billed To',
                    Weight: 0.9,
                },
                User: makeUser('u-1'),
                Provider: provider,
            };

            const edges = await fkProvider.GetEdges(
                {
                    Nodes: [{ EntityName: 'Invoices', RecordID: 'inv-1' }],
                    Direction: 'Out',
                },
                ctx,
            );

            expect(edges).toHaveLength(2);
            expect(edges[0].TypeName).toBe('Billed To');
            expect(edges[0].Source.EntityName).toBe('Invoices');
            expect(edges[0].Source.RecordID).toBe('inv-1');
            expect(edges[0].Target.EntityName).toBe('Accounts');
            expect(edges[0].Target.RecordID).toBe('acc-100');
            expect(edges[0].Weight).toBe(0.9);
            expect(edges[0].Origin).toBe('Derived');
        });

        it('JoinEntityEdgeProvider should project M:N junction rows into direct edges with Attributes', async () => {
            const provider = makeMockProvider({
                runViewHandler: (param) => {
                    if (param.EntityName === 'AccountContacts') {
                        return [
                            { ID: 'ac-1', AccountID: 'acc-100', ContactID: 'con-55', Role: 'Billing' },
                        ];
                    }
                    return [];
                },
            });
            const joinProvider = new JoinEntityEdgeProvider();
            const edges = await joinProvider.GetEdges(
                {
                    Nodes: [{ EntityName: 'Accounts', RecordID: 'acc-100' }],
                    Direction: 'Out',
                },
                {
                    Graph: { ID: GRAPH_CANON_ID, Name: 'Enterprise Data' } as MJGraphEntity,
                    Config: {
                        JoinEntity: 'AccountContacts',
                        SourceField: 'AccountID',
                        SourceEntity: 'Accounts',
                        TargetField: 'ContactID',
                        TargetEntity: 'Contacts',
                        EdgeTypeName: 'Has Contact',
                        AttributeFields: ['Role'],
                    },
                    User: makeUser('u-1'),
                    Provider: provider,
                },
            );

            expect(edges).toHaveLength(1);
            expect(edges[0].TypeName).toBe('Has Contact');
            expect(edges[0].Source.RecordID).toBe('acc-100');
            expect(edges[0].Target.RecordID).toBe('con-55');
            expect(edges[0].Attributes).toEqual({ Role: 'Billing' });
        });

        it('QueryEdgeProvider should execute a saved query when UserCanRun is true and skip when false', async () => {
            const qEngineInternal = QueryEngine.Instance as unknown as Record<string, unknown>;
            const originalFindByName = QueryEngine.Instance.FindQueryByName;
            let allowRun = true;
            qEngineInternal['FindQueryByName'] = () => ({
                ID: QUERY_AR_AGING_ID,
                Name: 'CoPurchasedProducts',
                UserCanRun: () => allowRun,
            });

            try {
                const provider = makeMockProvider() as unknown as IMetadataProvider &
                    IRunViewProvider &
                    Partial<IRunQueryProvider>;
                provider.RunQuery = async (): Promise<RunQueryResult> =>
                    ({
                        Success: true,
                        QueryID: QUERY_AR_AGING_ID,
                        QueryName: 'CoPurchasedProducts',
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                        Results: [
                            {
                                SourceEntity: 'Accounts',
                                SourceRecordID: 'acc-1',
                                TargetEntity: 'Accounts',
                                TargetRecordID: 'acc-2',
                                Weight: 0.75,
                                Description: 'Shared parent',
                            },
                        ],
                    }) as RunQueryResult;

                const queryEdgeProvider = new QueryEdgeProvider();
                const edgesAllowed = await queryEdgeProvider.GetEdges(
                    {
                        Nodes: [{ EntityName: 'Accounts', RecordID: 'acc-1' }],
                        Direction: 'Out',
                    },
                    {
                        Graph: { ID: GRAPH_CANON_ID, Name: 'Enterprise Data' } as MJGraphEntity,
                        Config: {
                            QueryName: 'CoPurchasedProducts',
                            EdgeTypeName: 'Related Account',
                        },
                        User: makeUser('u-1'),
                        Provider: provider,
                    },
                );
                expect(edgesAllowed).toHaveLength(1);
                expect(edgesAllowed[0].Weight).toBe(0.75);

                allowRun = false;
                const edgesDenied = await queryEdgeProvider.GetEdges(
                    {
                        Nodes: [{ EntityName: 'Accounts', RecordID: 'acc-1' }],
                        Direction: 'Out',
                    },
                    {
                        Graph: { ID: GRAPH_CANON_ID, Name: 'Enterprise Data' } as MJGraphEntity,
                        Config: {
                            QueryName: 'CoPurchasedProducts',
                            EdgeTypeName: 'Related Account',
                        },
                        User: makeUser('u-1'),
                        Provider: provider,
                    },
                );
                expect(edgesDenied).toHaveLength(0);
            } finally {
                qEngineInternal['FindQueryByName'] = originalFindByName;
            }
        });

        it('RecordLinkEdgeProvider should project polymorphic link rows into edges', async () => {
            const provider = makeMockProvider({
                runViewHandler: () => [
                    {
                        ID: 'link-1',
                        SourceEntityID: ACCOUNTS_ENTITY_ID,
                        SourceRecordID: 'acc-100',
                        TargetEntityID: CONTACTS_ENTITY_ID,
                        TargetRecordID: 'con-200',
                        LinkType: 'Primary Executive',
                    },
                ],
            });
            const recordLinkProvider = new RecordLinkEdgeProvider();
            const edges = await recordLinkProvider.GetEdges(
                {
                    Nodes: [{ EntityName: 'Accounts', EntityID: ACCOUNTS_ENTITY_ID, RecordID: 'acc-100' }],
                    Direction: 'Out',
                },
                {
                    Graph: { ID: GRAPH_CANON_ID, Name: 'Enterprise Data' } as MJGraphEntity,
                    Config: {
                        LinkTypes: ['Primary Executive'],
                    },
                    User: makeUser('u-1'),
                    Provider: provider,
                },
            );

            expect(edges).toHaveLength(1);
            expect(edges[0].TypeName).toBe('Primary Executive');
            expect(edges[0].Source.EntityName).toBe('Accounts');
            expect(edges[0].Target.EntityName).toBe('Contacts');
        });

        it('EntityMetadataEdgeProvider, QueryMetadataEdgeProvider & AlternateBaseViewEdgeProvider should emit zero-DB edges from in-memory metadata', async () => {
            const provider = makeMockProvider();
            const qEngine = QueryEngine.Instance as unknown as Record<string, unknown>;
            const prevQE = qEngine['_queryEntities'];
            const prevQD = qEngine['_dependencies'];
            qEngine['_queryEntities'] = [
                {
                    ID: 'qe-1',
                    QueryID: QUERY_AR_AGING_ID,
                    EntityID: INVOICES_ENTITY_ID,
                    AlternateBaseViewID: INVOICES_OPEN_ABV_ID,
                },
                {
                    ID: 'qe-2',
                    QueryID: QUERY_BASE_INVOICES_ID,
                    EntityID: INVOICES_ENTITY_ID,
                    AlternateBaseViewID: null,
                },
            ];
            qEngine['_dependencies'] = [
                {
                    ID: 'qd-1',
                    QueryID: QUERY_AR_AGING_ID,
                    DependsOnQueryID: QUERY_BASE_INVOICES_ID,
                },
            ];

            try {
                const entityMetaProvider = new EntityMetadataEdgeProvider();
                const entityEdges = await entityMetaProvider.GetEdges(
                    {
                        Nodes: [{ EntityName: 'MJ: Entities', RecordID: INVOICES_ENTITY_ID }],
                        Direction: 'Out',
                    },
                    {
                        Graph: { ID: GRAPH_CANON_ID, Name: 'MJ Canon' } as MJGraphEntity,
                        Config: { Include: ['IsA', 'References', 'FieldOf'] },
                        User: makeUser('u-1'),
                        Provider: provider,
                    },
                );
                expect(entityEdges.map((e) => e.TypeName)).toEqual(expect.arrayContaining(['Is A', 'References']));

                const abvProvider = new AlternateBaseViewEdgeProvider();
                const abvEdges = await abvProvider.GetEdges(
                    {
                        Nodes: [{ EntityName: 'MJ: Entities', RecordID: INVOICES_ENTITY_ID }],
                        Direction: 'In',
                    },
                    {
                        Graph: { ID: GRAPH_CANON_ID, Name: 'MJ Canon' } as MJGraphEntity,
                        Config: {},
                        User: makeUser('u-1'),
                        Provider: provider,
                    },
                );
                expect(abvEdges.some((e) => e.TypeName === 'Subsets' && e.Source.RecordID === INVOICES_OPEN_ABV_ID)).toBe(true);

                const queryMetaProvider = new QueryMetadataEdgeProvider();
                const queryEdges = await queryMetaProvider.GetEdges(
                    {
                        Nodes: [{ EntityName: 'MJ: Queries', RecordID: QUERY_AR_AGING_ID }],
                        Direction: 'Out',
                    },
                    {
                        Graph: { ID: GRAPH_CANON_ID, Name: 'MJ Canon' } as MJGraphEntity,
                        Config: { Include: ['Reads', 'Composes'] },
                        User: makeUser('u-1'),
                        Provider: provider,
                    },
                );
                expect(queryEdges.map((e) => e.TypeName)).toEqual(expect.arrayContaining(['Reads', 'Composes']));
            } finally {
                qEngine['_queryEntities'] = prevQE;
                qEngine['_dependencies'] = prevQD;
            }
        });
    });

    describe('GraphEngine traversal, endpoint validation, permissions & DescribeForPrompt', () => {
        it('should validate edge endpoints, expand best-first within MaxNodes, enforce permissions/RLS, and format DescribeForPrompt', async () => {
            const provider = makeMockProvider({
                deniedEntities: ['SecretDeals'],
                runViewHandler: (param) => {
                    if (param.EntityName === 'Accounts') {
                        // Only acc-visible is returned; acc-rls-hidden is filtered by RLS
                        return [{ ID: 'acc-visible', Name: 'Acme Corp' }];
                    }
                    return [];
                },
            });

            const qEngine = QueryEngine.Instance as unknown as Record<string, unknown>;
            const prevFindById = QueryEngine.Instance.FindQueryByID;
            qEngine['FindQueryByID'] = (id: string) => {
                if (id === QUERY_AR_AGING_ID) {
                    return {
                        ID: QUERY_AR_AGING_ID,
                        Name: 'AR Aging by Customer',
                        Description: '30/60/90 aging buckets',
                        UserCanRun: () => true,
                    };
                }
                if (id === QUERY_RESTRICTED_ID) {
                    return {
                        ID: QUERY_RESTRICTED_ID,
                        Name: 'Restricted Executive Query',
                        UserCanRun: () => false,
                    };
                }
                return undefined;
            };

            try {
                seedEngineCache(
                    GraphEngine.Instance,
                    {
                        graphTypes: [
                            { ID: GRAPH_TYPE_CANON_ID, Name: 'Canon', IsCanon: true, Status: 'Active' },
                        ],
                        graphs: [
                            {
                                ID: GRAPH_CANON_ID,
                                Name: 'MJ Canon',
                                GraphTypeID: GRAPH_TYPE_CANON_ID,
                                GraphType: 'Canon',
                                LoadMode: 'Preload',
                                Status: 'Active',
                            },
                        ],
                        concepts: [
                            {
                                ID: CONCEPT_OPEN_AR_ID,
                                GraphID: GRAPH_CANON_ID,
                                Graph: 'MJ Canon',
                                Name: 'Open AR',
                                Synonyms: JSON.stringify(['Unpaid Invoices', 'Receivables']),
                                Description: 'Unpaid customer invoices past billing date',
                                Specification: 'Balance > 0 AND Status = Open',
                                AuthorityTier: 'Authoritative',
                                ConceptType: 'Metric',
                                Status: 'Approved',
                            },
                            {
                                ID: CONCEPT_REVENUE_ID,
                                GraphID: GRAPH_CANON_ID,
                                Graph: 'MJ Canon',
                                Name: 'Net Revenue',
                                Synonyms: 'Bookings',
                                Description: 'Recognized net revenue',
                                Status: 'Approved',
                            },
                        ],
                        edgeTypes: [
                            {
                                ID: EDGE_TYPE_DESCRIBES_ID,
                                Name: 'Describes',
                                InverseName: 'Described By',
                                IsDirected: true,
                                DefaultWeight: 0.9,
                            },
                            {
                                ID: EDGE_TYPE_MEASURES_ID,
                                Name: 'Measures',
                                InverseName: 'Measured By',
                                IsDirected: true,
                                DefaultWeight: 0.95,
                            },
                            {
                                ID: EDGE_TYPE_NARROWER_ID,
                                Name: 'Narrower Than',
                                InverseName: 'Broader Than',
                                IsDirected: true,
                                DefaultWeight: 0.85,
                            },
                        ],
                        endpoints: [
                            {
                                ID: 'ep-1',
                                EdgeTypeID: EDGE_TYPE_DESCRIBES_ID,
                                Side: 'Source',
                                EntityID: ENTITY_META_ID,
                            },
                            {
                                ID: 'ep-2',
                                EdgeTypeID: EDGE_TYPE_DESCRIBES_ID,
                                Side: 'Source',
                                EntityID: ABV_META_ID,
                            },
                            {
                                ID: 'ep-3',
                                EdgeTypeID: EDGE_TYPE_DESCRIBES_ID,
                                Side: 'Target',
                                EntityID: CONCEPT_META_ID,
                            },
                        ],
                        providers: [
                            {
                                ID: 'prov-abv',
                                GraphID: GRAPH_CANON_ID,
                                Name: 'ABV Provider',
                                DriverClass: 'AlternateBaseViewEdgeProvider',
                                IsActive: true,
                                Sequence: 1,
                            },
                        ],
                        storedEdges: [
                            // 1. Open ABV Describes Open AR (valid endpoints)
                            {
                                ID: 'edge-abv-describes-concept',
                                GraphID: GRAPH_CANON_ID,
                                Graph: 'MJ Canon',
                                EdgeTypeID: EDGE_TYPE_DESCRIBES_ID,
                                EdgeType: 'Describes',
                                SourceEntityID: ABV_META_ID,
                                SourceEntity: 'MJ: Entity Alternate Base Views',
                                SourceRecordID: INVOICES_OPEN_ABV_ID,
                                TargetEntityID: CONCEPT_META_ID,
                                TargetEntity: 'MJ: Graph Concepts',
                                TargetRecordID: CONCEPT_OPEN_AR_ID,
                                Weight: 0.95,
                                Origin: 'Declared',
                                Status: 'Approved',
                            },
                            // 2. Broken ABV (IsUsable = false) -> should be dropped with its edge
                            {
                                ID: 'edge-broken-abv',
                                GraphID: GRAPH_CANON_ID,
                                Graph: 'MJ Canon',
                                EdgeTypeID: EDGE_TYPE_DESCRIBES_ID,
                                EdgeType: 'Describes',
                                SourceEntityID: ABV_META_ID,
                                SourceEntity: 'MJ: Entity Alternate Base Views',
                                SourceRecordID: INVOICES_BROKEN_ABV_ID,
                                TargetEntityID: CONCEPT_META_ID,
                                TargetEntity: 'MJ: Graph Concepts',
                                TargetRecordID: CONCEPT_OPEN_AR_ID,
                                Weight: 0.9,
                                Origin: 'Declared',
                                Status: 'Approved',
                            },
                            // 3. Query AR Aging Measures Open AR
                            {
                                ID: 'edge-query-measures-concept',
                                GraphID: GRAPH_CANON_ID,
                                Graph: 'MJ Canon',
                                EdgeTypeID: EDGE_TYPE_MEASURES_ID,
                                EdgeType: 'Measures',
                                SourceEntityID: QUERY_META_ID,
                                SourceEntity: 'MJ: Queries',
                                SourceRecordID: QUERY_AR_AGING_ID,
                                TargetEntityID: CONCEPT_META_ID,
                                TargetEntity: 'MJ: Graph Concepts',
                                TargetRecordID: CONCEPT_OPEN_AR_ID,
                                Weight: 0.92,
                                Origin: 'Declared',
                                Status: 'Approved',
                            },
                            // 4. Restricted Query (UserCanRun = false) -> should be dropped
                            {
                                ID: 'edge-restricted-query',
                                GraphID: GRAPH_CANON_ID,
                                Graph: 'MJ Canon',
                                EdgeTypeID: EDGE_TYPE_MEASURES_ID,
                                EdgeType: 'Measures',
                                SourceEntityID: QUERY_META_ID,
                                SourceEntity: 'MJ: Queries',
                                SourceRecordID: QUERY_RESTRICTED_ID,
                                TargetEntityID: CONCEPT_META_ID,
                                TargetEntity: 'MJ: Graph Concepts',
                                TargetRecordID: CONCEPT_OPEN_AR_ID,
                                Weight: 0.99,
                                Origin: 'Declared',
                                Status: 'Approved',
                            },
                            // 5. Visible data record vs RLS-hidden data record
                            {
                                ID: 'edge-visible-account',
                                GraphID: GRAPH_CANON_ID,
                                Graph: 'MJ Canon',
                                EdgeTypeID: EDGE_TYPE_NARROWER_ID,
                                EdgeType: 'Narrower Than',
                                SourceEntityID: ACCOUNTS_ENTITY_ID,
                                SourceEntity: 'Accounts',
                                SourceRecordID: 'acc-visible',
                                TargetEntityID: CONCEPT_META_ID,
                                TargetEntity: 'MJ: Graph Concepts',
                                TargetRecordID: CONCEPT_OPEN_AR_ID,
                                Weight: 0.8,
                                Origin: 'Declared',
                                Status: 'Approved',
                            },
                            {
                                ID: 'edge-hidden-account',
                                GraphID: GRAPH_CANON_ID,
                                Graph: 'MJ Canon',
                                EdgeTypeID: EDGE_TYPE_NARROWER_ID,
                                EdgeType: 'Narrower Than',
                                SourceEntityID: ACCOUNTS_ENTITY_ID,
                                SourceEntity: 'Accounts',
                                SourceRecordID: 'acc-rls-hidden',
                                TargetEntityID: CONCEPT_META_ID,
                                TargetEntity: 'MJ: Graph Concepts',
                                TargetRecordID: CONCEPT_OPEN_AR_ID,
                                Weight: 0.8,
                                Origin: 'Declared',
                                Status: 'Approved',
                            },
                        ],
                    },
                    provider,
                );

                // Endpoint validation check
                expect(
                    GraphEngine.Instance.ValidateEdgeEndpoint(EDGE_TYPE_DESCRIBES_ID, 'Source', ENTITY_META_ID),
                ).toBe(true);
                expect(
                    GraphEngine.Instance.ValidateEdgeEndpoint(EDGE_TYPE_DESCRIBES_ID, 'Source', ACCOUNTS_ENTITY_ID),
                ).toBe(false);

                const user = makeUser('u-analyst');
                const subgraph = await GraphEngine.Instance.Subgraph(
                    'MJ Canon',
                    [{ EntityName: 'MJ: Graph Concepts', EntityID: CONCEPT_META_ID, RecordID: CONCEPT_OPEN_AR_ID }],
                    { Depth: 2, MaxNodes: 20, Direction: 'Both' },
                    user,
                );

                const nodeLabels = subgraph.Nodes.map((n) => n.Label);
                expect(nodeLabels).toContain('Open AR');
                expect(nodeLabels).toContain('Invoices.vwInvoicesOpen');
                expect(nodeLabels).toContain('Invoices'); // 2nd hop via AlternateBaseViewEdgeProvider Subsets!
                expect(nodeLabels).toContain('AR Aging by Customer');
                expect(nodeLabels).toContain('Acme Corp');

                // Filtered out by permissions / IsUsable / RLS:
                expect(nodeLabels).not.toContain('Invoices.vwInvoicesBroken');
                expect(nodeLabels).not.toContain('Restricted Executive Query');
                expect(subgraph.Nodes.some((n) => n.RecordID === 'acc-rls-hidden')).toBe(false);

                // Prompt formatting check
                const promptText = GraphEngine.Instance.DescribeForPrompt(subgraph);
                expect(promptText).toContain('### Semantic Graph Context');
                expect(promptText).toContain('[MJ: Graph Concepts] Open AR');
                expect(promptText).toContain('--[Describes');

                // CanonGraphEngine checks
                const matchedConcepts = CanonGraphEngine.Instance.FindConcepts('Unpaid Invoices', user);
                expect(matchedConcepts).toHaveLength(1);
                expect(matchedConcepts[0].Label).toBe('Open AR');

                const conceptExplanation = await CanonGraphEngine.Instance.ExplainConcept('Open AR', user);
                expect(conceptExplanation).not.toBeNull();
                expect(conceptExplanation?.Specification).toBe('Balance > 0 AND Status = Open');
                expect(conceptExplanation?.Synonyms).toContain('Unpaid Invoices');

                // Expansion service adapter check
                const service = CreateCanonGraphExpansionService();
                const resolvedSeeds = await service.ResolveSeeds('Open AR', ['MJ Canon'], user, provider);
                expect(resolvedSeeds).toHaveLength(1);
                expect(resolvedSeeds[0].RecordID).toBe(CONCEPT_OPEN_AR_ID);

                const entitySeeds = await service.ResolveSeeds('Invoices', ['MJ Canon'], user, provider);
                expect(entitySeeds.some((s) => s.EntityName === 'MJ: Entities' && s.RecordID === INVOICES_ENTITY_ID)).toBe(
                    true,
                );

                const expanded = await service.Expand({ Seeds: resolvedSeeds, GraphNames: ['MJ Canon'], MaxDepth: 2 }, user);
                expect(expanded.Nodes.some((n) => n.Title === 'Invoices.vwInvoicesOpen' && n.NodeKind === 'View')).toBe(true);
                expect(expanded.Nodes.some((n) => n.Title === 'AR Aging by Customer' && n.NodeKind === 'Query')).toBe(true);
            } finally {
                qEngine['FindQueryByID'] = prevFindById;
            }
        });
    });
});
