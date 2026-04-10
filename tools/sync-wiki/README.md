# MJ Wiki Sync

Extracts the MemberJunction monorepo's institutional knowledge into an [Obsidian](https://obsidian.md) vault optimized for AI-powered search with [LMStudio](https://lmstudio.ai).

**What it does:** Scans the entire repo — documentation, entity schemas, package metadata, GraphQL API, metadata configs, migration history, and source code — and transforms it into 5,000+ interlinked Obsidian pages in about 3 seconds.

## Quick Start

```bash
# From the repo root
cd tools/sync-wiki
npm install

# Full sync (creates vault at ../mj-wiki relative to repo root)
npx tsx sync-wiki.ts --full

# Open the vault in Obsidian
# File > Open Vault > /path/to/mj-wiki
```

## Commands

| Command | Description |
|---------|-------------|
| `npx tsx sync-wiki.ts` | Incremental sync (only files changed since last run) |
| `npx tsx sync-wiki.ts --full` | Full rebuild of the entire vault |
| `npx tsx sync-wiki.ts --watch` | Live watch mode — auto-syncs on file changes with 2s debounce |
| `npx tsx sync-wiki.ts --vault /custom/path` | Sync to a custom vault location |
| `npx tsx sync-wiki.ts --quiet` | Suppress console output (useful for git hooks) |

Flags can be combined: `npx tsx sync-wiki.ts --full --vault ~/my-wiki`

The scripts in `package.json` are shorthand aliases:

```bash
npm run sync         # incremental
npm run sync:full    # full rebuild
npm run sync:watch   # watch mode
```

## What Gets Extracted

The sync runs 7 extractors followed by 3 generators, in this order:

### Extractors

| # | Extractor | Source | Output | Pages |
|---|-----------|--------|--------|-------|
| 1 | **Markdown** | All `.md` files (READMEs, CLAUDE.md, guides, plans, package docs) | `01-Guides/`, `04-Architecture/`, `07-Package-Docs/` | ~500 |
| 2 | **Entities** | `Schema Files/__ALL.full.json` | `03-Entities/` — one page per entity with field tables and relationship wikilinks | ~292 |
| 3 | **Packages** | All `package.json` files | `02-Packages/` — grouped by category with dependency/reverse-dependency wikilinks | ~220 |
| 4 | **GraphQL** | `packages/MJAPI/schema.graphql` | `05-API-Surface/` — queries, mutations, and significant type definitions | ~1,350 |
| 5 | **Metadata** | `metadata/**/.*.json` (20 priority directories) | `06-Metadata/` — browsable agent, prompt, action, model, config pages | ~950 |
| 6 | **Migrations** | `migrations/v*/` filenames | `08-Timeline/` — chronological migration timeline with version grouping | ~3 |
| 7 | **Code** | All `packages/**/src/**/*.ts` (scored by heuristics) | `09-Code/` — implementations, base classes, API surfaces | ~2,000 |

### Generators

| # | Generator | What it does |
|---|-----------|-------------|
| 1 | **MOC Generator** | Creates 8 Map of Content index files in `00-Index/` linking to everything |
| 2 | **Dependency Graph** | Generates a Mermaid diagram of the top 30 most-connected packages |
| 3 | **Backlink Generator** | Second pass that converts plain-text entity name mentions into `[[wikilinks]]` |

## Vault Structure

```
mj-wiki/
├── .obsidian/           # Obsidian config (auto-created on first sync)
├── 00-Index/            # Maps of Content — start here
│   ├── MOC-Home.md          # Master dashboard with stats and navigation
│   ├── MOC-Packages.md      # All packages grouped by category
│   ├── MOC-Entities.md      # All entities with Dataview query examples
│   ├── MOC-Architecture.md  # Active + completed architecture plans
│   ├── MOC-AI-System.md     # AI agents, models, prompts, providers
│   ├── MOC-API-Surface.md   # GraphQL queries/mutations
│   ├── MOC-Dependency-Graph.md  # Mermaid package dependency visualization
│   └── MOC-Migration-Timeline.md
├── 01-Guides/           # CLAUDE.md files, developer guides, top-level docs
├── 02-Packages/         # One page per package, grouped by category
│   ├── _core/               # MJCore, MJGlobal, Config, etc.
│   ├── _ai/                 # AI Engine, Agents, Prompts, Providers, etc.
│   ├── _angular/            # Angular components, Explorer, dashboards
│   ├── _server/             # MJAPI, MJServer, ServerBootstrap
│   ├── _actions/            # Action engine and implementations
│   ├── _data/               # SQL Server, PostgreSQL, GraphQL providers
│   ├── _integration/        # Integration engine and connectors
│   ├── _security/           # Credentials, API keys, encryption
│   ├── _communication/      # Email, SMS, notification providers
│   └── _other/              # Everything else
├── 03-Entities/         # One page per entity (~292 pages)
├── 04-Architecture/     # Architecture plans and design documents
│   ├── _active/             # Current/in-progress plans
│   ├── _complete/           # Completed plans (architecture decision records)
│   └── _specs/              # Formal specifications
├── 05-API-Surface/      # GraphQL schema documentation
│   ├── Queries.md           # All available queries
│   ├── Mutations.md         # All available mutations
│   └── Types/               # Significant type definitions
├── 06-Metadata/         # Metadata configurations rendered as browsable pages
│   ├── Agents/              # AI agent definitions
│   ├── Ai-Models/           # Model catalog (capabilities, vendors, pricing)
│   ├── Prompts/             # Prompt definitions with categories
│   ├── Actions/             # Action definitions
│   ├── Applications/        # App configurations and nav items
│   └── ...                  # 15 more metadata categories
├── 07-Package-Docs/     # Deep documentation from package docs/ directories
│   ├── AI-Agents/           # Agent memory, state, tools, sub-agents guides
│   ├── DBAutoDoc/           # Architecture, guardrails, user guide
│   ├── Integration/         # Connectors, field mapping, sync lifecycle
│   ├── MJCore/              # ISA relationships, organic keys, virtual entities
│   └── ...
├── 08-Timeline/         # Migration timeline across all versions
├── 09-Code/             # Source code organized by package/category
│   ├── MJCore/              # BaseEntity, ProviderBase, RunView, Metadata, etc.
│   ├── AI-Prompts/          # AIPromptRunner, ExecutionPlanner, etc.
│   ├── MJServer/            # Resolvers, REST handlers, middleware
│   ├── AI-Providers/        # LLM provider implementations
│   ├── CodeGenLib/          # Code generation engine
│   └── ...                  # 90+ categories
└── _sync/               # Internal sync state (hash cache, last commit)
```

## Code Extraction: How Scoring Works

The code extractor scans every `.ts` file in `packages/` and assigns a score based on content and location heuristics. No paths are hardcoded — the system discovers important files automatically.

### Scoring Signals

**Location-based:**
| Signal | Points | Trigger |
|--------|--------|---------|
| High-value directory | +3 | File is in `generic/`, `resolvers/`, `services/`, `engines/`, `middleware/`, `auth/`, `rest/`, or `agents/` |
| API surface | +3 | File is `public-api.ts` or `index.ts` under `src/` |
| Generated file | -10 | Path matches `/generated/`, `*.d.ts`, `*.spec.ts`, `*.test.ts` |

**Content-based:**
| Signal | Points | Trigger |
|--------|--------|---------|
| Abstract class | +4 each | `export abstract class` declarations |
| Exported class | +2 each (max 5) | `export class` declarations |
| Interface/type export | +1 each (max 4) | `export interface` or `export type` |
| `@RegisterClass` | +2 each (max 3) | Class factory registration decorators |
| Inheritance | +1 each (max 3) | `extends` or `implements` usage |
| Rich JSDoc | +2 | 5+ JSDoc comment blocks |
| Good size (100-3000 lines) | +2 | Sweet spot for meaningful implementations |
| Large (3000-6000 lines) | +1 | Substantial but manageable |
| Very large (6000+ lines) | -2 | Likely generated |

**Filename-based:**
| Signal | Points | Trigger |
|--------|--------|---------|
| Framework pattern name | +3 | Filename contains `Base`, `Engine`, `Provider`, `Runner`, `Manager`, `Service`, `Factory`, `Pipeline`, `Coordinator`, or `Planner` |
| Resolver | +2 | Filename contains `Resolver` |

### Tier Classification

| Tier | Score Threshold | Label | Behavior |
|------|----------------|-------|----------|
| 1 | >= 12 | Core Implementation | Full source included |
| 2 | >= 6 | Implementation | Full source included |
| 3 | >= 2 | API Surface | Full source included |

Files scoring below 2 are excluded. Files over 5,000 lines switch to **section-extraction mode**: imports, all `export` declarations with their JSDoc, and the first 120 lines of each class body.

## Incremental Sync

The tool tracks file changes using SHA-256 hashes stored in `_sync/file-hashes.json`. On incremental runs:

1. Each source file's hash is compared to the cached hash
2. Only changed files are re-processed by extractors
3. MOC and backlink generators always re-run (they're fast)
4. The current git commit is stored for reference

This makes re-syncs after a `git pull` near-instant.

## Auto-Sync Setup

### Git Hook (recommended)

Create `.git/hooks/post-merge`:

```bash
#!/bin/bash
echo "Syncing MJ wiki..."
cd "$(git rev-parse --show-toplevel)"
npx tsx tools/sync-wiki/sync-wiki.ts --incremental --quiet
```

```bash
chmod +x .git/hooks/post-merge
```

This auto-syncs the vault every time you `git pull`.

### Cron Job (macOS)

For always-fresh docs without thinking about it:

```bash
# Add to crontab (crontab -e)
*/15 * * * * cd /path/to/MJ && npx tsx tools/sync-wiki/sync-wiki.ts --incremental --quiet
```

## Obsidian Plugin Setup

Install these community plugins for the best experience:

### 1. Copilot (LLM Chat)

Chat with your codebase knowledge using LMStudio.

- **Settings > Copilot > Custom Model**
- **API Base URL:** `http://localhost:1234/v1`
- **API Key:** `not-used`
- **Model:** Whatever is loaded in LMStudio (e.g., `qwen2.5-coder-32b-instruct`)
- **System Prompt:**
  ```
  You are an expert on MemberJunction, a TypeScript monorepo with 165+ packages.
  When answering: reference specific entities, packages, and files. Use [[wikilinks]]
  for cross-references. Follow MJ conventions (PascalCase public members, RegisterClass
  decorators, BaseSingleton pattern, no `any` types).
  ```

### 2. Smart Connections (Local RAG)

Builds a vector embedding index of all vault files for semantic search.

- **Embedding Model API URL:** `http://localhost:1234/v1/embeddings`
- **Embedding Model:** Load `nomic-embed-text-v1.5` in LMStudio alongside your chat model
- **Chat Model:** Same LMStudio endpoint as Copilot

This gives you a fully local, private RAG pipeline — embeddings and search all run on your machine.

### 3. Dataview (Query Vault as Database)

Enables inline queries in MOC pages. Example queries that work out of the box:

```dataview
TABLE field_count as "Fields", schema as "Schema"
FROM "03-Entities"
SORT field_count DESC
LIMIT 20
```

```dataview
TABLE dependency_count, dependents_count
FROM "02-Packages"
WHERE dependents_count > 10
SORT dependents_count DESC
```

### 4. Graph Analysis

Enhanced graph view that finds clusters, calculates centrality, and identifies bridge nodes. Especially powerful with the entity relationship wikilinks — you can visually explore the data model.

### 5. Obsidian Git (Optional)

Auto-commit vault changes and sync across machines if you want the vault version-controlled.

## LMStudio Configuration

For the best results:

1. **Chat model:** `qwen2.5-coder-32b-instruct` or `llama-3.1-70b` (good code understanding)
2. **Embedding model:** `nomic-embed-text-v1.5` (load alongside chat model)
3. **Context length:** Set to maximum your hardware supports (the more context, the better the RAG results)

Both models can run simultaneously in LMStudio — one serves chat requests, the other serves embedding requests, both on `localhost:1234`.

## Configuration

The default config is in `lib/config.ts`. Key defaults:

| Setting | Default | Description |
|---------|---------|-------------|
| `vaultPath` | `../mj-wiki` (sibling to repo root) | Where the vault is created |
| `incremental` | `true` (unless `--full`) | Only process changed files |
| `generateBacklinks` | `true` | Second-pass wikilink injection |
| All extractors | `true` | All 7 extractors run by default |

Override the vault path with `--vault`:

```bash
npx tsx sync-wiki.ts --full --vault ~/Documents/my-mj-wiki
```

## How Each Page Type Works

### Entity Pages (`03-Entities/`)

Generated from `Schema Files/__ALL.full.json`. Each page includes:
- YAML frontmatter with `entity_name`, `schema`, `base_view`, `field_count`, and tags
- Full field table: Name, Type, Nullable, Related Entity (as wikilink), Description
- Relationships section with wikilinks to related entities
- Obsidian's graph view shows the entity relationship web through these wikilinks

### Package Pages (`02-Packages/`)

Generated from `package.json` files. Each page includes:
- YAML frontmatter with `npm_name`, `version`, `dependency_count`, `dependents_count`
- MJ dependency list as wikilinks
- Reverse dependency list (who depends on this package) as wikilinks
- README content inlined below

### Code Pages (`09-Code/`)

Generated by the scoring engine. Each page includes:
- YAML frontmatter with `source_path`, `line_count`, `tier`, `score`, and scoring `signals`
- Full TypeScript source (for files under 5,000 lines)
- Key sections only for larger files (imports + all export declarations with JSDoc + partial class bodies)

### Metadata Pages (`06-Metadata/`)

Generated from the `metadata/` directory JSON files. Each page includes:
- Record name and description
- Properties table with all fields (resolves `@lookup:` references to readable text)
- Covers agents, prompts, actions, AI models, vendors, configurations, applications, dashboards, and more

## Project Structure

```
tools/sync-wiki/
├── sync-wiki.ts              # CLI entry point and orchestration
├── package.json
├── tsconfig.json
├── lib/
│   ├── config.ts             # SyncConfig, vault directories, package classification
│   └── hasher.ts             # SHA-256 hashing for incremental change detection
├── extractors/
│   ├── markdown-extractor.ts # Classifies and transforms .md files with frontmatter
│   ├── entity-extractor.ts   # Parses schema JSON into entity pages with field tables
│   ├── package-extractor.ts  # Parses package.json, builds dependency graph
│   ├── graphql-extractor.ts  # Regex-parses schema.graphql into query/mutation/type pages
│   ├── metadata-extractor.ts # Converts metadata JSON into browsable documentation
│   ├── migration-extractor.ts# Parses migration filenames into a timeline
│   └── code-extractor.ts     # Scores and extracts TypeScript source files
└── generators/
    ├── moc-generator.ts      # Generates 8 Map of Content index files
    ├── depgraph-generator.ts # Generates Mermaid package dependency diagram
    └── backlink-generator.ts # Injects entity-name wikilinks across doc pages
```

## Typical Output

```
$ npx tsx sync-wiki.ts --full

MJ Wiki Sync (full)
   Repo:  /path/to/MJ
   Vault: /path/to/mj-wiki

Extracting markdown documentation...
   297 core + 1170 impl + 674 API surface files (926,948 lines, scanned 2,718)
Extracting entity schema...
   292 entities from 1 schemas
Extracting package metadata...
   220 packages across 11 categories
Extracting GraphQL API surface...
   1287 queries, 951 mutations, 1350 types
Extracting metadata configs...
   859 records from 20 directories
Extracting migration timeline...
   346 migrations across 124 versions
Extracting source code (scored heuristics)...
   297 core + 1170 impl + 674 API surface files

Generating Maps of Content...
   8 MOC files generated
Generating dependency graph...
   1 graph page generated
Injecting backlinks...
   510+ links injected

Sync complete in 3.0s
   Vault ready at: /path/to/mj-wiki
```
