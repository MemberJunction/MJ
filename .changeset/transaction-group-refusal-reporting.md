---
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/integration-test-suite": patch
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

**`@memberjunction/server`** — a second fix on the same path: `ExecuteTransactionGroup` called the **async** `entity.GetDataObject()` without `await` when assembling a `Delete` item's result, so `PrepareReturnValue` serialised a `Promise` and **every** `Delete` in a transaction group returned `ResultsJSON: ["{}"]` — successful ones included. Neither `tsc` nor a floating-promise lint could see it, because the array is typed `any[]` and pushing a promise is not a floating promise. The empty payload also reached `GraphQLDataProvider`'s own `Delete` transaction callback, which validates a commit with `pk.Value !== results[pk.FieldName]`; against `{}` every key mismatched, so a delete that **did** commit reported `Transaction failed to commit` on its entity. Deletes now report the row they removed.

**`@memberjunction/ng-explorer-settings`** — the reason now reaches the operator, which is what #4309's *"Verify by"* asks for: *"step 5 must now show an error naming the refused user(s) and the rule."* Both Explorer surfaces that submit `MJ: User Roles` transaction groups — bulk **Assign Role** and the single-user dialog — took the `!await tg.Submit()` branch and threw a hardcoded "all changes have been rolled back", never reading the `LatestResult` the provider had just populated. They now keep their enrolled rows and read the server's reason back off them, so the screen names the refused user and the rule it broke. A shared `serverRefusalReasons` helper holds the one piece of knowledge both need, including which messages are the provider's own placeholders rather than a reason worth showing.

**`@memberjunction/integration-test-suite`** — `transaction-groups.TG6`'s third assertion could never fail. It searched the joined `ErrorMessages` for the substring `name` to prove the refusal reason had travelled, but each entry is a whole serialized `BaseEntityResult`, which always carries `OriginalValues: [{FieldName, …}]` — and `"FieldName"` lowercases to `"fieldname"`, which contains `"name"`. Strip every reason from the payload and the check still passed. It now extracts only the reason-bearing fields (`Message`, `Error`, `Errors[].Message`) and asserts both that a reason exists at all and that it names the offending column.

No public interface changed. One existing test expectation did change, deliberately: `TransactionGroupResolver.refusals.test.ts`'s fake declared `GetDataObject()` **synchronous**, diverging from the real `Promise<any>` signature — which is exactly why the suite could not see the missing `await`. The fake now matches production.
