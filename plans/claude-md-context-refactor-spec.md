# Spec: Refactor root `CLAUDE.md` for context cost, without losing guidance

**Status:** Draft — awaiting approval
**Author:** drafted from `/to-spec` synthesis, 2026-07-24
**Branch:** `worktree-refactor-claude-md`

---

## Problem Statement

Every Claude Code session in this repository begins by loading the root `CLAUDE.md` in
full. That file is now **2,256 lines / 153 KB ≈ 38,100 tokens**, and it is loaded before
a single line of code is read — on top of the user-scope `~/.claude/rules/design-principles.md`
and the auto-memory index.

Anthropic's guidance is to **target under 200 lines per `CLAUDE.md`**, because "longer files
consume more context and reduce adherence" and "bloated CLAUDE.md files cause Claude to
ignore your actual instructions"
([memory](https://code.claude.com/docs/en/memory.md),
[best-practices](https://code.claude.com/docs/en/best-practices.md)).
The root file is **11× that target**. The cost is therefore not only tokens; it is
*compliance*. The more rules the file accumulates, the less reliably any individual rule
is followed — which is the exact opposite of what each addition intended.

The bloat has already produced measurable decay:

1. **The largest section is a worse duplicate of a file that already exists.**
   `## 📚 Development Guides` is 7,267 tokens — 19% of the whole file — and duplicates
   `guides/README.md`, which is already a categorized index with concise one-line entries.
   The root copy references **21 guides while 36 exist on disk**. Fifteen guides are
   invisible to it, including `BUILDING_APPS_ON_MJ`, `NAVIGATION_AND_ROUTING_GUIDE`,
   `SOFT_DELETES_GUIDE`, `ANGULAR_TESTING_GUIDE`, `MIGRATION_CODEGEN_WORKFLOW_GUIDE`,
   `OPTIMISTIC_UI_SAVE_PATTERN`, `TAXONOMY_TAGGING_GUIDE`, `THEMING`, and
   `APP_COLOR_ARCHITECTURE`. The bloat is costing coverage, not buying it.

2. **Root duplicates nested `CLAUDE.md` files that already exist.** Roughly 5,300 tokens
   of root content restate `packages/Angular/CLAUDE.md`, `packages/Actions/CLAUDE.md`,
   `migrations/CLAUDE.md`, and `metadata/CLAUDE.md`. Two sources of truth for one rule is
   worse than bloat — it is guaranteed future drift.

3. **Three nested `CLAUDE.md` files are orphaned from the index** — `stats/`,
   `packages/Angular/Bootstrap/`, `packages/Angular/BootstrapLite/`. The last two carry a
   hard "no server-only dependencies reach the browser bundle" rule that the root index
   never mentions, so it is discoverable only by accident.

4. **References have already rotted unnoticed.** `plans/base-engine-permission-constrained.md`
   and `plans/query-entity-materialization.md` are cited but do not exist. The
   `CLASS_MANIFEST_GUIDE` link's text and target disagree. A 2,256-line file is not
   reviewable in a PR, so staleness accumulates silently.

The naive fix — split the file up and `@import` the pieces back — **does not work, and the
docs say so explicitly**: "imported files still load and enter the context window at launch"
([memory](https://code.claude.com/docs/en/memory.md)). Imports are an organization tool with
**zero** token savings. Any plan built on them would move bytes around and change nothing.
This spec exists partly to record that finding so it is not rediscovered.

---

## Solution

Reallocate the root file's content across Claude Code's **lazy-loading** mechanisms, so
each rule is present when it is relevant and absent when it is not.

The load semantics that make this possible ([memory](https://code.claude.com/docs/en/memory.md),
[context-window](https://code.claude.com/docs/en/context-window.md)):

| Mechanism | Startup cost | Loads when | Survives `/compact`? |
|---|---|---|---|
| Root `CLAUDE.md` | **Full, always** | session start | ✅ re-injected |
| Nested `CLAUDE.md` (below cwd) | **Zero** | a file in that subtree is read | ❌ reloads on next read |
| `.claude/rules/*.md` **with** `paths:` | **Zero** | a file matching the glob is read | ❌ reloads on next read |
| `.claude/rules/*.md` **without** `paths:` | Full, always | session start | ✅ |
| `@import` | **Full, always** | session start | ✅ |
| Skill name + description | Small, always | session start | ❌ listing not re-injected |
| Skill body | **Zero** | on invocation | ⚠️ partial (5k/skill, 25k total) |
| Hook | **Zero** (it is code) | at a lifecycle event | n/a |

Two consequences drive every decision below.

**First, nested `CLAUDE.md` and path-scoped rules are the only real savings.** Content moved
there costs nothing until it is relevant. This is confirmed both by the documentation and
by direct observation: in the session that produced this spec, only root `CLAUDE.md` was
present in context at start — `packages/Angular/CLAUDE.md` was not.

**Second, lazily-loaded content is dropped by `/compact` and does not return until a matching
file is read again.** Root `CLAUDE.md` is re-injected. This sets a hard floor on what may be
moved: any rule whose violation is **unrecoverable** must stay in root, because a long
session that compacts must not silently lose it. "Never commit without approval" and "never
run `git reset --hard`" protect against irreversible loss and therefore stay. "Use
`--mj-text-primary` instead of `#333`" is caught in review and can move.

Applied to this repository, the target end state is:

- **Root `CLAUDE.md` ≈ 200–250 lines** — safety rules that must survive compaction,
  facts true in every session regardless of what is being touched, and a **routing table**
  telling Claude where the rest lives.
- **A new `.claude/rules/` directory** — currently unused in this repo — holding
  path-scoped rules for the guidance that is *file-type* scoped rather than *directory*
  scoped. TypeScript entity/data-access patterns glob to `**/*.ts`; the design-token rules
  glob to `**/*.{scss,css}`. Nested `CLAUDE.md` cannot express this; path-scoped rules can.
- **Existing nested `CLAUDE.md` files become the single source of truth** for their
  subsystem, absorbing the root duplicate rather than sitting beside it.
- **Multi-step procedures become skills**, whose bodies cost nothing until invoked.
- **Two advisory rules that already have enforcement scripts become hooks**, which cost
  zero context and are deterministic rather than advisory.
- **A manifest + checker** proves nothing was lost and keeps the file from regrowing.

The guiding test for each line, from Anthropic's own pruning heuristic, is: *"Would removing
this cause Claude to make mistakes?"* — and the follow-up this repo needs: *"…on every task,
or only when touching a particular kind of file?"* The second answer is what routes a rule
out of root.

---

## User Stories

1. As an MJ developer, I want a new session to start with a small instruction payload, so that more of the context window is available for the code I actually came to work on.
2. As an MJ developer, I want the rules I am given to be the rules relevant to the files I am touching, so that I am not paying attention-budget on Angular conventions during a SQL migration.
3. As an MJ developer, I want Claude to follow the rules more reliably, so that I stop re-correcting the same violations — accepting that a shorter, targeted rule set is the documented path to higher adherence.
4. As an MJ developer, I want every rule that exists today to still exist after this refactor, so that the reduction is a relocation and never a deletion-by-convenience.
5. As an MJ developer, I want to see exactly where each rule went, so that I can audit the move rather than trust it.
6. As an MJ developer, I want any rule that was genuinely deleted to be listed with a stated reason, so that "we lost nothing" is a verifiable claim and not a slogan.
7. As an MJ developer editing a `.scss` file, I want the design-token rules to load automatically, so that I get them without their costing anything on the days I write no CSS.
8. As an MJ developer editing any `.ts` file, I want the RunView / BaseEntity / entity-naming rules to load automatically, so that data-access mistakes are prevented where they are actually made.
9. As an MJ developer working in `packages/Angular/`, I want one authoritative Angular rule set, so that I never have to reconcile a root copy against a nested copy that has drifted.
10. As an MJ developer working in `migrations/`, I want the migration rules to come from `migrations/CLAUDE.md` alone, so that there is one place to update when the convention changes.
11. As an MJ developer, I want the safety rules — no unapproved commits, no destructive git operations, correct branch tracking — to remain in root, so that they survive `/compact` in a long session and cannot be silently dropped.
12. As an MJ developer in a long session that has compacted, I want to understand which rules are no longer in context, so that the compaction trade-off is a known property rather than a surprise.
13. As an MJ developer, I want root `CLAUDE.md` to contain a routing table of where guidance lives, so that Claude can find a rule it does not currently hold.
14. As an MJ developer, I want all 13 nested `CLAUDE.md` files listed in that table — including the three currently orphaned — so that the browser-bundle safety rules in `Bootstrap/` and `BootstrapLite/` are discoverable.
15. As an MJ developer, I want the guide index to live in `guides/README.md` only, so that one 7,267-token duplicate stops being loaded into every session.
16. As an MJ developer, I want the 15 guides missing from the root index backfilled into `guides/README.md` before the root copy is removed, so that consolidation strictly increases coverage.
17. As an MJ developer, I want the detailed per-guide summaries preserved somewhere — moved into each guide's own header or into `guides/README.md` — so that condensing the index does not destroy the reasoning about when to read what.
18. As an MJ developer, I want dead references fixed as part of this work, so that the refactor leaves the file more accurate and not merely shorter.
19. As an MJ developer, I want auto-generated cruft (`## Active Technologies`, `## Recent Changes`, describing a stale `601-mcp-oauth` feature) removed, so that tooling residue is not preserved out of caution.
20. As an MJ developer, I want multi-step procedures — Playwright browser testing, build-failure debugging — to become skills, so that their bodies cost nothing until the procedure is actually needed.
21. As an MJ developer, I do not want the Playwright procedure duplicated between root `CLAUDE.md` and the existing `.claude/skills/playwright-cli` skill, so that the skill is the one source of truth.
22. As an MJ developer, I want the UI-consistency and native-ESM rules enforced by hooks rather than prose, so that rules backed by an existing script become deterministic instead of advisory, at zero context cost.
23. As an MJ tech lead, I want a CI check asserting root `CLAUDE.md` stays under budget, so that the file cannot silently regrow to 2,256 lines again.
24. As an MJ tech lead, I want a CI check asserting every referenced path exists, so that the rot found today is caught automatically next time.
25. As an MJ tech lead, I want changes to instruction files to be reviewable in a normal PR, so that a reviewer can actually read the diff.
26. As a new MJ contributor, I want root `CLAUDE.md` to be readable end to end in a few minutes, so that I can learn the project's non-negotiables without reading 2,256 lines.
27. As a maintainer adding a new convention, I want a documented decision rule for where it belongs, so that root does not become the default dumping ground again.
28. As a maintainer, I want to leave notes for humans in `CLAUDE.md` without spending tokens, using HTML comments (which are stripped before injection), so that maintenance context is free.
29. As an MJ developer, I want the refactor delivered so that behavior changes are separable from pure relocations, so that a regression can be bisected to the change that caused it.
30. As an MJ developer, I want to verify empirically that a moved rule actually reaches Claude when I touch a matching file, so that the lazy-loading mechanism is confirmed in this repo and not merely assumed from docs.
31. As an MJ developer, I want `/doctor`'s trim check run against the result, so that the refactor is measured against Anthropic's own tooling.

---

## Implementation Decisions

### Allocation policy

Each unit of guidance is routed by two questions, in order:

1. **Is it unrecoverable if violated?** → root `CLAUDE.md`. It must survive `/compact`.
2. **What is its scope?** → *every task* stays in root; *a directory* goes to nested
   `CLAUDE.md`; *a file type* goes to a path-scoped rule; *a procedure* becomes a skill;
   *already has an enforcement script* becomes a hook.

### Stays in root (must survive compaction, or universally true)

- Tone rule (`# GENERAL RULE`).
- Critical Rules **1** (no commits without approval) and **3** (no destructive git operations) — irreversible-loss class.
- Git branch tracking rules — a wrong upstream pushes straight to `next`, bypassing review.
- The `MJ: ` entity-name prefix rule and "no `any` types" — invoked in nearly every task and cheap to state.
- The integration-testing "not done until the deterministic tier passes" gate — a definition-of-done that applies to all work.
- Build commands, monorepo layout, npm-workspace rule (`npm install` at root only).
- **A routing table** listing all 13 nested `CLAUDE.md` files, the `.claude/rules/` set, and a one-line pointer to `guides/README.md`.

### Moves to `.claude/rules/` (new directory; path-scoped)

Rules whose scope is a **file type** crossing many directories. Frontmatter carries `paths:`.

| New rule file | `paths:` glob | Absorbs from root |
|---|---|---|
| `data-access.md` | `**/*.ts` | RunView `ResultType`/`Fields`, `RunViews` batching, Save/Delete return-value checking, `EntityByName`, per-provider `Metadata` scoping, BaseEntity spread-operator limitation, keyset pagination, `contextUser` on server |
| `typescript-style.md` | `**/*.ts` | No `any`/`unknown`, `.Get()`/`.Set()` ban, derive field types from the entity, PascalCase public / camelCase private members, functional decomposition, `BaseSingleton`, no re-exports, no dynamic `import()` |
| `design-tokens.md` | `**/*.scss`, `**/*.css` | The entire "NO HARDCODED COLORS" section incl. the hex→token mapping table |

> Note: these globs are broad. That is deliberate — `**/*.ts` is nearly always matched in
> practice, so `data-access.md` and `typescript-style.md` buy less than the design-token
> rule does. They are moved anyway for **maintainability and adherence** (smaller root,
> topically-grouped rules), not primarily for tokens. Sizing them against measured savings
> is an explicit task; if the measurement shows the split is not worth the compaction
> trade-off, folding them back into root is an acceptable outcome and must be recorded.

### Merges into existing nested `CLAUDE.md` (dedupe to one source of truth)

The nested file is authoritative; the root section is deleted after confirming every rule
it held is present in the destination.

- `packages/Angular/CLAUDE.md` ← root's Angular Best Practices, Icon Libraries, Dialog Button Placement, MJ UI Components, `NotifyLoadComplete`, custom entity forms, loading indicators.
- `packages/Actions/CLAUDE.md` ← root's Actions Design Philosophy.
- `migrations/CLAUDE.md` ← root's Database Migrations + "CodeGen Handles These Automatically".
- `metadata/CLAUDE.md` ← root's Metadata Files and mj-sync.

### New nested `CLAUDE.md` files

- `packages/MJCoreEntities/CLAUDE.md` — ORM-is-ground-truth, entity naming, CodeGen system behavior.
- `packages/MJAPI/CLAUDE.md` — public URL config, startup mode, connection pooling.
- `packages/CodeGenLib/CLAUDE.md` — CodeGen DB connections, env-var precedence, class-registration manifests.

### Becomes a skill (body loads only on invocation)

- **Playwright browser testing** — already exists as `.claude/skills/playwright-cli`; the root section is a duplicate and is deleted, with any detail unique to root folded into the skill first.
- **Debugging build failures** — the five-step turbo/dependency diagnostic procedure.

### Becomes a hook (zero context, deterministic)

Both already have scripts, so the prose is advisory duplication of executable enforcement:

- `.github/scripts/check-css-hex-tokens.sh` → `PostToolUse` hook on `Edit`/`Write` of `*.scss`/`*.css`.
- `.github/scripts/check-esm-imports.mjs` → hook on the relevant build/test event.

Hook configuration lives in `.claude/settings.json`, which does not yet exist and will be
created. Hooks are proposed for review before being wired up, since they execute on every
matching tool call and a misconfigured hook is disruptive.

### Deleted, with reasons recorded in the manifest

- `## Active Technologies` and `## Recent Changes` — speckit-generated residue describing a stale `601-mcp-oauth` feature, unrelated to this repo's current work.
- `## Claude Code Fast Mode` — describes Opus 4.6 and a settings workaround; superseded.
- Dead references to `plans/base-engine-permission-constrained.md` and `plans/query-entity-materialization.md` — targets do not exist.

### Guide index consolidation — ordering is load-bearing

Strictly in this order, so coverage never dips:

1. Backfill the 15 unreferenced guides into `guides/README.md`.
2. Move the long per-guide summaries currently in root into each guide's own header (or into `guides/README.md`), so the *reasoning* about when to read each guide is preserved.
3. Only then replace root's 7,267-token section with a single pointer to `guides/README.md`.

### Repository hygiene fixed in passing

- Add `stats/`, `packages/Angular/Bootstrap/`, `packages/Angular/BootstrapLite/` to the routing table.
- Correct the `CLASS_MANIFEST_GUIDE` link whose text and target disagree.

### Commit structure

Per the project's own standard that refactor and behavior change stay separable:

1. Backfill `guides/README.md` (pure addition).
2. Create `.claude/rules/`, new nested `CLAUDE.md` files, and skills (pure addition — nothing removed yet, so guidance is briefly duplicated but never absent).
3. Add manifest + checker script.
4. Remove the now-duplicated root sections (the only subtractive commit; reviewable against the manifest).
5. Hooks + `.claude/settings.json` — separate, as it changes runtime behavior rather than relocating text.

---

## Testing Decisions

### What makes a good test here

The externally-observable behavior is **what ends up in Claude's context, and when** — not
which file a paragraph lives in. Tests assert the observable contract: *this rule is
reachable, this file is under budget, this reference resolves, this section is accounted
for*. Tests must not assert on wording or line numbers, which are implementation detail
and would make every future edit a test failure.

### The seam

**One seam, one script.** A single manifest, `.claude/claude-md-manifest.json`, records
every H2/H3 section of the pre-refactor root file and its destination
(`root` | `nested:<path>` | `rule:<path>` | `skill:<name>` | `hook:<name>` | `deleted:<reason>`).
A single checker, `scripts/check-claude-md.mjs`, is the only thing that reads it.

This is the highest available seam and the fewest — the alternative (per-mechanism
validators) would multiply seams for no gain. Everything below is a mode of that one script.

### Checks

1. **Completeness (the "lose nothing" guarantee).** Every section in the manifest has a destination; no section is unaccounted for. Every non-`deleted` destination file exists. Every `deleted` entry carries a non-empty reason. This is the test that makes the spec's central claim falsifiable.
2. **Budget.** Root `CLAUDE.md` is under a committed line/token ceiling. Fails CI on regrowth. Ceiling is set from the achieved result, not aspirationally.
3. **Reference validity.** Every markdown link and backticked path in every instruction file resolves on disk. This is the check that would have caught today's two dead `plans/` references.
4. **Routing-table coverage.** Every `CLAUDE.md` on disk (excluding `node_modules`/`dist`) appears in root's routing table. Catches the orphan class of bug directly.
5. **Frontmatter validity.** Every `.claude/rules/*.md` parses and its `paths:` globs match at least one real file — a rule scoped to a typo'd glob is silently dead, which is the most dangerous failure mode of this whole refactor.

### Prior art

The repo already runs exactly this shape of gate — `.github/scripts/check-css-hex-tokens.sh`,
`check-mj-btn-override.sh`, `check-esm-imports.mjs`, each with an `npm run check:*` local
mirror of a CI gate. The new checker follows that established pattern: `npm run check:claude-md`,
same exit-code contract, same local-mirror-of-CI property. `check-esm-imports.mjs` has its
own vitest suite; the new checker gets one too, covering manifest parsing, missing-destination
detection, and the CLI contract.

### Manual verification (not automatable, must still happen)

- **Lazy-load confirmation.** In a fresh session, read a `.scss` file and confirm the design-token rule arrives; confirm it is absent in a session that touches no CSS. This validates the mechanism *in this repo* rather than trusting the documentation.
- **Compaction behavior.** Confirm root survives `/compact` and that a path-scoped rule reloads on the next matching read — so the documented trade-off is observed, not assumed.
- **`/doctor`.** Run the v2.1.206+ trim check against the result and record what it still flags.

---

## Out of Scope

- **Rewriting the content of the guidance itself.** This is a relocation. Rules move verbatim except where two copies must be reconciled into one, and those reconciliations are called out individually in the PR.
- **Auditing whether each rule is still correct.** Several sections describe subsystems that may have moved on. Verifying technical accuracy is separate work; a relocation that also silently edits rules is unreviewable.
- **The 12 nested `CLAUDE.md` files' existing content.** They receive merged content but are not themselves refactored, even though `packages/Angular/CLAUDE.md` (805 lines) and `packages/Actions/CLAUDE.md` (791 lines) both exceed the 200-line target. Follow-up.
- **`~/.claude/rules/design-principles.md`** — user-scope, not repository-scope.
- **The auto-memory system** (`~/.claude/projects/…/memory/`) — separate mechanism.
- **`claudeMdExcludes`** — relevant to monorepos with many nested files; revisit if nested files proliferate after this work.
- **Consolidating the 38 files in `.claude/commands/`** — real bloat (`pg-migrate.md` alone is 54 KB) but a different problem with different mechanics.
- **Enforcing that Claude *follows* the relocated rules.** Improved adherence is the motivation, but it is not directly measurable by a CI gate; the budget and completeness checks are the proxies.

---

## Further Notes

**The finding most worth keeping.** `@import` does not reduce context. The docs are explicit:
imported files "still load and enter the context window at launch." The obvious refactor —
split into files, import them back — moves bytes and saves nothing. This spec exists partly
so that is not rediscovered in six months.

**The constraint that shapes everything.** Lazily-loaded content does not survive `/compact`.
This is why the answer is not "empty the root file." A rule guarding against irreversible
loss must be in root; a rule caught in code review can be lazy. That distinction, not token
count, is what decides each move.

**Honest accounting of savings.** The `**/*.ts` path-scoped rules will match on most tasks
in a TypeScript monorepo, so their startup saving is real but modest. The large, reliable
wins are the guide index (7,267 tokens, replaced by one line) and the nested-file dedupe
(~5,300 tokens). Projected root: ~200–250 lines, but the number to report is the **measured**
one, and if the `**/*.ts` split under-delivers, saying so and folding it back is the correct
outcome.

**Compliance, not just cost.** The strongest argument is not the token count — it is
Anthropic's stated observation that bloated files cause Claude to ignore instructions. Each
of the 2,256 lines was added because someone wanted a rule followed more often. Past roughly
200 lines, adding lines works against that. This refactor is the intended fix, applied late.

**Prevention.** Without checks 2 and 4, this file regrows. It reached 2,256 lines one
reasonable-seeming addition at a time, and every one of those additions was locally
justified. The budget gate is what converts "keep it small" from an intention into a
property of the repository.

<!-- Maintainer note: HTML comments are stripped before injection into context, so notes
     like this cost zero tokens. Use them freely in CLAUDE.md for human-only context. -->
