/**
 * @fileoverview Integration check bundle `'docs-semantic-graph'` (IT179) — MJ Docs in the semantic graph,
 * against a live database: the seeded "MJ Docs" content source and "Library Knowledge" graph, artifact
 * indexing (`ArtifactGraphIndexer`, `ContentUploadIngestor.IngestText`), `[[Name]]` links, the shared-concept
 * edge provider, the provenance access policies, and graph-evidence retraction. Server transport.
 *
 * DSG1 saves nothing. DSG2–DSG6 (`RequiresMutation`) share a fixture the lifecycle creates and removes:
 * two Markdown Document artifacts owned by the harness user — A private, B shared read-only with a peer
 * user — where A's text links to B with `[[B]]`.
 *
 * The artifact read hooks the server installs at boot are installed here too, so a doc node's visibility
 * is decided by the artifact ACL exactly as it is in MJAPI.
 *
 * Registered check IDs:
 *   - `docs-semantic-graph.DSG1` — the seeded source, graph, edge providers and edge types exist, and the
 *     indexer resolves "MJ Docs" as the target for Markdown Document artifacts
 *   - `docs-semantic-graph.DSG2` — (`RequiresMutation`) indexing an artifact creates one Content Item at its
 *     `record://` URL with the latest version's text, linked to the artifact through an Entity Record
 *     Document, and segmented into chunks; indexing again is a no-op
 *   - `docs-semantic-graph.DSG3` — (`RequiresMutation`) `[[B]]` becomes a `LinksTo` record link that the
 *     Library Knowledge graph projects as an edge; an unknown name stays unresolved
 *   - `docs-semantic-graph.DSG4` — (`RequiresMutation`) for the owner and the peer, a doc's content item and
 *     chunks are visible exactly when `ArtifactPermissionEngine` lets that person read the doc
 *   - `docs-semantic-graph.DSG5` — (`RequiresMutation`) a concept sourced from both docs relates them with a
 *     `SharesConceptWith` edge for the owner, and is redacted for the peer, who can read only one source
 *   - `docs-semantic-graph.DSG6` — (`RequiresMutation`) re-indexing A with new text replaces its item and
 *     retracts the old chunks' graph evidence: an orphaned concept is deleted, a concept still sourced
 *     from B stays
 */
import { randomUUID } from 'node:crypto';
import { RunView, UserInfo, UserRoleInfo } from '@memberjunction/core';
import { EscapeSQLString, GroupByUUID, UUIDSet, UUIDsEqual } from '@memberjunction/global';
import {
    ArtifactPermissionEngine,
    GraphEngine,
    LoadGraphEdgeProviders,
    type MJArtifactEntity,
    type MJArtifactPermissionEntity,
    type MJArtifactVersionEntity,
    type MJGraphConceptEntity,
    type MJGraphEdgeEntity,
} from '@memberjunction/core-entities';
import {
    EnsureArtifactPermissionReadHookRegistered,
    EnsureArtifactReadHookRegistered,
    EnsureArtifactVersionReadHookRegistered,
    EnsureCollectionArtifactReadHookRegistered,
    EnsureCollectionPermissionReadHookRegistered,
    EnsureCollectionReadHookRegistered,
    RegisterArtifactPostRunViewProtectedEntityRegistry,
} from '@memberjunction/core-entities-server';
import { ArtifactGraphIndexer, ContentUploadIngestor, GraphEvidenceRetractor, RecordTextItemURL } from '@memberjunction/content-pipeline';
import { Assert, AssertEqual, IntegrationCheckContext, IntegrationCheckRegistry, NamedCheck } from '@memberjunction/testing-integration';

const BUNDLE = 'docs-semantic-graph';
const GRAPH = 'Library Knowledge';
const SOURCE = 'MJ Docs';
const ARTIFACTS = 'MJ: Artifacts';
const ITEMS = 'MJ: Content Items';
const CHUNKS = 'MJ: Content Item Chunks';
const CONCEPTS = 'MJ: Graph Concepts';

/** What the lifecycle creates; the mutating checks read and extend it. */
interface DocsGraphFixture {
    SourceID: string;
    GraphID: string;
    Peer: UserInfo;
    A: MJArtifactEntity;
    B: MJArtifactEntity;
    Versions: MJArtifactVersionEntity[];
    PeerShare: MJArtifactPermissionEntity;
    /** Concepts and edges a check creates, so teardown removes them even when the check fails. */
    Concepts: string[];
}

let fixture: DocsGraphFixture | null = null;

function requireFixture(): DocsGraphFixture {
    Assert(fixture != null, 'the docs-semantic-graph fixture was not created (Setup failed)');
    return fixture!;
}

/** The artifact read hooks MJAPI installs at boot, so this process enforces the same artifact ACL. */
function installArtifactReadHooks(): void {
    EnsureArtifactReadHookRegistered();
    EnsureArtifactVersionReadHookRegistered();
    EnsureArtifactPermissionReadHookRegistered();
    EnsureCollectionReadHookRegistered();
    EnsureCollectionPermissionReadHookRegistered();
    EnsureCollectionArtifactReadHookRegistered();
    RegisterArtifactPostRunViewProtectedEntityRegistry();
}

async function configuredGraphEngine(ctx: IntegrationCheckContext): Promise<GraphEngine> {
    LoadGraphEdgeProviders();
    await GraphEngine.Instance.Config(true, ctx.User, ctx.Provider);
    return GraphEngine.Instance;
}

async function readRows<T>(ctx: IntegrationCheckContext, entity: string, filter: string, fields?: string[]): Promise<T[]> {
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const res = await rv.RunView<T>({ EntityName: entity, ExtraFilter: filter, Fields: fields, ResultType: 'simple', IgnoreMaxRows: true, BypassCache: true }, ctx.User);
    Assert(res.Success, `reading ${entity} failed: ${res.ErrorMessage}`);
    return res.Results;
}

/** An active user other than the harness user, with their real roles. */
async function loadPeer(ctx: IntegrationCheckContext): Promise<UserInfo> {
    const users = await readRows<{ ID: string; Name: string; Email: string }>(
        ctx,
        'MJ: Users',
        `ID <> '${EscapeSQLString(ctx.User.ID)}' AND IsActive = 1`,
        ['ID', 'Name', 'Email'],
    );
    Assert(users.length > 0, 'an active user other than the harness user is required as the peer');
    const peer = users[0];
    const roles = await readRows<{ RoleID: string; Role: string }>(ctx, 'MJ: User Roles', `UserID = '${EscapeSQLString(peer.ID)}'`, ['RoleID', 'Role']);
    return new UserInfo(ctx.Provider, {
        ID: peer.ID,
        Name: peer.Name,
        Email: peer.Email,
        Type: 'User',
        IsActive: true,
        UserRoles: roles.map((r) => new UserRoleInfo({ UserID: peer.ID, RoleID: r.RoleID, Role: r.Role })),
    });
}

async function saveArtifact(ctx: IntegrationCheckContext, name: string, typeID: string, envID: string): Promise<MJArtifactEntity> {
    const art = await ctx.Provider.GetEntityObject<MJArtifactEntity>(ARTIFACTS, ctx.User);
    art.NewRecord();
    art.Name = name;
    art.TypeID = typeID;
    art.UserID = ctx.User.ID;
    art.EnvironmentID = envID;
    art.Visibility = 'Always';
    Assert(await art.Save(), `saving artifact ${name} failed: ${art.LatestResult?.CompleteMessage ?? ''}`);
    return art;
}

async function saveVersion(ctx: IntegrationCheckContext, art: MJArtifactEntity, versionNumber: number, content: string): Promise<MJArtifactVersionEntity> {
    const ver = await ctx.Provider.GetEntityObject<MJArtifactVersionEntity>('MJ: Artifact Versions', ctx.User);
    ver.NewRecord();
    ver.ArtifactID = art.ID;
    ver.VersionNumber = versionNumber;
    ver.Name = art.Name;
    ver.UserID = ctx.User.ID;
    ver.ContentMode = 'Text';
    ver.Content = content;
    Assert(await ver.Save(), `saving version ${versionNumber} of ${art.Name} failed: ${ver.LatestResult?.CompleteMessage ?? ''}`);
    return ver;
}

/** The live Content Item and its chunks for an artifact in the MJ Docs source. */
async function indexedItem(ctx: IntegrationCheckContext, artifactID: string): Promise<{ Item: { ID: string; Text: string; ExtractionStatus: string; EntityRecordDocumentID: string | null }; Chunks: string[] }> {
    const f = requireFixture();
    const url = RecordTextItemURL(ARTIFACTS, artifactID);
    const items = await readRows<{ ID: string; Text: string; ExtractionStatus: string; EntityRecordDocumentID: string | null }>(
        ctx,
        ITEMS,
        `ContentSourceID = '${EscapeSQLString(f.SourceID)}' AND URL = '${EscapeSQLString(url)}' AND DeleteStatus IS NULL`,
        ['ID', 'Text', 'ExtractionStatus', 'EntityRecordDocumentID'],
    );
    AssertEqual(items.length, 1, `exactly one live Content Item at ${url}`);
    const chunks = await readRows<{ ID: string }>(ctx, CHUNKS, `ContentItemID = '${EscapeSQLString(items[0].ID)}' AND DeleteStatus IS NULL`, ['ID']);
    return { Item: items[0], Chunks: chunks.map((c) => c.ID) };
}

async function index(ctx: IntegrationCheckContext, art: MJArtifactEntity) {
    return ArtifactGraphIndexer.Instance.IndexArtifact(art.ID, ctx.Provider, ctx.User);
}

function ref(entityName: string, recordID: string) {
    return { EntityName: entityName, RecordID: recordID };
}

/** A concept in Library Knowledge with Inferred, Proposed SourcedFrom edges to `chunkIDs`. */
async function conceptSourcedFrom(ctx: IntegrationCheckContext, name: string, chunkIDs: string[]): Promise<MJGraphConceptEntity> {
    const f = requireFixture();
    const engine = await configuredGraphEngine(ctx);
    const conceptType = engine.ConceptTypes.find((t) => t.Status === 'Active') ?? engine.ConceptTypes[0];
    Assert(conceptType != null, 'a seeded MJ: Graph Concept Types row is required');
    const concept = await ctx.Provider.GetEntityObject<MJGraphConceptEntity>(CONCEPTS, ctx.User);
    concept.NewRecord();
    concept.GraphID = f.GraphID;
    concept.Name = name;
    concept.Description = `${name} (integration fixture; safe to delete)`;
    concept.ConceptTypeID = conceptType!.ID;
    concept.Status = 'Proposed';
    concept.Origin = 'Inferred';
    Assert(await concept.Save(), `saving concept ${name} failed: ${concept.LatestResult?.CompleteMessage ?? ''}`);
    f.Concepts.push(concept.ID);
    const sourcedFrom = engine.EdgeTypes.find((t) => t.Name === 'SourcedFrom');
    Assert(sourcedFrom != null, 'the SourcedFrom edge type is required');
    const conceptEntity = ctx.Provider.EntityByName(CONCEPTS);
    const chunkEntity = ctx.Provider.EntityByName(CHUNKS);
    for (const chunkID of chunkIDs) {
        const edge = await ctx.Provider.GetEntityObject<MJGraphEdgeEntity>('MJ: Graph Edges', ctx.User);
        edge.NewRecord();
        edge.GraphID = f.GraphID;
        edge.EdgeTypeID = sourcedFrom!.ID;
        edge.SourceEntityID = conceptEntity!.ID;
        edge.SourceRecordID = concept.ID;
        edge.TargetEntityID = chunkEntity!.ID;
        edge.TargetRecordID = chunkID;
        edge.Weight = 0.9;
        edge.Origin = 'Inferred';
        edge.Status = 'Proposed';
        Assert(await edge.Save(), `saving SourcedFrom edge failed: ${edge.LatestResult?.CompleteMessage ?? ''}`);
    }
    return concept;
}

export const DocsSemanticGraphChecks: NamedCheck[] = [
    {
        Id: `${BUNDLE}.DSG1`,
        Name: 'DSG1: the seeded MJ Docs source, Library Knowledge graph, its edge providers and edge types exist, and the indexer targets Markdown Documents',
        Fn: async (ctx: IntegrationCheckContext) => {
            const engine = await configuredGraphEngine(ctx);
            const graph = engine.GetGraph(GRAPH);
            Assert(graph != null, `the "${GRAPH}" graph must be seeded and active`);
            const graphType = engine.GraphTypes.find((t) => UUIDsEqual(t.ID, graph!.GraphTypeID));
            AssertEqual(graphType?.Name, 'Knowledge', `"${GRAPH}" is a Knowledge graph`);
            const providers = await readRows<{ DriverClass: string; IsActive: boolean }>(ctx, 'MJ: Graph Edge Providers', `GraphID = '${EscapeSQLString(graph!.ID)}'`, ['DriverClass', 'IsActive']);
            AssertEqual(
                providers.filter((p) => p.IsActive).map((p) => p.DriverClass).sort().join(','),
                'RecordLinkEdgeProvider,SharedConceptEdgeProvider',
                `"${GRAPH}" carries the Document Links and Shared Concepts providers`,
            );
            for (const name of ['LinksTo', 'SharesConceptWith']) {
                Assert(engine.EdgeTypes.some((t) => t.Name === name), `the ${name} edge type must be seeded`);
            }
            const targets = await ArtifactGraphIndexer.Instance.ResolveTargets(ctx.User, ctx.Provider);
            const sources = await readRows<{ ID: string; GraphID: string; Entity: string }>(ctx, 'MJ: Content Sources', `Name = '${SOURCE}'`, ['ID', 'GraphID', 'Entity']);
            AssertEqual(sources.length, 1, `the "${SOURCE}" content source must be seeded`);
            AssertEqual(sources[0].Entity, ARTIFACTS, `"${SOURCE}" links its items to ${ARTIFACTS}`);
            Assert(UUIDsEqual(sources[0].GraphID, graph!.ID), `"${SOURCE}" feeds "${GRAPH}"`);
            const target = targets.find((t) => UUIDsEqual(t.ContentSourceID, sources[0].ID));
            Assert(target != null && target.ArtifactTypes.has('markdown document'), `the indexer resolves "${SOURCE}" as the target for Markdown Documents`);
        },
    },
    {
        Id: `${BUNDLE}.DSG2`,
        Name: 'DSG2: indexing an artifact creates one record:// Content Item with its latest text, linked to the artifact and chunked; indexing again is a no-op',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = requireFixture();
            const versionsByArtifact = GroupByUUID(f.Versions, (v) => v.ArtifactID);
            for (const art of [f.A, f.B]) {
                const { Item, Chunks } = await indexedItem(ctx, art.ID);
                const latest = [...(versionsByArtifact.Get(art.ID) ?? [])].sort((x, y) => y.VersionNumber - x.VersionNumber)[0];
                AssertEqual(Item.Text, latest.Content, `${art.Name}'s item holds its latest version's text`);
                AssertEqual(Item.ExtractionStatus, 'Complete', 'pushed text needs no extraction');
                Assert(Chunks.length > 0, `${art.Name}'s item was segmented into chunks`);
                const docs = await readRows<{ RecordID: string; Entity: string }>(ctx, 'MJ: Entity Record Documents', `ID = '${EscapeSQLString(Item.EntityRecordDocumentID ?? '')}'`, ['RecordID', 'Entity']);
                AssertEqual(docs.length, 1, 'the item is linked through an Entity Record Document');
                Assert(UUIDsEqual(docs[0].RecordID, art.ID) && docs[0].Entity === ARTIFACTS, `the record document points at ${art.Name}`);
            }
            const again = await index(ctx, f.B);
            AssertEqual(again.Outcomes.find((o) => UUIDsEqual(o.ContentSourceID, f.SourceID))?.Status, 'Unchanged', 're-indexing identical text is a no-op');
        },
    },
    {
        Id: `${BUNDLE}.DSG3`,
        Name: 'DSG3: [[B]] in A becomes a LinksTo record link that Library Knowledge projects as an edge; an unknown name stays unresolved',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = requireFixture();
            const result = await index(ctx, f.A);
            Assert(result.Links != null, 'links are reconciled for an indexed artifact');
            AssertEqual(result.Links!.Unresolved.join(','), `__IT179 Missing ${f.A.Name.slice(-8)}`, 'an unknown [[name]] stays unresolved');
            const links = await readRows<{ TargetRecordID: string }>(ctx, 'MJ: Record Links', `SourceRecordID = '${EscapeSQLString(f.A.ID)}' AND LinkType = 'LinksTo'`, ['TargetRecordID']);
            AssertEqual(links.length, 1, 'exactly one LinksTo record link from A');
            Assert(UUIDsEqual(links[0].TargetRecordID, f.B.ID), 'the link points at B');
            const engine = await configuredGraphEngine(ctx);
            const edges = await engine.GetEdges(GRAPH, ref(ARTIFACTS, f.A.ID), { Direction: 'Out', EdgeTypes: ['LinksTo'] }, ctx.User);
            Assert(edges.some((e) => e.TypeName === 'LinksTo' && UUIDsEqual(e.Target.RecordID, f.B.ID)), 'the owner sees the LinksTo edge from A to B');
        },
    },
    {
        Id: `${BUNDLE}.DSG4`,
        Name: "DSG4: a doc's content item and chunks are visible to a person exactly when ArtifactPermissionEngine lets them read the doc",
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = requireFixture();
            const engine = await configuredGraphEngine(ctx);
            for (const viewer of [ctx.User, f.Peer]) {
                for (const art of [f.A, f.B]) {
                    const perms = await ArtifactPermissionEngine.Instance.ResolvePermissions(ctx.Provider, art.ID, viewer);
                    const { Item, Chunks } = await indexedItem(ctx, art.ID);
                    const refs = [ref(ARTIFACTS, art.ID), ref(ITEMS, Item.ID), ...Chunks.map((c) => ref(CHUNKS, c))];
                    const visible = await engine.FilterNodesForUser(refs, viewer);
                    const seenIDs = new UUIDSet([...visible.values()].map((v) => v.RecordID));
                    for (const r of refs) {
                        const entityReadable = ctx.Provider.EntityByName(r.EntityName)?.GetUserPermisions(viewer).CanRead === true;
                        const expected = perms.CanRead && entityReadable;
                        const seen = seenIDs.Has(r.RecordID);
                        AssertEqual(seen, expected, `${viewer.Name} on ${r.EntityName} of ${art.Name}: visible must equal (can read the doc AND the entity)`);
                    }
                }
            }
            const peerOnA = await ArtifactPermissionEngine.Instance.ResolvePermissions(ctx.Provider, f.A.ID, f.Peer);
            const peerOnB = await ArtifactPermissionEngine.Instance.ResolvePermissions(ctx.Provider, f.B.ID, f.Peer);
            Assert(!peerOnA.CanRead && peerOnB.CanRead, 'fixture: the peer can read B but not A');
        },
    },
    {
        Id: `${BUNDLE}.DSG5`,
        Name: 'DSG5: a concept sourced from both docs relates them with SharesConceptWith for the owner and is redacted for the peer, who can read one source',
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = requireFixture();
            const a = await indexedItem(ctx, f.A.ID);
            const b = await indexedItem(ctx, f.B.ID);
            const concept = await conceptSourcedFrom(ctx, `__IT179 Shared ${randomUUID().slice(0, 8)}`, [a.Chunks[0], b.Chunks[0]]);
            const engine = await configuredGraphEngine(ctx);
            const edges = await engine.GetEdges(GRAPH, ref(ARTIFACTS, f.A.ID), { Direction: 'Both', EdgeTypes: ['SharesConceptWith'] }, ctx.User);
            const shared = edges.find((e) => e.TypeName === 'SharesConceptWith' && (UUIDsEqual(e.Target.RecordID, f.B.ID) || UUIDsEqual(e.Source.RecordID, f.B.ID)));
            Assert(shared != null, 'the owner sees a SharesConceptWith edge between A and B');
            Assert(JSON.stringify(shared!.Attributes ?? {}).toLowerCase().includes(concept.ID.toLowerCase()), 'the edge names the concept behind it');

            const forOwner = await engine.FilterNodesForUser([ref(CONCEPTS, concept.ID)], ctx.User, undefined, { IncludeProposed: true });
            AssertEqual([...forOwner.values()][0]?.Label, concept.Name, 'the owner, who can read both sources, sees the concept in full');
            if (ctx.Provider.EntityByName(CONCEPTS)?.GetUserPermisions(f.Peer).CanRead && ctx.Provider.EntityByName(CHUNKS)?.GetUserPermisions(f.Peer).CanRead) {
                const forPeer = await engine.FilterNodesForUser([ref(CONCEPTS, concept.ID)], f.Peer, undefined, { IncludeProposed: true });
                const view = [...forPeer.values()][0];
                Assert(view != null && view.Label !== concept.Name && view.Description == null, 'the peer, who can read only B, sees the concept redacted');
            }
            const peerEdges = await engine.GetEdges(GRAPH, ref(ARTIFACTS, f.B.ID), { Direction: 'Both', EdgeTypes: ['SharesConceptWith'] }, f.Peer);
            Assert(!peerEdges.some((e) => UUIDsEqual(e.Source.RecordID, f.A.ID) || UUIDsEqual(e.Target.RecordID, f.A.ID)), 'the peer never sees an edge to A, which it cannot read');
        },
    },
    {
        Id: `${BUNDLE}.DSG6`,
        Name: "DSG6: re-indexing A with new text replaces its item and retracts the old chunks' evidence: an orphaned concept goes, one still sourced from B stays",
        RequiresMutation: true,
        Fn: async (ctx: IntegrationCheckContext) => {
            const f = requireFixture();
            const before = await indexedItem(ctx, f.A.ID);
            const b = await indexedItem(ctx, f.B.ID);
            const orphan = await conceptSourcedFrom(ctx, `__IT179 Orphan ${randomUUID().slice(0, 8)}`, [before.Chunks[0]]);
            const survivor = await conceptSourcedFrom(ctx, `__IT179 Survivor ${randomUUID().slice(0, 8)}`, [before.Chunks[0], b.Chunks[0]]);

            f.Versions.push(await saveVersion(ctx, f.A, 2, `# ${f.A.Name}\n\nRewritten. Still see [[${f.B.Name}]].`));
            const result = await index(ctx, f.A);
            AssertEqual(result.Outcomes.find((o) => UUIDsEqual(o.ContentSourceID, f.SourceID))?.Status, 'Indexed', `changed text is indexed: ${JSON.stringify(result.Outcomes)}`);
            const after = await indexedItem(ctx, f.A.ID);
            Assert(!UUIDsEqual(after.Item.ID, before.Item.ID), 'the item was replaced');

            const edgesToOld = await readRows<{ ID: string }>(ctx, 'MJ: Graph Edges', `TargetRecordID IN (${before.Chunks.map((c) => `'${EscapeSQLString(c)}'`).join(', ')}) AND Origin = 'Inferred'`, ['ID']);
            AssertEqual(edgesToOld.length, 0, "no inferred edge still points at A's old chunks");
            AssertEqual((await readRows<{ ID: string }>(ctx, CONCEPTS, `ID = '${EscapeSQLString(orphan.ID)}'`, ['ID'])).length, 0, 'the orphaned concept was deleted');
            AssertEqual((await readRows<{ ID: string }>(ctx, CONCEPTS, `ID = '${EscapeSQLString(survivor.ID)}'`, ['ID'])).length, 1, 'the concept still sourced from B stays');
        },
    },
];

for (const check of DocsSemanticGraphChecks) {
    IntegrationCheckRegistry.Instance.Register(check);
}

IntegrationCheckRegistry.Instance.RegisterLifecycle(BUNDLE, {
    Setup: async (ctx: IntegrationCheckContext) => {
        installArtifactReadHooks();
        // Index deterministically from the checks; the event-driven path would race them.
        ArtifactGraphIndexer.Instance.Stop();
        const sources = await readRows<{ ID: string; GraphID: string }>(ctx, 'MJ: Content Sources', `Name = '${SOURCE}'`, ['ID', 'GraphID']);
        const types = await readRows<{ ID: string }>(ctx, 'MJ: Artifact Types', `Name = 'Markdown Document'`, ['ID']);
        const envs = await readRows<{ ID: string }>(ctx, 'MJ: Environments', '1 = 1', ['ID']);
        if (sources.length === 0 || types.length === 0 || envs.length === 0) {
            return; // DSG1 reports the missing seed; the mutating checks fail on requireFixture.
        }
        const suffix = randomUUID().slice(0, 8);
        const peer = await loadPeer(ctx);
        const B = await saveArtifact(ctx, `__IT179 Discount Rules ${suffix}`, types[0].ID, envs[0].ID);
        const A = await saveArtifact(ctx, `__IT179 Pricing Policy ${suffix}`, types[0].ID, envs[0].ID);
        const share = await ctx.Provider.GetEntityObject<MJArtifactPermissionEntity>('MJ: Artifact Permissions', ctx.User);
        share.NewRecord();
        share.ArtifactID = B.ID;
        share.UserID = peer.ID;
        share.CanRead = true;
        share.CanEdit = false;
        share.CanDelete = false;
        share.CanShare = false;
        Assert(await share.Save(), `sharing B with the peer failed: ${share.LatestResult?.CompleteMessage ?? ''}`);
        fixture = { SourceID: sources[0].ID, GraphID: sources[0].GraphID, Peer: peer, A, B, Versions: [], PeerShare: share, Concepts: [] };
        fixture.Versions.push(await saveVersion(ctx, B, 1, `# Discount Rules\n\nVolume discounts apply above 100 seats. Partners get 20 percent.\n\nDiscounts never stack.`));
        fixture.Versions.push(
            await saveVersion(ctx, A, 1, `# Pricing Policy\n\nAll prices are net of tax. See [[${B.Name}]] for discounts and [[__IT179 Missing ${suffix}]] for history.\n\nPrices change once a year.`),
        );
        for (const art of [B, A]) {
            const result = await index(ctx, art);
            Assert(result.Outcomes.some((o) => o.Status === 'Indexed'), `indexing ${art.Name} failed: ${JSON.stringify(result.Outcomes)}`);
        }
    },
    Teardown: async (ctx: IntegrationCheckContext) => {
        const f = fixture;
        fixture = null;
        try {
            if (!f) {
                return;
            }
            await removeFixture(ctx, f);
        } finally {
            ArtifactGraphIndexer.Instance.Start();
        }
    },
});

/** Best effort, FK-safe: graph evidence, chunks, items, record documents, links, share, versions, artifacts. */
async function removeFixture(ctx: IntegrationCheckContext, f: DocsGraphFixture): Promise<void> {
    const ignore = () => undefined;
    const ids = [f.A.ID, f.B.ID];
    const urls = ids.map((id) => `'${EscapeSQLString(RecordTextItemURL(ARTIFACTS, id))}'`).join(', ');
    const items = await readRows<{ ID: string; EntityRecordDocumentID: string | null }>(ctx, ITEMS, `ContentSourceID = '${EscapeSQLString(f.SourceID)}' AND URL IN (${urls})`, ['ID', 'EntityRecordDocumentID']).catch(() => []);
    const itemList = items.map((i) => `'${EscapeSQLString(i.ID)}'`).join(', ');
    const chunks = itemList ? await readRows<{ ID: string }>(ctx, CHUNKS, `ContentItemID IN (${itemList})`, ['ID']).catch(() => []) : [];
    const retractor = new GraphEvidenceRetractor(ctx.Provider, ctx.User);
    await retractor.RetractChunks(chunks.map((c) => c.ID)).catch(ignore);
    await retractor.RetractContentItems(items.map((i) => i.ID)).catch(ignore);
    await deleteWhere(ctx, 'MJ: Graph Edges', f.Concepts.length ? `SourceRecordID IN (${f.Concepts.map((c) => `'${EscapeSQLString(c)}'`).join(', ')})` : '').catch(ignore);
    await deleteWhere(ctx, CONCEPTS, f.Concepts.length ? `ID IN (${f.Concepts.map((c) => `'${EscapeSQLString(c)}'`).join(', ')})` : '').catch(ignore);
    await deleteWhere(ctx, CHUNKS, itemList ? `ContentItemID IN (${itemList})` : '').catch(ignore);
    await deleteWhere(ctx, ITEMS, itemList ? `ID IN (${itemList})` : '').catch(ignore);
    const docs = items.map((i) => i.EntityRecordDocumentID).filter((d): d is string => !!d);
    await deleteWhere(ctx, 'MJ: Entity Record Documents', docs.length ? `ID IN (${[...new Set(docs)].map((d) => `'${EscapeSQLString(d)}'`).join(', ')})` : '').catch(ignore);
    await deleteWhere(ctx, 'MJ: Record Links', `SourceRecordID IN (${ids.map((i) => `'${i}'`).join(', ')}) AND LinkType = 'LinksTo'`).catch(ignore);
    await f.PeerShare.Delete().catch(ignore);
    for (const v of f.Versions) {
        await v.Delete().catch(ignore);
    }
    await f.A.Delete().catch(ignore);
    await f.B.Delete().catch(ignore);
}

async function deleteWhere(ctx: IntegrationCheckContext, entity: string, filter: string): Promise<void> {
    if (!filter) {
        return;
    }
    const rv = RunView.FromMetadataProvider(ctx.Provider);
    const res = await rv.RunView<{ Delete(): Promise<boolean> }>({ EntityName: entity, ExtraFilter: filter, ResultType: 'entity_object', IgnoreMaxRows: true, BypassCache: true }, ctx.User);
    for (const row of res.Results ?? []) {
        await row.Delete();
    }
}
