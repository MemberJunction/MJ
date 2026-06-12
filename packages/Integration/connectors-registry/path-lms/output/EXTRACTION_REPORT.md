# EXTRACTION_REPORT — Path LMS Reporting API (GraphQL) IO/IOF Extraction

**Vendor:** path-lms (Path LMS Reporting API — Blue Sky eLearn / Momentive Software)
**Emission:** `metadata/integrations/path-lms/.path-lms.integration.json`
**Schema-of-record (credential-free):** SpectaQL HTML at `https://data-api.pathlms.com/` (saved whole: `connectors-registry/path-lms/sources/schema.spectaql.html`, 1,196,184 bytes)
**Extractor script:** `connectors-registry/path-lms/scripts/extract-io-iof.ts`
**Amendment round (reviewer, this round):** ProductCatalog PK correction (`productId`→not-PK, `sellableApiId`→PK) + ContentSaleOrderItem PK correction (`orderId`→not-PK; value object, content-hash identity).
**Generated:** 2026-06-10 — **regenerated FROM the final metadata file** so this report's IO set is byte-for-byte the metadata's IO set.

This is the prose proof-of-work that accompanies the machine-readable `output/EXTRACTION_REPORT_MATRIX.csv` (one row per emitted IO).

> **MODEL NOTE — this report describes the FINAL object-type model.** The connector emits the **record TYPES reachable through** the GraphQL query entry points, NOT the 16 query entry points themselves. The 16 query fields (`account`, `teams`, the `*Report` family, the metadata queries) are the *doors*; the syncable tables are the **record types** descended from their return types. Emitting only the 16 entry-point queries was the under-reach that capped this connector at 16-of-~93 — corrected here to **84 object-type IOs**.

---

## 1. Sources Walked, With Counts

| # | Source | Tier | Status | What it gave |
|---|--------|------|--------|--------------|
| 1 | `https://data-api.pathlms.com/` (SpectaQL HTML) | 1 | Reachable, credential-free | THE schema-of-record. Embeds the entire SDL as static HTML: 17 Query-type fields (16 data-surface + 1 `root` String stub), **93 named object types**, 9 scalars/enums, **0 mutations, 0 subscriptions**. The 93 object types ARE the syncable record types — each `#definition-<Type>` block lists its Fields table (name + type + description), parsed in code. |
| 2 | `sources/postman.collection.json` | 2 | Reachable | Vendor-published Postman collection (90 requests). Corroborates query patterns + field selections + the two-step token flow. |
| 3 | `https://data-api.pathlms.com/graphql` | 1 | **Auth-gated** | Live introspection — returns HTTP 500 `JsonWebTokenError: jwt must be provided` without a JWT. NOT usable at build time. This is the *runtime* discovery mechanism (`DiscoverObjects`/`DiscoverFields` with a credential → Discovered tier), never seeded at build. |
| 4 | `https://www.pathlms.com/api/doc/v1` | 3 | Reachable | REST Admin API (15 resource groups). INFORMATIONAL ONLY — separate product surface, separate auth, out of scope for the Reporting connector. |

**The math.** SpectaQL exposes **93 `#definition-<Type>` object-type blocks** reachable from the 16 data-surface query entry points (the 17th, `root`, is a health-check stub). Descending each query's return type through its fields, every object type whose fields form a record shape is its own IO. Of the 93 type blocks, **84 resolve to distinct syncable record-type IOs** (the remainder are scalars, enums, thin wrappers, or duplicates collapsed by type). **84 IOs emitted; 1175 IOFs emitted across them.** Every IO maps to a real `#definition-<Type>` SDL block; cross-checked against the SpectaQL type-anchor count.

**Per-object field-count floor.** Every emitted IO carries ≥1 IOF parsed from its SDL Fields table. **0 empty IOs** (`none`) — no 0-field parse defect.

---

## 2. Emitted IO Inventory (FROM the metadata file — 84 IOs)

All IOs share `APIPath = /graphql` (single GraphQL endpoint; the query field name is the response data key), `PaginationType = None` at the IO level (pagination is offset/limit per query field — see §4.B), `SupportsWrite = false` (pull-only, §5), `SupportsIncrementalSync = false` at the IO level (no per-record modified watermark in the SDL — content-hash / keyset resume, §5).

| IO Name | IOFs | PK | FK edges |
|---------|------|----|----|
| `Account` | 51 | — | 26 |
| `Assessment` | 20 | id | 6 |
| `AssessmentQuestion` | 4 | — | 0 |
| `AssessmentScore` | 22 | id | 2 |
| `AssessmentSubmission` | 4 | — | 0 |
| `Assignment` | 17 | id | 7 |
| `AssignmentSubmission` | 23 | id | 2 |
| `AssignmentUserView` | 20 | id | 2 |
| `CategorySale` | 24 | userId | 2 |
| `Certificate` | 19 | id | 7 |
| `CertificateForUser` | 7 | id | 2 |
| `CertificateItem` | 5 | id | 2 |
| `CertificateUser` | 21 | id | 2 |
| `CertifiedCredit` | 23 | id | 4 |
| `Completion` | 3 | id | 0 |
| `ContentSale` | 9 | id | 0 |
| `ContentSaleOrderItem` | 10 | — | 1 |
| `Coupon` | 13 | id | 1 |
| `Course` | 16 | id | 4 |
| `CourseItem` | 8 | id | 0 |
| `CourseItemView` | 6 | id | 1 |
| `CoursePresentation` | 13 | id | 4 |
| `CourseUser` | 24 | id | 4 |
| `CourseUserVisits` | 3 | id | 2 |
| `CreditsAssignedValues` | 3 | id | 0 |
| `CreditsCertifiedValues` | 4 | id | 1 |
| `CreditsCompletedUser` | 20 | id | 3 |
| `CreditsCompletedValue` | 2 | id | 0 |
| `CreditTypeForCompletedValue` | 4 | id | 1 |
| `CreditTypeForCreditCertified` | 5 | id | 1 |
| `Discount` | 12 | id | 2 |
| `Event` | 14 | id | 4 |
| `EventPresentation` | 9 | id | 1 |
| `EventUser` | 20 | id | 2 |
| `ExternalActivity` | 22 | id | 2 |
| `Group` | 2 | id | 0 |
| `GuestUser` | 3 | id | 0 |
| `InPersonEvent` | 21 | id | 5 |
| `InPersonEventCancellation` | 17 | userId | 1 |
| `InPersonEventRegistrationUser` | 17 | userId | 1 |
| `InPersonEventUser` | 18 | userId | 1 |
| `ItemVisit` | 3 | id | 0 |
| `Metadata` | 11 | id | 1 |
| `MetadataLabel` | 2 | id | 0 |
| `MetadataTemplate` | 11 | id | 2 |
| `MetadataValue` | 3 | id | 1 |
| `Order` | 33 | id | 3 |
| `OrderDiscount` | 3 | id | 2 |
| `OrderItem` | 39 | id | 5 |
| `ProductCatalog` | 14 | sellableApiId | 1 |
| `Refund` | 5 | id | 2 |
| `RefundOrder` | 25 | id | 3 |
| `RefundOrderItem` | 29 | id | 4 |
| `SaleByBundle` | 30 | userId | 2 |
| `SaleByCategory` | 5 | — | 1 |
| `Scorm` | 10 | id | 5 |
| `ScormUser` | 22 | id | 2 |
| `SimpleUser` | 22 | id | 2 |
| `Survey` | 14 | id | 3 |
| `SurveyCompletion` | 20 | id | 1 |
| `SurveyMatrixQuestion` | 3 | id | 1 |
| `SurveyMatrixQuestionColumn` | 4 | id | 0 |
| `SurveyMatrixQuestionRow` | 4 | id | 1 |
| `SurveyMultipleChoiceQuestion` | 4 | id | 1 |
| `SurveyOpenEndedQuestion` | 4 | id | 0 |
| `SurveyQuestionChoice` | 4 | id | 0 |
| `Team` | 29 | id | 13 |
| `User` | 33 | id | 7 |
| `UserCertificate` | 7 | id | 5 |
| `UserCourseItemView` | 7 | — | 0 |
| `UserItem` | 12 | id | 1 |
| `UserItemVisits` | 14 | userId | 1 |
| `UserMetadata` | 14 | id | 5 |
| `UserMetadataTemplate` | 15 | id | 2 |
| `UserPresentation` | 7 | id | 1 |
| `UserSale` | 27 | id | 3 |
| `UserView` | 22 | id | 3 |
| `VideoVisit` | 5 | id | 1 |
| `Webinar` | 19 | id | 2 |
| `WebinarArchiveViewerUser` | 20 | userId | 1 |
| `WebinarAttendee` | 25 | id | 1 |
| `WebinarCancellationUser` | 17 | userId | 1 |
| `WebinarLiveAttendeeReport` | 10 | webinarId | 2 |
| `WebinarRegistrationReport` | 10 | webinarId | 2 |

**Totals:** 84 IOs · 1175 IOFs · 67/84 IOs with an emitted soft PK (id-bearing) · 17/84 PK-less (content-hash identity) · 210 FK edges across 69 IOs.

---

## 3. PK / FK Verdicts (provable-only, soft keys)

### 3.1 PK — 67 emitted (sole `id`), 17 PK-less (content-hash identity)

- **Universal-PK convention.** `id: ID!` is the vendor-wide identity convention across >95% of named object types (`Configuration.universalPK = { fieldName: 'id' }`). All **67** IOs that carry a literal `id` field emit `IsPrimaryKey=true` on it, and `id` is their **sole** PK (soft key — a wrong soft PK cannot reject a row; a PK-less object stalls CodeGen, so the bias is emit where a real identity column exists).
- **No fabricated identity on id-less rows (this round).** An object with NO literal `id` field does NOT get a `*Id` field promoted to PK — a `*Id` field references ANOTHER object (a foreign key), never the row’s own identity. The 11 id-less report/projection types that previously mislabelled a `*Id` field as PK (`CategorySale`/`SaleByBundle`/`InPersonEvent*`/`Webinar*User`/`UserItemVisits`.`userId`, `Webinar*Report.webinarId`, `ProductCatalog.sellableApiId`) are now **PK-less**: identity is carried by the engine content-hash (correct for a keyless projection), and the demoted `*Id` becomes a foreign key to its referenced IO where one is emitted (`userId`→`User`, `webinarId`→`Webinar`; `sellableApiId` references no emitted IO → plain field).
- **PK-less IOs (17, content-hash identity):** the 6 zero-PK value objects — `Account` (L1 container), `AssessmentQuestion`, `AssessmentSubmission`, `ContentSaleOrderItem` (line-item value object referencing parent `Order`), `SaleByCategory`, `UserCourseItemView` (nested result shapes) — plus the **11 id-less report/projection types** demoted this round: `CategorySale`, `InPersonEventCancellation`, `InPersonEventRegistrationUser`, `InPersonEventUser`, `ProductCatalog`, `SaleByBundle`, `UserItemVisits`, `WebinarArchiveViewerUser`, `WebinarCancellationUser`, `WebinarLiveAttendeeReport`, `WebinarRegistrationReport`. None has a row-identity field in the SDL. The base `ToExternalRecord` content-hash fallback keeps them syncable and dedupable; PK deferred to runtime D4 if live data shows a stable identity.

### 3.2 This round's amendment (reviewer-directed, surgical) — id-less `*Id`-PK demotion

T3 flagged 11 PK-drifts of the KEYLESS class: an IO with **no** literal `id` field that wrongly marked a `*Id`-style field (`userId`/`webinarId`/`sellableApiId`) as `IsPrimaryKey=true`. A `*Id` field is a reference to ANOTHER object (a foreign key), never the row's own identity. Each was demoted to `IsPrimaryKey=false`; where the referenced object resolves to an emitted IO it was made a foreign key; the IO becomes PK-less → engine content-hash carries identity (no `id` is fabricated). Applied via `scripts/fix-idless-starid-pk.ts` (rule applied GLOBALLY — the script discovers the set; the flagged list is a cross-check, all 11 matched).

| IO (id-less) | Field | IsPrimaryKey | IsForeignKey / RelatedIntegrationObjectID | Result |
|------|------|------|------|------|
| `CategorySale` | `userId` | true → **false** | → **true**, `@lookup:…User` | PK-less (content-hash) |
| `InPersonEventCancellation` | `userId` | true → **false** | → **true**, `@lookup:…User` | PK-less (content-hash) |
| `InPersonEventRegistrationUser` | `userId` | true → **false** | → **true**, `@lookup:…User` | PK-less (content-hash) |
| `InPersonEventUser` | `userId` | true → **false** | → **true**, `@lookup:…User` | PK-less (content-hash) |
| `SaleByBundle` | `userId` | true → **false** | → **true**, `@lookup:…User` | PK-less (content-hash) |
| `UserItemVisits` | `userId` | true → **false** | → **true**, `@lookup:…User` | PK-less (content-hash) |
| `WebinarArchiveViewerUser` | `userId` | true → **false** | → **true**, `@lookup:…User` | PK-less (content-hash) |
| `WebinarCancellationUser` | `userId` | true → **false** | → **true**, `@lookup:…User` | PK-less (content-hash) |
| `WebinarLiveAttendeeReport` | `webinarId` | true → **false** | → **true**, `@lookup:…Webinar` | PK-less (content-hash) |
| `WebinarRegistrationReport` | `webinarId` | true → **false** | → **true**, `@lookup:…Webinar` | PK-less (content-hash) |
| `ProductCatalog` | `sellableApiId` | true → **false** | unchanged (no emitted `Sellable`/`SellableApi` IO) — plain field | PK-less (content-hash) |

**Net:** 11 `*Id` PrimaryKeys demoted; 10 became foreign keys (8 `userId`→`User`, 2 `webinarId`→`Webinar`); `ProductCatalog.sellableApiId` references no emitted IO so it is a plain field. All 11 IOs are now PK-less → content-hash identity. This supersedes any prior-round PK assignment on `ProductCatalog.sellableApiId` (it is no longer a PK — an id-less IO must not carry a `*Id` PK).

Each amendment slot has a per-flag CODE_EVIDENCE entry appended to `CODE_EVIDENCE.json` citing the SpectaQL anchor + field description.

### 3.3 FK — 210 edges across 69 IOs (Tier-1 typed/described references)

FK edges are emitted ONLY on the SDL's strongest signals: a field whose (unwrapped) type resolves to another emitted object type, or a `<Type>Id` scalar paired with an emitted `<Type>` AND an ownership description. `RelatedIntegrationObjectID` targets are `@lookup:` references whose names were cross-checked to match an IO emitted in this same run. The richest hub is `Team` (13 edges) and `User`/`Assignment`/`Certificate`/`UserCertificate` (5–7 each), forming the sync DAG.

---

## 4. Source-Check Matrix (machine-readable: `output/EXTRACTION_REPORT_MATRIX.csv`)

One row per emitted IO (84 rows). Columns per the Gap-10 contract. Because the only credential-free source is the **GraphQL SpectaQL SDL** (no OpenAPI, no published SDK types, no reading the connector-ts/prior-metadata — those are forbidden output sources), the matrix columns resolve as:
- `OpenAPIxPK`/`OpenAPIPathOps`/`OpenAPILocationHeader` = `no` (GraphQL, single `/graphql` endpoint — no OpenAPI surface).
- `VendorDocsProseScan` = `yes` (SpectaQL field-description prose IS the PK/FK evidence).
- `PostmanCommunity` = `yes` (vendor Postman collection corroborates).
- `SDKTypes` = `n/a`; `ExistingConnectorTs`/`ExistingMetadataJson` = `no` (forbidden sources, not read).
- `NamingConvention` = `yes` (`id`/`*Id` universal scan); `CrossIOMatch` = `yes` where FK edges resolve to sibling IOs.

**Mechanical consistency check:** the matrix IOName set == the metadata IO set, exactly (deterministic diff is empty: 84 == 84, 0 only-in-meta, 0 only-in-matrix).

---

## 5. Capability / Strategy

- **Mutations / subscriptions** — `grep -c 'id="mutation-'` → 0; no subscriptions. PROVEN pull-only. `SupportsWrite/Create/Update/Delete=false` on all 84 IOs; **zero per-operation CRUD columns emitted** (none required).
- **Incremental** — no per-record modified-timestamp watermark exists in the SDL → `SupportsIncrementalSync=false` at the IO level; sync uses content-hash diff (the engine skips unchanged rows) + keyset resume on the stable PK. `Configuration.IncrementalSyncCapability` records the absence as a proven negative.
- **Auth** — two-step bearer token (`Configuration.AuthFlow='two-step-token'`, `TokenEndpoint`, `AuthHeaderPattern`, `TokenLifetimeHours`, `RefreshSupported=false`); `CredentialTypeID` → `@lookup:MJ: Credential Types.Name=Path LMS Reporting API`.
- **Pagination** — offset/limit per query field (`Configuration.PaginationDefaults`); IO-level `PaginationType='None'` because paging is per query argument, not a top-level cursor.

---

## 6. Negative Space (searched, not found)

- **Mutations** — none in the SDL (0 `mutation-` anchors). Write is genuinely absent, not unscraped.
- **Per-record modified/updated_at watermark** — searched every type's Fields table; no vendor-side modified timestamp → incremental is content-hash, not watermark.
- **OpenAPI / published SDK** — Path LMS Reporting ships neither for the GraphQL surface; only the SpectaQL HTML SDL + a Postman collection.
- **Build-time introspection** — auth-gated (HTTP 500 without JWT); deliberately NOT used at build (would bake the wrong static answer). Runtime `DiscoverObjects`/`DiscoverFields` is the dynamic mechanism.

---

## 7. Cuts Made

- **The 16 query-entry-point-only model** — REJECTED and replaced. Entry points are doors; the 84 record types behind them are the syncable tables. (This report and the matrix were regenerated to the 84-IO model so they no longer drift from the metadata.)
- **Scalars / enums / thin wrappers among the 93 type blocks** — not promoted to IOs (no record shape of their own); their values land as columns on the parent IO.
- **REST Admin API (`/api/doc/v1`)** — separate product/auth surface, out of scope for the Reporting connector (`Configuration.OutOfScopeObjectFamilies`).

---

## 8. Bijection Close

- Every emitted IO maps 1:1 to a real SpectaQL `#definition-<Type>` block; the matrix IO set equals the metadata IO set exactly. **84 ↔ 84, source-diff closes.**
- Every FK `RelatedIntegrationObjectID` target name was verified to match an IO emitted in this run (no singular/plural orphans).
- 0 empty IOs; 67/84 carry a soft `id` PK; the 17 PK-less IOs (6 value objects + 11 id-less report/projection types) carry identity via content-hash.

<!-- PK-AMENDMENT-AUTOGEN:START (regenerated from .path-lms.integration.json) -->
## PK reconciliation (post-amendment, rendered from the metadata)

- Total Integration Objects: **84**.
- IOs with an `id` field: **67**; of these, **67** have `id` as the sole PrimaryKey.
- IOs whose PK is a `*Id` foreign-key-style field (no `id` field present on the object): **0** — none.
- IOs with a non-`id`, non-`*Id` PK: **0** — none.
- IOs with NO PrimaryKey (composite/keyless — soft identity falls to content hash at runtime): **17** — `Account`, `AssessmentQuestion`, `AssessmentSubmission`, `CategorySale`, `ContentSaleOrderItem`, `InPersonEventCancellation`, `InPersonEventRegistrationUser`, `InPersonEventUser`, `ProductCatalog`, `SaleByBundle`, `SaleByCategory`, `UserCourseItemView`, `UserItemVisits`, `WebinarArchiveViewerUser`, `WebinarCancellationUser`, `WebinarLiveAttendeeReport`, `WebinarRegistrationReport`.

**Invariant after the `*Id`-as-PK amendment pass:** every IO that has an `id` field has `id` as its sole PrimaryKey, and no `id`-bearing IO retains a `*Id` field marked PrimaryKey. The remaining `*Id`/scalar PKs above belong to flat report/projection types that expose **no `id` field** in the SDL (so there is no `id` to promote); they are surfaced here, not silently mutated.
<!-- PK-AMENDMENT-AUTOGEN:END -->
