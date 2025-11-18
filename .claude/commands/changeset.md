# Generate Changeset

Create a changeset file for the current branch's changes following MemberJunction's versioning conventions.

## Instructions

1. **Check for new migration files:**
   - Compare `migrations/v2/` directory between `main` branch and current branch
   - Run: `git diff main...HEAD --name-only | grep "^migrations/v2/.*\.sql$"`
   - If there are new `.sql` migration files, this triggers a `minor` version bump
   - If migrations exist, add `"@memberjunction/core": minor` to the changeset

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

- **Minor bump**: ONLY when new migration files exist in `migrations/v2/` (applied to `@memberjunction/core`)
- **Patch bump**: All TypeScript code changes, bug fixes, documentation updates
- **Major bump**: NEVER use without explicit user approval (breaking changes)

## Important Notes

- Never use the interactive `npx changeset add` command (has TTY issues in automated environments)
- Always create changeset files manually
- Package names must match exactly what's in each package's `package.json` (e.g., `DBAutoDoc` → `@memberjunction/db-auto-doc`)
- If no migrations AND no package changes, ask the user what changed
- Use `main` branch for migration file comparisons (latest built version)
- Use `next` branch for TypeScript package comparisons (current development baseline)

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
