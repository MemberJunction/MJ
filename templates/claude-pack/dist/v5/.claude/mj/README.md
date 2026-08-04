# .claude/mj/ — MemberJunction-managed bundle

This folder is **fully managed** by the MJ Claude Pack. Every file in here
is regenerated when you run `mj update:claude`, so any hand-edits will be
lost.

If you need to add your own guidance for Claude, edit the section below the
`<!-- MJ-MANAGED:CLAUDE-PACK END -->` marker in your repo-root `CLAUDE.md`
instead. That area is yours.

## What's in here

| File | Purpose |
|---|---|
| `core.md`        | Cross-version MJ guidance, concatenated from `core/*.md` in the pack source |
| `v5.md`           | MJ v5-specific overlay |
| `VERSION`        | Pack semver (currently `5.1.0`) |
| `REMOTE.md`      | Pointers to the upstream pack source for self-update |
| `MANIFEST.json`  | sha256 checksum of every managed file in this pack |

Pack source: https://github.com/MemberJunction/MJ/tree/main/templates/claude-pack
