# Research Paper Outline: DBAutoDoc

## Working Title

**"DBAutoDoc: Automated Discovery and Documentation of Undocumented Database Schemas via Statistical Analysis and Iterative LLM Refinement"**

Alternative titles:
- "Iterative Schema Comprehension: Propagation-Based Refinement for Automated Database Documentation Using Large Language Models"
- "From Schema to Semantics: Multi-Pass LLM Analysis with Graph-Aware Propagation for Legacy Database Understanding"

---

## Authors

**Amith Nagarajan** (corresponding author) — Creator of DBAutoDoc and the MemberJunction platform. Designed and implemented the system architecture, iterative refinement algorithm with context propagation, tiered key discovery pipeline, and ground truth anchoring mechanism.

**Thomas Altman** — Co-author. Contributed extensively to the conceptual framework and problem formulation through two years of collaborative research on automated database documentation and semantic analysis approaches.

---

## Abstract (~250 words)

- **Problem**: Millions of production databases lack documentation, declared keys, or relationship constraints. Understanding these schemas requires expensive manual analysis by domain experts.
- **Approach**: We present DBAutoDoc, a system that combines statistical analysis of data patterns with iterative LLM-based semantic analysis to automatically generate comprehensive database documentation. Inspired by backpropagation in neural network training, our system propagates semantic corrections through the schema dependency graph across multiple iterations until descriptions converge. A bidirectional feedback loop between statistical key discovery and LLM analysis allows each component to strengthen the other.
- **Key contributions**: (1) A novel iterative refinement algorithm inspired by backpropagation that propagates semantic context through schema dependency graphs, (2) a tiered statistical pipeline for primary key and foreign key discovery in keyless databases with LLM-based validation feedback, (3) a dual-layer human knowledge injection mechanism distinguishing immutable ground truth from contextual seed information, (4) convergence detection combining stability windows, confidence thresholds, and semantic change analysis.
- **Results**: Across N benchmark databases (including AdventureWorks, Pagila, Northwind, and M anonymized enterprise databases), DBAutoDoc discovered primary and foreign keys with P% precision and R% recall, generated semantically accurate descriptions for all tables and columns, and achieved convergence in N iterations — at a cost of approximately $1 per 100 tables in LLM inference, compared to an estimated 160-320 hours of skilled human labor per database.

---

## 1. Introduction (2-3 pages)

### 1.1 The Undocumented Database Problem
- Scale of the problem: most enterprise databases have partial or no documentation
- "Dark databases" — production systems with no declared keys, no comments, no ERD diagrams
- Cost of manual documentation: $12K-$48K per database for skilled analysts
- Technical debt accumulates: each year without documentation makes understanding harder
- Common in acquisitions, legacy system migrations, data warehouse consolidation

### 1.2 Why Existing Approaches Fall Short
- **Schema extraction tools** (SchemaSpy, dbdocs): Only surface declared metadata — useless for keyless databases
- **LLM-based one-shot analysis**: Single-pass description generation misses cross-table relationships and produces inconsistent documentation
- **Reverse engineering tools**: Focus on structure, not semantics — can't explain *what* a table does
- **Data profiling tools** (Great Expectations, dbt): Focus on data quality, not documentation

### 1.3 Our Insight: Schema Understanding as an Iterative Learning Problem
- Database schemas are graphs, not independent tables
- Understanding one table changes what you should say about related tables
- Loose analogy to neural network training: forward pass (initial analysis) → loss computation (sanity checks) → backward pass (re-analyze related tables with updated context) → convergence
- The analogy is structural, not mathematical — we propagate discrete semantic corrections, not continuous gradients — but the core insight is the same: iterative refinement of interconnected components converges to better solutions than single-pass analysis
- Human expert knowledge as "labeled training data" injected via ground truth

### 1.4 Contributions
1. **Iterative context propagation inspired by backpropagation** — a novel algorithm that propagates semantic corrections through schema dependency graphs across multiple iterations until convergence
2. **Tiered statistical key discovery with LLM feedback** — a multi-stage pipeline combining data type filtering, value pattern sampling, steep containment curves, and a bidirectional LLM validation loop where statistical discovery and semantic analysis strengthen each other
3. **Dual-layer human knowledge injection** — ground truth (immutable expert descriptions that anchor the system) and seed context (domain background that guides without constraining), with measurable influence propagation
4. **Convergence detection** — multi-criterion stability detection combining change tracking, confidence thresholds, and semantic comparison
5. **Cost analysis** — demonstrating 99.5%+ cost reduction vs. manual documentation

### 1.5 Open-Source Availability
- DBAutoDoc is released as open-source software — the system described in this paper is freely available for use, modification, and extension
- Our goal is to contribute a practical solution to the undocumented database problem, not to gatekeep it behind proprietary tooling
- All evaluation scripts, benchmark configurations, and prompt templates are included to enable reproducibility and extension by others

### 1.6 Paper Organization
- Brief roadmap of remaining sections

---

## 2. Related Work (2-3 pages)

### 2.1 Database Documentation and Schema Understanding
- Traditional schema documentation tools (SchemaSpy, ERAlchemy, dbdocs.io)
- Database reverse engineering literature
- Schema matching and integration research:
  - Rahm & Bernstein, "A Survey of Approaches to Automatic Schema Matching," VLDB Journal 10(4), 2001
  - Bellahsene, Bonifati & Rahm (eds.), *Schema Matching and Mapping*, Springer 2011
  - Koutras et al., "Valentine: Evaluating Matching Techniques for Dataset Discovery," ICDE 2021 — column matching evaluation framework, relevant to our FK discovery validation methodology
- LLM-based schema understanding:
  - Trummer, "Generating Succinct Descriptions of Database Schemata for Cost-Efficient Prompting of Large Language Models," PVLDB 17(11), 2024 — schema compression for LLM prompts, directly relevant to our context window management
  - Liu et al., "Magneto: Combining Small and Large Language Models for Schema Matching," PVLDB 18(8), 2025 — SLM+LLM schema matching, related to our multi-model future work
  - Seedat & van der Schaar, "Matchmaker: Self-Improving Large Language Model Programs for Schema Matching," NeurIPS 2024 — self-improving LLM programs with zero-shot synthetic demos
- Automated metadata generation:
  - "Leveraging Retrieval Augmented Generative LLMs For Automated Metadata Description Generation to Enhance Data Catalogs," arXiv:2503.09003, 2025 — RAG+LLM for catalog metadata; closest prior work to our description generation, but single-pass without iterative refinement
- Semantic column type detection:
  - Hulsebos et al., "Sherlock: A Deep Learning Approach to Semantic Data Type Detection," KDD 2019

### 2.2 LLMs for Code and Data Understanding
- Code documentation generation (Codex, CodeBERT)
- Text-to-SQL benchmarks and systems:
  - Yu et al., "Spider: A Large-Scale Human-Labeled Dataset for Complex and Cross-Domain Semantic Parsing and Text-to-SQL Task," EMNLP 2018
  - Li et al., "Can LLM Already Serve as A Database Interface? A BIg Bench for Large-Scale Database Grounded Text-to-SQLs," NeurIPS 2023 (BIRD benchmark)
- LLMs for data understanding:
  - DAIL-SQL: Gao et al., "Text-to-SQL Empowered by Large Language Models," PVLDB 17(5), 2024
  - DIN-SQL: Pourreza & Rafiei, "DIN-SQL: Decomposed In-Context Learning of Text-to-SQL," NeurIPS 2023
  - MAC-SQL: Wang et al., "MAC-SQL: A Multi-Agent Collaborative Framework for Text-to-SQL," 2024
- Schema linking in NL2SQL pipelines
- Narayan et al., "Can Foundation Models Wrangle Your Data?" PVLDB 16(4), 2022 — LLMs for data understanding tasks
- Limitations of prior work: single-pass, no iterative refinement, no key discovery

### 2.3 Foreign Key and Primary Key Discovery
- ML-based FK discovery:
  - Rostin et al., "A Machine Learning Approach to Foreign Key Discovery," WebDB 2009 (SIGMOD workshop) — ML classification of INDs as FK candidates; precursor to our hybrid statistical+LLM approach
  - Jiang & Naumann, "Holistic Primary Key and Foreign Key Detection," JIIS 54, 2020 — score-function approach extracting PKs/FKs from UCCs and INDs; directly comparable to our multi-factor confidence scoring
- Data lake integration:
  - Khatiwada et al., "Integrating Data Lake Tables" (ALITE), PVLDB 16(4), 2022 — joinable column discovery via containment
  - Ilyas et al., "CORDS: Automatic Discovery of Correlations and Soft Functional Dependencies," SIGMOD 2004 — correlation and soft FD discovery
- Constraint mining and functional dependency discovery:
  - TANE: Huhtala et al., "TANE: An Efficient Algorithm for Discovering Functional and Approximate Dependencies," Computer Journal 42(2), 1999
  - FUN: Novelli & Cicchetti, "FUN: An Efficient Algorithm for Mining Functional and Embedded Dependencies," ICDT 2001
  - HyFD: Papenbrock & Naumann, "A Hybrid Approach to Functional Dependency Discovery," SIGMOD 2016
- Inclusion dependency detection:
  - BINDER: Papenbrock et al., "Divide & Conquer-Based Inclusion Dependency Discovery," PVLDB 8(7), 2015
  - SPIDER: Bauckmann et al., "Efficiently Detecting Inclusion Dependencies," ICDE 2007
  - De Marchi, Lopes & Petit, "Unary and n-ary Inclusion Dependency Discovery in Relational Databases," JIIS 32(1), 2009 (S-INDD algorithm)
  - Dursch et al., "Inclusion Dependency Discovery: An Experimental Evaluation of Thirteen Algorithms," CIKM 2019 — comprehensive IND benchmark
- Data profiling platforms:
  - Papenbrock et al., "Data Profiling with Metanome," PVLDB 8(12), 2015 — standard platform for profiling algorithm benchmarking
  - Abedjan et al., "Profiling Relational Data: A Survey," VLDB Journal 24(4), 2015
  - Naumann, "Data Profiling Revisited," SIGMOD Record 42(4), 2014
- Our contribution: combining statistical discovery with LLM semantic validation in a bidirectional feedback loop

### 2.4 Iterative Refinement in NLP
- Self-refinement in LLMs:
  - Madaan et al., "Self-Refine: Iterative Refinement with Self-Feedback," NeurIPS 2023
  - Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning," NeurIPS 2023
- Constitutional AI and RLHF iteration (Bai et al., 2022)
- Chain-of-thought and structured reasoning:
  - Wei et al., "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models," NeurIPS 2022
  - Yao et al., "Tree of Thoughts: Deliberate Problem Solving with Large Language Models," NeurIPS 2023
  - Besta et al., "Graph of Thoughts: Solving Elaborate Problems with Large Language Models," AAAI 2024 — most directly related: models LLM reasoning as an arbitrary graph; our schema dependency graph propagation is a domain-specific instance of graph-structured LLM reasoning
- Our contribution: graph-structured refinement over a real-world dependency graph (not just linear self-correction or abstract reasoning graphs)

### 2.5 Human-in-the-Loop Machine Learning
- Active learning paradigms (Settles, "Active Learning Literature Survey," 2009)
- Interactive machine learning
- HILDA Workshop (Human-In-the-Loop Data Analytics), ACM SIGMOD, annual since 2016 — venue for human-in-the-loop data management research
- Our contribution: ground truth as immutable anchors in an iterative system, with measurable influence propagation to non-ground-truth tables

---

## 3. System Architecture (3-4 pages)

### 3.1 Overview
- Pipeline diagram: Introspection → Data Sampling → Key Discovery → LLM Analysis → Context Propagation → Convergence → Export
- Multi-phase design with token budgeting and guardrails
- Database-agnostic driver architecture (SQL Server, PostgreSQL, MySQL)

### 3.2 Database Introspection Layer
- Schema, table, and column metadata extraction
- Row count estimation and data type normalization
- Existing constraint and description harvesting
- Driver abstraction pattern (BaseAutoDocDriver → platform-specific implementations)
- Figure: driver architecture showing how each platform implements the same interface

### 3.3 Data Sampling and Statistics Engine
- Column-level statistics: cardinality, null distribution, value distribution
- Type-specific profiling: numeric ranges, date ranges, string length distributions
- Random sampling strategies (provider-specific: NEWID vs RANDOM vs RAND)
- Sample size considerations and statistical significance thresholds

### 3.4 LLM Integration Layer
- Provider-agnostic prompt engine (Gemini, OpenAI, Anthropic, Groq, etc.)
- Structured output parsing (JSON response format with schema enforcement)
- Token tracking (input/output separation) and cost estimation from configurable pricing
- Rate limiting and retry logic with exponential backoff
- Guardrails system: configurable limits on tokens, cost, and duration with warning thresholds

### 3.5 State Management and Resumability
- Persistent JSON state file capturing full analysis history per table, per iteration
- Incremental saves after each table analysis — crash-safe
- Run numbering and output organization
- Resume capability: pick up from any interruption point with full history preserved

### 3.6 Output Formats
- SQL scripts (extended properties for SQL Server, COMMENT ON for PostgreSQL/MySQL)
- Markdown documentation with table of contents and relationship diagrams
- HTML reports with navigation
- CSV exports for spreadsheet analysis
- Mermaid ERD diagrams auto-generated from discovered relationships

---

## 4. Key Discovery Pipeline (3-4 pages)

### 4.1 Problem Formulation
- Many production databases lack declared PRIMARY KEY and FOREIGN KEY constraints
- Goal: statistically infer likely keys from data patterns alone
- Precision vs. recall tradeoff: false positives waste LLM tokens, false negatives miss relationships

### 4.2 Primary Key Detection

#### 4.2.1 Candidate Generation
- Column naming patterns (regex: `.*[Ii][Dd]$`, `^[Pp][Kk]_.*`)
- Uniqueness analysis: columns with uniqueness ratio = 1.0
- Composite key detection via column combination uniqueness testing

#### 4.2.2 Hard Rejection Filters
- **Null rejection**: Any column with NULL values cannot be a primary key (definitional)
- **Blank/zero rejection**: Columns containing empty strings or zero values are excluded
- **Blacklist patterns**: Known non-PK names (qty, price, description, created_date, is_active, etc.)
- **Rationale**: Primary keys are definitionally non-nullable and unique — these are cheap, zero-false-negative filters

#### 4.2.3 Confidence Scoring
- Multi-factor score: uniqueness (50%), naming pattern (20%), data type (15%), data pattern (15%)
- Surrogate key boost: +20 points for `id`, `table_id` patterns with >95% uniqueness
- FK-pattern penalty: reduce confidence for columns that look more like foreign keys
- Composite vs. single-column confidence adjustment
- Threshold-based candidacy (default: 70%)

### 4.3 Foreign Key Detection

#### 4.3.1 Tiered Pre-Filtering (Novel Contribution)
- **Motivation**: Cross-table containment checks are O(n^2) across columns — pre-filtering is essential
- **Tier 1 — Data Type Exclusion** (zero cost):
  - Skip dates, booleans, floats, money, binary, XML, geography
  - Rationale: these types are virtually never foreign keys
- **Tier 2 — Value Pattern Sampling** (cheap — samples 10 values):
  - For string columns, sample values and check if they "look like" keys
  - Reject if majority are: emails (@-containing), URLs, >100 chars, 3+ word phrases
  - Rationale: email addresses in `CreatedBy` columns cause massive false positives without this filter
  - Keep if values look like: UUIDs, numeric strings, short codes

#### 4.3.2 Value Containment Analysis
- **Definition**: For column B in Table B to be an FK referencing column A in Table A, values in B must be a subset of values in A
- **Steep containment curve** (novel contribution):
  - Replaces linear overlap scoring with a step function
  - <90% containment -> 0 credit (not an FK)
  - 90-95% -> 10% credit
  - 95-98% -> 30% credit
  - 98-99.5% -> 50% credit
  - 99.5-99.99% -> 80% credit
  - 100% -> full credit
  - **Rationale**: Orphan records exist in real databases, but wild divergence definitively rules out FK relationships. The steep curve prevents high-containment-but-coincidental matches (e.g., same 10K email addresses across tables).

#### 4.3.3 Multi-Factor Confidence Scoring
- Value containment: 55% weight (70% when no PKs detected — redistributes PK bonus)
- Target is detected PK: 15% bonus (only when PKs exist)
- ID-in-name: 10% bonus for columns containing "ID" (common naming convention)
- Naming pattern match: 10% (source column name relates to target table name)
- Cardinality ratio: 10% (many-to-one pattern expected for FKs)
- Null handling: 5% (FKs commonly allow nulls)

#### 4.3.4 Bidirectional LLM Validation (Novel Contribution)
- **Statistical → LLM**: All candidates above the statistical threshold undergo LLM review
  - Sanity checker: batch review of candidates in context of table schema
  - Per-table validator: detailed review with column descriptions and sample data
  - LLM can reject false positives that passed statistical tests
- **LLM → Statistical**: During table description analysis, the LLM returns structured `foreignKeys` suggestions in its JSON response
  - These are FK relationships the LLM infers from column names, descriptions, and sample data that statistics alone may have missed
  - Suggestions are fed back into the discovery pipeline as new candidates with LLM-sourced confidence scores
  - Candidates still undergo statistical validation (containment checks) before acceptance
- **Bidirectional benefit**: Statistics prune the search space for LLM validation; LLM semantic understanding discovers relationships statistics can't detect. Each component makes the other more effective.

### 4.4 Adaptive Weight Redistribution
- Problem: databases without declared PKs unfairly penalize FK candidates (lose 15% PK bonus)
- Solution: redistribute PK bonus weight to value containment when no PKs are detected
- This makes the algorithm fair for "keyless" databases while still rewarding PK presence when available

---

## 5. Iterative Refinement via Context Propagation (3-4 pages) — Core Contribution

### 5.1 Motivation and Analogy
- Neural network training: adjust weights by propagating error gradients backward through layers
- Schema documentation: adjust descriptions by propagating semantic corrections through table relationships across iterations
- **The analogy is structural, not mathematical**: both systems iteratively refine interconnected components until convergence, both process in a defined order (forward pass), both use error signals to trigger correction (loss/sanity checks), both propagate corrections through a dependency structure (layers/FK graph). The key difference is that our system propagates discrete semantic updates rather than continuous gradient values.
- This analogy is useful because the broad understanding of neural network training makes the approach immediately intuitive to a wide audience

### 5.2 The Schema Dependency Graph
- Nodes = tables, edges = foreign key relationships (declared + discovered)
- Edge direction: FK source -> FK target (dependency direction)
- Topological ordering for processing: leaf tables first, then tables that reference them
- Dependency levels: tables grouped by their maximum depth from leaf nodes
- Cross-schema edges create inter-schema dependencies

### 5.3 Forward Pass: Initial Description Generation
- Process tables in dependency order (leaves -> roots), level by level
- Each table analyzed with context: column statistics, sample values, descriptions of related tables already analyzed, seed context, ground truth constraints
- LLM generates: table description, column descriptions, confidence scores, warnings, and structured FK suggestions (see Section 4.3.4)
- Structured JSON output parsed and validated

### 5.4 Loss Computation: Sanity Checks
- **Dependency-level sanity checks**: After each level, do FK relationships make semantic sense given the descriptions of tables at that level?
- **Schema-level sanity checks**: After all iterations, are descriptions within each schema internally consistent?
- **Cross-schema sanity checks**: Do cross-schema relationships have coherent descriptions across schema boundaries?
- Sanity check failures = "loss signal" indicating description error, triggering re-analysis

### 5.5 Context Propagation (Backward Pass)
- During analysis, child tables generate `parentTableInsights` — structured observations about what the child's data reveals about its parent tables
- Example: analyzing an `OrderItems` table may reveal that the parent `Orders` table tracks payment states, not just order placement
- After each dependency level, accumulated insights are propagated to parent tables via the BackpropagationEngine
- Parent tables are re-analyzed with combined insights from all their children
- If a parent's description materially changes, this is recorded and influences subsequent iterations
- **Multi-iteration cascading**: Changes propagate naturally across the iteration loop — Iteration 1 propagates A->B, Iteration 2 propagates B->C. Deep dependency chains converge over multiple iterations rather than requiring recursive propagation within a single pass.
- **Ground truth protection**: Tables with user-approved ground truth descriptions are never revised by propagation

### 5.6 Convergence Detection
- **Multi-criterion approach**: Convergence is declared when multiple independent signals agree
- **Stability window**: Track whether any descriptions changed across the last N iterations (configurable window size). If no changes occur within the window, the system has stabilized.
- **Confidence threshold**: All tables must meet a minimum confidence score (default: 0.7). Low-confidence tables indicate the LLM is uncertain and more iteration may help.
- **Semantic comparison**: LLM-based comparison detects whether changes between iterations are *material* (meaning shift) vs. *cosmetic* (rewording). Only material changes reset the stability window.
- **Convergence requirement**: At least 2 of 3 criteria must be met, with a minimum of 2 iterations completed
- **Max iterations**: Hard stop to prevent runaway analysis (configurable, default: 10)
- **Analogy**: Similar to early stopping in neural network training — stop when improvement plateaus

### 5.7 Ground Truth and Seed Context: Dual-Layer Human Knowledge Injection

#### 5.7.1 Ground Truth (Immutable Anchors)
- Ground truth entries are authoritative human-provided descriptions for specific tables and columns
- **Immutable**: Never overwritten by LLM analysis across any iteration
- **Propagated**: Ground truth descriptions are included in the context when analyzing neighboring tables, improving their descriptions
- **Measurable influence**: The system tracks which non-ground-truth descriptions were influenced by ground truth neighbors (via backpropagation or context inclusion), enabling ablation studies on how expert knowledge on a few key tables propagates quality improvements broadly
- Analogous to labeled training data in supervised learning

#### 5.7.2 Seed Context (Domain Guidance)
- Seed context provides high-level business information: overall database purpose, business domains, industry context, custom analysis instructions
- **Guides but does not constrain**: Seed context is injected into every LLM prompt as background information, but the LLM is free to generate descriptions that differ from or extend the seed
- **Not immutable**: Seed context is advisory, not authoritative
- Analogous to a pre-trained model's prior knowledge — it biases the analysis toward the correct domain without dictating specific outputs

#### 5.7.3 Interaction Between Ground Truth and Seed Context
- Ground truth and seed context work together: seed context provides the "big picture" while ground truth provides verified specifics
- In practice: seed context tells the system "this is a healthcare claims database" while ground truth says "table X.ClaimHeader stores primary insurance claim records with one row per claim submission"
- The combination significantly reduces the number of iterations needed for convergence (evaluated in Section 7.3.3)

### 5.8 Formal Algorithm

```
Algorithm: Iterative Schema Documentation with Context Propagation

Input: Schema S = (Tables T, Columns C, Relationships R), Ground Truth G, Seed Context SC, Config K
Output: Documentation D mapping each table/column to a description

1. INTROSPECT: Extract T, C from database catalog
2. SAMPLE: Collect statistics and sample values for each column
3. DISCOVER KEYS: Run PK/FK detection pipeline -> augment R
4. APPLY GROUND TRUTH: For each (table, desc) in G, set D[table] = desc, mark as immutable
5. ORDER: Topologically sort T using R into dependency levels L_0..L_n
6. FOR iteration i = 1 to K.maxIterations:
     a. FORWARD PASS: For each level l in L_0..L_n:
        - For each table t at level l:
          - If D[t] is immutable (ground truth), skip
          - context = {statistics(t), samples(t), D[related(t)], SC, G[neighbors(t)]}
          - D'[t], insights[t] = LLM_ANALYZE(t, context)
        - SANITY CHECK level l:
          - If relationships at level l are semantically inconsistent, mark for re-analysis
        - PROPAGATE: For each insight targeting parent table p:
          - If D[p] is not immutable:
            - D'[p] = LLM_REVISE(p, current=D[p], insights=combined_insights(p))
     b. CONVERGENCE CHECK:
        - material_changes = |{t : D'[t] materially differs from D[t]}|
        - confidence_met = all tables above K.confidenceThreshold
        - stable = material_changes == 0 for K.stabilityWindow consecutive iterations
        - If (stable AND confidence_met) AND i >= 2:
          - RETURN D'
     c. D = D'
7. SCHEMA SANITY CHECKS: Per-schema and cross-schema consistency validation
8. RETURN D (max iterations reached)
```

---

## 6. Implementation (2-3 pages)

### 6.1 Technology Stack
- TypeScript/Node.js implementation
- Database drivers: mssql, pg, mysql2
- LLM providers: Google Gemini, OpenAI, Anthropic, Groq, Mistral, etc.
- CLI interface via oclif framework
- Also available as programmatic API

### 6.2 Prompt Engineering
- Structured prompts with JSON schema enforcement
- Context window management: include related table descriptions, column statistics, sample values
- Temperature control: low temperature (0.1) for consistent, factual descriptions
- Effort level configuration for models that support it
- Key prompt types: table-analysis, backpropagation, sanity-check (dependency/schema/cross-schema), semantic-comparison

### 6.3 Token Budget Management
- Global token budget with per-phase allocation
- Discovery phase gets configurable ratio (default: 25%)
- Guardrails: max tokens, max duration, max cost with configurable thresholds
- Warning system at configurable percentages of limits

### 6.4 Output Formats
- SQL scripts (extended properties for SQL Server, COMMENT ON for PostgreSQL)
- Markdown documentation with table of contents
- HTML reports with navigation
- CSV exports for spreadsheet analysis
- Mermaid ERD diagrams

### 6.5 Scalability Considerations
- Incremental state saves after each table
- Resumable from any interruption point
- Connection pooling for parallel database queries
- Rate limiting for LLM API calls

---

## 7. Evaluation (4-5 pages)

### 7.1 Experimental Setup

#### 7.1.1 Datasets
- **AdventureWorks** (SQL Server): 70+ tables, well-documented with declared keys, multiple schemas — keys stripped for FK/PK discovery evaluation
- **Pagila** (PostgreSQL): PostgreSQL port of Sakila, 15 tables, clean relational schema — tests cross-platform driver support
- **Northwind** (SQL Server/PostgreSQL): Classic 13-table database, simple relationships, well-understood domain
- **Chinook** (cross-platform): Music store domain, 11 tables, clean FK relationships
- **Database A** (anonymized enterprise): 125 tables, 10 schemas, 1,500+ columns, zero declared constraints — real-world stress test
- **Databases B-N** (anonymized enterprise, varying): Additional enterprise databases of varying size (20-500 tables), domains, and constraint coverage — provided under NDA with anonymized results

**Methodology for benchmark databases**: For each database with declared keys, we create a copy with all PK/FK constraints stripped, run DBAutoDoc, and measure discovered keys against the original declarations as ground truth.

#### 7.1.2 Baselines
- **Single-pass LLM**: One-shot table description without iteration or backpropagation
- **No-discovery baseline**: Use only declared keys (empty for keyless databases)
- **Human expert**: Professional DBA documentation (for cost and quality comparison)
- **Existing tools**: SchemaSpy, dbdocs output quality comparison

#### 7.1.3 Metrics
- **Description quality**: Human evaluation on 1-5 scale (accuracy, completeness, usefulness)
- **Key discovery precision/recall/F1**: Against known ground truth keys
- **Convergence speed**: Iterations to stability
- **Token efficiency**: Tokens per table, input/output ratio
- **Cost**: Dollar cost vs. estimated human labor cost
- **Backpropagation impact**: Description quality with vs. without iterative propagation
- **Ground truth influence radius**: How many non-GT tables are improved by GT on N tables

### 7.2 Key Discovery Results

#### 7.2.1 Primary Key Detection
- Precision and recall on databases with known PKs
- Impact of hard rejection filters (null/blank/zero)
- Blacklist pattern effectiveness
- False positive analysis: what types of columns are incorrectly identified?

#### 7.2.2 Foreign Key Detection
- Precision and recall at different confidence thresholds
- **Tiered pre-filter effectiveness**:
  - How many candidates are eliminated at each tier?
  - Token savings from not running LLM validation on filtered candidates
  - False positive reduction (e.g., CreatedBy email columns)
- **Containment curve analysis**:
  - Comparison of linear vs. steep curve scoring
  - Precision/recall at different curve parameters
- **Bidirectional LLM feedback impact**:
  - How many FKs were discovered by LLM that statistics missed?
  - How often does LLM reject statistical false positives?
  - Net precision/recall improvement from the bidirectional loop

### 7.3 Iterative Refinement Results

#### 7.3.1 Convergence Analysis
- Convergence curves: % of descriptions materially changing per iteration (exported from per-iteration state data)
- Typical convergence speed across different database sizes and densities
- Diminishing returns analysis: quality improvement per additional iteration

#### 7.3.2 Context Propagation Ablation Study
- **With propagation** vs. **without propagation** (independent table analysis, single-pass)
- Measure: cross-table consistency, relationship accuracy, description coherence
- Hypothesis: propagation significantly improves descriptions of tables in dense relationship clusters

#### 7.3.3 Ground Truth and Seed Context Impact
- **Baseline**: Pure LLM analysis (no ground truth, no seed context)
- **Seed context only**: Domain guidance without specific table anchors
- **Ground truth at varying coverage**: Inject ground truth for 10%, 25%, 50% of tables
- **Both combined**: Ground truth + seed context
- Measure: description quality improvement on *non-ground-truth* tables
- Measure: number of iterations to convergence under each condition
- Hypothesis: ground truth on a few key hub tables propagates quality improvements broadly; seed context reduces iterations needed

### 7.4 Cost Analysis
- Token usage breakdown by phase (introspection, discovery, analysis, propagation, sanity checks)
- Input vs. output token ratio and cost implications
- Comparison with estimated human labor costs
- Cost per table as a function of database size
- Model comparison: Gemini Flash vs. GPT-4o-mini vs. Claude Haiku (cost/quality tradeoff)

### 7.5 Case Studies (Anonymized)
- Detailed walkthrough of an anonymized real-world analysis
- Schema optimization discoveries (e.g., oversized column types, missing indexes)
- FK relationships discovered that were unknown to the original developers
- Before/after comparison of database understanding
- Time from "zero knowledge" to "comprehensive documentation"
- **Note**: All table names, column names, schema names, and domain-specific details are anonymized. Industry and client identity are not disclosed.

---

## 8. Discussion (2-3 pages)

### 8.1 When Does Context Propagation Help Most?
- Dense relationship graphs benefit more than sparse ones
- Schemas with consistent naming conventions see faster convergence
- Databases with some declared constraints bootstrap faster than fully keyless ones
- Hub tables (many FK references) benefit most from propagated context

### 8.2 The Backpropagation Analogy: Scope and Limits
- The analogy to neural network backpropagation is deliberately loose — it describes the high-level pattern (iterative refinement of interconnected components via error-driven correction), not the mathematical mechanism
- Key structural parallels: forward pass processing order, loss-driven correction, propagation through a dependency graph, convergence via iteration
- Key differences: discrete semantic updates vs. continuous gradients, LLM-based revision vs. gradient computation, graph structure from FK relationships vs. layer structure from network architecture
- The analogy is valuable because it makes the approach immediately intuitive to the ML-literate audience and frames schema documentation as a learning problem rather than a one-shot extraction task

### 8.3 Limitations
- LLM hallucination risk: descriptions may be plausible but wrong
- Statistical FK detection can miss unconventional key patterns (e.g., composite string keys)
- Token cost scales with database size (though remains far cheaper than human analysis)
- Quality depends on data — empty or near-empty tables produce poor descriptions
- Language/locale issues: non-English column names reduce LLM effectiveness

### 8.4 Threats to Validity
- Human quality assessment subjectivity
- Ground truth availability for benchmarking (mitigated by using well-known databases with declared keys)
- LLM model version sensitivity (results may vary across model versions)

### 8.5 Ethical Considerations
- Data privacy: sample values sent to LLM APIs may contain sensitive information
- Mitigation: configurable sample sizes, local LLM support planned
- Generated documentation should be reviewed by humans before being treated as authoritative

### 8.6 Broader Implications
- Reducing the "documentation debt" crisis in enterprise software
- Enabling data democratization: non-technical users can understand databases
- Foundation for downstream tasks: better NL2SQL, data lineage, schema evolution tracking
- Pattern applicable beyond databases: API documentation, codebase documentation

---

## 9. Future Work (1-2 pages)

### 9.1 Multi-Model Ensemble
- Use cheap models (Flash) for initial passes, expensive models (Pro/Opus) for final refinement
- Confidence-based model selection: low-confidence descriptions get re-analyzed with stronger models

### 9.2 Active Learning for Ground Truth Selection
- Automatically identify which tables would benefit most from human ground truth
- Uncertainty sampling: prioritize tables with lowest confidence or most sanity check failures
- Expected impact estimation: which ground truth additions would propagate the most improvement?

### 9.3 Cross-Database Analysis
- Analyze multiple databases simultaneously to discover cross-database relationships
- Identify shared reference data, data lineage across systems
- Enterprise-scale schema mapping

### 9.4 Incremental Analysis
- Detect schema changes (new tables, altered columns) and re-analyze only affected portions
- Integrate with CI/CD pipelines for continuous documentation

### 9.5 Local/Private LLM Support
- Support for local models (Llama, Mistral) for sensitive data
- Hybrid approach: local model for data-touching analysis, cloud model for semantic refinement

### 9.6 Integration with Existing Ecosystems
- Export to dbt documentation format
- Integration with data catalogs (Alation, Collibra, DataHub)
- CodeGen integration for type-safe data access layer generation

---

## 10. Conclusion (1 page)

- Restate the problem and our approach
- Summarize key results: quality, cost, speed across multiple benchmark databases
- Emphasize the iterative refinement insight: treating schema documentation as an iterative learning problem produces significantly better results than single-pass analysis
- The bidirectional statistical+LLM approach to key discovery outperforms either component alone
- The 99.5% cost reduction makes comprehensive database documentation economically viable for every organization — not just those with budgets for expensive tooling or consultants
- **Open-source commitment**: DBAutoDoc is released as open-source software with no licensing fees. The goal is not to create a proprietary advantage but to contribute a practical, working solution to a problem that affects millions of databases worldwide. By making the tool freely available and publishing the methodology, we aim to lower the barrier to database understanding for organizations of all sizes — from solo developers inheriting undocumented systems to enterprises consolidating decades of technical debt. We hope others will build on this work.

---

## References (~40-60 citations)

### Verified Citations (organized by category)

**Schema Matching and Integration:**
1. Rahm & Bernstein, "A Survey of Approaches to Automatic Schema Matching," VLDB Journal 10(4): 334-350, 2001
2. Bellahsene, Bonifati & Rahm (eds.), *Schema Matching and Mapping*, Springer, 2011
3. Koutras et al., "Valentine: Evaluating Matching Techniques for Dataset Discovery," ICDE 2021, pp. 468-479
4. Liu et al., "Magneto: Combining Small and Large Language Models for Schema Matching," PVLDB 18(8): 2681-2694, 2025
5. Seedat & van der Schaar, "Matchmaker: Self-Improving Large Language Model Programs for Schema Matching," NeurIPS 2024

**LLMs for Database/Schema Understanding:**
6. Trummer, "Generating Succinct Descriptions of Database Schemata for Cost-Efficient Prompting of Large Language Models," PVLDB 17(11), 2024
7. Narayan et al., "Can Foundation Models Wrangle Your Data?" PVLDB 16(4): 738-746, 2022
8. Hulsebos et al., "Sherlock: A Deep Learning Approach to Semantic Data Type Detection," KDD 2019
9. "Leveraging RAG LLMs For Automated Metadata Description Generation to Enhance Data Catalogs," arXiv:2503.09003, 2025

**Text-to-SQL Benchmarks:**
10. Yu et al., "Spider: A Large-Scale Human-Labeled Dataset for Complex and Cross-Domain Semantic Parsing and Text-to-SQL Task," EMNLP 2018
11. Li et al., "Can LLM Already Serve as A Database Interface? A BIg Bench for Large-Scale Database Grounded Text-to-SQLs" (BIRD), NeurIPS 2023
12. Gao et al., "Text-to-SQL Empowered by Large Language Models" (DAIL-SQL), PVLDB 17(5): 1132-1145, 2024
13. Pourreza & Rafiei, "DIN-SQL: Decomposed In-Context Learning of Text-to-SQL," NeurIPS 2023

**Foreign Key and Primary Key Discovery:**
14. Rostin et al., "A Machine Learning Approach to Foreign Key Discovery," WebDB 2009 (SIGMOD workshop)
15. Jiang & Naumann, "Holistic Primary Key and Foreign Key Detection," JIIS 54: 439-461, 2020
16. Khatiwada et al., "Integrating Data Lake Tables" (ALITE), PVLDB 16(4): 932-945, 2022
17. Ilyas et al., "CORDS: Automatic Discovery of Correlations and Soft Functional Dependencies," SIGMOD 2004, pp. 647-658

**Functional Dependency Discovery:**
18. Huhtala et al., "TANE: An Efficient Algorithm for Discovering Functional and Approximate Dependencies," Computer Journal 42(2): 100-111, 1999
19. Novelli & Cicchetti, "FUN: An Efficient Algorithm for Mining Functional and Embedded Dependencies," ICDT 2001, pp. 189-203
20. Papenbrock & Naumann, "A Hybrid Approach to Functional Dependency Discovery" (HyFD), SIGMOD 2016, pp. 821-833

**Inclusion Dependency Discovery:**
21. Papenbrock et al., "Divide & Conquer-Based Inclusion Dependency Discovery" (BINDER), PVLDB 8(7): 774-785, 2015
22. Bauckmann et al., "Efficiently Detecting Inclusion Dependencies" (SPIDER), ICDE 2007
23. De Marchi, Lopes & Petit, "Unary and n-ary Inclusion Dependency Discovery in Relational Databases" (S-INDD), JIIS 32(1): 53-73, 2009
24. Dursch et al., "Inclusion Dependency Discovery: An Experimental Evaluation of Thirteen Algorithms," CIKM 2019, pp. 219-228

**Data Profiling:**
25. Abedjan, Golab, Naumann & Papenbrock, *Data Profiling*, Synthesis Lectures on Data Management, Morgan & Claypool, 2018
26. Abedjan, Golab & Naumann, "Profiling Relational Data: A Survey," VLDB Journal 24(4): 557-581, 2015
27. Naumann, "Data Profiling Revisited," SIGMOD Record 42(4): 40-49, 2014
28. Papenbrock et al., "Data Profiling with Metanome," PVLDB 8(12): 1860-1871, 2015

**LLM Self-Refinement and Iterative Reasoning:**
29. Madaan et al., "Self-Refine: Iterative Refinement with Self-Feedback," NeurIPS 2023
30. Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning," NeurIPS 2023
31. Bai et al., "Constitutional AI: Harmlessness from AI Feedback," arXiv:2212.08073, 2022
32. Wei et al., "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models," NeurIPS 2022
33. Yao et al., "Tree of Thoughts: Deliberate Problem Solving with Large Language Models," NeurIPS 2023
34. Besta et al., "Graph of Thoughts: Solving Elaborate Problems with Large Language Models," AAAI 2024

**Neural Network Training (Analogy Source):**
35. Rumelhart, Hinton & Williams, "Learning Representations by Back-propagating Errors," Nature 323: 533-536, 1986

**Human-in-the-Loop:**
36. Settles, "Active Learning Literature Survey," University of Wisconsin-Madison TR 1648, 2009
37. HILDA Workshop (Human-In-the-Loop Data Analytics), ACM SIGMOD, annual since 2016

### Additional categories to fill during writing:
- Database documentation tools and practices (industry reports, grey literature)
- Data catalog and metadata management (Alation, Collibra, DataHub literature)

---

## Appendices

### A. Prompt Templates
- Table description prompt structure (including structured FK output format)
- Semantic comparison prompt
- Sanity check prompts (dependency-level, schema-level, cross-schema)
- Backpropagation revision prompt

### B. Configuration Reference
- Full JSON configuration schema with descriptions
- Default values and tuning guidelines

### C. Detailed Benchmark Results
- Complete FK/PK discovery precision/recall for each benchmark database
- Sample generated descriptions (before/after iteration)
- Convergence curves per database
- Anonymized enterprise database results

### D. Reproducibility
- System requirements and setup instructions
- Command-line usage for reproducing experiments on public benchmark databases
- Links to open-source repository

---

## Target Venues

### Primary Targets (Industry/Applied Systems)
- **VLDB Industrial Track** (Proceedings of the VLDB Endowment) — strongest fit: real-world system with practical cost/quality evaluation, novel combination of statistical + LLM approaches
- **SIGMOD Industrial Track** — flagship database conference, values practical system contributions
- **CIDR** (Conference on Innovative Data Systems Research) — ideal for the vision/approach framing, accepts shorter papers

### Secondary Targets
- **ICDE** (IEEE International Conference on Data Engineering) — strong data engineering venue
- **DEEM Workshop** (Data Management for End-to-End ML) at SIGMOD — good fit for the ML analogy framing

### Journals (Extended Version)
- **PVLDB** (Proceedings of the VLDB Endowment) — journal-style track of VLDB
- **IEEE TKDE** (Transactions on Knowledge and Data Engineering)

### Not Recommended
- ~~EMNLP/ACL~~ — these venues expect deeper NLP/LLM analysis (prompt sensitivity, model internals) that isn't the focus of this work
- ~~NeurIPS~~ — the backpropagation analogy is inspirational, not a new ML method

---

## Estimated Length
- **Conference paper**: 12-14 pages (VLDB/SIGMOD format)
- **Journal paper**: 20-25 pages (extended version with full evaluation)

## Writing Timeline (Suggested)
1. **Weeks 1-2**: Run full evaluation experiments on benchmark databases (AdventureWorks, Pagila, Northwind, Chinook + enterprise databases)
2. **Weeks 3-4**: Write Sections 3-5 (architecture, key discovery, iterative refinement)
3. **Weeks 5-6**: Write Section 7 (evaluation) with results
4. **Weeks 7-8**: Write Sections 1-2, 8-10 (intro, related work, discussion, conclusion)
5. **Weeks 9-10**: Internal review, revision, polish
6. **Week 11**: Submit
