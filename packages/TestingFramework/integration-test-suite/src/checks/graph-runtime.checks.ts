/**
 * @fileoverview Integration check bundle `'graph-runtime'` (IT167) — the semantic graph RUNTIME against a
 * live database: the seeded "MJ Canon" graph, per-caller visibility, the edge approval gate, the
 * `Get Graph Context` action, and the data-scale edge providers. (IT162 covers the graph tables and the
 * content-pipeline overlay.) Server transport.
 *
 * GR1–GR4 save nothing. GR3 attempts real saves that the approval gate must refuse before any write.
 * GR5–GR6 (`RequiresMutation`) create a temporary graph, provider row and query, and delete them in a
 * `finally`, so a failure still cleans up.
 *
 * Registered check IDs:
 *   - `graph-runtime.GR1` — the seeded "MJ Canon" graph (Preload, its three metadata edge providers) traverses
 *     entity-metadata `References` edges from a real entity
 *   - `graph-runtime.GR2` — a user without run permission on a query never sees its node: not through
 *     `FilterNodesForUser`, not as a traversal seed, and not as an audience reader of someone who can
 *   - `graph-runtime.GR3` — a real `Save()` of an edge that starts `Approved` (Declared or Inferred), by a user
 *     who may create edges but does not hold `Graph: Approve Edges`, is refused by the gate and writes nothing
 *   - `graph-runtime.GR4` — `Get Graph Context` resolves to its registered class, has its metadata row, and
 *     runs: unknown graph → `GRAPH_NOT_FOUND`, real seed → nodes
 *   - `graph-runtime.GR5` — (`RequiresMutation`) a `JoinEntityEdgeProvider` over `MJ: User Roles` expands a user
 *     to exactly their roles
 *   - `graph-runtime.GR6` — (`RequiresMutation`) a `QueryEdgeProvider` yields edges only for a principal who may
 *     run its query: the caller, not a user without the query's run permission, alone or as an audience reader
 */
import { randomUUID } from 'node:crypto';
import { UserInfo, UserRoleInfo } from '@memberjunction/core';
import { MJGlobal, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    GraphEngine,
    LoadGraphEdgeProviders,
    QueryEngine,
    type GraphEdgeView,
    type MJGraphEdgeEntity,
    type MJGraphEdgeProviderEntity,
    type MJGraphEntity,
    type MJQueryCategoryEntity,
    type MJQueryEntity,
    type MJQueryEntityExtended,
    type MJQueryPermissionEntity,
} from '@memberjunction/core-entities';
import { GRAPH_APPROVE_EDGES_AUTHORIZATION } from '@memberjunction/core-entities-server';
import { ActionEngineServer, BaseAction } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import {
    Assert,
    AssertEqual,
    IntegrationCheckContext,
    IntegrationCheckRegistry,
    NamedCheck,
    SkipCheck,
} from '@memberjunction/testing-integration';
import { ForPlatform, PlatformOf } from './query-extraction-fixture';
import { FixtureQuerySaveOptions } from './query-fixture-save-options';

const CANON = 'MJ Canon';
const APPROVE_EDGES = GRAPH_APPROVE_EDGES_AUTHORIZATION;
const GRAPH_CONTEXT_ACTION = 'Get Graph Context';
const BUNDLE = 'graph-runtime';

/** A never-persisted principal with no roles: it may read, run and approve nothing. */
function rolelessUser(ctx: IntegrationCheckContext): UserInfo {
    const id = randomUUID().toUpperCase();
    return new UserInfo(ctx.Provider, {
        ID: id,
        Name: `graph-runtime synthetic ${id.slice(-4)}`,
        Email: `it-graph-${id.slice(-4)}@integration.test`,
        Type: 'User',
        IsActive: true,
        UserRoles: [],
    });
}

/**
 * The harness user, holding only the Integration role: it may create, update and delete `MJ: Graph
 * Edges` but holds no `Graph: Approve Edges` (granted to Developer only).
 *
 * By default it shares the harness user's ID, because GR3 saves as it: that save should be refused, but
 * if the gate let it through, the edge and its audit rows would name this user, so the ID must be a real
 * one. `distinctId` gives it a never-persisted ID instead, for a check that only reads as it: GR6 hands it
 * to `FilterNodesForUser` and `Subgraph`, which write nothing (its query edges are refused before
 * `RunQuery` runs), and as an audience reader, where the caller's ID would drop it as a duplicate of the
 * caller (`GraphEngine` keeps each principal once by ID).
 */
function integrationOnlyUser(ctx: IntegrationCheckContext, distinctId = false): UserInfo {
    const integration = ctx.Provider.Roles.find((r) => r.Name?.trim().toLowerCase() === 'integration');
    Assert(integration != null, "the 'Integration' role is required as the fixture and was not found");
    const id = distinctId ? randomUUID().toUpperCase() : ctx.User.ID;
    return new UserInfo(ctx.Provider, {
        ID: id,
        Name: ctx.User.Name,
        Email: ctx.User.Email,
        Type: 'User',
        IsActive: true,
        UserRoles: [new UserRoleInfo({ UserID: id, RoleID: integration!.ID, Role: integration!.Name })],
    });
}

async function configuredGraphEngine(ctx: IntegrationCheckContext, forceRefresh = false): Promise<GraphEngine> {
    LoadGraphEdgeProviders();
    await GraphEngine.Instance.Config(forceRefresh, ctx.User, ctx.Provider);
    return GraphEngine.Instance;
}

/** A temporary OnDemand graph with one active edge provider row, created as the harness user. */
async function createProviderGraph(
    ctx: IntegrationCheckContext,
    label: string,
    driverClass: string,
    configuration: Record<string, unknown>,
): Promise<{ Graph: MJGraphEntity; Provider: MJGraphEdgeProviderEntity }> {
    const engine = await configuredGraphEngine(ctx);
    const graphType = engine.GraphTypes.find((t) => !t.IsCanon) ?? engine.GraphTypes[0];
    Assert(graphType != null, 'a seeded MJ: Graph Types row is required');
    const suffix = randomUUID().slice(0, 8);

    const graph = await ctx.Provider.GetEntityObject<MJGraphEntity>('MJ: Graphs', ctx.User);
    graph.NewRecord();
    graph.Name = `__IT167 ${label} ${suffix}`;
    graph.GraphTypeID = graphType!.ID;
    graph.LoadMode = 'OnDemand';
    graph.Status = 'Active';
    Assert(await graph.Save(), `saving the fixture graph failed: ${graph.LatestResult?.CompleteMessage}`);

    const provider = await ctx.Provider.GetEntityObject<MJGraphEdgeProviderEntity>('MJ: Graph Edge Providers', ctx.User);
    provider.NewRecord();
    provider.GraphID = graph.ID;
    provider.Name = `__IT167 ${label} provider ${suffix}`;
    provider.DriverClass = driverClass;
    provider.Configuration = JSON.stringify(configuration);
    provider.Sequence = 1;
    provider.IsActive = true;
    if (!(await provider.Save())) {
        const message = provider.LatestResult?.CompleteMessage;
        await graph.Delete();
        Assert(false, `saving the fixture edge provider failed: ${message}`);
    }
    await configuredGraphEngine(ctx, true); // the engine must see the new graph and provider
    return { Graph: graph, Provider: provider };
}

/** Deletes what {@link createProviderGraph} made (provider first) and reloads the engine; never throws. */
async function deleteProviderGraph(ctx: IntegrationCheckContext, fixture: { Graph: MJGraphEntity; Provider: MJGraphEdgeProviderEntity } | null): Promise<void> {
    if (!fixture) {
        return;
    }
    try {
        if (fixture.Provider.IsSaved && !(await fixture.Provider.Delete())) {
            console.error(`${BUNDLE} teardown warning: provider row: ${fixture.Provider.LatestResult?.CompleteMessage}`);
        }
        if (fixture.Graph.IsSaved && !(await fixture.Graph.Delete())) {
            console.error(`${BUNDLE} teardown warning: graph: ${fixture.Graph.LatestResult?.CompleteMessage}`);
        }
        await configuredGraphEngine(ctx, true);
    } catch (e) {
        console.error(`${BUNDLE} teardown warning: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/** The harness user as a graph node, and the IDs of the roles it holds. */
function userNodeAndRoles(ctx: IntegrationCheckContext): { Node: { EntityName: string; RecordID: string }; RoleIDs: UUIDSet } {
    return {
        Node: { EntityName: 'MJ: Users', RecordID: ctx.User.ID },
        RoleIDs: new UUIDSet((ctx.User.UserRoles ?? []).map((r) => r.RoleID)),
    };
}

/** The `MJ: Entities` node for the entity named `entityName`. */
function entityNode(ctx: IntegrationCheckContext, entityName: string): { EntityName: string; RecordID: string } {
    const entity = ctx.Provider.EntityByName(entityName);
    Assert(entity != null, `entity "${entityName}" must exist in metadata`);
    return { EntityName: 'MJ: Entities', RecordID: entity!.ID };
}

/** A query the caller can run but a role-less user cannot (it reads entities and has no explicit grants). */
async function queryOnlyTheCallerCanRun(ctx: IntegrationCheckContext, roleless: UserInfo): Promise<MJQueryEntityExtended> {
    await QueryEngine.Instance.Config(false, ctx.User, ctx.Provider);
    const query = QueryEngine.Instance.Queries.find(
        (q) =>
            q.QueryEntities.length > 0 &&
            q.QueryPermissions.length === 0 &&
            q.UserCanRun(ctx.User).canRun &&
            !q.UserCanRun(roleless).canRun,
    );
    Assert(query != null, 'a query that reads entities, has no explicit grants, and the test user can run is required as the fixture');
    return query!;
}

export const GraphRuntimeChecks: NamedCheck[] = [
    {
        Id: 'graph-runtime.GR1',
        Name: 'GR1: the seeded "MJ Canon" graph is Preload with its metadata providers and traverses entity References edges',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredGraphEngine(ctx);
            const canon = engine.GetGraph(CANON);
            Assert(canon != null, `the "${CANON}" graph must be seeded and Active`);
            AssertEqual(canon!.LoadMode, 'Preload', `"${CANON}" loads in Preload mode`);
            const drivers = engine.EdgeProviders.filter((p) => p.IsActive && UUIDsEqual(p.GraphID, canon!.ID))
                .map((p) => p.DriverClass)
                .sort();
            AssertEqual(
                drivers.join(','),
                'AlternateBaseViewEdgeProvider,EntityMetadataEdgeProvider,QueryMetadataEdgeProvider',
                `"${CANON}" runs its three metadata edge providers`,
            );

            const seed = entityNode(ctx, 'MJ: Entity Fields');
            const target = entityNode(ctx, 'MJ: Entities');
            const subgraph = await engine.Subgraph(CANON, [seed], { Depth: 1, MaxNodes: 20, EdgeTypes: ['References'] }, ctx.User);
            Assert(
                subgraph.Edges.some((e) => e.TypeName === 'References' && UUIDsEqual(e.Target.RecordID, target.RecordID)),
                'MJ: Entity Fields --References--> MJ: Entities must be traversed',
            );
            Assert(subgraph.Nodes.length >= 2, `expected the seed and at least one neighbour, got ${subgraph.Nodes.length} node(s)`);
            console.log(`      → ${subgraph.Nodes.length} node(s), ${subgraph.Edges.length} edge(s) one hop from MJ: Entity Fields`);
        },
    },
    {
        Id: 'graph-runtime.GR2',
        Name: 'GR2: a user without run permission on a query never sees the query node (filter, seed, or as an audience reader)',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredGraphEngine(ctx);
            const roleless = rolelessUser(ctx);
            const query = await queryOnlyTheCallerCanRun(ctx, roleless);
            const node = { EntityName: 'MJ: Queries', RecordID: query.ID };

            AssertEqual((await engine.FilterNodesForUser([node], ctx.User)).size, 1, 'the caller sees the query node');
            AssertEqual((await engine.FilterNodesForUser([node], roleless)).size, 0, 'a user who cannot run the query does not');

            const asRoleless = await engine.Subgraph(CANON, [node], { Depth: 1 }, roleless);
            AssertEqual(asRoleless.Nodes.length, 0, 'the query cannot even seed a traversal for a user who cannot run it');

            const withReader = await engine.Subgraph(CANON, [node], { Depth: 1, AudienceReaders: [roleless] }, ctx.User);
            AssertEqual(withReader.Nodes.length, 0, 'with that user in the audience, the query node is withheld from the caller too');
            console.log(`      → query "${query.Name}" hidden from a role-less user and from a room containing one`);
        },
    },
    {
        Id: 'graph-runtime.GR3',
        Name: 'GR3: a real Save() of an edge that starts Approved, by a user without Graph: Approve Edges, is refused and writes nothing',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredGraphEngine(ctx);
            Assert(
                ctx.Provider.Authorizations.some((a) => a.Name === APPROVE_EDGES),
                `the "${APPROVE_EDGES}" authorization must be seeded`,
            );
            const canon = engine.GetGraph(CANON);
            const describes = engine.EdgeTypes.find((t) => t.Name === 'Describes' && t.AllowStored);
            Assert(canon != null && describes != null, `"${CANON}" and a storable "Describes" edge type are required`);

            const writer = integrationOnlyUser(ctx);
            const edgesEntity = ctx.Provider.EntityByName('MJ: Graph Edges');
            Assert(edgesEntity?.GetUserPermisions(writer).CanCreate === true, 'fixture invalid: the Integration role must be able to create MJ: Graph Edges');
            Assert(
                !ctx.Provider.Authorizations.find((a) => a.Name === APPROVE_EDGES)!.UserCanExecute(writer),
                `fixture invalid: the Integration role alone must not hold "${APPROVE_EDGES}"`,
            );

            for (const origin of ['Declared', 'Inferred'] as const) {
                const edge = await ctx.Provider.GetEntityObject<MJGraphEdgeEntity>('MJ: Graph Edges', writer);
                edge.NewRecord();
                edge.GraphID = canon!.ID;
                edge.EdgeTypeID = describes!.ID;
                edge.SourceEntityID = ctx.Provider.EntityByName('MJ: Entities')!.ID;
                edge.SourceRecordID = entityNode(ctx, 'MJ: Entity Fields').RecordID;
                edge.TargetEntityID = ctx.Provider.EntityByName('MJ: Graph Concepts')!.ID;
                edge.TargetRecordID = randomUUID().toUpperCase();
                edge.Weight = 0.9;
                edge.Origin = origin;
                edge.Status = 'Approved';
                let saved = false;
                try {
                    saved = await edge.Save();
                    Assert(!saved, `a pre-approved ${origin} edge saved by a user without "${APPROVE_EDGES}" must be refused`);
                    const message = edge.LatestResult?.CompleteMessage ?? '';
                    Assert(message.includes(APPROVE_EDGES), `expected the approval gate to refuse it, got: ${message}`);
                    Assert(!edge.IsSaved, 'the refused edge must not have been written');
                } finally {
                    if (saved || edge.IsSaved) {
                        await edge.Delete();
                    }
                }
            }
            console.log('      → pre-approved Declared and Inferred edges refused on Save() for a user without the authorization');
        },
    },
    {
        Id: 'graph-runtime.GR4',
        Name: 'GR4: Get Graph Context resolves to its registered class, has its metadata row, and runs',
        Fn: async (ctx: IntegrationCheckContext) => {
            const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseAction, GRAPH_CONTEXT_ACTION);
            Assert(registration != null, `no BaseAction is registered as "${GRAPH_CONTEXT_ACTION}"`);
            AssertEqual((registration!.SubClass as { name: string }).name, 'GetGraphContextAction', 'the registered class');

            await ActionEngineServer.Instance.Config(false, ctx.User);
            const action = ActionEngineServer.Instance.Actions.find((a) => a.Name === GRAPH_CONTEXT_ACTION && a.Status === 'Active');
            Assert(action != null, `the "${GRAPH_CONTEXT_ACTION}" action row must be seeded and Active`);
            AssertEqual(action!.DriverClass, GRAPH_CONTEXT_ACTION, 'the action row points at the registered class');

            const run = async (params: Array<{ Name: string; Value: unknown }>) => {
                const p = new RunActionParams();
                p.Action = action!;
                p.ContextUser = ctx.User;
                p.Params = params.map((x) => ({ ...x, Type: 'Input' as const }));
                p.Filters = [];
                p.SkipActionLog = true;
                return ActionEngineServer.Instance.RunAction(p);
            };
            const unknown = await run([{ Name: 'GraphName', Value: 'mj-it164-no-such-graph' }, { Name: 'Question', Value: 'anything' }]);
            AssertEqual(unknown.Success, false, 'an unknown graph is a failure');
            AssertEqual(unknown.ResultCode, 'GRAPH_NOT_FOUND', 'with the GRAPH_NOT_FOUND result code');

            const seeded = await run([{ Name: 'Seeds', Value: [entityNode(ctx, 'MJ: Entity Fields')] }, { Name: 'Depth', Value: 1 }]);
            Assert(seeded.Success, `a real seed must expand: ${seeded.Message}`);
            const nodeCount = (seeded.Params ?? []).find((x) => x.Name === 'NodeCount' && x.Type === 'Output')?.Value;
            Assert(typeof nodeCount === 'number' && nodeCount >= 1, `expected NodeCount >= 1, got ${String(nodeCount)}`);
            console.log(`      → Get Graph Context → GetGraphContextAction; seeded run returned ${String(nodeCount)} node(s)`);
        },
    },
    {
        Id: 'graph-runtime.GR5',
        Name: 'GR5: a JoinEntityEdgeProvider over MJ: User Roles expands a user to exactly their roles',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Node, RoleIDs } = userNodeAndRoles(ctx);
            Assert(RoleIDs.Size > 0, 'the harness user must hold at least one role');
            let fixture: { Graph: MJGraphEntity; Provider: MJGraphEdgeProviderEntity } | null = null;
            try {
                fixture = await createProviderGraph(ctx, 'Join', 'JoinEntityEdgeProvider', {
                    JoinEntity: 'MJ: User Roles',
                    SourceField: 'UserID',
                    TargetField: 'RoleID',
                    EdgeType: 'Has Role',
                });
                const subgraph = await GraphEngine.Instance.Subgraph(fixture.Graph.Name, [Node], { Depth: 1, MaxNodes: 200 }, ctx.User, ctx.Provider);
                const joinEdges = subgraph.Edges.filter((e) => e.ID.startsWith('derived:JoinEntityEdgeProvider:'));
                Assert(joinEdges.length > 0, `expected Has Role edges from the user, got ${subgraph.Edges.length} edge(s): ${subgraph.Message ?? ''}`);
                for (const edge of joinEdges) {
                    AssertEqual(edge.TypeName, 'Has Role', 'join edge type');
                    Assert(UUIDsEqual(edge.Source.RecordID, ctx.User.ID), 'every join edge starts at the user');
                    Assert(RoleIDs.Has(edge.Target.RecordID), `edge target ${edge.Target.RecordID} must be one of the user's roles`);
                }
                const reached = new UUIDSet(joinEdges.map((e) => e.Target.RecordID));
                AssertEqual(reached.Size, RoleIDs.Size, "the join reaches each of the user's roles once");
                console.log(`      → ${joinEdges.length} Has Role edge(s) through MJ: User Roles`);
            } finally {
                await deleteProviderGraph(ctx, fixture);
            }
        },
    },
    {
        Id: 'graph-runtime.GR6',
        Name: 'GR6: a QueryEdgeProvider yields edges only for principals who may run its query',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const { Node, RoleIDs } = userNodeAndRoles(ctx);
            const developer = ctx.Provider.Roles.find((r) => r.Name?.trim().toLowerCase() === 'developer');
            Assert(developer != null, "the 'Developer' role is required to grant the fixture query");
            if (!(ctx.User.UserRoles ?? []).some((r) => UUIDsEqual(r.RoleID, developer!.ID))) {
                SkipCheck('the harness user does not hold the Developer role the fixture query is granted to');
            }
            const restricted = integrationOnlyUser(ctx, true);
            const suffix = randomUUID().slice(0, 8);
            const schema = ctx.Schema ?? '__mj';
            let category: MJQueryCategoryEntity | null = null;
            let query: MJQueryEntity | null = null;
            let permission: MJQueryPermissionEntity | null = null;
            let fixture: { Graph: MJGraphEntity; Provider: MJGraphEdgeProviderEntity } | null = null;
            try {
                category = await ctx.Provider.GetEntityObject<MJQueryCategoryEntity>('MJ: Query Categories', ctx.User);
                category.NewRecord();
                category.Name = `__IT167 Graph Queries ${suffix}`;
                category.UserID = ctx.User.ID;
                Assert(await category.Save(), `fixture category save failed: ${category.LatestResult?.CompleteMessage}`);

                query = await ctx.Provider.GetEntityObject<MJQueryEntity>('MJ: Queries', ctx.User);
                query.NewRecord();
                query.Name = `__IT167 Role Edges ${suffix}`;
                query.CategoryID = category.ID;
                query.SQL = ForPlatform(
                    `SELECT 'MJ: Users' AS [SourceEntity], ur.[UserID] AS [SourceRecordID], 'MJ: Roles' AS [TargetEntity], ur.[RoleID] AS [TargetRecordID] ` +
                        `FROM [${schema}].[vwUserRoles] ur WHERE ur.[UserID] = '${ctx.User.ID}'`,
                    PlatformOf(ctx, BUNDLE),
                );
                query.Status = 'Approved';
                Assert(await query.Save(FixtureQuerySaveOptions()), `fixture query save failed: ${query.LatestResult?.CompleteMessage}`);

                permission = await ctx.Provider.GetEntityObject<MJQueryPermissionEntity>('MJ: Query Permissions', ctx.User);
                permission.NewRecord();
                permission.QueryID = query.ID;
                permission.RoleID = developer!.ID;
                Assert(await permission.Save(), `fixture query permission save failed: ${permission.LatestResult?.CompleteMessage}`);

                await QueryEngine.Instance.Config(true, ctx.User);
                const cached: MJQueryEntityExtended | undefined = QueryEngine.Instance.FindQueryByID(query.ID);
                Assert(cached != null, 'the fixture query must be in the QueryEngine cache');
                Assert(cached!.UserCanRun(ctx.User).canRun, 'fixture invalid: the caller must be able to run the query');
                Assert(!cached!.UserCanRun(restricted).canRun, 'fixture invalid: the Integration-only user must not be able to run the query');

                fixture = await createProviderGraph(ctx, 'Query', 'QueryEdgeProvider', { QueryName: query.Name, EdgeType: 'Holds Role' });
                const engine = GraphEngine.Instance;
                if ((await engine.FilterNodesForUser([Node], restricted, [], { Provider: ctx.Provider })).size === 0) {
                    SkipCheck('the Integration role cannot read MJ: Users here, so the fixture cannot isolate the query permission');
                }
                const queryEdges = (edges: GraphEdgeView[]): GraphEdgeView[] => edges.filter((e) => e.ID.startsWith('derived:QueryEdgeProvider:'));

                const asCaller = await engine.Subgraph(fixture.Graph.Name, [Node], { Depth: 1, MaxNodes: 200 }, ctx.User, ctx.Provider);
                const callerEdges = queryEdges(asCaller.Edges);
                Assert(callerEdges.length > 0, `the caller must get the query's edges, got ${asCaller.Edges.length} edge(s): ${asCaller.Message ?? ''}`);
                Assert(callerEdges.every((e) => RoleIDs.Has(e.Target.RecordID)), "every query edge must reach one of the caller's roles");

                const asRestricted = await engine.Subgraph(fixture.Graph.Name, [Node], { Depth: 1, MaxNodes: 200 }, restricted, ctx.Provider);
                AssertEqual(queryEdges(asRestricted.Edges).length, 0, 'a user who cannot run the query gets none of its edges');

                const withReader = await engine.Subgraph(fixture.Graph.Name, [Node], { Depth: 1, MaxNodes: 200, AudienceReaders: [restricted] }, ctx.User, ctx.Provider);
                AssertEqual(queryEdges(withReader.Edges).length, 0, 'with that user in the audience, the caller gets none either');
                console.log(`      → ${callerEdges.length} query edge(s) for the caller, none for a user without the query's run permission`);
            } finally {
                await deleteProviderGraph(ctx, fixture);
                for (const row of [permission, query, category]) {
                    try {
                        if (row?.IsSaved && !(await row.Delete())) {
                            console.error(`${BUNDLE} teardown warning: ${row.LatestResult?.CompleteMessage}`);
                        }
                    } catch (e) {
                        console.error(`${BUNDLE} teardown warning: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }
                await QueryEngine.Instance.Config(true, ctx.User);
            }
        },
    },
];

for (const check of GraphRuntimeChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
