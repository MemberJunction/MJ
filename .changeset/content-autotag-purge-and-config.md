---
"@memberjunction/content-autotagging": minor
"@memberjunction/actions-content-autotag": minor
"@memberjunction/core-entities": minor
"@memberjunction/ai-prompts": minor
---

Content autotagging: metadata-driven vector config, chunk purge + backfill, and parity with the entity-vectorization pipeline

Brings the ContentSource / autotag embedding pipeline (`AutotagBaseEngine`) up to parity with the
EntityDocument pipeline, and wires up chunk lifecycle operations. All additive and opt-in — existing
setups behave identically. No schema/migration changes (config rides the `Configuration` JSONType).

- **Metadata-driven vector config** on the `Configuration` JSONType of both `ContentSource` and
  `ContentType` (ContentSource overrides ContentType, then a hardcoded default):
  - **`VectorIDStrategy`** (`'hash' | 'recordId'`, default `'recordId'`): `'recordId'` uses each
    chunk's own id as its vector-DB id (purge-safe); `'hash'` is 5.49 EntityDocument parity and
    unsafe with re-chunk + purge (documented).
  - **`ChunkTextStorage`** (`'mixed' | 'alwaysChunk'`, default `'alwaysChunk'`): `'alwaysChunk'`
    writes a `ContentItemChunk` row for every item and leaves `ContentItem.VectorRecordID` null;
    `'mixed'` keeps single-chunk items' text/vector on the ContentItem.
  - **`VectorMetadata`** — full structural parity with the entity pipeline's metadata control:
    `FieldStrategy: 'all' | 'include' | 'exclude' | 'explicit'` (unset ⇒ the curated content
    default, preserving historical behavior), per-field `Fields` overrides
    (`Included`/`TruncationLimit`/`StoreAs`), `DefaultTruncationLimit`,
    and `IncludeEntityIcon`/`IncludeUpdatedAt`/`IncludeTags`/`IncludeText` toggles. The runner mirrors
    the entity side's decomposition (system/icon/updatedAt/display-field helpers, StoreAs coercion,
    UUID normalization, truncation) driven off the ContentItem entity. Content-specific deviations:
    `Entity` is always kept under `'explicit'` (so results stay labeled; record id recovers from the
    vector id under the default `recordId` strategy), and `Tags` (not a ContentItem field) is a
    toggle rather than a discovered field.
- **Chunk-Identity Contract** — chunk vectors now carry their own identity: `Entity='MJ: Content
  Item Chunks'`, `RecordID=<ContentItemChunk.ID>`, `ContentItemID`, `Sequence`. The chunk row PK is
  minted up front and used as its identity (and, under `recordId`, its vector id), so a scoped
  search hit returns the matched **chunk** id (not just the parent content item id) with no
  search-side changes. Item-level ('mixed' single-chunk) vectors keep `MJ: Content Items` identity.
- **`AutotagBaseEngine.EmbedPendingChunks(user, {maxItems})`** — (re)embeds persisted
  `ContentItemChunk` rows whose `EmbeddingStatus='Pending'`, for migration backfill and error
  recovery. Bounded per run + rate-limited; best-effort per chunk.
- **Embedding dimensions** — the resolved infrastructure now carries `MJ: Vector Indexes.Dimensions`
  and threads it into the embedding call (new optional `Dimensions` on `AIModelRunner`'s
  `EmbeddingRunParams`, forwarded to `EmbedTexts`), so reduced-dimension indexes work in the autotag
  path and the dedup-check query embeds at the matching size.
- **Provider routing** — the resolved infrastructure carries the parsed `VectorIndex.ProviderConfig`;
  per-record `providerTemporaryDirectives` are built via `VectorDBBase.BuildProviderDirectives`
  (e.g. Pinecone namespace from a configured source field) and `providerConfig` is passed to
  `CreateRecords`. Only invoked when the index actually has a ProviderConfig.
- **`AutotagBaseEngine.PurgeDeletedChunks`** is now triggerable: the Autotag/Vectorize action gains
  optional **`Purge`** (Phase 4) and **`EmbedPendingChunks`** (Phase 3) params, both independent of
  Vectorize, both bounded by `MaxItems`, both best-effort.

Behavior note: the default `ChunkTextStorage='alwaysChunk'` + `VectorIDStrategy='recordId'` means
newly-embedded single-chunk items now get a `ContentItemChunk` row with a unique vector id instead
of an item-level hash id. Already-embedded (`EmbeddingStatus='Complete'`) items are not reprocessed,
so existing data is untouched until re-embedded; set `ChunkTextStorage='mixed'` per source to retain
the item-level single-chunk behavior.
