# Generate Changeset

Create a changeset file for the current branch's changes following MemberJunction's versioning conventions.

## Instructions

1. **Check for new migration files:**
   - **CRITICAL**: Only check for migrations that were ADDED IN THIS BRANCH
   - Compare ALL `migrations/` version directories to find NEW files added in current branch commits
   - Run: `git diff next...HEAD --name-only | grep "^migrations/v[0-9]\\+/.*\\.sql$"`
   - **IMPORTANT**: Use `next` branch as baseline (NOT `main`) to avoid counting migrations from other merged branches
   - If the command returns any files, these are NEW migrations added in this branch
   - Only if NEW migrations exist in THIS BRANCH, add `"@memberjunction/core": minor` to the changeset
   - If the command returns empty (no new migration files), do NOT include core in the changeset

2. **Find modified packages:**
   - Compare against `next` branch for TypeScript changes
   - Run: `git diff next...HEAD --name-only | grep "^packages/" | cut -d'/' -f2 | sort -u`
   - For each modified package directory, read its `package.json` to get the exact package name
   - All modified packages get `patch` version bumps (unless it's @memberjunction/core with a minor bump from migrations)

3. **Analyze commit messages:**
   - Run: `git log next...HEAD --oneline --no-merges`
   - Use commit messages to generate a concise, descriptive summary (1-3 sentences)

4. **Create changeset file:**
   - Generate a random filename in format: `adjective-noun-verb.md` (e.g., `happy-dragons-fly.md`)
   - Create file in `.changeset/` directory
   - Use this exact format:

```markdown
---
"@memberjunction/core": minor
"@memberjunction/package-name": patch
"@memberjunction/another-package": patch
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

- **Minor bump**: the branch changes the DATABASE — it adds a migration under a `migrations/vN`
  folder, **or** it changes anything under `metadata/`. Metadata counts because it BECOMES a
  migration: the build engineer's release-time `mj sync push` turns accumulated metadata edits
  into one consolidated metadata-sync migration.
  - Check: `git diff origin/next...HEAD --name-only | grep -E "^(migrations/v[0-9]+/.*\\.sql|metadata/)"`
  - Any hit → `minor` is correct for the packages this branch changed.
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
- If no migrations AND no package changes, ask the user what changed
- **ALWAYS use `next` branch as baseline** for BOTH migration and package comparisons
- This ensures you only count changes added in the current branch, not changes from other branches

## Example Output

If there are new migrations and changes to DBAutoDoc and MJCLI:

```markdown
---
"@memberjunction/core": minor
"@memberjunction/db-auto-doc": patch
"@memberjunction/cli": patch
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
