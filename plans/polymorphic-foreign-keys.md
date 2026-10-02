# Polymorphic Foreign Keys — Making `EntityID`/`RecordID` First Class

**Status:** Reference document. Reviewed by @rkihm-BC 2026-09-08; corrected 2026-09-09 (see *Revision history*).
The Layer 1 bug fixes and Layer 0 items 1–3 have shipped separately as **#4321**; everything else here is still plan.
**Owners for review:** @rkihm-bc, @ms-bc
**Related:** `EntityField.EmbeddedRecord` (`V202608161735__v6.1.x`), `EntityOrganicKey` / `EntityOrganicKeyRelatedEntity`, `additionalSchemaInfo` soft FKs

---

## Summary

MJ models "a pointer to any record" as an `EntityID` + `RecordID` column pair. The framework understands
the **`EntityID`** half — it is a real foreign key to `__mj.Entity`, so it gets a generated index, a joined
`Entity` name column in the base view, and referential integrity. The framework understands **nothing** about
the `RecordID` half. It does not know the column is a pointer, does not know what it points at, does not
validate it, does not cascade it, and does not index it usefully.

This is not a corner case. A scan of MJ core plus the Open App repos found **54 such pairs across 53 tables in
10 repositories** — 35 pairs across 34 tables in MJ core alone (`RecordLink` carries two). Those are the
numbers the appendix supports and the only ones used in this document; earlier drafts said 53/~50/37 in three
different places. The v5.46 baseline contains 33 pair-bearing tables, one fewer than the appendix, because the
appendix is taken from source across all migrations rather than the baseline alone.

This plan proposes finishing the capability in four layers. **Layers 0 and 1 are the committed scope**;
2 and 3 are sketched and deliberately deferred.

Two findings shape the plan.

**The declaration slot already exists.** `EntityField.EntityIDFieldName` has been in the schema since the v2
baseline, documented for exactly this purpose, with consumer code in both the SQL Server and PostgreSQL
providers. It is `NULL` for every field in the system, and its consumer had *six* bugs (B1–B6 below). We are
finishing something started around v2 and abandoned — not inventing a concept.

**But the payload columns do not agree on what they contain, and the disagreement is much wider than one
outlier table.** A mechanical audit of every write to a polymorphic payload column found **90 write sites, of
which 2 use the canonical encoding**. This is the load-bearing correction to the original plan: it makes D1's
"it is already the majority format" false, and it means Layer 1 (declare) cannot ship until Layer 0 has
normalised the *writers* — not merely re-encoded `RecordGeoCode`. Section 1 has the breakdown.

---

## The problem, in evidence

### 1. Five encodings ship in core today, and canonical is ~2% of writes

> **Corrected 2026-09-09.** This section previously claimed two encodings with `RecordGeoCode` as the lone
> outlier. That understated the problem badly enough to change the plan's sequencing, so it is restated here
> from a mechanical audit rather than from the two tables that were already known about.

A grep over every assignment to a polymorphic payload column (`RecordID`, `EntityRecordID`, `LinkedRecordID`,
`ScopeRecordID`, `Source`/`TargetRecordID`, `PrimaryScopeRecordID`, `LinkedEntityRecordID`, `AnchorRecordID`)
across `packages/`, excluding tests and generated code, finds **90 write sites. 2 of them use the canonical
`ToConcatenatedString()`.**

| Encoding | Example column | Written by |
|---|---|---|
| **Canonical** (field name included) | `RecordChange.RecordID` | `SQLServerDataProvider` centrally; `MJListDetailEntityExtended` *only* when the key is composite |
| **Bare single value** | `ListDetail.RecordID`, `UserFavorite.RecordID`, `TagScope.ScopeRecordID`, `AuditLog.RecordID` | most of the 90 — written ad hoc as `String(value)` / `record.ID`, from server *and* Angular call sites |
| **Bare, comma-space joined** | `UserFavorite.RecordID` | `databaseProviderBase.GetRecordFavoriteID` via `CompositeKey.Values()` |
| **Bare, field-delimiter joined** | `RecordGeoCode.RecordID` | `GeoCodeSyncService`, re-derived a second time in T-SQL by `sql_codegen.ts` |
| **`Field=Value AND ...`** | `DataContextItem.RecordID` | `MJDataContext/types.ts` via `CompositeKey.ToString()` |
| **Not a record pointer at all** | `CompanyIntegrationRunDetail.RecordID` | `IntegrationEngine`, which stores `EntityMap:<id>` + `Processed:<n>` |

Two consequences the original plan did not draw:

1. **`UserFavorite` is written both ways.** The provider writes `Values()`; `lists-browse-resource.component.ts`
   and `explorer-state.service.ts` assign a bare `.ID` directly. One column, two encodings — no reader can be
   right for both.
2. **`ListDetail` switches encoding on key arity** — bare for a single-column key, canonical for a composite
   one. So "which encoding does this column use?" is not answerable per column.

The geocode contract between TypeScript and T-SQL is still held only by a comment on each side saying "this
must match the other." Consumers cope by sniffing for the value delimiter: `recent-access.service.ts:250-279`
does this and is **wrong for a bare composite key**, parsing it to `Value=undefined` — a live defect in shared
Angular code waiting for the first composite-PK entity to be geocoded and then viewed.
`record-tags.component.ts:363` implements a second, different sniffer.

**Why this is the load-bearing correction.** Layer 1 declares pairs; a declared pair makes record merge write
the canonical form into the payload column (fixed in #4321) and makes the dependency query *compare* against
it. Against a column holding bare values that query matches nothing and the merge writes a value the column's
own readers cannot parse. So Layer 1 is blocked on normalising 88 writers, not on re-encoding one table.

### 2. Ten different column shapes for one concept

`NVARCHAR(100)`, `(255)`, `(400)`, `(450)`, `(500)`, `(700)`, `(750)`, `(2000)`, `(MAX)`, and one
`UNIQUEIDENTIFIER`. `MAX` (`Recommendation`) and `2000` (`TemplateParam`) cannot be an index key at all.
`bizapps-caliber.Note.SubjectID` is `UNIQUEIDENTIFIER` while its six sibling tables are `NVARCHAR(255)` —
that one link silently forbids composite and non-GUID keys.

### 3. No integrity at write, read, or delete

- **Write:** nothing validates the target exists. `MJTagScopeEntityServer.server.ts:20-42` overrides
  `ValidateAsync`, carefully checks that the hard `TagID` FK resolves — which the database already
  guarantees — and says nothing about `ScopeEntityID`/`ScopeRecordID`, which has no guarantee at all.
- **Delete:** `generateCascadeDeletes` (`sql_codegen.ts:2288-2313`) walks `ef.RelatedEntityID` only.
  Polymorphic children are invisible. Delete a Person and every `TaskLink`, `TaggedItem`, `AddressLink`,
  `ActivityLink` and `FileEntityRecordLink` pointing at them becomes a dangling row nothing will flag.
- **Pairing:** the both-or-neither invariant is hand-written each time somebody remembers —
  `CK_Conversation_LinkBinding`, `CK_AIAgentSession_LinkBinding`, `CK_InviteScope_SubjectPairing` in Caliber.
  Dozens of tables have no such constraint.

### 4. CodeGen indexes the wrong half

Because `EntityID` *is* a real FK, CodeGen emits `IDX_AUTO_MJ_FKEY_<table>_EntityID` — an index on a column
with a few hundred distinct values. The index that serves the query everyone actually writes,
`(EntityID, RecordID)`, is hand-authored per table when someone thinks of it. Core is split: the newer tables
(`TagScope`, the agent-scope trio) got the composite; the older ones (`TaggedItem`, `UserFavorite`,
`RecordChange`, `UserRecordLog`, `EntityRecordDocument`, `ListDetail`, `UserViewRunDetail`) have `RecordID`
alone.

### 5. The one place it works, it works by hardcoding

Geocoding needed a polymorphic join, so `sql_codegen.ts` got one — for `vwRecordGeoCodes` specifically, keyed
on `entity.SupportsGeoCoding`, dialect-aware, with the RecordID expression built inline. It works, and it is
the general solution written once for one table. Read it as proof of concept: the hard part — emitting a
correct, dialect-portable `EntityID = ? AND RecordID = <pk-expr>` join into a generated base view — is
already solved and shipping.

---

## Decisions taken

### D1 — The canonical `RecordID` encoding is `CompositeKey.ToConcatenatedString()`

`ID|<value>` for a single PK; `F1|v1||F2|v2` for a composite.

> **Corrected 2026-09-09.** The original rationale led with "it is already the majority format." That is
> false — it is 2 of 90 write sites (section 1). The decision does not depend on it, but the cost estimate did,
> so the corrected reasoning is below and `RecordGeoCode is the outlier` is withdrawn: it is one of many.

Rationale, restated: it is what `Metadata.GetRecordChanges` already assumes, it is the only candidate that is
**self-describing** (the field names travel with the value, so a reader needs no entity metadata and a primary
key column reorder cannot silently remap the key), and it round-trips losslessly for composite keys, which
`Values()`, the bare form and `ToString()` all fail to do. Every other encoding in section 1 is lossy, ambiguous,
or both.

It is also the encoding with a **reader that can refuse bad input**: `CompositeKey.FromRecordID` validates the
parsed field names and arity against the entity's primary keys, so a legacy bare composite is rejected rather
than parsed into phantom fields. Shipped in #4321.

### D2 — The canonical width is `NVARCHAR(750)`

**450 is not the ceiling, and core already exceeds it.** The limits:

| Index position | Byte limit | nvarchar chars |
|---|---|---|
| Clustered key | 900 | 450 |
| Nonclustered key, SQL Server 2012/2014 | 900 | 450 |
| **Nonclustered key, SQL Server 2016+** | **1700** | **850** |

Two shipping indexes in the v5.38 baseline already exceed 900 bytes, so MJ has committed to the 1700-byte
regime:

- `IX_RecordChange_RecordID` on `NVARCHAR(750)` = **1500 bytes** (baseline:10875)
- `IDX_TagScope_Scope_Tag` on `(uniqueidentifier, nvarchar(450), uniqueidentifier)` = **932 bytes**
  (baseline:11039)

The deciding argument is **migration direction, not the ceiling**. Growing an nvarchar is a metadata-only
ALTER; shrinking one requires a data-length scan, an index rebuild, and — for anything already installed at a
customer — is a breaking change under the publish policy.

- Choosing **750** narrows nothing. Every column at 100/255/400/450/500/700 widens for free. Only three need
  real work: `Recommendation` (MAX), `TemplateParam` (2000), `caliber.Note` (UNIQUEIDENTIFIER).
- Choosing **450** would require narrowing ten tables, each needing a length scan first.

Declared width costs nothing at runtime — nvarchar is variable-length, so 750 and 450 store identically. The
number only gates the `CREATE INDEX` check. PostgreSQL does not constrain either choice; its btree limit is
checked against actual data (~2704 bytes), not declared width.

**Every affected index fits after the widen** (@rkihm-BC sized these against the baseline; reproduced here so
the claim does not have to be re-derived):

| Index | Key after widen | Bytes |
|---|---|---|
| `UQ_RecordGeoCode_EntityRecordLocation` | uniqueidentifier + nvarchar(750) + `LocationType` nvarchar(50) | **1,616** |
| `UQ_RecordProcessWatermark_Record`, `UQ_TagScope_Tag_Entity_Record`, `IDX_TagScope_Scope_Tag`, the AIAgent PrimaryScope indexes | uniqueidentifier + nvarchar(750) | **1,532** |

All under the 1,700-byte nonclustered limit, and **no clustered key includes a RecordID-shaped column**.

> **Measured 2026-09-09 — this resolves the open verification item.** The question was whether `ALTER COLUMN`
> widening is permitted in place on a column that already carries an index, with "assume the latter until
> measured" as the working assumption. Probed against SQL Server 2022:
>
> - **Widening an indexed `NVARCHAR` column succeeds.** It is a metadata-only change; the index does **not**
>   need dropping and recreating. The pessimistic assumption was wrong and can be dropped from the estimate.
> - A `CHECK` constraint referencing the column does not block the widen either.
> - **But an over-limit index is created with only a *warning*, not an error.** Recreating a key that comes to
>   2,026 bytes succeeded with `Warning! The maximum key length for a nonclustered index is 1700 bytes… For
>   some combination of large values, the insert/update operation will fail.` So exceeding the limit is a
>   *latent runtime* failure on a long value, not an honest build-time one. Any repo whose index keys a
>   `RecordID` alongside another wide column must re-key it, not merely check that `CREATE INDEX` succeeded.
>   `bizapps-caliber` is exactly that case — see its section below.

### D3 — `EntityField.EntityIDFieldName` is the declaration predicate

The existing field on the **payload** row names its discriminator sibling. Its own description says why:

> *Optional, used for "Soft Keys" to link records to different entity/record combinations on a per-record
> basis (for example the FileEntityRecordLink table has an EntityID/RecordID field pair. For that entity, the
> RecordID specifies "EntityID" for this field. This information allows MJ to detect soft keys/links for
> dependency detection, merging and for preventing orphaned soft-linked records during delete operations.*

So on `TaskLink.RecordID`, `EntityIDFieldName = 'EntityID'`; on `RecordLink.SourceRecordID`,
`'SourceEntityID'`; on `RecordLink.TargetRecordID`, `'TargetEntityID'`. The indirection through that column
gives us the target entity at runtime, and everything higher-order builds on it.

`EntityIDFieldName != NULL` becomes the single predicate meaning "this field is a polymorphic pointer" —
which is exactly what both DB providers already test for. It is `nvarchar(100)`
(`V202407171600__v2.0.x.sql:306`) and currently NULL on every row, so populating it costs no migration of
existing data.

**Declaration lives on the `EntityField` row of the payload column** — not on `Entity`, not in a standalone
table. That is where MJ already put `EntityIDFieldName`, and where every other "what does this field point
at" answer lives (`RelatedEntityID`, `RelatedEntityFieldName`, `EmbeddedRecord`). Field-level also handles
multi-link tables for free: `RecordLink` gets two independent declarations.

### D4 — Policy as JSON on the field; the allow-list as a table

Two additions around `EntityIDFieldName`:

```jsonc
// EntityField.PolymorphicKey — NVARCHAR(MAX) NULL, alongside EmbeddedRecord
{
  "DiscriminatorKind": "EntityID",      // | "EntityName" (legacy/Caliber)
  "Pairing":           "BothOrNeither", // | "Required"
  "OnTargetDelete":    "Cascade"        // | "SetNull" | "Block" | "Ignore"
}
```

```sql
-- EntityFieldPolymorphicTarget — the allow-list, empty = any entity
EntityFieldID  UNIQUEIDENTIFIER  -- → __mj.EntityField(ID)
TargetEntityID UNIQUEIDENTIFIER  -- → __mj.Entity(ID)
Sequence       INT
DisplayName    NVARCHAR(255) NULL
```

The allow-list is a **table, not JSON**, for the same reason `EntityOrganicKeyRelatedEntity` is a table: the
target becomes a real FK, so a typo'd entity is impossible rather than silent, and pickers, validation and
reverse-tabs become a join instead of a parse. Nothing currently constrains what a Task may link to, which is
why every consumer writes its own picker and its own validation.

`EmbeddedRecord` (`V202608161735__v6.1.x__EntityField_EmbeddedRecord.sql`) is the migration template: a single
`NVARCHAR(MAX) NULL` policy column where `NULL` reproduces today's behaviour exactly.

---

## Layer 0 — Settle the encoding and the shape

Ships first because it is the only layer that touches **data**, and it gets more expensive every quarter as
more of these pairs land in customer databases.

**Items 1–3 have shipped in #4321.** The rest is re-scoped by the section 1 correction: normalising the
writers is the bulk of Layer 0, and it was not in the original plan at all.

1. ~~**`CompositeKey.ToRecordID()`**~~ — **shipped (#4321)**. Rejects a value containing the delimiter, and a
   null key component (which `ToConcatenatedString` renders as the literal text `"null"`).
2. ~~**`CompositeKey.FromRecordID(entityInfo, s)`**~~ — **shipped (#4321)**. Parses, then validates the parsed
   field names and arity against `entityInfo.PrimaryKeys`, and throws on mismatch. The name-match check is what
   safely disambiguates a legacy bare composite, which parses cleanly but produces field names the entity does
   not have.

   `LoadFromConcatenatedString` had three silent-corruption paths. **One is superseded:** #4184 (merged
   2026-09-04, after this plan was written) changed the value split to `kv.slice(1).join(valueDelimiter)`, so a
   value containing the delimiter now round-trips instead of being truncated. The remaining two still stand and
   still justify a separate reader: **no delimiter → silent no-op** with `KeyValuePairs` left empty and no
   signal to the caller (the defect that forces every consumer to sniff), and **a value containing the field
   delimiter → phantom pairs with garbage field names**.
3. ~~**`CompositeKey.FromLegacyRecordID(entityInfo, s)`**~~ — **shipped (#4321)**.
4. **Normalise the 88 non-canonical writers.** *New, and the largest item in the plan.* Route every write
   through `ToRecordID()`, and every read through `FromRecordID()` / `FromLegacyRecordID()`. This includes
   deciding, per column, whether existing rows are re-encoded or read through the legacy path forever. Three
   specific messes to settle:
   - `UserFavorite` is written both ways (provider `Values()`, Angular bare `.ID`) — pick one and fix both.
   - `ListDetail` switches encoding on key arity — remove the branch.
   - `CompanyIntegrationRunDetail.RecordID` is not a record pointer; it should be excluded from the inventory
     rather than migrated.
5. **Migrate `RecordGeoCode`** to the canonical format — data migration plus the one-line change to the geo
   join in `sql_codegen.ts`. **Needs a rollback story**, which this plan does not have: the re-encode can
   partially apply, and a half-re-encoded column is worse than either end state. Ship it as its own migration,
   separately from the widen (decision Q2 below).
6. **Widen to `NVARCHAR(750)`** across core. Fix the three outliers (`Recommendation` MAX, `TemplateParam` 2000,
   `caliber.Note` UNIQUEIDENTIFIER). **Cost still unmeasured on `RecordChange` and `UserRecordLog`**, the two
   highest-row-count tables in a mature install — so "ships first" is a sequencing intent, not yet a schedule.
   The widen itself is metadata-only and does not rebuild indexes (measured, D2), which removes the main
   feared cost but does not substitute for measuring it on real row counts.
7. **Write the rule down** — a `guides/` entry, so the next table does not pick a width by feel.

## Layer 1 — Declare it

**Blocked on Layer 0 item 4.** Declaring a pair against a column that holds a bare value makes the dependency
query match nothing and makes record merge write a value the column's own readers cannot parse. The mechanism
is fixed and dormant (#4321); switching it on is not safe until the writers agree.

8. Populate `EntityIDFieldName` for all 35 core pairs, plus `PolymorphicKey` and
   `EntityFieldPolymorphicTarget` rows.

   **Seeding mechanism** (the original plan never named this): via `metadata/` and `mj sync push`, **not** a
   hand-written migration. That is how field attributes are seeded today — `metadata/entities/.entity-field-jsontype-embedded-record.json`
   sets `EmbeddedRecord`'s JSONType exactly this way, keying each row by
   `@lookup:MJ: Entity Fields.EntityID=@lookup:MJ: Entities.Name=<Entity>&Name=<Field>`. Verified safe to seed
   this way: **CodeGen never writes `EntityIDFieldName`** — there is no `SET EntityIDFieldName` anywhere in
   `manage-metadata.ts`, only a read — so a seeded value is not clobbered by the next CodeGen run.
9. Add a `PolymorphicForeignKeys` block to `additionalSchemaInfo`, so client schemas and Open Apps declare
   theirs the same way they declare soft FKs, IS-A relationships and organic keys today.
10. Surface it on `EntityFieldInfo` so the runtime can read it, not just CodeGen.
11. ~~Fix the two bugs that would block it~~ — **six bugs, all shipped in #4321** (below).

### Bugs found — all fixed in #4321

B1 and B2 were the two the plan originally named. B3 and B4 were logged as minor. **B5 and B6 were found while
making B1/B2 testable, and B5 is the most serious of the six**: it silently corrupts data rather than
returning nothing.

**B1 — `BuildSoftLinkDependencySQL` filtered on the wrong entity.** It emitted
`WHERE [<EntityIDFieldName>] = '<entity.ID>'` where `entity` is the **holder** of the link, not the entity of
the record whose dependencies are sought. It looked for `TaskLink` rows pointing at `TaskLink`. The target
entity's ID was never resolved anywhere in the function. Same shape in the PostgreSQL provider.

**B2 — soft links were gated behind hard links.** `GetRecordDependencies` returned early when
`GetEntityDependencies` found no FK-based dependents, so the soft-link SQL was never built for an entity whose
only dependents are polymorphic — the exact case it exists to serve.

**B3 — encoding assumption.** The query compared against `compositeKey.GetValueByIndex(0)`, the bare first PK
value, so it assumed the format `RecordChange` does not use.

**B4 — quoting.** `quotes` was derived from the *holder's* PK type and then applied to both the entity-ID
literal and the RecordID literal. A holder with an integer PK produced malformed SQL. Both literals are now
always quoted — the discriminator is a uniqueidentifier and the payload nvarchar, regardless of the holder —
and values are escaped.

**B5 ⚠️ — record merge wrote the wrong encoding.** *Not in the original plan.* `MergeRecords` repointed every
dependency with `SurvivingRecordCompositeKey.GetValueByIndex(0)` — the bare key value. Correct for a foreign
key; silently wrong for a `RecordID` column, which holds the field-prefixed form. Merging two records would
have left every polymorphic link pointing at nothing, *and* introduced yet another encoding into the column.
This is why B1/B2 could not be shipped without it: fixing the query without fixing the write-back turns a
dead path into a corrupting one. Now an explicit, tested seam (`ResolveMergeLinkValue`).

**B6 — dependency keys mapped onto the wrong entity.** `parseRecordDependencyResults` built the dependent
record's `CompositeKey` from the **parent** entity's primary key columns, though the value is the *related*
entity's key and every consumer already treats it as such. Latent while both sides are keyed `ID`.

Also fixed, as a consequence of B2: `GetRecordDependencies` now **throws** for an entity absent from metadata
rather than returning `[]`. Reporting "no dependencies" for an entity we could not resolve is
indistinguishable, to a caller about to delete a record, from "this record is safe to delete."

## Layers 2 and 3 — deferred, sketched

Not in scope; recorded so the shape is agreed before Layer 1 constrains it.

**Layer 2 — enforce.** `BaseEntity.ValidateAsync` resolves the discriminator, parses the key and checks the
target exists (batched, policy-gated so hot paths opt out). CodeGen generates the both-or-neither `CHECK` and
the `(discriminator, payload)` index, and stops auto-emitting the discriminator-only FK index on declared
pairs. `OnTargetDelete` wires into `generateCascadeDeletes`. Record merge repoints declared polymorphic links
for free. **This layer needs a report-only mode first** — a validation that suddenly rejects existing dangling
rows in a customer database is a bad day.

**Layer 3 — use.** `RecordID_ResolveAsync()` / `RecordID_Object` on the generated subclass (`EmbeddedRecord`'s
accessor pattern, resolved dynamically). A batch link resolver over the existing `GetEntityRecordNames` LRU,
so a grid of 200 `TaskLink`s costs one round trip. One `<mj-record-link>` replacing the hand-rolled
resolution in `record-tags`, `recent-access`, `list-stats`, `record-attachments` and the rest. Reverse
related-entity tabs — "what points at this record" — generated the way `OrganicKeyRelatedEntityConfig`
already generates its tabs.

---

## Caliber — the subject link, under the publish policy

> **Corrected 2026-09-09 (required change from review).** The original section argued from a deadline that had
> already passed when it was written. It claimed Caliber's packages were at `0.1.0` with no `Metadata_Sync`
> migration, therefore nothing was installed at a customer, therefore the publish-then-no-breaking-changes
> policy did not bind and the fix was "a cheap forward migration over seven tables… after 1.0 publishes it
> becomes a breaking schema change."
>
> **Every step of that is wrong.** Verified independently: the `0.1.0` was read off the *private monorepo root*
> `package.json`; the four **published** packages (`caliber-entities`, `caliber-server`, `caliber-actions`,
> `caliber-ng`) were at **6.1.0** on 27 August and are at **6.2.0** now. The `Metadata_Sync` migration has
> existed since 8 August. The `Build and Publish` workflow has succeeded repeatedly, most recently
> **2026-09-06**, publishing restricted to the public registry per Caliber's `.npmrc`. So the policy **already
> bound** when the plan was written, and the window the section argued from never existed.
>
> The fix is still the right fix. Its cost and shape are not.

`bizapps-caliber` points at "any MJ record" with a `SubjectEntityName NVARCHAR(255)` + `SubjectID` pair.
Because the discriminator is a **name** rather than an FK to `__mj.Entity`, Caliber gets none of what MJ does
provide for the `EntityID` half: no joined `Entity` name column in the base view, no referential guarantee, and
a silent break on any entity rename. It also forces the manual SQL escaping the team already flagged
(`packages/Angular/src/lib/review/clients/caliber-results.client.ts:215-228`), deliberately duplicated across
two packages because the no-cross-package-re-export rule left no better option. A typed link needs none of it.

**The table list in this plan was stale.** Verified against the live Caliber database:

- `Protocol` **has been renamed to `Step`** (`V202608111000__v1.1.x__Rename_Protocol_To_Step.sql`).
- There are **eight** name-based bindings, not seven. Seven carry a record pointer — `Engagement`,
  `AssessmentSession`, `AssessmentOutcome`, `IntakeSubmission`, `InviteScope`, `EntityBindingRecord`, `Note` —
  and `Step` carries a *type* binding (`SubjectEntityName` with no `SubjectID` sibling; NULL = inherit), which
  breaks on a rename for exactly the same reason.
- A ninth, `BlueprintDetectionRule`, has `SubjectEntityName` + `SubjectIDField` — a *field name*, a different
  concept again, and out of scope.
- `Note.SubjectID` is still `UNIQUEIDENTIFIER` while its six siblings are `NVARCHAR(255)`, so that one link
  silently forbids composite and non-GUID keys.

### The fix, under the policy that actually applies

Because Caliber is published inside a major version, rename and retype are **forbidden**
(`packages/OpenApp/PUBLISH_NO_BREAK_POLICY.md`). The sanctioned path is additive-plus-deprecate, and it lands
without a major bump:

1. **Add `SubjectEntityID UNIQUEIDENTIFIER NULL`** on all eight tables, as a real FK to `__mj.Entity(ID)`.
   Permitted — Caliber's rule forbids hard FKs into *sibling Open App* schemas; `__mj` is explicitly fine.
   Nullable even where `SubjectEntityName` is `NOT NULL`, because a required column with no default is itself
   on the forbidden list.
2. **Backfill it** from `SubjectEntityName` by joining `__mj.Entity.Name`.
3. **Keep `SubjectEntityName`** physically present and functional, marked deprecated at the metadata level. It
   is removed only if Caliber ever bumps major — which, per the policy, may be never, and that is fine.
4. **Widen `SubjectID` to `NVARCHAR(750)`** — explicitly *allowed*, since widening is not breaking.
5. **`Note.SubjectID` keeps its published `UNIQUEIDENTIFIER` type** and gains a nullable `NVARCHAR(750)`
   companion. Retyping it would be breaking; a new column is not.

### Why the widen and the typed discriminator must ship together

Measured, not assumed (see D2): after widening `SubjectID` to 750, Caliber's
`UQ_InviteScope_Protocol_Subject_Active` — keyed `(StepID, SubjectEntityName, SubjectID)` — comes to
**2,026 bytes**, over the 1,700-byte nonclustered limit. SQL Server **creates it anyway with only a warning**
and then fails at insert time on a long value. `IDX_AssessmentOutcome_Subject` has the same problem.

Re-keyed onto the 16-byte `SubjectEntityID` instead of the 510-byte name, the same index is **1,532 bytes** and
clean. So the typed discriminator is not merely nicer — **it is what makes the widen safe**, and the two cannot
be sequenced apart.

This also generalises: any of the ten repos whose index keys a `RecordID` alongside another wide column has to
re-key, and must not treat a successful `CREATE INDEX` as evidence that it fits.

### Status

Authored and verified against a restored copy of the live Caliber database: applies clean, **0 unmatched rows
across 503** in the backfill, eight FK constraints enforcing, all three subject indexes re-keyed and no size
warning. The FK now rejects a nonexistent entity id, while `SubjectEntityName` still accepts
`'Totally Not An Entity'` — the guarantee the name never had.

Still outstanding before it can ship: the PostgreSQL counterpart (paired per folder), and the CodeGen output
appended into the same migration file, which Caliber's CI enforces.

**Not attempted here:** re-encoding `SubjectID` to the canonical form. All ten Caliber write sites store a bare
`subjectId`, consistently. Making it canonical is the same problem as Layer 0 item 4 and should follow MJ core
rather than diverge ahead of it.

## Decisions (was: open questions for reviewers)

All four were answered in the 2026-09-08 review. Recorded as decisions so they are not re-litigated.

1. **750 vs 450 — settled at 750, and the question is withdrawn.** It was already answered by this plan's own
   D2: widening is metadata-only, narrowing needs a length scan and is breaking for anything published. 750
   narrows nothing; 450 would mean a ten-table narrowing project. Nothing in review argued for paying that.
2. **`RecordGeoCode` re-encode and the widen: two migrations.** The widen either applies or it does not; the
   re-encode can *partially* apply and needs a rollback story. Bundling them blocks the safe half on the risky
   half.
3. **`OnTargetDelete` default — the question cannot be answered as posed.** Under `Pairing: Required` both
   columns are `NOT NULL`, so `SetNull` violates the constraint on the first cascade. Therefore: **require an
   explicit value for every new declaration**, and **backfill existing pairs as `Ignore`** (today's behaviour).
   Defaulting new links differently from old ones would make two structurally identical pairs behave
   differently according to the date they were declared.
4. **Empty `AllowedEntities` — warn, but not yet.** A warning added today fires on all ~54 existing pairs on
   day one and gets muted, which is worse than silence. Sequence: add an explicit "any entity, deliberately"
   opt-in first, then warn only on pairs that have neither an allow-list nor the opt-in.

### Still genuinely open

Gaps review identified that are *not* yet answered, listed so they are not mistaken for settled:

- **The widen's cost on `RecordChange` and `UserRecordLog` is unmeasured** on realistic row counts. The widen
  being metadata-only (D2) removes the feared index rebuild but is not a substitute for measuring it.
- **No rollback story for the `RecordGeoCode` re-encode.**
- **No plan for the other nine repos** — what each must do, and by when. A declared pair in MJ core changes
  nothing for them, but Layer 2 enforcement eventually will. The re-keying obligation from D2 applies to any
  whose index keys a `RecordID` beside another wide column.
- **Layer 0 item 4 is unscoped.** 88 writers is a number, not a plan; it needs a per-column decision on
  re-encode vs read-through-legacy before it can be estimated.

---

## Revision history

**2026-09-09** — corrections following @rkihm-BC's review of 2026-09-08.

Required changes from that review, both applied:

- The Caliber section argued from a deadline that had already passed, and from package versions read off the
  wrong `package.json`. Rewritten around the deprecation path the publish policy actually mandates.
- One of the three `LoadFromConcatenatedString` corruption paths was superseded by #4184; removed, keeping the
  two that still stand.

Also from that review: the index-size table added to D2; `IX_TagScope_Scope_Tag` corrected to `IDX_`; a single
table count (54 pairs / 53 tables / 10 repos) used throughout; Layer 1's `metadata/`-and-sync seeding mechanism
named; the four open questions converted to decisions; unresolved gaps listed explicitly rather than implied.

New findings from implementing the fixes (#4321), which changed the plan rather than just filling it in:

- **Five encodings ship, not two, and canonical is 2 of 90 write sites.** This falsifies D1's "already the
  majority format", re-scopes Layer 0 around normalising writers, and blocks Layer 1.
- **B5 and B6**, two further defects in the same path. B5 — record merge writing the bare key into a `RecordID`
  column — silently corrupts, and meant B1/B2 could not safely ship on their own.
- **The `ALTER COLUMN` verification item is resolved**: widening an indexed `NVARCHAR` is metadata-only and
  needs no index drop, so the pessimistic assumption can leave the estimate. But an over-limit index is created
  with a *warning* rather than an error and fails later at insert time — which is what forces Caliber's widen
  and typed discriminator to ship together.
- Caliber's table list was stale: `Protocol` is now `Step`, and there are eight name-based bindings, not seven.

---

## Evidence appendix — full inventory

Mechanical scan of every `CREATE TABLE` across MJ core and the app repos, matching any `*Entity(ID|Name)`
column co-resident with a `*RecordID`-shaped column. Excluded as false positives: `SearchScopeEntity` (a real
FK pair) and the two `ExternalSystemRecordID` columns (pointers to foreign systems, not MJ records).

| Repo | Table | Discriminator | Payload | Payload type |
|---|---|---|---|---|
| MJ | AccessControlRule | EntityID | RecordID | NVARCHAR(500) |
| MJ | AIAgentExample | PrimaryScopeEntityID | PrimaryScopeRecordID | NVARCHAR(100) |
| MJ | AIAgentNote | PrimaryScopeEntityID | PrimaryScopeRecordID | NVARCHAR(100) |
| MJ | AIAgentRun | PrimaryScopeEntityID | PrimaryScopeRecordID | NVARCHAR(100) |
| MJ | AIAgentSession | LinkedEntityID | LinkedRecordID | NVARCHAR(500) |
| MJ | ArchiveRunDetail | EntityID | RecordID | NVARCHAR(750) |
| MJ | AuditLog | EntityID | RecordID | NVARCHAR(450) |
| MJ | CompanyIntegrationRecordMap | EntityID | EntityRecordID | NVARCHAR(750) |
| MJ | CompanyIntegrationRunDetail | EntityID | RecordID | NVARCHAR(450) |
| MJ | Conversation | LinkedEntityID | LinkedRecordID | NVARCHAR(500) |
| MJ | DataContextItem | EntityID | RecordID | NVARCHAR(450) |
| MJ | EntityRecordDocument | EntityID | RecordID | NVARCHAR(450) |
| MJ | FileEntityRecordLink | EntityID | RecordID | NVARCHAR(750) |
| MJ | IdentityClaim | EntityID | RecordID | NVARCHAR(255) |
| MJ | ProcessRunDetail | EntityID | RecordID | NVARCHAR(450) |
| MJ | Recommendation | SourceEntityID | SourceEntityRecordID | NVARCHAR(MAX) |
| MJ | RecommendationItem | DestinationEntityID | DestinationEntityRecordID | NVARCHAR(450) |
| MJ | RecordChange | EntityID | RecordID | NVARCHAR(750) |
| MJ | RecordGeoCode | EntityID | RecordID | NVARCHAR(450) |
| MJ | RecordLink | SourceEntityID | SourceRecordID | NVARCHAR(500) |
| MJ | RecordLink | TargetEntityID | TargetRecordID | NVARCHAR(500) |
| MJ | RecordMergeLog | EntityID | SurvivingRecordID | NVARCHAR(450) |
| MJ | RecordProcessWatermark | EntityID | RecordID | NVARCHAR(450) |
| MJ | ScopedPromptConfig | PrimaryScopeEntityID | PrimaryScopeRecordID | NVARCHAR(100) |
| MJ | ScopedPromptPart | PrimaryScopeEntityID | PrimaryScopeRecordID | NVARCHAR(100) |
| MJ | SignatureRequest | EntityID | RecordID | NVARCHAR(450) |
| MJ | TagScope | ScopeEntityID | ScopeRecordID | NVARCHAR(450) |
| MJ | TaggedItem | EntityID | RecordID | NVARCHAR(450) |
| MJ | TemplateParam | EntityID | RecordID | NVARCHAR(2000) |
| MJ | User | LinkedEntityID | LinkedEntityRecordID | NVARCHAR(450) |
| MJ | UserFavorite | EntityID | RecordID | NVARCHAR(450) |
| MJ | UserRecordLog | EntityID | RecordID | NVARCHAR(450) |
| MJ | UserViewRunDetail | EntityID | RecordID | NVARCHAR(450) |
| MJ | VersionLabel | EntityID | RecordID | NVARCHAR(750) |
| MJ | VersionLabelItem | EntityID | RecordID | NVARCHAR(750) |
| bizapps-common | ActivityLink | EntityID | RecordID | NVARCHAR(450) |
| bizapps-common | AddressLink | EntityID | RecordID | NVARCHAR(700) |
| bizapps-tasks | TaskLink | EntityID | RecordID | NVARCHAR(450) |
| bizapps-tasks | TaskAssignment | AssigneeEntityID | AssigneeRecordID | NVARCHAR(450) |
| bizapps-caliber | Engagement | SubjectEntityName | SubjectID | NVARCHAR(255) |
| bizapps-caliber | AssessmentSession | SubjectEntityName | SubjectID | NVARCHAR(255) |
| bizapps-caliber | AssessmentOutcome | SubjectEntityName | SubjectID | NVARCHAR(255) |
| bizapps-caliber | IntakeSubmission | SubjectEntityName | SubjectID | NVARCHAR(255) |
| bizapps-caliber | InviteScope | SubjectEntityName | SubjectID | NVARCHAR(255) |
| bizapps-caliber | EntityBindingRecord | SubjectEntityName | SubjectID | NVARCHAR(255) |
| bizapps-caliber | Note | SubjectEntityName | SubjectID | **UNIQUEIDENTIFIER** |
| bizapps-caliber | Step *(was `Protocol`)* | SubjectEntityName | *(type binding — no payload)* | — |
| bizapps-sonar | Score | AnchorEntityID | AnchorRecordID | NVARCHAR(100) |
| bizapps-sonar | ScoreHistory | AnchorEntityID | AnchorRecordID | NVARCHAR(100) |
| bizapps-accounting | GLAccountLink | EntityID | RecordID | NVARCHAR(400) |
| bizapps-accounting | JournalEntry | LinkedEntityID | LinkedRecordID | NVARCHAR(400) |
| bizapps-orders | OrderLinePriceComponent | SourceEntityID | SourceRecordID | NVARCHAR(400) |
| bizapps-contracts | Contract | CreatingEntityID | CreatingRecordID | NVARCHAR(450) |
| bizapps-forms | FormEntityBindingRecord | TargetEntityID | TargetRecordID | NVARCHAR(750) |
| CDP | UnmatchedItem | MatchedEntityID / TargetEntityName | SourceItemID | NVARCHAR(500) |

Line references are against `next` as of 2026-08-27, and the inventory below is from source and migration SQL
with **no database queried** — which is why several rows drifted.

**Verified against live databases 2026-09-09**, for the parts that mattered:

- Caliber: `Protocol` has been renamed to `Step`, so the row above is listed under both names. Caliber has
  **eight** name-based subject bindings (the seven record pointers plus `Step`), and a ninth table,
  `BlueprintDetectionRule`, holds `SubjectEntityName` + `SubjectIDField` — a field *name*, out of scope.
- The appendix supports **54 pairs across 53 tables in 10 repositories**; MJ core contributes 35 pairs across
  34 tables (`RecordLink` carries two). The v5.46 baseline has 33 pair-bearing tables, one fewer, because this
  scan spans all migrations rather than the baseline alone.
- `CompanyIntegrationRunDetail.RecordID` is listed above but is **not a record pointer** — `IntegrationEngine`
  stores an ad-hoc `EntityMap:<id>` / `Processed:<n>` string in it. It should be dropped from the inventory
  rather than migrated.

The encoding breakdown in section 1 is likewise from a mechanical scan of write sites in source, not from
sampling column contents in a database. Sampling real data per column is a prerequisite for Layer 0 item 4.
