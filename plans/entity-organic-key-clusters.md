# Entity Organic Key Clusters — Design Proposal & Empirical Study

## Overview

This document proposes a follow-on to the **Entity Organic Keys** feature shipped in [PR #2193](https://github.com/MemberJunction/MJ/pull/2193). The shipped feature provides a metadata-driven mechanism for hand-authoring cross-entity value-matching relationships. This proposal explores two natural next questions:

1. **Can DBAutoDoc detect organic keys automatically** by clustering columns whose semantic descriptions point to the same underlying business concept (email, customer ID, product ID, etc.)?
2. **What runtime representation best serves the detected output** — the pairwise hub-and-spoke shape we already have, or an additional cluster-style representation that complements it?

A working POC was run against AdventureWorks2022 (486 columns, 71 tables) to empirically validate the detection pipeline described below. The pipeline produced 16 confirmed organic key clusters, 7 mixed clusters that were correctly partitioned, and 53 noise rejections, in ~95 seconds at zero cost on Gemini's free tier. POC source and the full dry-run report are available separately on request; the key findings are summarized inline in the [Empirical Results](#empirical-results) section.

This proposal is positioned as an **additive Phase 2** to the shipped work — it makes no changes to the existing schema, requires no migration, and frames the cluster-representation question as a design discussion rather than a decided direction.

---

## Background: What Shipped in PR #2193

The shipped feature introduced two metadata tables:

- **`EntityOrganicKey`** — defines an organic key on a single owning entity (match field(s), normalization strategy, etc.)
- **`EntityOrganicKeyRelatedEntity`** — for each owning entity's key, lists the related entities (with direct or transitive match config) that should appear on its form

This is a **hub-and-spoke per entity** structure: each entity owns its keys, and related entities hang off as spokes. It cleanly supports:

- Compound keys (`MatchFieldNames` as comma-list)
- Transitive joins through bridge views (`TransitiveObjectName`)
- Per-relation display config (display name, location, sequence, component)
- Asymmetric direction when needed (one entity's key may reference another without the reverse being configured)

The model is flexible by design and serves the full breadth of organic key shapes. This proposal does not modify it.

---

## Motivation for Detection

The shipped feature is metadata-driven: a developer or admin authors organic key definitions by hand or via mj-sync metadata files. This works perfectly for known integration shapes (e.g., "we know Mailchimp recipients link to our Contacts by email").

However, in practice many organic key opportunities are latent in the data:

- Across integration boundaries, multiple systems often expose the same business attribute (email, phone, domain, customer reference) under different column names.
- In legacy or merged schemas, columns that semantically refer to the same thing live in different tables without FK enforcement.
- Discovering these by inspection scales poorly — even AdventureWorks has 486 columns; production schemas routinely have thousands.

DBAutoDoc already analyzes schemas and produces LLM-authored column descriptions. Those descriptions encode the semantic signal we need. The question is whether we can use that signal to **propose** organic keys to humans for review.

This proposal addresses that. It does not propose auto-applying detected keys — every detected cluster surfaces in a dry-run report for human review before any metadata is written.

---

## Detection Pipeline (POC)

The POC pipeline is intentionally simple and inspectable. Each stage is a separate script with cached intermediate output.

### Stage 1 — Column metadata extraction

Input: DBAutoDoc's `extended-props.sql` file (column descriptions for every column in the target schema).
Output: structured JSON tuples of `{schema, table, column, description}`.

### Stage 2 — Semantic embedding

Each column gets embedded into a 1536-dimensional vector via Gemini's `embedding-001` model with `taskType: SEMANTIC_SIMILARITY`. Input format:

```
Column <Schema>.<Table>.<Column>. <Description>
```

The schema/table prefix is intentional — it gives the model context to distinguish `Customer.Email` from `Vendor.Email` semantically rather than treating them as interchangeable strings.

For 486 columns, batched embedding completes in ~5 seconds at 100 columns/batch. Costs at production scale (5,000 columns) are estimated at well under $1.

### Stage 3 — Agglomerative clustering with complete-linkage

The algorithm:

1. Normalize embedding vectors to unit length (cosine distance = `1 - dot(a, b)`)
2. Build a sparse candidate edge set: for each column, retain top-K nearest neighbors above a similarity floor (top-20 above similarity 0.88 in the POC)
3. Sort candidate edges by distance ascending; greedily merge clusters via union-find
4. A merge is permitted only if the **maximum pairwise distance** between any member of the two clusters being merged stays ≤ the threshold (complete-linkage rule)
5. Post-filter: retain clusters with ≥2 members spanning ≥2 distinct tables

**Why complete-linkage over single-linkage:** single-linkage permits chaining (any one matching column pulls two clusters together), which collapses semantically distinct groups when bridged by an outlier. Complete-linkage enforces the equivalence-class semantics we actually want — any pair drawn from a cluster should be a sensible match.

**Why agglomerative over divisive:** practical agglomerative is O(N² log N); optimal divisive is intractable (O(2ᴺ) partition space). With sparse candidate edges, agglomerative drops further toward O(E α(N)) where E is the candidate edge count.

**Why not LLM-as-clusterer:** the partition space is the Bell number B(N). For N=486 that's astronomical; the LLM never enters that space. The LLM operates only on bounded inputs — per-column for embeddings, per-cluster for refinement.

### Stage 4 — LLM refinement per cluster

For each candidate cluster, a single Gemini `gemini-3-flash-preview` call (temperature 0.1, JSON response mode) is asked to:

- Identify whether the cluster represents one coherent business concept
- Name the concept (snake_case)
- Pick a normalization strategy (`LowerCaseTrim` / `Trim` / `ExactMatch` / `Custom`)
- Eject members that don't belong
- Split mixed clusters into coherent sub-clusters
- Score confidence and provide reasoning
- Decide if the result is a *useful* organic key (vs. a coherent but un-useful concept like `ModifiedDate`)

LLM concurrency in the POC is 4; total refinement time was 93 seconds for 76 clusters. At production scale this is the dominant cost — but still measured in single-digit dollars even for thousand-column schemas.

### Stage 5 — Dry-run report

The pipeline emits a human-reviewable markdown report grouping clusters into **KEEP** / **SPLIT** / **REJECT** with the LLM's reasoning for each. Nothing is written to the database.

---

## Empirical Results

Highlights from the dry-run report:

### What the pipeline correctly identified

| Cluster (concept) | Members | Notes |
|---|---|---|
| `business_entity_id` | 4 cols across Person, Vendor, Password, Store | Cross-entity identity that flows through multiple sub-types |
| `territory_id` | 4 cols across SalesPerson, SalesTerritoryHistory, SalesTerritory, Customer | LLM correctly ejected `BusinessEntityID` as an outlier |
| `location_id` | 3 cols across Location, ProductInventory, WorkOrderRouting | Manufacturing/storage location reference |
| `transaction_id` | 2 cols across `TransactionHistory` + `TransactionHistoryArchive` | Live + archived history pattern |
| `country_region_code` | 2 cols across CountryRegion + SalesTerritory | ISO 3166-1 alpha-2 codes |
| `culture_id` | 2 cols across Culture + ProductModelProductDescriptionCulture | ISO locale identifiers |

### What the pipeline correctly rejected

| Rejected cluster | Members | LLM reasoning (paraphrased) |
|---|---|---|
| `cluster_0` (audit_modification_timestamp) | 60× `ModifiedDate` | Same concept across all tables, but matching records by audit timestamps is not a useful navigation primitive |
| `cluster_7` (replication_guid) | 24× `rowguid` | System-generated GUIDs for replication, not business identifiers |
| `cluster_66` (sales_primary_identifiers) | 5 distinct PKs (CreditCardID, CustomerID, SalesOrderID, …) | Distinct identifier spaces grouped only by naming similarity |
| `cluster_29` (product_entity_identifiers) | ProductID + ProductCategoryID + ProductModelID + ScrapReasonID + … | Share a naming pattern but reference distinct entities |
| `cluster_72` (sales_revenue_metrics) | SalesYTD + SalesLastYear across SalesPerson + SalesTerritory | Aggregate financial measures, not identifiers |

### What the pipeline correctly split

A representative example — `cluster_11` (4 columns) was partitioned into three sub-clusters:

- `state_province_id` (KEEP) — `Person.Address.StateProvinceID` + `Sales.SalesTaxRate.StateProvinceID`
- `country_region_code` (KEEP) — `Person.StateProvince.CountryRegionCode`
- `sales_territory_id` (KEEP) — `Person.StateProvince.TerritoryID`

The LLM identified that the original cluster conflated three distinct levels of a geographic hierarchy and partitioned them into coherent groups.

### Aggregate outcome distribution

```
KEEP   ████████████                                                 16 (21%)
SPLIT      █████                                                     7 (9%)
REJECT          ████████████████████████████████████████████████    53 (70%)
```

The 70% rejection rate is the headline empirical finding: **embedding-based clustering surfaces real candidates but produces substantial noise that requires LLM filtering to be useful**. The pipeline as designed handles this correctly; both halves (clustering + refinement) are necessary.

---

## What the POC Does NOT Demonstrate

Honesty about scope is important. The POC validates the core detection algorithm but leaves several known gaps for the full implementation:

| Gap | Why it matters | Phase 1 fix |
|---|---|---|
| **FK exclusion** | Several POC KEEPs (e.g., `business_entity_id`) are already declared FKs. Real implementation should filter columns participating in declared/detected FK relationships, since FK metadata is the canonical mechanism. | Filter using DBAutoDoc's FK detector output + `additionalSchemaInfo.json` PK/FK records prior to clustering. |
| **Concept-merge pass** | Three separate clusters were named `product_id` because complete-linkage prevented merging at clustering time. A final concept-name-keyed merge would consolidate them. | Single LLM call per concept-name pair to confirm equivalence; merge survivors. |
| **Value-overlap verification (MinHash)** | The pipeline uses only embedding distance. Two columns can sound similar but draw from non-overlapping value spaces. | Add MinHash signatures during DBAutoDoc's existing column sampling pass; verify Jaccard overlap per cluster. Essentially free to add. |
| **Compound key detection** | Tuple keys (e.g., `FirstName + LastName + DOB`) require correlated multi-column analysis — different algorithm. | Deferred to a later phase. |
| **Type/cardinality prefilter** | Hard prefilters would reduce noise further. | Standard pre-clustering filter; cheap to add. |
| **Dirty-database robustness** | POC ran against AdventureWorks (clean naming). Behavior on schemas with inconsistent/cryptic columns is plausible-but-untested — semantic descriptions should normalize over surface inconsistency, but this needs empirical confirmation. | Run the pipeline against a sample of dirty real-world schemas. |
| **Multi-model embedding benchmark** | Only Gemini `embedding-001` tested. Distance compression is highly model-dependent. | Benchmark against alternatives (OpenAI, Voyage, local embeddings) before committing the production embedding choice. |

None of these are conceptual blockers; they are scoped follow-ups.

---

## Runtime Representation: A Design Discussion

The detection work above produces clusters as a natural output shape — a cluster is "N columns sharing one business concept." The shipped schema persists this as a hub-and-spoke pattern (one `EntityOrganicKey` per owning entity, plus `EntityOrganicKeyRelatedEntity` spokes).

This raises a design question worth discussing openly: **does the runtime model benefit from a cluster-style representation alongside the hub-and-spoke schema?**

This is a discussion, not a recommendation. Three options:

### Option A — No runtime change

DBAutoDoc emits detected clusters as a set of `EntityOrganicKey` + `EntityOrganicKeyRelatedEntity` rows using the existing schema. The cluster shape lives only in the detection pipeline.

**Pros:** zero schema impact. No new entities. Backward compatible with everything.
**Cons:** for N columns sharing one concept, the detection pipeline expands to N hub-and-spoke rows plus N × (N-1) related-entity rows. For symmetric value-space matching (the common case), this is O(N²) rows expressing what is conceptually one fact.

### Option B — Add cluster as a derived/cached runtime view

Keep the schema unchanged. At engine boot, derive cluster groupings from existing `EntityOrganicKey` rows via union-find over shared normalization. UI consumers (e.g., form generation) query the derived map for "what cluster does this entity belong to?" but the persistence layer is unchanged.

**Pros:** zero schema change, zero migration. Cluster shape becomes available as a query convenience.
**Cons:** the cluster shape is reconstructed at boot rather than expressed in metadata. Normalization invariants (e.g., "every member of a cluster shares the same normalization strategy") aren't enforced by schema, only by detection logic.

### Option C — Add a parallel cluster table

Add `EntityOrganicKeyCluster` + `EntityOrganicKeyClusterMember` tables alongside the existing schema. Cluster carries concept name + normalization (cluster invariants). Members reference their entity + field. Coexists with `EntityOrganicKey` / `EntityOrganicKeyRelatedEntity` — compound keys, transitive bridge-view joins, and per-relation display config continue to live on the existing tables.

**Pros:** cluster as a first-class concept. Normalization is structurally a cluster invariant. Detection emits clusters directly without expansion. Form generation queries clusters for the symmetric multi-entity case.
**Cons:** adds two metadata tables. Two ways to express the same information (a hand-authored hub-and-spoke vs. a cluster) — needs clear guidance on which to use when. Migration path needed for existing organic keys (or just leave them in their current shape and document the dual model).

### Recommendation framing

Each option is defensible. Option A is the simplest and lowest-risk. Option B is a small ergonomic win at zero schema cost. Option C is the most expressive but adds metadata surface area.

This proposal advocates for **starting with Option A or B for Phase 1 and revisiting Option C only after detection ships and we have real usage data**. The detection work itself is the larger value delivery; the representation question can be deferred.

---

## Phased Plan

### Phase 1: Detection pipeline in DBAutoDoc (no runtime changes)

Goal: ship the detection pipeline as a new DBAutoDoc command/option that emits proposed organic keys in dry-run form for human review.

Scope:
- New `discovery/OrganicKeyClusterDetector.ts` — agglomerative complete-linkage over column embeddings with hard type/cardinality prefilter
- New `discovery/LLMClusterRefiner.ts` — per-cluster reasoning pass (name, normalize, eject, split, score)
- FK exclusion filter — drop columns already in declared/detected FK relationships before clustering
- Concept-merge pass — consolidate same-concept clusters at the end
- MinHash value-overlap verification — added to the existing `ColumnStatsCache` profiling pass
- New `dbautodoc detect-organic-keys` (or flag on the existing run) emitting a markdown dry-run report
- Output writes nothing to the DB; humans approve via mj-sync metadata files using the existing organic key schema

Deliverable: the dry-run report format shown in this proposal, generated against any DBAutoDoc-analyzed schema.

### Phase 2: UI for dry-run review and approval

Goal: surface the dry-run report inside MJExplorer so humans can review and selectively approve detected clusters without hand-writing metadata files.

Scope:
- Resource component listing detected clusters with their evidence (members, normalization, LLM reasoning, confidence)
- Approve / reject / edit per cluster
- On approval, write the corresponding `EntityOrganicKey` + `EntityOrganicKeyRelatedEntity` metadata records using the existing schema

### Phase 3 (deferred — discussion topic): runtime cluster representation

Revisit Options A/B/C above after Phases 1 and 2 ship and we have data on:
- How often detected clusters span ≥3 entities (the case where O(N²) hub-and-spoke rows are most costly)
- Whether form generation patterns benefit from explicit cluster grouping in metadata
- Whether normalization-drift bugs occur in the wild (a real concern if clusters live only in pairwise rows)

### Phase 4 (deferred): compound key detection

Tuple keys (e.g., `FirstName + LastName + DOB`) require correlated multi-column analysis. The detection algorithm and metadata representation already exist (the shipped `MatchFieldNames` is comma-delimited); only the detection algorithm needs to be added. Scope appropriately when ready.

---

## Implementation Considerations

### Embedding model choice

Gemini `embedding-001` was used in the POC because the existing benchmark suite already has Gemini credentials configured. Production should benchmark across:

- **OpenAI `text-embedding-3-small`** — strong general semantic embeddings, well-known performance
- **Voyage `voyage-3`** — purpose-built for retrieval-style use cases
- **Local embeddings** (via `@memberjunction/ai-vectors-local` or similar) — eliminates the PII concern for value-sample contexts

The pipeline is embedding-model-agnostic; the choice is a configuration parameter.

### PII considerations

The POC sends column **descriptions** (LLM-generated by DBAutoDoc itself) to the embedding model, not raw column values. This is low-PII risk — the descriptions are schema metadata, not customer data. The Phase 1 MinHash verification step samples actual values from the database, but MinHash signatures are one-way hashes that do not leak underlying values to any external service.

If the cluster refinement step (Stage 4) is configured to escalate low-confidence cases by including value samples, those samples should be routed only to local or self-hosted models, not cloud LLMs.

### Cost projections

| Schema scale | Embedding cost | LLM refinement cost | Total |
|---|---|---|---|
| 500 columns (POC) | ~$0 (Gemini free tier) | ~$0 (Gemini free tier) | ~$0 |
| 5,000 columns | ~$0.10–0.50 (depending on model) | ~$1–3 (Haiku or Flash class) | ~$1–4 |
| 50,000 columns | ~$1–5 | ~$10–30 | ~$11–35 |

Detection is a periodic batch operation, not an interactive call. Even the high end is single-digit dollars per analysis run.

---

## Open Questions

1. **Embedding provider for production.** Gemini works for the POC. Should the production default be Gemini, OpenAI, Voyage, or a local model? Probably worth a small benchmark across the same AdventureWorks input to compare cluster quality.

2. **Should detection produce `AutoCreateRelatedViewOnForm = true` keys by default**, or always require manual approval? The shipped schema already has the flag; this is a question of default policy.

3. **Should the LLM refiner be allowed to mark detected clusters as "useful concept but not for organic keys"** (the `ModifiedDate` case), and if so, should those be surfaced anywhere in the UI (as documentation candidates, perhaps)?

4. **Compound key detection roadmap.** Worth scoping a follow-on plan now even if the implementation is deferred, so the metadata + detection algorithms can be designed coherently.

5. **The Option A/B/C runtime question.** Deferred per Phase 3, but worth flagging explicitly so the discussion happens with evidence rather than ahead of it.

---

## References

- [PR #2193 — `feat: Entity Organic Keys — cross-system relationship matching`](https://github.com/MemberJunction/MJ/pull/2193) — the shipped foundation this proposal builds on
- [`plans/complete/entity-organic-keys.md`](complete/entity-organic-keys.md) — original design and implementation plan
- [`packages/MJCore/docs/organic-keys.md`](../packages/MJCore/docs/organic-keys.md) — runtime usage documentation
- [DBAutoDoc package](../packages/DBAutoDoc/) — the package that will host the detection pipeline
