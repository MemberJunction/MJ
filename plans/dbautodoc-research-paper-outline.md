# Research Paper Outline: DBAutoDoc

## Working Title

**"Iterative Schema Comprehension: A Backpropagation-Inspired Approach to Automated Database Documentation Using Large Language Models"**

Alternative titles:
- "From Schema to Semantics: Multi-Pass LLM Analysis with Graph-Aware Backpropagation for Legacy Database Understanding"
- "DBAutoDoc: Automated Discovery and Documentation of Undocumented Database Schemas via Statistical Analysis and Iterative LLM Refinement"

---

## Authors

**Amith Nagarajan** (corresponding author) — Creator of DBAutoDoc and the MemberJunction platform. Designed and implemented the system architecture, backpropagation-inspired iterative refinement algorithm, tiered key discovery pipeline, and ground truth anchoring mechanism.

**Thomas Altman** — Co-author. Contributed extensively to the conceptual framework and problem formulation through two years of collaborative research on automated database documentation and semantic analysis approaches.

---

## Abstract (~250 words)

- **Problem**: Millions of production databases lack documentation, declared keys, or relationship constraints. Understanding these schemas requires expensive manual analysis by domain experts.
- **Approach**: We present DBAutoDoc, a system that combines statistical analysis of data patterns with iterative LLM-based semantic analysis to automatically generate comprehensive database documentation. Inspired by backpropagation in neural network training, our system propagates semantic corrections through the schema dependency graph across multiple iterations until descriptions converge.
- **Key contributions**: (1) A novel backpropagation-inspired iterative refinement algorithm for schema documentation, (2) a tiered statistical pipeline for primary key and foreign key discovery in keyless databases, (3) a human-in-the-loop ground truth mechanism that anchors LLM analysis with expert knowledge, (4) convergence detection adapted from training dynamics.
- **Results**: On a real-world 125-table enterprise database with zero declared constraints, DBAutoDoc discovered 250 primary keys and 111 foreign keys with high precision, generated semantically accurate descriptions for all tables and 1,500+ columns, and achieved convergence in N iterations — at a cost of approximately $1 in LLM inference, compared to an estimated 160-320 hours of skilled human labor.

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
- Analogy to neural network training: forward pass (initial analysis) → loss computation (sanity checks) → backward pass (re-analyze related tables) → convergence
- Human expert knowledge as "labeled training data" injected via ground truth

### 1.4 Contributions
1. **Backpropagation-inspired iterative refinement** — a novel algorithm that propagates semantic corrections through schema dependency graphs
2. **Tiered statistical key discovery** — a multi-stage pipeline combining data type filtering, value pattern sampling, and steep containment curves for FK detection
3. **Ground truth anchoring** — a mechanism for injecting authoritative human knowledge that is never overwritten and improves surrounding analysis
4. **Convergence detection** — stability-window-based convergence adapted from training dynamics
5. **Cost analysis** — demonstrating 99.5%+ cost reduction vs. manual documentation

### 1.5 Paper Organization
- Brief roadmap of remaining sections

---

## 2. Related Work (2-3 pages)

### 2.1 Database Documentation and Schema Understanding
- Traditional schema documentation tools (SchemaSpy, ERAlchemy, dbdocs.io)
- Database reverse engineering literature
- Schema matching and integration research (Rahm & Bernstein 2001, Bellahsene et al. 2011)

### 2.2 LLMs for Code and Data Understanding
- Code documentation generation (Codex, CodeBERT)
- Text-to-SQL (Spider, BIRD benchmarks)
- LLMs for data understanding (DAIL-SQL, DIN-SQL, MAC-SQL)
- Schema linking in NL2SQL pipelines
- Limitations: single-pass, no iterative refinement, no key discovery

### 2.3 Foreign Key and Primary Key Discovery
- CORDS (Zhang et al. 2023) — statistical FK discovery
- Constraint mining and functional dependency discovery (TANE, FUN, HyFD)
- Inclusion dependency detection (BINDER, SPIDER, S-INDD)
- Our contribution: combining statistical discovery with LLM validation

### 2.4 Iterative Refinement in NLP
- Self-refinement in LLMs (Madaan et al. 2023)
- Constitutional AI and RLHF iteration
- Chain-of-thought refinement
- Our contribution: graph-structured refinement (not just linear self-correction)

### 2.5 Human-in-the-Loop Machine Learning
- Active learning paradigms
- Interactive machine learning
- Our contribution: ground truth as immutable anchors in an iterative system

---

## 3. System Architecture (3-4 pages)

### 3.1 Overview
- Pipeline diagram: Introspection → Data Sampling → Key Discovery → LLM Analysis → Backpropagation → Convergence → Export
- Multi-phase design with token budgeting and guardrails
- Database-agnostic driver architecture (SQL Server, PostgreSQL, MySQL)

### 3.2 Database Introspection Layer
- Schema, table, and column metadata extraction
- Row count estimation and data type normalization
- Existing constraint and description harvesting
- Driver abstraction pattern (BaseAutoDocDriver → platform-specific implementations)

### 3.3 Data Sampling and Statistics Engine
- Column-level statistics: cardinality, null distribution, value distribution
- Type-specific profiling: numeric ranges, date ranges, string length distributions
- Random sampling strategies (provider-specific: NEWID vs RANDOM vs RAND)
- Sample size considerations and statistical significance thresholds

### 3.4 LLM Integration Layer
- Provider-agnostic prompt engine (Gemini, OpenAI, Anthropic, Groq, etc.)
- Structured output parsing (JSON response format)
- Token tracking (input/output separation)
- Cost estimation from configurable pricing
- Rate limiting and retry logic with exponential backoff

### 3.5 State Management and Resumability
- Persistent JSON state file capturing full analysis history
- Incremental saves after each table analysis
- Run numbering and output organization
- Resume capability: pick up from any interruption point

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
- **Rationale**: Primary keys are definitionally non-nullable and unique — these are cheap, zero-false-negative filters

#### 4.2.3 Confidence Scoring
- Multi-factor score: uniqueness (weight), naming pattern match, data type compatibility, null count
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
  - <90% containment → 0 credit (not an FK)
  - 90-95% → 10% credit
  - 95-98% → 30% credit
  - 98-99.5% → 50% credit
  - 99.5-99.99% → 80% credit
  - 100% → full credit
  - **Rationale**: Orphan records exist in real databases, but wild divergence definitively rules out FK relationships. The steep curve prevents high-containment-but-coincidental matches (e.g., same 10K email addresses across tables).

#### 4.3.3 Multi-Factor Confidence Scoring
- Value containment: 55% weight (70% when no PKs detected — redistributes PK bonus)
- Target is detected PK: 15% bonus (only when PKs exist)
- ID-in-name: 10% bonus for columns containing "ID" (common naming convention)
- Naming pattern match: 10% (source column name relates to target table name)
- Cardinality ratio: 10% (many-to-one pattern expected for FKs)
- Null handling: 5% (FKs commonly allow nulls)

#### 4.3.4 LLM Validation
- All candidates above the statistical threshold undergo LLM review
- **Sanity checker**: Batch review of candidates in context of table schema
- **Per-table validator**: Detailed review with column descriptions and sample data
- LLM can reject false positives that passed statistical tests
- LLM can suggest relationships that statistics alone can't detect (semantic understanding)

### 4.4 Adaptive Weight Redistribution
- Problem: databases without declared PKs unfairly penalize FK candidates (lose 15% PK bonus)
- Solution: redistribute PK bonus weight to value containment when no PKs are detected
- This makes the algorithm fair for "keyless" databases while still rewarding PK presence when available

---

## 5. Iterative Refinement via Backpropagation (3-4 pages) — Core Contribution

### 5.1 Motivation and Analogy
- Neural network training: adjust weights by propagating error gradients backward through layers
- Schema documentation: adjust descriptions by propagating semantic corrections backward through table relationships
- Key difference: discrete semantic updates rather than continuous gradient values
- Key similarity: both converge through iterative refinement of interconnected components

### 5.2 The Schema Dependency Graph
- Nodes = tables, edges = foreign key relationships (declared + discovered)
- Edge direction: FK source → FK target (dependency direction)
- Topological ordering for processing: leaf tables first, then tables that reference them
- Cross-schema edges create inter-schema dependencies

### 5.3 Forward Pass: Initial Description Generation
- Process tables in dependency order (leaves → roots)
- Each table analyzed with context: column statistics, sample values, related table descriptions
- LLM generates: table description, column descriptions, confidence scores, warnings
- Structured JSON output parsed and validated

### 5.4 Loss Computation: Sanity Checks
- **Dependency-level sanity checks**: Do FK relationships make semantic sense given descriptions?
- **Schema-level sanity checks**: Are descriptions within a schema internally consistent?
- **Cross-schema sanity checks**: Do cross-schema relationships have coherent descriptions?
- Sanity check failures = "loss signal" indicating description error

### 5.5 Backward Pass: Description Backpropagation
- When a table's description is revised (due to sanity check failure or new information):
  1. Identify all tables that reference or are referenced by the revised table
  2. Re-analyze those tables with updated context
  3. If their descriptions change, recursively propagate to *their* dependents
- **Depth limiting**: `maxDepth` parameter prevents infinite propagation (default: 3 levels)
- **Iteration limiting**: `maxIterations` on backpropagation passes (default: 10)

### 5.6 Convergence Detection
- **Stability window**: Track description changes across iterations
- **Semantic comparison**: LLM-based comparison to detect *material* changes (not just word substitutions)
- **Convergence criterion**: If fewer than threshold% of descriptions materially change across `stabilityWindow` consecutive iterations, declare convergence
- **Analogy**: Similar to early stopping in neural network training — stop when validation loss plateaus

### 5.7 Ground Truth as Supervised Signal
- Ground truth entries are "labeled examples" — authoritative descriptions that anchor the system
- Never overwritten by LLM analysis (immutable)
- Propagated to related tables via backpropagation
- Adding new ground truth mid-analysis triggers re-propagation
- Analogous to adding labeled training data during active learning

### 5.8 Formal Algorithm

```
Algorithm: Iterative Schema Documentation with Backpropagation

Input: Schema S = (Tables T, Columns C, Relationships R), Ground Truth G, Config K
Output: Documentation D mapping each table/column to a description

1. INTROSPECT: Extract T, C from database catalog
2. SAMPLE: Collect statistics and sample values for each column
3. DISCOVER KEYS: Run PK/FK detection pipeline → augment R
4. APPLY GROUND TRUTH: For each (table, desc) in G, set D[table] = desc, mark as immutable
5. ORDER: Topologically sort T using R
6. FOR iteration i = 1 to K.maxIterations:
     a. FORWARD PASS: For each table t in topological order:
        - If D[t] is immutable (ground truth), skip
        - context = {statistics(t), samples(t), D[related(t)]}
        - D'[t] = LLM_ANALYZE(t, context)
     b. SANITY CHECK: For each relationship r in R:
        - If D'[source(r)] and D'[target(r)] are semantically inconsistent:
          - Mark source(r) and target(r) for re-analysis
     c. BACKPROPAGATE: For each marked table t:
        - Re-analyze t with updated context from neighbors
        - If D'[t] materially changed, mark neighbors for re-analysis
        - Repeat up to K.maxDepth levels
     d. CONVERGENCE CHECK:
        - changes = |{t : D'[t] materially differs from D[t]}|
        - If changes < K.threshold for K.stabilityWindow consecutive iterations:
          - RETURN D'
     e. D = D'
7. RETURN D (max iterations reached)
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
- Sample SQL queries with validation

### 6.5 Scalability Considerations
- Incremental state saves after each table
- Resumable from any interruption point
- Connection pooling for parallel database queries
- Rate limiting for LLM API calls

---

## 7. Evaluation (4-5 pages)

### 7.1 Experimental Setup

#### 7.1.1 Datasets
- **Database A** (anonymized): 125 tables, 10 schemas, 1,500+ columns, enterprise domain, zero declared constraints — provided under NDA; all results anonymized with schema/table/column names obfuscated in published materials
- **[Additional benchmark databases — to be selected]**:
  - A well-documented database where we can measure against ground truth
  - A publicly available schema (e.g., Pagila, Northwind, AdventureWorks) where human documentation exists
  - Ideally 3-5 databases of varying size, domain, and documentation quality

#### 7.1.2 Baselines
- **Single-pass LLM**: One-shot table description without iteration or backpropagation
- **No-discovery baseline**: Use only declared keys (empty for keyless databases)
- **Human expert**: Professional DBA documentation (for cost and quality comparison)
- **Existing tools**: SchemaSpy, dbdocs output quality comparison

#### 7.1.3 Metrics
- **Description quality**: Human evaluation on 1-5 scale (accuracy, completeness, usefulness)
- **Key discovery precision/recall**: Against known ground truth keys
- **Convergence speed**: Iterations to stability
- **Token efficiency**: Tokens per table, input/output ratio
- **Cost**: Dollar cost vs. estimated human labor cost
- **Backpropagation impact**: Description quality with vs. without backpropagation

### 7.2 Key Discovery Results

#### 7.2.1 Primary Key Detection
- Precision and recall on databases with known PKs
- Impact of hard rejection filters (null/blank/zero)
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
- **LLM validation impact**: How often does LLM reject/accept statistical candidates?

### 7.3 Iterative Refinement Results

#### 7.3.1 Convergence Analysis
- Convergence curves: % of descriptions changing per iteration
- Typical convergence speed (expected: 3-5 iterations for most databases)
- Diminishing returns analysis: quality improvement per additional iteration

#### 7.3.2 Backpropagation Ablation Study
- **With backpropagation** vs. **without backpropagation** (independent table analysis)
- Measure: cross-table consistency, relationship accuracy, description coherence
- Hypothesis: backpropagation significantly improves descriptions of tables in dense relationship clusters

#### 7.3.3 Ground Truth Impact
- Baseline: pure LLM analysis (no ground truth)
- Treatment: inject ground truth for 10%, 25%, 50% of tables
- Measure: description quality improvement on *non-ground-truth* tables
- Hypothesis: ground truth on a few key tables propagates quality improvements broadly

### 7.4 Cost Analysis
- Token usage breakdown by phase (introspection, discovery, analysis, backpropagation, sanity checks)
- Input vs. output token ratio and cost implications
- Comparison with estimated human labor costs
- Cost per table as a function of database size
- Model comparison: Gemini Flash vs. GPT-4o-mini vs. Claude Haiku (cost/quality tradeoff)

### 7.5 Case Study: Database A (Anonymized)
- Detailed walkthrough of an anonymized real-world analysis
- Schema optimization discoveries (e.g., oversized column types, missing indexes)
- FK relationships discovered that were unknown to the original developers
- Before/after comparison of database understanding
- Time from "zero knowledge" to "comprehensive documentation"
- **Note**: All table names, column names, schema names, and domain-specific details are anonymized. Industry and client identity are not disclosed. If/when the client grants permission, a supplementary non-anonymized appendix may be published.

---

## 8. Discussion (2-3 pages)

### 8.1 When Does Backpropagation Help Most?
- Dense relationship graphs benefit more than sparse ones
- Schemas with consistent naming conventions see faster convergence
- Databases with some declared constraints bootstrap faster than fully keyless ones

### 8.2 Limitations
- LLM hallucination risk: descriptions may be plausible but wrong
- Statistical FK detection can miss unconventional key patterns (e.g., composite string keys)
- Token cost scales with database size (though remains far cheaper than human analysis)
- Quality depends on data — empty or near-empty tables produce poor descriptions
- Language/locale issues: non-English column names reduce LLM effectiveness

### 8.3 Threats to Validity
- Evaluation on limited number of databases
- Human quality assessment subjectivity
- Ground truth availability for benchmarking
- LLM model version sensitivity (results may vary across model versions)

### 8.4 Ethical Considerations
- Data privacy: sample values sent to LLM APIs may contain sensitive information
- Mitigation: configurable sample sizes, local LLM support planned
- Generated documentation should be reviewed by humans before being treated as authoritative

### 8.5 Broader Implications
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
- Summarize key results: quality, cost, speed
- Emphasize the backpropagation insight: treating schema documentation as an iterative learning problem
- The 99.5% cost reduction makes comprehensive database documentation economically viable for every organization
- Open-source availability and practical impact

---

## References (~40-60 citations)

### Key categories:
- Schema matching and integration (Rahm, Bernstein, Bellahsene)
- LLMs for structured data (text-to-SQL, schema linking)
- Constraint discovery (TANE, FUN, HyFD, BINDER, CORDS)
- Self-refinement in LLMs (Madaan et al.)
- Database documentation tools and practices
- Data profiling and quality
- Active learning and human-in-the-loop ML
- Neural network training and backpropagation (Rumelhart et al. 1986 — the original)

---

## Appendices

### A. Prompt Templates
- Table description prompt structure
- Semantic comparison prompt
- Sanity check prompt
- Backpropagation revision prompt

### B. Configuration Reference
- Full JSON configuration schema with descriptions
- Default values and tuning guidelines

### C. Detailed Database A Results (Anonymized)
- Complete FK/PK discovery results (table/column names anonymized)
- Sample generated descriptions (before/after iteration, anonymized)
- Convergence curves

### D. Reproducibility
- System requirements and setup instructions
- Command-line usage for reproducing experiments
- Links to open-source repository

---

## Target Venues

### Top Tier
- **VLDB** (Very Large Data Bases) — strong fit for novel database tooling with evaluation
- **SIGMOD** — flagship database conference, industrial track would be ideal
- **ICDE** (IEEE International Conference on Data Engineering)

### AI/NLP Intersection
- **EMNLP** (Empirical Methods in NLP) — if framed around LLM iterative refinement
- **ACL** — if the backpropagation analogy is developed as a general framework

### Industry/Applied
- **CIDR** (Conference on Innovative Data Systems Research) — good for novel system designs
- **DEEM Workshop** (Data Management for End-to-End ML) at SIGMOD
- **NeurIPS Datasets & Benchmarks** — if we create a benchmark for database documentation quality

### Journals
- **PVLDB** (Proceedings of the VLDB Endowment)
- **IEEE TKDE** (Transactions on Knowledge and Data Engineering)
- **ACM TODS** (Transactions on Database Systems)

---

## Estimated Length
- **Conference paper**: 12-14 pages (VLDB/SIGMOD format)
- **Journal paper**: 20-25 pages (extended version with full evaluation)

## Writing Timeline (Suggested)
1. **Weeks 1-2**: Run full evaluation experiments on 3-5 databases
2. **Weeks 3-4**: Write Sections 3-5 (architecture, key discovery, backpropagation)
3. **Weeks 5-6**: Write Section 7 (evaluation) with results
4. **Weeks 7-8**: Write Sections 1-2, 8-10 (intro, related work, discussion, conclusion)
5. **Weeks 9-10**: Internal review, revision, polish
6. **Week 11**: Submit
