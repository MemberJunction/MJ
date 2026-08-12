---
'@memberjunction/search-engine': minor
'@memberjunction/content-autotagging': minor
'@memberjunction/integration-test-suite': minor
---

Content vectors: declare the entity on the content source, and let `explicit` omit the per-vector key

Minor rather than patch on both: this adds a property to the `ContentSource.Configuration` JSONType, so
it changes metadata rather than code alone.

`VectorSearchProvider` could attribute a match two ways: an `Entity` key in the vector's own metadata,
or an Entity Document targeting the index. Neither covers the ContentSource pipeline running
`fieldStrategy: 'explicit'`, where metadata carries only the configured fields — `ContentSourceID` is
present, the identity keys are not — and where the caller may not use Entity Documents at all.

That gap is not cosmetic. `SearchEngine.filterEntityResults` groups results by `EntityName` and
resolves each group with `EntityByName()` to evaluate CanRead and row-level security. An unresolvable
name yields no `EntityInfo`, the method returns before admitting the group, and **the results are
silently discarded** — `Residual permission filter removed N result(s)` is the only trace.

A content source can now declare what its vectors are, via `VectorEntityName` on its `Configuration`
JSON — the same place every other per-source vector knob already lives (`EnableVectorization`,
`VectorIDStrategy`, `ChunkTextStorage`, `VectorMetadata`). When a match omits `Entity`, its
`ContentSourceID` resolves through `KnowledgeHubMetadataEngine.GetContentSourceByID()` — an O(1) lookup
against an already-cached collection — to that declaration.

**The declaration is validated before it is trusted, twice.** Whatever it resolves to becomes the
entity whose CanRead and row-level security `filterEntityResults` evaluates, and that method never
checks the matched record ids belong to it. So the name must (a) resolve in metadata — an unresolvable
name would otherwise silently delete a source's results rather than mislabel them — and (b) be one of
`MJ: Content Items` / `MJ: Content Item Chunks`, or an IS-A subtype of one. Without (b) an arbitrary
entity name in a writable configuration blob would decide which permissions apply. The canonical name
from metadata is what gets used, so casing and whitespace cannot fork the grouping.

Two properties worth calling out, because they are why this sits where it does rather than being
inferred from somewhere else:

- **Per match, not per index.** One vector index can serve many content sources, so an index-wide
  answer is wrong as soon as a second source shares the index. `ContentSourceID` travels on the vector.
- **Declared, not guessed** — and validated, per above. Since attribution decides *which* entity's
  permissions are evaluated, an inferred or unchecked name would put the wrong object's rules in front
  of the records — worse than no attribution, which merely drops them.

Declaring it per source also lets a source name an **ISA extension** instead of the base entity it
inherits from. That distinction is a security one: row-level security typically lives on the
extension, so a hardcoded or index-wide base-entity name evaluates the wrong entity's RLS.

Resolution order is most-specific-first: the match's own `Entity` key, then its content source's
declaration, then the index's Entity Documents, then `'Unknown'` as before. A source that declares
nothing — or declares something that fails validation — is simply absent from the lookup, so its matches
behave exactly as they do today.

Also fixed, both pre-existing:

- `convertMatches` applied the resolved fallback with `??` while the "does this match need one" test is
  falsy, so an `Entity: ''` resolved a name and then discarded it — the result was dropped with the
  resolution already paid for.
- `convertMatches` had the same `??` on `RecordID`, so a producer writing `RecordID: ''` shipped an empty
  record id instead of falling through to the vector's own id — dropped by the permission filter on an
  `IN ('')`, or returned as a result that cannot be opened.

`extractDisplayTitle` is deliberately left reading `meta['Entity']` rather than the resolved name, with a
comment saying so. It looks like an oversight and is not: when the metadata carries no name fields it
falls through to `` `${fallbackEntity} Record` ``, and that string is the sentinel
`SearchEnricher.resolveRecordNames` matches to replace the title with the live name from the database.
Feeding the resolved entity in makes the name-field branch succeed off the embedding-time snapshot, the
sentinel never forms, and a renamed record shows a stale title until it is re-embedded.

Failures decline rather than guess, and each declines narrowly: a source whose `Configuration` will not
parse is skipped on its own (one guard per source, not one around the batch, so a single bad blob cannot
downgrade every match after it to a different entity's permissions), and a `KnowledgeHubMetadataEngine`
load that is **permission-constrained** declines explicitly instead of reading its empty collections as
"nothing declared" — otherwise attribution would silently depend on who was searching.

**Attribution failure is now audible.** A batch containing matches that no step could name logs the
count, the index, a sample of vector ids, and the three ways to fix it — once per index per batch, and
only when it happens. Before this, such matches were discarded by `filterEntityResults` with no log on
that path at all; the sole trace was the aggregate `Residual permission filter removed N result(s)`,
whose wording blames incomplete provider push-down. So the one signal a deployment got pointed away from
the cause, which is why "vectors are in the index and never surface" was undiagnosable.

**And the write side can now drop the key.** With a declaration in place, `'explicit'` genuinely omits
`Entity` and writes `ContentSourceID` instead — the source becomes the single place the answer lives
rather than a string repeated on every vector. Previously the key could not be removed by configuration
at all on this pipeline: it is written *before* the `explicit` early return (the EntityDocument pipeline
has it the other way around), and there is no `IncludeEntity` toggle beside `IncludeEntityIcon` /
`IncludeUpdatedAt` / `IncludeTags` / `IncludeText`.

The declaration is validated where it is written, not only where it is read. It must resolve in
metadata, and it must name `MJ: Content Item Chunks` or an IS-A subtype — because omission requires
`'alwaysChunk'`, which makes every vector a chunk row whose id is a chunk key. A name that fails either
check keeps the `Entity` key and logs once per run. This fails *safe* rather than closed, and
deliberately so: the reader can only refuse a bad declaration after the fact, by which point the vectors
carry no entity at all, so correcting the configuration would not recover them without a re-embed.

Omission is therefore gated on all four of `'explicit'`, a declaration resolving to the chunk entity,
`ChunkTextStorage: 'alwaysChunk'` and `VectorIDStrategy: 'recordId'`, with
`ContentSourceID` then written unconditionally. Each condition keeps the guarantee that every vector
carries either `Entity` or a key that resolves to a declared entity:

- **`'mixed'`** emits ContentItem-level vectors for single-chunk items and ContentItemChunk-level vectors
  for the rest — two entities from one source, which one declaration cannot describe.
- **`'hash'`** leaves no recoverable record id, since `'explicit'` drops `RecordID` too and the vector's
  own id is a digest rather than the row's. Attribution would succeed and then hand search an id that
  resolves against no row — the same disappearance, one step later.
- **Other field strategies** document a populated metadata set; dropping a key their consumers are told
  is always present would be a behavior change for them.

Anything else keeps writing `Entity` exactly as before, and existing vectors are untouched — they keep
resolving through their stored key (resolution step 1), so no re-index is required.

Integration coverage comes with it: `IT — content-vectorization` gains CV7 (a declaring source omits
`Entity`, promotes `ContentSourceID`, and its vector id is the chunk row's PK) and CV8 (three refusal
paths — no opt-in, an unresolvable name, and a declaration naming the item entity — each keep the key).

No schema change and no migration. It does add a property to the `ContentSource.Configuration` JSONType,
so `mj sync push` + `mj codegen` are needed before the typed accessor exists; until then both sides read
it through a locally-declared interface that is deleted at that point. Behaviour is unchanged for callers
whose matches carry `Entity` metadata and for any index resolving through an Entity Document.
