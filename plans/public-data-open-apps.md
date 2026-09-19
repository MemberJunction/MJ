# MemberJunction — Public Data Open Apps
### An installable app family that auto-ingests public datasets into the customer's own MJ instance

**Status:** Design record / RFC v1 — no implementation yet
**Audience:** MJ engineering + BizApps engineering
**Date:** 2026-09-19
**Related reading:** [`packages/Integration/docs/architecture.md`](../packages/Integration/docs/architecture.md) · [`connector-development.md`](../packages/Integration/docs/connector-development.md) · [`sync-lifecycle.md`](../packages/Integration/docs/sync-lifecycle.md) · [`plans/predictive-studio.md`](./predictive-studio.md) · [`plans/predictive-studio-openapps-and-core-models-spec.md`](./predictive-studio-openapps-and-core-models-spec.md) · [`packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md`](../packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md)

---

## 0. How to read this document

This is a **design record**, not an implementation spec — it fixes the architecture and the boundaries so that
individual feed apps can be built independently without each one re-litigating the same decisions.
Following the house convention, **decisions** are marked **[D]** and **open questions** **[O]**.

Claims about existing platform capability in §3 were verified against this repository at the date above; each
carries its path. §9 is the platform work this exposes and is the only part that asks for core changes.

**TL;DR** — Public datasets are a large, under-exploited source of value that MJ is unusually well positioned
to capture, because almost all of the ingestion substrate already exists. The proposed shape is a family of
**installable Open Apps**: we hand-model the domain entities, ship a connector plus a schedule, dashboards, and
a Predictive Studio training pipeline; the customer installs the app into their own MJ instance, sets a cron,
and gets value against *their own* records. Multi-tenant SaaS and MCP are later, additive plays — not
alternatives.

---

## 1. The thesis: compelled disclosure is a leading indicator

The interesting property of public data is not that it is free. It is that **the law forces organisations to
describe publicly things they would rather keep private, well before the consequences arrive.** Patents are the
familiar example — to obtain protection you must disclose the invention, typically publishing ~18 months after
priority and years before a product ships. But patents are one instance of a category:

| Compelled disclosure | Forced by | Reveals, before the world knows | Lead time |
|---|---|---|---|
| **WARN Act notices** | federal/state labour law | layoffs and plant closures — *required in advance by statute* | **60–90 days** |
| **FCC equipment authorisations** | FCC Part 15/22 | unannounced hardware | weeks–months |
| **SEC Form D** | Reg D | private financing rounds, before any announcement | weeks |
| SEC 8-K / S-1 / 13D / Form 4 | securities law | M&A, IPOs, insider conviction | days–weeks |
| **Unified Agenda + OIRA/OMB review** | APA / EO 12866 | rules that will reshape an industry, while still draft | 6 months–3 years |
| **Trademark intent-to-use filings** | Lanham Act | product *names* and brand launches | months |
| **H-1B LCA / PERM disclosure files** | INA / DOL | what a firm is building, where, at what salary | months |
| Clinical trial registration | FDAAA / ICMJE | drug and device pipelines | years |
| Air/water permits, EPA new-source review | Clean Air/Water Acts | new plants, capacity expansion | months–years |
| Building permits, EIS, zoning | local law | construction and facility moves | months–years |
| Lobbying disclosures (LD-1/LD-2), FARA | LDA | which policies are being fought over *now* | quarterly |
| Grant awards (NIH/NSF/SBIR) | — | research output, then the companies that follow | 2–5 years |
| Standards contributions (3GPP, IETF, W3C) | consortium rules | what ships in devices in 3–5 years | years |
| Preprints (arXiv/bioRxiv) | norms, not law | papers, then products | 6–18 months |
| Patents | the patent bargain | products | 18 months to publish, then years |

**[D] This reframes the product from *enrichment* to *early warning*.** Enrichment fills fields on records the
customer already has; it is a feature. Early warning tells them something before anyone else knows it; it is a
reason to renew. Both matter, but the second is where the differentiation lives — and for association and
nonprofit customers it is literally the job description: an association exists to tell its members what is
coming.

### 1.1 The limits of the thesis, stated up front

Filing propensity is uneven and the lag cuts both ways. Frontier software and AI work is increasingly protected
by **trade secrecy and defensive publication** rather than patents, so patent volume measures how much a firm
*patents*, not how much it *invents*. Continuations and provisionals mean effective priority can precede
publication by years. Consequently patents are a strong leading indicator in hardware, pharma, materials and
semiconductors, and a weak, biased one in software services.

**[D] Choose the disclosure regime that actually binds the customer's industry** rather than assuming one feed
generalises: patents/permits/FDA for manufacturing and medtech; regulatory pipeline, licensure and WARN for
services and the professions; preprints, grants and publications for scholarly societies.

---

## 2. Why installable-first, and not SaaS or MCP first

There are three plausible distribution models. They are not alternatives; they are a strict sequence in which
each stage subsumes the previous one.

1. **Installable Open App** — the data lands in the customer's own MJ instance, joined to their records.
2. **Multi-tenant SaaS** — the same app, in an instance we host.
3. **MCP** — exposing the ingested data to any agent.

**[D] Build (1) first.** The reasoning is about where value accrues, not about efficiency:

- If normalised public data is valuable *outside* MJ, we have built a data business and will compete with
  incumbent data vendors on their own ground, at their cost structure.
- If it is valuable *inside* MJ — joined to the member table, driving their dashboards, training on their
  labels — we have built a reason to adopt MJ. Every install deepens the platform's gravity.

A central cache would be cheaper per row and is the wrong optimisation: **the per-tenant ingest redundancy is
the price of the flywheel**, and it is a low price, because these are nightly and monthly archive pulls, not
real-time streams.

Two structural limits of an MCP-only strategy are worth recording, because they are exactly our advantages:

- **An MCP server cannot join to the customer's own records.** It has no knowledge of who their members are.
- **An MCP server cannot run a standing watchlist.** It answers a question someone thought to ask. An ingested
  feed on a `MJ: Scheduled Jobs` row tells them something they did not think to ask — which, given §1, is where
  most of the value is.

Deferring (2) and (3) forecloses nothing. MJ already ships an MCP dashboard, so an ingested feed can be exposed
over MCP later without rework, and multi-tenant SaaS is "we host the instance."

### 2.1 Licensing follows from install-first

Because the data lands in the customer's instance pulled with the customer's own credentials, **the customer is
the licensee and we redistribute nothing.** This is a material advantage over reselling a vendor feed, and it
produces a selection criterion (§10.1).

---

## 3. What the platform already provides

Verified against this repository. **The great majority of the ingestion substrate exists**; a public data app is
mostly configuration plus one connector.

| Capability | Where | Notes |
|---|---|---|
| Recurring execution | `packages/Scheduling/{base-types,base-engine,engine,actions}` | `MJ: Scheduled Jobs` / `Scheduled Job Runs` / `Scheduled Job Types`; cron + timezone, distributed locking with lease heartbeat, missed-run policy, notifications |
| Scheduler drivers | `packages/Scheduling/engine/src/drivers/` | 9 shipped, including `IntegrationSyncScheduledJobDriver` and `IntegrationDiscoveryScheduledJobDriver` |
| Connector contract | `packages/Integration/engine/src/BaseIntegrationConnector.ts` | Exactly four abstract members: `TestConnection`, `DiscoverObjects`, `DiscoverFields`, `FetchChanges(ctx: FetchContext)` |
| REST connector base | `packages/Integration/engine/src/BaseRESTIntegrationConnector.ts` | |
| Deltas and watermarks | `WatermarkService.ts`; `MJ: Company Integration Sync Watermarks` | Keyset positions, partition rollups, restore-on-gap |
| Politeness and resilience | `RateLimiter.ts`, `RetryAfter.ts`, `RetryRunner.ts`, `AdaptiveConcurrency.ts` | |
| Change detection | `HashDiff.ts`, `ContentHash.ts` | |
| Field mapping | `FieldMappingEngine.ts`; `MJ: Company Integration Entity Maps` / `Field Maps` | Engine generic, mapping rows are app data |
| External→MJ identity | `MJ: Company Integration Record Maps`; `ExternalSystemRecordID` | |
| Discovered schema catalogue | `MJ: Integration Objects` / `Integration Object Fields` | |
| Auto-generated agent tools | `IntegrationActionGenerator.ts`, `ActionMetadataGenerator.ts` | Generates Actions per discovered object |
| Run audit | `MJ: Company Integration Runs` / `Run Details` / `Run API Logs` | |
| Record matching / dedupe | `packages/AI/Vectors/Dupe`; `MatchEngine.ts`; `MJ: Duplicate Runs` / `Run Details` / `Run Detail Matches` | Vector ANN → fusion → rerank → optional gated auto-merge |
| Embeddings + search | `packages/AI/Vectors/Sync` (`EntityVectorSyncer`), `packages/SearchEngine` | One `MJ: Entity Documents` row makes an entity searchable with no code; `MJ: Search Scopes` exposes it to agents |
| Document/feed ingestion | `packages/ContentAutotagging/src/` (`RSSFeed`, `Websites`, `CloudStorage`, `LocalFileSystem`, `Entity`), `packages/AI/Knowledge/Pipeline` | ingest → extract → autotag → vectorize |
| Predictive modelling | `packages/AI/PredictiveStudio/{Core,Engine,Sidecar}` | `MJ: ML Training Pipelines` / `ML Models` / `ML Training Runs` / `ML Algorithms` / `ML Model Scoring Bindings`; feature assembly with point-in-time (`as-of`) and leakage deny-lists |
| Operator UI | `packages/Angular/Explorer/dashboards/src/{Integration,Scheduling,PredictiveStudio,KnowledgeHub}` | **"Install the app, set the schedule" needs no UI work from the app** |
| Declarative seeding | `metadata/` — incl. `scheduled-jobs/`, `scheduled-job-types/`, `integration-source-types/`, `entity-documents/`, `search-scopes/`, `queries/`, `dashboards/`, `agents/`, `ai-skills/`, `components/` | MetadataSync directories exist for nearly every artifact an app needs |
| Change-driven refresh | `packages/ExternalChangeDetection` | Alternative to cron where a source supports it |

**[O] Gap: no production REST connector has shipped.** `grep` for `@RegisterClass(BaseIntegrationConnector, …)`
finds mocks, test connectors and codegen templates; Salesforce exists as docs plus mock data; real
database-shaped sources are served by `packages/ExternalDataSources/Providers/`. A public data app is therefore
the **first** real-world exercise of this contract, and should expect to find rough edges.

---

## 4. Architecture: where the framework/app boundary falls

**[D] The framework owns what is true of the *protocol* regardless of what the data means. The app owns what is
true of the *domain* regardless of how the data arrived.**

| Concern | Owner |
|---|---|
| Transport, pagination, auth, rate limits, retry, watermark advance, content hashing | **Framework** |
| Protocol adapters — REST, **bulk archive**, SDMX, Socrata/CKAN/ArcGIS discovery, OAI-PMH | **Framework** |
| Field-mapping mechanics | **Framework** (mapping rows are app data) |
| Canonical domain entities; source→canonical transform | **App** |
| Identity-resolution rules (EIN/LEI/NPI thresholds, name normalisation) | **App**, using framework `MatchEngine` / `Duplicate Runs` |
| Dashboards, Queries, Entity Documents, Search Scopes, agents, skills, ML pipelines | **App** |

**The test:** *would a second, unrelated dataset on the same protocol need this same code?* Socrata pagination —
yes, framework. "Patent assignee names need Inc./LLC normalisation" — no, app.

### 4.1 Protocol leverage

Most public data arrives over a small number of standardised interfaces, and `DiscoverObjects` /
`DiscoverFields` map onto their metadata endpoints almost directly. One framework adapter per protocol yields
schema discovery, incremental sync and generated Actions for every publisher that speaks it:

| Protocol | Unlocks | `DiscoverObjects` / `DiscoverFields` maps to |
|---|---|---|
| Socrata (SODA) | most US state and city portals | dataset list / column metadata |
| CKAN | data.gov, EU and national portals | `package_search` / `datastore_search` |
| ArcGIS Hub / REST | geospatial portals | service list / layer metadata |
| SDMX (ISO 17369) | World Bank, IMF, OECD, Eurostat, ECB, UN, BIS | dataflows / DSDs and codelists (typed) |
| OAI-PMH | repositories, archives, journals | sets / metadata formats; resumption tokens give free watermarking |
| Bulk archive | IRS, CMS, GLEIF, SEC, USPTO, OIG | manifest / file schema — **see §9.1** |

**[D] Discovery must not auto-create tables.** RSU (`packages/SchemaEngine`) is real but operationally heavy —
it writes a migration file, runs CodeGen and restarts MJAPI, behind `ALLOW_RUNTIME_SCHEMA_UPDATE=1` — and
`IntegrationDiscoveryScheduledJobDriver` deliberately never invokes it. Follow that precedent: **discover
broadly, catalogue cheaply into `MJ: Integration Objects`, and let an operator promote chosen datasets to
modelled entities.** Auto-minting a table per discovered dataset would also collide with the additive-only
schema policy (§5.2).

---

## 5. Entity design: model the domain, not the source

**[D] Canonical domain entities, hand-modelled by us, with a raw payload sidecar and explicit vintage.** Not a
mirror of one source's columns. Three reasons, in increasing order of cost-to-fix-later:

1. **Valuable domains have several sources.** Patents = USPTO + EPO + WIPO + PatentsView. Nonprofits = 990
   e-file + BMF + Pub 78 + state charity registries. A source-shaped entity means three apps where one would
   do; a domain-shaped entity means one app with three adapters.
2. **Additive-only schema.** Per [`PUBLISH_NO_BREAK_POLICY.md`](../packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md),
   once published a schema is additive-only until an era bump. Public schemas revise annually — 990 XML schema
   versions, NAICS/SOC revisions, survey redesigns — so a source-shaped column set marries us to this year's
   upstream shape for the life of an era.
3. **The predictive layer needs stable feature names.** If features are source columns, every upstream revision
   silently invalidates trained models.

### 5.1 The raw payload sidecar

Each app carries a `…SourceRecord` table holding the raw upstream JSON keyed by source, source record id and
vintage. One table, three benefits: re-derive the canonical rows without re-fetching; add canonical columns
later without a backfill fetch; and keep the provenance trail that makes "traceable to a real source" true
rather than aspirational.

### 5.2 `KnownAt` is not `PeriodEnd` — the one expensive mistake

**[D] Every canonical row records both the period it describes and the date it became publicly knowable, and
feature assembly keys on the latter.**

A Form 990 describing FY2023 does not become public until late 2024 or 2025. If the feature layer keys on the
period the data *describes* rather than the date it *became knowable*, every model trained on public data leaks
the future — and will validate beautifully while being worthless in production. Public data is unusually
exposed to this because of publication lag, and the exposure is systematic rather than random.

`PredictiveStudio`'s feature assembly already enforces point-in-time `as-of` semantics and leakage deny-lists,
so the machinery will do the right thing — but only if given the right column. This is the single most expensive
thing in this document to retrofit, because it cannot be reconstructed after the fact from data already
ingested.

**[O]** Confirm how `AsOfStrategy` should be bound to an app-owned `KnownAt` column, and whether feature
assembly needs any addition to express "as known at date X" over a vintaged source. Owner: Predictive Studio.

---

## 6. Placement in the dependency graph

Public data apps **enrich** master data, so they sit downstream of `bizapps-common` and are bound by the Golden
Architectural Rules in
[`predictive-studio-openapps-and-core-models-spec.md`](./predictive-studio-openapps-and-core-models-spec.md) §1:

- A public data app may read `Common` (`Person`, `Organization`, `Address`) freely.
- **`Common` must never know a public data app exists.** No FKs point down; no `Common` model may reference a
  public feed's tables.
- Resolution links live in the **public data app's** schema — a link table from its canonical rows to
  `Common.Organization` / `Person`, never a column added to `Common`.

**[D] Each app is independently installable and independently useful.** Apps may not depend on each other; a
customer running only the 990 app must get full value from it.

---

## 7. The predictive layer: what the app seeds, what the tenant trains

This is the most differentiated part of the strategy, because it cannot be reproduced outside MJ. It requires
the feature store, the public data and the customer's own records in one database.

**[D] The app seeds the recipe; the tenant's install produces the trained result.** Public features are
identical for every tenant, but the *label* — who lapsed, who renewed, who upgraded — is tenant-specific. So:

> The app ships public-data features and a validated training pipeline. The customer supplies the labels. The
> model trains on install.

Follow the seeding pattern already established in
[`predictive-studio-openapps-and-core-models-spec.md`](./predictive-studio-openapps-and-core-models-spec.md) §4
— a Skyway migration with deterministic hardcoded UUIDs seeding `MLTrainingPipeline` (DAG, source bindings,
feature steps, target variable, leakage guard, validation strategy), `MLModel` and `MLModelVersion` — with two
public-data-specific obligations:

1. Every feature derived from a public source must be expressed against `KnownAt`, never the described period
   (§5.2).
2. The leakage deny-list must include any upstream field that is only populated *after* the outcome — which for
   public data includes fields backfilled in a later vintage of the same record.

**[O]** There is no `metadata/ml-training-pipelines/` MetadataSync directory, so a pipeline is seeded by
migration rather than by `mj sync push`. That matches the referenced spec and needs no change; recorded here
because it is the opposite of how most other app artifacts are seeded and will surprise implementers.

---

## 8. What a Public Data Open App ships

| Artifact | Form |
|---|---|
| Canonical domain entities + `SourceRecord` sidecar | migrations (+ appended CodeGen output) |
| One connector per source | `BaseIntegrationConnector` subclass, `@RegisterClass` |
| Source + sync configuration | seed rows: `MJ: Integration Source Types`, `Integrations`, `Company Integrations`, entity/field maps |
| The schedule | seed `MJ: Scheduled Jobs` row on `IntegrationSyncScheduledJobDriver`; operator edits cadence in the Scheduling dashboard |
| Identity resolution to `Common` | app-owned link table + `MatchEngine` / `Duplicate Runs` configuration |
| Searchable + agent-reachable | `MJ: Entity Documents`, `Search Scopes`, `Queries`, `AI Agent Data Sources` |
| Product surface | dashboards, Angular components, agents/skills |
| Predictive | `MLTrainingPipeline` + `MLModel` + `MLModelVersion` seeds (§7) |
| Credential onboarding | `postInstallModule` hook prompting for the customer's own API key |
| Uninstall | teardown SQL removing every seeded row |

---

## 9. Platform work this exposes

### 9.1 `BaseBulkFileIntegrationConnector` — the first PR **[D]**

`BaseRESTIntegrationConnector` is the wrong parent for the highest-value public sources, because they ship as
**periodic archives rather than paged APIs**: IRS 990 monthly XML archives, NPPES full-replacement-monthly plus
weekly-incremental files, GLEIF golden copy plus deltas, SEC `submissions.zip` / `companyfacts.zip`, USPTO
PatentsView bulk, OIG LEIE monthly. Writing per-app archive handling would duplicate the same fetch/stream/
watermark logic in every feed app.

Proposed: a framework base that fetches an archive, streams its members without materialising the whole file,
emits records through the existing `FetchChanges` → `FetchBatchResult` contract, and watermarks on **file
vintage** plus within-file position so an interrupted run resumes. It should support full-replacement and
incremental-delta file conventions as first-class modes, since most publishers offer both.

This is small, unblocks most of §10, and belongs in `packages/Integration` rather than in any app.

### 9.2 Protocol adapters **[D]**
Socrata, CKAN, ArcGIS and SDMX adapters in the framework, per §4.1. Sequence after 9.1 and after one hand-built
app has proven the contract end to end.

### 9.3 Source licence and redistribution as modelled fields **[O]**
The Integration model records runs, mappings and watermarks but has no concept of the *licence* attached to a
source. Public does not mean redistributable, and the distinction decides what an app may legally ship or cache.
Proposal: a licence/redistribution-permitted attribute on the source definition, surfaced in the Integration
dashboard.

### 9.4 The per-tenant grain of `Company Integration` **[O]**
`MJ: Company Integrations` exists to bind a *tenant's* credentialed system. A public source is
tenant-independent and often credential-free, so the company dimension is vestigial. Decide whether public data
apps carry a conventional synthetic company integration or whether the framework should express a
credential-free public source directly. Either is workable; it should be decided once, centrally, rather than
per app.

### 9.5 Vintage-aware feature assembly **[O]**
See §5.2 — confirm `as-of` can be bound to an app-owned `KnownAt` column.

---

## 10. Source catalogue

### 10.1 Selection rubric

Score each candidate on: **joinability** (is there a clean key to customer records?) · **cardinality match**
(does it describe entities they actually have rows for?) · **refresh cadence vs decision cadence** · **volume**
(does it fit, or does it need slicing?) · **licence** · **identifier stability** · **does an LLM add
disproportionate value** (unstructured→structured: filing narratives, bill text, comment letters, grant
abstracts) · **who has budget for the answer**.

Joinability is the gate. The keys that make public data valuable inside MJ: **EIN, NPI, LEI, CIK, UEI, ORCID,
ROR, DOI, SOC/NAICS, licence number, address/geo**.

**[D] Add a criterion that follows from install-first: prefer sources where the customer can self-provision a
free key in minutes.** Per-tenant install makes the customer the licensee (§2.1), which is excellent for
licensing and bad for onboarding when a key must be negotiated. This promotes IRS, Federal Register /
Regulations.gov, USPTO PatentsView, OpenAlex/Crossref, NPPES, GLEIF, SEC EDGAR and BLS; and demotes paid or
negotiated feeds to "the app supports it, the customer brings their own contract."

### 10.2 Candidates

Grouped by the job they do. Not a commitment — a ranked backlog.

**Highest fit for the association / nonprofit base**

| Source | Key | App | Representative value |
|---|---|---|---|
| IRS 990 / 990-PF / BMF / Pub 78 | EIN | Peer benchmarking and prospect intelligence | Compensation benchmarking from Part VII (a product associations already sell); revenue decline and leadership change as churn signals; 990-PF Schedule I as a funder graph |
| Federal Register, Regulations.gov, govinfo, Congress.gov, state legislatures | agency, docket, topic | Regulatory and legislative radar | Watch for rules touching the customer's taxonomy; draft comment letters grounded in their own position library; diff final vs proposed vs their submitted comment |
| Professional licensure boards, NPPES/NPI | licence no., NPI | Credential verification and lapse watch | Verify a member's licence without asking; non-member licensees in a state as a prospect universe |
| BLS (OEWS/JOLTS/CES), O\*NET, IPEDS, College Scorecard | SOC, MSA | Workforce and career intelligence | Salary benchmarking by occupation × metro; degrees conferred as future member supply |
| Grants.gov, NIH RePORTER, NSF Awards, USAspending | UEI, EIN, PI | Funding matchmaker | Match opportunities to a capability statement; congratulate members on awards |
| Crossref, OpenAlex, PubMed, ORCID, ROR | DOI, ORCID, ROR | Society publishing and author intelligence | Non-member authors in the field as recruitment targets; reviewer finding; **patent citations to the society's journal as an industrial-impact metric** |

**Broadly commercial, and the enablers**

| Source | Key | Value |
|---|---|---|
| GLEIF LEI, SEC EDGAR, SAM.gov UEI, state registries | LEI/CIK/UEI/EIN | Company identity spine — unglamorous, multiplies every other app; corporate-family rollups; M&A detection |
| Census ACS/CBP/BDS, BEA, TIGER | FIPS, NAICS | Penetration analysis: members per 10k establishments by NAICS × county |
| OSM/Overture, GTFS, NOAA/FEMA, FCC | geo | Event siting; **disaster cone ∩ member addresses → automatic outreach** |
| CMS Open Payments, OIG LEIE, SAM exclusions | NPI, name | Two compliance apps with recurring obligations behind them: cross-checking self-reported CME disclosures, and exclusion screening (expected on hire and monthly) |
| USPTO PatentsView, TSDR | assignee | Innovation radar; sponsorship targeting ranked by R&D activity |
| openFDA, ClinicalTrials.gov | NDC, NCT | Recall alerting; investigator finding |
| OSHA/MSHA, EPA ECHO, NHTSA, FMCSA | facility, DOT no. | Safety benchmarking as a member service |
| World Bank / IMF / OECD / Eurostat / UN | country, indicator | One SDMX adapter, very wide coverage |
| WARN notices, DOL LCA/PERM | employer | Layoff and hiring early warning (§1) |
| GDELT, RSS, Wikidata | entity | Signal feed; Wikidata as a free identifier bridge across EIN / LEI / ROR |

---

## 11. Risks

- **Identity resolution is the majority of the work and is never finished.** It needs stored confidence, a
  human-review surface, and no silent auto-merge. The failure that matters is a wrong match surfaced to a real
  person as fact — a bad EIN match telling a member their revenue fell 40% is worse than shipping no feature.
- **Volume.** Several candidate corpora are far too large to ingest wholesale. Slice to the customer's
  relevance set; cache on demand.
- **Vintage drift against additive-only schema.** §5 exists to contain this; getting it wrong is era-scoped.
- **Freshness misrepresentation.** A two-year-old filing rendered without a date reads as current. Vintage must
  be visible in the UI, not merely present in the schema.
- **Public is not the same as appropriate.** Licensure discipline, political contributions and payment
  disclosures are all public. Joining them into a single per-person dossier is technically straightforward and
  the most likely thing to make a member feel surveilled. **[O] This needs a stated policy before it is a
  capability.**
- **Scraping.** Prefer official bulk or API access. Where the only route is scraping a portal, that is a
  business-terms decision, not an engineering one.
- **Per-tenant key management.** Onboarding friction scales with how hard the key is to get (§10.1).

---

## 12. Sequencing

1. **`BaseBulkFileIntegrationConnector`** in `packages/Integration` (§9.1) — small, unblocks most candidates.
2. **First feed app: IRS 990.** Widest appeal in the installed base, one clean join key, public domain, no API
   key, and it carries the marquee training pipeline (member-organisation lapse risk from 990 trajectories).
   Chosen for time-to-obvious-value, not data volume — the goal is adoption.
3. **Regulatory and legislative radar.** Highest differentiation. A v0 needs no connector at all: Content
   Sources already ingests RSS and websites through `KnowledgePipeline`, so a Search Scope plus agent data
   sources is a metadata-only first cut.
4. **Company identity spine** (GLEIF + EDGAR) — also rides 9.1, and multiplies everything after it.
5. **Protocol adapters** (§9.2) once the contract has been proven by a real app.

---

## 13. Open questions

- **[O]** `as-of` binding to an app-owned `KnownAt` column (§5.2 / §9.5). Owner: Predictive Studio.
- **[O]** Licence/redistribution modelling on a source (§9.3). Owner: Integration.
- **[O]** Public, credential-free sources and the `Company Integration` grain (§9.4). Owner: Integration.
- **[O]** Policy on cross-source dossier construction about identifiable individuals (§11).
- **[O]** Whether the first feed app lives in its own repository (consistent with the BizApps family) or is
  incubated in this one. Recommendation: its own repository, once 9.1 has landed here.
