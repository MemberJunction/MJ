# MemberJunction Developer Guides

This folder is the home for cross-cutting, "read this before you build that" reference docs. Package-specific docs live in `packages/<Pkg>/CLAUDE.md` or `packages/<Pkg>/README.md` and are linked from here when relevant.

If you're about to start work in one of the areas below, **read the guide first** — these documents capture patterns that have already been litigated.

## Start here

- **[Building Applications on MemberJunction](BUILDING_APPS_ON_MJ.md)** — The hub guide for using MJ as a first-class application development platform. Explains the metadata-driven, schema-to-app model, the unified-TypeScript / isomorphic object model, AI-native app patterns, and links out to the authoritative README/guide for every layer (data modeling, CodeGen, entities, API, UI, Actions, AI, deployment). Start here if you've got data in MJ and want to build on it.
- **[Framework Comparison](FRAMEWORK_COMPARISON.md)** — Objective comparison of MJ against Next.js/Vercel, Supabase, Rails, Django, and a hand-rolled Node+ORM+SPA stack: where each shines, where MJ differs, and how to choose. Companion to the app-building guide.

## Framework fundamentals

- **[BaseEntity Server-Side Patterns](BASE_ENTITY_SERVER_PATTERNS.md)** — Patterns for server-side `BaseEntity` subclasses: persisted embeddings, cross-record invariants via `ValidateAsync`, FK cleanup before delete. Read before writing a new entity subclass under `MJCoreEntitiesServer`.
- **[Soft Deletes Guide](SOFT_DELETES_GUIDE.md)** — How `DeleteType='Soft'` works end to end: CodeGen-managed `__mj_DeletedAt` column, filtered base views, soft-delete `spDelete`, interaction with `AllowRecordMerge`.
- **[UUID Comparison Guide](UUID_COMPARISON_GUIDE.md)** — Critical: SQL Server returns UUIDs uppercase, PostgreSQL lowercase. Always use `UUIDsEqual()` / `NormalizeUUID()` instead of `===` for UUID comparisons.
- **[Caching & Real-Time Synchronization Guide](CACHING_AND_PUBSUB_GUIDE.md)** — Multi-tier server caching, RunView cache behavior, `BypassCache`, BaseEntity event-driven invalidation, Redis pub/sub, real-time browser sync. Read before touching caching or write-after-write data flow.

## Search, RAG, and tagging

- **[Search Scopes & RAG+ Guide](SEARCH_SCOPES_AND_RAG_GUIDE.md)** — Implementation guide for Search Scopes + agent RAG+ architecture. Companion to [`plans/search-scopes-rag-plus.md`](../plans/search-scopes-rag-plus.md).
- **[Content Autotagging Guide](CONTENT_AUTOTAGGING_GUIDE.md)** — The Knowledge Hub pluggable autotagging pipeline: providers, keyword extraction, taxonomy bridging.
- **[Taxonomy & Tagging Guide](TAXONOMY_TAGGING_GUIDE.md)** — How the tag taxonomy itself is shaped, scoped, governed, grown, embedded, reviewed, and pruned. Companion to the autotagging guide.

## AI and agents

- **[Real-Time Co-Agents Guide](REALTIME_CO_AGENTS_GUIDE.md)** — Live, low-latency voice agents: the `Realtime` agent type and Realtime Co-Agent (one co-agent voices any target agent), the triple-registry plugin architecture (server/client model drivers + channel plugins), client-direct vs server-bridged topologies, session lifecycle/janitor, interactive channels (the live Whiteboard), narration, observability, and security. Companion to [`plans/ai-agent-sessions.md`](../plans/ai-agent-sessions.md).
- **[Conversations UX Stack Guide](CONVERSATIONS_UX_STACK_GUIDE.md)** — The 3-layer architecture for every chat surface: pure-TS `@memberjunction/conversations-runtime` (orchestration) ↔ adapters (`INotificationAdapter` / `IActiveTaskTracker` / `ISessionsAdapter`) ↔ `@memberjunction/ng-conversations` (Angular widget). Slot system, Before/After cancelable events, `--mj-chat-*` design tokens, default-agent resolution, sessions adapter bridging to realtime, recipes.

## Angular / MJExplorer

- **[Dashboard Best Practices](DASHBOARD_BEST_PRACTICES.md)** — Architecture, naming, state management with getter/setters, engine class patterns, user preferences, layout, permission checking for MJ dashboards.
- **[Lazy Loading Guide](LAZY_LOADING_GUIDE.md)** — How MJExplorer's code-split lazy loading works, how to add new dashboard components, how to make a package lazy-loadable, the auto-generated lazy config.
- **[Navigation and Routing Guide](NAVIGATION_AND_ROUTING_GUIDE.md)** — How the shell owns URL state, back/forward navigation, adding URL-synced sub-navigation to a component.

## Theming and visual design

- **[Theming](THEMING.md)** — Pointer page. Authoritative theming guide is co-located with `ThemeService` at [`packages/Angular/Generic/shared/THEMING.md`](../packages/Angular/Generic/shared/THEMING.md).
- **[App Color Architecture](APP_COLOR_ARCHITECTURE.md)** — Why dashboards must not hardcode hex values; how to migrate to design tokens.

## Completed / archived

The [`complete/`](complete/) subdirectory holds guides whose subject matter has been fully implemented and absorbed into the codebase. Kept for historical context — newer guides should go in the top-level folder.

---

## Adding a new guide

A topic earns a guide in this folder when:

1. It spans **multiple packages** or touches the framework as a whole — package-internal guidance belongs in that package's `CLAUDE.md`.
2. It captures **non-obvious patterns** a developer would not derive by reading the code alone (gotchas, conventions, "why we do it this way").
3. The patterns have been **validated in production** — speculative designs belong in [`plans/`](../plans/), not here.

When adding a guide, also:
- Add a one-line entry to this README under the appropriate section.
- If the guide is referenced often enough to be a hard requirement, add a pointer to it in the root [`CLAUDE.md`](../CLAUDE.md) under "Development Guides".
