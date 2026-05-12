# Plan: MJ Claude Install Pack

**Branch:** `claude/add-claude-md-installer-WJ2OZ`
**Status:** Proposal — not yet implemented
**Author:** Claude (with Jonathan)
**Last updated:** 2026-04-26

---

## 1. Goals & Non-Goals

### 1.1 Goals

1. **Every new MemberJunction install gets a working Claude Code experience out of the box** — `CLAUDE.md`, `.claude/settings.json`, a curated set of slash commands, and a curated set of skills are present after `mj install` finishes.
2. **The shipped CLAUDE.md doesn't go stale.** The user can run `mj update:claude` at any time to pull the latest pack from this repo over the wire. The pack also self-identifies its version.
3. **A clean separation between cross-version content and version-specific content.** Cross-version content lives in one place; per-major-version overlays live in another. We compile the right bundle for the MJ release the user is installing.
4. **User edits are preserved.** The MJ-managed portion is regenerable; the user's own additions to `CLAUDE.md` are never touched.
5. **A curated subset of slash commands and skills** ships to user repos — only the ones that make sense for someone building an MJ application, not for someone contributing to MJ itself.
6. **It's a normal MJCLI command**, not a one-off script, so it composes with everything else (`mj install`, `mj doctor`, etc.).

### 1.2 Non-Goals

- **Not** shipping the full root `CLAUDE.md` (1,805 lines of monorepo internals) verbatim.
- **Not** shipping internal commands like `/notes`, `/pg-migrate`, `/docker-workbench`, `/analyze-readme-health`, `/update-*-readme`.
- **Not** auto-pulling updates from the network on every Claude Code session start (privacy + reliability concerns); we'll only *notify* and let the user run `mj update:claude` explicitly.
- **Not** building a docs site for this. The source of truth is markdown files in this repo.
- **Not** modifying contributor-facing CLAUDE.md files in `/packages/*/CLAUDE.md` — they keep serving their internal-developer audience.

### 1.3 Success Criteria

- After `mj install` on a fresh directory, the user opens Claude Code and gets relevant MJ context immediately, with `RunView`, `BaseEntity`, custom-form, and design-token rules already loaded.
- A user running `mj update:claude` on a 3-month-old install gets an updated pack with a preview diff and explicit confirmation.
- A user editing the non-managed portion of `CLAUDE.md` does not lose their edits across updates.
- The pack is < 80 KB unpacked (small enough to make zero perceptible difference to the bootstrap ZIP size of ~75 MB).
- All of this is testable in CI without a real GitHub release.

---

## 2. Current State Assessment

### 2.1 What exists today

| Asset | Location | Audience | Ship to users? |
|---|---|---|---|
| Root `CLAUDE.md` (1,805 lines) | `/CLAUDE.md` | MJ contributors | No — strip and rewrite |
| `claude-full-auto.md` (136 lines) | `/claude-full-auto.md` | Sandboxed dev mode | No |
| `migrations/CLAUDE.md` (277 lines) | `/migrations/CLAUDE.md` | DB schema authors | No |
| `metadata/CLAUDE.md` (202 lines) | `/metadata/CLAUDE.md` | mj-sync internals | No |
| `docker/CLAUDE.md` (242 lines) | `/docker/CLAUDE.md` | Docker workbench | No |
| `packages/Actions/CLAUDE.md` (791 lines) | per-package | Mixed — has user-relevant philosophy | Partial (extract + rewrite) |
| `packages/Angular/CLAUDE.md` (576 lines) | per-package | Mixed — has user-relevant Angular rules | Partial (extract + rewrite) |
| `packages/Angular/Explorer/CLAUDE.md` (74 lines) | per-package | Internal | No |
| `packages/Angular/Generic/CLAUDE.md` (41 lines) | per-package | Internal | No |
| `packages/Angular/Explorer/dashboards/CLAUDE.md` (52 lines) | per-package | Internal | No |
| `packages/DBAutoDoc/CLAUDE.md` (42 lines) | per-package | Tooling reference | No |
| `/guides/*.md` (9 guides) | `/guides/` | Mixed | Partial (link to selected ones) |
| Slash commands (23) | `/.claude/commands/*.md` | Mostly internal | Curated subset (see §9) |
| Skills (1) | `/.claude/skills/playwright-cli` | General | Yes |
| `.claude/settings.json` | **does not exist** | — | Create one |
| `.claude/agents/`, `.claude/hooks/` | **do not exist** | — | Create one optional hook |

### 2.2 Installer seams (already verified)

- **`packages/MJInstaller/src/phases/ScaffoldPhase.ts`** — Phase B of `mj install`. Extracts `MemberJunction_Code_Bootstrap.zip` into the user's target directory. **Natural place to assert/refresh the pack post-extract** (e.g., warn if pack is missing or outdated).
- **`/CreateMJDistribution.js`** — Builds the bootstrap ZIP. Uses `archiver`. Root-level files are added around lines 384–402 (`package.json`, `turbo.json`, `README.md`, `Update_MemberJunction_Packages_To_Latest.ps1`, `install.config.json`, `mj.config.cjs`). **This is where we inject `CLAUDE.md` and `.claude/`.**
- **`.github/workflows/publish.yml` line 162** — CI runs `CreateMJDistribution.js` with `MJ_DISTRIBUTION_FILENAME=Distributions/MemberJunction_Code_Bootstrap.zip`. **No CI changes required if we add the pack inside the distribution script.**
- **`packages/MJInstaller/src/adapters/GitHubReleaseProvider.ts` line 45** — `BOOTSTRAP_ZIP_PATH` constant. Confirms the install URL contract.
- **MJCLI commands** (`packages/MJCLI/src/commands/`): existing top-level command groups are `ai`, `app`, `bump`, `clean`, `codegen`, `dbdoc`, `doctor`, `install`, `migrate`, `querygen`, `sql-audit`, `sql-convert`, `sync`, `test`, `translate-sql`. We'll **add `install:claude` as a subcommand under the existing `install` topic**, plus `update:claude` (or fold the latter into `install:claude --update`).

### 2.3 Constraints we have to live with

- The bootstrap ZIP is ~75 MB and contains `apps/MJAPI`, `apps/MJExplorer`, `migrations/`, generated package placeholders, and root config files. Nothing about its current shape forbids adding a `CLAUDE.md` and `.claude/` directory at the root — both will simply land in the user's project folder when extracted.
- The user's repo *might* already have `.claude/` (e.g., if they ran Claude Code's own `/init` first). Our installer must be additive, never destructive, and detect this case.
- We can't assume the user has `gh` CLI. Updates fetched via `mj update:claude` must use plain HTTPS to `raw.githubusercontent.com`.
- We can't ship secrets in the pack (settings.json must contain only allowlist entries, no tokens).

---

## 3. Architecture Overview

### 3.1 Two layers, two locations

```
                                          MJ source repo
                                          ─────────────────────
                                          templates/claude-pack/
                                              core/         ← stable, cross-version
                                              versions/v5/  ← per-major overlays
                                              commands/     ← curated subset
                                              skills/
                                              settings.template.json
                                              build-pack.mjs
                                                  │
                                                  ▼
                                          templates/claude-pack/dist/v5/
                                              CLAUDE.md      ← user-facing root file
                                              .claude/
                                                  settings.json
                                                  commands/ …
                                                  skills/ …
                                                  mj/        ← managed bundle
                                                      core.md
                                                      v5.md
                                                      VERSION
                                                      REMOTE.md
                                                      README.md
```

The `dist/v{MAJOR}/` directory is **committed to the repo** so that:
- `CreateMJDistribution.js` can copy it directly into the bootstrap ZIP at release time.
- `mj update:claude` can `GET https://raw.githubusercontent.com/MemberJunction/MJ/<ref>/templates/claude-pack/dist/v{MAJOR}/...` for over-the-wire refresh.

### 3.2 What the user sees in their repo after `mj install`

```
<user-repo>/
├── CLAUDE.md                         ← root file the user can edit freely
│     <!-- MJ-MANAGED:CLAUDE-PACK START version=5.1.0 -->
│     @.claude/mj/core.md
│     @.claude/mj/v5.md
│     <!-- MJ-MANAGED:CLAUDE-PACK END -->
│
│     ## Project notes               ← anything below the END marker is user content
│     …
│
└── .claude/
    ├── settings.json                 ← MJ-tuned allowlist, hooks, env (managed but mergeable)
    ├── commands/                     ← curated subset, copied verbatim
    │   ├── commit.md
    │   ├── create-pr.md
    │   ├── new-branch.md
    │   ├── speckit.*.md
    │   └── …
    ├── skills/                       ← curated subset
    │   ├── playwright-cli/
    │   └── mj-add-entity/            ← new (optional)
    └── mj/                           ← FULLY MANAGED — overwritten on update
        ├── README.md                 "Don't edit this folder. Run `mj update:claude`."
        ├── core.md                   stable cross-version content
        ├── v5.md                     v5-specific entity names, breaking changes
        ├── VERSION                   pack semver (e.g., 5.1.0)
        └── REMOTE.md                 raw GitHub URL for self-update + pack metadata
```

### 3.3 Key design decisions

- **`@file` imports in CLAUDE.md** — Claude Code's native import syntax means the managed pack content is loaded at session start without us inlining 1,000+ lines into the user's root file. The root file stays small and readable.
- **Two markers, three regions** — the root `CLAUDE.md` has exactly one managed block. Above it: nothing (or a heading). Below it: free user content. The build/update logic only ever rewrites the bytes between `<!-- MJ-MANAGED:CLAUDE-PACK START … -->` and `<!-- MJ-MANAGED:CLAUDE-PACK END -->`.
- **`.claude/mj/` is fully managed** — entire folder is regenerated on update. We tell users this loudly in the README.md inside that folder.
- **`.claude/commands/` and `.claude/skills/` are *not* fully managed** — they're seeded once on install and respected thereafter. If we want to push new commands later, we use a **manifest-based merge** (see §6.4).
- **`.claude/settings.json` uses a deep-merge** — we ship a baseline; user customizations on top of it are preserved (see §10.2).

---

## 4. Pack Content — What Goes in `core/` vs `versions/`

### 4.1 `core/` — the stable, cross-version layer

These topics change rarely and apply to every supported MJ major version. Each file is a focused, ~150–300 line markdown doc, written for an MJ **integrator** (not contributor).

| File | Content | Source(s) to distill |
|---|---|---|
| `core/00-pack-header.md` | One-paragraph welcome + how to update + where to find help. Self-contained intro. | New — written from scratch |
| `core/01-mj-mental-model.md` | What MJ is, the metadata-driven core, entity model, providers, MJAPI/MJExplorer relationship. ~200 lines. | New — distilled from README + root CLAUDE.md "Monorepo Structure" + Actions philosophy |
| `core/02-entity-essentials.md` | `Metadata.GetEntityObject<T>()`, entity naming convention + "MJ:" prefix list, BaseEntity gotchas (`.Get()`/`.Set()` rule, spread-operator rule, `Save()` returns boolean), entity version control, contextUser on server. | Extract from root `CLAUDE.md` §"MemberJunction Entity and Data Access Patterns" |
| `core/03-runview-patterns.md` | `RunView<T>` vs `RunViews` (batching), `entity_object` vs `simple` ResultType, `Fields` parameter rules, RunView error handling (no exceptions). | Root CLAUDE.md §"Efficient Data Loading with RunViews" |
| `core/04-type-safety.md` | No `any`, no `unknown` shortcuts, generics on every data-loading method, why MJ insists on this. | Root CLAUDE.md §"NO `any` TYPES" + §"Type Safety Guidelines" |
| `core/05-actions-philosophy.md` | When to use Actions vs direct code, the "boundary not internal call" rule, anti-pattern + correct pattern. | `packages/Actions/CLAUDE.md` §"Actions Design Philosophy" — distilled to ~100 lines |
| `core/06-codegen-contract.md` | What CodeGen owns (entity classes, stored procs, Angular forms), what NOT to edit by hand, when to wait for CodeGen before writing dependent code. | Root CLAUDE.md §"MemberJunction CodeGen System" |
| `core/07-migrations-basics.md` | Migration filename format, `${flyway:defaultSchema}`, hardcoded UUIDs, columns CodeGen owns (`__mj_*`, FK indexes). User-friendly subset only — no v5/v6 baseline talk. | `migrations/CLAUDE.md` — pruned heavily |
| `core/08-singletons.md` | Use `BaseSingleton<T>`, never manual static `_instance`, why. | Root CLAUDE.md §7 |
| `core/09-imports-and-deps.md` | Static imports only (with the 5 narrow exceptions), no re-exports between packages, dependency declaration discipline. | Root CLAUDE.md §5 + §8 |
| `core/10-angular-essentials.md` | NgModule vs standalone, modern template syntax (`@if`/`@for`), `inject()` over constructor DI, custom-form pattern (extend generated form), `<mj-record-form-container>` toolbar pattern, MJ UI components package, loading indicator (`<mj-loading>`), `BaseResourceComponent.NotifyLoadComplete()`. | Root CLAUDE.md §"Angular Development Best Practices" + `packages/Angular/CLAUDE.md` selected sections |
| `core/11-design-tokens.md` | The "no hardcoded colors" rule, semantic token list, hex→token mapping table, `color-mix()` for translucency, when hardcoded is OK. | Root CLAUDE.md §"Design Token System" — copy nearly verbatim, it's already user-friendly |
| `core/12-class-naming.md` | PascalCase public, camelCase private, why MJ deviates from standard TS. | Root CLAUDE.md §"Class Member Naming Convention" |
| `core/13-functional-decomposition.md` | 30-40 line function ceiling, when to decompose, OO best practices. | Root CLAUDE.md §"FUNCTIONAL DECOMPOSITION" |
| `core/14-testing.md` | Vitest is the standard, file layout, `@memberjunction/test-utils`, no DB connections in unit tests. | Root CLAUDE.md §"Unit Testing" |
| `core/15-performance-and-caching.md` | Server-side caching mental model, `BypassCache`, when auto-cache kicks in, why filtered caches are invalidated not updated. Lighter than the contributor version. | Root CLAUDE.md §"Server-Side Caching" + link to `guides/CACHING_AND_PUBSUB_GUIDE.md` |
| `core/16-metadata-files.md` | Using `mj sync` for declarative metadata, `@file:`/`@lookup:`/`@template:` references, why we prefer mj-sync over SQL inserts for seed data. | Root CLAUDE.md §"Metadata Files and mj-sync" |
| `core/17-dont-do-this.md` | A consolidated "anti-patterns" cheat sheet — `.Get()`/`.Set()` on typed entities, spread on BaseEntity, dynamic imports as shortcut, manual entity instantiation, hardcoded colors. Short. | Synthesis |
| `core/18-getting-help.md` | Links to `/guides/`, raw URLs to selected guides on GitHub, where to file issues, link to MJ docs site. | New |

**Total estimated size:** ~3,000–4,000 lines of markdown distributed across 19 files. Each file is small, focused, and quotable.

### 4.2 `versions/v5/` — version-specific overlay

Things that change per major MJ version and would mislead a user if stale:

| File | Content |
|---|---|
| `versions/v5/overlay.md` | Single concatenated overlay file consumed via `@.claude/mj/v5.md`. Sections: |
| | • **Schema highlights** — current entity prefix list ("MJ:" entities introduced/renamed), key new entities in v5 (e.g., AI Agent Runs, Conversation Artifacts) |
| | • **Breaking changes from v4** — what code patterns no longer work, migration tips |
| | • **Current default migrations folder** (`migrations/v5/`) |
| | • **Currently supported Node version range** (informational) |
| | • **Known v5 footguns** — recently-discovered gotchas worth advertising |
| | • **AI subsystem snapshot** — current AI Agent / AI Prompt entity model, vendor types |
| `versions/v5/CHANGELOG.md` | Pack-level changelog: when each v5 pack revision shipped, what changed in the markdown content. Lets users see "ah, the pack went from 5.1.0 to 5.2.0 because we added §X". |

When v6 ships, we add `versions/v6/` and update `build-pack.mjs` to know about it. v5 packs continue to be regenerated until v5 is EOL.

### 4.3 What we explicitly **don't** put in the pack

To keep the pack tight and honest about its audience:

- **Anything about commits** — the user has their own commit conventions. We don't impose `/commit` rules in the pack itself (though we ship the `/commit` command — see §9).
- **Anything about MJ internal release process, CodeGen package internals, manifest system internals**, or the `claude-full-auto.md` workflow.
- **Anything about Docker workbench, MJAPI public URL, ngrok setup** — that's contributor convenience, not user-relevant.
- **The Speckit workflow itself** — we ship the commands, but we don't lecture the user about Speckit philosophy in `core/`. If they want it, they discover it through `/speckit.specify`.
- **Internal-only guides** like `complete/PERFORMANCE_OPTIMIZATION_PLAN.md`.

### 4.4 Drafting workflow

For each `core/*.md`:
1. Find the source section in the existing CLAUDE.md(s).
2. Copy into a new file.
3. Strip: monorepo paths (`packages/MJCore/...`), contributor warnings, "we" phrasing that implies you work on MJ.
4. Reframe: "you're building an MJ application" not "you're contributing to MJ".
5. Keep all code examples — they're the highest-value part.
6. Add a one-line header: `# {topic}` and a one-sentence "why this matters" lede.
7. Add a footer link to the most relevant `/guides/` doc on GitHub if one exists.

### 4.5 Sizing guardrails

- Total managed pack content target: **< 50 KB on disk** (markdown is dense; this is ~6,000 lines).
- Per-file ceiling: **400 lines**. If a file exceeds that, split it.
- The point is **focused, fast-loading context for Claude**, not an encyclopedia. Anything that doesn't directly help Claude write better MJ code on day 1 doesn't belong.

---

## 5. Pack Build Pipeline

### 5.1 `build-pack.mjs` — what it does

A single Node ESM script at `templates/claude-pack/build-pack.mjs`. Run it via `npm run claude-pack:build` (added to root `package.json`).

> **Implementation note:** the script is `.mjs` (plain Node, no transpile step), matching the repo's existing convention for root-level utility scripts (`ci/merge_main.mjs`, `scripts/fix-missing-dependencies.mjs`, etc.). Root has no `tsx`/`ts-node` dependency, so adding TypeScript here would mean pulling in a new tool just for one file. The script uses only Node's stdlib (`node:fs`, `node:path`, `node:crypto`, `node:url`).

**Inputs:**
- `templates/claude-pack/core/*.md` (in numeric order)
- `templates/claude-pack/versions/v{N}/overlay.md` for each major version we still support
- `templates/claude-pack/commands/*.md` (curated subset)
- `templates/claude-pack/skills/**` (curated subset)
- `templates/claude-pack/settings.template.json`
- `templates/claude-pack/manifest.template.json` (lists the optional commands/skills with checksums)
- The MJ root `package.json` for the current MJ version
- `templates/claude-pack/CLAUDE.md.template` — the root CLAUDE.md shell

**Outputs (per major version):** `templates/claude-pack/dist/v{MAJOR}/`
- `CLAUDE.md` — root file with the managed block filled in, version stamped
- `.claude/settings.json` — settings stamped with pack version, no env-specific values
- `.claude/commands/*.md` — copied verbatim
- `.claude/skills/**` — copied verbatim
- `.claude/mj/core.md` — concatenation of `core/00…18*.md` with separators
- `.claude/mj/v{MAJOR}.md` — concatenation of `versions/v{MAJOR}/overlay.md`
- `.claude/mj/VERSION` — pack semver, plain text
- `.claude/mj/REMOTE.md` — JSON-frontmatter file with pack metadata (raw URL prefix, supported MJ versions, last-updated date, sha256 of each managed file)
- `.claude/mj/README.md` — "Don't edit; managed by mj update:claude" notice
- `.claude/mj/MANIFEST.json` — full file listing with sha256 per file (used by update command for integrity + change detection)

### 5.2 Algorithm

```
build-pack.mjs
├── 1. Parse args: --major <N>  (default = build every versions/v{N}/ folder found)
├── 2. Validate required source files exist; fail fast with clear error
├── 3. Read core/*.md in lexicographic order, normalize line endings, strip trailing whitespace
├── 4. Concatenate with `\n\n---\n\n` separators → core.md
├── 5. Read versions/v{N}/overlay.md → v{N}.md
├── 6. Compute sha256 of every managed file
├── 7. Render CLAUDE.md.template, replacing:
│      {{PACK_VERSION}}, {{MJ_MAJOR}}, {{REMOTE_URL_PREFIX}}
│      (no {{BUILD_DATE}} — see "Determinism" note below)
├── 8. Render settings.template.json the same way
├── 9. Generate REMOTE.md and MANIFEST.json with all checksums
├── 10. Copy commands/, skills/ directories verbatim into dist/v{N}/.claude/
├── 11. Write everything atomically: write to dist/v{N}.tmp/, then rename
└── 12. Print a summary table: file count, total bytes, pack version, MJ major
```

### 5.3 Pack versioning rules

- **Pack semver = `<MJ_MAJOR>.<PACK_MINOR>.<PACK_PATCH>`** — e.g., `5.1.0`, `5.1.1`, `5.2.0`. The major component is *always* tied to the MJ major version. We bump the minor when content materially changes and the patch for typos/clarifications.
- **One pack per supported MJ major.** When v6 launches, we ship `dist/v5/` and `dist/v6/` side by side until v5 EOLs.
- **Pack version is stored in `templates/claude-pack/versions/v{N}/PACK_VERSION`** (a plain text file). `build-pack.mjs` reads it and stamps everywhere it's needed.
- **Build output is deterministic.** Running `npm run claude-pack:build` twice on the same source produces byte-identical output — no `BUILD_DATE` or other time-of-build markers leak into generated files. This is what makes the `git diff --exit-code` CI gate work; without it the gate would flap on every wall-clock day change. The pack version itself is the content fingerprint.
- The version is **separate from MJ's package versions** — bumping MJ from 5.1.3 to 5.1.4 does *not* automatically bump the pack. Pack bumps are explicit.

### 5.4 CI integration

Add a step to `.github/workflows/publish.yml` (and any PR-validation workflow) that runs:
```bash
npm run claude-pack:build
git diff --exit-code templates/claude-pack/dist/
```
This guarantees the committed `dist/` is always up-to-date with the source. PRs that touch `core/`, `versions/`, `commands/`, or `skills/` without rebuilding `dist/` will fail CI.

We also add a check that `templates/claude-pack/dist/v{MAJOR}/` exists for the MJ major version being released — otherwise the bootstrap ZIP build will fail.

### 5.5 Local developer workflow

```bash
# Edit pack source
vi templates/claude-pack/core/03-runview-patterns.md

# Rebuild
npm run claude-pack:build

# Optionally diff
git diff templates/claude-pack/dist/

# Commit source + dist together
git add templates/claude-pack/
git commit -m "claude-pack: clarify RunView Fields + entity_object behavior"
```

We do *not* gitignore `dist/` — it's intentionally committed. The CI gate ensures it's never out-of-sync.

---

## 6. Distribution Mechanics

### 6.1 Path A — bootstrap ZIP injection (primary path for new installs)

Modify `CreateMJDistribution.js` to copy `templates/claude-pack/dist/v{MAJOR}/` into the archive root. Insertion point: just before `await archive.finalize()` at line 417, around the cluster of `archive.append(...)` calls at 384–402.

**Pseudocode (as implemented):**
```js
// Discover available dist/v{N}/ folders and pick the highest available major.
// This sidesteps the "where does the MJ major version live?" question — root
// package.json's `version` is the workspace semver (1.x), not user-facing MJ
// (5.x). Discovery from the pack source itself avoids the coupling.
const packDistRoot = path.join(__dirname, 'templates', 'claude-pack', 'dist');
if (!fs.existsSync(packDistRoot)) {
  throw new Error(`Claude pack dist not found at ${packDistRoot}. Run 'npm run claude-pack:build' first.`);
}
const majorDirs = fs.readdirSync(packDistRoot, { withFileTypes: true })
  .filter(e => e.isDirectory() && /^v\d+$/.test(e.name))
  .map(e => e.name)
  .sort((a, b) => parseInt(b.slice(1), 10) - parseInt(a.slice(1), 10));
if (majorDirs.length === 0) {
  throw new Error(`Claude pack dist at ${packDistRoot} contains no v{N}/ subdirectories.`);
}
const selectedMajor = majorDirs[0];
const packDir = path.join(packDistRoot, selectedMajor);
console.log(`Adding Claude Code pack (${selectedMajor}) to zip file...`);
// `dot: true` is required so the `.claude/` directory (dotfile-prefixed) is included.
// `prefix: ''` lands contents at archive root alongside other root files.
archive.glob('**/*', { cwd: packDir, dot: true }, { prefix: '' });
```

`archive.glob('**/*', ...)` matches the existing glob-based pattern used elsewhere in `CreateMJDistribution.js` (line 370) — `archive.directory()` was originally considered but glob is the convention here.

### 6.2 Path B — `ScaffoldPhase` post-extract guard

After extraction, `ScaffoldPhase` checks for the pack and emits a structured event. This is mostly for diagnostics, but also handles the case where someone built a custom bootstrap ZIP without the pack:

```ts
// In ScaffoldPhase.Run, after extraction succeeds:
const packMarker = path.join(ctx.Dir, '.claude', 'mj', 'VERSION');
if (!fs.existsSync(packMarker)) {
  ctx.Emitter.emit('log', {
    level: 'warn',
    message: 'Claude Code pack not found in distribution. Run `mj install:claude` to add it.'
  });
} else {
  const packVersion = fs.readFileSync(packMarker, 'utf8').trim();
  ctx.Emitter.emit('log', {
    level: 'info',
    message: `Claude Code pack v${packVersion} installed.`
  });
}
```

This is *additive*, low-risk, and gives the installer's UX a cleaner signal that the pack landed correctly.

### 6.3 Path C — `mj install:claude` (for existing installs)

For users who installed before this feature, or who chose the `monorepo` install mode (which doesn't go through the bootstrap ZIP), they can run:

```bash
mj install:claude              # adds the pack to the current directory
mj install:claude --update     # alias for `mj update:claude`
mj install:claude --dry-run    # show what would be written, change nothing
mj install:claude --force      # overwrite even if .claude/mj already exists
```

The command:
1. Detects the MJ version installed in this directory (reads `package.json`).
2. Picks the matching pack major.
3. Fetches the pack from `https://raw.githubusercontent.com/MemberJunction/MJ/v{MJ_VERSION}/templates/claude-pack/dist/v{MAJOR}/MANIFEST.json` — falls back to `main` branch if the tag doesn't have a pack yet.
4. Downloads each file listed in MANIFEST.json, verifying sha256.
5. Writes them with the merge rules from §6.4 below.
6. Prints a summary: `+5 files, ~3 files, =0 files (skipped/identical)`.

### 6.4 Merge rules per file/folder

| Path | Rule |
|---|---|
| `CLAUDE.md` | If absent → write the rendered template. If present → only rewrite the `<!-- MJ-MANAGED:CLAUDE-PACK START … -->` … `<!-- MJ-MANAGED:CLAUDE-PACK END -->` block. Leave everything else untouched. |
| `.claude/mj/**` | Always overwritten as a unit. The user is told this folder is managed. |
| `.claude/settings.json` | Deep-merge MJ defaults into existing file. We tag managed keys via a top-level `__mj_managed: ["permissions.allow", "hooks.SessionStart"]` field so we can re-merge without clobbering user additions. See §10.2. |
| `.claude/commands/*.md` | If file absent → write. If present and identical → skip. If present and different → leave user version, log notice. (Curated commands evolve via `mj update:claude --refresh-commands` which forces overwrite, prompting per file.) |
| `.claude/skills/**` | Same rule as commands. |

This **never destroys user content** by default. The `--force` flag is opt-in for cases where the user knowingly wants to reset.

### 6.5 `mj update:claude` (refresh existing install)

Same logic as `install:claude` but skips the "add new files" path for commands/skills (those are seed-once). Always:
- Refreshes `.claude/mj/**` from the latest pack
- Re-renders the managed block in `CLAUDE.md`
- Deep-merges new managed keys into `.claude/settings.json`

Flags:
- `--refresh-commands` — also overwrite `.claude/commands/*` from the pack (with prompt per file unless `--yes`)
- `--refresh-skills` — same for skills
- `--ref <branch-or-tag>` — fetch from a specific repo ref instead of the default (the MJ tag matching local install)
- `--check` — don't fetch; just compare local pack version to the latest available and print whether an update is available
- `--allow-major` — required if the local install's MJ major differs from the latest pack's MJ major (paranoid guardrail)

### 6.6 Network-fetch fallback

If raw.githubusercontent.com is unreachable (corporate firewall, air-gapped), `mj update:claude --from <local-path>` lets the user point at a locally-checked-out copy of the MJ repo or an unzipped pack archive.

---

## 7. New MJCLI Commands

### 7.1 Why MJCLI is the right home

- Users already have `@memberjunction/cli` installed globally as part of the standard install flow.
- The CLI already has a topic structure (`install`, `codegen`, `migrate`, etc.). Adding `install:claude` and `update:claude` aligns with that.
- We get oclif's plugin system, hooks, and consistent UX for free.

### 7.2 Command tree additions

```
mj install               (existing — full installer)
mj install:claude        (NEW — install/refresh just the Claude pack)
mj update:claude         (NEW — update the Claude pack in this directory)
mj doctor                (existing — extend to include Claude-pack health check)
```

We deliberately add `update:claude` as its own top-level path (not nested under `update:`) because no `update:` topic exists yet; this makes it discoverable via `mj update --help` if oclif autogenerates topic indices.

### 7.3 File layout (as built)

```
packages/MJCLI/src/commands/install/claude.ts       ← `mj install:claude`
packages/MJCLI/src/commands/update/claude.ts        ← `mj update:claude`
packages/MJCLI/src/lib/claude-pack/
    PackInstaller.ts        core install/update orchestrator
    PackFetcher.ts          HTTPS fetch from raw.githubusercontent.com, sha256 verify
    PackMerger.ts           per-file merge rules (§6.4)
    PackPaths.ts            resolves source/target paths for both monorepo + distribution mode
    ManagedBlockEditor.ts   parse + rewrite the <!-- MJ-MANAGED:* --> markers in CLAUDE.md
    SettingsMerger.ts       deep-merge for .claude/settings.json
    PackOutputFormatter.ts  shared pretty + JSON renderers for the two commands
    PackTypes.ts            shared types for the manifest, version, etc.
packages/MJCLI/src/__tests__/claude-pack/
    *.test.ts               vitest tests; no network, no FS mutation outside temp dirs
```

> **Test directory note:** the plan originally called for `src/lib/claude-pack/__tests__/`,
> but MJCLI's existing convention is to keep all tests under `src/__tests__/`, so the
> claude-pack tests live in `src/__tests__/claude-pack/` to match. Tests are excluded
> from the published build via `tsconfig.json`.

### 7.4 Command flags (consolidated)

```
mj install:claude
  --dir <path>           Target directory (default: cwd, i.e. `.`)
  --major <N>            Force a specific MJ major (default: detected from package.json)
  --ref <branch|tag>     Repo ref to fetch from (default: main; falls back from a 404-ing tag)
  --from <path>          Use a local pack source instead of fetching
  --dry-run              Print what would be written, write nothing
  --yes / -y             Don't prompt (reserved for future interactive paths; currently no-op)
  --force                Overwrite user-customized commands/skills (saves .bak files)
  --offline              Forbid network; require --from
  --skip-commands        Don't seed .claude/commands/
  --skip-skills          Don't seed .claude/skills/
  --skip-settings        Don't merge .claude/settings.json
  --json                 Machine-readable output (matches §7.5 schema)
  --verbose / -v         Show progress messages from the fetcher and merger

mj update:claude
  (same flags as above, plus:)
  --check                Don't write anything; print whether an update is available
  --refresh-commands     Force-resync commands from pack (saves .bak files)
  --refresh-skills       Same for skills
  --allow-major          Required if remote pack major != local MJ major
```

### 7.5 Outputs (machine-readable mode)

`--json` returns a structured result useful for scripts and hooks:

```json
{
  "ok": true,
  "packVersion": "5.1.0",
  "installedMJVersion": "5.1.3",
  "actions": {
    "added":   ["CLAUDE.md", ".claude/mj/core.md", ".claude/mj/v5.md"],
    "updated": [".claude/settings.json"],
    "skipped": [".claude/commands/commit.md (user-modified)"],
    "errors":  []
  },
  "warnings": [
    ".claude/commands/commit.md differs from pack — kept user version"
  ]
}
```

### 7.6 Doctor integration

`mj doctor` (existing command) gets a new check group `claude-pack`:
- Is `.claude/mj/VERSION` present?
- Does it match a known pack major?
- Is the pack version older than the latest available (best-effort, network call optional)?
- Is the managed block in `CLAUDE.md` parseable and well-formed?
- Are `.claude/settings.json` MJ-managed keys still present?

Output rolls into the existing `mj doctor` summary. Each check is skippable via `--skip claude-pack`.

### 7.7 Telemetry / privacy posture

- **No telemetry.** The commands send no analytics events. Period.
- **The only network calls are explicit `https://raw.githubusercontent.com/...` fetches** during install/update. We log the URL we're about to hit and require `--yes` to skip confirmation.
- **No tokens, no auth headers** — raw.githubusercontent.com is public.

---

## 8. Freshness Model

### 8.1 The pack lifecycle in a user's repo

```
day 0    user runs `mj install`              → pack v5.1.0 lands
day 30   we publish pack v5.1.1               (typo fixes)
day 32   user opens Claude Code               → SessionStart hook (if installed) sees stale, prints notice
day 32   user runs `mj update:claude`         → pack v5.1.1
day 90   user runs `mj update:claude --check` → "up to date, latest is 5.1.1"
day 180  we publish pack v5.2.0              (substantial v5 update)
day 200  user runs `mj update:claude`         → pack v5.2.0
day 365  user upgrades MJ to v6
day 365  user runs `mj update:claude`         → refuses without --allow-major
day 365  user runs `mj update:claude --allow-major` → pack v6.0.0
```

### 8.2 The optional SessionStart hook

We ship in `.claude/settings.json` a SessionStart hook that:
- Reads `.claude/mj/VERSION`
- Reads a tiny cache file `.claude/mj/.last-check` (mtime) to avoid spamming the network
- If the cache is older than 7 days, fetches `https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/versions/v{MAJOR}/PACK_VERSION` (a single 8-byte file)
- Compares; if remote > local, prints (to Claude's session output) a one-liner: *"MJ Claude pack update available: v5.1.0 → v5.1.1. Run `mj update:claude` to upgrade."*
- Updates `.last-check` mtime regardless

The hook is **opt-out**, not opt-in: it's in the shipped settings.json with a key the user can remove. We document this clearly. The hook never *does* anything destructive — it only prints a notice.

If the user is uncomfortable with the network call, they remove the hook from `.claude/settings.json` and `mj update:claude` will silently keep the existing pack until they run `--check` manually.

### 8.3 Why not auto-update on session start?

- Network calls during agent sessions are slow and unreliable.
- An auto-pulled pack could change context mid-conversation in surprising ways.
- We want the user to *see* what's about to change before it changes — preview diff, then explicit accept.

### 8.4 Pack version pinning + multi-major coexistence

- The local install records the pack version it currently has at `.claude/mj/VERSION`.
- The local install also records *which MJ major* the pack is for in `.claude/mj/REMOTE.md`.
- `mj update:claude` cross-checks: if the local MJ major changed (user upgraded MJ from v5 to v6), the update command requires `--allow-major` and prints a migration notice.
- If the user reverts MJ from v6 to v5, the same guardrail applies in reverse.

This protects against the "I upgraded MJ but my CLAUDE.md still has v5 entity names" footgun.

### 8.5 Stable URL convention

Two URL prefixes the pack relies on:

```
PRODUCTION (latest stable v5):
  https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/

PINNED (a specific MJ release):
  https://raw.githubusercontent.com/MemberJunction/MJ/v5.1.0/templates/claude-pack/dist/v5/
```

`mj update:claude` defaults to PINNED (the tag matching the locally-installed MJ version) and falls back to PRODUCTION (`main`) only if PINNED returns 404. This handles the case where someone is on a PR-merged-but-not-yet-tagged version.

---

## 9. Curated Commands & Skills

### 9.1 Commands — ship list (with rationale)

| Command | Why ship | Source file in this repo | Notes |
|---|---|---|---|
| `/init` | One-stop "rebuild my CLAUDE.md from the pack" — useful if user accidentally deletes managed block | NEW for the pack | Calls `mj install:claude` under the hood |
| `/commit` | Generic "commit only what's staged" command — already user-friendly | `.claude/commands/commit.md` | Ship as-is |
| `/create-pr` | Standard PR-creation command | `.claude/commands/create-pr.md` | Lightly edit to drop "to next" assumption — let user configure base branch |
| `/update-pr` | Update existing PR | `.claude/commands/update-pr.md` | Ship as-is |
| `/new-branch` | Branch-from-default-with-correct-tracking | `.claude/commands/new-branch.md` | Edit: replace hardcoded `next` with detected default branch |
| `/clean-branch` | Focused PR branch with cherry-picked files | `.claude/commands/clean-branch.md` | Ship as-is |
| `/save-plan-new-pr` | Save plan to new worktree + PR | `.claude/commands/save-plan-new-pr.md` | Ship as-is |
| `/debug-agent-run` | Debug an MJ AI agent run — high-value for users building agents | `.claude/commands/debug-agent-run.md` | Ship as-is |
| `/add-ai-model` | Add an AI model to MJ metadata — high-value for users wiring their own models | `.claude/commands/add-ai-model.md` | Ship as-is, validate paths still resolve in distribution mode |
| `/generate-integration-actions` | Regenerate integration action metadata | `.claude/commands/generate-integration-actions.md` | Verify it works in distribution mode (where source isn't checked in) |
| `/speckit.specify` | Generic feature-spec authoring | `.claude/commands/speckit.specify.md` | Ship as-is |
| `/speckit.plan` | Generic technical plan from spec | `.claude/commands/speckit.plan.md` | Ship as-is |
| `/speckit.clarify` | Generic clarification questions | `.claude/commands/speckit.clarify.md` | Ship as-is |
| `/speckit.tasks` | Generic task generation | `.claude/commands/speckit.tasks.md` | Ship as-is |
| `/speckit.taskstoissues` | Tasks → GitHub issues | `.claude/commands/speckit.taskstoissues.md` | Ship as-is, verify it works without org-specific labels |
| `/speckit.analyze` | Cross-artifact consistency check | `.claude/commands/speckit.analyze.md` | Ship as-is |
| `/speckit.checklist` | Generic feature checklist | `.claude/commands/speckit.checklist.md` | Ship as-is |
| `/speckit.implement` | Execute the implementation plan | `.claude/commands/speckit.implement.md` | Ship as-is |
| `/speckit.constitution` | Project constitution | `.claude/commands/speckit.constitution.md` | Ship as-is |

**Total: 19 commands.**

### 9.2 Commands — DO NOT ship list

| Command | Reason for exclusion |
|---|---|
| `/notes` | MJ release coordinator tool, references internal scripts |
| `/changeset` | MJ release process — MJ-internal versioning conventions |
| `/pg-migrate` | MJ-internal Docker workbench dependency, PostgreSQL ↔ SQL Server sync pipeline |
| `/docker-workbench` | Workbench is MJ-contributor-only |
| `/analyze-readme-health` | Targets MJ packages, not user code |
| `/update-folder-readme` | MJ documentation maintenance |
| `/update-package-readme` | Same |
| `/update-readmes-batch` | Same |

### 9.3 Skills — ship list

| Skill | Why ship | Source |
|---|---|---|
| `playwright-cli` | Generic browser automation, useful for testing user's MJ app UI | `.claude/skills/playwright-cli/` — copy verbatim |
| `mj-add-entity` (NEW) | Wraps the migration → CodeGen → form scaffold flow into a guided skill | Author from scratch — see §9.4 |

### 9.4 The `mj-add-entity` skill (new authoring)

A new skill `mj-add-entity` that walks the user through:
1. Authoring a SQL migration in the current `migrations/v{N}/` folder
2. Running it via Flyway / `mj migrate`
3. Running `mj codegen` to generate entity classes, stored procs, Angular forms
4. Verifying with `npm run build`
5. Optionally seeding via `mj sync` if it's a lookup table

The skill embodies the "wait for CodeGen before referencing new fields" rule that's elsewhere only in prose. Output is a concrete, repeatable workflow that's hard to mess up.

**Risk:** if we don't have time to author this in v1, we cut it and ship just `playwright-cli`.

### 9.5 Optional future skills (not v1)

- `mj-debug-load` — diagnose why a `BaseResourceComponent` doesn't finish loading (the `NotifyLoadComplete` issue).
- `mj-add-action` — guided custom action creation (using `packages/Actions/CLAUDE.md` patterns).
- `mj-runview-coach` — specialist for tuning RunView calls (batching, ResultType, Fields).

### 9.6 Command/skill versioning

Each command and skill file gets a frontmatter line `mj-pack-version: 5.1.0`. `mj update:claude --refresh-commands` uses this to detect when a new pack revision has updated a particular command and ask the user if they want to refresh.

---

## 10. Settings.json Defaults

### 10.1 Shipped baseline

```jsonc
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "__mj_managed": {
    "version": "5.1.0",
    "keys": ["permissions.allow", "hooks.SessionStart", "env.MJ_CLAUDE_PACK"]
  },
  "permissions": {
    "allow": [
      "Bash(npm install)",
      "Bash(npm run build)",
      "Bash(npm run watch)",
      "Bash(npm run test)",
      "Bash(npm test)",
      "Bash(npm run start:api)",
      "Bash(npm run start:explorer)",
      "Bash(mj *)",
      "Bash(node --version)",
      "Bash(node -v)",
      "Bash(git status)",
      "Bash(git diff)",
      "Bash(git diff --staged)",
      "Bash(git log:*)",
      "Bash(git branch -vv)",
      "Bash(git branch --show-current)",
      "Bash(git fetch)",
      "Bash(ls *)",
      "Bash(find *)",
      "Bash(grep *)"
    ]
  },
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/mj/check-pack-version.js"
          }
        ]
      }
    ]
  },
  "env": {
    "MJ_CLAUDE_PACK": "5.1.0"
  }
}
```

### 10.2 Merge rules (when user already has a settings.json)

`SettingsMerger.ts` does:

1. Parse existing `.claude/settings.json` (preserve formatting if reasonable).
2. Read `__mj_managed.keys` to know which keys we own.
3. For each managed key:
   - If it's an array (e.g., `permissions.allow`) — union our entries with the user's, dedupe, preserve user order first then ours.
   - If it's an object (e.g., `hooks.SessionStart` matchers) — replace our entries identified by a stable id; leave user entries alone.
4. Write back, preserving user keys outside `__mj_managed.keys` entirely.

**Open question:** is `permissions.allow` strictly additive, or do we ever need to *remove* an entry across versions? If we add a removal mechanism, it needs to know whether the entry was last seen in our pack vs the user's — a "previous-mj-set" record stored in `__mj_managed.previous` would handle that. **Decision needed.** (See §13 #3.)

### 10.3 Scope: project vs user settings

- We touch only the **project-level** `<repo>/.claude/settings.json`, never `~/.claude/settings.json`.
- The shipped `.claude/settings.local.json` is *not* created by us — that's the user's personal override file.

### 10.4 The `check-pack-version.js` SessionStart helper (as shipped)

Self-contained Node CommonJS script committed to `templates/claude-pack/check-pack-version.js`
and copied by `build-pack.mjs` into `.claude/mj/check-pack-version.js`. Implements
the §8.2 staleness check. No npm dependencies — just `fs`, `path`, `https`, `http`.
Exits 0 always; notices go to stderr.

> **Source path note:** the plan originally suggested
> `templates/claude-pack/skills/_helpers/`, but `skills/` is reserved for actual
> Claude Code skill packages that the framework discovers and loads. Putting a
> helper under there would either look like a skill (confusing) or require a
> filtering convention. The helper lives at the pack source root instead, where
> it sits alongside `build-pack.mjs` and the templates.

Two escape hatches for restricted environments and tests:

- `MJ_PACK_CHECK_DISABLE=1` — skip the check entirely (no FS or network work)
- `MJ_PACK_CHECK_URL=<url>` — fetch from the given URL instead of the GitHub
  raw URL. Accepts `http://` (for local mirrors / tests) or `https://`.

The MJ major is derived at runtime from `.claude/mj/VERSION`, so the same helper
ships across major versions without templating.

---

## 11. Testing Plan

### 11.1 Unit tests (vitest) — as shipped

In `packages/MJCLI/src/__tests__/claude-pack/` (see §7.3 note for path):

| Test file | Covers |
|---|---|
| `PackTypes.test.ts` | `emptyActionLog`, `recordOutcome` bucket mapping (including the `error` → `errors` plural rename), reason-string formatting |
| `PackPaths.test.ts` | `targetPathsFor`, `parseSemverMajor` (handles `^/~/>=/v` prefixes), `detectMJMajor` from `package.json`, `resolveLocalPackRoot` for both MJ-repo-root and unpacked-dist shapes, `buildRemoteUrlPrefix` |
| `PackFetcher.test.ts` | Mocked `https.get` via `HttpGetter` injection; success path; tag→main fallback on 404; no fallback on 5xx; per-file 404; sha256 + byte-length verification; malformed manifest JSON |
| `ManagedBlockEditor.test.ts` | Parses + rewrites markers; handles attribute parsing; rejects malformed markers (END before START, only one marker, multiple START); preserves user content above/below; tolerates whitespace variants |
| `SettingsMerger.test.ts` | Deep-merges arrays (user-first, deduped by stable JSON); recursive object merge; preserves user keys outside managed paths; replaces `__mj_managed` wholesale; type-mismatch falls back to pack value; `Changed` flag honors no-ops |
| `PackMerger.test.ts` | Every §6.4 rule: CLAUDE.md wrap-vs-rewrite-vs-skip, .claude/mj/** sweep of stale files, settings deep-merge, commands/skills seed-once with `--force` saving `.bak`; `--dry-run` no-FS-write proof; `--skip-*` flags |
| `PackInstaller.test.ts` | MJ-major detection + `--major` override; `--offline` requires `--from`; local pack with checksum verify; network fetch with mock; `--check` fast path (up-to-date / update-available / no-local); cross-major guard + `--allow-major`; §7.5-shape result |
| `PackOutputFormatter.test.ts` | `formatJson` matches §7.5 schema; `formatPretty` success/failure banners, bucket listing, skipped-list truncation, warning rendering, "(check only)" + "no local MJ" labels |
| `claude-commands.test.ts` | Static flag-set metadata for both commands; `mapFlagsToInstallOptions` exhaustive translation; end-to-end `Command.run([...argv])` with `--from --dry-run --json` against a real fixture pack (no network) |
| `build-pack.test.ts` | The Milestone 1 build script (deferred from M1 per the user's "defer to M3" decision): determinism, output sanity, MANIFEST.json checksum integrity, error paths (missing PACK_VERSION, mismatched major, missing overlay, unknown `--major`), multi-major build with v6 fixture, commands/skills verbatim copy, .gitkeep exclusion |
| `check-pack-version.test.ts` | The Milestone 4 SessionStart helper, tested via subprocess: `MJ_PACK_CHECK_DISABLE=1` short-circuit; absent / empty / non-semver VERSION cases; cache TTL (fresh skip + stale refetch); patch / minor / major bumps trigger notice; equal / older / numeric-vs-lex compare cases stay silent; cache touched defensively on connection refused and on 404 (no retry-loop) |

### 11.2 Integration tests

The scenarios below are covered across the unit-test files in §11.1 rather than
in a single `install-claude.integration.test.ts` — each unit file owns the
scenarios that exercise its surface, which keeps the failure messages
specific (e.g. a sweep-of-stale-mj-files regression surfaces in
`PackMerger.test.ts` rather than buried in a 30-case integration file).
The scenario → test-file map:

| Scenario | Covering test file |
|---|---|
| Fresh install in empty dir | `PackInstaller.test.ts`, `claude-commands.test.ts` (end-to-end) |
| Install on top of existing CLAUDE.md (no markers) | `PackMerger.test.ts` — "wraps unmanaged CLAUDE.md with markers" |
| Install on top of existing CLAUDE.md (with markers) | `PackMerger.test.ts` — "rewrites only the managed block" |
| Install with existing settings.json | `PackMerger.test.ts` — "deep-merges into existing settings" |
| Install with existing custom command | `PackMerger.test.ts` — "keeps user-modified commands without --force" |
| `--force` overwrite | `PackMerger.test.ts` — "--force overwrites … and saves a .bak" |
| Update across major versions without `--allow-major` | `PackInstaller.test.ts` — "errors with clear message when fixture has different mjMajor" |
| Update across major versions with `--allow-major` | `PackInstaller.test.ts` — "--allow-major lets the cross-major merge proceed" |
| `--check` with newer remote | `PackInstaller.test.ts` + `claude-commands.test.ts` |
| `--offline --from <path>` | `PackInstaller.test.ts` — "errors when --offline given without --from" + the `--from` happy-path tests |
| `--dry-run` | `PackMerger.test.ts` ("reports actions without writing anything") + `claude-commands.test.ts` end-to-end |

A separate `install-claude.integration.test.ts` file remains a viable option
if cross-cutting scenarios ever outgrow the unit tests, but the unit-tests-with-
fixture-packs pattern is sufficient for the M3 surface.

### 11.2-legacy Original integration table (kept for context)

The original scenarios as drafted in the plan, now mapped via §11.2 above:

| Scenario | Setup | Assertion |
|---|---|---|
| Fresh install in empty dir | `tmp/` empty | `CLAUDE.md` written, `.claude/mj/VERSION` matches pack version |
| Install on top of existing CLAUDE.md (no markers) | `tmp/CLAUDE.md` with user content | Markers + managed block prepended; user content preserved |
| Install on top of existing CLAUDE.md (with markers) | `tmp/CLAUDE.md` with stale managed block | Managed block replaced; non-managed content untouched |
| Install with existing settings.json | `tmp/.claude/settings.json` with custom `permissions.allow` | Merged: user entries + ours, deduped, no loss |
| Install with existing custom command | `tmp/.claude/commands/commit.md` (user-modified) | User's commit.md preserved; logged warning |
| `--force` overwrite | Same as above + `--force` | Overwritten with backup at `commit.md.bak` |
| Update across patch versions | Pack v5.1.0 → v5.1.1 | Managed block + `.claude/mj/**` updated; commands not touched |
| Update across major versions without `--allow-major` | MJ v5 → v6 | Refuses with clear error |
| Update across major versions with `--allow-major` | Same + flag | Pack overwrites cleanly |
| `--check` with newer remote | Local pack v5.1.0, remote v5.1.1 | Exits 1 with "update available" message |
| `--offline --from <path>` | Pack source on disk | Works without network |
| `--dry-run` | Any | No file writes, prints planned changes |

### 11.3 End-to-end test

A new step in `.github/workflows/publish.yml` (or a separate workflow):
1. Run `npm run claude-pack:build`
2. Build the bootstrap ZIP via `CreateMJDistribution.js`
3. Extract the ZIP into a temp directory
4. Assert `CLAUDE.md`, `.claude/mj/VERSION`, `.claude/settings.json` exist
5. Assert `.claude/mj/VERSION` matches the source `PACK_VERSION` file
6. Assert `MANIFEST.json` checksums match actual file checksums (catches any corruption during ZIP packaging)

### 11.4 Manual smoke test (release checklist)

A short `templates/claude-pack/RELEASE_CHECKLIST.md` (also part of the pack source):

```
- [ ] PACK_VERSION in versions/v{MAJOR}/ bumped if content changed
- [ ] `npm run claude-pack:build` produces clean diff in dist/
- [ ] `git diff templates/claude-pack/dist/v{MAJOR}/` reviewed
- [ ] One full install test in a scratch directory: `mj install --tag <new-tag>`
- [ ] One update test from previous pack version: `mj update:claude`
- [ ] Open Claude Code in the test repo, confirm CLAUDE.md context loads
- [ ] Confirm at least one shipped command works: `/commit`, `/new-branch`
- [ ] Confirm `playwright-cli` skill is discoverable
```

---

## 12. Phased Delivery — Concrete Milestones

### 12.1 Milestone 1 — Skeleton (1–2 days)

Goal: prove the pipeline end to end with a tiny pack.

| # | Task | File(s) | Validation |
|---|---|---|---|
| 1 | Create `templates/claude-pack/` folder structure | `templates/claude-pack/{core,versions/v5,commands,skills}/.gitkeep` | Directory tree matches §3.1 |
| 2 | Author 3 placeholder core files (`00-pack-header.md`, `01-mj-mental-model.md`, `02-entity-essentials.md`) | `templates/claude-pack/core/*.md` | ~600 lines of real content |
| 3 | Author `versions/v5/overlay.md` (stub: 50 lines) | `templates/claude-pack/versions/v5/overlay.md` | File exists |
| 4 | Author `versions/v5/PACK_VERSION` = `5.1.0` | same | File reads `5.1.0` |
| 5 | Author `templates/claude-pack/CLAUDE.md.template` and `settings.template.json` | same | Templates parse |
| 6 | Implement `build-pack.mjs` per §5.2 | `templates/claude-pack/build-pack.mjs` | Running it produces `dist/v5/` |
| 7 | Wire `npm run claude-pack:build` in root `package.json` | root `package.json` | Script runs |
| 8 | Add CI gate: `git diff --exit-code templates/claude-pack/dist/` after rebuild | `.github/workflows/*.yml` | CI passes when committed in sync |
| 9 | Commit the generated `dist/v5/` | repo | `dist/v5/CLAUDE.md` and `dist/v5/.claude/mj/*` exist |

**Exit criterion:** `npm run claude-pack:build` succeeds and produces a usable `dist/v5/` directory.

### 12.2 Milestone 2 — Bootstrap ZIP injection (0.5 day)

Goal: new installs get the pack automatically.

| # | Task | File(s) | Validation |
|---|---|---|---|
| 10 | Modify `CreateMJDistribution.js` to add `dist/v{MAJOR}/` to the archive | `CreateMJDistribution.js` (around line 410) | ZIP contains `CLAUDE.md` + `.claude/mj/` at root |
| 11 | Add a sanity check: throw if `dist/v{MAJOR}/` doesn't exist | same | Build fails loudly when pack missing |
| 12 | Manual test: `node CreateMJDistribution.js`, unzip output, verify pack present | n/a | Files present at extracted root |
| 13 | Modify `ScaffoldPhase.ts` to log pack-version on success / warn on absence | `packages/MJInstaller/src/phases/ScaffoldPhase.ts` | Log line appears in installer output |

**Exit criterion:** A fresh `mj install` against a custom-built ZIP produces a working pack in the user's directory.

### 12.3 Milestone 3 — `mj install:claude` and `mj update:claude` (3–4 days)

Goal: manual install/update works for existing repos.

| # | Task | File(s) | Validation |
|---|---|---|---|
| 14 | Scaffold `packages/MJCLI/src/commands/install/claude.ts` | new | `mj install:claude --help` works |
| 15 | Scaffold `packages/MJCLI/src/commands/update/claude.ts` | new | `mj update:claude --help` works |
| 16 | Implement `lib/claude-pack/PackPaths.ts` | new | Unit-tested |
| 17 | Implement `lib/claude-pack/PackFetcher.ts` (HTTPS + sha256 + tag-fallback) | new | Unit-tested with mocked https |
| 18 | Implement `lib/claude-pack/ManagedBlockEditor.ts` (CLAUDE.md marker rewrite) | new | Unit-tested with various CLAUDE.md shapes |
| 19 | Implement `lib/claude-pack/SettingsMerger.ts` | new | Unit-tested per §10.2 |
| 20 | Implement `lib/claude-pack/PackMerger.ts` (per-file rules) | new | Unit-tested per §6.4 |
| 21 | Implement `lib/claude-pack/PackInstaller.ts` (orchestrator) | new | Wires fetcher → merger; unit-tested |
| 22 | Wire flags from §7.4 | both command files | `--dry-run`, `--force`, etc. honored |
| 23 | Implement `--json` output | command files | Output matches §7.5 schema |
| 24 | Integration tests per §11.2 | `packages/MJCLI/src/__tests__/` | All scenarios pass |

**Exit criterion:** A user can run `mj install:claude` in any MJ-installed directory and get the pack; `mj update:claude --check` reports correctly.

### 12.4 Milestone 4 — Settings hook & freshness (1 day)

Goal: stale-pack detection works end to end.

| # | Task | File(s) | Validation |
|---|---|---|---|
| 25 | Author `check-pack-version.js` SessionStart helper | `templates/claude-pack/skills/_helpers/check-pack-version.js` | Script runs without npm deps |
| 26 | Wire helper into `settings.template.json` SessionStart hooks | settings template | Rendered settings has the hook |
| 27 | Manual test: simulate stale pack, confirm session prints notice | n/a | Notice appears |

**Exit criterion:** SessionStart hook prints staleness notice on outdated installs; never blocks; never makes a network call more than once per 7 days per repo.

### 12.5 Milestone 5 — Full content authoring (5–7 days, can run in parallel)

Goal: complete the `core/*.md` library.

| # | Task | Owner suggestion | Validation |
|---|---|---|---|
| 28 | Author core files 03–18 (16 files) per §4.1 | author iteratively, ideally split across several PRs | Each file < 400 lines, no contributor-only content |
| 29 | Author full `versions/v5/overlay.md` per §4.2 | same | All v5 specifics present |
| 30 | Run `npm run claude-pack:build` and review `dist/v5/` | same | Concatenated `core.md` reads cleanly |

**Exit criterion:** A new install drops a CLAUDE.md that, when read by Claude Code, gives Claude enough context to write competent MJ code on day 1 without further guidance.

### 12.6 Milestone 6 — Curated commands & skills (2–3 days)

Goal: ship the `/commit`, `/new-branch`, speckit suite, etc.

| # | Task | File(s) | Validation |
|---|---|---|---|
| 31 | Copy ship-list commands from `.claude/commands/` to `templates/claude-pack/commands/` | per §9.1 | 19 files present |
| 32 | Edit `/new-branch` to detect default branch instead of hardcoding `next` | `templates/claude-pack/commands/new-branch.md` | Works in non-MJ repos |
| 33 | Edit `/create-pr` to drop `next`-base assumption | `templates/claude-pack/commands/create-pr.md` | Same |
| 34 | Verify each command works in distribution mode (no monorepo paths) | manual | All work |
| 35 | Copy `playwright-cli` skill to `templates/claude-pack/skills/` | same | Skill discoverable |
| 36 | (Optional, if time) Author `mj-add-entity` skill | new | Skill works against a real install |
| 37 | Add `mj-pack-version` frontmatter to all commands/skills | same | `mj update:claude --refresh-commands` works |

**Exit criterion:** All shipped commands work out-of-the-box in a fresh user install.

### 12.7 Milestone 7 — Doctor + docs (1 day)

| # | Task | File(s) | Validation |
|---|---|---|---|
| 38 | Add `claude-pack` check group to `mj doctor` | `packages/MJCLI/src/commands/doctor/*` | Runs all checks |
| 39 | Author `templates/claude-pack/README.md` (the source-of-truth README) | new | Explains how to author and build |
| 40 | Author `packages/MJInstaller/install-in-minutes-new.md` addendum | docs | Mentions Claude pack |
| 41 | Update top-level repo README with one paragraph | `README.md` | Visible |
| 42 | Add a CHANGELOG note for the next MJ release | release notes | Captured |

**Exit criterion:** Anyone on the team can author or update pack content following the README.

### 12.8 Milestone 8 — Release & CI hardening (0.5 day)

| # | Task | File(s) | Validation |
|---|---|---|---|
| 43 | Add E2E test per §11.3 | `.github/workflows/*.yml` | Runs on every PR touching pack |
| 44 | Add CHANGELOG to `templates/claude-pack/versions/v5/CHANGELOG.md` for the first release | same | Has a 5.1.0 entry |
| 45 | Tag and ship | n/a | Pack ships in the next MJ release |

---

## 13. Open Questions / Decisions Needed

These need explicit answers before we can finalize the build:

1. **Pack-version coupling** — strict-major (one pack version covers all of MJ v5.x) or pack-revision-per-MJ-minor (5.1.x and 5.2.x can have different packs)? *Recommendation: strict-major + optional patch revisions for typo fixes.*
2. **Commands & skills as first-class managed assets, or seed-only?** Plan currently treats them as seed-only with explicit `--refresh-*` flags. *Recommendation: keep seed-only.*
3. **Settings.json removal semantics** — do we ever need to *remove* a `permissions.allow` entry across pack versions? If so, we need a `previous` snapshot field. *Recommendation: defer until we have a real removal case; document the limitation.*
4. **Scope of `core/10-angular-essentials.md`** — Angular content is huge in the contributor-facing CLAUDE.md (576 lines). Do we ship a single focused file or split into 3? *Recommendation: single focused file, ~250 lines, covering only the patterns a user customizing or extending MJ Angular components needs.*
5. **`mj-add-entity` skill in v1?** — high value but adds authoring time. *Recommendation: stretch goal for v1, definite v1.1.*
6. **Where does `dist/` live in the repo?** — committed alongside source, or only in tagged releases? *Recommendation: committed; CI gate enforces sync.*
7. **Auto-update vs notify-only on SessionStart** — confirmed: notify-only.
8. **Telemetry** — confirmed: none.
9. **Branding / pack name** — call it the "MJ Claude Pack"? "MJ Codex"? "MJ Context Bundle"? *Recommendation: "MJ Claude Pack" — describes what it is, who it's for.*
10. **Distribution to non-MJ users** — what if a partner builds an MJ-derived stack? Do they fork the pack? *Recommendation: keep the pack unfork-friendly; partners customize their `<repo>/.claude/` after install.*
11. **Should we ship the full root contributor `CLAUDE.md` as `dist/v5/.claude/mj/contributor-reference.md`** for users who want to dive deep? *Recommendation: no — keep the user-facing pack focused. Link to `/guides/` for depth instead.*

---

## 14. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Pack content drifts out of sync with reality | High | High | CI gate on `dist/` + release checklist + per-pack CHANGELOG |
| Users edit `.claude/mj/` and lose their changes on update | Medium | Medium | Big README in folder, `--dry-run`, prompt before overwrite, `.bak` files |
| `permissions.allow` entries turn into a footgun (over-permissive) | Medium | Medium | Keep the shipped allowlist minimal and curated; document each entry in the pack README |
| SessionStart hook leaks user behavior (network calls) | Low | High | No telemetry, only a single file fetch every 7 days, opt-out via removing the hook |
| `raw.githubusercontent.com` is blocked in user's environment | Medium | Low | `--from <local-path>` and `--offline` flags |
| Bootstrap ZIP grows materially | Low | Low | Pack is ~50 KB; ZIP is 75 MB |
| Claude Code's `@file` import behavior changes upstream | Low | High | Test on each Claude Code release; fall back to inlining content if `@file` ever stops working |
| Conflict with users who already have their own `CLAUDE.md` from `claude /init` | High | Medium | Detect existing file, only insert managed block, never clobber non-managed content |
| Pack overrides user-customized commands | Medium | Medium | Per-file checksum compare; preserve user version unless `--force` |
| Multiple MJ majors coexist on dev machine | Low | Medium | `--allow-major` guardrail; per-major dist trees |

---

## 15. References

- This proposal grew from the conversation in branch `claude/add-claude-md-installer-WJ2OZ`.
- Source code seams referenced:
  - `packages/MJInstaller/src/phases/ScaffoldPhase.ts`
  - `packages/MJInstaller/src/adapters/GitHubReleaseProvider.ts` (line 45 — `BOOTSTRAP_ZIP_PATH`)
  - `CreateMJDistribution.js` (lines 384–402 — root-file additions)
  - `.github/workflows/publish.yml` (line 162 — distribution build)
  - `packages/MJCLI/src/commands/install/index.ts`
- Existing CLAUDE.md inventory: 11 files, 4,238 lines (per inventory in §2.1).
- Existing slash commands: 23, of which 19 ship and 8 are excluded (per §9).

---

**End of plan.**

