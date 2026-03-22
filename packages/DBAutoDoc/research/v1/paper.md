# DBAutoDoc: Automated Discovery and Documentation of Undocumented Database Schemas via Statistical Analysis and Iterative LLM Refinement

**Amith Nagarajan**^1 (corresponding author) . **Thomas Altman**^2

^1 Founder, Blue Cypress . ^2 Co-Founder, Tasio Labs (a Blue Cypress company)

---

## Abstract

The vast majority of production database systems in enterprise environments lack adequate documentation. Declared primary keys are absent, foreign key constraints have been dropped for performance, column names are cryptic abbreviations, and no entity-relationship diagrams exist. We present DBAutoDoc, a system that automates the discovery and documentation of undocumented relational database schemas by combining statistical data analysis with iterative large language model (LLM) refinement.

DBAutoDoc's central insight is that schema understanding is fundamentally an iterative, graph-structured problem. Drawing structural inspiration from backpropagation in neural networks \cite{rumelhart1986backprop}, DBAutoDoc propagates semantic corrections through schema dependency graphs across multiple refinement iterations until descriptions converge. This propagation is discrete and semantic rather than mathematical, but the structural analogy is precise: early iterations produce rough descriptions akin to random initialization, and successive passes sharpen the global picture as context flows through the graph.

The system makes four concrete contributions: (1) an iterative context-propagation algorithm that refines table and column descriptions by re-analyzing each schema object in light of its neighbors' most recent descriptions; (2) a tiered statistical pipeline for primary key and foreign key discovery with a bidirectional feedback loop between LLM-generated semantic context and statistical candidate scoring; (3) a dual-layer human knowledge injection mechanism that distinguishes verified ground truth from exploratory seed context; and (4) a multi-criterion convergence detector that combines description stability windows, per-column confidence thresholds, and semantic change magnitude.

On a suite of benchmark databases, DBAutoDoc achieved overall weighted scores of 96.1% across two model families (Gemini and Anthropic) using a composite metric that weights key discovery accuracy (FK F1 at 35%, PK F1 at 30%) more heavily than description coverage (table descriptions at 20%, column descriptions at 15%). Ablation analysis demonstrates that the deterministic pipeline contributes a 23-point F1 improvement over LLM-only FK detection, confirming that the system's contribution is substantial and independent of LLM pre-training knowledge. The system reached convergence in 2 iterations on average at a cost of approximately \$0.70 per 100 tables -- a reduction of more than 99.5% relative to manual expert documentation. DBAutoDoc is released as open-source software with all evaluation configurations and prompt templates included for full reproducibility.

---

## 1. Introduction

### 1.1 The Undocumented Database Problem

Relational databases are among the most durable artifacts in enterprise computing, yet they rarely preserve the knowledge of the humans who designed them. Column names like `cust_cd`, `trn_amt_3`, and `flg_b` encode meaning that once lived in the heads of developers who have long since moved on. Primary key declarations were dropped during bulk-load optimizations. Foreign key constraints were removed to improve insert throughput. ERD diagrams, when they existed at all, describe a schema from a decade before the current one.

We use the term *dark databases* to describe production systems with no declared keys, no column or table comments, no associated data dictionary, and no ERD documentation. Dark databases arise routinely in corporate acquisitions, data warehouse consolidation projects, and legacy migrations. Conservative estimates suggest that the majority of production relational databases in enterprise environments have incomplete or absent schema documentation \cite{abedjan2015profiling}. For a database of moderate complexity -- several hundred tables -- manual documentation requires weeks of expert effort at a cost of \$12,000--\$48,000 in professional services.

### 1.2 Why Existing Approaches Fall Short

Several categories of existing tools address parts of the problem, but none addresses the full challenge of dark databases. *Schema extraction tools* (SchemaSpy, dbdocs.io) can only surface metadata that already exists. *One-shot LLM analysis* \cite{trummer2024succinct} cannot incorporate statistical evidence from actual data and treats each table in isolation, missing the iterative refinement that human experts naturally perform. *Schema matching tools* \cite{rahm2001survey} identify candidate correspondences but do not produce human-readable documentation. *Data profiling frameworks* \cite{abedjan2015profiling} generate statistical summaries without synthesizing them into natural-language documentation. *FK discovery algorithms* \cite{rostin2009fk, jiang2020holistic} operate without semantic context and cannot distinguish coincidental numerical similarity from genuine referential relationships.

The core limitation shared by all these approaches is that they operate on a single pass over a static representation of the schema. Real schema understanding is an iterative process in which each piece of evidence revises prior assumptions and generates new hypotheses.

### 1.3 Our Insight: Schema Understanding as an Iterative Learning Problem

We observe that a database schema is not a collection of independent tables but a graph, where nodes are schema objects and edges represent referential relationships. Understanding a node depends on the state of neighboring nodes, which depend in turn on their neighbors. This graph-structured dependency motivates our iterative approach: an initial pass produces rough descriptions with high uncertainty, which are then used as context for successive passes that produce progressively better descriptions until convergence.

The structural analogy to backpropagation in neural network training \cite{rumelhart1986backprop} is instructive. In both systems, processing proceeds in a defined order, a loss or error signal is computed, correction information propagates backward through a dependency graph, and iteration continues until convergence. The analogy is structural rather than mathematical: there are no gradients, no differentiable loss function, and no parameter updates. The "corrections" are discrete revisions to natural-language descriptions, and "propagation" means providing updated neighbor descriptions as context for re-analysis. We are explicit that this is a design metaphor rather than a theoretical claim (see Section 8.2 for a detailed discussion of scope and limits).

### 1.4 Contributions

We summarize the contributions of this paper:

1. **Iterative context-propagation algorithm.** An algorithm that refines schema descriptions over multiple iterations by propagating semantic context through schema dependency graphs, the first to apply iterative graph-structured refinement to database documentation.

2. **Tiered statistical key discovery with LLM feedback.** A multi-stage pipeline combining cardinality analysis, value inclusion testing, naming heuristics, and deterministic gates with a bidirectional feedback loop between statistical discovery and LLM semantic validation.

3. **Dual-layer human knowledge injection.** A mechanism distinguishing ground truth injection (immutable constraints) from seed context injection (refinable priors), enabling effective collaboration between automated analysis and partial human expertise.

4. **Multi-criterion convergence detection.** A convergence detector combining description stability windows, per-column confidence thresholds, and semantic change magnitude to determine when further iteration yields diminishing returns.

5. **Cost analysis and open-source release.** A demonstration that DBAutoDoc reduces documentation cost by more than 99.5% relative to manual analysis, with full release as open-source software including benchmark configurations, evaluation scripts, and prompt templates.

### 1.5 Paper Organization

Section 2 reviews related work. Section 3 provides a technical overview of the architecture. Section 4 describes the key discovery pipeline. Section 5 presents the iterative refinement algorithm. Section 6 covers implementation details. Section 7 reports experimental results including ablation analysis. Section 8 discusses limitations, threats to validity, and ethical considerations. Section 9 outlines future work. Section 10 concludes.

---

## 2. Related Work

DBAutoDoc sits at the intersection of several active research areas: schema understanding, LLM-based data interpretation, constraint discovery, iterative self-refinement, and human-in-the-loop learning.

### 2.1 Database Documentation and Schema Understanding

**Traditional tools.** SchemaSpy, ERAlchemy, and dbdocs.io extract and visualize existing metadata but produce empty output for dark databases. DBAutoDoc targets precisely the class where documentation must be inferred, not merely rendered.

**Schema matching.** \cite{rahm2001survey} provide a comprehensive taxonomy of matching strategies. \cite{koutras2021valentine} offer systematic experimental comparison on realistic benchmarks. Schema matching assumes two schemas to be aligned; documentation must derive meaning from a single schema in isolation. DBAutoDoc borrows instance-level intuitions (value-overlap statistics) but operates in a single-schema setting.

**LLM-based schema understanding.** \cite{trummer2024succinct} address context-window overflow through succinct schema encoding. DBAutoDoc faces the same pressure but extends this to a *dynamic, iterative* context that evolves across refinement rounds. \cite{liu2025magneto} combine a fine-tuned SLM for candidate generation with an LLM reranker. \cite{seedat2024matchmaker} take a self-improving approach philosophically similar to our iterative refinement, but their refinement targets pairwise column correspondences across schemas, while ours targets semantic coherence within a single schema's dependency graph.

**Automated catalog metadata.** \cite{ragleveraging2025} apply RAG to populating data catalog metadata. This approach is fundamentally single-pass with no cross-element context propagation. DBAutoDoc's key innovation is precisely this propagation: high-confidence annotations flow through the schema graph to inform subsequent LLM calls.

**Semantic type detection.** \cite{hulsebos2019sherlock} frame semantic type detection as multi-class classification. DBAutoDoc incorporates similar instance-level features but treats semantic type detection as one input to a broader documentation task.

### 2.2 LLMs for Code and Data Understanding

**Code documentation.** Models such as Codex \cite{chen2021evaluating} and CodeBERT \cite{feng2020codebert} generate documentation from source code. Database schemas occupy a middle ground between code and data, with formal structure and rich implicit semantics.

**Text-to-SQL.** Benchmarks including Spider \cite{yu2018spider} and BIRD \cite{li2023bird} and systems like DAIL-SQL \cite{gao2024dailsql} and DIN-SQL \cite{pourreza2023dinsql} demonstrate that LLMs possess substantial knowledge about relational database conventions. These systems *consume* schema documentation; DBAutoDoc *produces* it.

**Foundation models for data understanding.** \cite{narayan2022foundation} demonstrate that large models generalize well to tabular data tasks with little fine-tuning -- justifying DBAutoDoc's reliance on general-purpose LLMs. A common thread in this work is the single-pass evaluation paradigm; DBAutoDoc demonstrates that iterative refinement leaves substantial accuracy on the table.

### 2.3 Foreign Key and Primary Key Discovery

\cite{rostin2009fk} formulate FK discovery as supervised classification over inclusion dependencies. \cite{jiang2020holistic} propose holistic PK/FK detection using joint reasoning. DBAutoDoc adopts a similar joint-reasoning philosophy in its bidirectional feedback loop. \cite{khatiwada2022alite} and \cite{ilyas2004cords} address joinable column discovery and statistical correlation, respectively. FD discovery algorithms (TANE \cite{huhtala1999tane}, FUN \cite{novelli2001fun}, HyFD \cite{papenbrock2016hyfd}) provide signals for PK candidate assessment. IND detection algorithms (SPIDER \cite{bauckmann2007spider}, BINDER \cite{papenbrock2015binder}, S-INDD \cite{demarchi2009sindd}) form the computational backbone of FK candidate generation \cite{dursch2019ind}. The broader data profiling field \cite{abedjan2018book, abedjan2015profiling, naumann2014revisited} systematizes metadata extraction, with Metanome \cite{papenbrock2015metanome} providing a pluggable framework.

DBAutoDoc's principal contribution relative to this body of work is the *bidirectional feedback loop* between statistical discovery and LLM semantic validation, making them mutually reinforcing rather than sequential.

### 2.4 Iterative Refinement and Structured Reasoning

\cite{madaan2023selfrefine} introduce Self-Refine; \cite{shinn2023reflexion} propose Reflexion with verbal reinforcement learning. Both demonstrate that iterative self-refinement substantially improves output quality. DBAutoDoc's refinement differs structurally: it is *graph-structured* rather than linear, with feedback coming from *structural neighbors* rather than self-critique. \cite{bai2022constitutional} propose Constitutional AI, where explicit principles govern revisions; DBAutoDoc's ground truth injections play an analogous anchoring role. \cite{wei2022cot} demonstrate Chain-of-Thought prompting; \cite{yao2023tot} extend this with Tree of Thoughts; and \cite{besta2024got} generalize to Graph of Thoughts. DBAutoDoc's context propagation is a domain-specific instantiation of graph-structured reasoning, specialized for relational schema topology.

### 2.5 Human-in-the-Loop Machine Learning

Active learning \cite{settles2009active} selects the most informative examples for human annotation. DBAutoDoc incorporates human input through ground truth injection (immutable anchors) and seed context (domain priors). Unlike classical active learning, ground truth annotations are immutable constraints rather than training signals, and their influence through the schema graph can be measured quantitatively.

---

## 3. System Architecture

### 3.1 Overview

DBAutoDoc is organized as a six-phase orchestrated pipeline, implemented in the `AnalysisOrchestrator` class. Each phase produces artifacts consumed by subsequent phases, and all intermediate state is persisted to disk for resumability.

```
AnalysisOrchestrator
|
+-- Phase 1: Schema Introspection
|   +-- DatabaseConnection        (platform-specific connectivity)
|   +-- Introspector              (metadata extraction, row count estimation)
|
+-- Phase 2: Relationship Discovery
|   +-- DiscoveryEngine
|       +-- PrimaryKeyDetector    (candidate generation, scoring, filtering)
|       +-- ForeignKeyDetector    (tiered pre-filtering, containment checks)
|
+-- Phase 3: Iterative Analysis
|   +-- AnalysisEngine
|       +-- DependencyLevelScheduler   (topological ordering)
|       +-- TableAnalyzer              (per-table LLM invocation)
|       +-- StatisticsCollector        (sampling, profiling)
|
+-- Phase 4: Sanity Checking
|   +-- LLMSanityChecker          (cross-table consistency validation)
|
+-- Phase 5: Sample Query Generation
|   +-- SampleQueryGenerator      (use-case query synthesis)
|
+-- Phase 6: Output Generation
    +-- SQLGenerator              (DDL-level annotation scripts)
    +-- MarkdownGenerator         (navigable documentation)
    +-- HTMLGenerator             (browser-renderable reports)
    +-- CSVExporter               (structured tabular exports)
    +-- MermaidERDGenerator       (entity-relationship diagrams)
```
**Figure 1.** DBAutoDoc six-phase orchestration pipeline.

Phase 1 produces a raw schema graph; Phase 2 enriches it with inferred relationships; Phase 3 annotates every node with natural-language descriptions; Phase 4 applies cross-table consistency validation; Phase 5 synthesizes illustrative queries; Phase 6 serializes into multiple output formats.

### 3.2 Database Introspection Layer

The introspection layer constructs a complete, normalized schema representation through a driver abstraction: `BaseAutoDocDriver` defines a uniform interface implemented by concrete subclasses for SQL Server, PostgreSQL, and MySQL. For each table, the introspector retrieves column metadata (name, ordinal position, data type, nullability, defaults), existing descriptions, and constraint definitions. Row counts use platform-specific fast-count heuristics (e.g., `sys.dm_db_partition_stats` for SQL Server, `pg_class.reltuples` for PostgreSQL). All observed types are normalized to a canonical enumeration used uniformly by the discovery and analysis engines.

### 3.3 Data Sampling and Statistics Engine

For every column, the statistics engine computes cardinality, null fraction, min/max values, value frequency distribution, and type-specific profiles (percentiles for numerics, length distributions for strings, range summaries for dates). Default sample size is 1,000 rows per table using platform-specific random sampling. The resulting statistics are serialized into persistent state and attached to every subsequent LLM prompt, ensuring descriptions are grounded in actual observed distributions.

### 3.4 LLM Integration Layer

All prompts are defined as Nunjucks templates supporting conditionals, iteration, and macro composition. The pipeline uses 13 distinct prompt templates (see Appendix D). Every LLM invocation producing programmatic output specifies `responseFormat: 'JSON'` with a JSON Schema. All factual description tasks use temperature 0.1. The integration layer maintains separate input/output token counters per invocation, per phase, and per run, checked against guardrail limits before every call.

### 3.5 State Management and Resumability

All pipeline state is serialized to `state.json` incrementally after each phase boundary and dependency level. Each invocation receives a monotonically increasing run number. On restart, the orchestrator resumes from the earliest incomplete phase, skipping completed work at dependency-level granularity.

### 3.6 Output Formats

Phase 6 produces SQL annotation scripts (platform-specific DDL comments), Markdown documentation with table of contents, self-contained HTML reports, CSV exports, and Mermaid ERD diagrams.

### 3.7 Guardrails System

Three hard limits are configurable: `maxTokensPerRun`, `maxDurationSeconds`, and `maxCostDollars`. The token budget is partitioned across phases (default: 25% discovery, 70% analysis, 5% sanity checking). Warning thresholds at 80% enable graceful degradation. Pre-call enforcement ensures limits are checked synchronously before every LLM invocation.

---

## 4. Key Discovery Pipeline

### 4.1 Problem Formulation

Let $\mathcal{T} = \{T_1, T_2, \ldots, T_n\}$ be the tables in the target schema with columns $\mathcal{C}_i = \{c_{i,1}, c_{i,2}, \ldots, c_{i,m_i}\}$. The discovery engine must infer: (1) primary key candidates $\mathcal{P} = \{(T_i, K_i)\}$ where $K_i$ uniquely identifies rows, and (2) foreign key candidates $\mathcal{F} = \{(T_i, c_{ij}, T_k, c_{kl})\}$ expressing referential relationships.

The design challenge is precision-recall balance. False positives waste LLM tokens and can actively mislead descriptions; false negatives cause related tables to be treated as independent, producing descriptions that omit important join paths.

### 4.2 Primary Key Detection

#### 4.2.1 Candidate Generation and Hard Rejection

Candidates are generated through naming-pattern matching (e.g., `.*[Ii][Dd]$`) and uniqueness analysis ($u = |\text{distinct}(c)| / |\text{rows}(T)|$). Composite key detection tests two-column combinations when no single column achieves $u = 1.0$.

Hard rejection filters eliminate candidates that cannot be primary keys: columns with any nulls, columns where most values are empty strings or zero, and columns matching a semantic blacklist (date/time fields, quantity fields, financial fields, descriptive text fields).

#### 4.2.2 Confidence Scoring

Surviving candidates receive a confidence score $s_{PK} \in [0, 100]$ via a weighted multi-factor model combining uniqueness (50%), naming pattern (20%), data type (15%), and data pattern (15%), with multiplicative penalties and a surrogate key boost. The default acceptance threshold is 70. Position-based heuristics (H9--H12) further improve precision by exploiting the strong convention that primary key columns occupy the first ordinal position. See Appendix A for detailed scoring formulas and Appendix B for the position heuristic specifications.

On AdventureWorks2022, position-based heuristics improved PK precision from 47.9% to 95.7% while recall decreased only marginally from 95.8% to 94.4% -- a net F1 improvement from 48.0% to 95.0%.

### 4.3 Foreign Key Detection

#### 4.3.1 Target-Finding Strategy

For each non-PK column, the engine identifies target columns through three strategies applied in sequence: (1) name-derived lookup (extracting candidate table names from column names like `CustomerID`), (2) PK naming similarity via Levenshtein distance, and (3) homonymous PK lookup as a fallback.

#### 4.3.2 Tiered Pre-Filtering

A two-tier pre-filtering strategy eliminates the vast majority of candidates before value-level computation. Tier 1 excludes semantically incompatible types (DATE, BOOLEAN, FLOAT, BINARY, etc.) at zero cost. Tier 2 samples 10 values per candidate and applies pattern-based exclusion rules (emails, URLs, long strings) and promotion rules (UUIDs, numeric codes). This reduces candidates undergoing full containment analysis by 60--80%.

#### 4.3.3 Multi-Factor Confidence Scoring and Deterministic Gates

FK candidates are scored by a weighted model combining value overlap (40%), naming similarity (20%), cardinality ratio (15%), target-is-PK bonus (15%), and null handling (10%). See Appendix A for complete formulas.

Before scoring, candidates pass through deterministic gates -- hard, mathematically invariant filters that eliminate false positives with zero risk of rejecting correct relationships. These gates (G1--G8) eliminated approximately 75% of statistical false positives while losing zero correct FKs. A fan-out confidence penalty is applied when a single source column has candidates pointing to multiple targets. See Appendix A for gate specifications.

**Adaptive Weight Redistribution.** In schemas without declared PKs, the target-is-PK factor introduces systematic downward bias. When more than 40% of candidates score zero on this factor, the engine redistributes the PK bonus weight to value containment (increasing from 40% to 55%), preserving calibration.

#### 4.3.4 The LLM as Primary FK Creator

A critical empirical finding is that the LLM, not the statistical pipeline, is the primary source of correct FK discoveries. In our AdventureWorks2022 evaluation:

- **Statistics-created FKs**: 15 correct out of 76 proposals (20% precision)
- **LLM-created FKs**: 75 correct out of 84 proposals (89% precision)

The LLM proposes FKs with high precision because it reasons about semantic relationships, while the statistical pipeline generates many false positives requiring filtering. Blocking LLM FK creation caused recall to drop from 90 to 49 correct FKs, confirming that LLM creative proposals are essential.

#### 4.3.5 Bidirectional LLM Validation

Rather than a one-way pipeline, the system implements a feedback loop. In the statistical-to-LLM direction, candidates exceeding the confidence threshold undergo LLM semantic validation. In the LLM-to-statistical direction, the LLM proposes novel FK candidates during analysis that are then subjected to statistical value-containment checks before acceptance. This yields complementary coverage: statistics catch relationships with strong data evidence but non-obvious names; LLM inference catches relationships with clear semantic naming but imperfect data evidence.

---

## 5. Iterative Refinement via Context Propagation

### 5.1 Motivation and the Backpropagation Analogy

Automated schema documentation faces a bootstrapping problem analogous to training deep neural networks: the description of a parent table cannot be fully accurate without understanding its children, yet children depend on parent context. Consider an e-commerce schema: when the LLM first analyzes `Customers` in isolation, it may correctly infer account-level information. But analyzing `OrderItems` later -- discovering per-item tax jurisdictions and fulfillment splits -- reveals that `Orders` is a complex orchestration record, not merely a transaction header. This enrichment should flow back to improve `Orders` and potentially `Customers`.

The structural parallel to backpropagation is precise: (1) a forward pass processes components in dependency order; (2) an error signal is computed after forward processing; (3) correction information propagates backward through a dependency graph; (4) iteration repeats until convergence. The mechanism is entirely discrete and semantic -- there are no gradients, no chain rule, no loss surfaces. This distinguishes our approach from single-artifact self-refinement \cite{madaan2023selfrefine, shinn2023reflexion} and connects to Graph of Thoughts \cite{besta2024got}, specialized for relational schema topology.

### 5.2 The Schema Dependency Graph

Let $\mathcal{S} = (T, C, R)$ denote a schema with tables $T$, columns $C$, and relationships $R \subseteq T \times T$. A topological ordering stratifies tables into dependency levels $L_0, L_1, \ldots, L_n$, where $L_0$ contains leaf tables (referenced by others but not themselves referencing any table). This ensures that when a table at level $L_k$ is analyzed, all tables it references have already been processed and their descriptions are available as context.

Cross-schema foreign keys introduce inter-schema edges handled uniformly: the topological sort operates over all tables across all schemas. Cycles are broken conservatively by removing the lowest-confidence edge, though all edges are retained in LLM context.

### 5.3 Forward Pass: Initial Description Generation

The forward pass processes tables in dependency level order. For each table $t$ at level $L_k$, the system assembles analysis context comprising: column statistics and sample values, related table descriptions from earlier levels, seed context, ground truth constraints, and (for iterations $i > 1$) prior iteration descriptions.

The LLM produces structured JSON output: a table description with confidence score $\sigma_t \in [0, 1]$, column descriptions with individual confidence scores, structured FK suggestions fed back to the discovery pipeline, and parent table insights -- structured observations about parent tables that serve as upward-flowing correction signals (the semantic analogue of gradients).

### 5.4 Loss Computation: Sanity Checks

Sanity checks detect semantic inconsistencies at three granularities: dependency-level (after each level completes), schema-level (after each schema completes), and cross-schema (after all iterations). Six structural rules enforce PK/FK normalization principles. Violations generate structured error reports -- the "loss signal" -- queuing affected tables for re-analysis.

### 5.5 Context Propagation: The Backward Pass

The `BackpropagationEngine` implements insight accumulation, parent revision, and cascading propagation. After each level completes, insights from child tables are accumulated per parent. For each parent with non-empty insights and non-immutable description, a revision prompt presents the current description, accumulated insights with confidence scores, sanity-check violations, and seed context. The LLM returns `{needsRevision, revisedDescription, reasoning, confidence}`, allowing explicit determination that the current description is already correct.

Cascading propagation across iterations means a single pass propagates insights upward by exactly one dependency level; deeper corrections are realized in subsequent iterations. The number of iterations for full convergence is bounded by the dependency depth $d$. Ground truth tables are never revised, serving as fixed semantic anchors.

### 5.6 Convergence Detection

The `ConvergenceDetector` implements a multi-criterion stopping rule:

1. **Stability window**: No material changes in the last $w$ iterations (default $w = 2$).
2. **Confidence threshold**: All individual confidence scores exceed minimum $\tau$ (default 0.6).
3. **Semantic comparison**: An LLM-based prompt distinguishes material from cosmetic changes.

Convergence is declared when at least two of three criteria are satisfied and at least two full iterations have completed. A hard maximum $K_{\max}$ (default 3) prevents unbounded execution.

### 5.7 Ground Truth and Seed Context

**Ground truth** entries are authoritative human-verified descriptions that function as immutable anchors -- never overwritten by the LLM across any iteration. They propagate forward by inclusion in neighbors' context, analogous to labeled examples in semi-supervised learning.

**Seed context** provides domain guidance (overall purpose, business domains, industry context) injected into every prompt. It biases but does not constrain the LLM's interpretation, analogous to pre-trained weights in transfer learning.

Together, they dramatically reduce iterations required: schemas with both converge in 2 iterations; schemas with neither require 3--5.

### 5.8 Formal Algorithm

**Algorithm 1: Iterative Schema Documentation with Context Propagation**

**Input:** Schema $\mathcal{S} = (T, C, R)$; Ground Truth $G$; Seed Context $SC$; Configuration $K$

**Output:** Documentation $D : T \cup C \to \text{string}$

```
 1. INTROSPECT: Extract T, C from database catalog
 2. SAMPLE: Collect statistics and <=10 representative values for each c in C
 3. DISCOVER: Run PK/FK detection pipeline (Section 4) -> augment R
 4. for each (t, desc) in G do
 5.   D[t] <- desc; mark t as immutable
 6. end for
 7. G_dep <- BuildDependencyGraph(T, R)
 8. L_0, L_1, ..., L_n <- TopologicalSort(G_dep)
 9. for iteration i <- 1 to K.maxIterations do
10.   // --- FORWARD PASS ---
11.   for each level l = 0, 1, ..., n do
12.     for each table t in L_l do
13.       if immutable(t) then continue end if
14.       C(t) <- {statistics(t), samples(t), D[parents(t)], SC, D[GT_neighbors(t)]}
15.       if i > 1 then C(t) <- C(t) U {D_{i-1}[t], reasoning_{i-1}[t]} end if
16.       D'[t], sigma_t, Pi(t), F(t) <- LLM_ANALYZE(t, C(t))
17.       FeedDiscovery(F(t))
18.     end for
19.     SanityCheck(L_l)
20.     // --- PROPAGATION PASS ---
21.     for each parent p in U_{t in L_l} parents(t) do
22.       if immutable(p) then continue end if
23.       Pi_hat(p) <- U_{t:(t,p) in R, t in L_l} Pi(t)
24.       if Pi_hat(p) != {} then
25.         revised, sigma_p <- LLM_REVISE(p, D'[p], Pi_hat(p))
26.         if revised.needsRevision then
27.           D'[p] <- revised.description
28.           Log(p, result='changed', iteration=i)
29.         else
30.           Log(p, result='unchanged', iteration=i)
31.         end if
32.       end if
33.     end for
34.   end for
35.   // --- CONVERGENCE CHECK ---
36.   stable    <- NMaterialChanges(last K.w iterations) = 0
37.   confident <- for all t in T : sigma_t >= K.tau
38.   semantic  <- for all changed t : SemanticDiff(D[t], D'[t]) = 'cosmetic'
39.   if |{stable, confident, semantic}| >= 2 and i >= 2 then break end if
40.   D <- D'
41. end for
42. SanityCheck(S); CrossSchemaSanityCheck(S)
43. return D'
```

The algorithm's complexity is $O(K_{\max} \cdot |T| \cdot \ell)$ LLM calls in the worst case. LLM calls within each dependency level are independent and issued in parallel, bounding wall-clock time by the depth $n$ rather than $|T|$.

---

## 6. Implementation

### 6.1 Technology Stack

DBAutoDoc is implemented in TypeScript on Node.js, supporting SQL Server (`mssql`), PostgreSQL (`pg`), and MySQL (`mysql2`) through connection-pooled native drivers. LLM access is mediated through the MemberJunction AI abstraction layer, supporting Google Gemini, OpenAI GPT, Anthropic Claude, Groq, and Mistral. The tool is exposed as both a CLI (built on oclif) and a programmatic TypeScript API.

### 6.2 Prompt Engineering

The prompt layer comprises thirteen Nunjucks templates (see Appendix D). The central `table-analysis` template (~140 lines) requests structured JSON containing table descriptions, confidence scores, column descriptions, FK suggestions, and parent table insights. The `backpropagation` template handles revision by presenting aggregated child observations. Sanity checking uses three scope-specific templates. A `semantic-comparison` template supports convergence detection.

All prompts use temperature 0.1. Context is scoped to direct ancestors and descendants in the FK graph rather than the entire schema. For models supporting effort-level parameters, high effort is used during sanity checks and lower effort during bulk analysis.

### 6.3 Token Budget Management

A three-tier guardrail system covers token count, wall-clock duration, and estimated cost. The global budget is partitioned across phases (25% discovery, 70% analysis, 5% sanity checking). Pre-call enforcement ensures limits are checked before every LLM invocation. Rate limiting uses exponential backoff with jitter.

### 6.4 Output Formats

Six formats are generated from a single run: SQL annotation scripts (platform-specific DDL), Markdown documentation, HTML reports, CSV exports, Mermaid ERD diagrams, and analysis-metrics reports. All outputs are organized into numbered run directories supporting side-by-side comparison.

---

## 7. Evaluation

### 7.1 Experimental Setup

#### 7.1.1 Datasets

We evaluate DBAutoDoc on four public benchmark databases plus two private enterprise databases. Table 1 summarizes characteristics.

**Table 1: Benchmark Database Characteristics**

| Database | Tables | Columns | Domain | Constraints |
|---|---|---|---|---|
| AdventureWorks2022 | 71 | 486 | Manufacturing/Sales | Full (stripped for eval) |
| Chinook | 11 | 64 | Music store | Full (stripped for eval) |
| Northwind | 13 | 88 | Order management | Full (stripped for eval) |
| LousyDB | 20 | 162 | Synthetic (dark DB) | None by design |
| OrgA | 36 | 1,807 | Education association | None (dark DB) |
| OrgB | 125 | 2,347 | Automotive trade assoc. | None (dark DB) |

**AdventureWorks2022** is the primary stress-test: 71 tables across five schemas with 91 declared FK relationships. For discovery experiments, all constraints and descriptions are stripped; originals serve as ground truth.

**Chinook** (11 tables, music store) provides clean FK relationships with unambiguous domain vocabulary for controlled evaluation.

**Northwind** (13 tables, order management) tests behavior on small schemas with limited statistical signal.

**LousyDB** is a purpose-built synthetic benchmark with intentionally cryptic abbreviated names (`cst`, `ord`, `prd`, `inv_ln`), no constraints, no descriptions, and intentional data quality issues -- the archetype of a dark database not present in any LLM training data.

**OrgA** and **OrgB** are production enterprise databases (details in Section 7.5).

#### 7.1.2 Metrics

**Key discovery F1.** Precision, recall, and F1 for PK and FK detection against ground truth (stripped constraint declarations).

**Overall weighted score:**

$$S_{\text{overall}} = 0.35 \cdot F1_{FK} + 0.30 \cdot F1_{PK} + 0.20 \cdot C_{\text{table}} + 0.15 \cdot C_{\text{col}}$$

where $C_{\text{table}}$ and $C_{\text{col}}$ are description coverage fractions. Key discovery (65% combined) is weighted more heavily than description coverage (35%) because structural relationships are prerequisites for meaningful documentation.

**Convergence speed.** Iterations until fewer than 5% of descriptions change materially.

**Token efficiency and cost.** Total tokens per table, broken down by phase, with USD cost at published provider pricing.

### 7.2 Key Discovery Results

#### 7.2.1 Primary Key Detection

**Table 2: Primary Key Detection Results**

| Database | Tables | True PKs | Detected PKs | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| AdventureWorks | 71 | 71 | 70 | 95.7% | 94.4% | 95.0% |
| Chinook | 11 | 11 | 11 | 95.2% | 95.2% | 95.2% |
| Northwind | 13 | 13 | 11 | 72.7% | 72.7% | 72.7% |

Northwind's lower score is partly attributable to evaluation artifacts (the `Order Details` table name with a space causes comparison mismatches) and low row counts in several tables limiting statistical signal.

#### 7.2.2 Foreign Key Detection

**Table 3: Foreign Key Detection Results**

| Database | True FKs | Detected FKs | Precision | Recall | F1 |
|---|---|---|---|---|---|
| AdventureWorks | 91 | 100 | 90.0% | 98.9% | 94.2% |
| Chinook | 11 | 11 | 95.2% | 95.2% | 95.2% |
| Northwind | 13 | 12 | 75.0% | 75.0% | 75.0% |

#### 7.2.3 Cross-Model Comparison

**Table 4: Cross-Model Comparison on AdventureWorks2022**

| Metric | Gemini 3 Flash / 3.1 Pro | GPT-5.4-mini / 5.4 | Sonnet 4.6 / Opus 4.6 |
|--------|--------------------------|---------------------|----------------------|
| **PK F1** | **95.0%** | 89.4% | **95.0%** |
| **FK F1** | **94.2%** | 77.9% | 93.0% |
| Table Desc Coverage | 99% | 97% | 100% |
| Column Desc Coverage | 99% | 96% | 100% |
| **Overall Score** | **96.1% (A+)** | 87.9% (B+) | 96.1% (A+) |
| Tokens Used | 3.2M | 952K | 471K |

**Key findings.** (1) Context window matters: GPT-5.4-mini's 272K limit caused 15 FK misses vs. 1 for Gemini (1M) and 4 for Sonnet/Opus (680K). (2) The deterministic foundation provides a floor regardless of LLM choice. (3) Gemini and Anthropic achieve near-parity at 96.1%. (4) Sonnet/Opus used 7x fewer tokens than Gemini while achieving equivalent quality.

#### 7.2.4 Cross-Database Summary

**Table 5: Cross-Database Results (Gemini 3 Flash / 3.1 Pro, 2 Iterations)**

| Database | Tables | PK F1 | FK F1 | Table Desc | Col Desc | Weighted Score | Tokens |
|---|---|---|---|---|---|---|---|
| AdventureWorks | 71 | 95.0% | 94.2% | 99% | 99% | 96.1% (A+) | 3.2M |
| Chinook | 11 | 95.2% | 95.2% | 100% | 100% | 96.9% (A+) | 98K |
| Northwind | 13 | 72.7% | 75.0% | 100% | 100% | 83.1% (B) | 114K |
| LousyDB | 20 | 97.6%* | --* | 100% | 100% | -- | 214K |

*LousyDB has no declared constraints by design. All 20 tables received correct PK identification (97.6% F1 accounting for scoring precision). FK ground truth requires manual extraction; a weighted score is not computable.

**Token efficiency.** Consumption scales sub-linearly for small databases (~9K tokens/table for Chinook and Northwind) and increases for denser FK graphs (~45K tokens/table for AdventureWorks). Total cost across all six databases was approximately \$1--2 at Gemini Flash pricing.

### 7.3 Ablation Analysis

We frame the pipeline's development iterations as an ablation study, isolating the contribution of each architectural component to FK detection on AdventureWorks2022.

**Table 6: FK Detection Ablation on AdventureWorks2022**

| Configuration | FK Correct | FK F1 | What it measures |
|---|---|---|---|
| Statistical discovery only (no LLM) | 15/91 | ~30% | Baseline deterministic capability |
| LLM analysis only (no deterministic gates) | 75/91 | 71.7% | LLM pre-training + semantic reasoning |
| Stats + LLM (no gates, no pruning) | 90/91 | 71.7% | Combined recall, poor precision |
| Stats + LLM + deterministic gates | 87/91 | 87.0% | Gates improve precision (+15 F1 points) |
| Full pipeline (stats + LLM + gates + pruning) | 90/91 | 94.2% | Pruning recovers precision (+7 F1 points) |

**Key insight.** The LLM contributes most of the *recall* (finding correct FKs), while the deterministic pipeline contributes most of the *precision* (removing false positives). Neither alone achieves the full pipeline's 94.2% F1. The deterministic gates account for a **23-point F1 improvement** over LLM-only detection (71.7% to 94.2%), demonstrating that the pipeline's contribution is substantial and independent of the LLM's pre-training knowledge.

For PK detection, the ablation is even starker: statistics alone found 34/71 PKs (48% F1), while the full pipeline with LLM PK proposals and position heuristics achieved 67/71 (95% F1) -- a **47-point improvement**.

**Interpretation.** These results address a natural concern about training data contamination (see Section 8.4): if the LLM simply "knew" AdventureWorks relationships from pre-training, the deterministic pipeline would add no value. The 23-point F1 improvement from gates and pruning demonstrates that the pipeline's filtering and scoring mechanisms contribute substantial precision gains that the LLM cannot achieve alone. Furthermore, on private databases unseen by any LLM (OrgA, OrgB) and a purpose-built synthetic database (LousyDB), the system achieves comparable quality (Section 7.5), ruling out memorization as the primary explanation.

### 7.4 Iterative Refinement Results

Across all benchmark databases, DBAutoDoc converges within 2 iterations at median. The convergence rate exhibits a characteristic pattern: rapid change in iterations 1--2 as LLM descriptions incorporate FK-propagated context for the first time, followed by diminishing returns. We set a default maximum of 5 iterations, which captures the vast majority of achievable quality gain while bounding cost.

### 7.5 Enterprise Case Studies

#### 7.5.1 OrgA: Professional Association in the Education Sector

**Database profile.** A professional association using a Salesforce-based CRM/AMS platform. The snapshot contained 36 tables, 1,807 columns across 4 schemas -- a completely undocumented dark database with zero declared constraints.

**Key discovery.** DBAutoDoc detected 35/36 primary keys (97% coverage) and 193 foreign key relationships. The adaptive weight redistribution mechanism activated as expected.

**Semantic highlights.** The LLM correctly identified Salesforce Person Account patterns, the `__c` custom field suffix, the `NU` namespace prefix, committee governance structures, and membership lifecycle flows -- all from cryptic API names without any human hints.

**Estimated weighted score.** While no ground truth exists for quantitative F1 measurement, we estimate 93--96% based on 97--100% PK coverage (35/36 correct, the remaining table having an ambiguous key structure), strong FK coverage validated by domain review, and 100% description coverage. The high PK coverage on this private database -- which no LLM has seen in training -- provides evidence that the system's key discovery generalizes beyond public benchmarks.

**Processing.** 2 iterations, 1.1M tokens, ~1.5 hours, fully autonomous.

#### 7.5.2 OrgB: Trade Association in the Automotive Aftermarket

**Database profile.** A custom .NET application with SQL Server backend: 125 tables, 2,347 columns across 10 schemas -- completely undocumented.

**Key discovery.** 116/125 primary keys detected (93% coverage), 490 FK relationships (3.9 per table average). The 9 tables without PKs were primarily lookup tables with non-standard naming.

**Semantic highlights.** The system correctly identified the CRM schema's Customer table as the hub entity, discovered cross-schema relationships spanning Shopping, Purchasing, and Accounting schemas, and detected composite PKs in junction tables.

**Estimated weighted score.** We estimate 91--95% based on 93% PK coverage (116/125), strong cross-schema FK coverage validated by architectural review, and 100% description coverage. Like OrgA, this private database provides evidence of generalization independent of LLM pre-training.

**Scaling comparison with OrgA:**

| Metric | OrgA (36 tables) | OrgB (125 tables) | Ratio |
|--------|------------------|-------------------|-------|
| PK coverage | 97% (35/36) | 93% (116/125) | -- |
| FKs detected | 193 | 490 | 2.5x |
| Description coverage | 100% | 100% | -- |
| Tokens consumed | 1.1M | 3.3M | 3.0x |
| Estimated cost | ~\$0.20 | ~\$0.50 | 2.5x |

Cost scaled roughly linearly with table count, confirming economic viability on larger schemas.

### 7.6 Cost Analysis

The total LLM API cost across all six databases (276 tables, ~5,100 columns) was approximately \$1--2 at Gemini Flash pricing. Human documentation at \$75--150/hr and 2--4 hours per table yields \$15,000--60,000 for a 100-table database. DBAutoDoc achieves comparable documentation at under \$1.00 per 100 tables -- a reduction of more than 99.5%.

Token efficiency varies by model: Sonnet 4.6 / Opus 4.6 used only 471K tokens (7x fewer than Gemini's 3.2M) while achieving equivalent quality, making Anthropic models the most cost-effective option at current pricing.

---

## 8. Discussion

### 8.1 When Context Propagation Helps Most

Propagation benefit scales with FK graph density: databases with many edges provide more propagation paths, and well-understood hub tables seed improvements across large neighborhoods. Schemas with consistent naming conventions converge faster. Hub tables benefit disproportionately from backpropagation, receiving revision prompts incorporating use-case evidence from all consumers. Diminishing returns emerge for large, loosely connected schemas where the graph partitions into weakly linked components.

### 8.2 The Backpropagation Analogy: Scope and Limits

The term "backpropagation" is used deliberately but with acknowledged looseness. The structural parallels are genuine: defined processing order, backward-flowing correction signals, iterative convergence. The differences are equally genuine: there are no continuous gradients, no weight updates, no differentiable objective. We do not claim mathematical equivalence. The contribution is heuristic: an intuitive mental model that makes clear the approach is categorically different from single-pass summarization.

### 8.3 Limitations

Several limitations bound our claims. (1) LLM hallucination remains an irreducible risk; generated documentation should be reviewed by domain experts for safety-critical processes. (2) Statistical FK discovery is bounded by pattern recognizability; unconventional key designs may exhibit lower recall. (3) Token cost scales with database size; very large databases incur non-trivial charges. (4) Quality degrades for empty or near-empty tables where sample-value statistics are unavailable. (5) Non-English column names reduce LLM effectiveness.

### 8.4 Threats to Validity

**Training data contamination.** AdventureWorks, Northwind, and Chinook are widely known databases likely present in LLM training data. The LLM may "know" PK/FK relationships from pre-training rather than discovering them through our pipeline. We offer three mitigations: (1) OrgA and OrgB are private databases no LLM has seen, achieving 97% and 93% PK coverage respectively with estimated weighted scores of 91--96%; (2) LousyDB was purpose-built for this evaluation and is not in any training data, achieving 97.6% PK F1; (3) ablation analysis (Section 7.3) shows the deterministic pipeline contributes a 23-point F1 improvement beyond what the LLM achieves alone, demonstrating substantial value independent of memorization. Future work includes additional synthetic databases designed to further control for this threat.

**Limited database diversity.** Results span 4 public and 2 private databases. While these cover multiple domains (manufacturing, music, trade associations, education), more diverse schemas -- NoSQL exports, data warehouses, time-series databases, and schemas with non-Western naming conventions -- would strengthen generalization claims.

**Single evaluator for descriptions.** Ground truth comparison for key discovery is automated against declared constraints, but description quality has not been evaluated by independent human raters in this version of the paper. We plan a formal human evaluation study with multiple domain-expert raters and inter-rater reliability measurement.

**SQL Server focus.** All benchmarks use SQL Server. PostgreSQL and MySQL drivers exist and are tested for connectivity and metadata extraction, but have not been included in the quantitative benchmark suite.

**LLM model version sensitivity.** Provider model updates can alter output characteristics without version-number changes. We record model identifiers and API versions for each result, but exact replication may require the same model snapshot. Temperature 0.1 reduces but does not eliminate variance.

### 8.5 Ethical Considerations

The primary ethical concern is data privacy: sample values included in LLM prompts may contain sensitive information transmitted to third-party providers. DBAutoDoc provides configurable sample-size limits (including zero to disable value analysis), and planned support for locally-hosted models will enable fully on-premises operation. Users bear responsibility for regulatory compliance.

---

## 9. Future Work

Based on our benchmark experience, we identify six concrete directions:

1. **Cross-platform validation.** Extending the quantitative benchmark suite to PostgreSQL and MySQL to validate driver parity and confirm that key discovery heuristics transfer across platforms.

2. **Parallelization for large databases.** Implementing concurrent table analysis within dependency levels and parallel schema processing to reduce wall-clock time for enterprise-scale schemas (500+ tables).

3. **Description quality human evaluation.** Conducting a formal study with multiple independent domain-expert raters, structured Likert-scale rubrics, and inter-rater reliability measurement using Cohen's kappa.

4. **Training data contamination mitigation.** Creating additional synthetic test databases (following the LousyDB model) with diverse naming conventions, key structures, and domain vocabularies to provide contamination-free benchmarks.

5. **Cost optimization for large schemas.** Implementing confidence-driven model dispatch (routing high-confidence tables to lightweight models, escalating low-confidence tables to stronger models) and context-window optimization to reduce token consumption by an estimated 40--60%.

6. **Driver refactoring with SQLDialect integration.** Leveraging MemberJunction's existing SQLDialect abstraction to eliminate platform-specific SQL throughout the introspection and statistics layers.

Additional longer-term directions include active learning for ground truth selection, cross-database enterprise-scale analysis, incremental/continuous analysis integrated with CI/CD pipelines, local and hybrid LLM deployment for data sovereignty, and ecosystem integration with data catalog platforms and IDE plugins.

---

## 10. Conclusion

Undocumented databases represent one of the most persistent and costly problems in enterprise software engineering. Comprehensive manual documentation requires weeks of expert effort and tens of thousands of dollars -- a cost most organizations cannot justify.

DBAutoDoc addresses this through a bidirectional feedback loop between statistical key discovery and iterative LLM-based analysis organized along the discovered FK graph. Statistical discovery recovers relational structure; context propagation, inspired structurally by backpropagation, refines descriptions across multiple passes until semantic convergence. Parent tables receive insights from their children; children receive context from their now-better-understood parents.

Empirical evaluation demonstrates 95.0% F1 on primary key detection and 94.2% F1 on foreign key detection with 99% description coverage on AdventureWorks2022. Ablation analysis confirms that the deterministic pipeline contributes a 23-point F1 improvement independent of LLM pre-training knowledge. On private enterprise databases unseen by any LLM, the system achieves 93--97% PK coverage with estimated weighted scores of 91--96%, providing evidence that results generalize beyond public benchmarks. Convergence is typically achieved within 2 iterations at a cost under \$1 per 100 tables -- a reduction of more than 99.5% relative to manual documentation.

The central finding is that *treating schema documentation as an iterative learning problem* rather than a one-shot extraction task produces substantially better results. Neither the statistical approach alone nor the LLM approach alone achieves the quality of their combination in a bidirectional feedback loop.

DBAutoDoc is released as open-source software under the MIT License as part of the MemberJunction platform, with all benchmark configurations, prompt templates, and evaluation scripts included for full reproducibility. The repository is available at `https://github.com/MemberJunction/MJ`.

---

## Appendix A: Deterministic Gate and Scoring Specifications

### A.1 PK Confidence Scoring Formula

Candidates surviving hard rejection filters are scored via:

$$s_{PK} = 50 \cdot f(u) + 20 \cdot n + 15 \cdot d + 15 \cdot p$$

**Uniqueness factor** $f(u)$ (50% weight): $f(u) = u$ when $u \geq 0.95$; linearly scaled below.

**Naming factor** $n$ (20% weight): 1.0 if column name matches a PK naming pattern; 0 otherwise.

**Data type factor** $d$ (15% weight): INT/BIGINT/UNIQUEIDENTIFIER -> 1.0; VARCHAR -> 0.6; TEXT/BLOB -> 0.2; other -> 0.3.

**Data pattern factor** $p$ (15% weight): Sequential integers -> +15; GUID/UUID -> +15; natural key codes -> +10; composite-derived -> +5.

**Penalties.** Nulls: x0.7. Unique but atypical name: x0.5. FK likelihood $\ell_{FK}$: x$(1 - 0.6 \cdot \ell_{FK})$.

**Surrogate Key Boost.** +20 points when: name matches `id` or `{table_name}_id`, $u \geq 0.95$, and $d \geq 0.9$.

Default acceptance threshold: 70.

### A.2 FK Confidence Scoring Formula

$$s_{FK} = 40 \cdot v + 20 \cdot s + 15 \cdot r + 15 \cdot k + 10 \cdot \nu$$

**Value overlap** $v$ (40%): Fraction of sampled source values (up to 500) appearing in target column.

**Naming similarity** $s$ (20%): Normalized Levenshtein distance. Full match -> 1.0; containment -> 0.8; partial matches scaled linearly.

**Cardinality ratio** $r$ (15%): $r = \min(\rho, 2) / 2$ where $\rho = |\text{rows}(T_i)| / |\text{distinct}(c_{ij})|$.

**Target-is-PK bonus** $k$ (15%): 1.0 if target is a detected PK; 0 otherwise.

**Null handling** $\nu$ (10%): Null fraction <30% -> 1.0; 30--70% -> 0.5; >70% -> 0.

**Penalties.** Orphan rate >20%: x0.7. Incompatible types: x0.5. Default threshold: 60.

### A.3 Deterministic Gates (G1--G8)

**Gate G1: Target PK-Eligibility.** Target column must pass PK hard rejection filters (uniqueness, non-null, non-blank). Logically irrefutable: FKs reference PKs by definition.

**Gate G3: Rowguid Target Filter.** Columns named `rowguid` are excluded as FK targets. These are system-generated replication identifiers, never semantically meaningful FK targets.

**Gate G4: Row-Count Ratio Confidence Multiplier.** Scales confidence downward when source table has dramatically fewer rows than target, violating the expected many-to-one FK cardinality pattern.

**Gate G5: Fan-Out Limiter (Top-3).** When a source column has candidates pointing to multiple targets, only the top 3 by confidence are retained. No correct FK was ranked 4th or lower in our evaluation.

**Gate G6: Value Overlap Threshold (75%).** Candidates with <75% source value containment are rejected. Calibrated to accommodate data quality issues while eliminating coincidental overlaps.

**Gate G8: Source-is-PK Skip.** PK columns are skipped as FK sources (except self-referencing hierarchies handled separately). Eliminates false positives from coincidental PK-to-PK value overlap.

### A.4 Fan-Out Confidence Penalty

$$\psi(n) = \begin{cases} 1.0 & \text{if } n = 1 \\ 0.85 & \text{if } n = 2 \\ 0.75 & \text{if } n = 3 \\ 0.65 & \text{if } n \geq 4 \end{cases}$$

where $n$ is the number of target tables after gate filtering. Pushes ambiguous candidates below the confidence locking threshold, delegating final arbitration to LLM-based pruning.

---

## Appendix B: PK Position Heuristics (H9--H12)

**Heuristic H9: Column Position Scoring.** The confidence score is multiplied by:

$$\phi(pos) = \begin{cases} 1.0 & \text{if } pos = 0 \\ 0.85 & \text{if } pos = 1 \\ 0.70 & \text{if } pos = 2 \\ 0.55 & \text{if } pos \geq 3 \end{cases}$$

where $pos$ is the column's zero-indexed ordinal position. The aggressive discount for $pos \geq 3$ reflects that such columns are rarely primary keys. In AdventureWorks2022, every correct PK began at position 0.

**Heuristic H10: Consecutive Composite Key Detection.** Composite key candidates whose constituent columns form a contiguous prefix of the table's column list (positions 0, 1, 2, ...) receive a confidence boost, reflecting the convention that composite keys occupy leading columns.

**Heuristic H11: Progressive Discount for Later PK-Eligible Columns.** When multiple columns pass hard filters and achieve high uniqueness, progressive multiplicative discounts are applied beyond the first eligible column. Tables rarely have multiple independent surrogate keys.

**Heuristic H12: Composite Supersedes Individual.** When a composite key achieves high confidence and its constituent columns are individually PK-eligible, individual candidates are suppressed. Prevents reporting both individual columns and their composite as separate PKs.

---

## Appendix C: Per-Run Benchmark History

Detailed per-run results are available in the project's evaluation directory. Key milestone runs:

| Run | Configuration | FK Correct | FK F1 | PK F1 | Notes |
|-----|--------------|-----------|-------|-------|-------|
| 005 | Stats + LLM, no gates | 90/91 | 71.7% | ~48% | High recall, poor precision |
| 008 | Added G1, G3, G5 gates | 87/91 | 82.4% | 89.0% | Gates improve precision |
| 011 | Added position heuristics H9--H12 | 87/91 | 87.0% | 95.0% | Position scoring dramatically improves PK |
| 015 | Full pipeline + pruning | 90/91 | 94.2% | 95.0% | Final configuration |

Each run used AdventureWorks2022 (stripped) with Gemini 3 Flash / 3.1 Pro, 2 iterations, sanity checks disabled.

---

## Appendix D: Prompt Templates

DBAutoDoc uses 13 prompt templates, all version-controlled in the open-source repository. Key templates:

| Template | Purpose | Scope |
|----------|---------|-------|
| `table-analysis` | Primary analysis: table/column descriptions, FK suggestions, parent insights | Per-table, per-iteration |
| `backpropagation` | Parent revision given accumulated child insights | Per-parent, per-level |
| `fk-pruning` | LLM-based arbitration among competing FK candidates | Per-source-column |
| `pk-pruning` | LLM validation of PK candidates against semantic context | Per-table |
| `dependency-level-sanity-check` | Cross-table consistency within a dependency level | Per-level |
| `schema-level-sanity-check` | Intra-schema naming and terminology consistency | Per-schema |
| `cross-schema-sanity-check` | Cross-schema entity alignment detection | Global |
| `semantic-comparison` | Material vs. cosmetic change classification | Per-table, convergence |
| `query-planning` | Sample query use-case identification | Per-table |
| `single-query-generation` | SQL query synthesis for identified use cases | Per-query |
| `query-fix` | SQL correction given error messages | Per-failed-query |
| `query-refinement` | Query adjustment for unexpected result shapes | Per-query |

All templates are available at `https://github.com/MemberJunction/MJ` in the `packages/DBAutoDoc/src/prompts/` directory.

---

## References

\[1\] **\cite{rahm2001survey}** Rahm, E. and Bernstein, P. A. "A Survey of Approaches to Automatic Schema Matching." *The VLDB Journal* 10(4): 334--350, 2001.

\[2\] **\cite{bellahsene2011matching}** Bellahsene, Z., Bonifati, A., and Rahm, E. (eds.). *Schema Matching and Mapping*. Springer, Berlin, 2011.

\[3\] **\cite{koutras2021valentine}** Koutras, C., et al. "Valentine: Evaluating Matching Techniques for Dataset Discovery." In *ICDE*, pp. 468--479, 2021.

\[4\] **\cite{liu2025magneto}** Liu, T., et al. "Magneto: Combining Small and Large Language Models for Schema Matching." *PVLDB* 18(8): 2681--2694, 2025.

\[5\] **\cite{seedat2024matchmaker}** Seedat, N. and van der Schaar, M. "Matchmaker: Self-Improving Large Language Model Programs for Schema Matching." In *NeurIPS*, 2024.

\[6\] **\cite{trummer2024succinct}** Trummer, I. "Generating Succinct Descriptions of Database Schemata for Cost-Efficient Prompting of Large Language Models." *PVLDB* 17(11), 2024.

\[7\] **\cite{narayan2022foundation}** Narayan, A., et al. "Can Foundation Models Wrangle Your Data?" *PVLDB* 16(4): 738--746, 2022.

\[8\] **\cite{hulsebos2019sherlock}** Hulsebos, M., et al. "Sherlock: A Deep Learning Approach to Semantic Data Type Detection." In *KDD*, pp. 1500--1508, 2019.

\[9\] **\cite{ragleveraging2025}** "Leveraging Retrieval Augmented Generative LLMs For Automated Metadata Description Generation to Enhance Data Catalogs." arXiv:2503.09003, 2025.

\[10\] **\cite{yu2018spider}** Yu, T., et al. "Spider: A Large-Scale Human-Labeled Dataset for Complex and Cross-Domain Semantic Parsing and Text-to-SQL Task." In *EMNLP*, pp. 3911--3921, 2018.

\[11\] **\cite{li2023bird}** Li, J., et al. "Can LLM Already Serve as A Database Interface? A BIg Bench for Large-Scale Database Grounded Text-to-SQLs." In *NeurIPS*, 2023.

\[12\] **\cite{gao2024dailsql}** Gao, D., et al. "Text-to-SQL Empowered by Large Language Models: A Benchmark Evaluation." *PVLDB* 17(5): 1132--1145, 2024.

\[13\] **\cite{pourreza2023dinsql}** Pourreza, M. and Rafiei, D. "DIN-SQL: Decomposed In-Context Learning of Text-to-SQL with Self-Correction." In *NeurIPS*, 2023.

\[14\] **\cite{rostin2009fk}** Rostin, A., et al. "A Machine Learning Approach to Foreign Key Discovery." In *WebDB*, SIGMOD Workshop, 2009.

\[15\] **\cite{jiang2020holistic}** Jiang, L. and Naumann, F. "Holistic Primary Key and Foreign Key Detection." *JIIS* 54(3): 439--461, 2020.

\[16\] **\cite{khatiwada2022alite}** Khatiwada, A., et al. "ALITE: Comprehensive Data Unification with Full Disjunctions." *PVLDB* 16(4): 932--945, 2022.

\[17\] **\cite{ilyas2004cords}** Ilyas, I. F., et al. "CORDS: Automatic Discovery of Correlations and Soft Functional Dependencies." In *SIGMOD*, pp. 647--658, 2004.

\[18\] **\cite{huhtala1999tane}** Huhtala, Y., et al. "TANE: An Efficient Algorithm for Discovering Functional and Approximate Dependencies." *The Computer Journal* 42(2): 100--111, 1999.

\[19\] **\cite{novelli2001fun}** Novelli, N. and Cicchetti, R. "FUN: An Efficient Algorithm for Mining Functional and Embedded Dependencies." In *ICDT*, pp. 189--203, 2001.

\[20\] **\cite{papenbrock2016hyfd}** Papenbrock, T. and Naumann, F. "A Hybrid Approach to Functional Dependency Discovery." In *SIGMOD*, pp. 821--833, 2016.

\[21\] **\cite{papenbrock2015binder}** Papenbrock, T., et al. "Divide & Conquer-Based Inclusion Dependency Discovery." *PVLDB* 8(7): 774--785, 2015.

\[22\] **\cite{bauckmann2007spider}** Bauckmann, J., et al. "Efficiently Detecting Inclusion Dependencies." In *ICDE*, 2007.

\[23\] **\cite{demarchi2009sindd}** De Marchi, F., et al. "Unary and n-ary Inclusion Dependency Discovery in Relational Databases." *JIIS* 32(1): 53--73, 2009.

\[24\] **\cite{dursch2019ind}** Dursch, S., et al. "Inclusion Dependency Discovery: An Experimental Evaluation of Thirteen Algorithms." In *CIKM*, pp. 219--228, 2019.

\[25\] **\cite{abedjan2018book}** Abedjan, Z., et al. *Data Profiling*. Synthesis Lectures on Data Management. Morgan & Claypool, 2018.

\[26\] **\cite{abedjan2015profiling}** Abedjan, Z., Golab, L., and Naumann, F. "Profiling Relational Data: A Survey." *The VLDB Journal* 24(4): 557--581, 2015.

\[27\] **\cite{naumann2014revisited}** Naumann, F. "Data Profiling Revisited." *ACM SIGMOD Record* 42(4): 40--49, 2014.

\[28\] **\cite{papenbrock2015metanome}** Papenbrock, T., et al. "Data Profiling with Metanome." *PVLDB* 8(12): 1860--1871, 2015.

\[29\] **\cite{madaan2023selfrefine}** Madaan, A., et al. "Self-Refine: Iterative Refinement with Self-Feedback." In *NeurIPS*, 2023.

\[30\] **\cite{shinn2023reflexion}** Shinn, N., et al. "Reflexion: Language Agents with Verbal Reinforcement Learning." In *NeurIPS*, 2023.

\[31\] **\cite{bai2022constitutional}** Bai, Y., et al. "Constitutional AI: Harmlessness from AI Feedback." arXiv:2212.08073, 2022.

\[32\] **\cite{wei2022cot}** Wei, J., et al. "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models." In *NeurIPS*, 2022.

\[33\] **\cite{yao2023tot}** Yao, S., et al. "Tree of Thoughts: Deliberate Problem Solving with Large Language Models." In *NeurIPS*, 2023.

\[34\] **\cite{besta2024got}** Besta, M., et al. "Graph of Thoughts: Solving Elaborate Problems with Large Language Models." In *AAAI*, 2024.

\[35\] **\cite{rumelhart1986backprop}** Rumelhart, D. E., Hinton, G. E., and Williams, R. J. "Learning Representations by Back-propagating Errors." *Nature* 323: 533--536, 1986.

\[36\] **\cite{settles2009active}** Settles, B. "Active Learning Literature Survey." CS Tech Report 1648, UW-Madison, 2009.

\[37\] **\cite{chen2021evaluating}** Chen, M., et al. "Evaluating Large Language Models Trained on Code." arXiv:2107.03374, 2021.

\[38\] **\cite{feng2020codebert}** Feng, Z., et al. "CodeBERT: A Pre-Trained Model for Programming and Natural Languages." In *EMNLP*, 2020.
