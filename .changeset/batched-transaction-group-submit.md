---
"@memberjunction/core": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/postgresql-dataprovider": patch
---

A transaction group can send its items as ONE round trip.

`TransactionGroupBase` gains an opt-in `BatchedSubmit` flag (default false — existing callers
are byte-for-byte unaffected). When set, both providers execute a variable-free group's items
as a single multi-statement round trip instead of one round trip per item: the same statements,
in the same order, inside the same transaction, with per-item results still returned.

Why this matters: the sequential submit is ATOMIC but not BATCHED. Each item's generated CRUD
procedure call is its own wire hop, and on a measured live sync the server-side execution was
~0.3ms inside a per-statement wall cost two orders of magnitude larger — so a 100-item group
spent essentially all of its time waiting on round trips the SQL never needed. Batching the
wire is the entire speed of a direct-write path with none of its costs: every statement is
still the generated procedure, so validation, Record Changes and save events are untouched.

Result mapping cannot assume one recordset per item — a statement that returns no rows produces
NO recordset, so a positional zip silently drifts and attributes row A's identity to row B.
Each item is therefore preceded by a sentinel SELECT of its index; recordsets between sentinel
k and k+1 belong to item k. Covered by tests on both providers, including the empty-middle-item
case that breaks positional mapping.

SQL Server renumbers per-item `?` placeholders into one global `@p` namespace (one request
carries one parameter namespace; two items both rendering `@p0` would overwrite each other).

PostgreSQL cannot carry `$N` parameters in multi-statement text (extended-protocol limitation),
so parameter values are inlined through the driver's own `escapeLiteral` — never a hand-rolled
escaper — and only for values with an unambiguous literal form (string, finite number, boolean,
null, Date; plain objects are already serialized by the parameter processor before the gate).
If any value falls outside that set, or the client exposes no `escapeLiteral`, the WHOLE group
falls back to the sequential path: correctness first, batching second.

Groups that use `Variables` have cross-item dependencies (a later item's SQL is re-rendered
from an earlier item's output) and always run sequentially regardless of the flag — a single
round trip cannot feed one statement's output into the next statement's client-side rendering.

Failure semantics are unchanged: a batch failure rolls back and throws exactly as the serial
path's first-error rollback does, and per-item attribution of a poison row remains the caller's
degradation path (re-apply individually), as before.
