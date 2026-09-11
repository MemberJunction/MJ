---
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
---

A transaction group whose rows are refused server-side no longer reports success.

Fixes [#4309](https://github.com/MemberJunction/MJ/issues/4309).

`BaseEntity.Save()` and `Delete()` report a logical refusal by **returning `false`** — they do not throw — and a refused row is never enrolled in the group, because `TransactionGroup.AddTransaction(...)` is reached only from inside `ProviderToUse.Save()`/`Delete()`. `ExecuteTransactionGroup` discarded that boolean, which produced two wrong outcomes:

- **Every row refused** — the server's group arrived at `Submit()` empty, took its legitimate "nothing to do" branch and returned `true`, and the resolver reported `Success: true` while serialising each entity's never-persisted **in-memory** state into `ResultsJSON`. The client's per-item test (`resultObject !== null`) could not tell that apart from a real row, so `Submit()` returned `true` to the caller.
- **Only some rows refused** — the survivors committed and the caller still saw unqualified success, with the refused rows silently gone.

Nothing was ever written that should not have been: the guards did their job, and this was a false success report rather than a security bypass. But an administrator performing a bulk operation the server refused in full was told the opposite of what happened, and every server-side `Validate()` guard inherited the behaviour.

**`@memberjunction/server`** — `ExecuteTransactionGroup` now captures what `Save()`/`Delete()` return and, when any row was refused, logs which ones and returns `PrepareReturnValue(false, …)` **before** `tg.Submit()`. Nothing has been written at that point (enrolment is deferral), so a partially-refused group fails whole rather than committing the survivors.

The predicate is the **return value**, not whether the group ended up empty: a row that is not dirty also fails to enrol and correctly returns `true`, and an empty group legitimately means "nothing to do" for a caller that enrolled nothing (pinned by `transaction-groups.TG1`). That is also why the fix belongs in the resolver rather than `TransactionGroupBase.Submit()` — the resolver is the only layer that still knows *which* row was refused and why.

**`@memberjunction/graphql-dataprovider`** — `GraphQLTransactionGroup.HandleSubmit` now copies the server's own failure result for each item onto that item's entity, so `BaseEntity.LatestResult` carries the reason a UI needs instead of the generic "Transaction group failed". It only ever *upgrades* the message: every item of a failed group reports `Success: false` (the provider registers an entity's result before enrolling the row and only flips it in the transaction callback), so a result with no message or errors is left alone.

No public interface changed, and no existing test expectation was modified.
