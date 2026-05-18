---
"@memberjunction/cli": minor
"@memberjunction/installer": minor
"@memberjunction/integration-engine": minor
---

Add MJ Claude Pack — a curated bundle of `CLAUDE.md` guidance, slash commands, and skills that ships with every MemberJunction install for users of Claude Code.

New CLI commands:

- `mj install:claude` — installs the pack into the current directory, preserving any user content above and below the managed CLAUDE.md markers. Supports `--from <path>` for offline installs and `--dry-run` to preview.
- `mj update:claude` — refreshes the pack to the latest version published with the MJ major you're on. Supports `--check`, `--refresh-commands`, and `--refresh-skills` for selective updates.
- `mj codegen integration-actions --connector <path>` — generates mj-sync action JSON for a downstream integration connector. Dynamically imports the user's compiled connector module, finds a class extending `BaseIntegrationConnector`, and feeds it to `ActionMetadataGenerator`. Merges with existing files to preserve primaryKey/sync blocks populated by `mj sync pull`.

`mj doctor` gains a `claude-pack` check group (6 checks: managed-block presence, VERSION file, MANIFEST integrity, file hash drift, SessionStart helper, hook wired). "No pack installed" surfaces as info, not warn — the pack is optional.

New public API:

- `@memberjunction/integration-engine` exports `ActionGenerationRunner`, `deriveFileName`, and merge helpers. The internal connector regeneration script now uses these too, so MJ-internal and downstream users share the same code path.
- `@memberjunction/installer` exports `FileSystemAdapter.ReadBytes()` for binary file reads (used by the pack doctor's hash checks).

The pack is shipped via three paths: (1) bundled into the MJ distribution ZIP at release time, (2) installed via `mj install:claude` against a remote fetch from `raw.githubusercontent.com`, (3) refreshed via the SessionStart hook helper that nags when a newer version is available.
