# MJ Docs ↔ Semantic Graph & Canon

**Status:** Plan, not started. Branch `claude/serene-ramanujan-7d0chq`.
**Inspired by:** Tolaria (`refactoringhq/tolaria`, AGPL-3.0: we borrow ideas only, never code).
**Companion guides:** [`guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md`](../guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md),
[`guides/DOCS_SLIDES_SHEETS_ARCHITECTURE.md`](../guides/DOCS_SLIDES_SHEETS_ARCHITECTURE.md),
[`guides/CONTENT_PIPELINE_GUIDE.md`](../guides/CONTENT_PIPELINE_GUIDE.md).

## 1. Goal

A person writes an MJ Doc and it joins the graph with no extra work:

- Its passages attach to the concepts they discuss, so docs about the same thing become neighbours.
- Links the author types (`[[...]]`) become declared edges.
- Concepts that matter can be promoted into a Canon graph and governed there.
- Readers and agents discover all of it: a Related rail, backlinks, inline Canon checks, an inbox of
  unconnected docs, and graph context for agents.
- Nobody learns anything through the graph that they could not read directly.

Out of scope here: replacing the MJ Docs editor (ProseMirror/Tiptap spike, separate plan). The `[[`
autocomplete UI waits for that editor; the `[[...]]` syntax and its edges do not.

## 2. Where things stand (verified against `next` @ `883e71eb0`)

| Piece | State |
|---|---|
| Graph substrate (`__mj.Graph*`, 9 tables) | Shipped. Edges carry `Origin` (Declared/Inferred), `Confidence`, `Status`. |
| `GraphStage` (Content Pipeline) | Shipped. Clusters chunks into concepts; emits `SourcedFrom`, `Mentions`, `Broader Than`, grounding and `Contradicts` edges. |
| `GraphEngine` (`MJCoreEntities/src/graph`) | Shipped. `Subgraph`, `Expand`, `DescribeForPrompt`; derived edge providers (`ForeignKey`, `RecordLink`, `Query`, …). |
| Authority tiers | Table `MJ: Graph Authority Tiers` with `Rank`, loaded by `EntityGraphOverlayStore.LoadAuthorityTiers`. **But** a hardcoded fallback remains (§3). |
| Node visibility | Per viewer: entity `CanRead` plus a batched `RunViews` as that viewer (`GraphEngine.resolveNodesForPrincipal`). Server read hooks on `MJ: Artifacts`, `Artifact Versions` and `Collections` (`RegisterArtifactPostRunViewProtectedEntities`) mean doc nodes should already follow artifact access. Not yet proven by a test. |
| Docs in the pipeline | **None.** `ContentPipeline` has no knowledge of artifacts. |
| Single-item push ingest | `ContentUploadIngestor.Ingest` exists (used for Collaboration Space Items), but takes an `MJ: Files` ID. Library deliberately creates no `MJ: Files` rows. |

## 3. Workstream A: authority tiers fully driven by metadata

Today the order lives in the table, but code still knows the seed names.

| Hardcoded today | File |
|---|---|
| `AuthorityTierPrecedence` constant (Bylaws 100 … Inferred 10), used when a name doesn't match a loaded row | `ContentPipeline/base/src/graph/GraphOverlay.types.ts` |
| `GraphAuthorityTier` union lists seed names (`'Bylaws' \| 'BoardPolicy' \| …`) | same |
| `ResolveGraphOverlayConfig` defaults by name: `'ExecutiveSOP'` for Canon, `'Reference'` otherwise | same, line ~280 |
| The same function also hardcodes `ConceptTaxonomyMode` and `GroundingMode` defaults from `isCanon` | same |
| `?? 'Reference'` fallbacks | `ConceptSeedClustering.ts` (521, 720, 731), `EntityGraphOverlayStore.ts` (76–77), `semantic-graph-explorer.component.ts` (236, 505, 509) |

**Changes**

1. **Defaults move onto `GraphType`.** New migration adds to `__mj.GraphType`, in one `ALTER TABLE`:
   - `DefaultAuthorityTierID UNIQUEIDENTIFIER NULL` (FK to `GraphAuthorityTier`)
   - `DefaultConceptTaxonomyMode NVARCHAR(20) NOT NULL DEFAULT 'auto-grow'` with a CHECK on `constrained | propose-only | auto-grow`
   - `DefaultGroundingMode NVARCHAR(30) NOT NULL DEFAULT 'none'` with a CHECK on `none | schema-and-queries | full-canon`

   With extended properties and appended CodeGen output (no literal `Sequence`). The seeded graph types in
   `metadata/graph-types/` get the defaults the Canon guide documents: Canon → Executive SOP,
   `propose-only`, `full-canon`; Knowledge and Custom → Reference, `auto-grow`, `none`; Network →
   Reference, `constrained`, `none`. (Code today derives every default from `isCanon`, so Network
   actually resolves to `auto-grow`, contradicting the guide; this change makes the guide true.)
   Metadata JSON only, no metadata SQL in the migration.
2. **Precedence comes only from rows.** Delete `AuthorityTierPrecedence`. `GetAuthorityTierRank` takes the
   loaded tier rows and resolves by `ID` first, then by name (case- and space-insensitive, so
   `BoardPolicy` still matches `Board Policy`).
3. **No silent "Reference".** A source configured with an unknown tier fails config resolution with a
   clear error naming the source and the tier. A concept or chunk with no tier is "unranked" (rank 0,
   label "Unranked"), not quietly Reference.
4. **Config accepts an ID.** `ContentSourceGraphOverlayConfig` gains `AuthorityTierID`; the name form
   stays for readability and is resolved against the table.
5. `GraphAuthorityTier` becomes `string`. Inactive tiers are excluded from ranking.

**Tests:** `ConceptSeedClustering.test.ts` and `GraphStage.test.ts` rewritten to use fixture tier rows,
including a custom vertical (e.g. *Statute > Regulation > Guidance*) with no seed names at all;
`semantic-graph.checks.ts` extended to rename a tier and reorder ranks and confirm contradiction
precedence follows the data.

## 4. Workstream B: pluggable graph access policies

The default stays as it is (entity `CanRead` + row-level read as each viewer). Policies plug in where
that is not enough.

**Node policies**
- `BaseGraphNodeAccessPolicy`, registered `@RegisterClass(BaseGraphNodeAccessPolicy, '<Entity Name>')`.
- One batched call per entity per viewer: `FilterNodes(nodes, principal, ctx)` returns, for each node,
  `Visible`, `Redacted` or `Hidden`. Never one call per node.
- **Mode `Extend`** (default): runs after the default read and can only narrow it.
- **Mode `Replace`**: skips the default read for that entity; the policy decides. Code registration only,
  never selected by a metadata row, so metadata-write access cannot swap in a permissive policy.
- `Redacted` reuses the existing neutral label path (`neutralizeUnsharedText`: "<entity> <id>", no text).

**Edge policies**
- `BaseGraphEdgeAccessPolicy`, keyed by edge type name. The default rule stays "visible only if both
  endpoints are visible"; a policy can only narrow.

**Hook points in `GraphEngine`**
- Node policies: inside `resolveNodesForPrincipal`, when nodes are bucketed by entity.
- Edge policies: where candidate edges are admitted (`admitCandidates` / `collectEdgesBetween`).
- The multi-viewer intersection (audience readers) already applies; policies inherit it.

**Rules**
- A policy that throws hides its nodes and logs with context. Fail closed.
- Results are memoised per request; no cross-request cache.
- Policies run on both client and server providers; anything that needs server-only data goes through
  a read the viewer is allowed to make.

**First policies**
1. **Provenance policy** (`Extend`) for `MJ: Graph Concepts`, `MJ: Content Items` and
   `MJ: Content Item Chunks`. A derived node is visible only if the viewer can read **at least one**
   source record it came from: chunk → content item → `EntityRecordDocument` → origin record (for docs,
   the `MJ: Artifacts` row). The origin check goes back through the default node read, so artifact
   access is enforced by the existing read hooks; no second copy of the artifact rules.
   Exception: a concept that is `Approved` in a graph whose type has `IsCanon = 1` is visible to anyone
   who can read the concept; a steward approving it is a deliberate publication.
2. **Contradicts evidence policy** (edge type `Contradicts`): visible only if the viewer can see the
   chunks on both sides.

**Agreement test (required).** A fixture matrix (owner, direct share, inherited through a parent
collection, private, guest-link-only) asserts that, for each viewer, graph visibility of the doc node,
its chunks and its concepts matches `ArtifactPermissionEngine.ResolvePermissions`. This also proves the
§2 claim that doc nodes are already filtered.

## 5. Workstream C: Docs into the graph

1. **Text ingest without files.** Add `ContentUploadIngestor.IngestText` (or a `Text` branch of
   `Ingest`): push-only, takes the markdown body plus an `Origin` record, upserts **one Content Item per
   artifact**, keyed by the origin, so a new version updates the item instead of adding one. Chunks are
   re-embedded only when the content hash changes. Library's "no `MJ: Files`" rule is preserved.
2. **Seeded metadata.** A push-only Content Source "MJ Docs" with `GraphOverlay` enabled, pointing at a
   seeded graph "Library Knowledge" (type Knowledge, `auto-grow`). Synthesizer defaults to the
   deterministic one, so the whole path runs without an LLM key; `ManagedPrompt` is opt-in.
3. **Trigger.** After `MJArtifactVersionEntityServer.Save()` succeeds for a `Markdown Document`
   checkpoint, queue ingest for that artifact: after `super.Save()`, never awaited inside it, debounced
   per artifact so a burst of checkpoints is indexed once. Artifact delete removes the item through the
   existing Delete stage.
4. **Declared links.** On the same trigger, parse `[[...]]` links (to artifacts, entity records and
   Canon concepts) and reconcile `Origin = 'Declared'` edges from the doc: add new, remove stale.
   Edge type: seed `LinksTo` (inverse `LinkedFrom`) in `metadata/graph-edge-types/`. Typed frontmatter
   relations (`belongs_to: [[...]]`, any property whose value is a link) use the same path.
5. **Doc-to-doc relatedness, derived.** A `SharedConceptEdgeProvider` (derived at read time, registered
   in `MJ: Graph Edge Providers`) relates two docs that share concepts, weighted by how many. Nothing
   pairwise is stored, and every edge can be explained by the concepts behind it.
6. **Authority.** A doc's tier comes from its frontmatter (`authority: <tier name or ID>`), else its
   Collection's default, else the graph type's default (§3).
7. **Promotion to Canon.** Remote Operation `Graph.PromoteConceptToCanon`: copies a Knowledge concept
   into a chosen Canon graph as `Proposed` with its `SourcedFrom` edges; stewards approve through the
   existing flow. Gated by edit rights on the target graph.

## 6. Workstream D: UI

- **In the doc:** a Related panel (shared-concept neighbours and declared links) and a Backlinks list.
- **Inline Canon checks:** when indexing finds a `Contradicts` edge between a passage and an
  `Approved` Canon concept of higher rank, post an anchored comment on that block through the existing
  comment system ("Bylaws §4.2 says 60 days"). Idempotent per (block, concept) and dismissible.
- **Library:** an Inbox view of docs with no edges yet, and a graph view of a doc or Collection
  neighbourhood (existing `graph-view` component).
- **Agents:** the Docs tools and realtime workspace get a `get_graph_context` tool backed by
  `GraphEngine.Subgraph` + `DescribeForPrompt`, which applies the same access policies.
- `[[` autocomplete arrives with the editor replacement.

## 7. Delivery order

| PR | Contents | Schema | Changeset |
|---|---|---|---|
| 1 | Workstream A: tiers fully metadata-driven | Yes (GraphType columns) | minor |
| 2 | Workstream B: access policies + provenance + Contradicts policies + agreement test | No | patch |
| 3 | Workstream C: text ingest, seeded source/graph, trigger, declared links, shared-concept provider, promotion op | Metadata + edge type seed | minor |
| 4 | Workstream D: UI | No | patch |

B must land before C turns on, so no derived node is ever unprotected.

## 8. Verification

- Unit tests in every touched package, run and reported.
- Local full environment in this container: PostgreSQL 16 is installed and `dockerd` is available for
  a SQL Server container. Build a private database with the `bootstrap-clean-db` skill, run migrations,
  `mj sync push`, then CodeGen (sync before CodeGen).
- New integration bundle "Docs Semantic Graph": write a doc → item, chunks, concepts and edges appear;
  declared links reconcile on edit; the agreement matrix of §4; a renamed custom tier drives precedence.
- Deterministic integration tier (`pnpm run test:integration`) passes; `check:guards` passes.

## 9. Decisions to confirm before PR 3

1. One Content Item per artifact (latest version only), not one per version. Recommended: history
   stays in Artifact Versions, the graph reflects the current doc.
2. An approved Canon concept is visible to anyone who can read the concept, even if all its sources are
   private. Recommended: yes, since approval is publication.
3. Link syntax `[[Name]]` resolves by name within the viewer's Library, with an ID form
   (`[[mj:<Entity>/<ID>|label]]`) written by the editor once autocomplete exists.
