---
"@memberjunction/cli": minor
"@memberjunction/installer": minor
---

Add MJ Claude Pack: a curated bundle of `CLAUDE.md` guidance, slash commands, and skills that ships with every MemberJunction install for users of Claude Code.

New CLI commands:

- `mj install:claude` — installs the pack into the current directory, preserving any user content above and below the managed CLAUDE.md markers. Supports `--from <path>` for offline installs and `--dry-run` to preview.
- `mj update:claude` — refreshes the pack to the latest version published with the MJ major you're on. Supports `--check`, `--refresh-commands`, and `--refresh-skills` for selective updates.

`mj doctor` gains a `claude-pack` check group (5 checks: managed-block presence, VERSION file, MANIFEST integrity, managed-file hash drift, SessionStart hook wired). "No pack installed" surfaces as info, not warn — the pack is optional.

New public API:

- `@memberjunction/installer` exports `FileSystemAdapter.ReadBytes()` for binary file reads (used by the pack doctor's hash checks).

The pack is shipped via three paths: (1) auto-included in `mj install` and `mj bundle` via the `DistributionAssembler` sparse-checkout (replaces the legacy bootstrap-ZIP injection retired by PR #2725; opt out with `--no-claude-pack`), (2) installed onto an existing project via `mj install:claude` against a remote fetch from `raw.githubusercontent.com`, (3) refreshed via the SessionStart hook helper that nags when a newer version is available.

**Two post-M10 follow-ups from end-to-end testing against a real distribution install:**

- `mj install:claude` / `mj update:claude` now detect the MJ major (and full semver) by walking `apps/*/package.json` and `packages/*/package.json` when the root `package.json` is a workspace shell with no direct `@memberjunction/*` deps. Distribution-style installs put @mj deps under `apps/MJAPI` and `apps/MJExplorer`, so the previous root-only detection required every distribution-install user to pass `--major <N>` manually. Source-style monorepo checkouts and simple consumer projects are unaffected (they hit the root-level path first, exactly as before).
- The `InstallResult` (and `--json` output, §7.5) now has a `notes: string[]` field alongside `warnings`. "Pack is up to date" and "Update available: v… → v…" report as `notes` (informational); `warnings` is reserved for states the caller may want to act on (no local pack, customized file would be overwritten, malformed managed block). Both arrays are always present, so downstream JSON consumers can iterate without optional-chaining.
