# Optimistic-UI Save Pattern (Angular)

> **Status: proposal for review.** This guide documents a pattern several Angular surfaces have
> already adopted independently, plus a new framework hook (`EntitySaveOptions.OnValidated`) that
> generalizes it. It includes **two implementations of the same change — generic vs. inline — so
> reviewers can compare and pick one** before the pattern is swept across the codebase. Nothing
> here changes server-side behavior, and `BaseEntity.Save()`'s contract is unchanged (the new hook
> is an optional, additive callback).

## The problem: cumulative perceived latency

On chat, list, and settings surfaces the user performs the same small action dozens of times a
session — send a message, pin it, rate it, add a tag chip, toggle a setting. The common code shape is:

```typescript
entity.SomeField = newValue;
await entity.Save();          // <-- UI is frozen here for a full DB round-trip
this.list = [...this.list, entity];   // render only AFTER the server replies
```

Each `await` is one network round-trip of dead time before the user sees their own action. Individually
it's 200–800 ms; across a session it's the single most-felt sluggishness on these surfaces. The work is
already done client-side the instant the user clicks — we're just *waiting to show it*.

## What already makes this safe

No new method and no change to `Save()`'s return contract are needed for the core pattern:

1. **`NewRecord()` assigns the PK up front.** For a single-column `uniqueidentifier` primary key,
   [`BaseEntity.NewRecord()`](../packages/MJCore/src/generic/baseEntity.ts) generates and sets the UUID
   immediately — so the caller has a stable `entity.ID` **before** `Save()` is ever called, and can render
   a real, addressable row optimistically.
2. **`Save()` returns `Promise<boolean>`** — fire it, render, then react to the boolean to confirm or roll back.
3. **`Revert()`** restores every dirty field to its `OldValue` — the UPDATE rollback path.
4. **For CREATE rollback**, the parent just removes the entity from its display collection.

## The new hook: `EntitySaveOptions.OnValidated` (the generic option)

Inline Pattern A (below) renders *before* `Save()` runs validation, so an invalid entity flickers onto
the screen and then rolls back. The `OnValidated` callback closes that gap: it fires **after** all
pre-flight checks pass (`Validate()`, `ValidateAsync()`, and PreSave hooks) but **before** the database
write — so the UI renders only once the change is known to be valid, while still beating the network round-trip.

```typescript
// EntitySaveOptions
OnValidated?: (entity: unknown) => void;
```

- Fires exactly once, only when the save will proceed (skipped for not-dirty / `ReplayOnly` / failed validation).
- Errors thrown by the callback are swallowed and logged — a UI bug can never abort the persistence it accompanies.
- Implemented in [`BaseEntity._InnerSave`](../packages/MJCore/src/generic/baseEntity.ts); covered by
  [`baseEntity.onValidated.test.ts`](../packages/MJCore/src/__tests__/baseEntity.onValidated.test.ts).

---

## The decision rule (apply per callsite)

For each `await x.Save()` in `packages/Angular/**`, ask in order. **The first match wins.**

0. **Is the PK a single-column `uniqueidentifier`?** If not (int-identity or composite PK), there is no
   stable ID before save → **do not** optimistically render a CREATE with a real key. KEEP AWAIT.
1. **Is the entity registered with a `TransactionGroup`?** → KEEP AWAIT — commit ordering depends on it.
   (All `core-entity-forms/custom/**` and `base-forms/base-form-component.ts` batched saves.)
2. **Does the next line use the saved entity's ID server-side** (FK chain, a mutation that writes child
   rows)? → KEEP AWAIT. (e.g. `analyze-artifact.service.ts`, `artifact-create-modal.component.ts`,
   attachment services that write children.)
3. **Is this inside a modal/dialog where failure must keep the dialog open?** → KEEP AWAIT.
4. **Is there a retry/verification loop after the save?** → KEEP AWAIT.
5. **Otherwise** → convert to optimistic render (one of the two implementations below).

## Anti-rules (do NOT do these)

- **Never convert `await` → bare fire-and-forget.** The await stays; only the *render* moves earlier.
- **Never fire-and-forget when a second `Save()` may follow on the same entity.** `Save()` debounces
  concurrent calls via `_pendingSave$` — the second call returns the first's promise without re-saving, so
  mutations made between the two would be silently dropped.
- **Never apply to `Delete()`.** Optimistic deletes carry severe race risk (ghost rows, orphaned attachments).
- **Never apply to server-side code** (resolvers, actions, hooks, CodeGen, MetadataSync) — all server
  `await Save()` calls, and the README's canonical example, stay as-is.
- **Never apply to `TransactionGroup`-batched saves.**

---

## Two implementations, same change — compare and choose

The reference site is `MessageItemComponent.PinMessage` (a single-field UPDATE, no FK chain, no TG — a clean rule-5 case).

### Implementation A — inline (no framework change)

Renders before validation; rolls back on a `false` result. This is the shape already shipped in several places today.

```typescript
public async PinMessage(): Promise<void> {
    const previousValue = this.message.IsPinned;
    this.message.IsPinned = !previousValue;   // optimistic render (BEFORE validation)
    this.cdRef.detectChanges();

    const saved = await this.message.Save();
    if (!saved) {
        this.message.IsPinned = previousValue; // manual rollback
        this.cdRef.detectChanges();
    }
}
```

- **Pros:** zero framework change; obvious and local.
- **Cons:** renders before validation runs (invalid value can flicker in then revert); every callsite
  re-implements the render + rollback bookkeeping by hand (this is why five different one-off versions
  already exist in the repo).

### Implementation B — generic, via `OnValidated`

The render fires from inside `Save()`, only after validation passes; rollback still keyed off the boolean.

```typescript
public async PinMessage(): Promise<void> {
    const previousValue = this.message.IsPinned;
    this.message.IsPinned = !previousValue;

    const saved = await this.message.Save(
        Object.assign(new EntitySaveOptions(), {
            OnValidated: () => this.cdRef.detectChanges(),  // render only once known-valid
        }),
    );
    if (!saved) {
        this.message.IsPinned = previousValue;
        this.cdRef.detectChanges();
    }
}
```

- **Pros:** no invalid-value flicker (render is gated on validation passing); the framework owns the
  "when is it safe to render" decision, so every callsite gets the same correct timing.
- **Cons:** the rollback half is still per-callsite (the framework can't know *what* to revert in the UI);
  the win over inline is the *render-timing correctness*, not eliminating rollback code.

### Recommendation

Adopt **B (`OnValidated`)** as the default for new optimistic saves — the validation-gated render timing is a
genuine correctness improvement the framework should own, and it's additive/backward-compatible. Keep **A**
acceptable for the already-shipped sites until they're touched for other reasons. A future ergonomic layer
(an Angular helper that also captures the rollback closure) can sit on top of `OnValidated` without changing it.

---

## Rollout (after this proposal is accepted)

1. **Phase 1 — chat surface:** the ~13 rule-5 sites in `Generic/conversations/components/message/**`.
2. **Phase 2 — high-traffic, low-risk:** `list-management/tag-chips`, `explorer-settings/**` autosaves.
3. **Phase 3 — dashboards/admin:** swept per component area, one PR each.
4. **Phase 4 — docs/tooling:** fold the decision tree into the root and Angular `CLAUDE.md`; evaluate an
   ESLint *warning* (not error) on `await x.Save();` immediately followed by `this.<arr>.push(x)` / `emit(x)`.

Every converted component must have its **rollback path exercised** with a deliberate `Save` failure — the
mock-provider harness in [`baseEntity.onValidated.test.ts`](../packages/MJCore/src/__tests__/baseEntity.onValidated.test.ts)
shows how to make a save resolve `false` / reject without a database.

## Out of scope

`BaseEntity.Save()`'s return contract; server-side code; `Delete()`; `TransactionGroup`-batched form saves;
the README canonical example; React UI (one negligible site).
