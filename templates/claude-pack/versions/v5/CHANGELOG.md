# MJ Claude Pack — v5 changelog

Tracks content changes to the v5 pack. Bump `versions/v5/PACK_VERSION`
in lockstep with each entry here: minor for material content changes,
patch for typos and clarifications.

The pack ships independently of MJ npm package versions — a bump to MJ
5.34.x does not automatically bump the pack. See
[`templates/claude-pack/README.md`](../../README.md) for versioning rules.

---

## 5.1.0 — 2026-05-18 — Initial release

First public release of the MJ Claude Pack. Bundles curated Claude Code
context for MJ integrators (people building applications on top of
MemberJunction).

### Pack contents

- **`CLAUDE.md` managed block** — root file with `MJ-MANAGED:CLAUDE-PACK
  START/END` markers preserving any user content above and below.
- **`.claude/mj/core.md`** — 17 cross-version markdown files concatenated
  in lexicographic order, covering: mental model, entity essentials,
  RunView patterns, type safety, actions philosophy, CodeGen contract,
  migration basics, singletons, imports and deps, Angular essentials,
  design tokens, class naming, functional decomposition, testing,
  performance and caching, metadata files, anti-pattern cheat sheet,
  and getting help.
- **`.claude/mj/v5.md`** — v5-specific overlay covering the `MJ: ` entity
  name prefix, breaking changes from v4, known v5 footguns (UUID
  comparison across platforms, browser cache after backend swap,
  `BaseEntity.Save()` return semantics), and the AI subsystem snapshot.
- **`.claude/commands/`** — 19 slash commands ready for use in any MJ
  project: `commit`, `update-pr`, `clean-branch`, `save-plan-new-pr`,
  `add-ai-model`, `debug-agent-run`, `generate-integration-actions`,
  `new-branch`, `create-pr`, `refresh-pack`, and all 9 speckit.* commands
  (`specify`, `plan`, `clarify`, `tasks`, `taskstoissues`, `analyze`,
  `checklist`, `implement`, `constitution`).
- **`.claude/skills/playwright-cli/SKILL.md`** — browser automation skill
  for testing MJExplorer UIs in a user's project.
- **`.claude/mj/VERSION`** — `5.1.0` (matches `versions/v5/PACK_VERSION`).
- **`.claude/mj/MANIFEST.json`** — sha256 hashes + byte counts of every
  managed file; consumed by `mj doctor` and the install/update merger.
- **`.claude/mj/check-pack-version.js`** — SessionStart hook helper that
  nags (at most once per 7 days) when a newer pack version is available
  upstream. Honors `MJ_PACK_CHECK_DISABLE` and `MJ_PACK_CHECK_URL`.
- **`.claude/settings.json`** — baseline settings with the SessionStart
  hook wired up; deep-merges into the user's existing settings.json.

### Distribution

- Ships via `mj install` at scaffold time —
  `packages/MJInstaller/src/distribution/DistributionAssembler.ts` includes
  `templates/claude-pack/dist/v{MAJOR}/` in the sparse-checkout layout (M11;
  replaces the legacy bootstrap-ZIP injection that lived in
  `CreateMJDistribution.js` pre-PR-#2725). Every new install receives the
  pack automatically; opt out with `mj install --no-claude-pack`.
- Also bundled by `mj bundle` for offline / air-gapped installs (`mj bundle
  --no-claude-pack` to exclude).
- Can be installed or refreshed on an existing project via
  `mj install:claude` / `mj update:claude` (added with this pack release).

### Tooling shipped alongside

- `mj doctor` includes a `claude-pack` check group (6 checks: managed
  block, VERSION, MANIFEST, file integrity, hook helper, hook wired).
- `mj codegen integration-actions` generates mj-sync action JSON for a
  user-authored `BaseIntegrationConnector` subclass. Used by
  `/generate-integration-actions` slash command.

### Notes

- This is the **initial release** — no migration from prior pack
  versions is needed. Future entries here will document content diffs
  between versions.
- Commands and skills are **seed-once** on install — your edits survive
  `mj update:claude`. Use `--force` to overwrite (saves `.bak` files).
- The managed `.claude/mj/` bundle is **fully refreshed** on every
  update; treat it as read-only.
