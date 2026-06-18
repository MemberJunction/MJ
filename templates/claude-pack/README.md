# MJ Claude Pack — source

This folder is the source-of-truth for the **Claude Code pack** that ships
with every MemberJunction install. It is for **pack maintainers** (MJ
contributors); end users never look at this folder directly.

For the full design context, see [`plans/claude-install-pack.md`](../../plans/claude-install-pack.md).

## Folder layout

```
templates/claude-pack/
├── core/                          stable, cross-version markdown (each ~150–300 lines)
│   ├── 00-pack-header.md
│   ├── 01-mj-mental-model.md
│   ├── 02-entity-essentials.md
│   └── …
├── versions/
│   └── v5/
│       ├── overlay.md             v5-specific guidance (entity names, footguns)
│       └── PACK_VERSION           plain text semver, e.g. "5.1.0"
├── commands/                      curated slash commands, copied verbatim
├── skills/                        curated skills, copied verbatim
├── CLAUDE.md.template             root file template with managed-block markers
├── settings.template.json         `.claude/settings.json` baseline
├── build-pack.mjs                 build pipeline — concatenates + stamps + writes dist/
└── dist/v{MAJOR}/                 generated output, committed alongside source
```

## How to rebuild

```bash
npm run claude-pack:build
```

This regenerates `dist/v{MAJOR}/` for the MJ major version derived from the
root `package.json`. The committed `dist/` is the **single source of truth**
for what `mj install` lays down at scaffold time and what `mj update:claude` fetches over
the wire.

CI fails if the committed `dist/` is stale relative to its sources, so always
rerun the build and commit both source and `dist/` together.

## Versioning rules

- Pack semver = `<MJ_MAJOR>.<PACK_MINOR>.<PACK_PATCH>`, e.g. `5.1.0`, `5.1.1`, `5.2.0`.
- The major component is always tied to the MJ major version.
- Bump the **minor** when content materially changes; bump the **patch** for
  typos and clarifications.
- Pack version lives in `versions/v{MAJOR}/PACK_VERSION` (a plain text file).
  `build-pack.mjs` reads it and stamps it into every generated file.
- The pack version is **separate** from MJ's npm package versions — bumping
  MJ from 5.1.3 to 5.1.4 does **not** automatically bump the pack.

## Template placeholders

Both `CLAUDE.md.template` and `settings.template.json` use `{{NAME}}`
placeholders that `build-pack.mjs` substitutes at build time:

| Placeholder           | Source                                  | Example                                                                |
|-----------------------|-----------------------------------------|------------------------------------------------------------------------|
| `{{PACK_VERSION}}`    | `versions/v{N}/PACK_VERSION`            | `5.1.0`                                                                |
| `{{MJ_MAJOR}}`        | folder name `versions/v{N}/`, or `--major` flag | `5`                                                            |
| `{{REMOTE_URL_PREFIX}}` | constant                              | `https://raw.githubusercontent.com/MemberJunction/MJ/main/templates/claude-pack/dist/v5/` |

Note: the build output is **deterministic** — running `npm run claude-pack:build`
twice on the same source produces byte-identical output. There is no `BUILD_DATE`
or other time-of-build marker in any generated file. The pack version is the
content fingerprint; bump it (`versions/v{N}/PACK_VERSION`) when content changes.

## Authoring guidelines for `core/*.md`

- Audience: MJ **integrators** (people building an app on top of MJ), not MJ contributors.
- Each file should be focused on a single topic and stay under **400 lines**.
- Keep code examples — they're the highest-value part for Claude.
- Strip monorepo paths, contributor warnings, and "we" phrasing that implies
  the reader works on MJ itself.
- Prefer specifics ("use `Metadata.GetEntityObject<T>()` and pass `contextUser`
  on the server") over generalities ("write clean code").
- Files are concatenated in lexicographic order by `build-pack.mjs`, so name
  them with a numeric prefix to control ordering (`00-`, `01-`, …).

## Authoring guidelines for `versions/v{N}/overlay.md`

- Anything that changes per MJ major version: entity names, breaking changes,
  current `migrations/v{N}/` folder, schema highlights, v-specific footguns.
- Kept separate from `core/` so a v6 launch doesn't require rewriting every
  cross-version doc.

## Authoring guidelines for `commands/*.md`

- Each command is a self-contained markdown file that Claude Code surfaces as
  a slash command (filename → `/command-name`).
- **Frontmatter** must include `mj-pack-version: <semver>` so
  `mj update:claude --refresh-commands` can detect drift on future bumps.
- **No monorepo-relative paths** like `../packages/AI/Agents/src/...` — those
  won't resolve in a downstream user's project. Reference packages by their
  npm name instead (`@memberjunction/ai-agents`).
- **No assumptions about the user's branching model** — don't hardcode
  `next`/`main`/`master`. Detect default branch via `git rev-parse
  --abbrev-ref origin/HEAD`, falling back to `git remote show origin`.
- **Keep instructions self-contained.** A user installing the pack should
  be able to run any slash command and have it work without first reading
  this README or the source repo.
- **Ship-or-skip discipline.** Don't add commands that only make sense for
  MJ contributors (e.g. release tooling, internal cleanup scripts). The
  pack's audience is MJ integrators, not contributors. See plan §9.2's
  do-not-ship list.

## Authoring guidelines for `skills/<name>/SKILL.md`

- Skills are autonomous prompt bundles that Claude Code loads as needed.
  Use them for capabilities (browser automation, file generation) rather
  than commands the user invokes directly.
- Same `mj-pack-version` frontmatter rule applies.
- Skills are seed-once on install — users can customize them in place
  without `mj update:claude` overwriting their edits. To force a resync,
  users pass `--force` (which saves their version as `.bak`).

## Doctor verification

End users can verify a pack install with `mj doctor`. The diagnostic emits
six checks (managed block, VERSION file, MANIFEST.json, file integrity,
SessionStart helper, hook wired). "No pack installed" surfaces as info
rather than warn — the pack is optional and we don't nag opt-outs.

## Don't touch from outside this folder

The only files outside `templates/claude-pack/` that consume the pack are:

- `packages/MJInstaller/src/distribution/DistributionAssembler.ts` — ships `dist/v{MAJOR}/` into a fresh `mj install` via the `'claudePack'` mapping kind (M11). Auto-discovers the highest-numbered `v{N}/`. Replaces the legacy bootstrap-ZIP injection that lived in `CreateMJDistribution.js` pre-PR-#2725.
- `packages/MJInstaller/src/distribution/createBundle.ts` — same pack inclusion for `mj bundle` (offline / air-gapped installs). Both honor `--no-claude-pack` for opt-out.
- `packages/MJCLI/src/commands/install/claude.ts` — fetches and merges the pack into a user's repo.
- `packages/MJCLI/src/commands/update/claude.ts` — same but for refresh-time.
- `packages/MJInstaller/src/diagnostics/ClaudePackDoctor.ts` — runs `mj doctor`'s six pack-integrity checks. Knows the MANIFEST shape and the managed-block regex; check it if you change either.
- `packages/MJInstaller/src/phases/ScaffoldPhase.ts` — emits an info/warn log via `reportClaudePack()` when the sparse-checkout assembly carries (or omits) a pack in a fresh install. Threads `--no-claude-pack` through to the assembler.
- `.github/workflows/claude-pack.yml` — CI gate that fails if `dist/` is stale.

If you change pack semantics, check all of these call sites.
