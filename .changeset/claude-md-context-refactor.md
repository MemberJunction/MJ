---
---

docs(claude-md): cut root CLAUDE.md from 2,256 to 192 lines by moving guidance onto lazy-loading mechanisms

Root `CLAUDE.md` was loaded in full at the start of every Claude Code session — 153 KB, roughly
38,400 tokens — before a single line of code was read. Anthropic's guidance is ~200 lines per
`CLAUDE.md`, because longer files both consume context and *reduce adherence*: past a point, each
added rule makes the existing rules less likely to be followed. The file was 11x that target, and
the decay was already measurable — its guide index referenced 21 of the 36 guides on disk, ~5,300
tokens duplicated four nested `CLAUDE.md` files, three nested files were absent from the index, and
two `plans/` references pointed at deleted files.

Content is now allocated by two questions: *is violating it unrecoverable?* (those stay in root,
because lazily-loaded content is dropped by `/compact` and root is re-injected) and *what is its
scope?* — file type, directory, procedure, or universal.

- **Root (192 lines)** — no-commit / no-destructive-git / branch-tracking, definition of done, always-true facts, and a routing table
- **`.claude/rules/`** (new) — path-scoped rules loading only on a matching file: `data-access` + `typescript-style` (`**/*.ts`), `design-tokens` (`**/*.{scss,css}`), `testing` (`**/*.test.ts`)
- **Nested `CLAUDE.md`** — 3 new (`MJCoreEntities`, `MJAPI`, `CodeGenLib`); Angular / Actions / migrations / metadata absorbed their root duplicates and are now the single source of truth
- **Skills** — `debug-build-failures` (new); the MJ dev-server loop folded into `playwright-cli`
- **`guides/README.md`** — the 7,267-token index, backfilled from 21 to all 40 guides

Note that `@path` imports were deliberately **not** used: the documentation is explicit that
imported files "still load and enter the context window at launch," so the intuitive fix — split
and import back — would have moved bytes and saved nothing.

Nothing was deleted silently. `.claude/claude-md-manifest.json` maps all 46 original sections to
their destinations, and `npm run check:claude-md` (`.github/scripts/check-claude-md.mjs`, 19 tests)
enforces that every section is accounted for, every deletion carries a written reason, root stays
under budget, every link resolves, every nested file is in the routing table, every path glob
matches real files, and every guide is indexed. Three sections were dropped with reasons recorded:
stale Fast Mode instructions, a codebase-derivable monorepo layout, and auto-generated speckit
residue describing an unrelated feature.

Building it surfaced real gaps, now fixed: MetadataSync's validation system and the unit-testing
conventions had no home at all; `migrations/CLAUDE.md` was missing the foreign-key-index rule;
`packages/Actions/CLAUDE.md` pointed at `ActionEntity.server.ts`, renamed some time ago to
`MJActionEntityServer.server.ts` and with a wrong relative path besides.

Smoke testing the result against the skill-creator validator and a rule-by-rule preservation
sweep turned up four defects, all fixed:

- **`packages/Angular/CLAUDE.md` delegated to "root CLAUDE.md rule #4"**, which this change had
  removed — and root's rule 4 is now *"start work on a feature branch"*, so the pointer resolved
  to a real but unrelated rule. The full standalone-vs-NgModule policy is restored inline.
- **Eleven cross-references into root were orphaned** by the move (in `MJServer` and
  `AuthProviders` READMEs, `docker/regression/ARCHITECTURE.md`, and three guides), including a
  dead heading anchor. All repointed at the new homes.
- **A contradiction was introduced**: root summarized function decomposition as "a smell to
  investigate, not merely because a function got long" while `typescript-style.md` carries the
  project's verbatim "MAXIMUM ~30-40 lines … refactor immediately". Contradictory instructions
  get resolved arbitrarily, so the paraphrase is gone — the rule owns it, and root links rather
  than restates.
- **`metadata/components/claude.md` was lowercase**, so those 359 lines never loaded as a memory
  file on any case-sensitive filesystem (Linux, CI, containers) — macOS hid it. Renamed to
  `CLAUDE.md` and added to the routing table.

The checker gained anchor validation (a `#fragment` must match a real heading — this is how a
refactor silently orphans cross-references) and its corpus widened from 24 to 65 files to include
guides, where most references into root live. That surfaced 9 pre-existing broken references
unrelated to this work; they are recorded in the manifest as a ratchet rather than an amnesty, so
they stay visible while any new break fails the gate.

Honest accounting on the saving: 92% applies to sessions touching no TypeScript. Because
`data-access.md` and `typescript-style.md` are scoped to `**/*.ts`, a typical session pays
~16,200 tokens against the old 38,365 — a **58%** reduction, with 51% as the worst case where
every rule fires. Narrowing those two globs is the obvious next lever.

No published package's code or behavior changes, so this carries no version bump.
