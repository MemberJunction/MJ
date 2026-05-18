---
description: Re-install the MJ Claude Pack into the current directory. Use this if you accidentally deleted the managed block in CLAUDE.md or want to refresh the .claude/mj/ bundle.
mj-pack-version: 5.1.0
---

# Initialize / refresh the MJ Claude Pack

Re-install the MemberJunction Claude Pack into the current directory. This
is the recovery command — use it when:

- You accidentally deleted the `<!-- MJ-MANAGED:CLAUDE-PACK START … -->` …
  `<!-- … END -->` block in `CLAUDE.md`
- The `.claude/mj/` bundle is missing or stale
- You want to reset the pack to the version `mj` knows about

It calls `mj install:claude` under the hood, which preserves any user
content above and below the managed markers.

## What it does

1. Runs `mj install:claude` against the current directory.
2. Restores the managed block in `CLAUDE.md` if missing; rewrites it if
   present.
3. Refreshes the `.claude/mj/` managed bundle (core.md, v{N}.md, VERSION,
   MANIFEST.json, README.md, REMOTE.md, the SessionStart check-pack-version.js
   helper).
4. Merges the pack's `.claude/settings.json` baseline into yours, preserving
   any keys you've added outside the MJ-managed paths.
5. Does NOT overwrite commands or skills you've customized — those are
   seed-once.

## What it does NOT do

- It does **not** force-overwrite user-modified `.claude/commands/*` or
  `.claude/skills/**` — those are seed-once. If you want to resync them
  too, run `mj update:claude --refresh-commands` / `--refresh-skills`
  explicitly.
- It does **not** touch any content **below** the managed-block END
  marker in `CLAUDE.md` — your own notes there are yours forever.
- It does **not** send telemetry or analytics. The only network call is
  the explicit fetch of the pack from `raw.githubusercontent.com`.

## Steps

1. **Confirm the user wants to proceed.** This is a recovery / reset
   operation; mention what will be touched (managed block, .claude/mj/,
   settings.json) and what will NOT be touched (user content in
   CLAUDE.md, customized commands, settings.local.json).

2. **Verify `mj` is available.**
   - Run: `mj --version`
   - If `mj` isn't installed globally, tell the user to install it:
     `npm install -g @memberjunction/cli`.

3. **Run the installer.**
   - Run: `mj install:claude --json`
   - Capture the JSON output. Parse it for `ok`, `packVersion`, and
     the `actions` breakdown.

4. **Report what changed.**
   - Pack version installed (`packVersion`)
   - Counts: added / updated / skipped / errors
   - List any warnings (e.g. user-modified commands that were preserved)

5. **If the install failed (`ok: false`):**
   - Print the errors verbatim
   - Suggest common fixes:
     - "Could not detect MJ major version" → pass `--major <N>` (matching
       the MJ version in `package.json`)
     - Network failure → retry, or use `--from <local-pack-path>` if
       the user has a local copy

## Flags users may pass through

If $ARGUMENTS contains any of these, append them to the `mj install:claude`
call verbatim. The most common ones:

- `--dry-run` — preview without writing
- `--major <N>` — force a specific MJ major version
- `--from <path>` — install from a local pack source instead of fetching
- `--force` — overwrite user-customized commands/skills (saves `.bak` files)
- `--skip-commands` / `--skip-skills` / `--skip-settings` — narrow the install
- `--verbose` — show progress messages

## Notes

- The pack version that lands is what `raw.githubusercontent.com` has at
  the time of run — typically the latest published. If you want a pinned
  version, pass `--ref <tag>` (e.g. `--ref v5.33.0`).
- This command is **idempotent** — running it twice on a clean install
  is a no-op (everything matches; nothing is rewritten).
