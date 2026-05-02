# BaseEntity Server-Side Patterns

When the database layer needs entity behavior beyond plain CRUD — embeddings, invariants that span multiple records, FK cleanup before delete, in-memory cache sync — the answer is a **server-side `BaseEntity` subclass** registered via `@RegisterClass`. This guide collects the patterns we use repeatedly so new entities can lift them off the shelf instead of inventing variants.

The patterns assume `@memberjunction/core-entities-server`'s convention: one file per overridden entity, named `MJ<Entity>EntityServer.server.ts`, registered with `@RegisterClass(BaseEntity, '<Entity Name From Metadata>')`.

---

## 1. Vectorized entities — persisted embeddings + in-memory cache

**Use when:** the entity participates in semantic search and needs an embedding refreshed whenever a text field changes.

**Schema** — two columns on the entity's table (CodeGen picks them up from the migration):
- `EmbeddingVector NVARCHAR(MAX) NULL` — JSON-encoded number array.
- `EmbeddingModelID UNIQUEIDENTIFIER NULL` — FK → `__mj.AIModel(ID)`. Lets you detect "global model changed → cached vectors are stale" and re-embed on cold start.

**Server class** — three responsibilities, all routed through `Save()` so callers don't need to coordinate:

1. **Override `EmbedTextLocal`** to plug in `EmbedTextLocalHelper` from `@memberjunction/core-entities-server` (this is what wires `AIEngine.EmbedTextLocal` to the framework's `GenerateEmbedding` machinery).
2. **Override `SupportsEmbedTextLocal()` → `true`** so the framework knows it can call your override.
3. **Override `Save()`** to refresh the embedding when the source text is dirty *before* `super.Save()` (so it persists in one round-trip), then sync the engine's in-memory vector service *after* a successful save.

There are two flavors:

- **Single source field** → call `await this.GenerateEmbeddingByFieldName('Note', 'EmbeddingVector', 'EmbeddingModelID')` from BaseEntity. Cleanest. See [`MJAIAgentNoteEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts).
- **Combined source fields** (e.g., "Name + Description") → build the text manually, call `this.EmbedTextLocal(text)`, write `EmbeddingVector` / `EmbeddingModelID` directly. See [`MJTagEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJTagEntityServer.server.ts) for the pattern.

**Engine-side cache sync** — your singleton engine (e.g., `TagEngine`, `AIEngine`) should expose `AddOrUpdateSingle<X>EmbeddingFromPersisted(entity)` and `RemoveSingle<X>Embedding(id)` methods that mirror the persisted `EmbeddingVector` into the in-memory `SimpleVectorService` *without* re-running embedding. The `Save()` override calls these post-`super.Save()`. The engine's `refreshEmbeddings` method on cold start should also prefer the persisted vector when `EmbeddingModelID` matches the configured model — that's the whole point of persisting.

**Backfill / model-change rebuild** — expose a `Rebuild<X>Embeddings(contextUser)` utility on the engine that walks all rows where `EmbeddingVector IS NULL OR EmbeddingModelID != configured`, computes embeddings, and saves. Run after a global embedding-model change.

**Reference implementations:**
- [`MJAIAgentNoteEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJAIAgentNoteEntityServer.server.ts) — single-field, the canonical example.
- [`MJTagEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJTagEntityServer.server.ts) — combined-field, plus invariant + delete cleanup.

---

## 2. Cross-record invariants → `ValidateAsync` (not DB triggers)

**Use when:** a save is only valid based on the state of *other rows* — for example "tag A.IsGlobal=1 forbids any TagScope row pointing at A", "child scope must be subset of parent scope", "this email is already in use by another user".

**Why not DB triggers:** triggers produce ugly raise-error stacks, are SQL-Server-specific, can't be tested in unit tests without a database, and bypass `BaseEntity.LatestResult` so the framework can't surface a clean error message to the caller.

**Use `ValidateAsync`** instead — it runs automatically inside `Save()` after the synchronous `Validate()` passes:

```typescript
public override get DefaultSkipAsyncValidation(): boolean {
    return false;  // opt in — base default is true
}

public override async ValidateAsync(): Promise<ValidationResult> {
    const result = await super.ValidateAsync();
    if (!result.Success) return result;

    // Fast-path: only query when the invariant *could* be newly violated.
    // E.g., on a tag, only check IsGlobal⊕TagScope when IsGlobal is being toggled true.
    const flagDirty = this.GetFieldByName('IsGlobal')?.Dirty ?? false;
    if (!this.IsSaved || !flagDirty || !this.IsGlobal) return result;

    const violating = await this.countConflictingRows();
    if (violating > 0) {
        result.Errors.push(new ValidationErrorInfo(
            'IsGlobal',
            `Cannot set IsGlobal=1 — ${violating} TagScope row(s) exist for this tag.`,
            this.IsGlobal,
            ValidationErrorType.Failure
        ));
        result.Success = false;
    }
    return result;
}
```

**Pair both sides** — when the invariant constrains entity A *and* entity B, override `ValidateAsync` on **both** server classes so the rule holds whichever side is being mutated. See `MJTagEntityServer` (Tag side) + [`MJTagScopeEntityServer.server.ts`](../packages/MJCoreEntitiesServer/src/custom/MJTagScopeEntityServer.server.ts) (Scope side) for a worked example.

**DB-level guard** — keep a `UNIQUE` constraint or `CHECK` for the simple parts the schema can express. Cross-table state belongs in `ValidateAsync`, not triggers.

**Always fast-path** — the check runs on every save; only hit the database when the relevant field is dirty / new.

---

## 3. FK cleanup before `Delete()`

**Use when:** the entity is referenced by other rows that should be cleaned up rather than blocking the delete with FK errors. Common for hub entities like Tag, AIAgent, ContentSource.

**Pattern:**

```typescript
public override async Delete(): Promise<boolean> {
    const id = this.ID;
    try {
        const rv = new RunView();
        const [refsA, refsB] = await rv.RunViews([
            { EntityName: 'MJ: Foo', ExtraFilter: `TagID='${id}'`, ResultType: 'entity_object' },
            { EntityName: 'MJ: Bar', ExtraFilter: `TagID='${id}'`, ResultType: 'entity_object' },
        ], this.ContextCurrentUser);

        const deletes: Promise<boolean>[] = [];
        if (refsA.Success) deletes.push(...refsA.Results.map((r: BaseEntity) => r.Delete()));
        if (refsB.Success) deletes.push(...refsB.Results.map((r: BaseEntity) => r.Delete()));
        if (deletes.length > 0) await Promise.all(deletes);
    } catch (e) {
        LogError(`Failed to clean up references: ${e instanceof Error ? e.message : String(e)}`);
        // Decide per-entity whether to return false here or proceed; usually proceed and let
        // super.Delete()'s FK error surface if there's still a hard reference.
    }

    return super.Delete();
}
```

`MJTagEntityServer.Delete()` is a representative example.

---

## Things to remember (CLAUDE.md cross-reference)

- **Server classes only** — these patterns belong in `@memberjunction/core-entities-server`, never in `@memberjunction/core-entities` (which is shared with the browser).
- **`@RegisterClass(BaseEntity, 'MJ: Entity Name')`** — the entity name string must match the metadata exactly (CodeGen-emitted JSDoc above each entity class confirms it).
- **Always check `Save()` / `Delete()` boolean returns** and surface `LatestResult?.CompleteMessage` per CLAUDE.md.
- **Use `BaseSingleton`** for any engine-side singleton you write (CLAUDE.md rule #7).
- **No weak typing** — generated entity properties are typed; never `.Get('Field')` / `.Set('Field', val)` (CLAUDE.md rule #2b).
- **Multi-provider safety** — pass `provider?: IMetadataProvider` through helper methods that don't naturally have `this.ProviderToUse`; fall back to `Metadata.Provider` only as a last resort.

---

## Quick recipe — adding a new vectorized entity

1. Migration: add `EmbeddingVector NVARCHAR(MAX) NULL` and `EmbeddingModelID UNIQUEIDENTIFIER NULL FK→AIModel(ID)` to the table.
2. Run CodeGen.
3. Create `MJ<Entity>EntityServer.server.ts` mirroring `MJTagEntityServer` (combined-field) or `MJAIAgentNoteEntityServer` (single-field).
4. If a singleton engine exists for the entity (or you're adding one), expose `AddOrUpdateSingle<X>EmbeddingFromPersisted` and `RemoveSingle<X>Embedding`. Hydrate the cache from `EmbeddingVector` on `Config()`.
5. Export the server class from `packages/MJCoreEntitiesServer/src/index.ts`.
6. Run the package's tests (`npm run test`) — add tests covering: first save embeds, dirty-text save re-embeds, save-with-empty-text clears, post-save engine cache reflects new vector.

Took ~6 hours end-to-end for `MJTagEntityServer` from migration to green tests. Re-using the recipe should be substantially faster.
