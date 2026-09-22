# MJ#4503 — repairing Metadata_Sync collisions without amending shipped migrations

**Date:** 2026-09-21
**Issue:** [#4503](https://github.com/MemberJunction/MJ/issues/4503)
**Supersedes:** the approach in #4524 (closed unmerged)

## Problem

The consolidated `Metadata_Sync` migrations are recordings of `mj sync push`. Each replays an
unguarded `spCreate<X> @ID = '<fixed GUID>'`. On a database where a push created those rows before
the migration chain caught up, the migration hits a primary-key violation on a row that already
holds the recorded content, and the upgrade dies.

Observed on CDP stage during the 5.51.2 → 6.1.x upgrade. One row; the operator deleted it by hand
and all 63 migrations then applied.

Because the failing migration halts the chain, **nothing ordered after it can repair it.** A plain
forward migration cannot fix this.

## Constraint

**Amending a migration that is in a published release is not permitted.**

The eight `Metadata_Sync` files are `v6.1.x` and shipped in 6.1.0 (2026-09-14), 6.1.1 and 6.1.2.
#4524 proposed rewriting all eight to be create-or-update; that PR was closed on this constraint.

Worth recording why the constraint is not self-enforcing today: `mj migrate` no longer runs Flyway.
It runs Skyway, which defines `ChecksumMismatchError` and never throws it — checksum comparison
lives only in `Validate()`/`Repair()`, which nothing calls. The protection that historically made
amendment fail loudly is gone, so the rule now depends on review rather than tooling.

## Design

Detection is **reactive**; repair is **explicit**. Nothing mutates without the operator asking.

```
mj migrate
  └─ skyway.Migrate() → PK violation on a Metadata_Sync spCreate
     └─ printMigrationError() recognises the signature
        └─ reports: entity, colliding ID, migration filename, cause, repair command
                                    ↓
mj migrate repair --id <guid> [--entity <name>]
  └─ confirms, deletes that row, reports what it deleted
                                    ↓
mj migrate  →  the migration creates it canonically  →  converged
```

The end state equals the release's content, which is the same convergence #4524 wanted — reached
without touching a shipped migration.

### Components

**1. Recognizer — `packages/MJCLI/src/commands/migrate/index.ts`**

`printMigrationError` is the single chokepoint: both failure paths (populated `result.Details`, and
the `printCallbackErrors` fallback) funnel through it, and it already receives the migration's
filename, version and description.

It augments the output only when **all** of the following hold:

- the error is a primary-key violation
- the failing migration matches `*__Metadata_Sync*.sql`
- a fixed GUID is recoverable from the error text or the failing statement

Anything short of that prints the raw error exactly as today.

The GUID is recoverable because SQL Server includes it. Confirmed from a real captured error in
`plans/complete/metadata-sync-constraint-error-diagnostics.md`:

```
Violation of UNIQUE KEY constraint 'UQ_AIPromptModel_Prompt_Model_Vendor_ConfigID'.
Cannot insert duplicate key in object '__mj.AIPromptModel'.
The duplicate key value is (d7ffc613-4b45-4c55-a8b9-d3cd246ca7fe, ...).
```

`The duplicate key value is (...)` is the field the recognizer reads. That capture is a UNIQUE
violation from `mj sync push` rather than the PK violation from `mj migrate`, so the exact string
must be re-confirmed against a real failure during implementation — but the shape, and the fact that
SQL Server names the offending value at all, is established.

**The asymmetry is deliberate.** A missed recognition costs a confusing error message. A false one
tells an operator to delete a row they should keep. It fails toward silence.

This is the only change to the migrate path, and it is additive — migration execution is untouched.

**2. `mj migrate repair` — `packages/MJCLI/src/commands/migrate/repair.ts`**

A new subcommand alongside the four that exist (`convert`, `create`, `rebake`, `usage`).

- deletes the named row, prints what it deleted, and says to re-run `mj migrate`
- prompts before deleting, with `--yes` to skip for scripted use — the command is the consent, but
  the operation is irreversible
- **refuses rather than guesses**: unknown ID → refuse; row already absent → no-op and say so; ID
  present but in an entity the failing migration does not touch → refuse
- never partially completes: no connection, insufficient rights, or an FK-protected row all report
  and exit non-zero

### One collision per cycle

Reactive detection surfaces one collision per `mj migrate` run, so N collisions need N cycles.

Accepted deliberately. CDP stage had exactly one. #4524's analysis put the theoretical upper bound
at 375, but that is an upper bound on rows a push *could* have planted, not a prediction — which
rows a database carries ahead of the chain is operator-dependent and unknowable from the repo.

A bounded loop beats inference. If the realistic number ever proves large, `repair --sweep` (using
`metadata/**` primary keys as the source of truth rather than parsing SQL) is the escape hatch, and
is deliberately **not** built now.

## Testing

**Unit** — the recognizer against the *real* SQL Server error string captured from CDP's failure,
not an invented one; plus each negative case above. `repair`'s refusal paths.

**End-to-end** — re-land #4524's `push-before-migrate` CI lane: migrate to just before the
colliding migration, push, finish migrating. It is recoverable from `origin/fix/4503-metadata-sync-guards`
(`58e0b6925`), where it survives intact.

This is **part of this work, not a follow-up.** It is policy-neutral — it touches no shipped
migration — and it is the only thing that demonstrates the bug is actually fixed. Shipping the fix
on unit coverage alone is how #4477 escaped in the first place.

The lane must fail without the fix and pass with it; a lane that has never been observed red proves
nothing.

## Out of scope

- **No guard in `mj sync push`** to stop future planting. Separate concern.
- **No change to any migration**, shipped or otherwise.
- **No general-purpose SQL parsing.** #4524 spent three review rounds hardening a recognizer for
  T-SQL call grammar; this design avoids needing one.
- **No preservation of local edits** to a colliding row. The delete discards them — the same
  behaviour change #4524 disclosed, and the reason `repair` confirms before acting.
- **GUID → human-readable name resolution.** `plans/complete/metadata-sync-constraint-error-diagnostics.md`
  proposed exactly this for `mj sync push` (show `Prompt: "…", Model: "…"` instead of raw GUIDs). No
  shared helper shipped from it, so this recognizer reports the raw ID. If such a helper is ever
  built, this is a natural first consumer.
- **The `migrations/CLAUDE.md` rule itself.** That the constraint is unwritten and unenforced is a
  real gap, but it is a governance decision for the repo owner, not part of this fix.
