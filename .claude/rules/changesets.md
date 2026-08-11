---
paths:
  - ".changeset/**"
---

# Changeset bump levels

Loads when you open anything under `.changeset/`. The rule is short; the reason it needs its own
file is that **you cannot infer it from the neighbouring files**.

---

## The rule

| Level | When |
|---|---|
| `minor` | The branch adds a **migration** (`migrations/vN/*.sql`) **or** changes **`metadata/`** |
| `patch` | Everything else — TypeScript, tests, docs, guides, CI, refactors |
| `major` | **Never** without explicit user approval |

**Metadata counts as a migration** because it becomes one. A PR contributes declarative JSON only;
at release the build engineer's `mj sync push` turns every accumulated metadata edit into one
consolidated metadata-sync migration. The database change is real — it is just deferred. See
[`metadata/CLAUDE.md`](../../metadata/CLAUDE.md) §1b.

The level is about **what the branch does to the database**, not how big or user-visible the
feature is. A 2,000-line feature with no migration and no metadata is a `patch`. A one-line
metadata edit is a `minor`.

## Why one stray `minor` matters

`.changeset/config.json` puts every MJ package in a single `fixed` group:

```json
"fixed": [["@memberjunction/*"]]
```

So the **highest bump in a release decides the version of all ~294 packages**. A `minor` on one
package nobody touched moves the entire workspace. Nothing in the changesets CLI questions it, and
it is invisible in review unless someone specifically looks.

## Do not pattern-match the neighbours

`.changeset/` holds many pending files at any time, in a mix of both levels, written against
branches whose contents you cannot see. Roughly a third currently use `minor`, including on
feature packages — matching them is how this rule gets broken. **Read this file, not the
neighbours.**

Only changesets *added in your branch* are your responsibility; the gate judges those alone, so a
pre-existing file using a different level is not yours to fix.

## Check before you push

```bash
npm run check:changeset          # judges the changesets THIS branch adds, vs origin/next
npm run check:changeset:test     # its own vitest suite
```

**Nothing enforces this in CI** — no PR fails on a wrong bump level. This rule and that command
are the only checks, so run it whenever you add a changeset.

## Format

```markdown
---
"@memberjunction/ai-elevenlabs": patch
"@memberjunction/ai-agents": patch
---

What changed and why, in a few sentences. This becomes the changelog entry.
```

Package names must match each package's `package.json` exactly (`DBAutoDoc` →
`@memberjunction/db-auto-doc`). Never run `npx changeset add` — it has TTY problems in automated
environments; write the file directly.

Related: [`.claude/commands/changeset.md`](../commands/changeset.md) generates one for the current
branch.
