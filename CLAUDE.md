# GENERAL RULE
Don't say "You're absolutely right" each time I correct you. Mix it up, that's so boring!

# MemberJunction Development Guide

<!-- This file is deliberately small. Anthropic's guidance is ~200 lines per CLAUDE.md: longer
     files consume context AND reduce adherence. Detailed guidance lives in path-scoped rules,
     nested CLAUDE.md files, and skills — all of which load on demand. See the routing table
     below. `npm run check:claude-md` enforces the budget and proves nothing was lost.
     Before adding anything here, read "Where new guidance goes" at the bottom. -->

Everything below is either **unrecoverable if violated** (so it must survive `/compact`) or **true
on every task regardless of what you're touching**. Everything else loads on demand — see
[Where the rest of the guidance lives](#where-the-rest-of-the-guidance-lives).

---

## 🚨 CRITICAL RULES — VIOLATIONS ARE UNACCEPTABLE 🚨

### 1. NO COMMITS WITHOUT EXPLICIT APPROVAL
- **NEVER run `git commit` without the user explicitly asking you to**
- **Each commit requires ONE-TIME explicit approval** — don't assume ongoing permission
- **NEVER ask to commit** — wait for the user to request it
- **ONLY commit what is staged** — never modify or add to staged changes
- **NEVER commit work-in-progress** that isn't staged by the user

### 2. NO DESTRUCTIVE GIT OPERATIONS WITHOUT EXPLICIT APPROVAL
- **NEVER run `git checkout -- <file>` or `git restore <file>`** to discard changes without the user explicitly approving — even in bypass/auto-approve permission mode
- **NEVER run `git reset --hard`** without explicit approval
- These commands destroy uncommitted work (staged and unstaged) and cannot be undone
- If you need to undo YOUR changes to a file, use `git diff` to identify only your changes and reverse them with targeted `Edit` calls — this preserves the user's other in-progress work
- **NEVER update title/description of merged PRs** without explicit approval each time
- Always ask before modifying any historical git data

### 3. FEATURE BRANCHES MUST TRACK SAME-NAMED REMOTE BRANCHES

**Why this matters**: if a feature branch tracks `origin/next` instead of `origin/<its-own-name>`, `git push` sends commits **directly to `next`**, bypassing PR review and potentially breaking the main branch for everyone.

```bash
# ✅ CORRECT — create branch and push with upstream tracking to the same-named remote
git checkout -b my-feature-branch
git push -u origin my-feature-branch

# ❌ WRONG — a branch created from next tracks origin/next by default. DANGEROUS.
git checkout next
git checkout -b my-feature-branch
```

**Before every push**, verify tracking:
```bash
git branch -vv
# * my-feature [origin/my-feature]  ✅ tracks same name
# * my-feature [origin/next]        ❌ tracks next — fix before pushing
```

Fix incorrect tracking with:
```bash
git branch --set-upstream-to=origin/my-feature-branch my-feature-branch
```

**This is a non-negotiable safety requirement.**

### 4. START WORK ON A FEATURE BRANCH
Before starting a new line of work, check the current branch. It must be (a) separate from the remote default branch and (b) named for the work being requested. If not, **ask first**, then cut and switch to one.

---

## ✅ Definition of Done

A change is not done until **both** test tiers pass. Report results — pass/fail/skip counts — to the user.

**Unit tests** — when you modify ANY package's source, run that package's tests:
```bash
cd packages/PackageName && pnpm test
```
If tests fail because of your change, **update them**. If they fail for other reasons, **fix them**. Never leave broken tests behind. Never assume tests still pass after changing signatures, renaming methods, changing return values, or altering behavior.

**Integration tests** — the deterministic tier must be run headless and pass:
```bash
pnpm run test:integration    # = MJ_INTEGRATION_TEST=1 mj test suite "Integration Tests — Deterministic"
npx mj test run "IT30 - Conversation Compaction (assembly layer)"   # single bundle while iterating
```
Unit tests passing is necessary but **not sufficient** — the integration tier catches the seams between packages that unit tests mock away. Run it after migrations + CodeGen have been applied. Full details, authoring rules, and the client-first transport doctrine: [`guides/INTEGRATION_TESTING_QUICKSTART.md`](guides/INTEGRATION_TESTING_QUICKSTART.md).

---

## Always-true facts

**Strong typing, always.** Never use `any`, `as any`, or `unknown`-as-a-shortcut — MJ has a proper type for everything; ask if you think you need one. Never use `.Get()`/`.Set()` as a substitute for generated entity properties. Details: [`.claude/rules/typescript-style.md`](.claude/rules/typescript-style.md).

**Entity names carry the `MJ: ` prefix.** As of v5.0, all core entities are `MJ: AI Agents`, `MJ: AI Prompt Runs`, etc. An unprefixed name throws `Entity ... not found in metadata`. Verify names in `packages/MJCoreEntities/src/generated/entity_subclasses.ts`.

**The generated ORM is the schema's source of truth** — not migration SQL. Migrations are append-only history; the entity classes reflect the net result.

**CodeGen reads JSONType definitions from the database, not from `metadata/`.** Run `mj sync push` **before** `mj codegen`, or CodeGen regenerates from stale definitions and *silently deletes* properties from the generated types. Full ordering + why it's silent: [`migrations/CLAUDE.md`](migrations/CLAUDE.md).

**A CodeGen `EntityField` INSERT in a migration must never carry a literal `Sequence`.** The number CodeGen writes is a temporary placeholder that a *repeatable* script renumbers — and Flyway runs every versioned migration before any repeatable script, so on a from-scratch database it never gets renumbered in time and a second migration touching the same entity collides on `UQ_EntityField_EntityID_Sequence`. It then reports itself as an unrelated foreign-key error. This cannot fail on a working dev database; it fails only on fresh installs. Use an apply-time `MAX(Sequence)+1` expression. Gate: `.github/scripts/check-migration-entityfield-sequence.sh`. Full explanation: [`migrations/CLAUDE.md`](migrations/CLAUDE.md).

**One database per agent.** Before `mj migrate` / `mj codegen` / `mj sync push`, confirm no other session is using your `DB_DATABASE` — a git worktree isolates the filesystem, **not** the database. Interleaved CodeGen runs leave metadata demanding view columns that no longer exist, and *both* runs report success while someone else's server logs the errors. Rules + the incident that produced them: [`migrations/CLAUDE.md`](migrations/CLAUDE.md).

**Build commands** — this is a **pnpm** workspace (`packageManager` in `package.json` pins the version; the lockfile is `pnpm-lock.yaml`). Never run `npm install` here — it would create a `package-lock.json` the repo no longer uses and resolve a different tree:
```bash
pnpm run build            # all packages, from repo root
pnpm run watch            # watch mode
pnpm run start:api        # MJAPI — port 4000 by default, override with GRAPHQL_PORT
pnpm run start:explorer   # MJExplorer (port 4201)
cd packages/PackageName && pnpm run build   # single package — use this, NOT turbo from root
```
After making code changes, **always compile the affected package** and fix all TypeScript errors before proceeding.

**pnpm workspace**: add dependencies to the individual package's `package.json`, then run `pnpm install` **at the repository root**. Never run it inside a package directory. pnpm enforces declared dependencies strictly — a package that imports something it doesn't declare fails to resolve rather than falling through to a hoisted copy, so declare every import.

**Migration folder**: the `migrations/v*/` folder must match **the major version in the migration's own filename** — `V…__v6.1.x__Name.sql` belongs in `migrations/v6/`, a `v5.x` file in `migrations/v5/`. Read the folder off the name you just chose; never off a number written down here, which goes stale at every era. Flyway scans `./migrations` recursively and reads the version from the filename, so a misfiled migration still runs — but it strands its PostgreSQL counterpart, which is paired per folder (`migrations/vN` ↔ `migrations-pg/vN`).

**PostgreSQL is toolchain territory — do not hand-author it, and do not build tooling for it.** A feature PR ships the **T-SQL migration only**. Never write a `migrations-pg/**` counterpart, and never write a script that checks, generates, or gates PG parity. Converting T-SQL to PG is deterministic transpilation (`mj migrate convert`, the SQLConverter package, `/pg-migrate-v2`) run by the **build engineer at release time** — the same cadence as the consolidated metadata-sync migration. LLM-inferred PG SQL and one-off parity scripts are exactly what that toolchain exists to replace: they drift from the converter, gate feature PRs on work that is not theirs, and rot. If PG conversion looks wrong, fix the converter or tell the build engineer — do not route around it. Details: [`migrations/CLAUDE.md`](migrations/CLAUDE.md).

**Record Changes**: MJ has built-in version control for all entities. Don't implement custom versioning.

---

## Where the rest of the guidance lives

Guidance is **loaded on demand**, so it costs nothing until it's relevant. This table is the router — if you need a rule you don't currently have, it's here.

### Path-scoped rules (`.claude/rules/`) — load when you open a matching file

| Rule | Loads for | Covers |
|---|---|---|
| [`data-access.md`](.claude/rules/data-access.md) | `**/*.ts` | `RunView`/`RunViews`, `ResultType`/`Fields`, `BaseEntity` Save/Delete error handling, entity metadata lookup (`EntityByName`), per-provider `Metadata` scoping, caching + `BaseEngine`/`BaseEngineRegistry`, keyset pagination, `UserInfoEngine` preferences |
| [`typescript-style.md`](.claude/rules/typescript-style.md) | `**/*.ts` | No `any`, no `.Get()`/`.Set()`, derive field types from the entity, no cross-package re-exports, `BaseSingleton`, no dynamic `import()`, naming conventions, functional decomposition, OOD |
| [`design-tokens.md`](.claude/rules/design-tokens.md) | `**/*.scss`, `**/*.css` | No hardcoded colors, the semantic token catalog, hex→token mappings, `color-mix()`, the CI gates |
| [`testing.md`](.claude/rules/testing.md) | `**/*.test.ts`, `**/__tests__/**` | Vitest conventions, test structure, the scaffold script, fixing test drift, CI integration |
| [`changesets.md`](.claude/rules/changesets.md) | `.changeset/**` | Bump levels — `minor` is reserved for migration/metadata branches, everything else `patch`; why the `fixed` group makes one stray `minor` repo-wide; the `check:changeset` self-check |

### Nested `CLAUDE.md` — load when you read a file in that tree

| Path | Scope |
|---|---|
| [`migrations/CLAUDE.md`](migrations/CLAUDE.md) | Migration authoring — naming, hardcoded UUIDs, system columns CodeGen owns, CHECK constraints, CodeGen handoff |
| [`metadata/CLAUDE.md`](metadata/CLAUDE.md) | Metadata authoring — `@lookup`/`@file`/`@parent` refs, `uuidgen` primary keys, no per-PR sync migrations, seeding lookup tables, application metadata |
| [`metadata/components/CLAUDE.md`](metadata/components/CLAUDE.md) | Interactive component authoring — component architecture rules, the `ProductRevenueMatrix` reference implementation |
| [`docker/CLAUDE.md`](docker/CLAUDE.md) | Docker workbench + MJAPI container configurations |
| [`stats/CLAUDE.md`](stats/CLAUDE.md) | Repo LOC stats — generated files, do not hand-edit |
| [`packages/Actions/CLAUDE.md`](packages/Actions/CLAUDE.md) | Actions are boundaries, not internal APIs — when to create one, parameter validation, error handling |
| [`packages/Angular/CLAUDE.md`](packages/Angular/CLAUDE.md) | Angular conventions — multi-provider `@Input() Provider`, routing, query-param round-trip, component/module strategy, template syntax, UI components, forms, `NotifyLoadComplete` |
| [`packages/Angular/Generic/CLAUDE.md`](packages/Angular/Generic/CLAUDE.md) | Generic-Angular — no Router imports, reusability constraints |
| [`packages/Angular/Explorer/CLAUDE.md`](packages/Angular/Explorer/CLAUDE.md) | Explorer patterns — `NavigationService`, `BaseResourceComponent`, deep links |
| [`packages/Angular/Explorer/dashboards/CLAUDE.md`](packages/Angular/Explorer/dashboards/CLAUDE.md) | Dashboard page chrome, `NotifyLoadComplete`, agent context wiring |
| [`packages/Angular/Bootstrap/CLAUDE.md`](packages/Angular/Bootstrap/CLAUDE.md) | 🚨 Browser manifest — **no server-only dependencies** |
| [`packages/Angular/BootstrapLite/CLAUDE.md`](packages/Angular/BootstrapLite/CLAUDE.md) | 🚨 Lite browser manifest — **no server-only dependencies** |
| [`packages/MJCoreEntities/CLAUDE.md`](packages/MJCoreEntities/CLAUDE.md) | 🚨 Generated ORM — never hand-edit; the schema's source of truth |
| [`packages/CodeGenLib/CLAUDE.md`](packages/CodeGenLib/CLAUDE.md) | CodeGen — what it generates, when it runs, DB connection + env vars, class-registration manifests |
| [`packages/MJAPI/CLAUDE.md`](packages/MJAPI/CLAUDE.md) | Server runtime — connection pooling, startup mode, public URL, platform switching |
| [`packages/DBAutoDoc/CLAUDE.md`](packages/DBAutoDoc/CLAUDE.md) | DB auto-doc package conventions |

### Guides — the complete index is [`guides/README.md`](guides/README.md)

41 cross-cutting "read this before you build that" guides, categorized. **Consult the index before starting work in an unfamiliar area** — these capture patterns already litigated. Frequently needed: [UI Layering](guides/UI_LAYERING_GUIDE.md), [Caching & Pub/Sub](guides/CACHING_AND_PUBSUB_GUIDE.md), [UUID Comparison](guides/UUID_COMPARISON_GUIDE.md), [Unified Permissions](guides/UNIFIED_PERMISSIONS_GUIDE.md), [Search Overview](guides/SEARCH_OVERVIEW_GUIDE.md), [Dashboard Best Practices](guides/DASHBOARD_BEST_PRACTICES.md), [Forms Architecture](guides/FORMS_ARCHITECTURE_GUIDE.md), [Transport Layer](guides/TRANSPORT_LAYER_ARCHITECTURE_GUIDE.md), [Remote Operations](guides/REMOTE_OPERATIONS_GUIDE.md).

**UI work is layered — L0 runtime → L1 widget → L2 composite → L3 Explorer surface.** Nothing below L3 imports `@angular/router` or an Explorer package; nothing at L3 holds domain logic. Read [`guides/UI_LAYERING_GUIDE.md`](guides/UI_LAYERING_GUIDE.md) before building any UI, in this repo or any MJ app repo.

### Skills — load only when invoked

`debug-build-failures` (package won't build / Turbo / circular deps), `playwright-cli` (browser automation + the MJ dev-server loop), `scaffold-mj-dashboard` (new Explorer dashboard), `bootstrap-clean-db` (build a DB from scratch on a private name — clean-room verification, or just a database no other agent is using).

### Project-wide standards

- **[Publish-Then-No-Breaking-Changes Policy](packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md)** — within a published OpenApp major version, only additive schema changes are allowed. Consult before authoring any migration that modifies an existing schema. (Adopted 2026-04-29, prospective from each app's next published version.)
- **[Full Autonomy Development](claude-full-auto.md)** — for sandboxed/air-gapped machines only. **Not for regular development machines.**

### Local CI mirrors

```bash
npm run check:ui          # design-token + button gates on changed CSS/SCSS (mirrors the PR gate)
npm run check:standards   # every adopted MJ standard (see .mj-standards.json)
npm run check:esm         # native-ESM import guard for "type": "module" packages
npm run check:claude-md   # instruction-file budget, link validity, and routing-table coverage
npm run check:changeset   # changeset bump levels (local only — no CI gate enforces this one)
npm run check:codegen-tail # new-table migrations ship their generated entity (same command CI runs)
```

---

## Working style

**Parallelize aggressively.** Whenever you need to spin up tasks that don't require user interaction and aren't interdependent, run them **in parallel**. Never process independent tasks sequentially.

<!-- Function decomposition rules deliberately live ONLY in .claude/rules/typescript-style.md.
     They were summarized here at one point, and the paraphrase drifted from the rule it was
     summarizing — a restated rule is a second source of truth that silently diverges. If a rule
     has a home, link to it; don't re-say it. -->

---

## Where new guidance goes

Before adding anything to this file, route it:

1. **Is it unrecoverable if violated?** (destroys work, bypasses review, ships a breaking change) → here, so it survives `/compact`.
2. **Is it true on literally every task?** → here.
3. **Does it apply to a file type?** (`.ts`, `.scss`) → a path-scoped rule in `.claude/rules/`.
4. **Does it apply to a directory/subsystem?** → that subtree's `CLAUDE.md`.
5. **Is it a multi-step procedure?** → a skill in `.claude/skills/`.
6. **Does an enforcement script already exist?** → a hook, not prose.
7. **Is it "read this before building X"?** → a guide, indexed in [`guides/README.md`](guides/README.md).

Anything reaching step 3 or beyond **does not belong in this file**. The 30-second test from
Anthropic's own guidance: *"Would removing this line cause Claude to make mistakes?"* — and then:
*"on every task, or only when touching a particular kind of file?"* The second answer routes it out.
