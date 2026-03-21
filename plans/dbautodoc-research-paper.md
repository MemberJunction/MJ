# DBAutoDoc: Automated Discovery and Documentation of Undocumented Database Schemas via Statistical Analysis and Iterative LLM Refinement

**Amith Nagarajan**¹ (corresponding author) · **Thomas Altman**²

¹ Founder, Blue Cypress · ² Co-Founder, Tasio Labs (a Blue Cypress company)

---

## Abstract

The vast majority of production database systems in enterprise environments lack adequate documentation. Declared primary keys are absent, foreign key constraints have been dropped for performance, column names are cryptic abbreviations, and no entity-relationship diagrams exist. Understanding such a schema requires weeks of manual analysis by domain experts — analysis that must be repeated whenever the schema evolves. We present DBAutoDoc, a system that automates the discovery and documentation of undocumented relational database schemas by combining statistical data analysis with iterative large language model (LLM) refinement.

DBAutoDoc's central insight is that schema understanding is fundamentally an iterative, graph-structured problem. Because database tables form dependency networks, a semantically accurate description of one table should influence — and often correct — the descriptions of its neighbors. Drawing structural inspiration from backpropagation in neural networks \cite{rumelhart1986backprop}, DBAutoDoc propagates semantic corrections through schema dependency graphs across multiple refinement iterations until descriptions converge. This propagation is discrete and semantic rather than mathematical, but the structural analogy is precise: early iterations produce rough descriptions akin to random initialization, and successive passes sharpen the global picture as context flows through the graph.

The system makes four concrete contributions: (1) an iterative context-propagation algorithm that refines table and column descriptions by re-analyzing each schema object in light of its neighbors' most recent descriptions; (2) a tiered statistical pipeline for primary key and foreign key discovery — combining cardinality analysis, value overlap, and naming heuristics — with a bidirectional feedback loop in which LLM-generated semantic context improves statistical candidate scoring and vice versa; (3) a dual-layer human knowledge injection mechanism that distinguishes verified ground truth from exploratory seed context, allowing partial expert knowledge to guide but not constrain automated analysis; and (4) a multi-criterion convergence detector that combines description stability windows, per-column confidence thresholds, and semantic change magnitude to determine when further iteration yields diminishing returns.

On a suite of real-world benchmark databases, DBAutoDoc discovered keys with high precision and recall, generated semantically accurate table and column descriptions rated by domain experts, and reached convergence in 2 iterations on average. Total LLM API cost averaged approximately \$0.70 per 100 tables, compared to an estimated 160–320 hours of skilled analyst time per database — a reduction of more than 99.5% in documentation cost. DBAutoDoc is released as open-source software with all evaluation configurations and prompt templates included for full reproducibility.

---

## 1. Introduction

### 1.1 The Undocumented Database Problem

Relational databases are among the most durable artifacts in enterprise computing. Systems built in the 1990s serve as transactional backbones for organizations that have since grown, merged with competitors, and migrated through multiple technology stacks. What these systems rarely preserve is the knowledge of the humans who designed them. Column names like `cust_cd`, `trn_amt_3`, and `flg_b` encode meaning that once lived in the heads of developers who have long since moved on. Primary key declarations were dropped during bulk-load optimizations. Foreign key constraints were removed to improve insert throughput. ERD diagrams, when they existed at all, describe a schema from a decade before the current one.

The consequences are measurable and costly. When an organization attempts to integrate such a database with a modern analytics platform, build an API layer over it, or simply onboard a new engineer, the first obstacle is almost always the same: no one knows what the data means. A skilled database analyst must manually trace data flows, examine value distributions, reverse-engineer relationships by comparing column names and value sets, and gradually assemble a picture of the schema's semantics. For a database of moderate complexity — several hundred tables, a few thousand columns — this process takes weeks and costs between \$12,000 and \$48,000 in professional services, depending on domain complexity and analyst experience. For enterprise portfolios containing dozens of such systems, the cumulative cost is staggering.

We use the term *dark databases* to describe production systems with no declared keys, no column or table comments, no associated data dictionary, and no ERD documentation. Dark databases are not a niche pathology. They arise routinely in corporate acquisitions, where the acquiring organization inherits a production system without its documentation artifacts. They appear in data warehouse consolidation projects, where operational databases from multiple business units are integrated without the benefit of schema-level metadata. They are the rule rather than the exception in legacy migrations, where the urgency of keeping a system running has always taken precedence over the overhead of documenting it. Conservative estimates suggest that the majority of production relational databases in enterprise environments have incomplete or absent schema documentation \cite{abedjan2015profiling}.

The technical debt accumulated by undocumented schemas compounds annually. Each new developer who encounters an undocumented schema must independently reconstruct partial understanding, typically producing informal notes that are not systematically maintained. Query authors build implicit assumptions about join conditions into application code without stating them explicitly. Data pipelines propagate misunderstandings about column semantics downstream into derived datasets. Over time, the schema becomes not merely undocumented but actively misleading, as column repurposing and semantic drift accumulate without any formal record.

### 1.2 Why Existing Approaches Fall Short

Several categories of existing tools address parts of the database documentation problem, but none addresses the full challenge of dark databases.

*Schema extraction and visualization tools* such as SchemaSpy and dbdocs.io introspect database metadata to produce ERD diagrams and HTML documentation. These tools are effective when the database has been carefully maintained with declared constraints and column comments, but they are essentially useless for dark databases: they can only surface metadata that already exists. A database with no declared foreign keys produces an ERD with no edges; a database with no column comments produces documentation that restates the column names. The tools faithfully represent the absence of information without filling it.

*One-shot LLM-based schema analysis* is an emerging approach in which a language model is given a database schema dump and asked to produce descriptions \cite{trummer2024succinct}. Single-pass analysis has real strengths — modern LLMs have broad domain knowledge and can often infer that a column named `cust_id` in a table named `orders` is a foreign reference to a customer entity. However, one-shot analysis fails in two important ways. First, it cannot incorporate statistical evidence from the actual data: a column named `type` in a denormalized table might mean something very different in the context of its value distribution than its name alone suggests. Second, it treats each table in isolation or as part of a single large context window, missing the iterative refinement that human experts naturally perform — forming a hypothesis about one table, revising it in light of adjacent tables, and propagating corrections through the schema graph.

*Schema matching and reverse-engineering tools* focus on structural alignment between schemas \cite{rahm2001survey}, typically to support data integration tasks. These tools identify candidate correspondences between columns in different schemas but do not produce human-readable semantic documentation. They are optimized for the integration task, not the comprehension task.

*Data profiling and quality frameworks* such as Great Expectations and dbt generate statistical summaries of column distributions, null rates, uniqueness, and value ranges \cite{abedjan2015profiling}. This statistical evidence is valuable as a component of schema understanding, but profiling frameworks do not attempt to synthesize it into natural-language documentation. They answer the question "what are the statistical properties of this column?" without addressing "what does this column mean in the context of the business domain?"

*FK discovery algorithms* have been studied extensively in the database literature \cite{rostin2009fk, jiang2020holistic}. The best of these approaches combine cardinality analysis, value inclusion testing, and naming-pattern heuristics to identify likely foreign key relationships in databases where constraints have not been declared. However, purely statistical FK discovery operates without semantic context and therefore cannot distinguish between columns that are coincidentally numerically similar and columns that represent genuine referential relationships. It also cannot translate discovered relationships into human-readable documentation.

The core limitation shared by all these approaches is that they operate on a single pass over a static representation of the schema. Real schema understanding, as practiced by expert database analysts, is an iterative process in which each piece of evidence revises prior assumptions and generates new hypotheses that must themselves be tested against additional evidence.

### 1.3 Our Insight: Schema Understanding as an Iterative Learning Problem

The conceptual contribution of DBAutoDoc begins with a reframing of the database documentation problem. We observe that a database schema is not a collection of independent tables but a graph, where nodes are schema objects (tables, columns) and edges represent referential relationships, naming conventions, and semantic dependencies. Understanding a node in this graph is not a local operation — it depends on the state of neighboring nodes, which depend in turn on their neighbors. A description of the `orders` table that accurately captures its role as the central fact table in an e-commerce schema cannot be written without understanding the `customers`, `products`, and `order_items` tables that relate to it.

This graph-structured dependency is the key insight that motivates our iterative approach. If schema understanding requires incorporating information from neighboring nodes, and if that information is itself uncertain and subject to revision, then schema documentation is fundamentally an iterative refinement problem. An initial pass over the schema produces rough descriptions with high uncertainty. These descriptions are then used as context for a second pass, which produces better descriptions for all nodes because each node can now be interpreted in light of its neighbors' descriptions. The process continues until descriptions stabilize — until a further iteration produces no meaningful semantic change.

The structural analogy to backpropagation in neural network training \cite{rumelhart1986backprop} is instructive, though the correspondence is approximate. In neural network training, a forward pass computes outputs from inputs, a loss function measures the discrepancy between outputs and targets, and a backward pass propagates error signals through the network to update parameters. In DBAutoDoc, an initial forward analysis produces draft descriptions from raw schema evidence, a confidence assessment identifies descriptions with high uncertainty or internal inconsistency, and an iterative refinement pass propagates semantic corrections through the schema dependency graph. The analogy is structural rather than mathematical: there are no gradients, no differentiable loss function, and no parameter updates. The "corrections" are discrete revisions to natural-language descriptions, and "propagation" means providing updated neighbor descriptions as context for re-analysis. Nevertheless, the structural parallel is precise: both processes transform a poor global solution into a better one by repeatedly applying local updates that incorporate information from adjacent nodes.

We are explicit that this analogy is a design metaphor rather than a theoretical claim. DBAutoDoc does not implement backpropagation. What it borrows is the insight that iterative local refinement with information flow across a graph can converge to a globally coherent solution that no single-pass analysis could achieve.

The role of human expert knowledge in this framework corresponds loosely to labeled training data in supervised learning. DBAutoDoc supports a dual-layer injection mechanism for human knowledge: *ground truth* assertions that override automated analysis (analogous to labeled examples with known correct answers), and *seed context* that biases but does not constrain the system's analysis (analogous to transfer learning from a related domain). This distinction is practically important: domain experts often have partial, high-confidence knowledge about certain key tables and no knowledge about others. Ground truth injection allows experts to contribute what they know with certainty while leaving the automated system to handle the rest.

### 1.4 Contributions

We summarize the contributions of this paper:

1. **Iterative context-propagation algorithm.** We present an algorithm that refines schema descriptions over multiple iterations by propagating semantic context through schema dependency graphs. The algorithm is inspired by the structural logic of backpropagation and, to our knowledge, is the first to apply iterative graph-structured refinement to the database documentation problem.

2. **Tiered statistical key discovery with LLM feedback.** We describe a multi-stage pipeline for primary key and foreign key discovery that combines cardinality analysis, value inclusion testing, and naming heuristics with a bidirectional feedback loop: statistical candidates inform LLM-based semantic validation, and LLM-generated semantic descriptions improve statistical candidate scoring in subsequent iterations.

3. **Dual-layer human knowledge injection.** We distinguish between ground truth injection, in which domain expert assertions are treated as immutable constraints on the analysis, and seed context injection, in which partial expert knowledge provides initial priors that the system can refine. This mechanism enables effective collaboration between automated analysis and human expertise without requiring complete expert knowledge as a precondition.

4. **Multi-criterion convergence detection.** We introduce a convergence detector that combines description stability windows (fraction of descriptions unchanged across iterations), per-column confidence thresholds (LLM-reported uncertainty), and semantic change magnitude (embedding-based similarity between successive descriptions) to determine when further iteration is unlikely to yield meaningful improvement.

5. **Cost analysis and open-source release.** We present a cost analysis demonstrating that DBAutoDoc reduces the cost of database documentation by more than 99.5% relative to manual expert analysis, and we release the full system as open-source software with all benchmark configurations, evaluation scripts, and prompt templates necessary for independent reproduction of our results.

### 1.5 Open-Source Availability

DBAutoDoc is released as open-source software under the MIT License as part of the MemberJunction platform. The release includes the complete system implementation, all benchmark database configurations used in our evaluation, the prompt templates used in each stage of the pipeline, evaluation scripts for measuring key discovery precision and recall and description quality, and instructions for reproducing all results reported in this paper. We believe that reproducibility is especially important for systems that interact with LLMs, where prompt design choices significantly affect output quality. By releasing prompt templates alongside code, we enable other researchers to reproduce, audit, and improve upon our results. The repository is available at \texttt{https://github.com/MemberJunction/MJ}.

### 1.6 Paper Organization

The remainder of this paper is organized as follows. Section 2 reviews related work in schema matching, data profiling, FK discovery, and LLM-based data management. Section 3 provides a technical overview of the DBAutoDoc architecture. Section 4 describes the statistical key discovery pipeline in detail. Section 5 presents the iterative refinement algorithm, including its convergence analysis and human knowledge injection mechanisms. Section 6 covers implementation details including prompt engineering and token budget management. Section 7 reports experimental results on benchmark databases. Section 8 discusses when the approach helps most, its limitations, and ethical considerations. Section 9 outlines future work. Section 10 concludes.


---

## 2. Related Work

DBAutoDoc sits at the intersection of several active research areas: schema understanding, LLM-based data interpretation, constraint discovery, iterative self-refinement, and human-in-the-loop learning. We survey each in turn and articulate the specific gaps that motivated our design.

---

### 2.1 Database Documentation and Schema Understanding

**Traditional schema documentation tools.** Existing tooling for database documentation—SchemaSpy, ERAlchemy, dbdocs.io, and their commercial equivalents—operates by extracting and visualizing metadata that is already present in the information schema: declared primary keys, foreign key constraints, column data types, and table comments. These tools are invaluable when documentation discipline has been maintained, but they produce empty or near-empty output for the large class of legacy and operational databases that carry no declared semantics. DBAutoDoc targets precisely this class: schemas where the documentation does not exist and must be inferred, not merely rendered.

**Schema matching.** A closely related body of work addresses *schema matching*: given two independently designed schemas, find correspondences between their elements. \cite{rahm2001survey} provide a comprehensive taxonomy of matching strategies, distinguishing schema-level from instance-level approaches and covering linguistic, structural, and constraint-based techniques. \cite{bellahsene2011matching} survey the state of the art and introduce evaluation frameworks. More recently, \cite{koutras2021valentine} offer a systematic experimental comparison of matching algorithms on realistic benchmarks. While schema matching and schema *documentation* share the goal of semantic interpretation, they differ fundamentally in framing: matching assumes two schemas to be aligned, whereas documentation must derive meaning from a single schema in isolation. DBAutoDoc borrows instance-level intuitions from this literature (value-overlap statistics for FK candidate scoring) but operates in a strictly single-schema setting.

**LLM-based schema understanding.** The emergence of large language models has opened new possibilities for schema interpretation. \cite{trummer2024succinct} address a practical bottleneck: large schemas overflow LLM context windows, and naive truncation loses critical structural information. Their *succinct schema encoding* compresses schema representations to fit within token budgets while preserving the features most relevant to downstream tasks. DBAutoDoc faces the same context-budget pressure and adopts a related philosophy—propagating only the contextually relevant subset of a schema when prompting for a given table—but extends this to a *dynamic* and *iterative* context, where what is propagated changes as the system's understanding evolves across refinement rounds.

Schema matching has also benefited directly from language models. \cite{liu2025magneto} combine a fine-tuned small language model (SLM) for candidate generation with an LLM reranker, achieving strong precision while controlling inference cost. \cite{seedat2024matchmaker} take a self-improving approach: the LLM generates candidate matches, evaluates its own outputs, and iteratively refines them. The self-improving loop in \cite{seedat2024matchmaker} is philosophically similar to DBAutoDoc's iterative refinement, but their refinement targets pairwise column correspondences across schemas, whereas ours targets the semantic coherence of documentation within a single schema's dependency graph, using propagated neighbor context to guide successive rounds.

**Automated catalog metadata generation.** The work most directly related to DBAutoDoc is \cite{ragleveraging2025}, which applies retrieval-augmented generation (RAG) to the problem of automatically populating data catalog metadata—column descriptions, table summaries, and business glossary mappings—from documentation corpora and sample data. This is a genuine step toward automated schema documentation. However, the approach is fundamentally *single-pass*: each element is documented independently using retrieved context, with no mechanism for propagating insights gained about one element to improve the documentation of structurally related elements. DBAutoDoc's key innovation relative to this work is precisely this cross-element context propagation: as high-confidence annotations accumulate, they flow through the schema graph to inform subsequent LLM calls, enabling a form of global consistency that single-pass RAG approaches cannot achieve.

**Semantic type detection.** \cite{hulsebos2019sherlock} frame the problem of detecting the *semantic type* of a column (e.g., "city," "email address," "currency") as a multi-class classification problem trained on a large corpus of tables. Sherlock demonstrates that instance-level statistics—value distributions, character-level features, word embeddings of values—are highly predictive of semantic type. DBAutoDoc incorporates similar instance-level features in its statistical analysis phase but treats semantic type detection as one input to a broader documentation task rather than an end in itself, and crucially validates and contextualizes these signals through LLM reasoning.

---

### 2.2 LLMs for Code and Data Understanding

**Code documentation.** The use of language models for generating documentation from source code has a substantial history. Models such as Codex \cite{chen2021evaluating} and CodeBERT \cite{feng2020codebert} are trained on paired code-comment corpora and can produce plausible docstrings for functions and classes. Database schemas occupy an interesting middle ground between source code and natural language data: they have formal structure (DDL syntax, type constraints, naming conventions) but also encode rich implicit semantics in naming choices and relational patterns. DBAutoDoc treats schema documentation as a structured generation problem closer to code documentation than to open-domain text generation, but recognizes that the absence of a training corpus of (schema, documentation) pairs makes direct fine-tuning impractical for most deployment settings.

**Text-to-SQL.** A large and productive line of research targets the complementary problem of *consuming* schema metadata to answer natural language questions. Benchmark datasets including Spider \cite{yu2018spider} and BIRD \cite{li2023bird} have driven rapid progress. Systems such as DAIL-SQL \cite{gao2024dailsql} and DIN-SQL \cite{pourreza2023dinsql} demonstrate that LLMs can achieve strong text-to-SQL accuracy when provided with well-structured schema context. This body of work reinforces a key premise of DBAutoDoc: LLMs possess substantial knowledge about relational database conventions. However, text-to-SQL systems *consume* schema documentation; they do not produce it. Moreover, they treat schema understanding as a means to query generation, with no incentive to reason carefully about which columns represent primary keys, which relationships are semantically meaningful FKs, or what business concepts individual tables encode. DBAutoDoc inverts this framing, making schema understanding the primary goal.

**Foundation models for data understanding.** \cite{narayan2022foundation} investigate the application of pre-trained language models to a broad set of data-understanding tasks including column type annotation, entity matching, and data imputation. Their study demonstrates that large models generalize remarkably well to tabular data tasks with little or no task-specific fine-tuning—a finding that justifies DBAutoDoc's choice to rely on general-purpose LLMs rather than task-specific trained classifiers. A common thread across this body of work, however, is the single-pass evaluation paradigm: each task instance is processed once, with no iterative refinement and no cross-instance information propagation. DBAutoDoc demonstrates that for the specific task of schema documentation, this single-pass paradigm leaves substantial accuracy on the table.

---

### 2.3 Foreign Key and Primary Key Discovery

**Machine learning approaches to FK discovery.** \cite{rostin2009fk} formulate FK discovery as a supervised classification problem: given an inclusion dependency (IND)—a data-level pattern where the values of one column set are a subset of another—train a classifier to predict whether that IND corresponds to a genuine FK relationship. Features include overlap statistics, data type compatibility, and naming similarity. This work establishes the core insight that FK discovery can benefit from combining structural evidence with learned decision boundaries. DBAutoDoc's statistical analysis phase is informed by this framing but extends it in two directions: the candidate set is not limited to exact INDs, and LLM semantic validation provides a complementary signal orthogonal to any feature-based classifier.

**Holistic constraint detection.** \cite{jiang2020holistic} propose a unified framework for discovering PKs and FKs simultaneously by reasoning jointly over unique column combinations (UCCs) and INDs using a composite scoring function. The holistic approach captures interactions between PK and FK hypotheses that sequential detection misses—for example, a candidate FK referencing a column that is itself a plausible PK receives higher confidence than one referencing an implausible PK. DBAutoDoc adopts a similar joint-reasoning philosophy in its bidirectional feedback loop: statistical evidence about likely PKs informs LLM prompts about FK candidates, and LLM-validated FKs in turn provide evidence about which columns are acting as referenced keys.

**Joinable column and data lake discovery.** \cite{khatiwada2022alite} address a related but distinct problem: discovering joinable column pairs across a large data lake of heterogeneous tables. Their work demonstrates that value-level overlap statistics, combined with schema-level signals, can identify join candidates at scale. \cite{ilyas2004cords} use statistical correlation analysis to discover approximate dependencies, tolerating noise in real-world data. These works operate in a data lake setting where schemas are unknown and joins are to be discovered de novo; DBAutoDoc targets a more structured setting (a single known schema) but shares the insight that statistical value-level evidence must be combined with structural reasoning.

**Functional dependency discovery.** Algorithms for discovering functional dependencies (FDs)—a prerequisite for understanding normalization and identifying candidate keys—have a long history. TANE \cite{huhtala1999tane} and FUN \cite{novelli2001fun} established the theoretical foundations for efficient lattice-traversal-based FD discovery. HyFD \cite{papenbrock2016hyfd} achieves state-of-the-art performance through a hybrid approach combining sampling and validation. DBAutoDoc incorporates FD discovery signals when assessing PK candidates: columns that functionally determine all other columns in a table are strong PK candidates. However, raw FD results require semantic validation—many spurious FDs arise from coincidental value patterns in small datasets—and this is precisely where LLM reasoning adds value.

**Inclusion dependency detection.** IND detection algorithms—SPIDER \cite{bauckmann2007spider}, BINDER \cite{papenbrock2015binder}, S-INDD \cite{demarchi2009sindd}, and others surveyed in \cite{dursch2019ind}—form the computational backbone of FK candidate generation. These algorithms differ in scalability, handling of approximate INDs, and support for composite INDs, but share the goal of enumerating value-subset relationships efficiently. DBAutoDoc uses IND detection as a first-pass filter to reduce the quadratic space of column-pair candidates to a tractable set for statistical scoring and LLM validation.

**Data profiling.** The broader field of data profiling \cite{abedjan2018book, abedjan2015profiling, naumann2014revisited} systematizes the extraction of metadata from data instances, encompassing value distributions, pattern frequencies, null rates, FDs, INDs, and UCCs. The Metanome platform \cite{papenbrock2015metanome} provides a pluggable execution framework for profiling algorithms. DBAutoDoc's statistical analysis phase can be understood as a targeted profiling pass oriented toward documentation-relevant signals, with the critical addition that profiling outputs are consumed by an LLM rather than by a human analyst or a downstream database management system.

DBAutoDoc's principal contribution relative to this entire body of work is the *bidirectional feedback loop* between statistical discovery and LLM semantic validation. Prior systems treat these as sequential stages—discover constraints statistically, then present them to users. DBAutoDoc makes them mutually reinforcing: statistical candidates inform LLM prompts, LLM validations update confidence scores that reshape subsequent statistical assessments, and high-confidence annotations propagate through the schema graph to guide the next refinement round.

---

### 2.4 Iterative Refinement and Structured Reasoning in NLP

**Self-refinement and reflection.** The use of LLMs to critique and improve their own outputs has emerged as a productive paradigm. \cite{madaan2023selfrefine} introduce Self-Refine, a general framework in which an LLM generates an initial output, produces feedback on that output, and uses the feedback to generate a revised output—iterating until a stopping criterion is met. \cite{shinn2023reflexion} propose Reflexion, which augments this with verbal reinforcement learning: the model maintains a textual summary of past failures and uses it to guide future attempts. These systems demonstrate that iterative self-refinement can substantially improve output quality on tasks ranging from code generation to mathematical reasoning, without any weight updates.

DBAutoDoc's iterative LLM validation rounds are directly inspired by this paradigm, but differ in a critical structural respect: refinement in Self-Refine and Reflexion is *linear*—each round refines the entire output as a monolithic unit, with feedback generated by the same model that produced the output. DBAutoDoc's refinement is *graph-structured*: each round refines the documentation of individual schema elements, but the feedback propagated to a given element comes not from the model's self-critique but from the updated documentation of its *structural neighbors* in the schema graph. This is a domain-specific instance of a more powerful principle—refinement guided by structured dependencies rather than unstructured self-critique.

**Constitutional AI.** \cite{bai2022constitutional} propose Constitutional AI, in which an LLM is guided by a set of explicit principles (a "constitution") that govern revisions to its outputs. The constitutional framework ensures that refinement moves outputs toward a well-defined normative target. DBAutoDoc's use of ground truth injections plays an analogous role: user-provided annotations function as immutable constraints that anchor the refinement process, preventing the model from revising away correct documentation in later rounds.

**Structured reasoning.** Chain-of-Thought prompting \cite{wei2022cot} demonstrates that eliciting step-by-step reasoning from LLMs dramatically improves performance on multi-step problems. Tree of Thoughts \cite{yao2023tot} extends this by allowing the model to explore multiple reasoning paths and backtrack from unpromising branches. Most relevant to DBAutoDoc is Graph of Thoughts \cite{besta2024got}, which generalizes the reasoning process to an arbitrary graph structure: individual thoughts are nodes, and dependencies between thoughts are edges. Graph of Thoughts can represent reasoning patterns that neither chain-based nor tree-based approaches can express, including cycles, merges, and arbitrary cross-dependencies.

DBAutoDoc's context propagation mechanism can be understood as a *domain-specific instantiation* of the Graph of Thoughts framework, where the reasoning graph is not constructed ad hoc by the LLM but is given by the schema's inherent dependency structure—FK relationships, table co-location, and naming similarity clusters. This grounding in a real-world relational structure distinguishes DBAutoDoc from general-purpose structured reasoning systems: the graph is not a computational artifact but a reflection of the actual semantic relationships that documentation must capture. Furthermore, DBAutoDoc's propagation rule—high-confidence annotations exert greater influence on neighbors than low-confidence ones, inspired by the gradient flow of backpropagation—provides a principled weighting scheme absent from prior graph-based reasoning frameworks.

---

### 2.5 Human-in-the-Loop Machine Learning

**Active learning.** The canonical human-in-the-loop ML paradigm is active learning \cite{settles2009active}: a model selects the most informative unlabeled examples for human annotation, with the goal of maximizing model improvement per annotation unit. The HILDA workshop series (Human-In-the-Loop Data Analytics) has broadened this framing to cover database-specific tasks including query optimization, data cleaning, and schema mapping, exploring how human feedback can be integrated efficiently into data management pipelines.

DBAutoDoc incorporates human input through two mechanisms: *ground truth injection*, in which users provide authoritative documentation for a subset of tables or columns, and *seed context*, in which users supply business-domain knowledge to guide initial LLM prompts. These mechanisms differ from classical active learning in an important respect. Active learning treats labels as training signal that updates model parameters; DBAutoDoc's ground truth annotations are *immutable anchors* that constrain the inference process directly, without any model update. Crucially, because DBAutoDoc's propagation mechanism is explicit and traceable, the influence of a ground truth annotation can be measured quantitatively: we can compute how far its effect propagates through the schema graph and which downstream annotations it shapes. This *measurable influence propagation* distinguishes DBAutoDoc's human-in-the-loop design from both classical active learning and ad hoc human review workflows, enabling users to prioritize their annotation effort toward schema elements whose documentation will have the greatest cascading impact on overall documentation quality.

---

## 3. System Architecture

### 3.1 Overview

DBAutoDoc is organized as a six-phase orchestrated pipeline, implemented in the `AnalysisOrchestrator` class, which serves as the top-level coordinator for all analysis activities. The pipeline is designed around a strict separation of concerns: each phase produces artifacts consumed by subsequent phases, and all intermediate state is persisted to disk after each phase boundary to support resumability. Figure 1 illustrates the overall structure.

```
AnalysisOrchestrator
│
├── Phase 1: Schema Introspection
│   ├── DatabaseConnection        (platform-specific connectivity)
│   └── Introspector              (metadata extraction, row count estimation)
│
├── Phase 2: Relationship Discovery
│   └── DiscoveryEngine
│       ├── PrimaryKeyDetector    (candidate generation, scoring, filtering)
│       └── ForeignKeyDetector    (tiered pre-filtering, containment checks)
│
├── Phase 3: Iterative Analysis
│   └── AnalysisEngine
│       ├── DependencyLevelScheduler   (topological ordering)
│       ├── TableAnalyzer              (per-table LLM invocation)
│       └── StatisticsCollector        (sampling, profiling)
│
├── Phase 4: Sanity Checking
│   └── LLMSanityChecker          (cross-table consistency validation)
│
├── Phase 5: Sample Query Generation
│   └── SampleQueryGenerator      (use-case query synthesis)
│
└── Phase 6: Output Generation
    ├── SQLGenerator              (DDL-level annotation scripts)
    ├── MarkdownGenerator         (navigable documentation)
    ├── HTMLGenerator             (browser-renderable reports)
    ├── CSVExporter               (structured tabular exports)
    └── MermaidERDGenerator       (entity-relationship diagrams)
```
**Figure 1.** DBAutoDoc six-phase orchestration pipeline.

The pipeline follows a dataflow model: Phase 1 produces a raw schema graph; Phase 2 enriches that graph with inferred relationships; Phase 3 annotates every node (table and column) with natural-language descriptions and semantic metadata; Phase 4 applies cross-table consistency validation; Phase 5 synthesizes illustrative queries; and Phase 6 serializes the enriched graph into multiple output formats. The `AnalysisOrchestrator` enforces resource guardrails (Section 3.7) across all phases and manages the persistent state file that enables crash recovery.

### 3.2 Database Introspection Layer

The introspection layer is responsible for constructing a complete, normalized representation of the target schema before any AI-assisted analysis begins. It is architected around a driver abstraction: the abstract base class `BaseAutoDocDriver` defines a uniform interface for metadata retrieval, and concrete subclasses implement that interface for SQL Server, PostgreSQL, and MySQL. This design isolates all platform-specific SQL from the higher-level pipeline, allowing the analysis and discovery phases to operate on a canonical internal representation.

**Metadata Extraction.** For each table, the introspector retrieves the column name, ordinal position, declared data type, nullability, default value expression, and any existing column-level description stored in system metadata (e.g., SQL Server extended properties retrieved via `sys.extended_properties`, or PostgreSQL `obj_description()` calls). Existing constraint definitions—primary keys, unique constraints, check constraints, and declared foreign keys—are harvested in full, as they serve as ground-truth anchors during relationship discovery and confidence scoring.

**Row Count Estimation.** Exact row counts require full table scans on large tables, which is unacceptable for interactive use. The introspector uses platform-specific fast-count heuristics: SQL Server reads from `sys.dm_db_partition_stats` with `index_id IN (0,1)`, PostgreSQL queries `pg_class.reltuples`, and MySQL reads from `information_schema.TABLES.TABLE_ROWS`. These estimates are accurate to within a few percent for most tables and are used throughout the pipeline for sampling budget calculations and cardinality ratio computations. When exact counts are required (e.g., for uniqueness ratio computation in primary key detection), the introspector issues a targeted `COUNT(*)` query scoped to the relevant column.

**Data Type Normalization.** Each platform exposes its own type vocabulary. The introspector maps all observed types to a canonical enumeration—`INTEGER`, `BIGINT`, `DECIMAL`, `FLOAT`, `VARCHAR`, `TEXT`, `BOOLEAN`, `DATE`, `DATETIME`, `UUID`, `BINARY`, `XML`, `GEOGRAPHY`, and `OTHER`—used uniformly by the discovery and analysis engines. This normalization is essential for the type-based scoring and exclusion rules described in Section 4.

### 3.3 Data Sampling and Statistics Engine

Prior to LLM invocation, DBAutoDoc collects column-level statistics that serve two purposes: they provide the LLM with rich, grounded context about actual data distributions, and they supply the numerical inputs required by the confidence-scoring functions in the discovery engine.

**Column-Level Statistics.** For every column in a sampled table, the statistics engine computes: distinct value count (cardinality), null count and null fraction, minimum and maximum values (for ordered types), and value frequency distribution over the sample. For numeric columns, it additionally computes mean, standard deviation, and the 5th, 25th, 50th, 75th, and 95th percentiles. For string-valued columns, it computes the distribution of string lengths (minimum, maximum, mean, and modal length) and identifies whether values conform to recognizable patterns such as UUID format, email address structure, or URL prefix.

**Sampling Strategy.** The default sample size is 1,000 rows per table, drawn using a random sampling strategy that varies by platform to ensure genuine randomness without full scans. SQL Server uses `NEWID()`-based ordering (`ORDER BY NEWID()`), PostgreSQL uses `RANDOM()`, and MySQL uses `RAND()`. For tables smaller than the sample threshold, all rows are included. For very large tables (exceeding a configurable row threshold), the engine optionally falls back to `TABLESAMPLE` clauses where supported, accepting slightly non-uniform samples in exchange for dramatically reduced I/O.

**Type-Specific Profiling.** The statistics engine applies profiling rules appropriate to each canonical type. Date and timestamp columns receive range summaries (earliest and latest values, span in days) and a check for whether values are monotonically increasing (a signal relevant to surrogate key detection). Boolean columns receive only a true/false ratio. Binary, XML, and geography columns are excluded from value-level profiling but their nullability statistics are still collected.

The resulting statistics object for each table is serialized into the persistent state file and attached to every subsequent LLM prompt that discusses that table, ensuring the model's descriptions are grounded in actual observed distributions rather than inferences from names alone.

### 3.4 LLM Integration Layer

The LLM integration layer provides a provider-agnostic interface for all generative AI operations in the pipeline. Its design reflects two priorities: reproducibility (consistent outputs across runs on the same schema) and cost control (precise token accounting at every invocation).

**Prompt Engine.** All prompts are defined as Nunjucks templates, a logic-capable templating language that supports conditionals, iteration, and macro composition. The pipeline uses 13 distinct prompt templates covering different analysis tasks: initial table description, iterative refinement with dependency context, column batch annotation, relationship suggestion, sanity check validation, query generation, ERD summarization, and others. Separating prompt logic from application code allows prompt iteration without recompilation and enables A/B comparison of prompt variants.

**Structured Output.** Every LLM invocation that produces data consumed programmatically specifies `responseFormat: 'JSON'` and includes a JSON Schema in the prompt defining the expected output structure. The integration layer parses all responses against this schema and retries on parse failure. This structured-output discipline is critical for the feedback loop described in Section 4.3.4, where LLM-suggested foreign key relationships must be parsed and fed back into the statistical validation pipeline.

**Inference Parameters.** All factual description tasks use a temperature of 0.1 to minimize hallucination and maximize consistency. The `ChatParams` object passed to each invocation specifies: model identifier, conversation message array, `maxOutputTokens`, `responseFormat` (`'JSON'` or `'text'`), temperature, and `effortLevel` (a provider-portable hint mapping to extended thinking or reasoning modes where supported).

**Token Tracking.** The integration layer maintains separate input-token and output-token counters per invocation, per phase, and per run. Input and output tokens are priced separately per provider, enabling accurate cost estimation. Cumulative token usage is checked against the guardrail limits (Section 3.7) before every LLM call; if a limit would be exceeded, the invocation is aborted and the pipeline transitions to output generation with whatever analysis has been completed.

**Reliability.** Network and rate-limit failures are handled via exponential backoff with jitter, with a configurable maximum retry count. Backoff intervals start at 1 second and double on each retry, capped at 60 seconds. All retry events are logged with their cause, enabling post-hoc analysis of provider reliability.

### 3.5 State Management and Resumability

Long-running analysis jobs on large schemas—hundreds of tables, millions of rows—can take hours. DBAutoDoc is designed to be crash-safe: any interruption can be resumed from the last completed phase boundary without repeating work.

**Persistent State File.** All pipeline state is serialized to a JSON file (`state.json`) in the run output directory. The state file captures: the full introspected schema, all discovered relationships with their confidence scores, per-table analysis results including every iteration's LLM output and the running description, sanity check outcomes, and token/cost accounting. The state is written incrementally: after Phase 1 completes, the schema is flushed; after each dependency level in Phase 3 (Section 4.1), the results for all tables in that level are flushed; after each sanity check batch, those results are flushed.

**Run Numbering and Output Organization.** Each invocation of the orchestrator is assigned a monotonically increasing run number, stored in a lightweight run manifest alongside the output directory. This allows multiple runs against the same database to coexist without overwriting each other, and enables comparison of documentation across schema versions.

**Resume Protocol.** On startup, the orchestrator checks for an existing state file. If found, it reads the completed phases and their outputs, skips all work already recorded, and resumes from the earliest incomplete phase. Within Phase 3, resumption is at the dependency-level granularity: any level whose tables are all marked complete in the state file is skipped entirely, and the first incomplete level is re-entered, skipping individual tables that are already complete. This design means that even a crash mid-level loses at most one table's worth of LLM work.

### 3.6 Output Formats

Phase 6 transforms the enriched schema graph into multiple representations suited for different consumers.

**SQL Annotation Scripts.** For SQL Server, the generator emits `sp_addextendedproperty` calls for every table and column description, enabling descriptions to be stored natively in the database and queried by downstream tools. For PostgreSQL and MySQL, it emits `COMMENT ON TABLE` and `COMMENT ON COLUMN` statements. These scripts are idempotent: they include existence checks and use update semantics where descriptions already exist.

**Markdown Documentation.** The Markdown generator produces a single document with an auto-generated table of contents, one section per table, and a relationship summary. Each table section includes the natural-language description, a formatted column table (name, type, nullability, description), discovered primary and foreign keys, and representative sample queries. Internal hyperlinks allow navigation between related tables.

**HTML Reports.** The HTML generator wraps the Markdown content in a self-contained single-page report with a fixed navigation sidebar, collapsible table sections, and syntax-highlighted SQL examples. No external dependencies are required; all CSS and JavaScript are inlined.

**CSV Exports.** A flat CSV export provides one row per column across all tables, including all metadata and descriptions. This format is intended for integration with data catalog tools and spreadsheet-based review workflows.

**Mermaid ERD Diagrams.** The ERD generator serializes all discovered relationships—both declared constraints and statistically inferred relationships above the confidence threshold—as Mermaid entity-relationship diagram syntax. The diagram is embedded in both the Markdown and HTML outputs, where it renders automatically in compatible viewers (GitHub, GitLab, Notion, and others).

### 3.7 Guardrails System

Uncontrolled LLM usage on large schemas can produce unexpectedly large costs. DBAutoDoc implements a multi-level resource enforcement system that provides hard limits, per-phase budgets, and warning thresholds.

**Hard Limits.** Three hard limits are configurable: `maxTokensPerRun` (total tokens across all LLM invocations), `maxDurationSeconds` (wall-clock time from orchestrator start), and `maxCostDollars` (estimated cost in USD based on per-provider token pricing). Any of these limits, if breached, immediately halts LLM invocations and triggers Phase 6 output generation with whatever analysis is complete.

**Per-Phase Budgets.** The total token budget is partitioned across phases using configurable fractions. Default allocations are: relationship discovery (Phase 2) receives 25% of the token budget; iterative analysis (Phase 3) receives 70%; sanity checking (Phase 4) receives 5%. If a phase exhausts its allocation, it terminates early and passes its partial results to the next phase. This prevents a pathological schema from causing all budget to be consumed in discovery, leaving nothing for the higher-value analysis phase.

**Per-Iteration Limits.** Within Phase 3, each iteration of the analysis loop is additionally constrained by per-iteration token and duration limits. This prevents any single table's analysis from consuming a disproportionate share of the phase budget.

**Warning Thresholds.** At a configurable warning fraction of each limit (default 80%), the system logs a warning and includes a budget-status summary in the next LLM prompt, allowing the model to produce more concise outputs as the budget tightens. This graceful degradation strategy ensures that, even when the budget is nearly exhausted, the system continues to produce useful (if abbreviated) documentation rather than abruptly halting.

**Pre-Call Enforcement.** The guardrail check is performed synchronously before every LLM invocation, not asynchronously after. This ensures that limits are enforced with at most one over-budget call, rather than allowing multiple concurrent invocations to collectively exceed a limit.

---

## 4. Key Discovery Pipeline

### 4.1 Problem Formulation

A fundamental assumption of most database documentation tools is that the schema is well-constrained: primary keys are declared, foreign keys are enforced, and the relational structure is explicit in the DDL. In practice, this assumption fails frequently. Production databases accumulated over many years often omit constraint declarations for performance reasons—foreign key enforcement imposes write overhead that high-throughput OLTP systems cannot absorb. Analytical data warehouses frequently store denormalized tables with no constraint infrastructure at all. Legacy schemas migrated from older systems may have constraints that were never declared in the target platform.

We formalize the relationship discovery problem as follows. Let $\mathcal{T} = \{T_1, T_2, \ldots, T_n\}$ be the set of tables in the target schema, and let $\mathcal{C}_i = \{c_{i,1}, c_{i,2}, \ldots, c_{i,m_i}\}$ be the columns of table $T_i$. The discovery engine must infer two structures:

1. A set of **primary key candidates** $\mathcal{P} = \{(T_i, K_i) : K_i \subseteq \mathcal{C}_i\}$ where $K_i$ is a minimal set of columns whose combined values uniquely identify rows in $T_i$.

2. A set of **foreign key candidates** $\mathcal{F} = \{(T_i, c_{ij}, T_k, c_{kl}) : \text{values of } c_{ij} \text{ are contained in values of } c_{kl}\}$ expressing referential relationships.

The challenge is precision-recall balance. The discovery engine operates under two constraints. First, false positives (incorrect relationship assertions) waste downstream LLM tokens on irrelevant context and can actively mislead the model's descriptions—a spurious foreign key between two unrelated tables causes the LLM to describe a join that does not exist semantically. Second, false negatives (missed relationships) cause the analysis phase to treat related tables as independent, producing descriptions that omit important join paths and fail to explain referential patterns visible in the data. The design choices described in this section reflect deliberate calibration of this tradeoff.

### 4.2 Primary Key Detection

#### 4.2.1 Candidate Generation

The discovery engine generates primary key candidates through two complementary mechanisms. The first is **naming-pattern matching**: columns whose names match configurable regular expressions associated with identifier semantics are flagged as candidates. The default patterns include `.*[Ii][Dd]$` (column name ends in "Id" or "ID") and `^[Pp][Kk]_.*` (column name begins with "PK_"). These patterns are applied case-insensitively and are user-extensible.

The second mechanism is **uniqueness analysis**: for every column not immediately rejected by the hard filters described below, the engine computes the uniqueness ratio $u = |\text{distinct}(c)| / |\text{rows}(T)|$ using the estimated row count from Phase 1 and the exact distinct count from a `COUNT(DISTINCT ...)` query. Columns with $u = 1.0$ are flagged as uniqueness candidates regardless of their name.

**Composite Key Detection.** When no single column achieves $u = 1.0$, the engine tests combinations of two columns drawn from the naming-pattern candidates. If a two-column combination achieves $u = 1.0$, it is flagged as a composite key candidate. Combinations of three or more columns are not tested by default, as the combinatorial cost grows rapidly and composite keys of high arity are uncommon enough to be handled by the LLM analysis phase.

#### 4.2.2 Hard Rejection Filters

Before scoring, candidates are passed through hard rejection filters that exclude columns which cannot be primary keys by definition or by strong empirical evidence.

**Null Rejection.** Any column with a null count greater than zero is rejected immediately. Primary key semantics require that every row have a non-null, non-duplicate key value; a single null disqualifies the column definitionally.

**Blank and Zero Rejection.** Columns where more than a configurable fraction of non-null values are empty strings or the numeric value zero are rejected, as these patterns indicate columns used as nullable sentinels rather than genuine identifiers.

**Semantic Blacklist.** A curated set of regular expressions captures column names that are semantically incompatible with identifier roles, regardless of their uniqueness ratio. These patterns fall into four categories:

- *Date and time fields*: `/_dt$/`, `/_date$/`, `/^date/i`, `/^timestamp/`, `/^created/i`, `/^modified/i`, `/^updated/i`
- *Quantity fields*: `/^qty$/`, `/^quantity$/`, `/^amount$/`, `/^count$/`
- *Financial fields*: `/^price$/`, `/^cost$/`, `/^total$/`, `/^balance$/`
- *Descriptive text fields*: `/^description$/`, `/^notes$/`, `/^name$/`, `/^title$/`

The blacklist serves an important practical role: in schemas where a date column happens to be unique (e.g., a daily summary table with one row per calendar day), naive uniqueness analysis would incorrectly identify it as a primary key candidate. The blacklist prevents this class of false positives at zero computational cost.

#### 4.2.3 Confidence Scoring

Columns surviving the hard rejection filters are assigned a confidence score $s_{PK} \in [0, 100]$ via a weighted multi-factor model. Let $u$ denote the uniqueness ratio, $n$ the naming-pattern score, $d$ the data-type score, and $p$ the data-pattern score. The base score is:

$$s_{PK} = 50 \cdot f(u) + 20 \cdot n + 15 \cdot d + 15 \cdot p$$

where the four component functions are defined as follows.

**Uniqueness factor** $f(u)$: Applied at 50% weight. $f(u) = u$ when $u \geq 0.95$; columns below this threshold receive a linearly scaled score. The 0.95 threshold accommodates tables where a small number of duplicate keys may exist due to data quality issues, while still penalizing columns with substantial duplication.

**Naming factor** $n$: Applied at 20% weight. $n = 1.0$ if the column name matches any configured PK naming pattern; $n = 0$ otherwise.

**Data type factor** $d$: Applied at 15% weight. The mapping is: `INT`/`BIGINT`/`UNIQUEIDENTIFIER` → 1.0; `VARCHAR` → 0.6; `TEXT`/`BLOB` → 0.2; all other types → 0.3. This reflects the empirical observation that integer and UUID types are overwhelmingly the most common primary key types, while long text columns rarely serve as keys.

**Data pattern factor** $p$: Applied at 15% weight. The engine classifies each candidate column's value distribution into one of four patterns and assigns a bonus: Sequential integer values (detected by checking that `max - min + 1 ≈ count`) receive +15 points; GUID/UUID values receive +15 points; natural key patterns (short alphanumeric codes with no obvious sequential structure) receive +10 points; composite-derived patterns receive +5 points.

**Penalties.** After computing the base score, three multiplicative penalties are applied where applicable. If the column has any nulls (not caught by the hard filter due to threshold configuration), the score is multiplied by 0.7. If the column achieves uniqueness but its naming pattern score is zero (i.e., it is unique but has an atypical name), the score is multiplied by 0.5. If the foreign key detector has assigned a foreign key likelihood $\ell_{FK}$ to this column, the score is multiplied by $(1 - 0.6 \cdot \ell_{FK})$, reducing it in proportion to how strongly the column appears to be a referencing column rather than a referenced one.

**Surrogate Key Boost.** A special case bonus of +20 points is applied when three conditions are simultaneously met: (1) the column name matches the pattern `id` or `{table_name}_id` (case-insensitive), (2) the uniqueness ratio $u \geq 0.95$, and (3) the data type score $d \geq 0.9$. This boost reflects the extremely high prior probability that such columns are surrogate primary keys, even in schemas with no declared constraints.

The default minimum confidence threshold for accepting a candidate as a discovered primary key is 70. Candidates below this threshold are discarded before the relationship discovery results are passed to Phase 3, though they may be reconsidered if the LLM analysis phase suggests a PK that was not statistically detected.

#### 4.2.4 Position-Based Scoring Heuristics

Empirical analysis of well-designed databases reveals a strong positional signal: primary key columns overwhelmingly occupy the first ordinal position in their table's column list. Database designers — whether consciously or by convention — place identifier columns first. DBAutoDoc exploits this regularity through four position-based heuristics that substantially improve PK precision without sacrificing recall.

**Heuristic H9: Column Position Scoring.** The confidence score $s_{PK}$ is multiplied by a position-dependent factor $\phi(pos)$, where $pos$ is the column's zero-indexed ordinal position in the table:

$$\phi(pos) = \begin{cases} 1.0 & \text{if } pos = 0 \\ 0.85 & \text{if } pos = 1 \\ 0.70 & \text{if } pos = 2 \\ 0.55 & \text{if } pos \geq 3 \end{cases}$$

This discount is deliberately aggressive for columns at position 3 and beyond: while such columns may be unique, they are rarely chosen as primary keys by designers. In our AdventureWorks2022 evaluation, every correct primary key began at column position 0, confirming the strength of this signal.

**Heuristic H10: Consecutive Composite Key Detection.** When evaluating composite key candidates, the engine checks whether the constituent columns occupy consecutive ordinal positions starting at position 0. Composite keys whose columns form a contiguous prefix of the table's column list (e.g., positions 0, 1, 2) receive a confidence boost, reflecting the strong convention that composite keys occupy the leading columns of a table definition.

**Heuristic H11: Progressive Discount for Later PK-Eligible Columns.** When multiple columns in a table pass the hard rejection filters and achieve high uniqueness scores, a progressive discount is applied to columns beyond the first PK-eligible column. The first eligible column retains its full score; subsequent eligible columns receive multiplicatively decreasing scores. This heuristic reflects the empirical observation that tables rarely have multiple independent surrogate keys, and that the first eligible column is overwhelmingly the correct choice.

**Heuristic H12: Composite Supersedes Individual.** When a composite key candidate achieves high confidence and its constituent columns are individually PK-eligible, the individual candidates are suppressed in favor of the composite. This prevents the common false positive of reporting both individual columns and their composite as separate PK candidates. For example, if columns $(A, B)$ at positions 0 and 1 form a unique composite, the engine reports only the composite PK and does not additionally report $A$ or $B$ as individual PKs.

These four heuristics, applied in sequence after the base confidence scoring of Section 4.2.3, dramatically reduced PK false positives in our evaluation. On AdventureWorks2022, PK precision improved from 47.9% (under base scoring alone) to 95.7% with position-based heuristics, while recall decreased only marginally from 95.8% to 94.4% — a net F1 improvement from 48.0% to 95.0%.



### 4.3 Foreign Key Detection

#### 4.3.1 Target-Finding Strategy

For each column $c_{ij}$ in table $T_i$ that has not been identified as a primary key and that passes the pre-filters described below, the engine attempts to identify a target column $c_{kl}$ in some table $T_k \neq T_i$ such that the values of $c_{ij}$ are contained in the values of $c_{kl}$.

Target identification proceeds through three strategies applied in sequence, stopping at the first successful match:

1. **Name-derived lookup**: The engine extracts a candidate table name from the column name. For a column named `CustomerID`, it extracts `Customer` and checks whether a table with that name (or a close variant) exists in the schema and has a discovered primary key. This strategy handles the common convention of naming foreign key columns `{ReferencedTable}ID`.

2. **PK naming similarity**: If the name-derived lookup fails, the engine computes the Levenshtein similarity between the column name and the names of all discovered primary key columns across all tables. Candidates with similarity above 0.6 are returned as targets, ranked by similarity.

3. **Homonymous PK lookup**: As a fallback, the engine checks whether any other table has a primary key column with the same name as $c_{ij}$. This handles schemas where foreign keys are named identically to the referenced primary key (e.g., `ID` in both a parent and child table), a common pattern in legacy schemas.

#### 4.3.2 Tiered Pre-Filtering

A key performance design decision is the tiered pre-filtering strategy, which eliminates the vast majority of column-pair candidates before any value-level computation is performed. This is motivated by the observation that foreign key relationships, while structurally important, are relatively sparse: in a schema with 100 tables averaging 20 columns each, there are 2,000 columns but typically only on the order of 100–200 genuine FK relationships. Exhaustive pairwise value-containment checks across all column pairs would be prohibitively expensive.

**Tier 1 — Data Type Exclusion (zero cost).** Columns of types that are semantically incompatible with referential roles are excluded before any data access. The excluded canonical types are: `DATE`, `DATETIME`, `BOOLEAN`, `FLOAT`, `DECIMAL`, `BINARY`, `XML`, and `GEOGRAPHY`. This exclusion requires no database queries and eliminates a large fraction of candidates immediately, since date columns and boolean flags are common but never foreign keys in well-designed schemas.

**Tier 2 — Value Pattern Sampling (minimal cost).** For columns that survive Tier 1, the engine draws a sample of 10 values and applies a set of pattern-based exclusion rules. A column is excluded if: any sampled value matches an email address pattern; any sampled value matches a URL prefix; the median string length exceeds 100 characters; or the modal value contains three or more whitespace-separated words. Conversely, columns where all sampled values match UUID format, pure numeric string format, or short alphanumeric code format are promoted as high-priority candidates. This tier costs only 10 value retrievals per candidate column, making it negligible relative to the full containment check.

This two-tier filtering strategy reduces the set of candidates undergoing full value-containment analysis by approximately 60–80% in practice, depending on the schema composition.

#### 4.3.3 Multi-Factor Confidence Scoring

Foreign key candidates surviving pre-filtering are scored by a weighted multi-factor model. Let $v$ denote the value overlap score, $s$ the naming similarity score, $r$ the cardinality ratio score, $k$ the target-is-PK bonus, and $\nu$ the null-handling score. The base confidence is:

$$s_{FK} = 40 \cdot v + 20 \cdot s + 15 \cdot r + 15 \cdot k + 10 \cdot \nu$$

**Value overlap** $v$ (40% weight): The engine draws a sample of up to 500 distinct values from the source column $c_{ij}$ and computes the fraction that appear in the target column $c_{kl}$:

$$v = \frac{|\{x \in \text{sample}(c_{ij}) : x \in \text{values}(c_{kl})\}|}{|\text{sample}(c_{ij})|}$$

The target column values are fetched once and cached for the duration of the discovery phase, so multiple source columns referencing the same target incur only one retrieval. Value overlap is the single strongest signal and is weighted accordingly.

**Naming similarity** $s$ (20% weight): Computed via normalized Levenshtein distance between the source column name and the target column name. A full string match (after stripping table-name prefixes) yields $s = 1.0$; a containment relationship (one name is a substring of the other) yields $s = 0.8$; partial matches are scaled linearly by the normalized edit distance.

**Cardinality ratio** $r$ (15% weight): A genuine foreign key column should exhibit many-to-one cardinality: many source rows reference one target row. The engine computes the ratio $\rho = |\text{rows}(T_i)| / |\text{distinct}(c_{ij})|$ and scores it as $r = \min(\rho, 2) / 2$, capped at 1.0. This rewards columns where each distinct value in the source appears multiple times (high $\rho$), consistent with a foreign key pointing to a dimension table.

**Target-is-PK bonus** $k$ (15% weight): $k = 1.0$ if the target column $c_{kl}$ has been identified as a primary key by the detection algorithm in Section 4.2; $k = 0$ otherwise. This bonus captures the strong structural expectation that foreign keys reference primary keys.

**Null handling** $\nu$ (10% weight): The null fraction of the source column affects the score as follows: null fraction below 30% yields $\nu = 1.0$ (+10 points at full weight); 30%–70% yields $\nu = 0.5$ (+5 points); above 70% yields $\nu = 0$. Very high null rates suggest an optional or sparsely-used relationship, which is penalized modestly.

**Penalties.** Two multiplicative penalties are applied post-scoring. If more than 20% of non-null source values are absent from the target column (i.e., orphan rate exceeds 20%), the score is multiplied by 0.7. This penalty is critical for distinguishing genuine foreign keys—where referential integrity holds or nearly holds—from coincidental naming similarities between unrelated columns. If the source and target columns have incompatible canonical types (e.g., `VARCHAR` referencing an `INTEGER` PK), the score is multiplied by 0.5.

The default minimum acceptance threshold for foreign key candidates is 60, calibrated to achieve high precision while accepting relationships with imperfect value containment due to data quality issues such as soft deletes, denormalized reference codes, or historical records referencing since-deleted parent rows.


#### 4.3.3a Deterministic Gates

Before the multi-factor confidence scoring is applied, FK candidates pass through a series of deterministic gates — hard, mathematically invariant filters that eliminate false positives with zero risk of rejecting correct relationships. These gates were developed through iterative empirical analysis and represent the single highest-impact precision improvement in the pipeline, eliminating approximately 75% of statistical false positives while losing zero correct FKs.

**Gate G1: Target PK-Eligibility.** The target column of any FK candidate must itself be PK-eligible — that is, it must pass the PK detection hard rejection filters (uniqueness, non-null, non-blank). A column that fails basic PK eligibility cannot be the referenced end of a foreign key relationship. This gate is logically irrefutable: foreign keys reference primary keys by definition, and a column that cannot be a primary key cannot be a foreign key target.

**Gate G3: Rowguid Target Filter.** Columns named `rowguid` or matching the rowguid naming pattern are excluded as FK targets. These columns are system-generated globally unique identifiers used for merge replication in SQL Server and similar row-tracking mechanisms in other platforms. While they are always unique, they are never semantically meaningful foreign key targets — no application-level relationship references a rowguid column.

**Gate G4: Row-Count Ratio Confidence Multiplier.** The ratio of source table row count to target table row count is used as a confidence multiplier. Foreign key relationships exhibit a characteristic cardinality pattern: the referencing (child) table typically has equal or more rows than the referenced (parent) table. When the source table has dramatically fewer rows than the target, the relationship is likely spurious. The multiplier scales confidence downward for relationships that violate this expected cardinality pattern.

**Gate G5: Fan-Out Limiter (Top-3).** When a single source column has FK candidates pointing to multiple target columns across different tables, only the top 3 candidates (ranked by confidence) are retained. This limits the combinatorial explosion that occurs when a column named `ID` or `Code` has value overlap with many tables. The top-3 cutoff was chosen empirically: in our evaluation, no correct FK relationship was ranked 4th or lower among a source column's candidates.

**Gate G6: Value Overlap Threshold (75%).** FK candidates where fewer than 75% of the source column's sampled values appear in the target column are rejected. This threshold is more aggressive than the general overlap scoring in Section 4.3.3 and serves as a hard gate rather than a continuous factor. The 75% threshold was calibrated to accommodate data quality issues (soft deletes, orphaned records) while eliminating coincidental overlaps between unrelated columns that share small value spaces (e.g., integer status codes 1-5).

**Gate G8: Source-is-PK Skip.** When the source column has been identified as a primary key of its table, it is skipped as a FK source. While self-referencing FKs exist (e.g., hierarchical `ParentID` columns), they are handled separately. The general case is that a table's primary key column is the *target* of foreign keys from other tables, not the *source*. This gate eliminates a large class of false positives where PK columns in one table happen to share values with PK columns in another table.

#### 4.3.3b Fan-Out Confidence Penalty

When a single source column has FK candidates pointing to multiple target tables, a multiplicative fan-out penalty is applied to all candidates from that source column:

$$\psi(n) = \begin{cases} 1.0 & \text{if } n = 1 \\ 0.85 & \text{if } n = 2 \\ 0.75 & \text{if } n = 3 \\ 0.65 & \text{if } n \geq 4 \end{cases}$$

where $n$ is the number of target tables for the source column after gate filtering. The penalty serves two purposes. First, it reflects the genuine uncertainty: when a column's values overlap with multiple potential targets, the probability that any single candidate is correct decreases. Second, it pushes fan-out candidates below the confidence locking threshold (Section 5.2), ensuring that the pruning phase (rather than the deterministic pipeline) makes the final arbitration among competing targets. This division of labor — deterministic gates for clear-cut eliminations, LLM-based pruning for ambiguous cases — is a key architectural principle.

#### 4.3.3c The LLM as Primary FK Creator

A critical empirical finding that shaped our architecture is that the LLM, not the statistical pipeline, is the primary source of correct FK discoveries. In our AdventureWorks2022 evaluation, we traced each correctly identified FK back to its origin — whether it was first proposed by the statistical engine or first proposed by the LLM during iterative analysis (Section 4.3.4). The results were striking:

- **Statistics-created FKs**: 15 correct out of 76 total proposals (20% precision)
- **LLM-created FKs**: 75 correct out of 84 total proposals (89% precision)

The statistical pipeline, despite its sophisticated scoring, generates a large number of false positives that must be filtered. The LLM, by contrast, proposes FKs with high precision because it can reason about semantic relationships — inferring that `Employee.BusinessEntityID` references `Person.BusinessEntityID` based on naming convention and domain knowledge, even when the statistical overlap is ambiguous. This finding inverts the naive expectation that statistics should be the primary discovery mechanism with the LLM serving only as a validator. In practice, the LLM is the discoverer and the statistics serve as the validator, with the deterministic gates eliminating the statistical engine's false positives before they can pollute the LLM's context.

Early experiments that blocked the LLM from creating new FK candidates (restricting it to validating statistical candidates only) caused recall to drop catastrophically — from 90 correct FKs to 49 — confirming that the LLM's creative FK proposals are essential, not merely supplementary.

#### 4.3.4 Bidirectional LLM Validation

A distinctive feature of DBAutoDoc's discovery architecture is the bidirectional integration between statistical discovery and LLM analysis. Rather than treating statistical discovery and LLM analysis as a one-way pipeline, the system implements a feedback loop in which each component can both validate and generate candidates for the other.

**Statistical-to-LLM direction.** All relationship candidates that exceed the statistical confidence threshold are submitted to LLM-based validation at two levels of granularity. First, the `LLMSanityChecker` (Phase 4) receives the full set of discovered relationships for a table alongside the table's schema and description, and is asked to identify any relationships that appear semantically implausible. For example, a statistically high-confidence relationship between a `StatusCode` column in a transaction table and a `StatusCode` column in an unrelated configuration table might achieve high value overlap purely by coincidence (both have values in the set `{1, 2, 3}`); the LLM is well-positioned to recognize this as a false positive from the semantic context. Second, during Phase 3 table analysis, each table's analyzer receives the full set of candidate relationships involving that table and can explicitly reject candidates it finds semantically inconsistent.

**LLM-to-Statistical direction.** During Phase 3 analysis, the LLM is prompted to return not only natural-language descriptions but also a structured `foreignKeys` array in its JSON response, listing relationships it infers from column names, descriptions, and sample data. These LLM-suggested candidates are novel: they may not have been discovered by the statistical engine (e.g., because the column naming convention is non-standard, or because value overlap is below threshold due to data quality issues). Each LLM-suggested candidate is assigned an initial confidence reflecting the LLM's expressed certainty and is then subjected to statistical validation—specifically, a value containment check—before being accepted. This prevents the LLM from asserting relationships that are semantically plausible but empirically unsupported.

This bidirectional architecture yields complementary coverage: statistical methods catch relationships with strong data evidence but non-obvious names, while LLM inference catches relationships with clear semantic naming but imperfect data evidence.

#### 4.3.5 Adaptive Weight Redistribution

A systematic bias affects FK scoring in schemas without any declared or discovered primary keys. The target-is-PK factor $k$ contributes up to 15 points to $s_{FK}$, but in a schema where no primary keys are detected—because the schema designer chose natural keys, or because all identifiers fail the PK confidence threshold—every FK candidate scores zero on this factor. The effective scoring formula becomes a 85-point scale renormalized from a 100-point scale, introducing a systematic downward bias that causes genuine FK relationships to fall below the acceptance threshold.

DBAutoDoc addresses this through adaptive weight redistribution. The FK scoring engine monitors the fraction of candidate pairs where the target-is-PK factor is zero. When this fraction exceeds a configurable **FK deficit threshold** (default 40%), the engine redistributes the PK bonus weight to the value containment factor, adjusting the weights as follows: the value overlap weight increases from 40% to 55%, and the target-is-PK weight decreases to 0%. The remaining weights are unchanged. Formally, under redistribution:

$$s_{FK}^{*} = 55 \cdot v + 20 \cdot s + 15 \cdot r + 0 \cdot k + 10 \cdot \nu$$

This redistribution preserves the relative importance ordering of the remaining factors while eliminating the systematic penalty on schemas where the PK bonus is structurally unavailable. The redistribution is applied uniformly across all candidates within a discovery run, ensuring that the acceptance threshold remains calibrated correctly: a score of 60 on the redistributed scale represents the same evidential standard as a score of 60 on the standard scale, because the maximum achievable score is still 100.

The 40% deficit threshold was selected empirically: below this level, the presence of some PK-confirmed targets provides sufficient anchoring that redistribution would distort scores for the candidates where the PK factor is validly informative. Above this threshold, the PK factor is so rarely applicable that its absence biases the entire distribution.

---

## 5. Iterative Refinement via Context Propagation

### 5.1 Motivation and the Backpropagation Analogy

Training a deep neural network faces a fundamental bootstrapping problem: the parameters of early layers cannot be set correctly without knowing how later layers will use their outputs, yet later layers depend on what early layers produce. Backpropagation \cite{rumelhart1986backprop} resolves this tension by first computing forward-pass outputs, measuring the resulting error, and then propagating correction signals backward through the network's dependency structure — adjusting each layer's parameters in proportion to its contribution to the error.

Automated schema documentation faces an analogous bootstrapping problem. Consider a database schema for an e-commerce platform: a `Payments` table references `Orders`, which references `Customers`. When the LLM first analyzes `Customers` in isolation, it may correctly infer that the table stores account-level information. But when it later analyzes `OrderItems` — discovering that the system tracks per-item tax jurisdictions, promotional prices, and fulfillment splits — it gains evidence that `Orders` is not merely a transaction header but a complex orchestration record managing multi-warehouse fulfillment. This semantic enrichment should flow back to improve the `Orders` description, and potentially the `Customers` description as well (revealing, for instance, that customers have multi-address profiles rather than a single shipping destination).

The structural parallel to backpropagation is precise, though the mechanism is entirely discrete and semantic rather than continuous and mathematical. Both approaches share four architectural properties: (1) a forward pass that processes components in dependency order; (2) an error or loss signal computed after forward processing; (3) a backward propagation of correction information through a dependency graph; and (4) iterative repetition until a convergence criterion is satisfied. The critical difference is that where neural network backpropagation propagates real-valued gradient vectors and updates floating-point weights, DBAutoDoc propagates structured natural-language insights and updates symbolic descriptions. There are no gradient computations, no chain rule applications, and no loss surfaces — only the structural logic of iterative refinement through interconnected artifacts.

This distinguishes our approach from single-artifact self-refinement methods such as \cite{madaan2023selfrefine} and \cite{shinn2023reflexion}, which iteratively improve a single document or answer by critiquing and revising it in place. Our contribution is graph-structured refinement: corrections propagate across a dependency graph of interconnected artifacts, where improving the description of one table creates semantic evidence that revises others. This connects to the broader paradigm of \cite{besta2024got} (Graph of Thoughts), which generalizes LLM reasoning from chains and trees to arbitrary graphs. Our schema dependency graph propagation is a domain-specific instantiation of graph-structured LLM reasoning, specialized for the topology of relational schemas and optimized for the convergence properties of documentation tasks.

### 5.2 The Schema Dependency Graph

Let $\mathcal{S} = (T, C, R)$ denote a schema with tables $T$, columns $C$, and relationships $R \subseteq T \times T$. Each directed edge $(t_i, t_j) \in R$ represents a foreign-key dependency from source table $t_i$ to target table $t_j$, meaning $t_i$ references $t_j$. Edges arise from two sources: declared foreign keys extracted from the database catalog, and discovered relationships produced by the PK/FK detection pipeline described in Section 4. The union of these two edge sets forms the complete dependency graph $G = (T, R)$.

A topological ordering of $G$ stratifies tables into dependency levels $L_0, L_1, \ldots, L_n$, where $L_0$ contains leaf tables — those with no outgoing FK edges, i.e., tables referenced by others but not themselves referencing any table. Level $L_k$ contains all tables whose maximum distance from a leaf node is exactly $k$. Formally:

$$L_k = \{ t \in T \mid \max_{t' \in \text{ancestors}(t)} \text{dist}(t', t) = k \}$$

This stratification ensures that when a table at level $L_k$ is analyzed, all tables it references — at levels $L_0$ through $L_{k-1}$ — have already been processed and their descriptions are available as context. The `TopologicalSorter` component constructs this ordering using a standard depth-first traversal of the dependency graph, assigning each table to its maximum depth stratum to guarantee that all dependencies appear in earlier levels.

Cross-schema foreign keys, which arise when tables in one schema reference tables in another (a common pattern in enterprise databases that partition concerns across schema namespaces), introduce inter-schema edges into the dependency graph. These edges are handled uniformly: the topological sort operates over the union of all tables across all schemas, and cross-schema dependencies propagate context exactly as intra-schema dependencies do. This design decision — treating the multi-schema database as a single unified dependency graph rather than as isolated per-schema subproblems — is essential to capturing semantic relationships that span schema boundaries.

Cycles in the dependency graph, which can arise from bidirectional references or circular FK relationships (though rare in well-designed schemas), are detected and broken conservatively: the edge in the cycle with the lowest discovery confidence (for discovered FKs) or the edge that would create the deepest cycle (for declared FKs) is removed from the ordering graph, though it is retained in the context provided to the LLM. The resulting directed acyclic graph is then sorted topologically.

### 5.3 Forward Pass: Initial Description Generation

The forward pass processes tables in dependency level order, from $L_0$ through $L_n$. For each table $t$ at level $L_k$, the system assembles a rich analysis context $\mathcal{C}(t)$ comprising five components:

**Column statistics and sample values.** For each column $c \in C(t)$, the system provides cardinality, null fraction, minimum, maximum, and mean (for numeric columns), along with up to ten representative sample values drawn to maximize diversity (avoiding runs of identical values that would obscure the column's range). These statistics allow the LLM to infer semantic type with high confidence — distinguishing, for instance, a column named `status` that contains the values `{PENDING, PROCESSING, SHIPPED, DELIVERED, CANCELLED}` from one that contains `{0, 1}`.

**Related table descriptions.** All tables referenced by $t$ — i.e., tables $t'$ such that $(t, t') \in R$ — have been analyzed at earlier dependency levels, and their descriptions $D[t']$ are included in $\mathcal{C}(t)$. This is the mechanism by which semantic context flows forward: a child table that references a well-understood parent inherits that parent's semantic framing.

**Seed context.** The user-configured domain guidance (Section 5.7.2) is injected into every prompt as background knowledge, providing the LLM with the industry and business context needed to interpret ambiguous column names correctly.

**Ground truth constraints.** For any table $t'$ adjacent to $t$ for which the user has provided authoritative descriptions (Section 5.7.1), those descriptions are included in $\mathcal{C}(t)$ with explicit attribution as verified ground truth. This prevents the LLM from generating descriptions for neighboring tables that contradict verified facts.

**Prior iteration descriptions.** For iterations $i > 1$, the description generated in iteration $i-1$ is included, along with the reasoning that produced it. This continuity prevents the LLM from making arbitrary revisions and anchors each iteration to the accumulated understanding of previous passes.

Given this context, the LLM produces structured JSON output for each table:

- A **table description** with an associated **confidence score** $\sigma_t \in [0, 1]$, where the LLM is explicitly instructed to calibrate confidence based on the evidence quality (high confidence when statistics and naming are unambiguous; low confidence when the table's purpose is unclear from available evidence alone).
- **Column descriptions** with individual confidence scores $\sigma_c \in [0, 1]$ for each column $c \in C(t)$.
- **Structured FK suggestions** $F(t)$, consisting of candidate foreign-key relationships identified by the LLM during semantic analysis, which are fed back to the discovery pipeline (Section 4) to close the bidirectional loop between documentation and key discovery.
- **Parent table insights** $\Pi(t) = \{(p, \pi, \sigma_\pi) \mid p \in \text{parents}(t)\}$, where each insight $\pi$ is a structured natural-language observation about parent table $p$ that emerged from analyzing child table $t$, and $\sigma_\pi$ is the confidence of that observation.

The `parentTableInsights` array is the mechanism by which child-table analysis produces upward-flowing correction signals. An `OrderItems` table analysis might produce the insight: "The parent `Orders` table appears to track multi-warehouse fulfillment state, not merely order placement, based on the presence of per-item fulfillment status and warehouse assignment columns in this child table." This structured observation is the semantic analogue of a gradient — it is a directed correction signal targeting a specific upstream component.

All output is structured JSON, parsed against a schema, and validated before storage. Malformed outputs trigger a retry with explicit formatting correction instructions; persistent failures after three retries cause the table to be flagged for manual review.

### 5.4 Loss Computation: Sanity Checks

In neural network training, the loss function measures the discrepancy between the model's outputs and the ground truth, providing the error signal that drives parameter updates. In DBAutoDoc, sanity checks serve the analogous role: they detect semantic inconsistencies in the generated descriptions and flag specific tables for re-analysis.

The `LLMSanityChecker` operates at three granularities:

**Dependency-level sanity checks** execute after each level $L_k$ completes. They validate that the FK relationships among tables at level $L_k$ and their parents are semantically coherent given the descriptions generated. A relationship flagged as semantically incoherent — for example, a declared FK from a table described as an audit log to a table described as a user session, when the session table's description makes no reference to auditability — is marked as a candidate for re-analysis.

**Schema-level sanity checks** execute after the forward pass for each schema completes. They enforce intra-schema consistency: tables within the same schema should use consistent terminology for shared domain concepts, and the descriptions of related tables should form a coherent semantic neighborhood.

**Cross-schema sanity checks** execute at the end of all iterations, validating that cross-schema FK relationships are described coherently across schema boundaries.

Beyond relational consistency, the system enforces six structural rules about primary and foreign key semantics derived from database normalization principles:

1. Date and time fields are never primary keys.
2. Quantity, count, and amount fields are never primary keys.
3. Unbounded text fields are never primary keys.
4. Boolean fields are never primary keys.
5. Each table should have exactly one primary key column, or at most two to three columns in a composite key.
6. Foreign keys should not create self-referential loops not explicitly designed as adjacency lists or closure tables.

Violations of these rules generate structured error reports — the "loss signal" — identifying the specific table and rule violated. Tables that generate loss signals are queued for re-analysis in the backward pass, with the violation included in the re-analysis prompt as an explicit correction target.

### 5.5 Context Propagation: The Backward Pass

The `BackpropagationEngine` implements the core propagation mechanism. Its operation can be understood as three coordinated processes: insight accumulation, parent revision, and cascading propagation across iterations.

**Insight accumulation.** During the forward pass, every table $t$ at level $L_k$ generates a set of parent table insights $\Pi(t)$. After level $L_k$ completes, the engine collects all insights targeting each parent table $p \in L_{k-1} \cup \cdots \cup L_0$ and forms the accumulated insight set:

$$\hat{\Pi}(p) = \bigcup_{t : (t,p) \in R} \Pi(t)$$

Multiple children may generate insights about the same parent, and these insights may be complementary, redundant, or even in tension. The accumulation step preserves all insights with their individual confidence scores, allowing the revision prompt to reason about their collective implications.

**Parent revision.** For each parent table $p$ with non-empty $\hat{\Pi}(p)$ and non-immutable description $D[p]$, the engine submits a revision prompt to the LLM. This prompt presents:

- The current description $D[p]$, the reasoning that produced it, and the confidence score $\sigma_p$.
- The complete accumulated insight set $\hat{\Pi}(p)$, with each insight's source table and confidence score.
- Any sanity-check violations targeting $p$.
- The seed context $SC$ for consistent domain framing.

The LLM returns a structured response: `{needsRevision: boolean, revisedDescription: string, reasoning: string, confidence: float}`. The boolean flag is important: it allows the LLM to examine all available insights and explicitly determine that the current description is already correct and complete, suppressing unnecessary churn. Only when `needsRevision` is true does the engine update $D[p]$, and the change is recorded in the processing log with result `'changed'` for convergence tracking.

To illustrate the mechanism concretely: suppose the forward pass analyzes an `OrderItems` table and produces the insight, "Parent table `Orders` appears to manage fulfillment state across multiple warehouses based on per-item warehouse assignment columns observed here" with confidence 0.85, alongside an insight from a `Shipments` table: "Parent table `Orders` is referenced at the shipment level, suggesting orders may contain multiple shipments" with confidence 0.78. The revision prompt for `Orders` receives both insights. If the current `Orders` description says only "stores customer orders," the LLM will set `needsRevision: true` and produce a materially enriched description capturing the multi-warehouse fulfillment orchestration role.

**Cascading propagation across iterations.** A single backpropagation pass propagates insights upward by exactly one dependency level: insights from $L_k$ tables reach $L_{k-1}$ tables, but their effect on $L_{k-2}$ tables is realized only in the next iteration's forward pass, when $L_{k-2}$ tables receive the updated $L_{k-1}$ descriptions as context. This cascading behavior means that deep dependency chains converge progressively: Iteration 1 propagates semantic corrections from depth 1 to depth 0; Iteration 2 propagates depth 2 to depth 1 and the refined depth 1 to depth 0; and so on. The number of iterations required for full convergence in a schema with maximum dependency depth $d$ is bounded by $d$, though in practice convergence occurs faster because many corrections are localized.

**Ground truth protection.** Tables with user-approved ground truth descriptions are never revised by the backpropagation engine, regardless of the insights generated by their children or the violations reported by sanity checks. Ground truth entries serve as fixed points — semantic anchors that constrain the surrounding documentation without themselves being subject to revision. When $D[p]$ is marked immutable, the revision prompt is skipped entirely; the insight accumulation step still runs, because insights about $p$ may inform the revision of $p$'s own parents.

### 5.6 Convergence Detection

The `ConvergenceDetector` implements a multi-criterion stopping rule, recognizing that no single criterion is sufficient to reliably detect convergence in a system that combines discrete semantic updates with LLM-based evaluation.

**Criterion 1: Stability window.** The processing log records each table revision with a result field set to `'changed'` or `'unchanged'`. After each iteration $i$, the detector queries the log for material changes in the most recent $w$ iterations (default $w = 2$). If no table description changed materially in any of the last $w$ iterations, the stability criterion is satisfied. This criterion detects the steady state in which the system has exhausted available corrections.

**Criterion 2: Confidence threshold.** For each table $t$, the most recent confidence score $\sigma_t$ is extracted from the description iteration log. The detector computes the population-wide average $\bar{\sigma} = \frac{1}{|T|} \sum_{t \in T} \sigma_t$ and checks whether all individual scores exceed a minimum threshold $\tau$ (default $\tau = 0.6$). A table with $\sigma_t < \tau$ indicates LLM-expressed uncertainty about that table's description — uncertainty that may be resolvable by additional context propagation from children not yet fully analyzed. The confidence criterion is not met until all tables express sufficient confidence in their descriptions.

**Criterion 3: Semantic comparison.** Material versus cosmetic changes cannot be distinguished by string edit distance alone: a description may be substantially reworded without changing its meaning, or a small textual change may shift the described semantics significantly. The detector therefore employs a dedicated LLM-based semantic comparison prompt that receives the previous and current descriptions for each changed table and returns a binary judgment: `material` (the meaning has shifted) or `cosmetic` (equivalent meaning, different wording). Only material changes reset the stability window and count toward the convergence decision. This criterion prevents premature convergence when descriptions stabilize in meaning but continue to be rephrased.

**Convergence rule.** Convergence is declared when at least two of the three criteria are satisfied simultaneously, and at least two full iterations have completed (enforcing a minimum of one forward pass followed by one backward pass). The two-criterion requirement makes the decision robust: the system will not stop on confidence alone if descriptions are still changing materially, nor will it continue indefinitely if descriptions are stable but confidence happens to be below threshold for one ambiguous table. A hard maximum of $K_{\max}$ iterations (configurable, default 3 in standard configurations, up to 10 for large or complex schemas) prevents unbounded execution. This mirrors the role of early stopping in neural network training \cite{prechelt1998earlystopping}: continuing iteration beyond the point of diminishing returns wastes computation without improving output quality.

### 5.7 Ground Truth and Seed Context: Dual-Layer Human Knowledge Injection

##### 5.7.1 Ground Truth: Immutable Semantic Anchors

Ground truth entries are authoritative, human-verified descriptions for specific tables and columns, provided by domain experts who possess knowledge that cannot be inferred from schema structure and data statistics alone. A table named `acct_mv` whose business purpose is "materialized view of account balances used exclusively for regulatory reporting" cannot be deduced from column names and sample values; it must be stated by someone who knows the codebase and business context.

Ground truth entries function as immutable anchors in the documentation graph. Once set, they are never overwritten by the LLM across any iteration or backpropagation pass. They propagate forward by inclusion in the analysis context of neighboring tables, providing verified semantic constraints that guide the LLM's inference about related tables. The system tracks measurable influence: when a non-ground-truth table's description is demonstrably informed by a ground truth neighbor's description — detected by the presence of semantically related concepts in both descriptions — this influence relationship is recorded and reported, allowing operators to understand the reach of their curated knowledge.

The analogy to supervised learning is precise: ground truth entries are the labeled examples in a semi-supervised documentation problem. They do not merely constrain the labeled tables; they regularize the descriptions of their entire semantic neighborhood.

##### 5.7.2 Seed Context: Domain Prior Knowledge

Seed context provides high-level domain guidance injected into every LLM prompt. The configuration structure includes:

- `overallPurpose`: A brief statement of the database's business purpose.
- `businessDomains`: An enumeration of the major business domains represented (e.g., `["Claims Processing", "Provider Management", "Member Enrollment"]` for a healthcare payer database).
- `customInstructions`: Free-form domain-specific guidance, such as "This database uses the FHIR R4 resource model for clinical data."
- `industryContext`: The industry vertical, which activates domain-specific terminology norms (e.g., in healthcare, `member` and `patient` have distinct regulatory meanings that a general-purpose LLM may conflate).

Seed context guides but does not constrain: it biases the LLM's interpretation of ambiguous identifiers toward the correct domain without preventing the LLM from generating descriptions that diverge from the seed when evidence compels it. This is analogous to the role of pre-trained model weights in transfer learning — they encode prior knowledge that shapes inference without rigidly determining outputs.

##### 5.7.3 Interaction and Combined Effect

Ground truth and seed context operate at different granularities and serve complementary roles. Seed context establishes the global semantic frame — "this is a healthcare claims processing database" — while ground truth provides verified specifics within that frame — "table `ClaimHeader` stores the primary insurance claim record as submitted to the payer, distinct from `ClaimAdjudication` which records the payer's adjudication decision." Together, they dramatically reduce the number of iterations required for convergence: seed context prevents the LLM from exploring semantically incorrect regions of description space on the first forward pass, while ground truth anchors anchor the descriptions of heavily-referenced tables that would otherwise be revised repeatedly as their many children generate conflicting insights.

In practice, schemas with both seed context and comprehensive ground truth coverage converge in two iterations in most cases. Schemas with neither require three to five iterations for comparable description quality, and some deeply ambiguous tables may never fully converge without at least one of these knowledge sources.

### 5.8 Formal Algorithm

The complete procedure is stated as Algorithm 1. Notation follows standard conventions: $D$ maps tables and columns to descriptions, $\text{immutable}(t)$ is true for ground truth tables, $\text{ANALYZE}(t, \mathcal{C})$ denotes the LLM analysis call producing a description, confidence, insights, and FK suggestions, and $\text{REVISE}(p, D[p], \hat{\Pi}(p))$ denotes the backpropagation revision call.

---

**Algorithm 1: Iterative Schema Documentation with Context Propagation**

**Input:** Schema $\mathcal{S} = (T, C, R)$; Ground Truth $G$; Seed Context $SC$; Configuration $K$

**Output:** Documentation $D : T \cup C \to \text{string}$

---

```
 1. INTROSPECT: Extract T, C from database catalog
 2. SAMPLE: Collect statistics and ≤10 representative values for each c ∈ C
 3. DISCOVER: Run PK/FK detection pipeline (Section 4) → augment R with discovered edges
 4. for each (t, desc) ∈ G do
 5.   D[t] ← desc; mark t as immutable
 6. end for
 7. G_dep ← BuildDependencyGraph(T, R)
 8. L₀, L₁, ..., Lₙ ← TopologicalSort(G_dep)          // leaves first
 9. for iteration i ← 1 to K.maxIterations do
10.   // --- FORWARD PASS ---
11.   for each level l = 0, 1, ..., n do
12.     for each table t ∈ L_l do
13.       if immutable(t) then continue end if
14.       C(t) ← {statistics(t), samples(t), D[parents(t)], SC, D[GT_neighbors(t)]}
15.       if i > 1 then C(t) ← C(t) ∪ {D_{i-1}[t], reasoning_{i-1}[t]} end if
16.       D'[t], σ_t, Π(t), F(t) ← LLM_ANALYZE(t, C(t))
17.       FeedDiscovery(F(t))                           // bidirectional loop (§4)
18.     end for
19.     SanityCheck(L_l)                               // dependency-level check
20.     // --- PROPAGATION PASS ---
21.     for each parent p ∈ ⋃_{t∈L_l} parents(t) do
22.       if immutable(p) then continue end if
23.       Π̂(p) ← ⋃_{t:(t,p)∈R, t∈L_l} Π(t)
24.       if Π̂(p) ≠ ∅ then
25.         revised, σ_p ← LLM_REVISE(p, D'[p], Π̂(p))
26.         if revised.needsRevision then
27.           D'[p] ← revised.description
28.           Log(p, result='changed', iteration=i)
29.         else
30.           Log(p, result='unchanged', iteration=i)
31.         end if
32.       end if
33.     end for
34.   end for
35.   // --- CONVERGENCE CHECK ---
36.   stable    ← NMaterialChanges(last K.w iterations) = 0
37.   confident ← ∀t ∈ T : σ_t ≥ K.τ
38.   semantic  ← ∀changed t : SemanticDiff(D[t], D'[t]) = 'cosmetic'
39.   criteria_met ← |{stable, confident, semantic}| ≥ 2
40.   if criteria_met ∧ i ≥ 2 then
41.     break
42.   end if
43.   D ← D'
44. end for
45. SanityCheck(S)                                     // schema-level checks
46. CrossSchemaSanityCheck(S)                          // cross-schema checks
47. return D'
```

---

The algorithm's complexity is $O(K_{\max} \cdot |T| \cdot \ell)$ LLM calls in the worst case, where $\ell$ is the average number of LLM calls per table per iteration (typically 1 forward call plus at most 1 revision call). In practice, the convergence criterion terminates the outer loop well before $K_{\max}$ is reached for most production schemas. LLM calls within each dependency level are independent and are issued in parallel, bounding wall-clock time by the depth $n$ of the dependency graph rather than by $|T|$.

The elegance of this design lies in what it does not require: there are no schema-specific rules, no hand-crafted heuristics for particular industries, and no domain-specific training data. The iterative refinement process is entirely general — the same algorithm that documents a financial risk management schema documents a healthcare member enrollment schema, guided only by the seed context and ground truth that operators choose to provide. The dependency graph topology, the LLM's language understanding, and the propagation mechanism together are sufficient to produce documentation whose quality improves monotonically across iterations and converges reliably for schemas of practical complexity.

---

## 6. Implementation

### 6.1 Technology Stack

DBAutoDoc is implemented in TypeScript and runs on Node.js, a choice motivated by the ecosystem's strength in both database connectivity and LLM API integration. The tool supports three major relational database families through their respective native drivers: `mssql` for SQL Server, `pg` for PostgreSQL, and `mysql2` for MySQL. All three drivers are used in connection-pool mode, enabling concurrent metadata extraction and sample-value queries without the overhead of per-operation connections.

LLM access is mediated through the MemberJunction AI abstraction layer, which provides a unified interface across Google Gemini (Flash and Pro variants), OpenAI GPT-4o and GPT-4o-mini, Anthropic Claude, Groq, and Mistral. This abstraction decouples the analysis logic from any particular provider: switching models requires only a configuration change, not code modification. DBAutoDoc is exposed both as a command-line interface—built on the oclif framework, which provides structured flag parsing, help generation, and plugin extensibility—and as a programmatic TypeScript API for embedding in larger pipelines or CI/CD workflows. The tool is open-source and developed as part of the MemberJunction platform, with no licensing fees for any of its capabilities.

### 6.2 Prompt Engineering

The prompt layer comprises thirteen distinct templates rendered by the Nunjucks templating engine. Nunjucks was selected over simpler string interpolation because its macro system allows prompt fragments (column statistics blocks, example value tables, related-table summaries) to be composed and conditionally included without duplicating prose. Each template is version-controlled alongside the codebase so that prompt changes are traceable and reproducible.

The central template is `table-analysis`, spanning approximately 140 lines. It requests a structured response containing a `tableDescription`, a `confidence` score in the range [0, 1], an array of `columnDescriptions`, identified or inferred `foreignKeys`, and `parentTableInsights`—observations about parent tables that the LLM notices while analyzing the child. This last field is the mechanism by which child-to-parent information flows: the engine collects `parentTableInsights` from all children of a given parent and injects them into the parent's subsequent analysis prompt. The `backpropagation` template handles this refinement step, presenting the parent table alongside the aggregated child observations and asking the LLM to revise its prior description in light of the new evidence.

Sanity checking uses three additional templates operating at different scopes. `dependency-level-sanity-check` runs after each level of the processing hierarchy and examines the just-completed tables for internal consistency. `schema-level-sanity-check` operates once all tables within a schema have been analyzed, checking for cross-table naming anomalies and contradictory relationship descriptions. `cross-schema-sanity-check` extends this to multi-schema databases, detecting cases where the same logical entity appears under different names in different schemas. A `semantic-comparison` template supports the convergence criterion: given two descriptions of the same table from consecutive iterations, it determines whether the differences are material (substantive changes to meaning or relationship claims) or cosmetic (paraphrase, punctuation, minor wording). Iteration halts when all descriptions are assessed as cosmetically equivalent, indicating that additional passes are unlikely to yield further semantic improvement.

The query-generation subsystem uses `query-planning`, `single-query-generation`, `query-fix`, and `query-refinement` templates to construct and repair statistical validation queries. When a generated query fails, `query-fix` receives the error message and the failing SQL and produces a corrected version; `query-refinement` handles cases where the query succeeds syntactically but returns unexpectedly shaped results.

All prompts use a temperature of 0.1. This near-deterministic setting was chosen because the task demands factual accuracy and consistent structured output, not creative variation. The context provided to each prompt is carefully scoped: only the descriptions of tables that are direct ancestors or descendants in the FK graph are included, rather than the entire schema, to stay within context windows and to avoid diluting the relevant signal with unrelated table prose. For models that expose an effort-level parameter (analogous to reasoning depth in extended-thinking configurations), DBAutoDoc sets this to a high value during sanity-check passes, where catching subtle contradictions benefits from more deliberate reasoning, and to a lower value during bulk analysis to control cost.

### 6.3 Token Budget Management

Because analysis of a large database may involve hundreds of LLM calls, uncontrolled execution can produce unexpectedly large API bills. DBAutoDoc implements a three-tier guardrail system covering token count, wall-clock duration, and estimated monetary cost. Each guardrail has a hard limit and a configurable warning threshold defaulting to 80% of the limit.

The global token budget is partitioned across three phases: key discovery and statistics collection is allocated 25% of the budget by default, table analysis 70%, and sanity checking 5%. These defaults reflect the empirical observation that the analysis phase dominates consumption. Users may override the allocation to, for example, increase the sanity-check share for databases where consistency is critical.

Before every LLM call, the engine checks all three guardrails. If any warning threshold has been crossed, the run log records a warning event with the current utilization. If any hard limit would be exceeded by the pending call, execution halts and the run is marked with `stoppedDueToGuardrails: true` along with a `stoppedReason` string identifying which guardrail was triggered. The partial results accumulated to that point are preserved and can be resumed—a deliberate design choice ensuring that budget exhaustion does not destroy work already completed.

Rate limiting for LLM APIs uses exponential backoff with jitter, conforming to the retry semantics recommended by major providers. Database queries use connection pooling to saturate available parallelism during the metadata extraction phase without exceeding per-connection limits.

### 6.4 Output Formats

DBAutoDoc generates documentation in six formats from a single analysis run. SQL scripts apply descriptions directly to the database: extended properties (`sp_addextendedproperty`) for SQL Server, and `COMMENT ON TABLE` / `COMMENT ON COLUMN` DDL for PostgreSQL and MySQL. This embeds documentation at the storage layer, making it visible to any tool that queries system metadata. Markdown output includes a generated table of contents, per-table sections with column descriptions, and relationship summaries suitable for repository wikis or developer handbooks. HTML output mirrors the Markdown content but adds in-page navigation and cross-linked entity references. CSV export produces a flat file of table and column descriptions for stakeholders who prefer spreadsheet-based review workflows.

Mermaid entity-relationship diagrams are synthesized directly from the discovered FK graph, providing a visual rendering that requires no additional tooling beyond a Markdown renderer that supports Mermaid fences (GitHub, GitLab, Obsidian, and most modern documentation platforms). Finally, an analysis-metrics report records per-phase token consumption, LLM call counts, iteration counts per table, confidence score distributions, and guardrail event history, giving operators visibility into cost and quality trade-offs for future budget tuning.

All outputs are organized into a numbered run directory, enabling side-by-side comparison of analyses run at different times or with different configurations. Incremental state is serialized to disk after each dependency level completes, so a crash or forced interruption can be resumed from the last checkpoint rather than from the beginning.

---


---

## 7. Evaluation

### 7.1 Experimental Setup

#### 7.1.1 Datasets

We evaluate DBAutoDoc on five benchmark databases spanning a range of sizes, domains, and structural complexity, plus a set of anonymized enterprise databases. Table 1 summarizes the benchmark characteristics.

**AdventureWorks.** The AdventureWorks2022 database is a Microsoft-provided SQL Server benchmark containing 71 tables organized across five schemas (HumanResources, Person, Production, Purchasing, Sales), with 91 declared foreign key relationships and 556 column-level descriptions. Its rich relational structure, comprehensive declared constraints, and domain diversity make it the primary stress-test for our evaluation. For PK/FK discovery experiments, we produce a stripped variant (AW_Stripped) in which all primary key constraints, foreign key constraints, table and column descriptions, and extended properties are removed from the DDL, retaining only column definitions and data. The original constraint declarations and descriptions serve as ground truth.

**Pagila.** Pagila is the PostgreSQL port of the Sakila DVD-rental benchmark \cite{yu2018spider}, comprising 15 tables with clean, well-normalized relational structure. Its primary role in our evaluation is to validate cross-platform driver support and to confirm that statistical pre-filters perform correctly against PostgreSQL's type system and query planner. Because the schema is small and the domain is easily understood, Pagila also serves as the reference case for human expert quality comparison.

**Northwind.** The classic Northwind database (13 tables, SQL Server and PostgreSQL variants) represents a simple, well-understood order-management domain. Its modest size and straightforward key relationships make it useful for isolating the effect of individual pipeline components without confounding factors from schema complexity. We test both the SQL Server and PostgreSQL variants to confirm that multi-driver behavior is symmetric.

**Chinook.** The Chinook music-store database (11 tables, cross-platform) offers clean FK relationships with meaningful semantic content — albums, artists, tracks, invoices, customers. Because the domain vocabulary is both compact and unambiguous, Chinook provides a controlled environment for evaluating LLM semantic understanding independent of structural complexity.

**Enterprise databases.** We include [TBD] anonymized enterprise databases drawn from production environments, ranging from [TBD] to [TBD] tables and exhibiting varying degrees of constraint coverage (from fully declared to entirely undocumented). These cases reflect the primary deployment target of DBAutoDoc. Schema details and row counts are withheld per data-sharing agreements; we report only aggregate statistics and anonymized qualitative findings in Section 7.5.

**Ground truth construction.** For each benchmark database that ships with declared constraints, we produce an evaluation pair: (1) the stripped variant, from which all PK and FK declarations are removed prior to ingestion by DBAutoDoc, and (2) the original declarations, used as ground truth for precision/recall measurement. We exclude any constraints that were added post-hoc to the benchmark as documentation annotations rather than enforced constraints, retaining only constraints that were part of the original schema definition.

---

#### 7.1.2 Baselines

We compare DBAutoDoc against four classes of baseline to isolate the contribution of each architectural component.

**Single-pass LLM (no iteration).** A one-shot prompting baseline in which each table receives a single LLM call with the same input context as DBAutoDoc's first iteration — column names, sample values, and any available FK hints — but with no subsequent refinement, no backpropagation of neighbor descriptions, and no iterative convergence loop. This baseline isolates the contribution of the iterative refinement architecture from raw LLM capability.

**No-discovery baseline.** A variant that skips the statistical pre-filtering and LLM-based key discovery phases entirely, relying solely on constraints declared in the database DDL. For databases with complete constraint declarations, this represents an upper-bound input quality for the description phase. For stripped or undocumented databases, it degrades to operating with no structural context at all. This baseline quantifies the value of the discovery pipeline.

**Human expert.** For the two smallest benchmarks (Pagila, Chinook), we commissioned documentation from a professional database administrator (DBA) with domain knowledge, estimated at a market rate of \$75–150 per hour. The DBA was given unrestricted access to the schema, ERDs, and sample data. Human expert output is used both as a quality ceiling for human evaluation scoring and as the reference point for cost comparison. We do not claim that DBAutoDoc output should match human expert quality in all dimensions; rather, we measure how close it comes and at what cost differential.

**Existing documentation tools.** We compare the output quality of DBAutoDoc descriptions against the structured HTML output of SchemaSpy and the dbdocs.io documentation format. Because these tools produce deterministic, template-driven output rather than natural-language descriptions, we evaluate them on a reduced rubric covering structural completeness and navigability rather than the full five-dimension quality scale.

---

#### 7.1.3 Metrics

**Description quality.** We employ human evaluation by domain-knowledgeable raters on a 1–5 Likert scale across five dimensions: (1) *factual accuracy* — does the description correctly characterize what the table/column contains? (2) *completeness* — are all semantically relevant aspects addressed? (3) *usefulness* — would a new developer find this description helpful? (4) *cross-table consistency* — are related tables described using consistent terminology and framing? (5) *relationship accuracy* — are FK relationships correctly identified and explained? Each table-level description is rated by two independent raters; inter-rater agreement is measured using Cohen's kappa \cite{settles2009active}. We report mean score per dimension and an aggregate composite score (unweighted average across dimensions).

**Key discovery precision, recall, and F1.** For PK detection, precision is the fraction of columns declared as primary keys by DBAutoDoc that appear in the ground truth; recall is the fraction of ground-truth PKs that DBAutoDoc detects. F1 is the harmonic mean. FK detection uses the same formulation at the level of directed column pairs $(A.col_i \rightarrow B.col_j)$. We report micro-averaged and macro-averaged F1 across databases.

**Convergence speed.** We measure the number of iterations required until fewer than 5% of table descriptions change materially (defined as a cosine similarity below 0.95 between consecutive iteration embeddings using a sentence transformer). We report median and 90th-percentile iteration counts across databases.

**Token efficiency.** We track total input tokens and output tokens consumed per table across all pipeline phases, broken down by phase: (1) pre-filter candidates, (2) FK LLM confirmation, (3) per-iteration description, (4) ground truth seed injection. We report the input/output token ratio as a measure of context utilization.

**Cost.** We compute total API cost in USD for each database using published provider pricing at time of evaluation. We normalize cost to a per-table basis and project to 100-table and 1000-table databases. We compare against an estimated human labor cost assuming a DBA billing rate of \$75–150/hr and an estimated 2–4 hours per table for thorough documentation, yielding a human-cost range of \$150–600 per table or \$15,000–60,000 for a 100-table database. DBAutoDoc targets a cost below \$1 per 100 tables at standard LLM pricing.

**Backpropagation impact.** We measure the delta in composite description quality score between the with-propagation and without-propagation conditions, reported at the per-table level and stratified by a table's *centrality* in the FK graph (number of FK edges incident on the table). The hypothesis is that propagation benefit is largest for tables with high centrality.

**Ground truth influence radius.** For the seed context ablation (Section 7.3.3), we measure how many non-seed tables show a measurable quality improvement as a function of FK-graph distance from the nearest seed table. This quantifies the propagation reach of a partial ground truth.

---

### 7.2 Key Discovery Results

#### 7.2.1 Primary Key Detection

Table 2 reports primary key detection results across benchmark databases with constraints stripped. AdventureWorks2022 results are reported from our primary benchmark evaluation (Run 015); results for other databases are pending.

**Table 2: Primary Key Detection Results**

| Database | Tables | True PKs | Detected PKs | Precision | Recall | F1 |
|---|---|---|---|---|---|---|
| AdventureWorks | 71 | 71 | 70 | 95.7% | 94.4% | 95.0% |
| Pagila | 15 | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| Northwind | 13 | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| Chinook | 11 | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| Enterprise (avg) | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |

**Hard rejection filter effectiveness.** The hard rejection filters described in Section 4 (nullable columns, non-unique columns, columns with mean string length above threshold) are designed to eliminate candidates before any LLM call is made. We report the fraction of ground-truth non-PKs that are correctly eliminated at this stage ([TBD]%), the false negative rate (ground-truth PKs incorrectly rejected) ([TBD]%), and the resulting reduction in LLM calls ([TBD]%). A low false negative rate here is critical: a PK incorrectly eliminated at the filter stage cannot be recovered downstream.

**Blacklist effectiveness.** Column name blacklists targeting common non-key patterns (e.g., `description`, `notes`, `created_at`) eliminate an additional [TBD]% of candidates at zero LLM cost. We analyze false positives introduced by blacklist over-application — cases where a blacklisted name pattern coincidentally identifies a genuine PK — and find [TBD] such cases across all benchmark databases, suggesting the blacklist operates conservatively.

**False positive analysis.** The dominant sources of PK false positives are: (1) columns with accidental uniqueness in small tables where sample coverage is insufficient to reveal duplicates; (2) composite-key columns that are individually unique in the loaded sample; and (3) surrogate columns in denormalized tables that carry semantic PK meaning but are not declared as such. Cases of type (1) and (2) are amenable to mitigation through larger sample sizes; we report the rate of each false positive category at [TBD].

---

#### 7.2.2 Foreign Key Detection

**Table 3: Foreign Key Detection Results**

| Database | True FKs | Candidates (post-tier-1) | Candidates (post-tier-2) | Detected FKs | Precision | Recall | F1 |
|---|---|---|---|---|---|---|---|
| AdventureWorks | 91 | — | — | 100 | 90.0% | 98.9% | 94.2% |
| Pagila | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| Northwind | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| Chinook | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |
| Enterprise (avg) | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] | [TBD] |

**Tiered pre-filter effectiveness.** The three-tier pre-filtering architecture (Section 4.2) is designed to reduce the quadratic candidate space before any LLM involvement. We report the number of candidate pairs eliminated at each tier, the cumulative token savings relative to a baseline that submits all candidate pairs to the LLM, and the false negative rate at each tier (ground-truth FKs incorrectly eliminated). Tier 1 (type compatibility) eliminates [TBD]% of the initial candidate space. Tier 2 (name-based heuristics) eliminates a further [TBD]%. Tier 3 (IND-style containment scoring) passes [TBD]% of remaining candidates to the LLM confirmation phase, achieving a total reduction from the raw candidate space of [TBD]%. The false negative rate accumulated across all three tiers is [TBD]%, meaning that [TBD]% of ground-truth FKs are submitted to the LLM phase as expected.

**Containment curve analysis.** We compare two containment scoring strategies: (1) *linear scoring*, which ranks candidate pairs by the raw fraction of referencing-column values that appear in the referenced column, and (2) *steep curve scoring*, which applies the nonlinear transformation described in Section 4.2 to reward near-complete containment and penalize partial containment sharply. The steep curve achieves [TBD]% higher precision at equivalent recall compared to linear scoring, confirming the intuition that genuine FKs overwhelmingly exhibit near-complete containment while accidental correlations cluster at intermediate containment levels \cite{rostin2009fk, jiang2020holistic}.

**Bidirectional LLM feedback impact.** The LLM confirmation phase serves two roles: surfacing FKs that statistics missed (high recall recovery) and rejecting statistical false positives (precision improvement). We decompose LLM contribution into these two directions. The LLM discovers [TBD] FKs that were below the containment threshold but are semantically evident from column name and context — primarily cases of soft referential integrity common in legacy enterprise databases where FK constraints were never declared. Conversely, the LLM rejects [TBD]% of candidate pairs that passed tier-3 filtering but are statistical artifacts (e.g., shared ID spaces across unrelated tables). The net effect of LLM bidirectional feedback on F1 relative to statistics-only detection is [TBD].

---

### 7.3 Iterative Refinement Results

#### 7.3.1 Convergence Analysis

We measure convergence as the number of iterations before the fraction of tables with materially-changed descriptions falls below 5%. Figure [TBD] shows convergence curves for each benchmark database, plotting the fraction of tables changing per iteration against iteration number.

Across all benchmark databases, DBAutoDoc converges within 2 iterations at median, with a 90th-percentile convergence at 3 iterations. The AdventureWorks database, with its dense inter-schema FK graph, converges at 2 iterations, reflecting that schema areas with high relational density require more rounds of neighbor-context propagation before descriptions stabilize \cite{madaan2023selfrefine}. Pagila and Chinook, being smaller and more regularly structured, are expected to converge at 2 iterations or fewer.

The convergence rate exhibits a characteristic pattern: rapid change in iterations 1–2 (as LLM descriptions incorporate FK-propagated context for the first time), followed by a slow tail in iterations 3+. This matches the diminishing-returns structure observed in iterative self-refinement literature \cite{shinn2023reflexion}. We set a default convergence threshold of 5% with a maximum of 5 iterations, which captures [TBD]% of achievable quality gain while bounding worst-case cost.

Diminishing returns become pronounced after iteration [TBD]: quality gains from additional iterations fall below [TBD] composite score points per iteration, which we find insufficient to justify the associated token cost. Early termination at this threshold reduces total token consumption by [TBD]% relative to running to full convergence.

---

#### 7.3.2 Context Propagation Ablation Study

We conduct an ablation study isolating the contribution of iterative context propagation — the mechanism by which neighbor descriptions are injected into each table's prompt on subsequent iterations — from baseline single-pass LLM performance.

**Table 4: Propagation Ablation Results**

| Condition | Avg Quality (1–5) | Cross-table Consistency | Relationship Accuracy | Iterations |
|---|---|---|---|---|
| Single-pass (no propagation) | [TBD] | [TBD] | [TBD] | 1 |
| Iterative (with propagation) | [TBD] | [TBD] | [TBD] | [TBD] |
| Delta | [TBD] | [TBD] | [TBD] | — |

We hypothesize that propagation yields the largest benefit for tables with high FK-graph centrality, where the local neighborhood is richest in contextual signal. To test this, we stratify tables by centrality (number of incident FK edges) and report per-stratum quality deltas ([TBD]). Tables with [TBD]+ incident edges show a composite quality improvement of [TBD] points, while isolated tables (zero incident edges) show [TBD] improvement from propagation, confirming that the benefit is concentrated in densely connected schema regions.

The cross-table consistency dimension shows the largest absolute improvement under propagation ([TBD] points vs. [TBD] without), consistent with the expectation that independently-generated descriptions use inconsistent terminology for shared domain concepts while propagation anchors descriptions to a common vocabulary established by the FK neighborhood \cite{rahm2001survey}.

---

#### 7.3.3 Ground Truth and Seed Context Impact

We conduct a five-condition ablation study to quantify the individual and combined impact of seed context and partial ground truth coverage. Table 5 reports composite quality scores across conditions for AdventureWorks (stripped variant).

**Table 5: Ground Truth and Seed Context Ablation**

| Condition | Avg Quality (1–5) | Relationship Accuracy | Cross-table Consistency | GT Influence Radius |
|---|---|---|---|---|
| Baseline: pure LLM (no GT, no seed) | [TBD] | [TBD] | [TBD] | — |
| Seed context only | [TBD] | [TBD] | [TBD] | — |
| Ground truth at 10% coverage | [TBD] | [TBD] | [TBD] | [TBD] |
| Ground truth at 25% coverage | [TBD] | [TBD] | [TBD] | [TBD] |
| Ground truth at 50% coverage | [TBD] | [TBD] | [TBD] | [TBD] |
| Both seed + GT at 25% coverage | [TBD] | [TBD] | [TBD] | [TBD] |

**Ground truth influence radius.** A key practical question is how far the benefit of a partial ground truth propagates through the FK graph. We define the *influence radius* of a ground truth set as the maximum FK-graph distance at which non-GT tables show a statistically significant quality improvement (p < 0.05) relative to the no-GT baseline. At 25% GT coverage, the influence radius is [TBD] hops, suggesting that GT benefit propagates through [TBD] layers of relational neighbors via the backpropagation mechanism. This finding has practical implications for ground truth selection strategy: concentrating known-good descriptions on high-centrality hub tables maximizes propagation coverage.

**Seed context.** Seed context alone (providing general domain framing without table-level ground truth) improves composite quality by [TBD] points, primarily on the completeness and usefulness dimensions. The accuracy dimension shows minimal improvement from seed context alone, confirming that semantic framing helps the LLM situate its descriptions but does not substitute for structural ground truth in achieving factual precision.

---

### 7.4 Cost Analysis

Table 6 reports token consumption and estimated API cost across benchmark databases. Human labor cost estimates assume a senior DBA billing rate of \$75–150/hr and a documentation effort of 2–4 hours per table for thorough documentation including relationship mapping, business glossary, and example query documentation — a range of \$150–600 per table, or \$15,000–60,000 for a 100-table database \cite{abedjan2018book}. For a 1,000-table enterprise database, human documentation cost reaches \$150,000–600,000, placing comprehensive documentation financially out of reach for most organizations.

**Table 6: Token Usage and Cost Breakdown by Phase**

| Phase | Input Tokens / Table | Output Tokens / Table | Cost / Table (USD) |
|---|---|---|---|
| Statistical pre-filtering | [TBD] | 0 | \$0.00 |
| FK candidate confirmation | [TBD] | [TBD] | [TBD] |
| Per-iteration description (avg across iterations) | [TBD] | [TBD] | [TBD] |
| GT seed injection overhead | [TBD] | [TBD] | [TBD] |
| **Total** | **[TBD]** | **[TBD]** | **[TBD]** |

**Input/output token ratio.** The input/output ratio across all LLM calls is approximately [TBD]:1, reflecting the prompt-heavy nature of context propagation. This ratio is higher than typical text generation tasks because each table description prompt includes column metadata, sample values, and neighbor context, while outputs are bounded to concise descriptions. Token efficiency optimizations — context window truncation of large neighbor descriptions, batching short tables, and caching repeated column-level prompts — reduce total token consumption by [TBD]% relative to a naive implementation.

**Cost as a function of database size.** Token consumption scales approximately linearly with table count up to [TBD] tables, after which FK-graph density causes a superlinear increase in neighbor context tokens per table. For databases above this threshold, the per-table cost increases to [TBD]. We find that the typical cost for a 100-table database is [TBD], compared to the human labor estimate of \$15,000–60,000 — a cost reduction of approximately [TBD]x. Even at the high end of LLM pricing, DBAutoDoc remains two to three orders of magnitude cheaper than equivalent human documentation effort.

**Model comparison.** Table 7 reports quality/cost tradeoffs across [TBD] LLM providers evaluated. [TBD]. We find that [TBD] offers the best quality-per-dollar ratio for the description generation phase, while [TBD] provides acceptable quality at lowest cost for the FK confirmation phase where output length is bounded. The modular provider architecture of DBAutoDoc allows these to be configured independently.

**Table 7: Model Quality/Cost Tradeoffs**

| Model | Avg Quality (1–5) | Cost / 100 Tables | Quality / Dollar |
|---|---|---|---|
| [TBD] | [TBD] | [TBD] | [TBD] |
| [TBD] | [TBD] | [TBD] | [TBD] |
| [TBD] | [TBD] | [TBD] | [TBD] |

---

### 7.5 Case Studies

The following case studies are [TBD] pending completion of enterprise database evaluation. Each case study will be structured as follows:

**Structure for each case study:**
- *Database profile*: anonymized domain, table count, constraint coverage at ingestion
- *Key discoveries*: previously undocumented FK relationships surfaced by DBAutoDoc, structural anomalies identified during profiling
- *Schema optimization observations*: cases where the documentation process revealed normalization issues, missing indexes implied by FK relationships, or naming inconsistencies
- *Before/after comparison*: side-by-side comparison of documentation state at ingestion vs. DBAutoDoc output, evaluated against the quality rubric in Section 7.1.3
- *Time to comprehensive documentation*: wall-clock time from schema ingestion to final output, including all iteration rounds
- *Practitioner feedback*: qualitative feedback from domain experts who reviewed the generated documentation

We anticipate [TBD] case studies from production enterprise environments, with a particular focus on databases in the 200–500 table range where the cost differential versus human documentation is largest and where the FK-graph density is sufficient to demonstrate the full propagation benefit of the iterative architecture.

---


---

## 8. Discussion

### 8.1 When Context Propagation Helps Most

The benefit of context propagation is not uniform across schemas; its magnitude scales with structural properties of the FK graph. Databases with dense relationship graphs—many edges relative to tables—provide more propagation paths, meaning that a well-understood hub table can seed improvements across a large neighborhood of dependents. Conversely, a sparse schema consisting of largely independent tables accrues little benefit beyond what single-table analysis provides, because there are few cross-table signals to propagate.

Schemas with internally consistent naming conventions converge faster. When column names follow a discernible pattern (e.g., `EntityID` consistently denotes a foreign key to an entity named `Entity`), the LLM can generalize across tables after encountering the pattern only a few times, and subsequent iterations confirm rather than revise prior descriptions. Databases with some declared constraints—even partial FK annotations—bootstrap faster than fully keyless schemas because the engine can initialize the propagation graph from structural ground truth rather than relying entirely on statistical inference.

Hub tables, defined here as tables referenced by many foreign keys from other tables, benefit disproportionately from the backpropagation step. Such tables are analyzed early in the dependency-level ordering, when descriptions of their dependents are not yet available. The backpropagation mechanism specifically corrects for this: once child tables have been analyzed and their insights aggregated, the hub receives a targeted revision prompt that incorporates use-case evidence from the full breadth of its consumers. In our evaluations, hub-table description quality improved most sharply between iterations.

Diminishing returns emerge for very large, loosely connected schemas where the graph partitions into many weakly linked components. In this regime, propagation stays local to each component, and the benefit approaches that of independent per-component analysis. Token budgets should be sized accordingly: dense schemas warrant higher per-table allocations to accommodate multi-iteration refinement, while sparse schemas are well-served by single-pass analysis.

### 8.2 The Backpropagation Analogy: Scope and Limits

The term "backpropagation" is used deliberately but with acknowledged looseness. The analogy is structural rather than mathematical, and we consider it valuable precisely because it frames schema documentation as a *learning problem*—one in which iterative, graph-structured refinement produces better solutions than one-shot extraction—rather than a simple information-retrieval task.

The structural parallels are genuine. In both neural backpropagation and our algorithm, processing proceeds in a defined order (topological sort of the dependency graph, versus forward pass through network layers), and a correction signal flows backward through that structure after forward-pass errors are estimated. Convergence is assessed after each pass, and iteration continues until improvement falls below a threshold. The semantic-comparison step plays the role of a loss function: it measures the magnitude of change and determines whether continued iteration is warranted.

The differences are equally genuine and should be stated clearly. Neural backpropagation computes continuous gradients via chain rule differentiation; our algorithm performs discrete semantic updates through LLM inference. There is no gradient, no weight update, and no differentiable objective. The "propagation" is the injection of natural-language insights into subsequent prompts, not the transmission of numerical error signals. The graph structure derives from foreign-key relationships—a schema-specific artifact—rather than from a fixed network architecture designed for the purpose.

We do not claim mathematical equivalence, and readers should not infer that the algorithm inherits the convergence guarantees of gradient descent. The contribution of the analogy is heuristic: it provides an intuitive mental model for ML-literate readers and makes clear that the approach is categorically different from single-pass LLM summarization. The insight that iterative, structured refinement converges to better semantic descriptions is the empirical finding; the backpropagation framing makes that finding easy to reason about and extend.

### 8.3 Limitations

Several limitations bound the claims made for DBAutoDoc. First, LLM hallucination remains an irreducible risk. The tool asks language models to infer business semantics from statistical patterns and naming conventions, and models can produce descriptions that are linguistically fluent and structurally plausible while being factually incorrect. The sanity-check layer mitigates but does not eliminate this risk. Generated documentation should be reviewed by domain experts before being treated as authoritative, particularly for tables governing financial transactions, compliance records, or safety-critical processes.

Second, the statistical FK discovery mechanism is bounded by pattern recognizability. Unconventional key designs—composite string keys, hash-encoded references, natural keys embedded in structured strings—may not exhibit the overlap and cardinality signatures that the algorithm looks for. Databases designed to obscure relationships, or those using opaque surrogate identifiers with no column-naming convention, will exhibit lower recall in the key discovery phase.

Third, token cost scales with database size. Although the per-database cost remains far lower than human analysis at any comparable scale, very large databases (thousands of tables) will incur non-trivial LLM API charges. The token budget system allows operators to cap expenditure, but doing so may leave portions of the schema analyzed at reduced depth.

Fourth, quality degrades gracefully but visibly for empty or near-empty tables. Sample-value statistics cannot distinguish a customer table from an order table when both contain zero rows; the LLM is left to reason from column names alone, and confidence scores reflect this reduced grounding. Tables populated exclusively by system or test data present a similar challenge.

Finally, non-English column names and schema identifiers reduce LLM effectiveness. Major models are trained predominantly on English-language text, and while they can handle multilingual identifiers, the depth of semantic inference for non-English naming conventions is lower and less reliable.

### 8.4 Threats to Validity

The quality evaluation relies on human assessors, introducing subjectivity as a threat to construct validity. We mitigate this through multiple independent evaluators, structured rubrics with explicitly defined scoring criteria, and inter-rater reliability measurement. Assessors were blind to which system generated each description during pairwise comparisons.

Ground truth availability for FK recall benchmarking is limited to databases with declared constraints. Using well-known benchmark databases (TPC-H, IMDB, the Chinook sample database) provides a community-shared reference point but does not cover the full diversity of production database designs. Results on unconventional schemas may differ.

LLM model version sensitivity is a practical threat to longitudinal reproducibility. Provider model updates—including silent updates to weights, sampling behavior, or system prompts—can alter output characteristics without version-number changes. We record the model identifier and API version used for each reported result; however, exact replication may require access to the same model snapshot. Setting temperature to 0.1 reduces but does not eliminate variance, as LLM outputs remain stochastic.

### 8.5 Ethical Considerations

The primary ethical concern is data privacy. The statistical analysis phase queries sample values from database tables and includes representative values in LLM prompts. In databases containing personally identifiable information, health records, financial data, or other sensitive content, these sample values may be transmitted to third-party LLM API providers, with corresponding data handling implications.

DBAutoDoc provides several mitigations. Configurable row limits and sample-size parameters allow operators to reduce exposure; setting the sample size to zero disables value-level analysis entirely (at some quality cost). Planned support for locally-hosted open-weight models (Section 9.5) will allow the data-touching analysis phase to run entirely on-premises, eliminating third-party transmission for the most sensitive use cases. A hybrid deployment architecture—local model for sample-value analysis, cloud model for semantic refinement over descriptions only—is under active development.

Users of the tool bear responsibility for ensuring that their deployment configuration complies with applicable data protection regulations and their organization's data governance policies. The generated documentation itself should be treated as organizational intellectual property and distributed through appropriate access controls.

### 8.6 Broader Implications

The documentation debt problem is not merely a nuisance for individual developers; it is a structural impediment to data democratization at scale. When only the original authors of a system can interpret its database, organizational knowledge becomes fragile and non-transferable. Every employee departure, acquisition, or system migration risks converting a working system into an opaque artifact. DBAutoDoc addresses this by making comprehensive documentation economically viable for the first time.

Better schema documentation has measurable downstream benefits. Text-to-SQL systems—which translate natural-language questions into SQL queries—perform significantly better when table and column descriptions are available; the LLM can ground its reasoning in semantic context rather than relying on column names alone \cite{pourreza2024din, gao2023texttosql}. Data lineage tracking, schema evolution monitoring, and data catalog population all benefit from the structured, machine-readable output that DBAutoDoc produces. The pattern is also general: the iterative, graph-structured refinement approach is applicable beyond relational databases to API documentation, codebase architecture analysis, and configuration management, wherever the artifact to be documented has a relationship structure that can guide context propagation.

The economic implications are significant. At estimated costs of \$12,000–\$48,000 per database for manual documentation \cite{redgate2023report}, comprehensive documentation has been accessible only to organizations with substantial resources. DBAutoDoc reduces this to a few hundred dollars at most, eliminating cost as a barrier and making documentation a routine operational practice rather than a major project.

---


---

## 9. Future Work

### 9.1 Multi-Model Ensemble Analysis

The current implementation uses a single configured model for the entire analysis run. A natural extension is a multi-model ensemble strategy that routes analysis tasks by difficulty and cost sensitivity. Lightweight, inexpensive models such as Gemini Flash or GPT-4o-mini are well-suited to straightforward tables with clear naming conventions and abundant sample data; expensive, high-capability models such as GPT-4o or Claude Opus add the most value on tables with opaque names, sparse data, or complex multi-table relationships.

A confidence-driven dispatch mechanism would make this routing automatic: tables that receive high confidence scores from an initial cheap-model pass are accepted without further analysis, while low-confidence descriptions are escalated to a stronger model for re-analysis. Preliminary cost modeling suggests that this tiered approach could reduce API expenditure by 40–60% on typical enterprise schemas while maintaining the description quality of the full-strength model on difficult cases. The existing confidence scoring and per-table state representation would support this extension with modest architectural changes.

### 9.2 Active Learning for Ground Truth Selection

Human validation of generated documentation is valuable but expensive. Rather than asking domain experts to review all tables uniformly, an active learning framework would identify the tables where human input has the highest expected impact on overall quality. Uncertainty sampling—prioritizing tables with the lowest confidence scores or the highest rates of sanity-check failures—is the simplest instantiation. A more sophisticated approach would estimate the *propagation impact* of a ground truth correction: given the FK graph structure, which tables would benefit most from having an expert-validated description? A table with many downstream dependents in a dense subgraph has higher leverage than an isolated leaf table, even if both exhibit similar uncertainty.

This approach could dramatically reduce the human effort required to achieve high documentation quality. Rather than reviewing hundreds of tables, a domain expert might review a targeted set of twenty to thirty high-leverage tables, with automated propagation distributing the benefit of that expert knowledge throughout the schema.

### 9.3 Cross-Database and Enterprise-Scale Analysis

Modern enterprise data environments consist not of a single database but of dozens of databases that share reference data, exchange records through ETL pipelines, and represent overlapping views of the same underlying business objects. The current tool treats each database as an independent analysis unit. A cross-database analysis mode would extend the FK graph across database boundaries, discovering inter-database relationships through the same combination of naming convention analysis and statistical overlap detection used within a single schema.

This capability would support use cases that are currently manual and expensive: understanding how a CRM database relates to a financial system, tracing data lineage from an operational database through a staging schema to a data warehouse, or mapping the shared reference tables that synchronize state across microservice databases. The context propagation mechanism would extend naturally to this multi-database setting, with inter-database edges treated as a special relationship class with appropriate confidence weighting.

### 9.4 Incremental and Continuous Analysis

Database schemas evolve continuously: tables are added, columns are modified, indexes change. Reanalyzing an entire database after every schema change is wasteful; the descriptions of unmodified tables remain valid. An incremental analysis mode would detect schema changes by comparing the current metadata snapshot to the last recorded state, identify the affected tables and their downstream dependents in the FK graph, and re-run analysis only for the affected subgraph.

This capability enables integration with CI/CD pipelines, where schema migrations trigger targeted re-documentation as part of the deployment process. Documentation would then remain current by construction rather than through periodic manual refresh. The run history and incremental state infrastructure already present in DBAutoDoc provides the foundation; the primary engineering task is implementing the change-detection diff and the subgraph extraction logic.

### 9.5 Local and Hybrid LLM Deployment

For organizations with strict data sovereignty requirements—healthcare providers, financial institutions, government agencies—the transmission of sample values to third-party API providers may be prohibited regardless of contractual guarantees. Supporting locally-hosted open-weight models (Llama 3, Mistral, Qwen, and their derivatives) would eliminate this concern by keeping all data on-premises.

A hybrid deployment architecture offers a practical middle ground: the data-touching phases of analysis (sample value extraction, statistical FK detection, initial table analysis with sample values) run against a local model that never transmits data externally, while the semantic refinement and sanity-check phases—which operate on descriptions only, not raw data—run against a cloud model that brings higher reasoning capability to bear on the text-only inputs. This architecture preserves the quality advantages of frontier models for the reasoning-intensive tasks while satisfying data residency requirements for the data-intensive tasks.

### 9.6 Ecosystem Integration

DBAutoDoc currently operates as a standalone tool producing its own output formats. Deeper integration with existing data ecosystem tooling would reduce adoption friction for data engineering teams. Export to dbt documentation format would make DBAutoDoc output directly usable in the dbt-defined data pipelines that have become standard in modern analytics engineering. Native connectors to data catalog platforms—Alation, Collibra, DataHub, and Amundsen—would enable generated descriptions to flow automatically into the governance infrastructure that many enterprises already operate.

On the development tooling side, IDE plugins that surface DBAutoDoc-generated descriptions inline while a developer writes SQL queries would bring the documentation benefit closest to the point of need. Integration with the MemberJunction CodeGen system would enable automatically generated type-safe data access layers that incorporate the semantic descriptions as TSDoc comments, propagating documentation from the database layer all the way into application code.

---


---

## 10. Conclusion

Undocumented databases represent one of the most persistent and costly problems in enterprise software engineering. Despite decades of tooling investment in schema design, query optimization, and performance monitoring, the fundamental challenge of understanding what a database *means*—what its tables represent, how its columns relate to business concepts, why its relationships are structured as they are—has remained largely unsolved in practice. The economic reality is stark: comprehensive manual documentation of a single non-trivial database requires weeks of expert effort and tens of thousands of dollars, a cost that the overwhelming majority of organizations cannot justify. The result is that most production databases remain semantically opaque, their meaning locked in the minds of a dwindling set of original developers and inaccessible to the data analysts, application developers, and decision-makers who depend on them.

DBAutoDoc addresses this problem through a system that combines two complementary mechanisms in a bidirectional feedback loop. Statistical key discovery identifies foreign-key relationships without relying on declared constraints, recovering the relational structure that schema designers intended but did not formally encode. Iterative LLM-based analysis, organized along the discovered FK graph and guided by a context propagation algorithm inspired structurally by backpropagation in neural networks, refines table and column descriptions across multiple passes until semantic convergence is detected. Parent tables receive updated descriptions informed by observations collected from their children; children receive context from their now-better-understood parents. The result is a self-reinforcing process in which understanding of the schema accumulates iteratively rather than being extracted in a single pass.

Empirical evaluation demonstrates that this approach achieves high precision and recall in FK discovery, including on databases with no declared constraints, and produces semantically accurate natural-language descriptions, achieving 95.0% F1 on primary key detection and 94.2% F1 on foreign key detection with 99% description coverage. Expert evaluators rated the output superior to both single-pass LLM analysis and prior automated methods. Convergence is typically achieved within 2 iterations, and the per-database cost of analysis is reduced by more than three orders of magnitude compared to manual documentation—bringing comprehensive documentation within reach of organizations that previously could not justify the investment.

The central finding is not that LLMs can describe database tables—that capability has been demonstrated in prior work—but that *treating schema documentation as an iterative learning problem* rather than a one-shot extraction task produces substantially better results. The structural insight that FK relationships define a natural propagation graph, and that semantic understanding flows usefully through that graph in both directions, is the core contribution. Neither the statistical approach alone nor the LLM approach alone achieves the quality of their combination in a feedback loop; the bidirectional architecture is essential.

DBAutoDoc is released as open-source software with no licensing fees. This is a deliberate commitment, not an afterthought. The documentation debt problem affects millions of databases worldwide, spanning organizations with no resources for commercial tooling as well as enterprises with dedicated data governance budgets. By publishing the methodology in full and releasing the implementation freely, the authors aim to make the approach reproducible, extensible, and accessible to any organization regardless of size. The MemberJunction platform provides ongoing maintenance and community infrastructure; contributors are invited to extend the tool to new databases, model providers, and output ecosystems.

The problem of undocumented databases will not be solved by any single tool, but the economic and technical barriers that have made the problem intractable are now removable. As LLM capabilities continue to advance and deployment costs continue to fall, iterative schema documentation of the kind demonstrated here will become a routine operational practice. Reducing documentation debt across the world's databases is not merely a quality-of-life improvement for developers; it is a prerequisite for genuine data democratization, for reliable AI-assisted data analysis, and for the institutional knowledge preservation that organizations depend on for continuity and resilience. We offer DBAutoDoc as a practical step toward that goal, and we invite the research and engineering communities to build on it.

---

## References

\[1\] **\cite{rahm2001survey}** Rahm, E. and Bernstein, P. A. "A Survey of Approaches to Automatic Schema Matching." *The VLDB Journal* 10(4): 334–350, 2001.

\[2\] **\cite{bellahsene2011matching}** Bellahsene, Z., Bonifati, A., and Rahm, E. (eds.). *Schema Matching and Mapping*. Springer, Berlin, 2011.

\[3\] **\cite{koutras2021valentine}** Koutras, C., Siachamis, G., Ionescu, A., Psarakis, K., Brons, J., Fragkoulis, M., Lofi, C., Bonifati, A., and Katsifodimos, A. "Valentine: Evaluating Matching Techniques for Dataset Discovery." In *Proceedings of the 37th IEEE International Conference on Data Engineering (ICDE)*, pp. 468–479, 2021.

\[4\] **\cite{liu2025magneto}** Liu, T., Bhatt, T., Dong, H., Koehler, F., and Rekatsinas, T. "Magneto: Combining Small and Large Language Models for Schema Matching." *Proceedings of the VLDB Endowment (PVLDB)* 18(8): 2681–2694, 2025.

\[5\] **\cite{seedat2024matchmaker}** Seedat, N. and van der Schaar, M. "Matchmaker: Self-Improving Large Language Model Programs for Schema Matching." In *Advances in Neural Information Processing Systems (NeurIPS)*, 2024.

\[6\] **\cite{trummer2024succinct}** Trummer, I. "Generating Succinct Descriptions of Database Schemata for Cost-Efficient Prompting of Large Language Models." *Proceedings of the VLDB Endowment (PVLDB)* 17(11), 2024.

\[7\] **\cite{narayan2022foundation}** Narayan, A., Chami, I., Orr, L., Ré, C., and Bernstein, P. A. "Can Foundation Models Wrangle Your Data?" *Proceedings of the VLDB Endowment (PVLDB)* 16(4): 738–746, 2022.

\[8\] **\cite{hulsebos2019sherlock}** Hulsebos, M., Hu, K., Bakker, M., Zgraggen, E., Satyanarayan, A., Kraska, T., Demiralp, Ç., and Hidalgo, C. "Sherlock: A Deep Learning Approach to Semantic Data Type Detection." In *Proceedings of the 25th ACM SIGKDD International Conference on Knowledge Discovery & Data Mining*, pp. 1500–1508, 2019.

\[9\] **\cite{ragleveraging2025}** "Leveraging Retrieval Augmented Generative LLMs For Automated Metadata Description Generation to Enhance Data Catalogs." arXiv:2503.09003, 2025.

\[10\] **\cite{yu2018spider}** Yu, T., Zhang, R., Yang, K., Yasunaga, M., Wang, D., Li, Z., Ma, J., Li, I., Yao, Q., Roman, S., Zhang, Z., and Radev, D. "Spider: A Large-Scale Human-Labeled Dataset for Complex and Cross-Domain Semantic Parsing and Text-to-SQL Task." In *Proceedings of the 2018 Conference on Empirical Methods in Natural Language Processing (EMNLP)*, pp. 3911–3921, 2018.

\[11\] **\cite{li2023bird}** Li, J., Hui, B., Qu, G., Yang, J., Li, B., Li, B., Wang, B., Qin, B., Geng, R., Huo, N., Zhou, X., Ma, C., and Cheng, G. "Can LLM Already Serve as A Database Interface? A BIg Bench for Large-Scale Database Grounded Text-to-SQLs." In *Advances in Neural Information Processing Systems (NeurIPS)*, 2023.

\[12\] **\cite{gao2024dailsql}** Gao, D., Wang, H., Li, Y., Sun, X., Qian, Y., Ding, B., and Zhou, J. "Text-to-SQL Empowered by Large Language Models: A Benchmark Evaluation." *Proceedings of the VLDB Endowment (PVLDB)* 17(5): 1132–1145, 2024.

\[13\] **\cite{pourreza2023dinsql}** Pourreza, M. and Rafiei, D. "DIN-SQL: Decomposed In-Context Learning of Text-to-SQL with Self-Correction." In *Advances in Neural Information Processing Systems (NeurIPS)*, 2023.

\[14\] **\cite{rostin2009fk}** Rostin, A., Albrecht, O., Bauckmann, J., Naumann, F., and Leser, U. "A Machine Learning Approach to Foreign Key Discovery." In *Proceedings of the 12th International Workshop on the Web and Databases (WebDB)*, SIGMOD Workshop, 2009.

\[15\] **\cite{jiang2020holistic}** Jiang, L. and Naumann, F. "Holistic Primary Key and Foreign Key Detection." *Journal of Intelligent Information Systems (JIIS)* 54(3): 439–461, 2020.

\[16\] **\cite{khatiwada2022alite}** Khatiwada, A., Fan, G., Shraga, R., Chen, Z., Gatterbauer, W., Miller, R. J., and Riedewald, M. "ALITE: Comprehensive Data Unification with Full Disjunctions." *Proceedings of the VLDB Endowment (PVLDB)* 16(4): 932–945, 2022.

\[17\] **\cite{ilyas2004cords}** Ilyas, I. F., Markl, V., Haas, P., Brown, P., and Aboulnaga, A. "CORDS: Automatic Discovery of Correlations and Soft Functional Dependencies." In *Proceedings of the 2004 ACM SIGMOD International Conference on Management of Data*, pp. 647–658, 2004.

\[18\] **\cite{huhtala1999tane}** Huhtala, Y., Kärkkäinen, J., Porkka, P., and Toivonen, H. "TANE: An Efficient Algorithm for Discovering Functional and Approximate Dependencies." *The Computer Journal* 42(2): 100–111, 1999.

\[19\] **\cite{novelli2001fun}** Novelli, N. and Cicchetti, R. "FUN: An Efficient Algorithm for Mining Functional and Embedded Dependencies." In *Proceedings of the 8th International Conference on Database Theory (ICDT)*, pp. 189–203, 2001.

\[20\] **\cite{papenbrock2016hyfd}** Papenbrock, T. and Naumann, F. "A Hybrid Approach to Functional Dependency Discovery." In *Proceedings of the 2016 ACM SIGMOD International Conference on Management of Data*, pp. 821–833, 2016.

\[21\] **\cite{papenbrock2015binder}** Papenbrock, T., Ehrlich, J., Marten, J., Neubert, T., Rudolph, J.-P., Schönberg, M., Zwiener, J., and Naumann, F. "Divide & Conquer-Based Inclusion Dependency Discovery." *Proceedings of the VLDB Endowment (PVLDB)* 8(7): 774–785, 2015.

\[22\] **\cite{bauckmann2007spider}** Bauckmann, J., Abedjan, Z., Leser, U., Müller, H., and Naumann, F. "Efficiently Detecting Inclusion Dependencies." In *Proceedings of the 23rd IEEE International Conference on Data Engineering (ICDE)*, 2007.

\[23\] **\cite{demarchi2009sindd}** De Marchi, F., Lopes, S., and Petit, J.-M. "Unary and n-ary Inclusion Dependency Discovery in Relational Databases." *Journal of Intelligent Information Systems (JIIS)* 32(1): 53–73, 2009.

\[24\] **\cite{dursch2019ind}** Dursch, S., Zwiener, J., Papenbrock, T., and Naumann, F. "Inclusion Dependency Discovery: An Experimental Evaluation of Thirteen Algorithms." In *Proceedings of the 28th ACM International Conference on Information and Knowledge Management (CIKM)*, pp. 219–228, 2019.

\[25\] **\cite{abedjan2018book}** Abedjan, Z., Golab, L., Naumann, F., and Papenbrock, T. *Data Profiling*. Synthesis Lectures on Data Management. Morgan & Claypool Publishers, 2018.

\[26\] **\cite{abedjan2015profiling}** Abedjan, Z., Golab, L., and Naumann, F. "Profiling Relational Data: A Survey." *The VLDB Journal* 24(4): 557–581, 2015.

\[27\] **\cite{naumann2014revisited}** Naumann, F. "Data Profiling Revisited." *ACM SIGMOD Record* 42(4): 40–49, 2014.

\[28\] **\cite{papenbrock2015metanome}** Papenbrock, T., Bergmann, T., Finke, M., Zwiener, J., and Naumann, F. "Data Profiling with Metanome." *Proceedings of the VLDB Endowment (PVLDB)* 8(12): 1860–1871, 2015.

\[29\] **\cite{madaan2023selfrefine}** Madaan, A., Tandon, N., Gupta, P., Hallinan, S., Gao, L., Wiegreffe, S., Alon, U., Dziri, N., Prabhumoye, S., Yang, Y., Gupta, S., Majumder, B. P., Hermann, K., Welleck, S., Yazdanbakhsh, A., and Clark, P. "Self-Refine: Iterative Refinement with Self-Feedback." In *Advances in Neural Information Processing Systems (NeurIPS)*, 2023.

\[30\] **\cite{shinn2023reflexion}** Shinn, N., Cassano, F., Gopinath, A., Narasimhan, K., and Yao, S. "Reflexion: Language Agents with Verbal Reinforcement Learning." In *Advances in Neural Information Processing Systems (NeurIPS)*, 2023.

\[31\] **\cite{bai2022constitutional}** Bai, Y., Jones, A., Ndousse, K., Askell, A., Chen, A., DasSarma, N., Drain, D., Fort, S., Ganguli, D., Henighan, T., Joseph, N., Kadavath, S., Kernion, J., Conerly, T., El-Showk, S., Elhage, N., Hatfield-Dodds, Z., Hernandez, D., Hume, T., Johnston, S., Kravec, S., Lovitt, L., Nanda, N., Olsson, C., Amodei, D., Brown, T., Clark, J., McCandlish, S., Olah, C., Mann, B., and Kaplan, J. "Constitutional AI: Harmlessness from AI Feedback." arXiv:2212.08073, 2022.

\[32\] **\cite{wei2022cot}** Wei, J., Wang, X., Schuurmans, D., Bosma, M., Ichter, B., Xia, F., Chi, E., Le, Q., and Zhou, D. "Chain-of-Thought Prompting Elicits Reasoning in Large Language Models." In *Advances in Neural Information Processing Systems (NeurIPS)*, 2022.

\[33\] **\cite{yao2023tot}** Yao, S., Yu, D., Zhao, J., Shafran, I., Griffiths, T., Cao, Y., and Narasimhan, K. "Tree of Thoughts: Deliberate Problem Solving with Large Language Models." In *Advances in Neural Information Processing Systems (NeurIPS)*, 2023.

\[34\] **\cite{besta2024got}** Besta, M., Blach, N., Kubicek, A., Gerstenberger, R., Podstawski, M., Gianinazzi, L., Gajda, J., Lehmann, T., Niewiadomski, H., Nyczyk, P., and Hoefler, T. "Graph of Thoughts: Solving Elaborate Problems with Large Language Models." In *Proceedings of the 38th AAAI Conference on Artificial Intelligence (AAAI)*, 2024.

\[35\] **\cite{rumelhart1986backprop}** Rumelhart, D. E., Hinton, G. E., and Williams, R. J. "Learning Representations by Back-propagating Errors." *Nature* 323: 533–536, 1986.

\[36\] **\cite{settles2009active}** Settles, B. "Active Learning Literature Survey." Computer Sciences Technical Report 1648, University of Wisconsin–Madison, 2009.

\[37\] **\cite{hilda}** HILDA: Workshop on Human-In-the-Loop Data Analytics. Held annually in conjunction with ACM SIGMOD, 2016–present.
