# Canon unification: one model for everything the organization has ratified

## Status

- **Status**: Proposal. Plan only, no code, except phase U0, which the sponsor approved as a bug-fix exception and which shipped on 2026-11-22 in [MJ 6842](https://github.com/MemberJunction/MJ/pull/6842).
- **Created**: 2026-11-19
- **Sponsor**: Amith Nagarajan (`AN-BC`)
- **Checked against**: `next` at `8d445db1` (2026-11-18). Paths are relative to the repo root. Line numbers move, so search by name.
- **Relation to the Canon master plan** ([MJ 6675](https://github.com/MemberJunction/MJ/pull/6675), `plans/canon-master-plan.md` on its branch): that plan closes the *coordination* problem by December 1. This plan is about the *shape* Canon takes after that. It keeps all seven of its decisions, adds none that contradict them, and asks for nothing before December 1.
- **Superseded in part, 2026-11-28**: the sponsor ruled the decisions this plan left for the December 3 review, and one Software Factory run builds U1 to U6 and Rule 6. See [`canon-factory-run.md`](canon-factory-run.md). The text below is kept as the design.
- **Freeze**: MJ 6675 asks for no new Canon pull requests before December 1. This is a plan-only pull request opened by the sponsor as a named exception, so the December 3 review has a single document to work from. Nothing here should be built before that review. Each phase below becomes one or more `canon` issues there.
- **Where to discuss**: comments on this plan's pull request.

## The idea in one paragraph

Today Canon is a list of places: alternate base views, approved queries, graph concepts and edges, agent notes, skills, actions, flow agents, components, dashboards, and the documents the content pipeline trains on. Each place has its own lifecycle words, its own approval rule, its own way into a prompt, and in two cases its own permission system. The proposal is to treat Canon as a **property** rather than a place: a record is Canon when it is an **approved, current, visible member of a Canon graph**. Every approvable kind joins the graph through a small adapter, so one traversal, one visibility rule, one retrieval path and one health loop serve all of them. Nothing moves out of its table, and no lifecycle column changes.

## What is on `next` today

The parts are already strong. They were built in parallel, so they do not yet agree with each other.

| Area | What exists | Where |
|---|---|---|
| Graph substrate | Nine `__mj.Graph*` tables, the `MJ Canon` graph, seeded graph types, concept types, authority tiers and edge types | `migrations/v6/V202611022300__v6.2.x__Semantic_Graph_And_Graph_Concepts.sql`, `metadata/graph*/` |
| Graph runtime | `GraphEngine`, `CanonGraphEngine`, seven derived edge providers, per-node checks for the caller and every audience reader | `packages/MJCoreEntities/src/graph/`, `packages/MJCoreEntities/src/engines/CanonGraphEngine.ts` |
| Approval stamps | Server-stamped approver, time and definition fingerprint for queries, user views, dashboards and components; `ApprovalStateOf` returns `Current`, `NotApproved` or `Stale` | `packages/MJCoreEntities/src/custom/approvals.ts`, `packages/MJCoreEntitiesServer/src/custom/approvalStamp.ts` |
| Content training | Discover, Extract, Tag, Segment, Embed, Graph and Delete stages on Record Set Processing | `packages/ContentPipeline/`, `guides/CONTENT_PIPELINE_GUIDE.md` |
| Scoped search and RAG | Search scopes with lanes, lane `ExtraFilter`, permission push-down, the origin-record gate for derived content, audience intersection, RRF fusion, a graph lane | `packages/SearchEngine/`, `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md` |
| Row and record security | Entity permissions and RLS, field-level security, `PermissionEngine` domains, authorizations | `guides/UNIFIED_PERMISSIONS_GUIDE.md` |
| Agent context | Notes and examples (`AgentContextInjector`), pre-execution RAG (`AgentPreExecutionRAG`), the `graphExpand` pipeline stage, the `Get Graph Context` action | `packages/AI/Agents/src/`, `packages/Actions/CoreActions/src/custom/data/` |
| Executable canon health | DAG similarity, promotion discovery, workflow telemetry (pure functions, not yet scheduled) | `packages/AI/CorePlus/src/task-graph/` |

## Findings

Each finding was checked against the code at the commit above. Several are small bugs worth fixing whether or not the rest of this plan is adopted.

### F1. Eight lifecycle vocabularies for one idea

| Kind | Lifecycle columns today |
|---|---|
| `MJ: Queries` | `Status` Pending / Approved / Rejected / Expired, plus approval stamp and fingerprint |
| `MJ: Components` | `Status` Draft / Published / Deprecated, and `ApprovalStatus` Pending / Approved / Rejected, plus stamp and fingerprint |
| `MJ: Dashboards`, `MJ: User Views` | `ApprovalStatus` plus stamp and fingerprint |
| `MJ: Actions` | `Status` Active / Disabled / Pending, and `CodeApprovalStatus` Pending / Approved / Rejected |
| `MJ: AI Skills` | `Status` Active / Deprecated / Pending |
| `MJ: Entity Alternate Base Views` | `Status` Active / Deprecated / Disabled |
| `MJ: Graph Concepts` | `Status` Draft / Proposed / Approved / Deprecated |
| `MJ: Graph Edges` | `Status` Proposed / Approved / Rejected, `Origin` Declared / Inferred, `Confidence` |
| `MJ: AI Agent Notes`, `MJ: AI Agent Examples` | `Status` Pending / Active / Provisional / Archived / Revoked (examples have no Provisional) |
| `MJ: Tags` | `Status` plus `RequiresReview` and the tag suggestion queue |

Each is right for its own table. Changing them is not proposed (MJ 6675 decision 5). What is missing is one read-model that says, for any of them, "is this ratified right now?"

### F2. The graph does not know whether a query's approval is current

`QueryMetadataEdgeProvider` stamps every derived `Reads` and `Composes` edge `Status: 'Approved'`, and query nodes are admitted on `UserCanRun` alone. Nothing outside `approvals.ts` calls `ApprovalStateOf`. So a pending query, a rejected one, and an approved query whose SQL changed since approval all reach `CanonContext` and `ExplainEntity` the same way. The fingerprint work in `approvals.ts` is exactly what Canon needs here, and it is not wired in.

### F3. Edge type names drift between code and seed metadata

**Fixed in [MJ 6842](https://github.com/MemberJunction/MJ/pull/6842) (2026-11-22).** Every emitted name is seeded, the `Related To` spelling was already fixed on `next`, `NarrowerThan` is retired in favour of `BroaderThan` (row kept with `AllowStored = 0`), and endpoint rows are seeded for the four concept edges. A unit test (`GraphEdgeTypeRegistry.test.ts`) fails on an unseeded name, a mismatched inverse label, a pair of stored types that invert each other, or an endpoint row that is not artifact → concept. The finding as written on 2026-11-19 follows.

`metadata/graph-edge-types/.graph-edge-types.json` seeds 13 types. Against the code:

- Providers emit `Subsets`, `Is A`, `References`, `Reads`, `Composes` and `Field Of`, none of which is seeded, so their direction, inverse and default weight live only in provider code.
- `RecordLinkEdgeProvider`, `QueryEdgeProvider` and `GraphEngine` default to `'Related To'`; the seed is `RelatedTo`. `BaseConceptSynthesizer` accepts both spellings.
- `Broader Than` and `NarrowerThan` are both seeded as separate directed types, each also naming the other as its inverse, with different spacing (`Narrower Than`, `BroaderThan`).
- `Same As` and `Preferred Over` are specified in `plans/canon-semantic-graph.md`, and `RenderCanonDocument` (MJ 6404) collapses `Preferred Over` edges, but neither type is seeded.
- No `MJ: Graph Edge Type Endpoints` rows are seeded, so no endpoint constraint is enforced for any type.

MJ 6762 also edits this file; the review should check these against its version.

### F4. The content pipeline and the Canon engine read edges in opposite directions

**Fixed in [MJ 6842](https://github.com/MemberJunction/MJ/pull/6842) (2026-11-22)**, with the proposed direction, **artifact → concept**. The synthesizer and the seed descriptions now match `CanonGraphEngine`. `EntityGraphOverlayStore.UpsertEdges` refuses an edge whose type or endpoints break the contract before writing it, and counts it. Two on-demand Record Processes with a dry run flip stored edges: the four concept edges written concept → artifact, and `NarrowerThan` edges retyped as `BroaderThan`. Each host runs them once after upgrading; until then the read path hides old-direction edges, and flipping `Approved` edges needs `Graph: Approve Edges`. The finding as written on 2026-11-19 follows.

`ManagedPromptConceptSynthesizer` writes `Describes`, `Defines`, `Measures` and `Implements` edges with the **concept as source** and the entity, view or query as target, and the seeded descriptions say the same. `CanonGraphEngine.classifyEntityNeighborhood` (behind `ExplainEntity`) looks for `Describes` with the **entity as source** and `Measures` with the **query as source**, as `plans/canon-semantic-graph.md` specifies. Traversal is `Both`, so the pipeline's edges are reached, but they are never classified: a metric concept the pipeline linked to its query never shows up in `MeasuringQueries`, and a concept it linked to an entity never shows up in `DescribedConcepts`.

### F5. Five ways Canon reaches a prompt, each ranked and budgeted on its own

1. `AgentContextInjector`: notes and examples.
2. `AgentPreExecutionRAG`: search scopes, injected as `<retrieved_context>`.
3. The `graphExpand` pipeline stage.
4. The `Get Graph Context` action (and `Find Graph Path` in MJ 6667).
5. `GraphSearchProvider`, a graph lane inside `SearchEngine.Search`, so graph nodes can also arrive through route 2.

There is no shared budget, no shared precedence (MJ 6675 decision 4 states one between concepts and notes, but nothing enforces it at assembly time), and the same concept can enter a prompt twice by two routes.

### F6. Graphs are not a search-scope lane

`LaneKind` is `ExternalIndex | Entity | StorageAccount`. The graph lane picks its graphs from an untyped `ScopeConfig.graphNames` key, then the provider's configured default, then the primary Canon graph. So the scope rule "empty means nothing" does not hold for graphs: a scope cannot say "no graph", cannot name a graph in a governed child row, and `ExplainScope` cannot report which graphs a scope reaches.

### F7. Two bespoke permission systems beside `PermissionEngine`

Search scopes have `SearchScopePermission` and their own `SearchScopePermissionResolver`; it is not a `PermissionEngine` domain. Graphs have no permission at all yet (MJ 6675 workstream 5b proposes one modelled on search scopes). Copying the bespoke pattern a second time would leave sharing UIs, audit timelines and the Sharing Center blind to both.

### F8. "Derived content is no more visible than its source" is written twice

`SearchEngine.VerifyOriginRecords` implements the origin-record gate for content items and chunks. MJ 6762 adds provenance access policies to the graph engine for the same rule applied to concepts synthesized from those chunks. Two implementations of one security rule will drift.

### F9. Approved artifacts that are not graph nodes

Components carry `ApprovalStatus` and a fingerprint, and their spec names the entities, queries and sub-components they use (`dataRequirements.entities`, `dataRequirements.queries`, `dependencies`). Dashboards, user views, actions with approved code, active skills and saved flow agents are also ratified work. None of them is reached by a derived provider today; they enter the graph only through hand-written stored edges such as `Implements`. That leaves out exactly the "approved artifacts are ground truth for building similar things" part of Canon.

### F10. Training and retrieval are wired separately

A content source with `GraphID` trains a graph, and its chunks are embedded into a vector index. A search scope reaches the chunks through its `External Indexes` rows. Nothing connects the two: a scope that reads the *Board Policies* index does not know a graph was built from the same documents, and the graph's `SourcedFrom` edges are not used to cite evidence for a concept found by search.

### F11. Deleting content leaves its edges behind

**Fixed (2026-11-22).** MJ 6762's `GraphEvidenceRetractor` already retracts `Inferred` edges from both delete stages. [MJ 6842](https://github.com/MemberJunction/MJ/pull/6842) closed the remaining gap: `DeleteStage.Purge` no longer hard-deletes a chunk that a kept `Declared` edge still points at. Concepts the retractor can leave without edges are [MJ 6837](https://github.com/MemberJunction/MJ/issues/6837), awaiting a ruling from `rkihm-BC`. The finding as written on 2026-11-19 follows.

`DeleteStage` and `DeleteContentItemStage` remove vectors and rows but do not touch `MJ: Graph Edges`. Because graph edges are polymorphic, there is no foreign key to cascade. Edges whose chunk is gone are hidden at read time (the label fetch returns no row), so this is not a leak, but they accumulate.

## The model

**Canon is the approved, current, visible subgraph of the graphs whose type has `IsCanon = 1`.** Five rules make that true for every kind.

### Rule 1. Membership: one read-model over native lifecycles

A **Canon member adapter** per kind maps the native columns onto one read-only state:

| `CanonState` | Meaning |
|---|---|
| `Draft` | Being written; never traversed |
| `Proposed` | Awaiting review; traversed only with `IncludeProposed` |
| `Approved` | Ratified and current |
| `Stale` | Was approved, but the definition changed since (fingerprinted kinds only) |
| `Deprecated` | Superseded; traversed only to explain what replaced it |
| `Rejected` | Never traversed |

- Adapters are code: a class registered with `@RegisterClass(BaseCanonMemberAdapter, '<entity name>')`, the same pattern as edge providers and permission domains. No column is added or changed.
- Fingerprinted kinds (queries, views, dashboards, components) use `ApprovalStateOf`, so an edited query drops out of Canon the moment its definition changes and comes back when it is re-approved or restored. This fixes F2.
- `GraphEngine` asks the adapter for a node's state during the same batched label-and-permission step it already runs, so the cost is a field or two on a read that already happens.
- Default traversal admits `Approved` nodes and derived structural edges. A `Stale` node is reported as stale, never silently used.
- **Stale policy.** Whether agents see `Stale` members is a setting, not a fixed rule. The graph sets a default and a ceiling; an agent may be stricter than its graph, never looser, so a graph serving members or the public can forbid stale content whatever an agent asks for. Where stale members are shown, the resolver serves the **last approved version** from Record Changes, marked as having an update pending review, never the edited, unratified text. (Open question 1.)
- **Adapters only map.** An adapter turns native columns into a `CanonState` and does nothing else: no permission checks, no writes. That keeps them safe to run in the browser as well as on the server; enforcement stays in the server entity subclasses and in Rule 3. (Open question 3.)
- **Open Apps ship adapters for their own entities only.** `@RegisterClass` keys by entity name and the last registration wins, so an Open App could otherwise replace the core adapter for a core entity and change what counts as approved. A test fails if a core entity's adapter is replaced from outside core. (Open question 6.)

New derived providers bring the missing kinds in (F9): `ComponentMetadataEdgeProvider` (component → entity and query `Reads`, component → component `Composes`, from the approved spec), and providers for dashboards, approved action code, active skills and saved flow agents. Each is a class and one `MJ: Graph Edge Providers` row on `MJ Canon`.

### Rule 2. Vocabulary: the edge type rows are the contract

- Every `TypeName` the code emits resolves to a seeded `MJ: Graph Edge Types` row, including provider-only types (`AllowStored = 0`). A unit test in `MJCoreEntities` fails when a provider or synthesizer emits a name with no row. This fixes F3.
- One direction per type, written on the row and in the guide. Proposed: **artifact → concept** for `Defines`, `Measures`, `Describes` and `Implements`, which is what `CanonGraphEngine`, `plans/canon-semantic-graph.md`, MJ 6667 and the agent actions already assume. The pipeline and the seed descriptions change to match. Existing stored edges are flipped once by a Record Process with a dry run. This fixes F4. (The review may prefer concept → artifact; either works, as long as there is one.)
- One spelling per name and a real inverse instead of a second directed type (`Broader Than` with inverse `Narrower Than`; `NarrowerThan` retired).
- Endpoint rows are seeded for the governed types, so the server subclass rejects, for example, a `Measures` edge whose source is not a query or a view.
- **Proposers check the contract before they write.** The endpoint rows are also what every proposer (Rule 5) validates against *before* creating an edge, so a malformed proposal is never put in front of a reviewer. A violation is logged and counted per proposer, not written. The server subclass stays the backstop. *(From the TrustGraph comparison: its extractor rejects triples that break the ontology's domain and range at extraction time.)*

### Rule 3. Visibility: one rule, called by search and by the graph

One function in core, `ResolveVisibility(nodes, principals)`, answers for a batch of nodes and one or more readers:

1. Entity read permission and row-level security, as the reader (the existing `PK IN (...)` read).
2. Field-level security on the columns that would be shown (label, description, specification).
3. Per-record permission through `PermissionEngine` where a domain exists (queries, skills, agents, artifacts).
4. The derived-content gate: chunk → item → root item → entity record document → origin record, and concept → its `SourcedFrom` evidence.
5. Audience intersection: kept only when every reader passes.

The result for each node is one of three outcomes: **allowed**, **redacted** (visible, but label, description or specification withheld) or **hidden**, the same three MJ 6762's provenance policies already return. Each decision writes one **visibility audit event** (reader or audience, node, outcome, and the step that decided it), so search and the graph are audited the same way and an organization can show who could see which definition, and why. Events are written per batch, not per node, to keep the cost to one write per call. *(From the TrustGraph comparison: its SHACL policy layer returns allowed, filtered or violation per node and publishes an audit event for each evaluation.)*

`SearchEngine.VerifyOriginRecords` and the graph's provenance access policies become callers of it (F8). Then:

- **Graphs become a `PermissionEngine` domain** (`Graph Permissions`: read, use, approve, per graph), which is MJ 6675 workstream 5b built on the unified model instead of beside it.
- **Search scope permissions move into the same model** as a `Search Scope Permissions` domain backed by the existing table. The resolver stays as the implementation, so the change is additive (F7).
- The agent rule in the RAG guide, "check each reader's scope entitlement yourself", moves into the retrieval path in Rule 4, so callers no longer have to remember it.

### Rule 4. Retrieval: one Canon context resolver

A `CanonContextResolver` (in `@memberjunction/ai-agents`, beside the existing `AgentContextAssembler`, which keeps doing prompt formatting) takes a question, the run's principal and audience, and the agent's scope bindings, and returns one ranked, budgeted, cited context block:

| Source | What it contributes |
|---|---|
| Canon graph | Approved concepts with their definitions, the views and queries that define and measure them, and executable canon that implements them |
| Agent notes | Behaviour guardrails only, per MJ 6675 decision 4 |
| Search scopes | Verbatim evidence chunks, linked back to concepts through `SourcedFrom` where they exist |

- **Precedence**: an approved concept outranks a note on any business definition; higher authority tiers outrank lower ones; a canonical note governs behaviour. MJ 6213's precedence order is the source; this is where it is enforced.
- **Dedup**: a concept reached through the graph lane and through `Get Graph Context` appears once.
- **One budget** per run, split by source, configurable per agent.
- **Citations**: every item carries its node key, so the agent can cite it and usage can be counted (MJ 6213's short-ID citations). Citing is a requirement of the resolver's contract, not an option: the answering prompt is told to answer from the block and name the keys it used, and an answer that states a business definition without a cited key is a finding for the health scorecard. *(From Anthropic's [knowledge graph cookbook](https://platform.claude.com/cookbook/capabilities-knowledge-graph-guide): its query step answers only from the graph and cites the edges it used.)*
- **Retrieval trace**: the resolver writes what it put in front of the agent and what the agent cited as MJ 6213's `MJ: AI Agent Context Items` rows (`Injected`, `Cited`, and `Retrieved` when enabled), using `GraphConceptID` for concepts and the polymorphic item columns for edges and evidence chunks. It adds the item's visibility outcome (Rule 3) to the row's `Details`. One table, defined once in MJ 6213, serves the health scorecard, 6213's usage signal and "why did the agent say that". *(From the TrustGraph comparison: it stores a trace of every retrieval in a graph of its own.)*
- **Seeds and filters**: the resolver accepts known concept or record seeds and edge-type filters, as `Get Graph Context` already does, and skips the step that infers concepts from the question when seeds are given. Restricting edge types per hop, rather than for the whole walk, is a later refinement if a use case needs it.

The five routes in F5 become callers of the resolver. Nothing is removed in the first step; each route switches over behind a flag and is compared on the integration suite before the old path is retired.

Graphs become a real lane kind, `Graph`, with a governed child table on search scopes (`MJ: Search Scope Graphs`). An empty table means no graph, `ExplainScope` reports graphs like any other lane, and `ScopeConfig.graphNames` is read only as a fallback until it is removed (F6). This is a schema change and goes to the review under MJ 6675's governance rule 5.

### Rule 5. Training: one path from document to ratified fact

The content pipeline is the training half of Canon, and it should hand its results to retrieval explicitly:

- When a scope reads a vector index fed by a content source with `GraphID`, `ExplainScope` reports that graph, and the scope can include it in one step (F10).
- A concept found by search or by the graph carries its `SourcedFrom` chunks as evidence, so the resolver can show the document behind a definition without a second search.
- `DeleteStage` and `DeleteContentItemStage` remove the edges whose endpoint they delete, in the same unit of work as the row delete (F11).
- Every proposer, including the pipeline, DBAutoDoc (MJ 6586), the learning loop (MJ 6213), usage mining, continuous ingest (MJ 6769) and taxonomy import, follows MJ 6675 decisions 2, 3 and 6: write `Proposed` rows through the one ledger, skip names already in the graph, write nothing by default. Each also validates its edges against the endpoint rows first (Rule 2).
- **Taxonomy import is one more proposer.** An organization can seed a Canon graph from an existing vocabulary in SKOS (or the class and property hierarchy of an OWL or RDFS file): preferred label → concept name, alternative labels → synonyms, definition → description, broader and narrower → the concept hierarchy, related → `RelatedTo`. It writes `Proposed` concepts and `Inferred` edges through the ledger like any other proposer, dry run by default. Exporting a graph as a portable bundle is the other half of this and is tracked as its own `canon` issue in MJ 6675's backlog. *(From the TrustGraph comparison: it imports OWL and RDF and moves knowledge between deployments as portable bundles.)*
- **Resolution by meaning, once, for every proposer** ([MJ 6996](https://github.com/MemberJunction/MJ/issues/6996)). Before a proposer writes a concept, one shared step resolves it against the existing concepts: vector similarity narrows the field, then a model decides within the concept type using each concept's description, with three outcomes: *same concept* (a synonym or `Same As`), *narrower or broader* (`BroaderThan`) or *distinct* (a new concept). Each outcome is a `Proposed` row; a *same* match to a rejected concept is skipped. This is MJ 6675 decision 6's first rule widened from names to meaning, which the sponsor has proposed for the review. It replaces the Content Pipeline's word-overlap matching in `ConceptSeedClustering`, and sits beside Rule 2's endpoint check as the second test every proposal passes. *(From the [knowledge graph cookbook](https://platform.claude.com/cookbook/capabilities-knowledge-graph-guide)'s entity-resolution step; its three-way outcome avoids its main failure, folding something specific into something broad.)*
- **Profiles for the most-connected concepts.** For the concepts with the most edges, training proposes a short `Specification` draft: a summary, three to five facts, and the time range the evidence covers. Every fact links to a `SourcedFrom` chunk, so a reviewer can check each one, and the draft goes through MJ 6213's ledger like any other proposal. Once approved, `RenderCanonDocument` (MJ 6404) shows it to readers. *(From the cookbook's entity summaries.)*
- Permission metadata stamped on vectors at ingest (role, owner, tenant) stays the recall mechanism; Rule 3 stays the truth.

### Rule 6. Promotion: one policy from proposal to Canon, and evidence that it helped

Added 2026-11-28, on the sponsor's direction. Rules 1 to 5 say what Canon is and how it is read. This rule says how something becomes Canon without every decision waiting on a person, and how we know it was worth promoting. It brings together three things that were written separately: the evidence ladder and verification in [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213), graduated autonomy in [`living-canon-continuous-ingest.md`](living-canon-continuous-ingest.md) (workstream F), and the health scorecard below. The rulings are D26 to D40 of [`canon-factory-run.md`](canon-factory-run.md).

**Every proposal carries two scores**, computed, stored on its ledger row with their inputs:

- **Impact** (Low, Medium, High, Critical): what it costs if this is wrong. It comes from the concept's type; how many queries, views, agents and skills depend on it; how often it is cited; whether outside users see it; and whether it changes something already approved. Authority tiers are a different thing: they say how far to trust a source.
- **Confidence**: how strong the evidence is. It comes from the number of independent sources and their authority, the resolution outcome (Rule 5), whether a contradiction was found, and whether replay (below) showed it helped.

**Four routes**, chosen from the two scores and the class's setting:

| Route | When | Result |
|---|---|---|
| Approved by policy | Low impact, strong evidence, class set to Auto | `Approved`, recorded with the rule that allowed it |
| Provisional | The middle band, class set to Auto with audit | `Provisional`: in use, labelled, ranked below `Approved`, with a review-by date; replay and the holdout then decide whether it is proposed for approval or withdrawn |
| A person | High impact, or any class still in Review | A review request with a brief |
| A named owner | Critical, or a contradiction of approved Canon | The same, to the owner of that domain |

- **Every class starts in Review.** A class is a combination an org defines: concept type, domain, source. While a class is in Review the AI reviewer still records what it would have decided, so its agreement with people is known before anyone trusts it. A person moves a class to Auto with audit or Auto, with that record in front of them. **The system never raises a threshold or moves a class.**
- **Some things are never approved automatically**, whatever the settings: Policy and Process concepts; anything that contradicts or supersedes an approved concept; anything whose evidence traces to an untrusted outside source; and anything in a graph shown to outside users, unless the org has opted that graph in.
- **A non-human approval does not publish.** Today a person approving a Canon concept makes it visible to readers who cannot see its sources (Rule 3). A concept approved by policy or by the AI reviewer stays bound to its sources' permissions. This is a setting per graph, off as shipped; an org may turn it on.
- **The review brief.** Every request to a person shows what is proposed, the evidence with links, what depends on it, the case for and against, and a recommendation. The reviewer accepts, overrules or edits, and similar requests are handled together. An overrule is recorded with its reason and counts against the class's record. The reviewing model is never the proposing model.

**Evidence that an item helped** uses MJ 6213's ladder, for every Canon member and not only notes: was it shown, was it cited, do runs with it do better, does replaying a past decision with and without it change the answer for the better, and does withholding it from a random share of runs make them worse. Rule 4's context items record the first two. Replay is the main evidence, because it costs little and has no side effects. The random holdout is read per class, never per concept: one concept sees too few runs to say anything. A human-approved Policy concept is never withheld.

**Evidence that Canon helps at all** is an answer evaluation set per graph: fixed questions with known right answers, scored with Canon on and with Canon off, in the weekly live-model tier. A user's correction of an agent's answer can be added as a case, so the set grows from real mistakes.

**Canon proposes changes to itself.** A scheduled retrospective reads the context items and outcomes and writes proposals through the same ledger: a concept often retrieved but never cited gets a rewrite proposed; one cited and then corrected by the user gets a revision proposed; a cluster of questions with no match becomes a proposed concept. This is one more proposer, under the same routes.

**Contradictions.** Resolution by meaning (Rule 5) gains a fourth outcome, *conflicts with*, written as a proposed `Contradicts` edge, and a scheduled sweep checks approved concepts against each other. A contradiction always goes to a person, and an agent asked about either side says that the two disagree.

**Size.** The engine loads a graph when it is asked for, not every graph in every process, and the browser never holds a whole graph. This is proven by a load test at 250,000 concepts and 2,000,000 edges in one graph. That is a test size, not a limit: no maximum is enforced.

### Health: one scorecard over every member

Because every member now has a `CanonState` and a node key, one scheduled job can score all of Canon, not just workflows:

- approvals that went `Stale`, and how long they have been stale
- members nobody has used in the trailing window (usage comes from Rule 4's citations and retrieval traces, query runs and flow runs)
- proposals rejected for breaking the edge-type contract, per proposer (Rule 2)
- `Contradicts` edges awaiting review
- questions that returned `NO_MATCH` or `AMBIGUOUS_CONCEPT` (MJ 6667), as gap alerts
- extraction quality: precision and recall of the graph stage against a hand-labeled gold set, scored in the weekly live-model tier, so a prompt or model change shows its effect on what training misses or invents, not only on what reviewers reject ([MJ 6997](https://github.com/MemberJunction/MJ/issues/6997); the cookbook's evaluation step)
- answer accuracy with Canon on against Canon off, the agreement between the AI reviewer and people per class, and reversals of policy approvals (Rule 6)
- the workflow telemetry and promotion discovery that already exist in `ai-core-plus`

This is the "Canon audit" report: deterministic findings first, then an AI green, yellow or red per member, then human review.

## What this plan does not change

- MJ 6675's seven decisions, its owners and its December 1 close-out.
- Any lifecycle column, status value, tier or concept type (MJ 6675 decision 5).
- Where anything is stored. Queries stay queries; notes stay notes.
- Storage engine: still relational, RunView-based, bounded traversal. No graph database.
- Usage data stays inside the customer's own instance; the scorecard reads it there and sends nothing out.

## Phases

Each phase is small enough to be one or two `canon` issues. Phases U0 to U2 have no schema change.

| Phase | What | Fixes | Depends on | Done when |
|---|---|---|---|---|
| **U0** ✅ shipped 2026-11-22 in [MJ 6842](https://github.com/MemberJunction/MJ/pull/6842) | Edge type registry: seed the provider-only types, fix spellings and inverses, seed endpoint rows, add the name-resolution unit test. Pick one direction for the four concept edges, fix the synthesizer and the seed descriptions, and ship the flip Record Process. Graph edge cleanup in the two delete stages. | F3, F4, F11 | MJ 6762 merged (it edits the same seed file) | Test green; a pipeline-trained metric concept appears in `ExplainEntity`'s `MeasuringQueries`; the pipeline rejects an edge that breaks its endpoint rows before writing it |
| **U1** | `BaseCanonMemberAdapter` and adapters for every kind in F1; `GraphEngine` reads `CanonState` in its label step; `ApprovalStateOf` wired for fingerprinted kinds. | F1, F2 | U0 | A query edited after approval disappears from `CanonContext` and reappears when re-approved, in an integration bundle |
| **U2** | New derived providers: components, dashboards, approved action code, active skills, saved flow agents. | F9 | U1 | Each kind is reachable from a concept in `MJ Canon` with no stored edge |
| **U3** | `ResolveVisibility` in core; search's origin gate and the graph's provenance policies call it; `Graph Permissions` and `Search Scope Permissions` as `PermissionEngine` domains. | F7, F8 | MJ 6675 5b and 5c designs agreed | One test suite exercises the same fixtures through search and through the graph and gets the same answers, for one reader and for an audience, and both write the same visibility audit events |
| **U4** | `Graph` lane kind and `MJ: Search Scope Graphs`; `ExplainScope` reports graphs and the graphs behind a scope's indexes. | F6, F10 | U3; schema agreed at a monthly review | A scope with no graph rows reaches no graph |
| **U5** | `CanonContextResolver`; the five routes switch over behind a flag; precedence, dedup, one budget, citations. | F5 | U1, U3, MJ 6213 precedence merged | The deterministic integration tier passes with the flag on; prompts for a fixed fixture contain each concept once |
| **U6** | The Canon health scorecard as a scheduled job, and the monthly report. | — | U1, U5 | First report produced on a demo instance |

## Decisions for the December 3 review

1. **Adopt "Canon is a property" as the model**, with `CanonState` as a read-model over native columns rather than a new column.
2. **Edge direction for `Defines`, `Measures`, `Describes`, `Implements`**: settled by the sponsor on 2026-11-22 as artifact → concept, shipped in MJ 6842. The review confirms it or orders a reversal.
3. **Graph and search-scope permissions as `PermissionEngine` domains**, instead of a second bespoke resolver for graphs.
4. **A `Graph` lane kind with a governed child table on search scopes**, retiring `ScopeConfig.graphNames`.
5. **One `CanonContextResolver`** that the five existing routes call, with MJ 6213's precedence enforced there.
6. **U0 as a bug-fix exception**: decided by the sponsor on 2026-11-22: U0 went ahead at once and shipped in MJ 6842.
7. **Resolution by meaning for every proposer** ([MJ 6996](https://github.com/MemberJunction/MJ/issues/6996)): confirm the sponsor's proposed amendment to MJ 6675 decision 6 (Rule 5), where the shared step lives, and its owner.
8. **Effective dates** ([MJ 6998](https://github.com/MemberJunction/MJ/issues/6998)): whether concepts, edges or both carry `EffectiveFrom` and `EffectiveTo`, so the resolver can answer as of a date. MJ 6769's decision records are the first need: its billing-currency example has three decisions, each right for its own period.

## Open questions

1. Should `Stale` members be shown to agents at all, with a warning, or hidden until re-approved? Hidden is safer; shown is more useful while a reviewer catches up.
   - *Input (`topherHunnewell`, 2026-11-20):* make it configurable per graph or per agent; Betty would show them. *Proposed:* configurable, graph default and ceiling, agent may only be stricter, and the last approved version is what is shown. See Rule 1.
2. Do user views and dashboards belong in Canon, or only components and queries? A dashboard is ratified presentation, not a definition.
3. Should adapters live in `@memberjunction/core-entities` (both tiers, like edge providers) or server-only? Client-side Graph Explorer wants the state, which argues for both tiers.
   - *Input (`topherHunnewell`):* both. *Proposed:* both tiers, on the condition that adapters only map state. See Rule 1.
4. Does the resolver's single budget replace per-scope `MaxResults`, or sit above it?
5. Are tags Canon? The governed taxonomy has its own review queue and is used by the pipeline as seed structure. It may be better as a provider (`Tagged` edges) than as a member.
   - *Input (`topherHunnewell`):* a provider, with `Tagged` edges; and let a tag be passed with a question to steer traversal toward nuance the graph did not capture when it was defined. *Proposed:* `Tagged` edges are derived, never stored, and tags are never members. A tag passed with a question may narrow or re-rank what the reader can already see, never widen it, so steering runs after Rule 3. Tag steering is new behaviour and becomes its own `canon` issue.
6. Open Apps ship their own graphs and providers. Should an Open App be able to ship a `BaseCanonMemberAdapter` for its own approvable entities? (Proposed: yes, same pattern.)
   - *Input (`topherHunnewell`):* yes; without it the framework's extensibility is limited. *Proposed:* yes, for the app's own entities only, guarded by a test. See Rule 1.

## Files likely touched

Indicative only; each issue names its own.

| Path | Phase |
|---|---|
| `metadata/graph-edge-types/.graph-edge-types.json` | U0 |
| `packages/ContentPipeline/engine/src/ManagedPromptConceptSynthesizer.ts`, `packages/ContentPipeline/base/src/graph/` | U0 |
| `packages/ContentPipeline/engine/src/stages/DeleteStage.ts` | U0 |
| `packages/MJCoreEntities/src/graph/` (new `canon-members/`, new providers) | U0–U2 |
| `packages/MJCoreEntities/src/engines/CanonGraphEngine.ts` | U1 |
| `packages/MJCoreEntities/src/custom/approvals.ts` (read only; adapters call it) | U1 |
| `packages/SearchEngine/src/generic/SearchEngine.ts`, `GraphSearchProvider.ts`, `ScopeExplanation.ts` | U3–U4 |
| `metadata/permission-domains/.permission-domains.json` | U3 |
| `migrations/v6/` (search scope graphs) | U4 |
| `packages/AI/Agents/src/` (new `CanonContextResolver`; callers in `agent-context-injector.ts`, `agent-pre-execution-rag.ts`, the pipeline executor) | U5 |
| `packages/AI/CorePlus/src/task-graph/workflow-telemetry.ts`, `packages/Scheduling/` | U6 |
| `guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md`, `guides/SEARCH_SCOPES_AND_RAG_GUIDE.md`, `guides/CONTENT_PIPELINE_GUIDE.md` | every phase |

## References

- [MJ 6675](https://github.com/MemberJunction/MJ/pull/6675): Canon master plan (coordination, decisions 1 to 7, governance)
- [MJ 6213](https://github.com/MemberJunction/MJ/pull/6213): memory, learning cycles and Canon precedence
- [MJ 6667](https://github.com/MemberJunction/MJ/pull/6667): path finding and ambiguity result codes
- [MJ 6731](https://github.com/MemberJunction/MJ/pull/6731): concept approval gate (workstream 5a)
- [MJ 6762](https://github.com/MemberJunction/MJ/pull/6762): MJ Docs in the graph, metadata-driven tiers, access policies
- [MJ 6586](https://github.com/MemberJunction/MJ/pull/6586): DBAutoDoc roadmap
- Anthropic's [knowledge graph cookbook](https://platform.claude.com/cookbook/capabilities-knowledge-graph-guide): the source of the 2026-11-28 additions
- [`plans/canon-semantic-graph.md`](canon-semantic-graph.md), [`plans/canon-first-onboarding-and-ambient-health.md`](canon-first-onboarding-and-ambient-health.md)
- [`guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md`](../guides/CANON_AND_SEMANTIC_GRAPHS_GUIDE.md), [`guides/CONTENT_PIPELINE_GUIDE.md`](../guides/CONTENT_PIPELINE_GUIDE.md), [`guides/SEARCH_SCOPES_AND_RAG_GUIDE.md`](../guides/SEARCH_SCOPES_AND_RAG_GUIDE.md), [`guides/UNIFIED_PERMISSIONS_GUIDE.md`](../guides/UNIFIED_PERMISSIONS_GUIDE.md)

## Change log

| Date | Change |
|---|---|
| 2026-11-19 | Plan created. |
| 2026-11-20 | Recorded `topherHunnewell`'s input on open questions 1, 3, 5 and 6 and proposed answers. Rule 1 gains the stale policy, the adapter boundary and the Open App guard. Questions 2 and 4 remain open. |
| 2026-11-20 | Folded in four ideas from a review of TrustGraph (an open-source RDF/OWL "ontology runtime for agents"): proposers validate against the edge-type contract (Rule 2); three visibility outcomes and a visibility audit event (Rule 3); retrieval traces and seeded walks (Rule 4); taxonomy import as a proposer (Rule 5). Export bundles go to MJ 6675's backlog. |
| 2026-11-22 | The sponsor approved U0 as a bug-fix exception. It shipped in MJ 6842 (merge `454ef7d0f`): F3, F4 (artifact → concept, with flip Record Processes) and F11's remaining gap are fixed, and decisions 2 and 6 are recorded as settled. The same pull request repaired the integration checks `fls-closeout-client.CW7`/`CW8` and `work-bus-core.WBC10`, broken on `next` since MJ 6817 and 6825. |
| 2026-11-28 | Folded in five ideas from Anthropic's [knowledge graph cookbook](https://platform.claude.com/cookbook/capabilities-knowledge-graph-guide), accepted by the sponsor: citing is required by the resolver's contract (Rule 4); resolution by meaning for every proposer, with a proposed amendment to MJ 6675 decision 6, and profiles for the most-connected concepts (Rule 5); extraction quality on the scorecard (Health); decisions 7 and 8 for the review. Issues [MJ 6996](https://github.com/MemberJunction/MJ/issues/6996), [MJ 6997](https://github.com/MemberJunction/MJ/issues/6997) and [MJ 6998](https://github.com/MemberJunction/MJ/issues/6998). |
| 2026-11-28 | Added Rule 6, promotion and evidence: impact and confidence on every proposal, four routes including `Provisional`, autonomy by class that only a person raises, a review brief, the evidence ladder for every Canon member, an answer evaluation set, retrospective proposals, contradictions and a size target. The sponsor ruled the open decisions; one Software Factory run builds all of it ([`canon-factory-run.md`](canon-factory-run.md)). |
