# MemberJunction 4.0 Codebase Analysis

**Date:** February 7, 2026
**Scope:** Comprehensive audit of the entire MemberJunction monorepo prior to 4.0.0 release
**Branch analyzed:** `next` at commit `e1329a96`

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Repository Overview](#repository-overview)
3. [Recent Development Activity](#recent-development-activity)
4. [Architecture Assessment](#architecture-assessment)
5. [Code Quality Audit](#code-quality-audit)
6. [Test Coverage Analysis](#test-coverage-analysis)
7. [Build System & Tooling](#build-system--tooling)
8. [Security Review](#security-review)
9. [Performance Considerations](#performance-considerations)
10. [Technical Debt Inventory](#technical-debt-inventory)
11. [Post-4.0 Improvement Roadmap](#post-40-improvement-roadmap)

---

## Executive Summary

MemberJunction is a large-scale TypeScript monorepo (~165 publishable packages) that has undergone an intense 4.0 preparation sprint. The last month saw **518 non-merge commits** across 12+ contributors, with massive infrastructure upgrades (Angular 21, ESBuild/Vite, TypeScript 5.9, Node 24) and significant new features (MCP OAuth 2.1, Version History, Flow Editor rewrite, Universal Search).

### Strengths
- **Mature architecture**: Clean provider abstractions, sophisticated caching, well-designed ClassFactory/RegisterClass system
- **Comprehensive code generation**: ~145K lines of generated code keeping types, SQL, and UI synchronized
- **Impressive AI ecosystem**: 24 LLM providers, MCP server/client, agent orchestration, flow editor
- **Strong SQL injection prevention**: Allowlist-based SQL expression validator with comprehensive protections
- **High development velocity**: Effective use of AI-assisted development for major features

### Top Concerns (Post-4.0 Priorities)
1. **Test coverage is critically low** -- only 28 test files across 8 of 45 packages (18% package coverage)
2. **`any` type usage is pervasive** -- 1,484+ occurrences across the codebase despite ESLint `no-explicit-any: "error"` rule
3. **Monolithic files** -- `base-agent.ts` (8,229 lines), `SQLServerDataProvider.ts` (5,669 lines), `entity-data-grid.component.ts` (4,327 lines)
4. **OnPush change detection adoption is only 14%** across 675 Angular components
5. **Subscription cleanup patterns are only in 20% of components** -- potential memory leak surface

---

## Repository Overview

### Scale

| Metric | Count |
|--------|-------|
| Top-level packages | 49 directories |
| Angular sub-packages | 61 |
| AI sub-packages | 15 (+ 24 providers) |
| Action sub-packages | 10 |
| **Total publishable packages** | **~165** |
| Angular component files | 675 |
| Generated entity classes | 284 |
| SQL migration files | 421 |
| Generated TypeScript (entity_subclasses.ts) | 78,233 lines |
| Generated TypeScript (server generated.ts) | 66,546 lines |
| **Total generated code** | **~145K lines** |

### Directory Structure

```
MJ/
├── packages/              # 49 top-level package directories
│   ├── AI/                # 15 AI sub-packages + 24 providers
│   ├── Actions/           # 10 action sub-packages
│   ├── Angular/           # 61 Angular sub-packages
│   │   ├── Explorer/      # 19 packages (app shell, routing, forms)
│   │   ├── Generic/       # 41 packages (reusable components)
│   │   └── Bootstrap/     # 1 package (class registration)
│   ├── MJCore/            # Core entity system, metadata, providers
│   ├── MJGlobal/          # ClassFactory, RegisterClass, events
│   ├── MJServer/          # GraphQL server, auth, resolvers
│   ├── MJAPI/             # API application entry point
│   ├── MJExplorer/        # Angular application entry point
│   ├── SQLServerDataProvider/  # SQL Server data access
│   ├── GraphQLDataProvider/    # Client-side GraphQL data access
│   ├── CodeGenLib/        # Code generation engine
│   └── ... 37 more packages
├── migrations/            # 421 SQL migrations (v2, v3)
├── metadata/              # Declarative metadata JSON files
├── guides/                # Best practices documentation
├── specs/                 # Feature specifications
├── plans/                 # Implementation plans
├── ci/                    # CI helper scripts
├── docker/                # Docker configurations
├── Demos/                 # Demo projects
├── Distributions/         # Distribution packages
└── tests/                 # Component linter test fixtures
```

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Node.js | 24+ |
| Language | TypeScript | 5.9 |
| Frontend Framework | Angular | 21 |
| Frontend Bundler | ESBuild + Vite | (Angular application builder) |
| UI Library | Kendo UI | v22 |
| Backend | Apollo Server | v4 |
| GraphQL | type-graphql | - |
| Database | SQL Server | via mssql |
| Validation | Zod | - |
| Build Orchestration | Turborepo | - |
| Package Manager | npm | 11.7.0 |
| Test Framework | Jest (primary), Vitest (1 package) | - |
| AI Protocols | MCP (Model Context Protocol) | SDK 1.26.0 |
| Auth | MSAL, Auth0, Cognito, Google, Okta | Multi-provider |

---

## Recent Development Activity

### Sprint Summary (January 9 - February 7, 2026)

| Metric | Value |
|--------|-------|
| Total non-merge commits | 518 |
| Daily average | ~18 commits/day |
| Peak day | 48 commits (Jan 28) |
| Contributors | 12+ |
| Merged PRs | 30+ |
| AI-assisted PRs | 5+ (Claude-authored branches) |

### Contributor Distribution

| Commits | Author | Role |
|---------|--------|------|
| 354 (68%) | AN-BC | Primary developer |
| 61 | jordanfanapour | AI/testing features |
| 51 | Craig Adam | - |
| 44 | EL-BC | - |
| 43 | rkihm-BC | - |
| 42 | madhavrs1 | - |
| 25 | Robert Kihm | - |
| 21 | Claude | AI-assisted development |
| 20 | sohamdesai-BlueCypress | Universal search |
| 18 | GitHub Actions | Automated |

### Major Themes

#### 1. Angular 21 + ESBuild Migration (Largest Engineering Effort)
- Upgraded from Angular 18 to Angular 21
- Migrated from Webpack to ESBuild `application` builder with Vite dev server
- Updated 225+ package.json files for dependency alignment
- Kendo UI upgraded from v16 to v22
- Source map configuration for ESBuild/Vite debugging
- HMR (Hot Module Replacement) enabled

#### 2. Class Registration Manifest System (Tree-Shaking Solution)
- Novel architecture using TypeScript AST to find all `@RegisterClass` decorators
- Dual-manifest architecture: pre-built (bootstrap) + supplemental (app-level)
- Removed all legacy `LoadXXX()` anti-tree-shaking functions (438 files, net -1,299 lines)
- Prerequisite for the ESBuild migration (ESBuild aggressively tree-shakes)

#### 3. MCP OAuth 2.1 Implementation (~40K insertions across 2 PRs)
- Standards-compliant OAuth 2.1 with Dynamic Client Registration
- Auth0 integration, PKCE support
- Comprehensive auth server: JWT issuance, JWKS validation, scope evaluation
- Both MCP server and client support 4 transport types (SSE, StreamableHTTP, Stdio, WebSocket)

#### 4. Version History System (33K insertions -- largest single PR)
- New `@memberjunction/version-history` package
- Two-layer dependency walker for record relationship traversal
- Diff viewer with field-level comparison
- Database migration for versioning schema

#### 5. Flow Editor Rewrite (10K lines changed)
- Complete redesign using Foblex-based flow rendering
- Properties panels, loop nodes, context menus
- Connection reassignment, drag persistence
- Grid pattern, legends, pan/select modes

#### 6. Additional Features
- **Universal Search**: Cross-application search capability
- **Fireworks.ai Provider**: New LLM provider with Kimi K2.5 model support
- **Dashboard Redesigns**: Communication (MD3), Component Studio, Testing, Scheduling
- **TSConfig Standardization**: Inheritance audit across all packages

---

## Architecture Assessment

### Core Architecture: Provider Pattern (Rating: Excellent)

```
Client Code
    ↓
Metadata (facade)
    ↓
IMetadataProvider (interface)
    ↓
ProviderBase (abstract, with caching/telemetry)
    ├── SQLServerDataProvider (server-side, direct SQL)
    └── GraphQLDataProvider (client-side, via Apollo)
```

**Strengths:**
- Clean strategy pattern enabling transparent tier-switching
- Sophisticated differential caching (server validates client cache via `maxUpdatedAt` + `rowCount`)
- Built-in telemetry and performance instrumentation (logs operations >50ms)
- Pre/Post hook architecture for extensibility

**Concerns:**
- `SQLServerDataProvider.ts` at 5,669 lines is a monolithic file that should be decomposed

### ClassFactory / RegisterClass System (Rating: Excellent)

The runtime class registration system is well-designed:
- Priority-based override mechanism (subclasses naturally get higher priority)
- Key-based lookup for entity-name resolution
- Automatic root class promotion for multi-level inheritance
- The manifest system elegantly solves ESBuild tree-shaking

### Entity System (Rating: Very Good)

- 284 entities with Zod validation schemas
- Getter/setter field access with dirty tracking
- SQL type value range validation
- CodeGen keeps TypeScript classes, SQL objects, and Angular forms synchronized

**Concern:** The 78K-line generated file is enormous. While it's generated and thus not maintained manually, it impacts IDE performance and compilation times.

### AI Subsystem Architecture (Rating: Good, with improvement areas)

**Provider Abstraction (Good):**
- Three-layer pattern: Abstract base → Provider registration → ClassFactory instantiation
- 24 providers covering LLM, embedding, image, audio, video, reranking
- Clean `BaseLLM` → `ChatCompletion()` / streaming pattern

**Agent System (Needs Decomposition):**
- `base-agent.ts` at 8,229 lines is the largest file in the entire codebase
- Contains: prompt composition, conversation management, action execution, sub-agent orchestration, loop constructs (ForEach/While), memory management, progress callbacks, context injection, reranking
- This file alone has 55 `any` type annotations
- Clear candidate for decomposition into focused modules

**MCP Implementation (Excellent):**
- Full OAuth 2.1 with DCR
- Both server and client packages
- Dynamic tool generation from entity metadata, agents, actions, and prompts
- All 4 MCP transport types supported

### Angular Architecture (Rating: Mixed)

**Good:**
- Tab-based navigation with custom RouteReuseStrategy
- Resource resolver pattern for unified route handling
- 61 well-organized sub-packages (19 Explorer, 41 Generic, 1 Bootstrap)
- Newer code consistently uses OnPush, getter/setter inputs, subscription cleanup

**Needs Improvement:**
- Only 2% standalone component adoption (13 of 675 components)
- Only 14% OnPush change detection adoption
- Only 20% of components have proper subscription cleanup
- Monolithic components: entity-data-grid (4,327 lines), skip-chat (2,654 lines)
- 15 MB initial bundle budget (generous -- likely improvable)

### Actions System (Rating: Good)

- Clean base class with template method pattern (`Run()` → `InternalRunAction()`)
- Pre-execution filter chain
- Proper separation between metadata-driven discovery and code-level execution
- Logging to `ActionExecutionLogEntity`

---

## Code Quality Audit

### `any` Type Usage

Despite ESLint `no-explicit-any: "error"` rule and CLAUDE.md's "NO `any` TYPES - EVER" mandate:

| Area | `: any` | `as any` | Total | Density (per 1K LoC) |
|------|---------|----------|-------|---------------------|
| MJGlobal | 40 | 2 | 42 | 16.8 |
| MJCore | 140 | 12 | 152 | 7.4 |
| MJCoreEntities (non-generated) | 19 | 0 | 19 | 6.3 |
| MJServer | 98 | 36 | 134 | 1.5 |
| SQLServerDataProvider | 56 | 6 | 62 | 8.7 |
| GraphQLDataProvider | 63 | 2 | 65 | 6.8 |
| Angular packages | 447 | 132 | 579 | varies |
| AI packages | 351 | 80 | 431 | varies |
| **Grand Total** | **~1,214** | **~270** | **~1,484** | - |

**Top offenders by file:**
1. `base-agent.ts` (AI Agents) -- 55 occurrences
2. `SQLServerDataProvider.ts` -- 48 occurrences
3. `PayloadManager.ts` (AI Agents) -- 35 occurrences
4. `ai-test-harness.component.ts` -- 36 occurrences
5. `agent-editor.component.ts` -- 22 occurrences

**Assessment:** Many of the `any` usages in MJGlobal (ClassFactory operating on unknown constructors), MJCore (entity field values of variable SQL type), and AI providers (SDK response typing gaps) are structurally defensible. However, the AI Agent system, Angular components, and several data providers have significant opportunities for proper typing.

### Monolithic Files (Violating 30-40 Line Function Guideline)

| File | Lines | Location |
|------|-------|----------|
| `base-agent.ts` | 8,229 | `packages/AI/Agents/src/` |
| `entity_subclasses.ts` (generated) | 78,233 | `packages/MJCoreEntities/src/generated/` |
| `generated.ts` (generated) | 66,546 | `packages/MJServer/src/generated/` |
| `SQLServerDataProvider.ts` | 5,669 | `packages/SQLServerDataProvider/src/` |
| `entity-data-grid.component.ts` | 4,327 | `packages/Angular/Generic/entity-viewer/` |
| `skip-chat.component.ts` | 2,654 | `packages/Angular/Generic/skip-chat/` |
| `providerBase.ts` | 2,313 | `packages/MJCore/src/generic/` |
| `baseEntity.ts` | 2,117 | `packages/MJCore/src/generic/` |
| `conversation-chat-area.component.ts` | 2,096 | `packages/Angular/Generic/conversations/` |
| `entityInfo.ts` | 1,886 | `packages/MJCore/src/generic/` |

### TODO/FIXME/HACK Technical Debt Markers

| Area | Count | Severity |
|------|-------|----------|
| Angular packages | 53 across 32 files | Medium |
| MJCore | 1 | Low |
| MJServer | 4 | Medium (one security-related) |
| **Total** | **~58** | - |

**Notable TODOs:**
- `ComponentRegistryResolver.ts:386`: "Implement actual permission checking" -- **security gap**
- `conversation-chat-area.component.ts:420`: "Replace polling with PubSub" -- **performance concern**
- 18 unimplemented features across Angular (column chooser, Excel export, auth provider integration, etc.)
- 8 missing entity/data support items (ConversationMembers, ThreadCount field, User Settings)

### Naming Convention Compliance

The codebase generally follows the PascalCase public / camelCase private convention documented in CLAUDE.md. Newer code (dashboards, flow editor, versions) is more consistently compliant than older code (entity-data-grid, base-forms).

---

## Test Coverage Analysis

### Current State: Critical Gap

| Metric | Value |
|--------|-------|
| Total test files | 28 |
| Packages with tests | 8 of 45 top-level (18%) |
| Packages without tests | 37 (82%) |
| Root test script | **None** |
| Unified test runner | **None** |

### Packages WITH Tests

| Package | Test Files | Framework |
|---------|-----------|-----------|
| AI (Agents, MCPClient, Prompts, Providers) | 11 | Jest + Vitest |
| APIKeys | 3 | Jest |
| Credentials | 1 | Jest |
| MJCore | 3 | Jest |
| MJServer | 1 | Jest |
| MJStorage | 2 | Jest |
| React | 3 | Jest |
| TestingFramework | 1 | Jest |

### Critical Packages WITHOUT Tests

These are load-bearing packages with zero test coverage:

| Package | Risk | Why It Matters |
|---------|------|---------------|
| **MJGlobal** | High | ClassFactory underpins the entire system |
| **SQLServerDataProvider** | High | All server-side data access flows through here |
| **GraphQLDataProvider** | High | All client-side data access flows through here |
| **CodeGenLib** | High | Generates ~145K lines of code; bugs amplify across the system |
| **Angular (all 61 packages)** | High | 675 components with zero automated testing |
| **MJCoreEntities** | Medium | Custom entity extensions and engines |
| **MetadataSync** | Medium | Manages database metadata synchronization |
| **Actions (Engine)** | Medium | Action execution pipeline |
| **MJAPI** | Medium | API server entry point |
| **MJExplorer** | Medium | Angular app entry point |

### Recommendations (Post-4.0)

1. **Add a root `test` script** that runs all package tests via Turborepo
2. **Priority 1**: MJGlobal (ClassFactory), SQLServerDataProvider (query building, SQL injection), CodeGenLib (generation correctness)
3. **Priority 2**: MJCore (entity lifecycle, caching), GraphQLDataProvider (client data access)
4. **Priority 3**: Angular component testing (start with entity-data-grid, conversation components)
5. **Standardize on Jest** (11 of 12 configs already use it; migrate the one Vitest package)
6. **Add coverage thresholds** to CI pipeline (start at current baseline, ratchet up)

---

## Build System & Tooling

### Build Pipeline (Rating: Good)

- **Turborepo** with `"dependsOn": ["^build"]` ensures correct topological build order
- Output caching for `build/**` and `dist/**` directories
- Angular uses modern ESBuild `application` builder (fast builds)
- Vite dev server with HMR for rapid frontend iteration
- Vite prebundling excludes `@memberjunction/*` (correct for symlinked workspace packages)

### CI/CD (Rating: Good)

10 GitHub Actions workflows:

| Workflow | Purpose |
|----------|---------|
| `build.yml` | Build validation |
| `changes.yml` | Change detection |
| `claude-command.yml` + `claude.yml` | AI-assisted development |
| `dependency-check.yml` | Dependency auditing |
| `docker.yml` | Docker builds |
| `docs.yml` | Documentation generation |
| `generate-release-notes.yml` | Release notes |
| `migrations.yml` | Migration validation |
| `publish.yml` | NPM publishing |

### Linting & Formatting (Rating: Good)

- ESLint with `@typescript-eslint/recommended` + Prettier
- `no-explicit-any: "error"` rule exists (though not fully enforced -- see `any` audit)
- `no-shadow: "error"` and `no-unused-vars: "error"` with `_` ignore pattern
- `object-shorthand: "error"` for consistency

### Dependency Management (Rating: Good)

- **syncpack** for version consistency checking
- **knip** for unused/unlisted dependency detection
- All `@memberjunction/*` packages locked to `3.4.0` (good consistency)
- Exact version pinning for internal dependencies (e.g., `"@memberjunction/global": "3.4.0"`)

**Note:** The use of exact version strings rather than `workspace:*` protocol means version bumps require updating every cross-reference. This is likely automated but adds friction.

### Documentation (Rating: Adequate)

- Comprehensive root `CLAUDE.md` with development rules and patterns
- 31 README.md files across packages (~19% of packages)
- 2 package-level CLAUDE.md files (Actions, Angular)
- `/guides/` directory with best practices
- `/specs/` and `/plans/` directories for feature documentation
- `CLASS_MANIFEST_GUIDE.md` for the tree-shaking system

---

## Security Review

### SQL Injection Prevention (Rating: Strong)

The `SQLExpressionValidator` in MJGlobal provides comprehensive protection:
- **Dangerous keyword blocklist**: DDL, DML, DCL, execution, transaction control, UNION/INTERSECT, file operations, dynamic SQL, time-based injection (WAITFOR, DELAY, SLEEP)
- **Function allowlist**: Only safe, read-only SQL functions permitted
- **String literal removal** before keyword scanning (prevents false positives)
- **Context-aware validation**: Different rules for WHERE, ORDER BY, aggregates, field references
- **Comment and semicolon blocking**: Prevents `--`, `/* */`, and `;` injection vectors
- Bracket escaping for schema/view names

### Authentication (Rating: Strong)

Multi-provider auth system with:
- JWKS-based JWT validation with caching (10-minute TTL)
- Retry with exponential backoff (3 retries for connection errors)
- Issuer normalization (trailing slash handling)
- Three auth methods: JWT bearer, system API keys, user API keys
- Token expiration pre-check before full verification (performance optimization)

### Areas of Concern

1. **ComponentRegistryResolver permission gap**: `TODO: Implement actual permission checking` at line 386 means component registry operations currently lack authorization. This should be addressed.

2. **Nunjucks `autoescape: false`**: In the SQL query parameter processor, auto-escaping is disabled. While intentional (SQL has different escaping needs), any bypass of the parameter validation chain could be exploited.

3. **`as any` in auth context**: `context.ts` line 219 casts Express request `as any` to access body properties. Could be more precisely typed.

---

## Performance Considerations

### Angular Performance

| Concern | Current State | Impact |
|---------|--------------|--------|
| OnPush adoption | 14% (94 of 675 components) | Default change detection runs on every event cycle |
| Bundle budget | 15 MB initial warning | Large initial load |
| Subscription cleanup | 20% of components | Potential memory leaks in long-running sessions |
| Polling vs PubSub | Chat area uses polling | Unnecessary server load |
| `@for` migration | In progress (CodeGen updated) | `@for` is 90% faster than `*ngFor` |

### Server Performance

| Concern | Current State | Recommendation |
|---------|--------------|----------------|
| Per-request provider instantiation | New `SQLServerDataProvider` per request | Monitor under load; metadata caching mitigates |
| Connection pooling | Configurable (default: 50 max) | Good - properly documented |
| Generated file compilation | 78K + 66K lines | Impacts build time; consider splitting |
| Smart cache differential | ProviderBase validates cache freshness | Excellent pattern |

### Data Access Performance

The codebase follows good patterns:
- `RunViews` (plural) for batch queries
- `ResultType: 'simple'` with `Fields` for read-only operations
- View fields used instead of per-item lookups
- Client-side aggregation instead of per-bucket queries

---

## Technical Debt Inventory

### Severity: High (Should Address in 4.1)

| Item | Details | Effort |
|------|---------|--------|
| **Test coverage** | 82% of packages have zero tests | Large - ongoing |
| **`base-agent.ts` decomposition** | 8,229 lines, 55 `any` types | Medium |
| **`SQLServerDataProvider.ts` decomposition** | 5,669 lines, 48 `any` types | Medium |
| **`entity-data-grid.component.ts` decomposition** | 4,327 lines | Medium |
| **ComponentRegistry permission check** | Security gap | Small |
| **Root test script + CI integration** | No unified test runner | Small |

### Severity: Medium (4.1 - 4.2 timeframe)

| Item | Details | Effort |
|------|---------|--------|
| **OnPush change detection migration** | 86% of components on default CD | Large - incremental |
| **Subscription cleanup audit** | 80% of components may leak | Medium |
| **`any` type reduction in AI packages** | 431 occurrences | Medium |
| **`any` type reduction in Angular** | 579 occurrences | Large |
| **Standalone component migration** | 98% still NgModule | Large - incremental |
| **`workspace:*` protocol adoption** | Currently exact version strings | Small |
| **Polling to PubSub** (conversations) | Has plan document | Medium |

### Severity: Low (Long-term improvements)

| Item | Details | Effort |
|------|---------|--------|
| Generated file splitting | 78K + 66K line files impact IDE/build | Medium |
| Package README coverage | Only 19% have READMEs | Small - ongoing |
| CLAUDE.md per-package | Only 2 packages have them | Small - ongoing |
| `MJEvent<T>` generic typing | Currently uses `any` for event args | Small |
| Nunjucks autoescape documentation | Document security boundary | Small |

---

## Post-4.0 Improvement Roadmap

### Phase 1: Foundation (4.1) -- "Test & Decompose"

**Goal:** Establish testing infrastructure and break up the largest files.

1. **Testing infrastructure**
   - Add root `npm test` script via Turborepo
   - Add coverage thresholds to CI (start at 0%, ratchet up)
   - Priority test packages: MJGlobal (ClassFactory), SQLServerDataProvider (query building), CodeGenLib (generation correctness)
   - Target: 40% package coverage (18 of 45 packages)

2. **File decomposition**
   - `base-agent.ts` (8,229 lines) → Split into: prompt composition, action execution, loop constructs, memory management, sub-agent orchestration (~6 focused modules)
   - `SQLServerDataProvider.ts` (5,669 lines) → Split into: CRUD operations, view execution, transaction management, metadata loading, query building (~5 modules)
   - `entity-data-grid.component.ts` (4,327 lines) → Extract: column management, filter logic, selection handling, state persistence, export functionality

3. **Security fix**
   - Implement permission checking in `ComponentRegistryResolver.ts`

### Phase 2: Quality (4.2) -- "Type & Detect"

**Goal:** Reduce `any` types and improve Angular change detection.

1. **`any` type reduction campaign**
   - AI packages: Replace 431 `any` instances with proper types
   - Focus on `base-agent.ts`, `PayloadManager.ts`, provider implementations
   - Define typed interfaces for: loop iteration contexts, agent payloads, provider responses
   - Target: <200 `any` instances remaining

2. **OnPush change detection migration**
   - Start with leaf components (no child components)
   - Focus on components with performance issues first
   - Target: 50% OnPush adoption (337 of 675 components)

3. **Subscription cleanup audit**
   - Audit all 675 components for subscription management
   - Add `takeUntil(this.destroy$)` pattern to all observable subscriptions
   - Consider Angular's `takeUntilDestroyed()` for standalone components
   - Target: 80% compliance

### Phase 3: Modernization (4.3) -- "Standalone & Stream"

**Goal:** Modernize Angular patterns and implement real-time communication.

1. **Standalone component migration**
   - New components: always standalone
   - Existing: migrate leaf components first, then work up
   - Target: 30% standalone adoption

2. **Polling to PubSub migration**
   - Implement PubSub for conversation chat area (plan document exists)
   - Extend to other real-time features

3. **`workspace:*` protocol adoption**
   - Migrate from exact version strings to `workspace:*` for internal dependencies
   - Simplifies version bumps

4. **Generated code optimization**
   - Evaluate splitting `entity_subclasses.ts` (78K lines) by entity category
   - Evaluate splitting `generated.ts` (66K lines) by resolver type
   - Measure impact on IDE performance and build times

### Phase 4: Excellence (4.4+) -- "Coverage & Docs"

1. **Test coverage targets**
   - 70% package coverage
   - E2E tests for critical user flows
   - Performance regression tests

2. **Documentation completeness**
   - CLAUDE.md for every major package
   - README.md for every package
   - Architecture decision records (ADRs) for major patterns

3. **Bundle size optimization**
   - Leverage standalone components for tree-shaking
   - Lazy-load more route modules
   - Analyze and optimize 15 MB budget

---

## Appendix: Package Inventory by Category

### Core Framework
- `MJGlobal` -- ClassFactory, RegisterClass, events
- `MJCore` -- Entity system, metadata, providers, caching
- `MJCoreEntities` -- Generated entity classes (284 entities)
- `MJCoreEntitiesServer` -- Server-side entity extensions

### Data Access
- `SQLServerDataProvider` -- SQL Server direct access
- `GraphQLDataProvider` -- Client-side GraphQL access
- `MJDataContext` / `MJDataContextServer` -- Data context management

### Server
- `MJServer` -- GraphQL server, auth, resolvers
- `MJAPI` -- API application entry point
- `ServerBootstrap` / `ServerBootstrapLite` -- Server initialization + manifests

### AI Ecosystem (15 packages + 24 providers)
- `AI/Core` -- Base AI model abstractions
- `AI/CorePlus` -- Extended entity classes
- `AI/BaseAIEngine` -- Shared engine base
- `AI/Engine` -- Server-side AI engine
- `AI/Agents` -- Agent execution framework
- `AI/AgentManager` -- Agent orchestration
- `AI/Prompts` -- Template-based prompt execution
- `AI/MCPServer` -- MCP server with OAuth 2.1
- `AI/MCPClient` -- MCP client with multi-transport
- `AI/A2AServer` -- Agent-to-Agent protocol
- `AI/AICLI` -- Command-line AI interface
- `AI/Vectors` (4 sub-packages) -- Vector database abstractions
- `AI/Recommendations` -- Recommendation engine
- `AI/Reranker` -- Reranking service
- `AI/Providers` (24) -- Anthropic, OpenAI, Azure, Bedrock, Gemini, Groq, Mistral, Fireworks, xAI, Cerebras, Cohere, Vertex, LMStudio, Ollama, OpenRouter, BettyBot, BlackForestLabs, ElevenLabs, HeyGen, LocalEmbeddings, Vectors-Pinecone, Recommendations-Rex, Bundle

### Actions (10 packages)
- `Actions/Base` -- Shared base classes
- `Actions/Engine` -- Core execution engine
- `Actions/CoreActions` -- Built-in actions
- `Actions/BizApps`, `ApolloEnrichment`, `CodeExecution`, `ContentAutotag`
- `Actions/ScheduledActions`, `ScheduledActionsServer`

### Angular (61 packages)
- **Explorer (19)**: auth-services, base-application, base-forms, core-entity-forms, dashboards, entity-form-dialog, entity-permissions, explorer-app, explorer-core, explorer-modules, explorer-settings, form-toolbar, kendo-modules, link-directives, list-detail-grid, record-changes, shared, simple-record-list, workspace-initializer
- **Generic (41)**: action-gallery, actions, agents, ai-test-harness, artifacts, base-types, chat, code-editor, container-directives, conversations, credentials, dashboard-viewer, data-context, deep-diff, entity-communication, entity-relationship-diagram, entity-viewer, export-service, file-storage, filter-builder, find-record, flow-editor, generic-dialog, join-grid, list-management, markdown, notifications, query-grid, query-viewer, react, record-selector, resource-permissions, shared, skip-chat, tab-strip, tasks, timeline, trees, user-avatar, versions, Testing
- **Bootstrap (1)**: ng-bootstrap manifest

### Supporting Packages
- `CodeGenLib` -- Code generation engine
- `MetadataSync` -- Metadata synchronization
- `Communication` -- Email/messaging
- `Templates` -- Template engine
- `Config` -- Configuration management
- `Credentials` -- Credential management
- `Encryption` -- Encryption utilities
- `APIKeys` -- API key management
- `MJStorage` -- File storage abstraction
- `MJExportEngine` -- Data export
- `MJQueue` -- Queue management
- `Scheduling` -- Task scheduling
- `ComponentRegistry` / `ComponentRegistryClientSDK` -- Component registration
- `ContentAutotagging` -- Content auto-tagging
- `DBAutoDoc` -- Database documentation
- `DocUtils` -- Document utilities
- `ExternalChangeDetection` -- External change detection
- `InteractiveComponents` -- Interactive component types
- `QueryGen` -- Query generation
- `SkipTypes` -- Skip AI types
- `TestingFramework` -- Testing framework
- `VersionHistory` -- Version history system
- `GeneratedActions` / `GeneratedEntities` -- Generated code packages
