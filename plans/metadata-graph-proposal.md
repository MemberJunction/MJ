# MJ Metadata Graph — Proposal

> **Status:** Draft proposal. Not started.
> **Owner:** TBD.
> **Goal:** Project MemberJunction's metadata into a queryable, traversable dependency graph that powers blast-radius analysis, lineage, agent-tool composition, validation, and natural-language reasoning over the platform itself — for both engineers and (especially) end-user agent builders.

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Prior Art Across the Industry](#2-prior-art-across-the-industry)
3. [MJ's Position & Core Thesis](#3-mjs-position--core-thesis)
4. [Conceptual Model — Nodes and Edges](#4-conceptual-model--nodes-and-edges)
5. [Architecture](#5-architecture)
6. [Storage Strategy](#6-storage-strategy)
7. [Query API](#7-query-api)
8. [MCP Integration](#8-mcp-integration)
9. [Validation & Mutation Hooks](#9-validation--mutation-hooks)
10. [Visualization](#10-visualization)
11. [Performance Considerations](#11-performance-considerations)
12. [Phased Roadmap](#12-phased-roadmap)
13. [Risks & Open Questions](#13-risks--open-questions)
14. [Initial Task List](#14-initial-task-list)

---

## 1. Executive Summary

MemberJunction's value proposition is layered:

- **Layer A — Platform engineering.** Engineers, augmented by AI, build and extend the platform itself. MJ's strict typing, generated entity classes, CodeGen pipeline, and `@RegisterClass` factory make this layer safe under AI authorship.
- **Layer B — End-user app and agent building.** Non-engineers, augmented by agents, build user-defined entities, AI agents, prompts, dashboards, and workflows on top of the platform.

Layer A is well-served by the type system. **Layer B is where today's MJ has a gap** — when an end-user agent renames a field, deletes an action, or rewires a sub-agent tool, there is no first-class structure for reasoning about *what else depends on that thing*. The information exists across `EntityField`, `EntityRelationship`, `Action`, `AIAgent`, `AIAgentAction`, `Template`, `Query`, `UserView`, `Dashboard`, etc., but it's never projected as a single addressable graph.

**This proposal introduces `@memberjunction/metadata-graph`** — a singleton service that:

1. Hydrates an in-memory typed dependency graph from existing metadata at startup.
2. Stays current via event-driven incremental updates from `BaseEntity` Save/Delete events.
3. Exposes a typed query API (`dependents`, `dependencies`, `pathBetween`, `subgraph`, `wouldBreak`, `affectedBy`).
4. Surfaces those queries via the MJ MCP server so any LLM agent can reason about the platform.
5. Powers a visualization dashboard for end-user lineage and provenance.
6. Hooks into pre-mutation validation so destructive metadata changes surface their blast radius before they execute.

The result: end users (and the agents acting for them) get the same kind of structural awareness that compiled type systems give engineers — at runtime, over user-authored artifacts, in a form an LLM can query directly.

---

## 2. Prior Art Across the Industry

The "metadata as a queryable graph" idea isn't new — it shows up in a dozen platforms under different names, with very different scopes. Understanding the spectrum sharpens what MJ should and shouldn't copy.

### 2.1 Palantir Foundry — Ontology
The closest conceptual match. Foundry's **Ontology** is an explicit graph of business *Object Types* (entities), *Properties* (fields), *Link Types* (relationships), and *Action Types* (state mutations), all queryable as a unified semantic layer. Foundry's AI offering (AIP) is built directly on top of the Ontology — agents reason over Object/Link/Action graphs, and changes are governed centrally. Foundry's bet is identical to ours: *the only durable substrate for enterprise AI is a graph of business meaning, not a pile of tables.*

**What to steal:** the explicit separation of Object Types / Link Types / Action Types as first-class graph concepts; the idea that agents primarily operate via Actions which are themselves graph-edges-with-behavior.

### 2.2 Doss — OrgGraph + Triumvirate
The recent entrant we covered separately. Memgraph-backed graph of tables/forms/workflows, traversed by the **Triumvirate** validator on every schema mutation, exposed to LLMs via **GraphRAG** and an MCP server. Their differentiator is *runtime mutation safety* — because Doss has no compiler, the graph *is* the type system.

**What to steal:** the MCP-first exposure pattern; the "compiler-like" pre-mutation validation framing; the idea that the graph is the AI substrate, not just an analytics tool.

### 2.3 Salesforce — "Where is this used?" + Schema Builder + Setup Audit Trail
Salesforce has a long-standing dependency model exposed through *Where is this used?* on fields, formulas, flows, validation rules, and Apex classes. The **MetadataComponentDependency** API in the Tooling API exposes the dependency graph programmatically. Schema Builder visualizes object-to-object relationships. It's not exposed as a unified graph — it's many narrow APIs — but the *dependency tracking concept* is mature and shipping at scale.

**What to steal:** the "Where is this used?" UI affordance on every metadata object as a baseline expectation; the MetadataComponentDependency-style API for programmatic access.

### 2.4 ServiceNow — CMDB
The **Configuration Management Database** is ServiceNow's graph of IT assets, services, and their dependencies, traversable via the *Dependency Views* feature. Less about app metadata, more about runtime topology — but the UI patterns (collapsible dependency trees, impact analysis on CI changes) are directly applicable.

**What to steal:** the *Impact Analysis* UI pattern — "if this CI fails, here's what's downstream."

### 2.5 OutSystems — TrueChange & Architecture Dashboard
OutSystems is a low-code platform whose **TrueChange** engine analyzes the entire app dependency graph on every save and surfaces broken references *before* deploy. The **Architecture Dashboard** projects cross-app dependencies for governance. This is the closest analog to what MJ needs at Layer B: low-code authors mutating things, with a graph that catches breakage at authoring time rather than at runtime.

**What to steal:** the authoring-time validation loop; the visual presentation of cross-module dependencies as a governance tool.

### 2.6 Mendix — Model SDK
Mendix exposes its entire app model as a programmable JavaScript SDK — every entity, microflow, page, and association is an addressable node. This is the most "platform-as-graph" of the low-code players. Tools that operate on Mendix models (linters, migrators, generators) all traverse the same SDK graph.

**What to steal:** the SDK pattern — the graph isn't just for visualization; it's the surface third-party tooling and AI agents both use to mutate the system.

### 2.7 Microsoft Dataverse / Power Platform — Solution Dependencies
Dataverse tracks *Solution Dependencies* between tables, columns, forms, views, business rules, and Power Automate flows. The **Solution Layers** UI shows what depends on what across managed/unmanaged solutions. It's coarse-grained but production-proven at massive scale.

**What to steal:** the solution-level rollup view ("if I uninstall this solution, here's everything that breaks").

### 2.8 dbt — DAG of Models
**dbt** turns SQL transformations into a directed acyclic graph of models, with automatically generated lineage between them. **`dbt docs`** generates a navigable graph site. The DAG drives both execution order and impact analysis (`--select state:modified+` runs only downstream-affected models).

**What to steal:** auto-generated docs/visualization as a first-class output of the graph; the convention that graph traversal *also* drives execution ordering.

### 2.9 Apache Atlas / OpenLineage / Marquez — Data Lineage
Open standards and tools for column-level data lineage across heterogeneous data systems. Atlas uses a typed entity graph (much like what we'd build) with classifications, relationships, and lineage edges.

**What to steal:** the typed-entity-graph data model; the open-standard lineage event format (OpenLineage) as a possible export format for interop.

### 2.10 Atlan / Collibra / Alation — Data Catalogs
Modern data catalogs render column-level lineage graphs across warehouses, BI tools, and pipelines. They are the polished commercial UX for what dbt + Atlas provide raw.

**What to steal:** the lineage UX patterns — left-to-right column lineage, expandable upstream/downstream nodes, diff-on-graph for change review.

### 2.11 Backstage — Software Catalog
Spotify's open-source developer portal models services, components, APIs, resources, and their relationships in a YAML-defined graph. The **Software Catalog** is queryable, and plugins (TechDocs, Scaffolder, Tech Insights) all consume the graph.

**What to steal:** the YAML-as-source-of-truth pattern (we already do this with `mj-sync` JSON files) and the plugin architecture where the graph is a substrate other tools build on.

### 2.12 Hasura / PostGraphile — Schema Introspection as Graph
GraphQL servers expose their type system via introspection — effectively a queryable graph of types, fields, and relationships. Tooling (codegen, query builders, AI assistants) consumes the introspection result.

**What to steal:** the "graph as introspection endpoint" pattern. MJ's MCP-exposed graph is the analogous primitive for the AI era.

### 2.13 Linear / Notion — Backlinks & Relations
Consumer-grade examples: Notion databases with relations and rollups, Linear's project/cycle/issue graph, Roam/Obsidian backlinks. They prove that *bidirectional reference tracking* is a UX expectation users now bring to every system.

**What to steal:** the affordance bar — every metadata object's detail page should show "References" and "Referenced by" as a baseline.

### 2.14 GitHub — Dependency Graph & Code Owners
GitHub's dependency graph (Dependabot's substrate), CODEOWNERS resolution, and the cross-repo references in Issues/PRs are all production-scale graphs over engineering metadata.

**What to steal:** the dependency-as-security-input pattern — "this metadata change touches a permission edge owned by Role X; flag it for that role's reviewer."

### 2.15 NetSuite SuiteCloud / Acumatica Customization Projects
Both ERP platforms ship *customization project* dependency tooling — coarser than what we'd build, but proves the requirement at the ERP layer Doss is targeting.

**What to steal:** nothing architecturally; useful as a "minimum viable competitive table-stakes" benchmark.

### 2.16 Summary Table

| Platform | Graph Primitive | Storage | AI Surface | Mutation Validation |
|---|---|---|---|---|
| Palantir Foundry | Ontology (Objects/Links/Actions) | Proprietary | AIP (graph-native) | Yes |
| Doss | OrgGraph (Tables/Forms/Workflows) | Memgraph | MCP + GraphRAG | Triumvirate |
| Salesforce | MetadataComponentDependency | Proprietary | Einstein (limited) | Partial |
| ServiceNow | CMDB | Proprietary RDB + graph layer | Now Assist | Impact Analysis |
| OutSystems | TrueChange model graph | Proprietary | Limited | TrueChange |
| Mendix | Model SDK | Proprietary | Maia | Model API |
| Dataverse | Solution dependencies | Dataverse | Copilot Studio | Partial |
| dbt | DAG of models | YAML/in-memory | None native | Compile-time |
| Apache Atlas | Typed entity graph | JanusGraph | None native | None |
| Atlan/Collibra | Lineage graph | Proprietary | Embedded AI | None |
| Backstage | Software catalog | Postgres/in-memory | Plugin | None |
| Hasura | GraphQL introspection | Postgres | None native | Schema-time |
| **MJ (proposed)** | **Metadata Graph** | **In-memory + optional Memgraph/SQL graph** | **MCP-first** | **Pre-Save hooks** |

The pattern across the industry is unmistakable: every serious platform building toward AI-mediated change ends up with a metadata graph. The differentiators are (a) *what counts as a node*, (b) *where the graph lives*, and (c) *how tightly it's coupled to mutation flow*. MJ's advantage is that we can ship a unified graph across data, actions, agents, prompts, templates, dashboards, and permissions — most competitors only have one or two of those.

---

## 3. MJ's Position & Core Thesis

### 3.1 The two-layer bet

| Layer | Author | Tooling | Safety net |
|---|---|---|---|
| **A — Platform** | Engineers + AI | TypeScript, CodeGen, `@RegisterClass`, Zod, manifests | Compile-time types + tests + git review |
| **B — User-built apps & agents** | Non-engineers + agents | Metadata UI, mj-sync, agent-builder agents | **(gap)** — needs graph |

Layer A is locked down. Layer B currently relies on the *engineer* understanding the cross-cutting effects of a metadata change. When that engineer is replaced by an LLM-driven builder agent acting on behalf of an end user, the absence of a structural safety net becomes the dominant risk.

### 3.2 Why a graph specifically (vs. ad-hoc queries)

We could keep answering "what depends on this?" via point-queries against `EntityField`, `EntityRelationship`, `AIAgentAction`, etc. The reasons to project once into a graph:

1. **Cross-table traversal cost.** Multi-hop questions ("what agents are downstream of this field via any chain?") are O(N) in a graph, O(N × hops) and joins-heavy in SQL.
2. **Edge typing.** A graph lets us name the *kind* of dependency — `READS`, `WRITES`, `RENDERS`, `DELEGATES_TO`, `PERMITTED_ON` — which is essential for blast-radius reasoning. SQL joins lose that semantic.
3. **LLM ergonomics.** Graph traversal questions in natural language ("which agents would be affected if I delete this prompt?") map cleanly to a small set of typed graph operations. Each new SQL-shaped question requires a new query.
4. **Snapshot diffing.** Two graph snapshots diff cleanly; two SQL states diff awkwardly.
5. **Visualization.** Cytoscape/D3 want a graph; SQL gives them a join puzzle.

### 3.3 Why this isn't just "another cache"

MJ already has a sophisticated multi-tier cache for entity/view data (per `guides/CACHING_AND_PUBSUB_GUIDE.md`). The metadata graph is **not** a competitor to it — it caches a different shape of data (typed adjacency, not result rows) for a different purpose (structural reasoning, not query results). It can subscribe to the same `BaseEntity` Save events the cache uses for invalidation.

### 3.4 Why MJ wins this category if we ship it

Compared to the platforms in §2:

- **vs. Foundry** — same architectural depth, but open-source and self-hostable; we don't lock customers into a $10M Palantir contract.
- **vs. Doss** — they have the graph but not the compiler; we have the compiler and add the graph.
- **vs. Salesforce/Dataverse** — they have *partial* dependency tracking through narrow APIs; we ship a unified, AI-queryable surface.
- **vs. OutSystems/Mendix** — they have model graphs but no AI agents authoring user apps; we get there first.
- **vs. dbt/Atlan** — they're data-only; we cover data + actions + agents + prompts + permissions.

The combined surface area — *typed code at Layer A + typed graph at Layer B + open source + self-hostable + MCP-native* — is, as far as we can see, unique.

---

## 4. Conceptual Model — Nodes and Edges

### 4.1 Node kinds

Every node has a stable `nodeKey` (string), a `kind` (enum), a backing entity reference (`{ entityName, primaryKey }`), and a denormalized `displayName`. The graph mirrors metadata-defining MJ entities:

| Kind | Backing Entity | Notes |
|---|---|---|
| `Entity` | `Entities` | Core data tables (including user-defined dynamic entities) |
| `EntityField` | `Entity Fields` | Columns; carries type info for semantic edges |
| `EntityRelationship` | `Entity Relationships` | Foreign-key and many-to-many links |
| `EntityPermission` | `Entity Permissions` | Role-scoped CRUD bits |
| `Application` | `Applications` | Top-level user-facing app groupings |
| `ApplicationEntity` | `Application Entities` | Entity-in-app inclusion edges |
| `View` | `User Views` | Saved query/filter projections |
| `Query` | `Queries` | Stored SQL/composable queries |
| `QueryField` | `Query Fields` | Output columns of a query |
| `QueryParameter` | `Query Parameters` | Inputs of a query |
| `Action` | `Actions` | Invokable operations |
| `ActionParam` | `Action Params` | Action input/output parameters |
| `ActionResultCode` | `Action Result Codes` | Discrete outcomes |
| `AIAgent` | `MJ: AI Agents` | Agents (root or sub) |
| `AIAgentPrompt` | `MJ: AI Agent Prompts` | Agent ↔ prompt linkage |
| `AIAgentAction` | `AI Agent Actions` | Agent ↔ action linkage (tool grants) |
| `AIAgentNote` | `AI Agent Notes` | Persistent agent memory |
| `AIPrompt` | `AI Prompts` | Prompt definitions |
| `AIPromptModel` | `MJ: AI Prompt Models` | Prompt ↔ model linkage |
| `AIModel` | `AI Models` | LLM model defs |
| `AIVendor` | `MJ: AI Vendors` | Inference providers / model developers |
| `Template` | `Templates` | Reusable text/HTML/SQL templates |
| `TemplateContent` | `Template Contents` | Per-type content blocks of a template |
| `TemplateParam` | `Template Params` | Template input parameters |
| `Dashboard` | `Dashboards` | User-facing dashboards |
| `Report` | `Reports` | Saved reports |
| `Conversation` | `Conversations` | Chat threads (for agent context) |
| `ConversationArtifact` | `MJ: Conversation Artifacts` | Outputs persisted from conversations |
| `Role` | `Roles` | Permission groupings |
| `User` | `Users` | Identity (sparingly — only as edge endpoint) |
| `ScheduledAction` | `Scheduled Actions` | Time-triggered action invocations |
| `CommunicationProvider` | `Communication Providers` | Email/SMS/etc. integrations |
| `EntityAIAction` | `Entity AI Actions` | Entity-triggered AI invocations |

### 4.2 Edge kinds

Every edge has a `kind` (enum) and is directional. Cardinality and additional metadata (e.g., R/W/D bits on permission edges) live as edge properties.

| Edge Kind | From → To | Notes |
|---|---|---|
| `HAS_FIELD` | Entity → EntityField | Structural |
| `RELATES_TO` | Entity → Entity (via EntityRelationship) | With cardinality + FK column |
| `PERMITTED_ON` | Role → Entity | With CanRead/CanCreate/CanUpdate/CanDelete bits |
| `BELONGS_TO_APP` | Entity → Application | Via ApplicationEntity |
| `READS` | Action → Entity | Static analysis of action code/metadata |
| `WRITES` | Action → Entity | Static analysis of action code/metadata |
| `READS_FIELD` | Query/View → EntityField | Parsed from SQL/filter |
| `READS_ENTITY` | Query/View → Entity | Coarser version when field-level not parseable |
| `HAS_PARAM` | Action/Query/Template → ActionParam/QueryParameter/TemplateParam | Structural |
| `HAS_RESULT_CODE` | Action → ActionResultCode | Structural |
| `HAS_TOOL` | AIAgent → Action | Via AIAgentAction |
| `USES_PROMPT` | AIAgent → AIPrompt | Via AIAgentPrompt |
| `DELEGATES_TO` | AIAgent → AIAgent | Sub-agent tree (parent-child) |
| `RENDERS` | AIPrompt → Template | Prompt body templating |
| `RUNS_ON` | AIPrompt → AIModel | Via AIPromptModel |
| `OFFERED_BY` | AIModel → AIVendor | Inference provider relationship |
| `DEVELOPED_BY` | AIModel → AIVendor | Model creator relationship |
| `REFERENCES_FIELD` | Template → EntityField | Parsed from template body (e.g., `{{Account.Name}}`) |
| `REFERENCES_ENTITY` | Template → Entity | Coarser fallback |
| `DISPLAYS` | Dashboard → View/Query/Entity | Dashboard tile data sources |
| `SOURCES_FROM` | Report → Query/View/Entity | Report data sources |
| `TRIGGERS` | ScheduledAction → Action | Scheduled invocations |
| `SENDS_VIA` | Action/Agent → CommunicationProvider | For comms-emitting nodes |
| `OWNS` | User → Conversation/Dashboard/Report | Provenance |
| `PRODUCED` | Conversation → ConversationArtifact | Output lineage |

### 4.3 Derived/computed edges

Some edges aren't direct rows in metadata — we compute them by parsing content:

- **`REFERENCES_FIELD`** from template bodies: scan `{{Entity.Field}}` and `{{Entity.FK -> RelatedEntity.Field}}` patterns. Re-run on `Template`/`TemplateContent` Save.
- **`READS`/`WRITES`** from Action code: a static pass over `Action.Code` for `RunView`/`GetEntityObject`/`Save`/`Delete` calls and their entity-name arguments. Re-run on `Action` Save. Heuristic, not perfect — flag uncertain edges as `confidence: 'inferred'`.
- **`READS_FIELD`** from Query SQL: parse SELECT/WHERE clauses against the entity catalog. Best-effort; fall back to `READS_ENTITY`.
- **`DELEGATES_TO`** from agent prompt bodies: scan for sub-agent invocation patterns the agent runtime understands.

### 4.4 Edge properties (illustrative)

```typescript
type EdgeProperties = {
    confidence?: 'declared' | 'inferred';   // declared = from a metadata FK; inferred = from parsing
    cardinality?: 'one-to-one' | 'one-to-many' | 'many-to-many';
    fkColumn?: string;                       // for RELATES_TO
    canRead?: boolean;                       // for PERMITTED_ON
    canCreate?: boolean;
    canUpdate?: boolean;
    canDelete?: boolean;
    fieldRef?: string;                       // e.g., "{{Account.Name}}" for REFERENCES_FIELD
    sourceLine?: number;                     // for inferred edges, where in source we found it
};
```

---

## 5. Architecture

### 5.1 Package layout

New package: **`@memberjunction/metadata-graph`**, in `packages/MetadataGraph/` following MJ monorepo conventions.

```
packages/MetadataGraph/
├── src/
│   ├── index.ts                       // public exports
│   ├── MetadataGraph.ts               // singleton orchestrator (extends BaseSingleton)
│   ├── types/
│   │   ├── NodeKind.ts                // NodeKind union type
│   │   ├── EdgeKind.ts                // EdgeKind union type
│   │   ├── GraphNode.ts
│   │   ├── GraphEdge.ts
│   │   └── QueryTypes.ts              // input/output shapes for query API
│   ├── hydration/
│   │   ├── GraphHydrator.ts           // initial load orchestrator
│   │   ├── EntityHydrator.ts          // each metadata kind has a hydrator
│   │   ├── ActionHydrator.ts
│   │   ├── AgentHydrator.ts
│   │   ├── PromptHydrator.ts
│   │   ├── TemplateHydrator.ts
│   │   ├── QueryHydrator.ts
│   │   ├── ViewHydrator.ts
│   │   ├── DashboardHydrator.ts
│   │   ├── ReportHydrator.ts
│   │   ├── PermissionHydrator.ts
│   │   └── ScheduledActionHydrator.ts
│   ├── parsers/
│   │   ├── TemplateRefParser.ts       // {{Entity.Field}} extraction
│   │   ├── ActionCodeParser.ts        // RunView/GetEntityObject scanning
│   │   └── QuerySqlParser.ts          // SELECT/FROM/WHERE entity ref extraction
│   ├── store/
│   │   ├── GraphStore.ts              // in-memory adjacency index
│   │   └── GraphStoreInterface.ts     // pluggable backend interface
│   ├── subscribers/
│   │   ├── BaseEntitySubscriber.ts    // listens to Save/Delete events
│   │   └── MetadataChangeRouter.ts    // routes per-entity changes to hydrators
│   ├── query/
│   │   ├── DependentsQuery.ts
│   │   ├── DependenciesQuery.ts
│   │   ├── PathBetweenQuery.ts
│   │   ├── SubgraphQuery.ts
│   │   ├── WouldBreakQuery.ts
│   │   └── AffectedByQuery.ts
│   ├── validation/
│   │   ├── PreMutationValidator.ts    // hooks into BaseEntity.Save validation
│   │   └── BlastRadiusReport.ts       // structured output for warnings
│   └── mcp/
│       └── MetadataGraphMcpTools.ts   // MCP tool definitions
├── package.json
├── tsconfig.json
└── README.md
```

### 5.2 Component diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                       MJAPI / MJExplorer process                   │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     MetadataGraph singleton                  │  │
│  │                                                              │  │
│  │   ┌──────────────┐    ┌──────────────────────┐               │  │
│  │   │  Hydrators   │───▶│      GraphStore      │◀──────┐       │  │
│  │   │ (initial)    │    │  (in-memory adj idx) │       │       │  │
│  │   └──────────────┘    └──────────────────────┘       │       │  │
│  │           ▲                       ▲                  │       │  │
│  │           │                       │                  │       │  │
│  │   ┌───────────────┐      ┌────────────────┐  ┌───────────┐   │  │
│  │   │ BaseEntity    │      │   Parsers      │  │  Query    │   │  │
│  │   │ Subscriber    │─────▶│ (template,     │  │  API      │   │  │
│  │   │ (incremental) │      │  action, sql)  │  │           │   │  │
│  │   └───────────────┘      └────────────────┘  └───────────┘   │  │
│  │           ▲                                          ▲       │  │
│  │           │                                          │       │  │
│  └───────────┼──────────────────────────────────────────┼───────┘  │
│              │                                          │          │
│   BaseEntity Save/Delete events                         │          │
│              │                              ┌───────────┴──────┐   │
│              │                              │  MCP server      │   │
│              │                              │  (601-mcp-oauth) │   │
│              │                              └──────────────────┘   │
│              │                                          ▲          │
│              │                              ┌───────────┴──────┐   │
│              │                              │  Validation hook │   │
│              │                              │  (pre-Save)      │   │
│              │                              └──────────────────┘   │
└──────────────┼─────────────────────────────────────────────────────┘
               │
       ┌───────┴────────┐
       │ MJ Metadata DB │
       │ (SQL Server /  │
       │   PostgreSQL)  │
       └────────────────┘
```

### 5.3 Lifecycle

1. **Cold start** — `MetadataGraph.Instance` first access triggers hydration. All hydrators run in parallel (each loads one entity kind via `RunView` and produces nodes/edges). Total cold-start cost is bounded by metadata cardinality (typically thousands of nodes; ~50–500ms).
2. **Steady state** — `BaseEntitySubscriber` listens to Save/Delete on the metadata-defining entities. On change, the router calls the correct hydrator's `applyChange(change)` method which incrementally updates the store.
3. **Query** — callers (UI, MCP, validation hooks) call typed query methods on the singleton. All queries are pure reads against the in-memory store.

### 5.4 Pattern: extends `BaseSingleton<T>`

Per the MJ singleton rule (CLAUDE.md §7), the orchestrator extends `BaseSingleton<MetadataGraph>` so the global object store guarantees one instance even under bundler duplication.

```typescript
import { BaseSingleton } from '@memberjunction/global';

export class MetadataGraph extends BaseSingleton<MetadataGraph> {
    protected constructor() {
        super();
    }

    public static get Instance(): MetadataGraph {
        return MetadataGraph.getInstance<MetadataGraph>();
    }

    public async Hydrate(contextUser: UserInfo): Promise<void> { /* ... */ }
    public Dependents(nodeKey: string, opts?: TraversalOptions): GraphNode[] { /* ... */ }
    // ...
}
```

---

## 6. Storage Strategy

### 6.1 V1 — In-memory adjacency

The `GraphStore` is an in-process structure with these indexes:

```typescript
class GraphStore {
    private nodes: Map<string, GraphNode>;                    // nodeKey → node
    private edgesById: Map<string, GraphEdge>;                // edgeKey → edge
    private outEdges: Map<string, Map<EdgeKind, Set<string>>>;// nodeKey → kind → edgeKeys (out)
    private inEdges:  Map<string, Map<EdgeKind, Set<string>>>;// nodeKey → kind → edgeKeys (in)
    private nodesByKind: Map<NodeKind, Set<string>>;          // kind → nodeKeys
    private nodesByEntity: Map<string, Set<string>>;          // backing entity name → nodeKeys
}
```

Why this shape:
- `O(1)` lookup of node by key.
- `O(degree)` traversal of a node's neighbors filtered by edge kind.
- `O(|nodesOfKind|)` enumeration of all nodes of a kind (for hydration redo).
- Memory overhead: a 5,000-node, 25,000-edge graph fits in <10MB easily.

### 6.2 V1.5 — Optional Memgraph / Neo4j projection

For very large tenants or cross-instance queries, add a `GraphStoreInterface` implementation that mirrors writes to Memgraph (preferred — it's what Doss uses, has open-source license, MCP-friendly) or Neo4j. This is opt-in via config:

```typescript
// mj.config.cjs
module.exports = {
    metadataGraph: {
        backend: 'memory',                         // or 'memgraph' | 'neo4j'
        memgraph: {
            host: 'localhost',
            port: 7687,
            user: 'memgraph',
            password: process.env.MEMGRAPH_PASSWORD,
        },
    },
};
```

**Decision criteria for adding the persistent backend:**
- Tenants with >50,000 metadata nodes (rare but possible at large enterprises).
- Multi-instance MJ deployments needing a shared graph view.
- Use cases that require long-running graph algorithms (PageRank-style importance, community detection) — out of scope for V1.

### 6.3 V2 — SQL Server / PostgreSQL native graph

SQL Server has native `NODE`/`EDGE` table support; PostgreSQL has Apache AGE. A future option is to project the graph into native graph tables in the same DB as MJ metadata, avoiding a second datastore. This is *V2* — not for the initial release.

### 6.4 Eviction & rebuild

The graph is *fully derivable* from metadata. If it becomes inconsistent (incremental update bug, partial failure during a bulk import), the API exposes:

```typescript
public async Rehydrate(contextUser: UserInfo): Promise<void>;
```

…which clears and rebuilds. Rehydration is also triggered on `MJEvent` of type `MetadataChanged` if such an event fires (e.g., post-CodeGen run, post-bulk-import).

---

## 7. Query API

### 7.1 Core methods

```typescript
class MetadataGraph extends BaseSingleton<MetadataGraph> {
    // Node lookups
    public GetNode(nodeKey: string): GraphNode | undefined;
    public GetNodesByKind(kind: NodeKind): GraphNode[];
    public GetNodeForEntity(entityName: string, primaryKey: CompositeKey): GraphNode | undefined;

    // Traversals
    public Dependents(
        nodeKey: string,
        opts?: TraversalOptions
    ): TraversalResult;

    public Dependencies(
        nodeKey: string,
        opts?: TraversalOptions
    ): TraversalResult;

    public PathBetween(
        fromKey: string,
        toKey: string,
        opts?: PathOptions
    ): GraphPath[];

    public Subgraph(
        seedKey: string,
        opts?: SubgraphOptions
    ): GraphSubgraph;

    // Validation / mutation analysis
    public WouldBreak(
        proposedChange: ProposedChange
    ): BlastRadiusReport;

    public AffectedBy(
        change: AppliedChange
    ): GraphNode[];

    // Search
    public Find(
        predicate: NodePredicate
    ): GraphNode[];
}
```

### 7.2 Type definitions (sketch)

```typescript
type TraversalOptions = {
    edgeKinds?: EdgeKind[];          // restrict to specific edge kinds
    nodeKinds?: NodeKind[];          // restrict to specific node kinds
    maxDepth?: number;               // default 5
    direction?: 'out' | 'in' | 'both';
    includeEdges?: boolean;          // include the edges in the result
};

type TraversalResult = {
    nodes: GraphNode[];
    edges?: GraphEdge[];
    paths?: GraphPath[];             // when includeEdges=true, populated paths
    truncated: boolean;              // true if maxDepth cut traversal short
};

type ProposedChange =
    | { kind: 'delete'; nodeKey: string }
    | { kind: 'rename-field'; nodeKey: string; oldName: string; newName: string }
    | { kind: 'change-type'; nodeKey: string; oldType: string; newType: string }
    | { kind: 'remove-relationship'; relationshipKey: string }
    | { kind: 'remove-action-from-agent'; agentKey: string; actionKey: string };

type BlastRadiusReport = {
    proposedChange: ProposedChange;
    affected: Array<{
        node: GraphNode;
        path: GraphPath;            // how this node connects to the change
        severity: 'breaking' | 'inferred-breaking' | 'cosmetic';
        reason: string;             // human-readable explanation
    }>;
    summary: {
        totalAffected: number;
        breakingCount: number;
        inferredCount: number;
    };
};
```

### 7.3 Example queries

```typescript
const graph = MetadataGraph.Instance;

// "What depends on the Donor entity's Email field?"
const deps = graph.Dependents('EntityField:Donors:Email', {
    direction: 'in',
    maxDepth: 4,
});

// "What would break if I delete the SendDonorReceipt action?"
const report = graph.WouldBreak({
    kind: 'delete',
    nodeKey: 'Action:SendDonorReceipt',
});
// → 3 agents lose this tool, 1 scheduled action stops triggering, 2 prompts reference it

// "What's the full tool surface available to the DonorOnboarding agent?"
const toolset = graph.Dependencies('AIAgent:DonorOnboarding', {
    edgeKinds: ['HAS_TOOL', 'DELEGATES_TO', 'USES_PROMPT'],
    maxDepth: 3,
});

// "How are the DonorEngagement dashboard and the Donations entity connected?"
const paths = graph.PathBetween(
    'Dashboard:DonorEngagement',
    'Entity:Donations',
);
```

### 7.4 Performance characteristics

| Query | Expected time (10K-node graph) |
|---|---|
| `GetNode` | <1µs |
| `GetNodesByKind` | <10µs |
| `Dependents`/`Dependencies` (depth 5) | 1–10ms |
| `PathBetween` | 1–50ms (BFS) |
| `Subgraph` (seed + depth 3) | 1–10ms |
| `WouldBreak` | 1–20ms (single seed, traverses dependents) |
| `Rehydrate` (full reload) | 50–500ms |

---

## 8. MCP Integration

The single highest-leverage move. The in-flight `601-mcp-oauth` MCP server exposes MJ to external LLM clients. We add a set of MCP tools backed by the metadata graph.

### 8.1 Tool surface

| MCP Tool | Backed by | Purpose |
|---|---|---|
| `metadata_graph.list_nodes_by_kind` | `GetNodesByKind` | "What entities exist? What agents exist?" |
| `metadata_graph.describe_node` | `GetNode` + 1-hop neighbors | "Tell me about the Donors entity." |
| `metadata_graph.dependents` | `Dependents` | "What depends on this?" |
| `metadata_graph.dependencies` | `Dependencies` | "What does this depend on?" |
| `metadata_graph.path_between` | `PathBetween` | "How are these two things connected?" |
| `metadata_graph.would_break` | `WouldBreak` | "If I delete/rename this, what breaks?" |
| `metadata_graph.find_agent_toolset` | `Dependencies` + filter | "What can this agent actually do?" |
| `metadata_graph.find_field_lineage` | `Dependents` + filter | "Where does this dashboard number come from?" |
| `metadata_graph.suggest_agent_tools` | Pattern-matching over graph | "Build me an agent for X — what tools should it have?" |

### 8.2 Tool definition example

```typescript
// In packages/MCPServer/src/tools/MetadataGraphTools.ts
export const wouldBreakTool: McpTool = {
    name: 'metadata_graph.would_break',
    description:
        'Analyze the blast radius of a proposed metadata change. Use this BEFORE ' +
        'deleting an entity, action, prompt, agent, or field, or before renaming ' +
        'a field. Returns the structured list of things that depend on the target ' +
        'and would break or be affected.',
    inputSchema: z.object({
        change: z.discriminatedUnion('kind', [
            z.object({ kind: z.literal('delete'),         nodeKey: z.string() }),
            z.object({ kind: z.literal('rename-field'),   nodeKey: z.string(),
                       oldName: z.string(), newName: z.string() }),
            z.object({ kind: z.literal('change-type'),    nodeKey: z.string(),
                       oldType: z.string(), newType: z.string() }),
        ]),
    }),
    handler: async ({ change }) => {
        const graph = MetadataGraph.Instance;
        const report = graph.WouldBreak(change);
        return {
            content: [{
                type: 'text',
                text: JSON.stringify(report, null, 2),
            }],
        };
    },
};
```

### 8.3 Agent prompt patterns enabled

Authoring agents can be prompted with patterns like:

> *"Before you propose a destructive change to MJ metadata, call `metadata_graph.would_break` with the proposed change. If `breakingCount > 0`, present the affected items to the user and ask for confirmation."*

> *"When the user asks you to build a new agent for a domain, first call `metadata_graph.list_nodes_by_kind` for `Action`, `AIPrompt`, and `Entity` filtered to the domain (use `Find` with a name-pattern predicate). Propose the agent configuration referencing real graph nodes only — do not invent action or prompt names."*

These two patterns alone close the largest classes of agent-authoring failure modes (hallucinated references, surprise breakage).

---

## 9. Validation & Mutation Hooks

### 9.1 Pre-Save validation

`PreMutationValidator` registers a `BaseEntity` event subscriber that fires before Save/Delete on metadata-defining entities. It computes a `BlastRadiusReport` and:

- **For destructive changes with `breakingCount > 0`:** If the entity is being saved with a `bypassMetadataGraphValidation: true` context flag, allow. Otherwise, attach the report to `LatestResult.Errors` and return `false` from Save (per CLAUDE.md, Save returns boolean, doesn't throw).
- **For non-destructive changes (rename, type-narrow):** Always allow but emit a `MJEvent` of type `MetadataGraphWarning` with the report — UI can display a non-blocking warning.

This is opt-in per environment via config, so existing automated workflows aren't disrupted on day one:

```typescript
// mj.config.cjs
module.exports = {
    metadataGraph: {
        enforceValidation: 'warn',   // 'off' | 'warn' | 'block'
    },
};
```

### 9.2 Severity classification

| Severity | Trigger | Default behavior |
|---|---|---|
| `breaking` | Edge with `confidence: 'declared'` (FK, structural ref) would dangle | Block in `block` mode; warn in `warn` mode |
| `inferred-breaking` | Edge with `confidence: 'inferred'` (parsed from template/code) would dangle | Warn in both modes |
| `cosmetic` | Display-only change (description, icon) with downstream caches that need invalidation | Info-level; never blocks |

### 9.3 Bypass for legitimate cascade operations

Some operations *intend* to cascade — e.g., uninstalling a Solution. The validator accepts a `cascadeContext` that pre-declares which dependents are knowingly being removed in the same transaction.

---

## 10. Visualization

### 10.1 `MetadataGraphDashboard`

A new dashboard component extending `BaseDashboard` (per `guides/DASHBOARD_BEST_PRACTICES.md`) renders the graph using **Cytoscape.js** (good fit: open-source, interactive, handles 10K+ nodes with proper layouts, integrates with Angular standalone components).

Features:
- **Seed node selection** — pick any metadata object as the focus.
- **Depth slider** — expand 1–5 hops in either direction.
- **Edge-kind filter** — toggle which edge kinds are visible.
- **Node-kind filter** — show only entities + actions, hide agents, etc.
- **Search** — fuzzy-match node names, jump-to-focus.
- **Diff mode** — load two snapshots (e.g., before/after a Solution import) and highlight added/removed nodes/edges.

### 10.2 In-context affordances

Beyond the dedicated dashboard, every entity form gets a "Where used" panel via the `mj-record-form-container` extension surface. The panel calls `metadata_graph.dependents` for the current record and renders an expandable tree.

This satisfies the §2.13 affordance bar — every metadata page shows References / Referenced by.

### 10.3 Lineage view for end-users

For the Layer-B end-user audience: a *Dashboard Tile Provenance* view, opened from any tile, that walks `Dashboard → View → Query → Entity → Field` and renders it as a left-to-right flow. The same view doubles as agent-explainability for AI-generated dashboards.

---

## 11. Performance Considerations

### 11.1 Hydration cost

For a typical MJ instance:

| Component | Rows | Hydration cost |
|---|---|---|
| Entities | 200–2,000 | <50ms |
| EntityFields | 5,000–50,000 | 100–300ms |
| EntityRelationships | 500–5,000 | <100ms |
| Actions | 50–500 | <50ms |
| AIAgents/Prompts/Templates | 50–500 each | <50ms each |
| Templates parsed for refs | 50–500 | 200–500ms (regex parsing) |

Total cold-start: **300ms–1.5s** for medium instances; can be deferred to first query rather than blocking startup.

### 11.2 Memory footprint

A `GraphNode` is ~200 bytes; a `GraphEdge` is ~150 bytes. A 10K/40K graph is ~8MB — negligible vs. typical Node process working set.

### 11.3 Incremental update cost

Each metadata Save triggers re-hydration of the affected node and re-parsing of any content fields (template body, action code) on that node. Bounded to <50ms per change.

### 11.4 Query cost

All queries are pure in-memory traversals. Worst-case bounded by `O(nodes + edges)`. Real-world queries with depth limits are sub-millisecond.

### 11.5 Multi-tenant considerations

For multi-tenant MJ deployments, each tenant gets its own `MetadataGraph` instance keyed by tenant identifier. The singleton becomes a `Map<tenantId, MetadataGraph>` accessor — pattern already established for tenant-scoped caches.

---

## 12. Phased Roadmap

### Phase 0 — Foundation (1 week)

**Goal:** Package skeleton, types, store, no hydrators yet.

- [ ] Create `packages/MetadataGraph/` with `package.json`, `tsconfig.json`, vitest config (per `npm run scaffold-tests`).
- [ ] Define `NodeKind`, `EdgeKind` union types, `GraphNode`, `GraphEdge` interfaces.
- [ ] Implement `GraphStore` with the four indexes from §6.1.
- [ ] Implement `MetadataGraph extends BaseSingleton` shell with `Hydrate`/`Rehydrate` stubs.
- [ ] Unit tests for `GraphStore` (add/remove/lookup/traverse).

**Exit criteria:** Empty graph instantiable, store passes unit tests, package builds.

### Phase 1 — Core hydrators (2 weeks)

**Goal:** Graph populated from metadata-declared (not parsed) edges.

- [ ] `EntityHydrator` (Entity, EntityField, EntityRelationship, ApplicationEntity nodes/edges).
- [ ] `PermissionHydrator` (Role, EntityPermission edges).
- [ ] `ActionHydrator` (Action, ActionParam, ActionResultCode — structural only, no code parsing).
- [ ] `AgentHydrator` (AIAgent, AIAgentPrompt, AIAgentAction, DELEGATES_TO from ParentID).
- [ ] `PromptHydrator` (AIPrompt, AIPromptModel, AIModel, AIVendor).
- [ ] `TemplateHydrator` (Template, TemplateContent, TemplateParam — structural).
- [ ] `QueryHydrator` (Query, QueryField, QueryParameter — structural).
- [ ] `ViewHydrator` (UserView — structural).
- [ ] `DashboardHydrator`, `ReportHydrator` (with declared `DISPLAYS`/`SOURCES_FROM` edges where metadata exists).
- [ ] `ScheduledActionHydrator`.
- [ ] Parallelize all hydrators using `RunViews` (plural — per CLAUDE.md performance guidance).
- [ ] Integration test: hydrate against the workbench DB, assert node/edge counts match expected metadata.

**Exit criteria:** `MetadataGraph.Instance.Hydrate()` produces a graph with all declared edges from a real MJ install.

### Phase 2 — Query API (1 week)

**Goal:** Typed traversal API ready for callers.

- [ ] `Dependents`, `Dependencies` with depth/edge-kind/node-kind filters.
- [ ] `PathBetween` (BFS shortest-path).
- [ ] `Subgraph`.
- [ ] `Find` with predicate.
- [ ] `WouldBreak` for `delete`, `rename-field`, `change-type`, `remove-relationship`, `remove-action-from-agent`.
- [ ] `AffectedBy` (post-mutation analysis).
- [ ] Comprehensive unit tests with synthetic graphs.

**Exit criteria:** All query methods documented and tested; sample queries from §7.3 pass.

### Phase 3 — Incremental updates (1 week)

**Goal:** Graph stays current without full rehydrate.

- [ ] `BaseEntitySubscriber` listens to Save/Delete on metadata entities.
- [ ] `MetadataChangeRouter` dispatches per-entity to the right hydrator's `applyChange`.
- [ ] Each hydrator implements `applyChange(record, op)` that adds/updates/removes the relevant node and its outbound edges.
- [ ] Integration test: mutate metadata via `BaseEntity.Save()`, assert graph reflects the change.

**Exit criteria:** Graph remains consistent across 100+ rapid metadata mutations.

### Phase 4 — Content parsers (2 weeks)

**Goal:** Inferred edges from parsing template/action/query content.

- [ ] `TemplateRefParser` — scan template bodies for `{{Entity.Field}}` and emit `REFERENCES_FIELD` edges.
- [ ] `ActionCodeParser` — scan action code for `RunView`/`GetEntityObject`/`Save`/`Delete` calls and emit `READS`/`WRITES` edges.
- [ ] `QuerySqlParser` — parse SELECT/FROM/WHERE in stored query SQL and emit `READS_ENTITY`/`READS_FIELD` edges.
- [ ] Confidence flagging on parsed edges.
- [ ] Re-parse on Save of the parent entity.
- [ ] Unit tests for each parser with realistic samples.

**Exit criteria:** Parsed edges flow through to `Dependents`/`Dependencies` queries; visualization shows declared vs. inferred clearly.

### Phase 5 — MCP integration (1 week)

**Goal:** Graph queries available to LLM clients.

- [ ] Register MCP tools listed in §8.1 in the MJ MCP server (`601-mcp-oauth` branch).
- [ ] OAuth scope for `metadata_graph.*` tools.
- [ ] Smoke test: Claude Desktop or other MCP client invokes each tool.
- [ ] Document agent prompt patterns from §8.3 in the agent-authoring guide.

**Exit criteria:** End-to-end demo: an LLM client queries the graph and produces a blast-radius report.

### Phase 6 — Validation hooks (1 week)

**Goal:** Pre-mutation safety net.

- [ ] `PreMutationValidator` subscribed to metadata entity Save/Delete events.
- [ ] Config-driven enforcement modes (`off` / `warn` / `block`).
- [ ] Bypass via `cascadeContext` on legitimate cascade operations.
- [ ] Integration test: try to delete an entity that has dependents in `block` mode, assert Save returns false with proper `LatestResult.CompleteMessage`.

**Exit criteria:** Destructive metadata change against the workbench is correctly blocked or warned per config.

### Phase 7 — Visualization (2 weeks)

**Goal:** End-user-facing UI surfaces.

- [ ] `MetadataGraphDashboard` extending `BaseDashboard`, registered for lazy-loading per `guides/LAZY_LOADING_GUIDE.md`.
- [ ] Cytoscape.js integration as a standalone Angular component.
- [ ] "Where used" panel as a `mj-record-form-container` extension.
- [ ] Dashboard tile provenance view.
- [ ] Design tokens only — no hardcoded colors (CLAUDE.md §"Design Token System").

**Exit criteria:** User can click any record, see what depends on it, and navigate the graph visually.

### Phase 8 — Hardening & docs (1 week)

- [ ] Performance test on 50K-node graph.
- [ ] Memory leak test (1000 mutations + rehydrate cycles).
- [ ] Public API documentation (TSDoc).
- [ ] `guides/METADATA_GRAPH_GUIDE.md` covering queries, MCP usage, UI affordances, validation modes.
- [ ] Update root `CLAUDE.md` with a section pointing to the guide.

**Exit criteria:** v1 ready to merge to `next`.

### Phase 9 (later) — Optional graph-DB backend

- [ ] `GraphStoreInterface` abstraction.
- [ ] Memgraph implementation behind a feature flag.
- [ ] Cross-instance graph queries.

### Total estimated effort

**~11 weeks** for Phases 0–8 with one engineer; **~6–7 weeks** with two engineers parallelizing hydrators and parsers. Phase 9 deferred indefinitely until a real customer needs it.

---

## 13. Risks & Open Questions

### 13.1 Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Inferred edges (parsed content) produce false positives that overwhelm UI | Medium | Always tag confidence; let UI default-hide inferred edges; revisit parsers per language |
| Incremental updates drift from full rehydrate over time | Medium | Daily background full rehydrate; counter-based consistency checks |
| Tenant scaling — graph size grows beyond in-memory bounds | Low | Phase 9 backend; until then, monitor and alert on node count |
| Performance regression on metadata Save (validator + parser) | Medium | All parsing/validation async where possible; opt-in enforcement |
| Subscriber memory leak across hot reloads (dev only) | Medium | Singleton pattern + explicit `Dispose()` for hot reloads |
| Cycles in the agent delegation tree mis-interpreted as bugs | Low | DELEGATES_TO is allowed to be cyclic; document and handle in PathBetween |
| Visualization scaling past 5K visible nodes | Medium | Default-collapse + on-demand expansion; never render full graph at once |

### 13.2 Open questions

1. **Should `READS`/`WRITES` from action code be a metadata field on Action that the author declares**, with parser-inferred edges as a *fallback*? This shifts the burden onto action authors but eliminates parser fragility. Probably yes, with parsers as the back-stop.
2. **Do we expose the graph over GraphQL** (alongside MCP) for client-side use? MJExplorer's "Where used" panel could either go through MJAPI's GraphQL or call `MetadataGraph.Instance` directly if running in-process. Likely both.
3. **Per-record (instance) edges?** The graph as designed is metadata-only (entity types, not entity rows). Should it optionally extend to record-level lineage for specific high-value entities (e.g., AIAgentRun → AIAgentRunStep → AIPromptRun)? Probably a *separate* execution graph, not bolted onto this one.
4. **Snapshotting** — do we persist graph snapshots for diff/audit, or always recompute? Lean: persist on demand (e.g., before a Solution import) rather than continuously.
5. **Confidence tuning** — how aggressive should parsers be? Conservative parsers miss edges; aggressive parsers false-positive. Need a real-world tuning pass after Phase 4.
6. **Public API stability** — once external customers depend on the singleton's API, we lose flexibility. Mark v1 as preview; lock at v1.1.

---

## 14. Initial Task List

The first PR (Phase 0) should land:

1. `packages/MetadataGraph/package.json` with deps on `@memberjunction/core`, `@memberjunction/global`, `@memberjunction/core-entities`.
2. `packages/MetadataGraph/tsconfig.json`, `vitest.config.ts`, `src/index.ts` skeleton.
3. `src/types/NodeKind.ts`, `EdgeKind.ts`, `GraphNode.ts`, `GraphEdge.ts`.
4. `src/store/GraphStore.ts` with the four indexes; full unit-test coverage.
5. `src/MetadataGraph.ts` extending `BaseSingleton`, with no-op `Hydrate`.
6. Add to `npm run mj:manifest` regeneration list (server-bootstrap supplemental manifest).
7. README.md describing the package's role and roadmap.

That PR is small, low-risk, and unblocks parallelization on hydrators in Phase 1.

---

## Appendix A — Naming Glossary

- **Layer A / Layer B** — engineer-authored platform vs. user-authored apps/agents on top.
- **Node kind** — typed category of graph node (Entity, Action, AIAgent, etc.).
- **Edge kind** — typed relationship between nodes (HAS_TOOL, READS, RENDERS, etc.).
- **Declared edge** — derived directly from a metadata FK or structural relationship.
- **Inferred edge** — derived by parsing content (templates, action code, query SQL).
- **Blast radius** — the set of nodes affected by a proposed change to one node.
- **Hydrator** — class that loads metadata for one entity kind into nodes/edges.
- **Rehydrate** — full rebuild of the graph from metadata (vs. incremental update).

## Appendix B — Comparison Cheat-Sheet

| Concern | MJ today | MJ + Metadata Graph | Foundry | Doss | Salesforce |
|---|---|---|---|---|---|
| Typed compile-time safety | ✅ | ✅ | ❌ | ❌ | ❌ |
| Runtime dependency graph | ❌ | ✅ | ✅ | ✅ | partial |
| Pre-mutation blast radius | ❌ | ✅ | ✅ | ✅ | partial |
| MCP-native AI surface | partial | ✅ | (proprietary) | ✅ | ❌ |
| Open source / self-host | ✅ | ✅ | ❌ | ❌ | ❌ |
| Visualization | ❌ | ✅ | ✅ | ✅ | partial |
| Graph spans data + actions + agents + prompts + perms | ❌ | ✅ | ✅ | partial | ❌ |

This is the lane.
