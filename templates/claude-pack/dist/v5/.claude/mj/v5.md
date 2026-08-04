# MemberJunction v5 — version-specific notes

This file ships only with the v5 pack. When you upgrade to v6,
`mj update:claude` will replace it with the v6 overlay. Everything here
is **specific to MJ major version 5** — entity names that exist today,
footguns that have been observed in v5, breaking changes from v4, and the
location of v5 migrations.

For cross-version guidance (the patterns that work on every MJ major),
see `core/*.md`. This overlay adds v5-specific facts on top.

## Supported runtime

- **Node.js** — 18+ required, 20.x or 24.x recommended for production
- **Database** — SQL Server 2019+ or PostgreSQL 14+
- **Angular** (for client-side packages) — Angular 21.x is the v5 baseline
- **TypeScript** — 5.x

## Migrations folder

In v5, all migrations live under:

```
migrations/v5/
```

Filename convention: `V<YYYYMMDDHHMM>__v[VERSION].x_<DESCRIPTION>.sql`.
See `core/07-migrations-basics.md` for the full filename rules and per-
column gotchas (hardcoded UUIDs, the `${flyway:defaultSchema}` placeholder,
the columns CodeGen owns automatically).

When v6 ships, a parallel `migrations/v6/` will appear. Cross-major
migration tooling handles the transition; you don't manually port files.

## The `MJ: ` entity-name prefix

Almost every entity added in the v5 line uses an `MJ: ` prefix to avoid
name collisions with custom entities in user databases. Older entities
that pre-date the convention do not carry the prefix.

The full canonical list lives in your generated `entity_subclasses.ts` —
search for `@RegisterClass` decorators. The ones you'll hit most often
in day-to-day work:

### AI subsystem

- `AI Models` (no prefix — pre-dates convention)
- `AI Prompts` (no prefix)
- `AI Agents` (no prefix)
- `MJ: AI Vendors`, `MJ: AI Vendor Types`, `MJ: AI Vendor Type Definitions`
- `MJ: AI Model Vendors`, `MJ: AI Model Costs`
- `MJ: AI Model Price Types`, `MJ: AI Model Price Unit Types`
- `MJ: AI Configurations`, `MJ: AI Configuration Params`
- `MJ: AI Prompts` (the run-time / extended one — different from `AI Prompts`)
- `MJ: AI Prompt Models`, `MJ: AI Prompt Runs`
- `MJ: AI Agent Types`, `MJ: AI Agent Prompts`
- `MJ: AI Agent Runs`, `MJ: AI Agent Run Steps`

### Conversation / artifact subsystem

- `MJ: Conversation Artifacts`
- `MJ: Conversation Artifact Versions`
- `MJ: Conversation Artifact Permissions`
- `MJ: Artifact Types`

### Dashboards + reports

- `MJ: Dashboard User Preferences`
- `MJ: Dashboard User States`
- `MJ: Report User States`
- `MJ: Report Versions`

### Audit + history

- `MJ: Record Changes` (the audit log every entity writes to by default)
- `Action Execution Logs` (no prefix)

### Older entities — no prefix

- `Users`, `Roles`, `User Views`
- `Entities`, `Entity Fields`, `Entity Relationships`
- `Applications`, `Application Settings`
- `Templates`, `Template Contents`, `Template Categories`
- `Queries`, `Query Categories`, `Query Fields`, `Query Permissions`

When in doubt about an entity name: open `entity_subclasses.ts` in your
installed `@memberjunction/core-entities` and search for the class. The
`@RegisterClass` JSDoc gives the canonical name.

### Common mistakes

```typescript
// ❌ Wrong — missing MJ: prefix on newer entities
const run = await md.GetEntityObject<AIAgentRunEntity>('AI Agent Runs');
const prompt = await md.GetEntityObject<AIAgentPromptEntity>('AI Agent Prompts');

// ✅ Correct
const run = await md.GetEntityObject<AIAgentRunEntity>('MJ: AI Agent Runs');
const prompt = await md.GetEntityObject<AIAgentPromptEntity>('MJ: AI Agent Prompts');
```

## Breaking changes from v4

If you're migrating an app from v4 to v5:

- **Kendo is gone.** All Kendo UI components were replaced with
  `@memberjunction/ng-ui-components` equivalents. If your code imports
  from `@progress/kendo-angular-*`, switch to the MJ component (see
  `core/10-angular-essentials.md` for the catalog).

- **Many entities renamed to add `MJ: ` prefix.** Existing v4 code using
  the old names (without prefix) will break on v5. Update entity-name
  strings in `GetEntityObject` / `RunView` calls.

- **`AIPrompt` vs `MJ: AI Prompt`.** v5 introduced a distinct `MJ: AI Prompts`
  entity for the runtime/extended model; the older `AI Prompts` still
  exists. Code that used `'AI Prompts'` for runtime work needs to switch
  to `'MJ: AI Prompts'`.

- **Manifest system added.** v5 ships pre-built class registration
  manifests for `@memberjunction/server-bootstrap` and
  `@memberjunction/ng-bootstrap`. Apps that wire up `ClassFactory`
  manually should remove that wiring — the bootstrap packages handle
  registration on import.

- **`@RegisterClass` priority semantics tightened.** Order of class
  registration affects which class the factory returns. In v5 the rule
  is "compiled later wins" — when extending a generated form, your
  subclass file must import the generated class so the file orders
  correctly. See `core/10-angular-essentials.md`.

- **Modern Angular template syntax expected for new code.**
  `@if`/`@for`/`@switch` block syntax has replaced `*ngIf`/`*ngFor` in
  the recommended path. Existing components don't need migration but new
  ones should use the modern syntax.

- **CodeGen output paths shifted.** Generated entity classes now live in
  `packages/MJCoreEntities/src/generated/entity_subclasses.ts`; older
  v4 paths under per-package generated folders are deprecated.

## Known v5 footguns

A running list of "things that have tripped real teams in v5". Each
entry has a one-line gotcha and a pointer to the longer treatment if
relevant.

### SQL Server ↔ PostgreSQL UUID case

**Problem.** SQL Server returns UUIDs uppercase; PostgreSQL returns them
lowercase. Comparing IDs with `===` across the two breaks silently when
the database is swapped.

**Fix.** Always use `UUIDsEqual()` from `@memberjunction/core` for
comparisons. Use `NormalizeUUID()` when an ID is a Map/Set key. The
full guide:
https://github.com/MemberJunction/MJ/blob/main/guides/UUID_COMPARISON_GUIDE.md

### Browser cache after backend swap

**Problem.** When developing against both SQL Server and PostgreSQL on
the same URL/port, `GraphQLDataProvider`'s client-side cache holds stale
entity metadata. The case difference causes subtle mismatches.

**Fix.** Clear the browser cache (or open an incognito window) whenever
you swap the backend database platform behind the same endpoint.

### `BaseEntity.Save()` / `.Delete()` return boolean

**Problem.** Forgetting that these return `false` on validation /
permission failure rather than throwing. `try/catch` doesn't catch logical
failures. Silent silent silent.

**Fix.** Always check the boolean return; read `entity.LatestResult?.CompleteMessage`
on failure. See `core/02-entity-essentials.md`.

### Stale CodeGen on dependent code

**Problem.** Migration adds a column → you write code referencing it →
TypeScript errors because the generated entity class doesn't have the
field yet.

**Fix.** Run `mj codegen` between the migration and the dependent code.
Never reach for `.Set('NewField', ...)` to "work around" it. See
`core/06-codegen-contract.md`.

### Settings.local.json conflict

**Problem.** A user puts their personal customizations in
`.claude/settings.json` instead of `.claude/settings.local.json`. They
get warnings when `mj update:claude` runs because the customizations are
mixed with managed content.

**Fix.** Personal/team customizations go in `.claude/settings.local.json`
(which is gitignored and not touched by `mj update:claude`). The shipped
`.claude/settings.json` is for the MJ-managed defaults.

### Missing PG migration counterparts

**Problem.** A SQL Server migration is added in `migrations/v5/` but no
corresponding `.pg.sql` lands in `migrations-pg/v5/`. The
`pg-migration-regression` test in `sql-converter` fails on every PR.

**Fix.** Either run the `pg-migrate` tooling to generate the PG version,
or add the file to the intentional-no-pg-counterpart allowlist if the
T-SQL really can't translate. This is a release-process concern, not an
integrator concern, but you'll see the test failures in CI.

## AI subsystem snapshot (v5)

The v5 AI subsystem is built around a layered model:

```
AI Configurations
        │
        │  references
        ▼
    AI Agents ────── uses ──────► AI Prompts ── (runs against) ──► AI Models
        │                                                              ▲
        │  emits run records                                            │
        ▼                                                               │
MJ: AI Agent Runs                                          MJ: AI Vendors
        │                                                  (which vendors can
        │  contains                                         serve a given model)
        ▼
MJ: AI Agent Run Steps
```

Key entities by responsibility:

- **`AI Models`** — model definitions (e.g. `claude-opus-4-7`, `gpt-4o`).
- **`MJ: AI Vendors`** — providers (Anthropic, OpenAI, Groq, …).
- **`MJ: AI Model Vendors`** — which vendor(s) can serve which model,
  with per-vendor token limits.
- **`AI Prompts`** + **`MJ: AI Prompts`** — reusable prompt templates with
  parameters. `MJ: AI Prompts` is the runtime/extended entity.
- **`MJ: AI Agent Types`** — defines an agent kind (Loop agent, Flow agent, …).
- **`AI Agents`** — composed agents with prompts, actions, and a type.
- **`MJ: AI Agent Runs`** + **`MJ: AI Agent Run Steps`** — execution records.
- **`MJ: AI Prompt Runs`** — execution records of individual prompts.
- **`MJ: AI Configurations`** — environment-level configs that bind the rest.

### Adding a new AI model — the canonical flow

1. Insert an `AI Models` row (or via mj-sync).
2. Insert an `MJ: AI Model Vendors` row linking it to the vendor that
   can run it, with the vendor's published context window and
   per-million-token cost.
3. Reference the model by ID (not by name) from prompts and agents.

**Don't** hardcode model names in code. They're database-driven so
admins can swap models without code changes.

## What's NOT in this overlay

Topics you might expect here that are actually in `core/*.md` because
they apply to every MJ major:

- BaseEntity patterns, typed-property rule → `core/02-entity-essentials.md`
- RunView / RunViews / ResultType → `core/03-runview-patterns.md`
- Migration filename rules and `${flyway:defaultSchema}` → `core/07-migrations-basics.md`
- Angular form extension, design tokens, modern syntax → `core/10-angular-essentials.md`,
  `core/11-design-tokens.md`
- Singletons, imports, testing, performance → `core/08`–`core/15`
- Anti-pattern cheat sheet → `core/17-dont-do-this.md`

When v6 ships, this overlay stops being authoritative; until then it
captures the things that would mislead you if stale.
