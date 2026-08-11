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
| `minor` | The branch touches the **database**: a versioned migration (`migrations/vN/*.sql`), a **repeatable** migration (`migrations/R__*.sql`), or anything under **`metadata/`** |
| `patch` | Everything else — TypeScript, tests, docs, guides, CI, refactors |
| `major` | **Never** without explicit user approval |

**Changed counts, not just added.** Modifying an existing migration is as much a database change as
adding one, and a repeatable script is only ever modified — Flyway re-runs it on every deploy. (The
rule this replaces said "NEW migration files ADDED", which missed both cases.)

It reads as an equivalence and is checked as one, in both directions. A `minor` with no database
change over-bumps the workspace; a database change with only `patch` entries **under**-bumps it,
which is worse — a real schema change ships below the level the release train expects, and it only
misbehaves when no other changeset in that release happens to carry a `minor`.

**Metadata counts as a migration** because it becomes one. A PR contributes declarative JSON only;
at release the build engineer's `mj sync push` turns every accumulated metadata edit into one
consolidated metadata-sync migration. The database change is real — it is just deferred. See
[`metadata/CLAUDE.md`](../../metadata/CLAUDE.md) §1b.

The level is about **what the branch does to the database**, not how big or user-visible the
feature is. A 2,000-line feature with no migration and no metadata is a `patch`. A one-line
metadata edit is a `minor`.

**This is a release-train convention, not semver** — deliberately. Because every package shares one
`fixed` group, all ~300 move to the same version whether or not they changed, so the number cannot
carry per-package semver meaning; that possibility ended when the fixed group was adopted. Given it
cannot mean "new API", it is put to work meaning something MJ actually needs: *this release requires
you to run migrations*. The operator-facing half of that contract is in
[`VERSIONING.md`](../../VERSIONING.md) — a signal nobody outside this file can read is not a signal.

## Why one stray `minor` matters

`.changeset/config.json` puts every MJ package in a single `fixed` group:

```json
"fixed": [["@memberjunction/*"]]
```

So the **highest bump in a release decides the version of every package**. Measured, not theorised:
on PR #3736 a changeset naming three packages `minor` produced a changesets-bot table of
**301 packages, all 301 Minor**. Three entries, 301 version bumps.

**The bot shows you this, but it does not judge it.** Every PR gets a `🦋 Changeset detected`
comment listing each package and its `Minor`/`Patch` type — so the level is visible, inside a
collapsed `<details>` of ~301 near-identical rows. It renders whatever you chose; a wrong `minor`
and a correct `patch` produce the same-shaped table. Use it to confirm what you picked, not to
find out whether the pick was right.

## Do not pattern-match the neighbours

`.changeset/` holds many pending files at any time, in a mix of both levels, written against
branches whose contents you cannot see. **As of 2026-08, 40 of 86 pending files carry a `minor`** —
close to half, and spread across a dozen feature packages rather than concentrated in one careless
corner: `ai-core-plus` (10), `task-graph` (9), `server` (8), `integration-test-suite` (8),
`ng-conversations` (7), `core-entities` (7), against `core` at 7. Matching them is how this rule
gets broken. **Read this file, not the neighbours.**

Only changesets *added in your branch* are your responsibility; the gate judges those alone, so a
pre-existing file using a different level is not yours to fix.

## Check before you push

```bash
npm run check:changeset          # judges the changesets THIS branch adds, vs origin/next
npm run check:changeset:test     # its own vitest suite
```

**Nothing enforces this in CI, by maintainer decision** — no PR fails on a wrong bump level. This
rule and that command are the only checks, so run it whenever you add a changeset.

Recorded so it is not re-litigated from a bad argument: the reason is *not* that the changesets bot
covers it. It does not — see above, it displays the level without judging it. The reason is that the
maintainer chose to start with guidance rather than a gate, and to see whether the rule landing
where it actually loads is enough on its own. The gate exists, exits non-zero with an actionable
message, and has 15 passing tests, so wiring it into CI later is a workflow file and nothing more —
`continue-on-error: true` first if a soak period is wanted.

**It also does not check that a database branch declares a changeset at all** — only the level of the
ones it declares. A DB branch with no changeset passes here.

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
