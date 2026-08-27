# Polymorphic Foreign Keys — Making `EntityID`/`RecordID` First Class

**Status:** Plan only. No code in this PR.
**Owners for review:** @rkihm-bc, @ms-bc
**Related:** `EntityField.EmbeddedRecord` (`V202608161735__v6.1.x`), `EntityOrganicKey` / `EntityOrganicKeyRelatedEntity`, `additionalSchemaInfo` soft FKs

---

## Summary

MJ models "a pointer to any record" as an `EntityID` + `RecordID` column pair. The framework understands
the **`EntityID`** half — it is a real foreign key to `__mj.Entity`, so it gets a generated index, a joined
`Entity` name column in the base view, and referential integrity. The framework understands **nothing** about
the `RecordID` half. It does not know the column is a pointer, does not know what it points at, does not
validate it, does not cascade it, and does not index it usefully.

This is not a corner case. A scan of MJ core plus the Open App repos found **~53 of these pairs across ~50
tables in 10 repositories**, including 37 of MJ's own generated entity classes. It is the idiom.

This plan proposes finishing the capability in four layers. **Layers 0 and 1 are the committed scope**;
2 and 3 are sketched and deliberately deferred.

One finding shaped the whole plan: **the declaration slot already exists.** `EntityField.EntityIDFieldName`
has been in the schema since the v2 baseline, documented for exactly this purpose, with consumer code in both
the SQL Server and PostgreSQL providers. It is `NULL` for every field in the system, and its consumer has two
bugs. We are finishing something started around v2 and abandoned — not inventing a concept.

---

## The problem, in evidence

### 1. Two incompatible encodings ship in core today

| Table | Encoding | Written by |
|---|---|---|
| `RecordChange.RecordID` | `ID\|38CB433E-…` — field name included | `SQLServerDataProvider.ts:1517` via `CompositeKey.ToConcatenatedString()` |
| `RecordGeoCode.RecordID` | `38CB433E-…` bare; `val1\|\|val2` for composite | `GeoCodeSyncService.ts:133-141` |

The geocode format is re-derived a second time in T-SQL by the base-view generator
(`sql_codegen.ts:1949-1968`), and the contract between the two implementations is held by a comment on each
side saying "this must match the other."

Consumers cope by sniffing for a `|`. `recent-access.service.ts:250-279` does this, and it is **wrong for a
bare composite key** — `val1||val2` parses to `FieldName=val1, Value=undefined`. That is a live defect in
shared Angular code, waiting for the first composite-PK entity to be geocoded and then viewed.
`record-tags.component.ts:363` implements a second, different sniffer.

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

`ID|<value>` for a single PK; `F1|v1||F2|v2` for a composite. Rationale: it is already the majority format,
it is what `Metadata.GetRecordChanges` assumes, it is self-describing (the field names are in the string), and
it round-trips without needing the entity to interpret it. `RecordGeoCode` is the outlier and migrates.

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
- `IX_TagScope_Scope_Tag` on `(uniqueidentifier, nvarchar(450), uniqueidentifier)` = **932 bytes**
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

> **To verify before Layer 0 lands:** whether `ALTER COLUMN` widening is permitted in place on the columns
> that already carry an index, or whether those indexes need dropping and recreating in the same migration.
> Assume the latter until measured.

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

1. **`CompositeKey.ToRecordID()`** — thin over `ToConcatenatedString()`, but **rejects** a value containing
   the delimiter rather than silently emitting a string that will not round-trip.
2. **`CompositeKey.FromRecordID(entityInfo, s)`** — new, not a rename of `LoadFromConcatenatedString`.
   That function has three silent-corruption paths (`compositeKey.ts:229`):
   - no `|` → silent no-op, `KeyValuePairs` left empty, no signal to the caller. *This is the defect that
     forces every consumer to sniff.*
   - a value containing `|` → `kv[1]` only; the rest is dropped.
   - a value containing `||` → splits into phantom pairs with garbage field names.

   `FromRecordID` parses, then **validates the parsed field names and arity against
   `entityInfo.PrimaryKeys`**, and throws on mismatch. When the string contains no delimiter, it names the
   field from `FirstPrimaryKey` — the same fallback `LoadFromURLSegment` already uses. The name-match check
   is also what safely disambiguates a legacy bare composite (`val1||val2`), which parses cleanly but
   produces field names the entity does not have.
3. **`CompositeKey.FromLegacyRecordID(entityInfo, s)`** — the transitional bare-value path, in exactly one
   place with a name that says it is temporary, replacing the two hand-rolled sniffers.
4. **Migrate `RecordGeoCode`** to the canonical format — data migration plus the one-line change to the geo
   join in `sql_codegen.ts`.
5. **Widen to `NVARCHAR(750)`** across core. Fix the three outliers (`Recommendation`, `TemplateParam`,
   `caliber.Note`).
6. **Write the rule down** — a `guides/` entry, so the next table does not pick a width by feel.

## Layer 1 — Declare it

7. Populate `EntityIDFieldName` for all ~37 core pairs, plus `PolymorphicKey` and
   `EntityFieldPolymorphicTarget` rows.
8. Add a `PolymorphicForeignKeys` block to `additionalSchemaInfo`, so client schemas and Open Apps declare
   theirs the same way they declare soft FKs, IS-A relationships and organic keys today.
9. Surface it on `EntityFieldInfo` so the runtime can read it, not just CodeGen.
10. **Fix the two bugs that would block it** (below).

### Bugs found, to fix as part of Layer 1

**B1 — `BuildSoftLinkDependencySQL` filters on the wrong entity.**
`SQLServerDataProvider.ts:843-874` iterates every entity looking for soft-link fields, then emits
`WHERE [<EntityIDFieldName>] = '${entity.ID}'` — where `entity` is the **holder** of the link, not the entity
of the record whose dependencies are being sought. It looks for `TaskLink` rows pointing at `TaskLink`. The
target entity's ID is never resolved anywhere in the function. `PostgreSQLDataProvider.ts:192-200` has the
same shape.

**B2 — Soft links are gated behind hard links.**
`databaseProviderBase.ts:816-822` returns early when `GetEntityDependencies` finds no FK-based dependents, so
the soft-link SQL is never built for an entity whose only dependents are polymorphic — the exact case it
exists to serve.

**B3 (minor) — encoding assumption.** The same query compares against `compositeKey.GetValueByIndex(0)`, the
bare first PK value, so it assumes the format `RecordChange` does not use. Resolved by D1 + Layer 0.

**B4 (minor) — quoting.** `quotes` is derived from the *holder's* PK type and then applied to both the
entity-ID literal and the RecordID literal. A holder with an integer PK produces malformed SQL.

---

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

## ⚠️ Caliber — must be fixed before Caliber 1.0

`bizapps-caliber` uses `SubjectEntityName NVARCHAR(255)` + `SubjectID` across **seven tables**
(`Engagement`, `AssessmentSession`, `AssessmentOutcome`, `IntakeSubmission`, `InviteScope`,
`EntityBindingRecord`, `Note`). Because the discriminator is a **name** rather than an FK to `__mj.Entity`,
Caliber gets none of what MJ does provide: no joined `Entity` name column in the base view, no referential
guarantee, and a silent break on any entity rename.

It also forces manual SQL escaping, which the team already flagged
(`packages/Angular/src/lib/review/clients/caliber-results.client.ts:215-228`):

```ts
// It matters here and not on the neighbouring GUID filters because
// `SubjectEntityName`/`SubjectID` are free-form NVARCHAR carried in from
// whoever created the engagement, not MJ-minted GUIDs.
function sqlLiteral(value: string): string { return value.replace(/'/g, "''"); }
```

That helper is deliberately duplicated across two packages, with a comment explaining that the
no-cross-package-re-export rule left no better option. A typed link needs none of it.

**Why the deadline matters.** Caliber's npm packages are at `0.1.0` and it ships no `Metadata_Sync` migration
yet — nothing is installed at a customer, so the publish-then-no-breaking-changes policy does not bind and
this is a cheap forward migration over seven tables. **After 1.0 publishes it becomes a breaking schema change
and the cost changes category.**

The fix, two independent changes:

1. `SubjectEntityName NVARCHAR(255)` → `SubjectEntityID UNIQUEIDENTIFIER` FK to `__mj.Entity(ID)`. Permitted —
   Caliber's rule forbids hard FKs into *sibling Open App* schemas; `__mj` is explicitly fine.
2. `SubjectID` → `NVARCHAR(750)` holding the canonical `ID|<guid>`. `Note.SubjectID` is currently
   `UNIQUEIDENTIFIER` and needs the type change regardless.

Tracked as a Caliber-side task; this plan is the reason and the target format.

---

## Open questions for reviewers

1. **750 vs 450.** The plan takes 750 on migration-direction grounds. If there is a reason to prefer 450 that
   is worth a ten-table narrowing project, now is the time.
2. **Layer 0 sequencing.** The `RecordGeoCode` data migration and the widen are separable. Ship as one
   migration or two?
3. **`OnTargetDelete` default.** `Ignore` preserves today's behaviour exactly and is the safe default for
   existing rows. Is `SetNull` the better default for *newly declared* links, given `Pairing` already governs
   whether both columns must be populated?
4. **`AllowedEntities` empty semantics.** Empty = any entity (today's behaviour). Should a declared-but-empty
   list warn at CodeGen time, so "we never got round to constraining this" is visible rather than silent?

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
| bizapps-sonar | Score | AnchorEntityID | AnchorRecordID | NVARCHAR(100) |
| bizapps-sonar | ScoreHistory | AnchorEntityID | AnchorRecordID | NVARCHAR(100) |
| bizapps-accounting | GLAccountLink | EntityID | RecordID | NVARCHAR(400) |
| bizapps-accounting | JournalEntry | LinkedEntityID | LinkedRecordID | NVARCHAR(400) |
| bizapps-orders | OrderLinePriceComponent | SourceEntityID | SourceRecordID | NVARCHAR(400) |
| bizapps-contracts | Contract | CreatingEntityID | CreatingRecordID | NVARCHAR(450) |
| bizapps-forms | FormEntityBindingRecord | TargetEntityID | TargetRecordID | NVARCHAR(750) |
| CDP | UnmatchedItem | MatchedEntityID / TargetEntityName | SourceItemID | NVARCHAR(500) |

Line references are against `next` as of 2026-08-27. No database was queried; all findings are from source and
migration SQL.
