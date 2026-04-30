# MJ Coding Standards

Distilled from AN-BC's code review feedback across 30+ PRs (2025–2026).

---

## 1. Naming & Terminology

- [ ] **Use MJ-native terminology everywhere.** Don't import external product terms (e.g., "contact" → use "user" in MJ). Naming matters enormously for readability and long-term scalability in a framework codebase.
- [ ] **Avoid application-specific terms in generic/core code.** If the code is in a shared package, name things generically (e.g., "secondary scopes" not "SaaS scopes"). Application-specific terms belong in application-level code.
- [ ] **Be precise with property and config names.** Names should convey purpose without requiring context (e.g., `SecondaryScopeConfig` not just `ScopeConfig`).
- [ ] **Name for the long term.** Prefer "AI" over "LLM" — LLM is likely a fading term; AI will be relevant for decades. Every naming choice gets evaluated for how it scales across 300+ connectors and years of maintenance.
- [ ] **Minor nits in naming matter for AI generation.** E.g., "Namespace" is one word. Small details affect quality of AI-generated code downstream.
- [ ] **Use clear namespace prefixes for packages.** E.g., `@bluecypress/bcsaas-ng-bootstrap` — prefix with the product name so the namespace stays clean and extensible.
- [ ] **Use MJ component naming conventions.** E.g., `MJDropdownComponent` not `MjDropdownComponent` — capital J.

## 2. TypeScript Patterns

- [ ] **Use property setters, not setter methods.** Define `public set AgentNotes(...)` instead of `SetAgentNotes(...)`. Property setters yield `x.AgentNotes = y` — cleaner than `x.SetAgentNotes(y)`. This matters *especially* in framework code.
- [ ] **Use strongly typed getters and generics.** Prefer `params.agent.ScopeConfig` over `params.agent.get("ScopeConfig")`. Use generics: `await md.GetEntityObject<AssetCategoryEntity>('Asset Categories', this.contextUser)`.
- [ ] **Use async/await, never `.then()` callbacks.** All async code should use `await` — MJ methods are already Promisified.
- [ ] **Strong-type all variables.** If a variable like `note` has a known shape, type it. Don't leave things as `any` or untyped.
- [ ] **Always use strict equality (`!==`, `===`).** Never use loose equality (`!=`, `==`). Use `!==` for null checks specifically — `||` is preferred over `??` for fallbacks because `||` falls back on any falsy value (including `undefined`), whereas `??` only tests for null.
- [ ] **Don't hack types with `any` casting.** When you need temporary runtime state, create a proper sub-interface or extended type. Set temporary flags back to `undefined` after use.
- [ ] **Use static methods on classes for conversion/factory logic.** Instead of standalone helper functions, put conversion methods as static methods on the relevant class (e.g., `QueryExecutionSpec.FromQueryInfo()`). See `CompositeKey` as the model.
- [ ] **Don't create overlapping types/interfaces for similar concepts.** If a type like `ComponentSpec` already exists, subclass/extend it. Too many similar types is a code smell.
- [ ] **For JSON columns, define strongly typed interfaces in a shared package.** Create an interfaces-only package consumed by both UI and backend — single source of truth, nice editing UX, consistent processing, and forward/backward compatibility.
- [ ] **Favor `params.provider || this._provider` pattern** for fallback logic. Always favor the locally-passed parameter over the instance-level default. This ensures callers can override behavior at the call site.

## 3. Function & Code Organization

- [ ] **Keep functions short.** Don't let functions grow excessively long. In the age of AI coding, functional and OO decomposition still matters.
- [ ] **Don't build backward-compatibility shims.** It creates bloat and degrades quality. Tell Claude Code not to worry about backward compatibility unless explicitly needed.
- [ ] **Don't embed large SQL string literals in code.** Use defined Queries with `RunQuery` instead.
- [ ] **Remove dead code and unused dependencies.** If a dependency (e.g., Kendo) or a prompt template is no longer in the execution path, rip it out.
- [ ] **Avoid dynamic imports — they're a red/yellow flag.** A dynamic `import()` usually signals a circular dependency. Fix the root cause by moving the factory/class to its own package or lower in the dependency chain.
- [ ] **Check for existing utilities before writing new ones.** Developers (and AI tools) frequently create new functions without checking if MJ already has one. Extra duplicative code isn't good.
- [ ] **Don't let AI make cosmetic breaking changes.** If AI renames a database field or refactors something "pedantically," push back. A field rename is a breaking change, and if it's not necessary, revert it.

## 4. Architecture & Abstraction

### Core Principles

- [ ] **Containment over inheritance for server wrappers.** Use containment (has-a), not subclassing (is-a), when wrapping a client-side engine with server-side behavior. Model: `AIEngine` contains `AIEngineBase`. This prevents duplicate metadata loading between client and server versions.
- [ ] **Use `BaseSingleton` for true process-wide singletons.** Static class-level singletons can exist more than once in a process due to how JS loads/resolves code. Use `BaseSingleton` (talk to bc-izygmunt about the pattern).
- [ ] **Use abstract methods to enforce implementation at the right level.** Define abstract in `ProviderBase` → implement abstract in `DatabaseProviderBase` → concrete implementation in `GenericDatabaseProvider`. `GraphQLDataProvider` throws "method not supported." The type system should enforce the contract.
- [ ] **Don't tightly couple to specific providers.** Wrap external services behind generic interfaces. Starting wrong here makes refactoring painful later.
- [ ] **Build multi-tenant from the start.** Use BCSaaS from day one even with one tenant. Avoids painful retrofit.

### Design Decisions

- [ ] **Think about extensibility and layering.** Consider how a SaaS application on top of MJ would use your features. Design schemas supporting application-defined scoping, key/value dimensions, and flexible configuration.
- [ ] **Design for flexible scoping.** Support scenarios where callers use primary scoping, secondary scoping, both, or neither.
- [ ] **Keep `@memberjunction/core` lightweight.** It's included everywhere. If something can live in `GenericDatabaseProvider` or another lower-level package, move it there.
- [ ] **Prefer generic CLI/plugin architecture.** Define interfaces that libraries implement, register classes, run commands in a generalized way for easy extension.
- [ ] **When subclassing, make sure you're getting value from the base.** If you override `Config` and replicate the setup, subclass directly from `BaseEngine` instead.
- [ ] **Use `@RegisterClass` + export from package entry point** for tree shaking. The old `LoadXXX()` pattern is deprecated. For non-MJAPI/MJExplorer executables, wire in a pre-build script for `mj codegen manifest`.
- [ ] **Think systemically before adding features.** When adding a new property like `AIDirective`, have Claude study ALL existing actions/agents and propose where else it should apply. Don't solve one case — solve the category.

## 5. Cross-Cutting Awareness

- [ ] **Auth/caching fixes must work across ALL providers.** Don't fix just Auth0 or just MSAL — MJ supports many.
- [ ] **SQL-specific code needs PostgreSQL variants.** All stored queries must have tested PG variants in metadata. Watch for SQL Server syntax (e.g., `sys.partitions`).
- [ ] **Integration targets never get migrations in core MJ DB.** That's what RSU (Runtime Schema Update) is for. This will get your PR stopped on sight.
- [ ] **Tag relevant team members on cross-cutting changes.** If your change touches auth, data layer, or shared infra, tag people who recently worked on those areas.
- [ ] **Document tradeoffs in code.** If you make a tradeoff (e.g., less error detail for security), add a comment explaining *why*. Don't silently remove useful diagnostic information.

## 6. Use Existing MJ Framework Features

- [ ] **Use `RunQuery` for data retrieval.** Create a JSON entry in `/metadata/queries` with a `.sql` file. Cleaner, more reusable, and more robust than inline SQL.
- [ ] **Use `mj sync` for metadata, not migration files.** Update JSON files in `metadata/` and push with `mj sync push`. Migrations are for schema changes only.
- [ ] **Use `Base.Config(true, contextUser)` for cache refresh.** Eliminates custom setters and leverages local caching.
- [ ] **Use `BaseEntity.ContextCurrentUser`** instead of manually tracking the current user.
- [ ] **Use `@memberjunction/global` utilities** like `CleanJSON` instead of custom JSON-cleaning logic.
- [ ] **Use `params.verbose` from `ExecuteAgentParams`** for controlling log output — don't invent your own flag.
- [ ] **Use the existing prompting infrastructure** for error handling in agents.
- [ ] **Use `ResultType: 'simple'`** (or omit entirely) when you don't need to mutate rows. Omitting returns plain JS objects — less overhead, especially for large result sets. **Claude Code tends to add `ResultType` by default — watch for this and remove it.**
- [ ] **Use `ResultType: 'count_only'`** when you only need a count.
- [ ] **Add a `Fields` property** to constrain result sets — fewer fields = less bandwidth + faster SQL.
- [ ] **Use MJ's built-in scheduling** for recurring tasks instead of background cron jobs.
- [ ] **Use `SQLVariant` package for dialect-specific SQL.** Don't put SQL dialect logic in random places like `queryCompositionEngine.ts`. Use the dedicated package so it supports N databases over time.

## 7. Performance & Network Efficiency

- [ ] **Treat the network as a rare resource**, especially in UI code. Every round trip counts.
- [ ] **Use `TransactionGroup` to batch database operations.** Instead of sequential `Save()` calls (network-inefficient, brittle, serial), submit all operations in one `COMMIT`.
- [ ] **Parallelize independent operations with `Promise.all`.** Don't `await` one thing before starting another if they're independent.
- [ ] **Don't request entity objects (`ResultType`) unless mutating.** Creating `BaseEntity` subclass instances for each row adds overhead. Omit for read-only data. Thousands of rows with unnecessary entity wrapping adds up.
- [ ] **Be cautious with `JSON_VALUE` in SQL at scale.** Consider in-memory caching with pre-filtering instead.
- [ ] **Constrain query result sets.** Do I need all fields? Am I fetching full records just to count them?
- [ ] **Watch LRU vs full cache tradeoffs.** LRU isn't always better — monitor cache hit rates in practice.
- [ ] **Be skeptical of TTL-based caching.** TTL is "very dumb" caching. Consider entity-mutation-based cache invalidation instead. If you can't guarantee freshness, bypass the cache and document why.

## 8. Logging & Error Handling

- [ ] **Don't spam console output.** Only emit verbose/detailed logs when `params.verbose` is true. Otherwise, a single summary message when done.
- [ ] **Don't silently reduce error detail.** If you thin out an error message (e.g., for security), add a comment explaining why. Useful diagnostic info like entity name and key should be preserved in server-side logs even if client-facing messages are reduced.
- [ ] **Use structured error approaches.** When building directives or AI-facing metadata, define proper interfaces with `message`, `type`, and `priority` fields instead of relying on heuristics like "longer message = more important."

## 9. Prompt Engineering (for Agents/AI Features)

- [ ] **Keep prompt examples concise.** Verbose examples waste tokens and don't improve generation quality.
- [ ] **Don't include unnecessary details in prompts** like version numbers if the system defaults to latest.
- [ ] **Clean up dead prompts.** If an agent was refactored to a flow agent, remove the old standalone prompt.
- [ ] **Include relevant notes/context in prompts.** If a prompt spans multiple expert domains, include notes from all relevant domains.

## 10. Working with AI Code Assistants

- [ ] **Coach AI to use modern patterns.** Explicitly instruct Claude Code to use async/await, strongly-typed code, and MJ conventions.
- [ ] **Don't let AI generate backward-compat bloat.** Tell it not to worry about backward compatibility unless explicitly needed.
- [ ] **Don't let AI add `ResultType` by default.** Claude Code tends to overuse this — only include it when mutating data.
- [ ] **Don't let AI use dynamic imports to solve circular deps.** Fix the dependency graph instead.
- [ ] **Don't let AI make cosmetic schema changes.** A field rename is a breaking change. If AI suggests renaming a DB column for "consistency," push back hard.
- [ ] **Don't let AI resolve merge conflicts.** Do merge conflicts **one by one yourself, NOT Claude** to ensure you don't wipe other people's changes.
- [ ] **Distinguish between "Claude tested" and "you tested."** Personally test all UI changes. Claude running in Docker is not the same as you testing in the browser.
- [ ] **Leverage AI for boilerplate.** Use Claude Code for PR descriptions, `RunQuery` JSON/SQL files, migration scripts, JSDoc — but review for MJ-specific correctness.
- [ ] **Use AI to think systemically.** Have Claude study all existing actions/agents/patterns before proposing new ones. Use it for analysis and proposals, not just code generation.
- [ ] **Use `/update-pr` command** to have AI generate proper PR titles and descriptions from commit history.

---

*Source: AN-BC review comments across 30+ PRs in MemberJunction/MJ, BlueCypress/Skip-Brain, BlueCypress/SaaS, and BlueCypress/Sidecar-Learning-Hub (2025–2026)*