# DBAutoDoc and NVIDIA Auto-Ontology: a comparison, and how they fit together

*Written 2026-11-12. Auto-Ontology was read at commit
[`fc43a82`](https://github.com/NVIDIA/auto-ontology/tree/fc43a82600e18b19d159c52023f54f5572f537ac)
(2026-11-09). Paths into their code below are relative to that tree. DBAutoDoc was read at
`packages/DBAutoDoc` on MJ `next`.*

Credit where it is due: [NVIDIA Auto-Ontology](https://github.com/NVIDIA/auto-ontology) is an
Apache-2.0 project from NVIDIA. Every idea below attributed to it is theirs. Nothing here is a
claim about how well it performs: we read the code, we did not benchmark it.

---

## 1. What each one is

**DBAutoDoc** recovers the structure and meaning of a database nobody documented. It finds
primary keys and foreign keys from statistics and iterative LLM analysis, writes table and
column descriptions, and exports the result (HTML, Markdown, Mermaid ERD, CSV, SQL
extended properties, and `additionalSchemaInfo` JSON). Its accuracy is measured blind against
ground truth on public databases ([`research/v1`](../v1/README.md)).

DBAutoDoc deliberately sits **below the MemberJunction layer**. It runs against SQL Server,
PostgreSQL and MySQL with no MJ database, no MJ metadata and no MJAPI. It uses a few MJ
*library* packages (the AI provider abstraction in `@memberjunction/ai`, the class factory and
helpers in `@memberjunction/global`), but its only links *to* MJ are two optional outputs:
SQL extended properties (which MJ CodeGen reads as descriptions) and `additionalSchemaInfo`
(which MJ CodeGen reads as soft keys). Anyone can point it at a database and get
documentation, whether or not they run MJ.

**Auto-Ontology** is a **context layer for text-to-SQL agents**. It assumes a catalog whose
keys are largely declared, and builds a business layer on top: *Terms* (business concepts
mapped to columns), *SQL attributes* (reviewed, reusable SQL expressions such as a margin),
and relationships between them. Humans *certify* names, descriptions and SQL attributes, and
an agent answers questions from the result, served over MCP, REST and a web UI.

The two overlap on one step: inferring keys and descriptions from a raw schema. Everything
DBAutoDoc does after that is documentation and export; everything Auto-Ontology does after
that is semantics and question answering.

---

## 2. How Auto-Ontology builds its ontology

Entry point `semantic/compile.py` → `run_semantic_compilation`. Per table, three tables at a
time (`semantic/pipeline.py`):

1. **Profile** (`semantic/visit_enter.py: calculate_columns_profiling`): `SELECT * … LIMIT 1000`;
   per column an `is_unique` flag and the five most common values; optional `SELECT DISTINCT`
   probes for low-cardinality text; date/timestamp notation detected by validating every
   sampled value against `strptime` candidates (`semantic/date_format.py`).
2. **FK, PK and table-grain guess** (`semantic/fk_suggester.py`): one structured LLM call per
   table, mostly name-driven, with samples and `is_unique` in the prompt. The same call
   classifies the table as a junction or not, conservatively, including junctions that carry
   payload columns. A non-unique UUID column is treated as an FK without asking.
3. **Column descriptions** for undescribed columns (`semantic/deterministic.py`), in batches of 15.
4. **Terms** (`semantic/term_extractor.py`): usually one business Term per table, every non-FK
   column assigned to it with a display label; synonyms extracted only when written in the
   description. Term names are committed in a fixed table order so parallel runs are
   deterministic (`_OrderedCommitQueue`).
5. **FK target resolution** (`semantic/semantic_fk.py`): declared FKs go straight through.
   Otherwise the column is embedded, the five nearest column attributes are pulled from
   pgvector, and an LLM picks one or abstains. On abstention it checks whether *every* sampled
   value exists in a same-named candidate column.
6. **Pruning** (`prune_disjoint_semantic_fks`): an inferred FK is dropped only when the source
   column and target share **no** value at all.
7. **SQL attributes from query history** (`semantic/sql_attribute_suggester.py`): queries come
   from `pg_stat_activity`, Snowflake `QUERY_HISTORY` and ClickHouse `system.query_log`; sqlglot
   extracts filters, aggregations and functions; an LLM names the useful ones. (Their code
   documents that usage ranking always scores 0, a known bug they kept on purpose.)
8. **Bridge tables** (`semantic/bridge_tables.py`): a pure-FK junction table gets a join
   expression attached to the Term of one of the tables it links, chosen by a reranker.
9. **Certification**: `name_certified` and `description_certified` flags on catalog and
   ontology rows (`dal/schema.py`), set from the UI, preferred by the agent.

Around that: ten connectors (PostgreSQL, MySQL, Databricks, Snowflake, ClickHouse, Trino,
Kyuubi, HeavyDB, DuckDB, SQLite), a LangGraph text-to-SQL agent with value checks and SQL
repair, an MCP server with `check_answerable`, Apache Ossie import/export, Postgres plus
pgvector storage, Next.js UI, Helm chart. Default models are NVIDIA Nemotron NIMs; any
OpenAI-compatible endpoint works.

---

## 3. Side by side

| | DBAutoDoc | Auto-Ontology |
|---|---|---|
| Problem | Recover the structure and meaning of an undocumented schema | Give agents reliable business context for text-to-SQL |
| Position | Standalone tool below any app layer; optional MJ outputs | Full application: services, UI, store, agent |
| Key discovery | Statistical candidates, six deterministic FK gates, four PK position heuristics, LLM proposals, two-pass pruning | One name-driven LLM call per table, embedding search, LLM pick |
| Checking keys against data | `JoinProbe` containment ratio, value-overlap gate (75%), cardinality gates | Zero-overlap pruning only; uniqueness from a 1,000-row sample |
| Iteration | Repeats until stable, backpropagates child findings to parents, locks keys at confidence ≥ 90 | Single pass |
| Keys across source systems | Organic-key clustering, multi-hop transitive bridge views | None |
| Accuracy evidence | Blind PK/FK F1 on AdventureWorks, Chinook, Northwind, LousyDB; paper | No key-discovery numbers; evaluated end to end on BIRD text-to-SQL ([ontology-sql-eval](https://github.com/NVIDIA/ontology-sql-eval)) |
| Customer values | `JoinProbe` returns two counts, never a value | Top-5 samples stored and placed in prompts; FK fallback queries literal sampled values |
| Engines | SQL Server, PostgreSQL, MySQL | Ten engines above; **no SQL Server** |
| Business layer | Table and column descriptions | Terms, synonyms, display labels, SQL attributes |
| Query history | Not used | Mined for SQL attributes |
| Human review | `groundTruth` and seed context supplied up front | Per-field certification after the fact |
| Question answering | Out of scope | Built in, plus MCP `check_answerable` |
| Outputs | HTML, Markdown, Mermaid, CSV, extended properties, `additionalSchemaInfo`, sample queries | Postgres graph, pgvector, native YAML, Apache Ossie YAML |
| License | Business Source License 1.1 | Apache-2.0 |

---

## 4. Where each is stronger

**DBAutoDoc** is much more rigorous on key discovery, which is the part that matters when
nothing is declared. Auto-Ontology's inference is close to the approach DBAutoDoc's own
benchmarks rejected: name-driven LLM guesses checked only by "is there any overlap at all". A
`LIMIT 1000` sample also calls many low-cardinality columns unique. DBAutoDoc also keeps
customer values out of the LLM path for key verification, works on SQL Server, and finds keys
that cross source systems.

**Auto-Ontology** goes much further after the schema is understood: business Terms, reusable
SQL measures, human certification, an answering agent, answerability checks, MCP access, and a
standard interchange format. It also uses one signal DBAutoDoc ignores: what people actually
query.

---

## 5. Using them together

Because DBAutoDoc stands alone, the natural arrangement is a pipeline: **DBAutoDoc discovers,
Auto-Ontology serves.**

```
undocumented database
        │
        ▼
  DBAutoDoc  ── keys + descriptions (blind-benchmarked, values never leave the DB)
        │
        ├──► MJ CodeGen (extended properties, additionalSchemaInfo)     ── MJ users
        │
        └──► Auto-Ontology model YAML / Apache Ossie YAML                ── anyone
                    │
                    ▼
             Auto-Ontology: Terms, SQL attributes, certification,
             text-to-SQL agent, MCP
```

### What the hand-off looks like

Auto-Ontology's connectors read declared PKs and FKs (`get_pks`, `get_fks`) but **not database
comments**: none of the connectors' `get_columns` queries select a description. So writing
`COMMENT ON` or extended properties into the source does not reach it. The supported door is
its model interchange (`server/model_interchange/schemas.py`, `POST /api/model/import`), whose
data layer carries exactly what DBAutoDoc produces:

| Auto-Ontology model field | DBAutoDoc source |
|---|---|
| `data_layer.databases[].schemas[].tables[].description` | table description |
| `…tables[].pk` | discovered primary key |
| `…tables[].columns[].description` | column description |
| `…columns[].is_unique` | uniqueness from full-table statistics (not a sample) |
| `data_layer.foreign_keys[]` (`source_column_id` → `target_column_id`) | discovered FKs |
| `data_layer.joins[]` | transitive bridge paths and composite keys |
| `…columns[].sample_values` | **leave empty** (see privacy below) |

The safe sequence:

1. Let Auto-Ontology ingest the source so its catalog exists.
2. Export its model (`POST /api/model/export`).
3. DBAutoDoc fills descriptions, PKs, `is_unique` and `foreign_keys`, matching on
   `schema.table.column` and keeping Auto-Ontology's IDs.
4. Re-import with `replace: false`.
5. Run semantic compilation. Its FK resolver treats DBAutoDoc's FKs as declared and takes
   the fast path (`semantic_fk.py`, "Declared FK fast path"), so the weak inference never
   runs for them, and Terms are written on top of DBAutoDoc's descriptions.

Step 3 is the only new code, a DBAutoDoc generator. An Apache Ossie exporter is the
standards-based version of the same generator and reaches any Ossie consumer, not just
Auto-Ontology.

### What each side gains

- **Auto-Ontology on dark databases.** Its quickstart uses Wide World Importers, which has
  declared keys. On a database with none, DBAutoDoc's keys replace name guessing with
  benchmarked discovery.
- **Auto-Ontology on SQL Server.** DBAutoDoc reads SQL Server; the model document does not care
  where the catalog came from. (Auto-Ontology would still need a SQL Server connector to
  *answer* questions.)
- **DBAutoDoc users** get a business layer, an answering agent and MCP access without
  adopting MJ.
- **Both** get a measurable experiment: text-to-SQL accuracy on BIRD with Auto-Ontology's own
  inference versus DBAutoDoc's keys and descriptions, on schemas with keys stripped.

### Privacy

The sensible default is to export no sample values. Auto-Ontology profiles columns itself when
it has a connector; whether that is acceptable is the deployer's decision, not something
DBAutoDoc should make for them.

---

## 6. Ideas DBAutoDoc should take from Auto-Ontology

These are in the improvement plan ([`plans/active/improvement-roadmap.md`](../../plans/active/improvement-roadmap.md)),
credited there too:

1. **Query history as key evidence**: joins people actually run are high-precision FK evidence
   (SQL Server Query Store and `sys.dm_exec_query_stats`, `pg_stat_statements`, MySQL
   `performance_schema`). Their sqlglot extraction and structural comparison
   (`catalog/parsers/`) is a good model.
2. **Per-field certification** that later runs respect, rather than ground truth only supplied
   up front.
3. **Answerability and coverage**: which business questions the documented schema can and
   cannot answer.
4. **Apache Ossie export**, and an Auto-Ontology model exporter as above.
5. **Date-notation detection**, **table-grain classification** that recognises junction tables
   carrying payload columns, and **deterministic commit ordering** under parallel LLM work.
