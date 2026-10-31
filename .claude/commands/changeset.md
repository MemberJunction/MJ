# Generate Changeset

Create a changeset file for the current branch's changes following MemberJunction's versioning conventions.

## Instructions

1. **Check for database changes:**
   - A database change is any migration file the branch adds **or modifies** (versioned
     `migrations/vN/*.sql` or repeatable `migrations/R__*.sql`), or anything under `metadata/`
     except its `CLAUDE.md` / `README.md`
   - Run: `git diff origin/next...HEAD --name-only | grep -E "^(migrations/.*\\.sql|metadata/)" | grep -vE "^metadata/(CLAUDE|README)\\.md$"`
   - **IMPORTANT**: Use `origin/next` as baseline (NOT `main`) to avoid counting migrations from other merged branches
   - Any hit → the branch's level is `minor` and `"@memberjunction/core"` goes in the changeset
   - No hit → the level is `patch` and `core` is listed only if its own files changed

2. **Find modified packages:**
   - Map each changed file under `packages/` to its **nearest `package.json`** — not the first
     folder under `packages/`, which for nested packages is `Angular`, `Actions` or `TestingFramework`
   - Run:
     ```bash
     git diff --name-only origin/next...HEAD -- packages/ | while read -r f; do
       d=$(dirname "$f")
       while [ "$d" != "." ] && [ ! -f "$d/package.json" ]; do d=$(dirname "$d"); done
       [ -f "$d/package.json" ] && node -p "require('./$d/package.json').name"
     done | sort -u
     ```
   - List **every** package it prints, generated manifests and test-only changes included — the list
     decides whose `CHANGELOG.md` carries the entry (see
     [Which packages to list](../rules/changesets.md#which-packages-to-list))
   - Every listed package gets the branch's level from step 1 — all `minor` or all `patch`
   - No database change and no package files (docs, guides, CI, `.claude/` only) → no changeset

3. **Analyze commit messages:**
   - Run: `git log origin/next...HEAD --oneline --no-merges`
   - Use commit messages to generate a concise, descriptive summary (1-3 sentences)

4. **Create changeset file:**
   - Generate a random filename in format: `adjective-noun-verb.md` (e.g., `happy-dragons-fly.md`)
   - Create file in `.changeset/` directory
   - Use this exact format:

```markdown
---
"@memberjunction/core": minor
"@memberjunction/package-name": minor
"@memberjunction/another-package": minor
---

Summary of changes based on commit messages
```

5. **Commit the changeset:**
   - Stage the new changeset file: `git add .changeset/<filename>.md`
   - Create a commit with message: `docs(changeset): <summary>`
   - Use the same summary text from the changeset file
   - Example: `git commit -m "docs(changeset): Add sample query generation feature with configurable maxTokens"`

## Versioning Rules

The full rule, with its rationale, lives in [`.claude/rules/changesets.md`](../rules/changesets.md)
and can be self-checked with `npm run check:changeset` (local only — nothing gates it in CI). In short:

- **Minor bump**: the branch changes the DATABASE — it adds or modifies a migration, **or** it
  changes anything under `metadata/`. Metadata counts because it BECOMES a
  migration: the build engineer's release-time `mj sync push` turns accumulated metadata edits
  into one consolidated metadata-sync migration.
- **Patch bump**: everything else — TypeScript, tests, docs, guides, CI, refactors. Size and
  user-visibility are irrelevant; a 2,000-line feature with no migration and no metadata is a patch.
- **Major bump**: NEVER use without explicit user approval (breaking changes)

Verify before committing:

```bash
npm run check:changeset
```

## Important Notes

- Never use the interactive `npx changeset add` command (has TTY issues in automated environments)
- Always create changeset files manually
- Package names must match exactly what's in each package's `package.json` (e.g., `DBAutoDoc` → `@memberjunction/db-auto-doc`)
- If no database changes AND no package changes, the branch needs no changeset
- **Use `next` as the baseline** for BOTH migration and package comparisons — *unless the branch is
  a backport to a certified line*, in which case the baseline is that line (`origin/lts/5`, …) and
  the rule inverts to patch-only. `npm run check:changeset` works this out from ancestry; see
  [`.claude/rules/changesets.md`](../rules/changesets.md)
- This ensures you only count changes added in the current branch, not changes from other branches

## Example Output

If there are new migrations and changes to DBAutoDoc and MJCLI:

```markdown
---
"@memberjunction/core": minor
"@memberjunction/db-auto-doc": minor
"@memberjunction/cli": minor
---

Add sample query generation feature with configurable maxTokens and update MJCLI commands for DBAutoDoc
```

If there are only code changes (no migrations):

```markdown
---
"@memberjunction/server": patch
"@memberjunction/cli": patch
---

Fix config validation errors for commands that don't need database connection
```
