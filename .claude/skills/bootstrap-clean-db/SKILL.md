---
name: bootstrap-clean-db
description: Build a MemberJunction database from scratch on a private name — migrations, CodeGen, metadata, build, and the deterministic integration tier — so a branch is verified against a schema that came only from what the repo ships. Use when you need a clean-room verification, when a shared dev DB has drifted or been corrupted, before a release or certification, or whenever you need a database no other agent is using.
---

# Bootstrap a clean MemberJunction database

Builds a working system from **migrations + metadata alone**, on a database name nobody else is
using, and verifies it end to end.

## Why this exists

Two different reasons, and it is worth knowing which one you are here for.

**Verification.** A long-lived dev database accumulates state from every session that touched it —
`EntityField` rows a CodeGen run created, metadata a `sync push` seeded, columns from a migration
someone else applied. That state can *hide* a defect: the classic case is a migration that looks
complete locally because your database already had the row it forgot to create, and which then fails
CI, at the `mj sync push` step, long after the PR looked green. A from-scratch build is the only
thing that proves the repo can produce a working system from what it actually ships.

**Isolation.** Per [`migrations/CLAUDE.md`](../../../migrations/CLAUDE.md), one database per agent —
a git worktree isolates the filesystem, not the database. This skill is the cheap way to comply
instead of borrowing whatever is in `.env`.

---

## Step 0 — Claim a database name nobody else will guess

Never reuse a name that reads like a shared environment (`MJ_6_1_0`, `MJ_DEV`). Make ownership
obvious from the name alone, so another agent inspecting the server can see it is spoken for:

```
MJ_<version>_<purpose>_<branch-or-ticket>       e.g. MJ_6_1_0_CLEAN_phase5a
```

Point a **local** env at it — do not edit the shared `.env` in place, because another session may be
reading it:

```bash
cp .env .env.clean
# edit .env.clean: DB_DATABASE=MJ_6_1_0_CLEAN_phase5a
```

Every command below runs with that file. If the tooling only reads `.env`, swap deliberately and
swap back when you are done — and say so to the user, because for that window the shared file points
somewhere new.

Create the empty database (Skyway/Flyway baselines a blank one automatically):

```sql
CREATE DATABASE [MJ_6_1_0_CLEAN_phase5a];
```

---

## Step 1 — The four-step ordering (this order is not negotiable)

```bash
mj migrate                          # 1. baseline + every migration, in filename order
mj codegen --skipfiles              # 2. DB SIDE ONLY
mj sync push --dir=metadata --ci    # 3. seed metadata; @lookup refs now resolve
mj codegen --skipdb                 # 4. FILES ONLY, from complete metadata
```

**Step 2 must be `--skipfiles`, and this is the step that bites.** File generation reads whatever
metadata the database currently holds. A freshly migrated database has **no seeded metadata yet** —
those are the rows step 3 is about to supply. A *full* `mj codegen` here regenerates
`packages/MJCoreEntities/src/generated/remote_operations.ts` from the empty set and **deletes every
remote-operation class from it**. That file is a build input for the CLI itself, so the next
`mj sync push` dies at import time:

```
SyntaxError: The requested module '@memberjunction/core-entities'
does not provide an export named '…Operation'
```

…and you cannot run step 3 to fix it without first restoring the file
(`git show HEAD:<path> > <path>`) and rebuilding MJCoreEntities. `--skipfiles` avoids the whole trap.

**Step 3 cannot run before step 2** on a fresh database. Metadata that declares a JSONType on a new
field resolves it with `@lookup:MJ: Entity Fields.EntityID=…&Name=YourColumn`, and CodeGen is what
creates that `EntityField` row. Running it early fails with `Lookup failed: No record found` — which
is not a metadata bug, it means CodeGen has not run yet.

---

## Step 2 — Build and verify

```bash
pnpm run build
```

Check the **exit code**, not a grep of the log. `tsc` writes ANSI colour codes between words, so
`grep "error TS"` silently matches nothing on a log that is full of errors:

```bash
pnpm run build > /tmp/build.log 2>&1; echo "EXIT=$?"
```

Then the deterministic integration tier — the mutation flag matters, because mutation-class bundles
skip silently without it and a green run then means less than it appears:

```bash
MJ_INTEGRATION_TEST=1 RUN_MUTATION_TESTS=1 mj test suite "Integration Tests — Deterministic"
```

Report the **real numbers** — `N/M passed`, plus the name of anything that failed. "Tests pass" is
not a result.

---

## Step 3 — Read the diff, do not just discard it

A clean bootstrap regenerates files. **The diff is the most valuable output of this skill** — it is
the repo telling you what your working database had been hiding. Look before reverting:

- **Generated TypeScript that shrinks.** A property disappearing from an entity class means the
  database you were using had a field the repo's migrations do not create. Find out which one won.
- **`IsNameField` differences.** These drive the denormalized view columns. A field flagged here but
  not on your old database (or vice versa) explains a whole class of `Invalid column name` errors —
  see the 2026-08-08 incident in [`migrations/CLAUDE.md`](../../../migrations/CLAUDE.md).
- **`CodeGen_Run_*.sql`.** Append it to the migration that caused it (50+ blank lines, then the
  do-not-edit block) and delete the standalone file. **If your change had no schema DDL, there is no
  migration to append to — delete the file rather than committing dead SQL.**
- **`sync` block write-back** in `metadata/**/*.json` belongs to the release-time consolidated sync.
  Restore those lines before committing: `git show HEAD:<path> > <path>`.

> ⚠️ That restore idiom truncates the target **before** `git show` runs. On a file that is *new*
> (untracked), it leaves you with an empty file and no error. Never loop it over a mixed list of
> tracked and untracked paths.

---

## Step 4 — Optional: run the app against it

```bash
pnpm run start:api        # port 4000
pnpm run start:explorer   # port 4201
```

Wait until each **actually accepts a connection** before declaring it up. `EADDRINUSE` means someone
else's server owns that port — it is not evidence that yours is running, and a one-off `200`/`401`
proves a socket answered once, not that a process is alive:

```bash
until curl -s -o /dev/null --max-time 3 http://localhost:4000/; do sleep 5; done; echo UP
```

---

## Step 5 — Tear down, or hand over

A clean database is worth keeping while the branch is in review, and worth deleting after. Either
way **tell the user which**, so nobody inherits a stale database that looks authoritative.

If you hand it to someone, hand over the name and the fact that it is clean-room — its value is
entirely in its provenance.

---

## Checklist

- [ ] Database name is private and self-describing; no other session is using it
- [ ] `.env` change was made in a copy, or swapped back and disclosed
- [ ] Four steps ran in order, step 2 with `--skipfiles`, step 4 with `--skipdb`
- [ ] Build verified by **exit code**
- [ ] Integration tier run with `RUN_MUTATION_TESTS=1`; real counts reported
- [ ] Regenerated diff **read**, not blanket-reverted; `CodeGen_Run_*.sql` appended or deleted
- [ ] `sync` block write-back restored
- [ ] User told whether the database was kept or dropped
