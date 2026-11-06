/**
 * @fileoverview Integration check bundle `'graph-runtime'` (IT164) — the semantic graph RUNTIME against a
 * live database: the seeded "MJ Canon" graph, per-caller visibility, the edge approval gate, and the
 * `Get Graph Context` action. (IT162 covers the graph tables and the content-pipeline overlay.)
 *
 * Deterministic and non-mutating: nothing is saved. A never-persisted, role-less principal stands in for
 * "a user without the permission"; the approval gate is exercised through `ValidateAsync` on an unsaved
 * edge, and the action runs with its execution log skipped.
 *
 * Registered check IDs:
 *   - `graph-runtime.GR1` — the seeded "MJ Canon" graph (Preload, its three metadata edge providers) traverses
 *     entity-metadata `References` edges from a real entity
 *   - `graph-runtime.GR2` — a user without run permission on a query never sees its node: not through
 *     `FilterNodesForUser`, not as a traversal seed, and not as an audience reader of someone who can
 *   - `graph-runtime.GR3` — an edge cannot be created pre-approved, or approved, without `Graph: Approve Edges`
 *   - `graph-runtime.GR4` — `Get Graph Context` resolves to its registered class, has its metadata row, and
 *     runs: unknown graph → `GRAPH_NOT_FOUND`, real seed → nodes
 */
import { randomUUID } from 'node:crypto';
import { UserInfo } from '@memberjunction/core';
import { MJGlobal, UUIDsEqual } from '@memberjunction/global';
import {
    GraphEngine,
    LoadGraphEdgeProviders,
    QueryEngine,
    type MJGraphEdgeEntity,
    type MJQueryEntityExtended,
} from '@memberjunction/core-entities';
import { ActionEngineServer, BaseAction } from '@memberjunction/actions';
import { RunActionParams } from '@memberjunction/actions-base';
import {
    Assert,
    AssertEqual,
    IntegrationCheckContext,
    IntegrationCheckRegistry,
    NamedCheck,
} from '@memberjunction/testing-integration';

const CANON = 'MJ Canon';
const APPROVE_EDGES = 'Graph: Approve Edges';
const GRAPH_CONTEXT_ACTION = 'Get Graph Context';

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

async function configuredGraphEngine(ctx: IntegrationCheckContext): Promise<GraphEngine> {
    LoadGraphEdgeProviders();
    await GraphEngine.Instance.Config(false, ctx.User, ctx.Provider);
    return GraphEngine.Instance;
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
        Name: 'GR3: an edge cannot be created pre-approved, or approved, without Graph: Approve Edges',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredGraphEngine(ctx);
            Assert(
                ctx.Provider.Authorizations.some((a) => a.Name === APPROVE_EDGES),
                `the "${APPROVE_EDGES}" authorization must be seeded`,
            );
            const canon = engine.GetGraph(CANON);
            const describes = engine.EdgeTypes.find((t) => t.Name === 'Describes' && t.AllowStored);
            Assert(canon != null && describes != null, `"${CANON}" and a storable "Describes" edge type are required`);

            const roleless = rolelessUser(ctx);
            const edge = await ctx.Provider.GetEntityObject<MJGraphEdgeEntity>('MJ: Graph Edges', roleless);
            edge.NewRecord();
            edge.GraphID = canon!.ID;
            edge.EdgeTypeID = describes!.ID;
            edge.SourceEntityID = ctx.Provider.EntityByName('MJ: Entities')!.ID;
            edge.SourceRecordID = entityNode(ctx, 'MJ: Entity Fields').RecordID;
            edge.TargetEntityID = ctx.Provider.EntityByName('MJ: Graph Concepts')!.ID;
            edge.TargetRecordID = randomUUID().toUpperCase();
            edge.Weight = 0.9;
            edge.Origin = 'Declared';
            edge.Status = 'Approved';

            const result = await edge.ValidateAsync(); // validation only: nothing is saved
            Assert(!result.Success, 'a pre-approved edge from a user without the authorization must not validate');
            Assert(
                result.Errors.some((e) => e.Source === 'Status' && e.Message.includes(APPROVE_EDGES)),
                `expected a Status error naming "${APPROVE_EDGES}", got: ${result.Errors.map((e) => e.Message).join(' | ')}`,
            );
            console.log('      → pre-approved Declared edge refused for a user without the authorization');
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
];

for (const check of GraphRuntimeChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}
