/**
 * GraphEngine: lazy loading, Preload-only edge caching, per-hop visibility as the caller and every
 * audience reader (row-level security through a user-aware fake RunView), caps, the on-demand path,
 * unknown graphs, IncludeProposed, and determinism.
 *
 * The engine is driven only through its public API (`Config`, `Subgraph`, `GetEdges`,
 * `FilterNodesForUser`); the provider it is configured with is a fake that honours the user each read
 * runs as.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { StartupManager, WellKnownUserSource, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { GraphEngine, ClampGraphDepth, ClampGraphMaxNodes, CanUserReadEntity, GRAPH_MAX_STORED_EDGES_PER_STEP } from '../../graph/GraphEngine';
import { LoadGraphEdgeProviders } from '../../graph';
import { QueryEngine } from '../../engines/QueryEngine';
import type { MJQueryEntityExtended } from '../../custom/MJQueryEntityExtended';
import { CanonMetadataRows, FakeGraphProvider, IDS, MakeUser, NODE, StoredEdge, StandardEntitySpecs, type FakeRow } from './graphTestFixtures';

const analyst = MakeUser('u-analyst', ['Analyst']);
const executive = MakeUser('u-exec', ['Analyst', 'Executive']);

function fakeQuery(id: string, name: string, canRun: boolean): MJQueryEntityExtended {
    return {
        ID: id,
        Name: name,
        Description: `${name} description`,
        UserCanRun: () => ({ canRun, deniedEntities: canRun ? [] : ['Invoices'] }),
    } as unknown as MJQueryEntityExtended;
}

function stubQueries(queries: MJQueryEntityExtended[]): void {
    vi.spyOn(QueryEngine.Instance, 'FindQueryByID').mockImplementation((id: string) => queries.find((q) => q.ID.toLowerCase() === id.toLowerCase()));
}

async function configure(provider: FakeGraphProvider, user: UserInfo = analyst): Promise<GraphEngine> {
    await GraphEngine.Instance.Config(true, user, provider as unknown as IMetadataProvider);
    return GraphEngine.Instance;
}

/** One fake for the whole file: engines bind the first provider they are configured with. */
const sharedProvider = new FakeGraphProvider();

function providerWith(extra: Record<string, FakeRow[]>, specs = StandardEntitySpecs()): FakeGraphProvider {
    return sharedProvider.Reset({ ...CanonMetadataRows(), ...extra }, specs);
}

const canonSeed = [{ EntityName: 'MJ: Graph Concepts', RecordID: IDS.ConceptOpenAr }];

describe('GraphEngine', () => {
    beforeEach(() => {
        LoadGraphEdgeProviders();
        stubQueries([fakeQuery(IDS.QueryArAging, 'AR Aging by Customer', true), fakeQuery(IDS.QueryRestricted, 'Restricted Executive Query', false)]);
    });

    describe('loading', () => {
        it('is not registered for startup: nothing loads until a caller configures it', () => {
            const names = StartupManager.Instance.GetRegistrations().map((r) => r.constructor.name);
            expect(names).not.toContain('GraphEngine');
        });

        it('caches stored edges of active Preload graphs only, approved only', async () => {
            const provider = providerWith({});
            await configure(provider);
            const edgeLoads = provider.ReadsOf('MJ: Graph Edges');
            expect(edgeLoads).toHaveLength(1);
            expect(edgeLoads[0].Filter).toContain(IDS.GraphCanon);
            expect(edgeLoads[0].Filter).not.toContain(IDS.GraphNetwork);
            expect(edgeLoads[0].Filter).not.toContain(IDS.GraphDisabled);
            expect(edgeLoads[0].Filter).toContain("[Status] = 'Approved'");
        });

        it('on a server loads its cache as the system user, yet checks every node as the caller', async () => {
            const systemUser = MakeUser('u-system', ['Analyst', 'Executive']);
            class TestSystemUserSource extends WellKnownUserSource {
                public override async GetSystemUser(): Promise<UserInfo | null> {
                    return systemUser;
                }
            }
            MJGlobal.Instance.ClassFactory.Register(WellKnownUserSource, TestSystemUserSource, 'graph-test', 1000);
            try {
                const provider = providerWith({
                    'MJ: Graph Edges': [StoredEdge(IDS.GraphCanon, IDS.EdgeTypeBroader, 'Broader Than', NODE.Deal('deal-1'), NODE.Concept(IDS.ConceptOpenAr), 0.9)],
                    SecretDeals: [{ ID: 'deal-1', Title: 'Project Falcon' }],
                    'MJ: Graph Concepts': CanonMetadataRows()['MJ: Graph Concepts'],
                });
                provider.ProviderType = 'Database';
                // A fresh instance so the sticky system-user resolution runs for this provider.
                const engine = await configure(provider);
                expect(provider.ReadsOf('MJ: Graph Edges', systemUser.ID)).toHaveLength(1);

                const sub = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 1 }, analyst);
                expect(sub.Nodes.map((n) => n.RecordID)).toEqual([IDS.ConceptOpenAr]);
                expect(provider.ReadsOf('MJ: Graph Concepts', analyst.ID).length).toBeGreaterThan(0);
            } finally {
                MJGlobal.Instance.ClassFactory.Register(WellKnownUserSource, WellKnownUserSource, 'graph-test-reset', 2000);
            }
        });
    });

    describe('unknown and inactive graphs', () => {
        it('returns an empty subgraph with a message instead of traversing every graph', async () => {
            const provider = providerWith({
                'MJ: Graph Edges': [StoredEdge(IDS.GraphCanon, IDS.EdgeTypeMeasures, 'Measures', NODE.Query(IDS.QueryArAging), NODE.Concept(IDS.ConceptOpenAr), 0.9)],
            });
            const engine = await configure(provider);
            const unknown = await engine.Subgraph('No Such Graph', canonSeed, {}, analyst);
            expect(unknown.Nodes).toEqual([]);
            expect(unknown.Message).toContain('not found or is not active');

            const disabled = await engine.Subgraph('Old Graph', canonSeed, {}, analyst);
            expect(disabled.Nodes).toEqual([]);
            expect(disabled.Message).toBeDefined();

            expect(await engine.GetEdges('No Such Graph', canonSeed[0], {}, analyst)).toEqual([]);
        });
    });

    describe('visibility as the caller', () => {
        it('hides a query the caller cannot run (UserCanRun().canRun)', async () => {
            const provider = providerWith({
                'MJ: Graph Edges': [
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeMeasures, 'Measures', NODE.Query(IDS.QueryArAging), NODE.Concept(IDS.ConceptOpenAr), 0.92),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeMeasures, 'Measures', NODE.Query(IDS.QueryRestricted), NODE.Concept(IDS.ConceptOpenAr), 0.99),
                ],
            });
            const sub = await (await configure(provider)).Subgraph('MJ Canon', canonSeed, { Depth: 1 }, analyst);
            const labels = sub.Nodes.map((n) => n.Label);
            expect(labels).toContain('AR Aging by Customer');
            expect(labels).not.toContain('Restricted Executive Query');
        });

        it('reads concept and data nodes as the caller, so row-level security hides them', async () => {
            const provider = providerWith({
                'MJ: Graph Edges': [
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeBroader, 'Broader Than', NODE.Concept(IDS.ConceptOpenAr), NODE.Concept(IDS.ConceptHidden), 0.9),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Account('acc-visible'), 0.8),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Account('acc-hidden'), 0.8),
                ],
                Accounts: [
                    { ID: 'acc-visible', Name: 'Acme Corp' },
                    { ID: 'acc-hidden', Name: 'Hidden Co' },
                ],
            });
            provider.HiddenFor[analyst.ID] = [`MJ: Graph Concepts|${IDS.ConceptHidden}`, 'Accounts|acc-hidden'];
            const sub = await (await configure(provider)).Subgraph('MJ Canon', canonSeed, { Depth: 1 }, analyst);
            const ids = sub.Nodes.map((n) => n.RecordID);
            expect(ids).toContain('acc-visible');
            expect(ids).not.toContain('acc-hidden');
            expect(ids).not.toContain(IDS.ConceptHidden);
            expect(sub.Edges.every((e) => e.Target.RecordID !== 'acc-hidden')).toBe(true);
            // Every node read ran as the caller, one batched read per entity per step (never per node).
            const nodeReads = provider.ReadLog.filter((r) => r.EntityName === 'Accounts');
            expect(nodeReads.every((r) => r.UserID === analyst.ID)).toBe(true);
            expect(nodeReads).toHaveLength(1);
            expect(nodeReads[0].Filter).toContain('acc-visible');
            expect(nodeReads[0].Filter).toContain('acc-hidden');
        });

        it('admits only Approved concepts (Proposed with IncludeProposed; Draft and Deprecated never), as a seed or through an edge', async () => {
            const draftId = '77777777-7777-4777-8777-777777777791';
            const proposedId = '77777777-7777-4777-8777-777777777792';
            const deprecatedId = '77777777-7777-4777-8777-777777777793';
            const concept = (id: string, name: string, status: string): FakeRow => ({ ID: id, GraphID: IDS.GraphCanon, Graph: 'MJ Canon', Name: name, Description: null, Status: status });
            const provider = providerWith({
                'MJ: Graph Concepts': [
                    ...CanonMetadataRows()['MJ: Graph Concepts'],
                    concept(draftId, 'Draft Concept', 'Draft'),
                    concept(proposedId, 'Proposed Concept', 'Proposed'),
                    concept(deprecatedId, 'Old Concept', 'Deprecated'),
                ],
                'MJ: Graph Edges': [draftId, proposedId, deprecatedId].map((id) =>
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeBroader, 'Broader Than', NODE.Concept(IDS.ConceptOpenAr), NODE.Concept(id), 0.9),
                ),
            });
            const engine = await configure(provider);

            const reached = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 1 }, analyst);
            expect(reached.Nodes.map((n) => n.RecordID)).toEqual([IDS.ConceptOpenAr]);
            const withProposed = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 1, IncludeProposed: true }, analyst);
            expect(withProposed.Nodes.map((n) => n.RecordID).sort()).toEqual([IDS.ConceptOpenAr, proposedId].sort());

            for (const id of [draftId, proposedId, deprecatedId]) {
                const asSeed = await engine.Subgraph('MJ Canon', [{ EntityName: 'MJ: Graph Concepts', RecordID: id }], { Depth: 1 }, analyst);
                expect(asSeed.Nodes).toEqual([]);
            }
            expect((await engine.FilterNodesForUser([NODE.Concept(proposedId)], analyst, [], { IncludeProposed: true })).size).toBe(1);
            expect((await engine.FilterNodesForUser([NODE.Concept(draftId)], analyst, [], { IncludeProposed: true })).size).toBe(0);
        });

        it('treats a concept whose Status a principal cannot read as not approved', async () => {
            const provider = providerWith({});
            const engine = await configure(provider);
            // What this caller's read returns when field-level security drops the Status column.
            provider.Rows['MJ: Graph Concepts'] = provider.Rows['MJ: Graph Concepts'].map((c) => {
                const { Status: _dropped, ...rest } = c;
                return rest;
            });
            expect((await engine.FilterNodesForUser([NODE.Concept(IDS.ConceptOpenAr)], analyst)).size).toBe(0);
        });

        it('gives no user type a bypass: an Owner without a read grant is denied', () => {
            const provider = providerWith({});
            const owner = MakeUser('u-owner', [], 'Owner');
            expect(CanUserReadEntity(provider.EntityByName('SecretDeals'), owner)).toBe(false);
            expect(CanUserReadEntity(undefined, analyst)).toBe(false);
            expect(CanUserReadEntity(provider.EntityByName('SecretDeals'), executive)).toBe(true);
        });

        it('drops an unusable alternate base view and an entity the caller cannot read', async () => {
            const provider = providerWith({
                'MJ: Graph Edges': [
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeDescribes, 'Describes', NODE.Abv(IDS.InvoicesOpenAbv), NODE.Concept(IDS.ConceptOpenAr), 0.95),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeDescribes, 'Describes', NODE.Abv(IDS.InvoicesBrokenAbv), NODE.Concept(IDS.ConceptOpenAr), 0.95),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Deal('deal-1'), 0.9),
                ],
                SecretDeals: [{ ID: 'deal-1', Title: 'Project Falcon' }],
            });
            const sub = await (await configure(provider)).Subgraph('MJ Canon', canonSeed, { Depth: 1 }, analyst);
            const labels = sub.Nodes.map((n) => n.Label);
            expect(labels).toContain('Invoices.vwInvoicesOpen');
            expect(labels).not.toContain('Invoices.vwInvoicesBroken');
            expect(labels).not.toContain('Project Falcon');
            const asExec = await GraphEngine.Instance.Subgraph('MJ Canon', canonSeed, { Depth: 1 }, executive);
            expect(asExec.Nodes.map((n) => n.Label)).toContain('Project Falcon');
        });
    });

    describe('stored edges and the preload cache', () => {
        it('reads stored edges on demand as the caller when the caller is row-filtered on MJ: Graph Edges', async () => {
            const edgeVisible = StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Account('acc-1'), 0.8);
            const edgeHidden = StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Account('acc-2'), 0.8);
            const specs = StandardEntitySpecs({ 'MJ: Graph Edges': { ReadRoles: 'all', RowFiltered: true } });
            const provider = providerWith(
                {
                    'MJ: Graph Edges': [edgeVisible, edgeHidden],
                    Accounts: [
                        { ID: 'acc-1', Name: 'One' },
                        { ID: 'acc-2', Name: 'Two' },
                    ],
                },
                specs,
            );
            provider.HiddenFor[analyst.ID] = [`MJ: Graph Edges|${String(edgeHidden['ID'])}`];
            const engine = await configure(provider);
            provider.ReadLog = [];
            const sub = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 1 }, analyst);
            expect(sub.Nodes.map((n) => n.RecordID)).toContain('acc-1');
            expect(sub.Nodes.map((n) => n.RecordID)).not.toContain('acc-2');
            const edgeReads = provider.ReadsOf('MJ: Graph Edges');
            expect(edgeReads.length).toBeGreaterThan(0);
            expect(edgeReads.every((r) => r.UserID === analyst.ID)).toBe(true);
            expect(edgeReads[0].Filter).toContain(`[GraphID] = '${IDS.GraphCanon}'`);
            expect(edgeReads[0].MaxRows).toBe(GRAPH_MAX_STORED_EDGES_PER_STEP);
            expect(edgeReads[0].OrderBy).toBe('[ID]');
        });

        it('serves an RLS-exempt caller from the cache with no per-step edge reads', async () => {
            const provider = providerWith({
                'MJ: Graph Edges': [StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Account('acc-1'), 0.8)],
                Accounts: [{ ID: 'acc-1', Name: 'One' }],
            });
            const engine = await configure(provider);
            provider.ReadLog = [];
            const sub = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 1 }, analyst);
            expect(sub.Nodes.map((n) => n.RecordID)).toContain('acc-1');
            expect(provider.ReadsOf('MJ: Graph Edges')).toHaveLength(0);
        });

        it('honours IncludeProposed on a Preload graph by reading proposed edges on demand', async () => {
            const provider = providerWith({
                'MJ: Graph Edges': [StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Account('acc-p'), 0.8, 'Proposed')],
                Accounts: [{ ID: 'acc-p', Name: 'Proposed Co' }],
            });
            const engine = await configure(provider);
            const without = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 1 }, analyst);
            expect(without.Nodes.map((n) => n.RecordID)).not.toContain('acc-p');
            const withProposed = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 1, IncludeProposed: true }, analyst);
            expect(withProposed.Nodes.map((n) => n.RecordID)).toContain('acc-p');
        });

        it('reads an OnDemand graph per step, filtered by its GraphID, never another graph', async () => {
            const provider = providerWith({
                'MJ: Graph Edges': [
                    StoredEdge(IDS.GraphNetwork, IDS.EdgeTypeRelated, 'Related To', NODE.Account('a1'), NODE.Account('a2'), 0.9),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Account('a1'), NODE.Account('a3'), 0.9),
                ],
                Accounts: [
                    { ID: 'a1', Name: 'A1' },
                    { ID: 'a2', Name: 'A2' },
                    { ID: 'a3', Name: 'A3' },
                ],
            });
            const engine = await configure(provider);
            provider.ReadLog = [];
            const sub = await engine.Subgraph('Member Network', [{ EntityName: 'Accounts', RecordID: 'a1' }], { Depth: 1 }, analyst);
            expect(sub.Nodes.map((n) => n.RecordID).sort()).toEqual(['a1', 'a2']);
            expect(provider.ReadsOf('MJ: Graph Edges').every((r) => r.Filter.includes(IDS.GraphNetwork))).toBe(true);
        });
    });

    describe('audience during traversal', () => {
        it('never expands through a node a reader cannot see', async () => {
            const provider = providerWith({
                'MJ: Graph Edges': [
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Account('mid'), 0.9),
                    StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Account('mid'), NODE.Account('far'), 0.9),
                ],
                Accounts: [
                    { ID: 'mid', Name: 'Middle' },
                    { ID: 'far', Name: 'Far' },
                ],
            });
            const reader = MakeUser('u-reader', ['Analyst']);
            provider.HiddenFor[reader.ID] = ['Accounts|mid'];
            const engine = await configure(provider);

            const callerOnly = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 2 }, analyst);
            expect(callerOnly.Nodes.map((n) => n.RecordID)).toEqual([IDS.ConceptOpenAr, 'mid', 'far']);

            const withReader = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 2, AudienceReaders: [reader] }, analyst);
            // 'far' is visible to both, but only reachable through 'mid', which the reader cannot see.
            expect(withReader.Nodes.map((n) => n.RecordID)).toEqual([IDS.ConceptOpenAr]);
            expect(provider.ReadsOf('Accounts', reader.ID).length).toBeGreaterThan(0);
        });
    });

    describe('derived edges under an audience', () => {
        it('keeps a derived edge only when every principal derives it (a reader who cannot read the join rows loses it)', async () => {
            const specs = StandardEntitySpecs({ AccountContacts: { ReadRoles: ['Analyst'] } });
            const rows = CanonMetadataRows();
            const provider = providerWith(
                {
                    'MJ: Graph Edge Providers': [
                        {
                            ID: 'prov-join',
                            GraphID: IDS.GraphNetwork,
                            Name: 'Contacts',
                            DriverClass: 'JoinEntityEdgeProvider',
                            Configuration: JSON.stringify({ JoinEntity: 'AccountContacts', SourceField: 'AccountID', SourceEntity: 'Accounts', TargetField: 'ContactID', TargetEntity: 'Contacts', EdgeTypeName: 'Has Contact' }),
                            Sequence: 1,
                            IsActive: true,
                        },
                    ],
                    'MJ: Graph Edges': rows['MJ: Graph Edges'],
                    AccountContacts: [{ ID: 'ac-1', AccountID: 'acc-1', ContactID: 'con-1' }],
                    Accounts: [{ ID: 'acc-1', Name: 'Acme' }],
                    Contacts: [{ ID: 'con-1', FullName: 'Pat' }],
                },
                specs,
            );
            const engine = await configure(provider);
            const seed = [{ EntityName: 'Accounts', RecordID: 'acc-1' }];
            const alone = await engine.Subgraph('Member Network', seed, { Depth: 1 }, analyst);
            expect(alone.Nodes.map((n) => n.RecordID)).toEqual(['acc-1', 'con-1']);

            const guest = MakeUser('u-guest', ['Guest']); // reads Accounts and Contacts, not AccountContacts
            const withGuest = await engine.Subgraph('Member Network', seed, { Depth: 1, AudienceReaders: [guest] }, analyst);
            expect(withGuest.Nodes.map((n) => n.RecordID)).toEqual(['acc-1']);
        });
    });

    describe('caps, cycles and determinism', () => {
        function chainProvider(): FakeGraphProvider {
            const ids = ['n1', 'n2', 'n3', 'n4', 'n5'];
            const edges = [StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Concept(IDS.ConceptOpenAr), NODE.Account('n1'), 0.9)];
            for (let i = 0; i < ids.length - 1; i++) {
                edges.push(StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Account(ids[i]), NODE.Account(ids[i + 1]), 0.9));
            }
            edges.push(StoredEdge(IDS.GraphCanon, IDS.EdgeTypeRelated, 'Related To', NODE.Account('n5'), NODE.Account('n1'), 0.9)); // cycle
            return providerWith({ 'MJ: Graph Edges': edges, Accounts: ids.map((id) => ({ ID: id, Name: id.toUpperCase() })) });
        }

        it('stops at the depth limit and terminates on cycles', async () => {
            const engine = await configure(chainProvider());
            const sub = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 2 }, analyst);
            expect(sub.Nodes.map((n) => n.RecordID)).toEqual([IDS.ConceptOpenAr, 'n1', 'n2', 'n5']);
            const deep = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 99 }, analyst);
            expect(deep.Nodes).toHaveLength(6);
            expect(deep.Nodes.find((n) => n.RecordID === 'n3')?.Hop).toBe(3);
        });

        it('stops at MaxNodes and says so', async () => {
            const engine = await configure(chainProvider());
            const sub = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 4, MaxNodes: 2 }, analyst);
            expect(sub.Nodes).toHaveLength(2);
            expect(sub.Message).toContain('2-node limit');
        });

        it('clamps depth to 1..4 and MaxNodes to 1..200', () => {
            expect(ClampGraphDepth(99)).toBe(4);
            expect(ClampGraphDepth(0)).toBe(1);
            expect(ClampGraphDepth(undefined)).toBe(2);
            expect(ClampGraphMaxNodes(5000)).toBe(200);
            expect(ClampGraphMaxNodes(-3)).toBe(1);
        });

        it('returns the same nodes in the same order every run, with path provenance', async () => {
            const engine = await configure(chainProvider());
            const a = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 3 }, analyst);
            const b = await engine.Subgraph('MJ Canon', canonSeed, { Depth: 3 }, analyst);
            expect(a.Nodes.map((n) => n.Key)).toEqual(b.Nodes.map((n) => n.Key));
            const n2 = a.Nodes.find((n) => n.RecordID === 'n2');
            expect(n2?.ParentKey).toBe(a.Nodes.find((n) => n.RecordID === 'n1')?.Key);
            expect(n2?.ViaEdgeID).toBeTruthy();
            expect(engine.DescribeForPrompt(a)).toContain('### Semantic Graph Context');
        });
    });
});
