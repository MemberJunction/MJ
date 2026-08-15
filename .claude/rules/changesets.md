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

**Why the level is tied to the database at all** — and it is *not* so operators can read migrations
off the version number. That job belongs to `dbImpact`, which
[`plans/lts-process.md`](../../plans/lts-process.md) §12 calls "the honest replacement for smuggling
that signal into version digits".

It is the **Edge tuple grammar** (§3.1). Edge runs in changesets prerelease mode permanently and
bumps do not compound, so every Edge release is `X.Y.0-edge.N` — the tuple comes from the highest
level accumulated since the last certification. The invariant that has to hold is *migrations only
ever ship in a minor-or-higher-tupled release*, and a cycle whose changesets were all `patch` would
target `X.Y.Z+1` instead. Your `minor` is what keeps the accumulated tuple correct; it does **not**
visibly bump anything mid-stream.

Two consequences worth knowing before you reason about the number:

- **On a certified line, everything is a patch** — metadata migrations, CodeGen repairs and even
  schema migrations. The migration-⇒-minor rule is Edge-tuple grammar only, so `6.1.5` → `6.1.6`
  may well contain a migration. On a line the rule **inverts**: `patch` is not merely sufficient, it
  is the only correct level, because a `minor` there consumes the tuple the next certification is
  targeting. `check:changeset` works this out from **ancestry, not branch names** — a line tip being
  an ancestor of your HEAD means you are on that line, which holds for `fix/cve-…`-style backport
  branches and from a detached HEAD, neither of which a name check can see.
- **The number cannot carry per-package semver.** All ~300 packages share one `fixed` group, so a
  consumer already receives bumps driven entirely by packages they do not use.

## Why the accumulated level matters

**The direction that costs a release is a MISSING `minor`.** If a cycle contains a migration but no
changeset in it declares `minor`, the accumulated tuple stays `X.Y.Z+1` — and the invariant that
migrations only ever ship in a minor-or-higher-tupled release (`lts-process` §3.1/§12) is broken for
that whole cycle, not just your PR. It is also the failure that hides: it only shows up when no
other changeset in the release happens to carry a `minor`, so it fails rarely and unpredictably
rather than immediately.

**A stray extra `minor` is the cheap direction** — worth avoiding, but understand what it does and
does not do. Under permanent pre mode the stream is `X.Y.0-edge.N`; once the tuple is already minor,
another `minor` moves nothing, and every Edge release advances all ~300 packages to `edge.N+1`
regardless of anyone's level. So a stray `minor` produces **no additional version movement
mid-stream**. What it costs is meaning: it tells the next author that minor-for-a-feature is normal,
which is how the rule erodes.

**None of this applies on a certified line.** There the accumulated level is fixed at `patch`
whatever the branch carries, so neither direction above is available to get wrong — a migration
backport is a patch, and a `minor` is the error. If you arrived here from a backport, that bullet
above is the whole rule for you.

`.changeset/config.json` puts every MJ package in a single `fixed` group:

```json
"fixed": [["@memberjunction/*"]]
```

That is why the level is a *release-wide* fact rather than a per-package one: the highest bump in a
release decides the tuple for every package. On PR #3736 a changeset naming three packages `minor`
produced a changesets-bot table of **301 packages, all 301 Minor** — an accurate picture of the
group's scope, not of 301 version movements caused by those three entries.

**The bot shows you this, but it does not judge it.** Every PR gets a `🦋 Changeset detected`
comment listing each package and its `Minor`/`Patch` type — so the level is visible, inside a
collapsed `<details>` of ~301 near-identical rows. It renders whatever you chose; a wrong `minor`
and a correct `patch` produce the same-shaped table. Use it to confirm what you picked, not to
find out whether the pick was right.

## Do not pattern-match the neighbours

`.changeset/` holds many pending files at any time, in a mix of both levels, written against
branches whose contents you cannot see. **As of 2026-08, 41 of 87 pending files carry a `minor`** —
close to half, and spread across a dozen feature packages rather than concentrated in one careless
corner: `ai-core-plus` (10), `task-graph` (9), `server` (8), `integration-test-suite` (8),
`ng-conversations` (7), `core-entities` (7), against `core` at 7. Matching them is how this rule
gets broken. **Read this file, not the neighbours.**

Only changesets *added in your branch* are your responsibility; the gate judges those alone, so a
pre-existing file using a different level is not yours to fix.

## Check before you push

```bash
npm run check:changeset                          # picks the rule from the branch's ancestry
npm run check:changeset -- --base origin/lts/5   # force a line base (the inverted, patch-only rule)
npm run check:changeset:test                     # its own vitest suite
```

**Detection is only as good as the refs your clone has.** The line rule is inferred from ancestry,
so a clone with no `lts/*` refs — a shallow or single-branch checkout, which is `actions/checkout`'s
default — finds no line and falls back to the Edge rule. On a line PR that is silently the original
bug. **Anything automated must pass `--base` explicitly** (CI knows the PR's base ref, and an
explicit base is authoritative) or fetch the line refs first.

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
