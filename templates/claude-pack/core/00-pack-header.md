# MemberJunction Project Guidance

This file is loaded by Claude Code at session start so Claude has the context
it needs to write idiomatic MemberJunction code in your project.

It's part of the **MJ Claude Pack** — a curated bundle of MJ-specific
guidance, slash commands, and skills shipped alongside every MJ install.

## What this pack gives you

- **`CLAUDE.md`** at your repo root — the file Claude reads first. Imports
  the MJ guidance below, leaves a free section for your own project notes.
- **`.claude/mj/`** — the managed bundle (this folder). Regenerated on update,
  not meant to be hand-edited.
- **`.claude/commands/`** — slash commands tuned for MJ work (`/commit`,
  `/new-branch`, `/create-pr`, the speckit suite, …).
- **`.claude/skills/`** — opt-in skills like `playwright-cli` for browser testing.
- **`.claude/settings.json`** — a small permissions allowlist so Claude doesn't
  have to ask permission to run `npm run build` every time.

## Keeping the pack fresh

The pack identifies its own version. To pull the latest:

```bash
mj update:claude --check    # see if an update is available
mj update:claude            # apply the update (managed block + .claude/mj/)
```

The MJ-managed block in your `CLAUDE.md` and the entire `.claude/mj/` folder
are regenerated on update. Your own notes under `## Project notes` and any
slash commands you've customized are preserved.

## How to add your own guidance

Below the `<!-- MJ-MANAGED:CLAUDE-PACK END -->` marker in `CLAUDE.md` is a
free section. Add project-specific instructions there:

- Team naming conventions specific to your codebase
- Pointers to your internal docs or runbooks
- Domain-specific guidance Claude can't infer from the code

Anything in that section is yours forever — `mj update:claude` won't touch it.

## Where to find help

- **MJ docs** — https://docs.memberjunction.org
- **GitHub** — https://github.com/MemberJunction/MJ
- **Issues / questions** — https://github.com/MemberJunction/MJ/issues
- **The pack source** — https://github.com/MemberJunction/MJ/tree/main/templates/claude-pack
