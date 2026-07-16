# SOURCE_STUDY — re:Members AMS (formerly Impexium)

**Vendor slug**: `impexium` · **Category**: Association Management Software (AMS) · **Audited**: 2026-07-11

**Disambiguation (binding)**: This is **Impexium**, the AMS platform rebranded **re:Members AMS** (Community
Brands). It is a completely different company from **ImpexDocs** (`apidocs.impexdocs.com`), an
export/shipping-logistics documentation vendor — a pure name collision. `apidocs.impexdocs.com` was
**never fetched, cited, or used** anywhere in this study. Also distinct from other Community Brands AMS
products (e.g. MemberSuite).

---

## 0. Key finding up front — the swagger outranks the prose page, provably

The Microsoft Learn connector reference page (`learn.microsoft.com/en-us/connectors/impexium/`) is
*generated from* the same swagger this audit pulled raw — yet the rendered page summarized "no triggers
documented, actions only." The raw `apiDefinition.swagger.json` proves this wrong: it contains **14 real
webhook triggers** (`x-ms-trigger: "single"` + `x-ms-notification-content` on 14 distinct
`/api/v1/Webhooks/*` paths — `IndividualCreated`, `Individual.Deleted`, `Individual.RequestToBeForgotten`,
`ProductPurchased`, `CommitteeMemberUpdated`, `PurchaseCancelled`, `RequestUpdated`, `EmailUpdated`,
`Customer.CustomFieldValueUpdated`, `Customer.Merged`, `Customer.RelationshipUpdated`,
`Customer.PhoneUpdated`, `Customer.AddressUpdated`, `Event.Registration.Substituted`, `Purchase.Paid`,
`Membership.Terminated`). This is a concrete, in-audit demonstration of the rule "acquire the machine-readable
schema RAW, in code, first" — a `WebFetch`-summarized prose page silently dropped an entire trigger surface
that the raw bytes prove exists.

## 1. Acquisition — how the swagger was found and pulled

The MS Learn page links to a **GitHub docs-source** (`MicrosoftDocs/BusinessApplicationPlatform-Connectors`,
`docs/impexium/index.yml`, both `live` and a pinned commit) — both returned `404` (the docs-generation repo
is evidently private or renamed; this is the *rendered docs* source, not the *swagger* source, and was a dead
end regardless). The actual swagger source lives in the **public, well-known** `microsoft/PowerPlatformConnectors`
GitHub repository, which many certified ISV connectors publish into under
`certified-connectors/<ConnectorFolderName>/apiDefinition.swagger.json`. Impexium's folder name (`Impexium`)
does not appear in a truncated file listing (the repo has hundreds of connectors), so it was found by directly
constructing and curling the expected raw-content URL — which resolved on the first attempt:

```
https://raw.githubusercontent.com/microsoft/PowerPlatformConnectors/dev/certified-connectors/Impexium/apiDefinition.swagger.json
```

Pulled in full via `curl` (843,708 bytes) and saved to `sources/apiDefinition.swagger.json` — **never**
summarized through `WebFetch`. The sibling `apiProperties.json` (connection-parameter + auth-policy metadata,
1,171 bytes) was pulled the same way into `sources/apiProperties.json`. A flattened, script-generated
path/method/operationId/tag/response-ref table (121 rows) was written to `sources/full-operation-list.txt` so
the extractor never has to re-parse the 843KB file in-context.

## 2. Enumeration — script output, not an in-context read

Ran the shared enumerator:

```
node packages/Integration/connector-builder-workshop/floor/enumerate-catalog.mjs sources/apiDefinition.swagger.json
```

**Stdout** (format `openapi-json`, confidence `high`): **`count: 73`** record types (from `definitions`),
**`fieldCount: 573`**. Independent in-file cross-check: `Object.keys(swagger.definitions).length === 73` —
agrees exactly with the enumerator's `count`. This is `EnumerationStdoutCount = 73` and is the enumerated
universe `E` for this source.

**One documented enumerator limitation, cross-checked manually**: the enumerator (correctly, per its own
design) walks only **named** `$ref`-able `definitions`. Swagger 2.0 permits **inline anonymous** response
schemas that never get a name in `definitions` — and this vendor's spec has exactly **one** coverable object
hidden this way: `GET /api/v1/Setup/customfields/1` ("List of all custom fields") returns an inline
`{pageNumber, dataList: [{name, caption, description, dataType, inputType, availableValues}]}` schema with no
`$ref`. This is a genuine, real, paginated list endpoint for the **Custom Field Definitions** catalog — found
by a follow-up script that scanned every operation's `200`/`default` response for an object-typed schema with
no `$ref` anywhere in its tree (2 other inline hits: `Add-To-Committee`'s write-response and
`Find-Customer-Phone`'s cross-type lookup result — both folded into existing leaves, see the ledger). This
object is included **additively, outside `E`**, with the reasoning documented below (§4 ledger).

## 3. Source structure, patterns, and idiosyncrasies (the swagger)

- **Envelope convention**: every list ("Get All X" / "List X") response is `{ pageNumber: int, dataList: T[] }`
  — a completely consistent envelope across all 116 paths that return collections. `ResponseDataKey = "dataList"`
  for every list-shaped IO in this vendor; there is no vendor that varies this (no `results`/`data`/`items`
  alternates observed anywhere in the spec).
- **Pagination — page number IN THE PATH, not a query param**: every list endpoint's page cursor is a **path
  segment**, not `?page=`. Naming of that segment varies cosmetically (`{Page Number}`, `{pageNumber}`,
  `{Page}`) but the *mechanic* is uniform: `GET /api/v1/Individuals/{Page Number}`,
  `GET /api/v1/Events/All/{Page Number}`, `GET /api/v1/Committees/{Code}/subcommittees/{Page Number}`, etc. →
  `PaginationType = PageNumber`, and the `APIPath` for every list IO must retain the literal path-segment
  template (e.g. `/api/v1/Individuals/{Page Number}`), not strip it to a query-string form. **No explicit
  page-size value (e.g. "250 records/page") appears anywhere in the swagger** — no `maxItems`, no
  description text mentioning a count. This could not be confirmed from any reachable source (see Gaps).
- **Nested access-path convention**: most "detail" collections (Memberships, Registrations, Relationships,
  Purchases, Orders, Certifications, Subscriptions, Licenses, Committees-for-an-individual) are exposed as
  **child paths off `/Individuals/{ID}/...` or `/Organizations/{ID}/...`**, not as independent top-level
  collections with their own scalar FK query param. Per the FK/access-path convention, these are
  **access-paths**, not scalar FKs — e.g. `GET /api/v1/Individuals/{ID}/Memberships/Inactive` is how you reach
  Membership records; there is no `GET /api/v1/Memberships?individualId=X`. The Memberships/Relationships/
  Certifications/Subscriptions objects are still independently COVERABLE (they have their own field shape,
  independent of the parent), but their `Configuration` must record the entry-door + nesting path
  (`Individuals/{ID}/Memberships/Inactive` and the `Organizations/{ID}/Memberships/Inactive` sibling door),
  not a `RelatedIntegrationObjectID` FK.
- **Two access-doors, one record (a real "container-fold")**: the Event-Registration record is reachable from
  **both** the Individual side (`GET /Individuals/{ID}/Registrations/{Page}` → schema `RegistrationData`) and
  the Event side (`GET /Events/{Code}/Registrations/{Page}` → schema `RegistrantData`, a richer view that
  embeds the full individual profile). Field-overlap check (both share `registrationNumber`,
  `registrantTypeCode`, `badgeName`, `sessions`, `boughtTogetherWith`) proves these are the **same conceptual
  record** viewed from two doors, not two objects — folded into one COVERABLE leaf, "Event Registrations &
  Registrants," with two documented access paths.
- **Self-referential hierarchy, not a new type**: "Get Sub-Committees" (`GET
  /Committees/{Code}/subcommittees/{Page Number}`) returns `dataList: CommitteeData[]` — the exact same
  schema as the top-level Committees list. Sub-committees are **not** a distinct object; they are Committees,
  reached via a recursive access path. Folded into the "Committees" leaf.
- **Write-shape variants, not new types**: many definitions are pure **request-body** shapes for a
  create/update action on an already-covered object — `*SaveData`, `*CreateData`, `*UpdateData` suffixes
  (`TaskSaveData`, `CommitteeMemberCreateData`, `CommitteeMemberUpdateData`, `CommitteeNomineeSaveData`,
  `RequestSaveData`, `RequestUpdateData`, `UpdateAwardNominationData`, `ExamScoreResultData`, `BaseNoteData`).
  These are container-folded into their base object's leaf (e.g. `TaskSaveData` → Tasks), not counted as
  independent leaves — otherwise every writable object would silently double- or triple-count.
- **Search/lookup result variants are NOT new objects**: `ContactData` (used by "Find Members by Name"),
  `IndividualLookupBasicData`, `OrganizationLookupBasicData`, and the inline "Find Customer by Phone Number"
  result shape are all **cross-type search-result projections** of the same underlying Individual/Organization
  records (thinner field sets, a `customerType` discriminator). Classified INFORMATIONAL — they inform how
  search/lookup endpoints should be modeled (as query variants of Individuals/Organizations), not as new
  syncable tables.
- **Contact-mechanism and category sub-objects fold into their parent, not new leaves**: `EmailData`,
  `PhoneDataSet`/`PhoneSaveData`, `AddressSaveData`, `SaveCategoryBasicData` have **no independent GET-list
  endpoint** — they exist only as add/update sub-actions against an Individual or Organization, and the parent
  object's own schema (`IndividualData`) already carries `emails`, `phones`, `addresses`, `categories` as
  nested array fields. These are INFORMATIONAL (nested field-shape evidence for the parent's field map), never
  independent leaves.
- **Custom-field VALUES vs. custom-field DEFINITIONS is a real, provable split**: `CustomFieldData` /
  `CustomFieldValueData` / `CustomFieldResultData` are per-record **value** shapes nested under an Individual
  or Organization (`GET/POST /Individuals/{ID}/CustomFields`) — INFORMATIONAL, folds into the parent's own
  `customFields` field. But `GET /api/v1/Setup/customfields/1` ("List of all custom fields") is a genuinely
  independent, tenant-wide **definitions catalog** (name/caption/description/dataType/inputType/availableValues)
  with its own pagination and no parent record — COVERABLE, its own leaf ("Custom Field Definitions"), even
  though it's an inline (unnamed) schema outside the 73 counted `definitions` (§2).
- **Webhook/notification payloads are event schemas, not syncable tables**: the 12 `*Payload`-suffixed
  definitions (`CustomerMergedPayload`, `IndividualPayload`, `ProductPurchasePayload`,
  `MembershipTypeTerminatedPayload`, etc.) are the `x-ms-notification-content` bodies for the 14 webhook
  triggers (§0). They largely mirror fields already covered by Individuals/Organizations/Memberships/Orders —
  classified INFORMATIONAL (they inform an eventual webhook-driven incremental-sync strategy note, not a new
  IO).
- **Provable write-surface asymmetry**: `POST /api/v1/Individuals` and `POST /api/v1/Organizations` both exist
  (Create, flat body, ID returned in the full response body's `id` field — `CreateBodyShape=flat`,
  `CreateIDLocation=body`). `PUT /api/v1/Organizations/{id}` exists (Update, flat body, id in path). **There is
  no whole-record `PUT`/`PATCH` for Individuals** — only field-scoped sub-updates (email, phone, address,
  custom fields). **There is no `DELETE` for Individuals, Organizations, Committees, Awards, Events**, or any
  other top-level entity — the only documented deletes in the entire 116-path surface are narrow sub-resource
  deletes: `DELETE /Individuals/{RecordNumber}/Categories/{Code}`,
  `DELETE /Organizations/{RecordNumber}/Categories/{Code}`, `DELETE /Individuals/{ID}/Links`,
  `DELETE /Organizations/{ID}/Links`, `DELETE /CustomData/{TableName}/{ID}`, and `DELETE /Webhooks/{Id}`. This
  is a real, provable constraint (`SupportsDelete=false` for essentially every COVERABLE leaf) — not an
  extraction miss.
- **Incremental cursor is the exception, not the rule**: of all 37 COVERABLE leaves, only **two** documented
  query-parameter incremental filters exist anywhere in the 116 paths: `changedSince` on `List-of-Exams`
  (`GET /api/v1/Products/Exams/{Page Number}`) and `purchasedSince` on `Get-Purchases-for-an-Individual`
  (`GET /api/v1/Individuals/{ID or Record Number}/Purchases/{Page Number}`). `List-all-Individuals` (the single
  highest-volume object) has **no** `modifiedSince`/`changedSince`/`lastModified` query parameter, and
  `IndividualData`'s own field list has **no** `modifiedOn`/`lastModified` field at all — confirmed by
  inspecting its full property list. So `SupportsIncrementalSync=true` is provable for exactly 2 of 37 leaves;
  every other leaf is full-refresh-only per this source (see Gaps).
- **Auth mechanism — resolved, not ambiguous**: `apiProperties.json` declares connection parameters `hostUrl`
  (user's own tenant, e.g. `https://abc.mpxapi.com`) and `api_key` (securestring), plus a
  `policyTemplateInstances` entry using the `dynamichosturl` APIM policy template
  (`"x-ms-apimTemplateParameter.urlTemplate": "@connectionParameters('HostUrl')/"`). The swagger's own
  `securityDefinitions` declares `{"API Key": {type: apiKey, in: header, name: "x-api-key"}}`. Read together,
  this is unambiguous, Tier-1, `ExplicitStatement` evidence: **the documented paths in this swagger ARE the
  real per-tenant REST API paths** (e.g. `/api/v1/Individuals/{Page Number}`), hit directly against the
  customer's own `https://{tenant}.mpxapi.com` host with an `x-api-key` header — the APIM `dynamichosturl`
  policy simply rewrites the swagger's placeholder `host: automation.impexium.com` to the tenant's real host at
  call time. (A prior internal planning note in this vendor folder speculated the raw API might use a
  different "App+User token handshake" auth flow, citing unverifiable help-center text about an
  `AppToken`/authenticate-the-user JS helper. That text lives on `help.remembers.com`, which is fully
  login-gated — see Gaps — and could not be independently confirmed. This audit ranks the swagger's explicit,
  Tier-1 `x-api-key` scheme as the primary claim and flags the alternate as an unconfirmed residual pending
  sandbox/live verification.)
- **Rate limit — confirmed, Tier-1, from the rendered MS Learn page's own throttling table** (not prose, an
  actual `<table>` with `Name / Calls / Renewal Period` rows): **100 API calls per 60 seconds per connection**.
  This is the MS-connector-layer/APIM throttle, not necessarily the raw tenant host's own limit — recorded in
  `Configuration` with that caveat, per the connector-code-conventions rule ("Configuration awareness; set
  Batch* only if RAW API limit documented, else null").

## 4. The ledger — accounting for every one of the 73 enumerated definitions (+1 additive)

`|E| = 73` (script-enumerated). Every one of the 73 is bucketed below; the count closes exactly.

| Bucket | Count | Detail |
|---|---:|---|
| **COVERABLE — consumed by named-def leaves** | 48 defs → **36 leaves** | 12 defs are write-shape/self-referential/two-door duplicates folded into an existing leaf (container-folded) |
| **COVERABLE — additive, outside `E`** | +1 | `Custom Field Definitions` — inline anonymous schema at `GET /api/v1/Setup/customfields/1`, not a named `$ref` (see §2) |
| **INFORMATIONAL** | 25 | nested contact-mechanisms (5), nested custom-field values (3), nested categories (1), write-only notification action (1), cross-type search/lookup projections (3+1 inline), event-registration write-path duplicate (1), webhook/notification payload schemas (12) — itemized below |
| **excluded-scaffolding** | 0 | none found — this is a single-vendor, clean ISV-published spec with no test-fixture/internal-tooling leakage |
| **container-folded (within the 48)** | 12 | write-shape variants + self-referential sub-committees + two-door registration, folded into their base leaf rather than double-counted |

**Closure check**: 48 (consumed) + 25 (informational) + 0 (scaffolding) = **73 = |E|**. ✓
`TaxonomyLeaves` = 36 (from `E`) + 1 (additive, Custom Field Definitions) = **37 total COVERABLE leaves.**

### INFORMATIONAL bucket, itemized (25 of the 73 definitions)

| Definition(s) | Why informational |
|---|---|
| `EmailData`, `EmailPayload`, `PhoneDataSet`, `PhoneSaveData`, `AddressSaveData` | Nested contact-mechanism sub-objects; no independent GET-list; already embedded as `emails`/`phones`/`addresses` fields on `IndividualData`/`OrganizationData` |
| `CustomFieldData`, `CustomFieldValueData`, `CustomFieldResultData` | Per-record custom-field VALUES nested under Individual/Organization (distinct from the Custom Field Definitions catalog, which IS coverable — see above) |
| `SaveCategoryBasicData` | Nested category/tag sub-object; folds into `IndividualData.categories` / `OrganizationData.categories` |
| `NotificationData` | Write-only "send a notification" action; no readable record identity, not a syncable table |
| `ContactData`, `IndividualLookupBasicData`, `OrganizationLookupBasicData` | Cross-type search/lookup result projections of Individual/Organization records, not independent identity |
| `SessionRegistrationData` | Write-path for creating an Event Registration (folds into that leaf's write side) |
| `CustomerAddressUpdatedPayload`, `CustomerCustomFieldValuePayload`, `CustomerMergedPayload`, `CustomerPhoneUpdatedPayload`, `CustomerRelationshipUpdatedPayload`, `CustomerRequestPayload`, `EventRegistrationSubstitutedPayload`, `IndividualPayload`, `IndividualRequestToBeForgottenPayload`, `MembershipTypeTerminatedPayload`, `ProductPurchasePayload`, `PurchaseCancelledPayload` (12) | Webhook/notification event-payload schemas (`x-ms-notification-content` bodies for the 14 triggers, §0) — inform incremental/event-driven sync mechanics, not new IOs |

## 5. COVERABLE taxonomies → `TaxonomyLeaves` (37), with source-mapping

Every leaf below is COVERABLE (maps to a syncable IO). Source cited per leaf; `sources/apiDefinition.swagger.json`
is the primary citation for all (path + schema name), with the `full-operation-list.txt` line number range as a
navigation aid.

| # | Leaf | Primary path(s) | Schema | Access pattern |
|---|---|---|---|---|
| 1 | Individuals | `GET /api/v1/Individuals/{Page Number}`; `POST /api/v1/Individuals` | `IndividualData` | top-level collection + create |
| 2 | Organizations | `GET /api/v1/Organizations/Members/All/{Page Number}`; `POST/PUT /api/v1/Organizations[/{id}]` | `OrganizationData` | top-level collection + create/update |
| 3 | Memberships | `GET /api/v1/Individuals/{ID}/Memberships/{Active,Inactive}`; `GET /api/v1/Organizations/{ID}/Memberships/{Active,Inactive}` | `MembershipData` | nested access-path (both parents) |
| 4 | Events | `GET /api/v1/Events/All/{Page Number}`; `GET /api/v1/Events/Upcoming/{Page Number}` | `EventData` | top-level collection |
| 5 | Event Registrations & Registrants | `GET /api/v1/Individuals/{ID}/Registrations/{Page}`; `GET /api/v1/Events/{Code}/Registrations/{Page}`; `POST .../Sessions/Register/{CustomerID}`; `PUT /api/v1/Events/Registrants/{RecordNumber}/Attended` | `RegistrationData` + `RegistrantData` (same record, two doors — §3) | nested, two access-paths |
| 6 | Event Cancellations | `GET /api/v1/Events/{Event Code}/Cancellations/{Page Number}` | `RegistrantCancellationData` | nested under Event |
| 7 | Course Attendees | `GET /api/v1/Courses/{Code}/Attendees/{Page Number}` | `CourseAttendeeData` | nested under Course |
| 8 | Orders (Open Orders) | `GET /api/v1/Individuals/{ID}/Orders/Open/{Page Number}` | `PayableOrderData` | nested under Individual |
| 9 | Purchases | `GET /api/v1/Individuals/{ID}/Purchases/{Page Number}` (`purchasedSince` incremental) | `PurchasedItemData` | nested under Individual |
| 10 | Abandoned Checkouts | `GET /api/v1/Shopping/AbandonedCheckOuts/{Page Number}` | `AbandonedCheckoutData` | top-level collection |
| 11 | Committees (incl. Sub-Committees) | `GET /api/v1/Committees/{Page Number}`; `GET /api/v1/Committees/{Code}/subcommittees/{Page Number}` (same schema, recursive) | `CommitteeData` | top-level + self-referential |
| 12 | Committee Members | `GET /api/v1/Individuals/{ID}/Committees/{Page}`; `POST /api/v1/Committees/{code}/Members`; `PUT .../Members/{memberRecordNumber}/{positionCode}` | `CommitteeMemberData` (+`CommitteeMemberCreateData`/`UpdateData`/`Payload`) | nested + write |
| 13 | Committee Positions | `GET /api/v1/Committees/{Code}/Positions` | `CommitteePositionData` | nested under Committee |
| 14 | Committee Nominees | `GET /api/v1/Committees/{Code}/Nominations/{Page}`; `POST /api/v1/Committees/{Code}/Nominations` | `CommitteeNomineeData` (+`SaveData`) | nested + write |
| 15 | Awards | `GET /api/v1/Awards/{Page Number}` | `AwardData` | top-level collection |
| 16 | Award Nominations | `POST /api/v1/Awards/{id}/Nominations`; `PUT /api/v1/Awards/{id}/Nominations/{nomineeRecordNumber}` | `AwardNominationData` + `UpdateAwardNominationData` | write-only (no list endpoint documented) |
| 17 | Award Individual Recipients | `GET /api/v1/Awards/{id}/Recipients/Individuals/{pageNumber}` | `AwardRecipientIndividualData` | nested under Award |
| 18 | Award Organization Recipients | `GET /api/v1/Awards/{id}/Recipients/Organizations/{pageNumber}` | `AwardRecipientOrganizationData` | nested under Award |
| 19 | Certifications | `GET /api/v1/Individuals/{ID}/Certifications/{Page}`; `GET /api/v1/Organizations/{ID}/Certifications/{Page}` | `CertificationData` | nested (both parents) |
| 20 | Licenses | `GET /api/v1/Individuals/{ID}/Licenses/{Page Number}` | `LicenseData` | nested under Individual |
| 21 | Exams | `GET /api/v1/Products/Exams/{Page Number}` (`changedSince` incremental) | `ExamData` | top-level collection |
| 22 | Exam Scores | `POST /api/v1/Exams/{Exam Code}/Scores` | `ExamScoreData` + `ExamScoreResultData` | write-only (no list endpoint documented) |
| 23 | Education Credits | `POST /api/v1/Individuals/{idOrRecordNumber}/EducationCredits` | `EducationCreditData` | write-only (no list endpoint documented) |
| 24 | Subscriptions | `GET /api/v1/Individuals/{ID}/Subscriptions/All/{Page}`; `GET /api/v1/Organizations/{ID}/Subscriptions/{Page}` | `SubscriptionData` | nested (both parents) |
| 25 | Tasks | `POST /api/v1/tasks`; `PUT /api/v1/tasks/{Task Number}` | `TaskData` + `TaskSaveData` | create/update |
| 26 | User Tasks | `GET /api/v1/tasks/Users/{UserID}/{Completed,Pending}/{Page}`; `PUT .../Users/{UserID}`; `POST .../Users/{UserID}/Task` | `UserTaskData` | nested under User + write |
| 27 | Customer Requests | `GET /api/v1/Requests/Open/{Page Number}`; `POST/PUT /api/v1/Requests` | `RequestData` + `RequestSaveData`/`RequestUpdateData` | top-level + create/update |
| 28 | Exhibits | `GET /api/v1/Exhibits/{Page Number}` | `ExhibitData` | top-level collection |
| 29 | Exhibitors | `GET /api/v1/Exhibits/{Exhibit Code}/Exhibitors/{Page Number}` | `ExhibitorData` | nested under Exhibit |
| 30 | Activities | `POST /api/v1/Individuals/{id}/Activities`; `POST /api/v1/Organizations/{ID}/Activities`; `POST /api/v1/Sales/Opportunities/{ID}/Activities` | `ActivityData` | write-only (no list endpoint documented; 3 parent doors) |
| 31 | Notes | `POST /api/v1/Individuals/{id}/Notes`; `POST /api/v1/Organizations/{id}/Notes`; `POST /api/v1/Sales/Opportunities/{ID}/Notes` | `NoteData` + `BaseNoteData` | write-only (no list endpoint documented; 3 parent doors) |
| 32 | Relationships | `GET /api/v1/Individuals/{ID}/Relationships/{Page}`; `GET /api/v1/Organizations/{ID}/Relationships/{Page}`; `POST /api/v1/Individuals/{id}/Relationships`; `POST /api/v1/Organizations/{ID}/Relationships` | `RelationshipData` | nested (both parents) + write |
| 33 | Countries | `GET /api/v1/Countries/All/{Page Number}` | `CountryData` | top-level reference/lookup |
| 34 | States | `GET /api/v1/Countries/{Country ID}/States/All/{Page Number}` | `StateProvinceData` | nested under Country |
| 35 | Relationship Types | `GET /api/v1/Customers/RelationshipTypes/{Page Number}` | `RelationshipTypeData` | top-level reference/lookup |
| 36 | Organization Services | `GET /api/v1/Organizations/{ID}/Services`; `POST /api/v1/Organizations/{ID}/Services` | `ServiceData` | nested under Organization + create |
| 37 | Custom Field Definitions | `GET /api/v1/Setup/customfields/1` (inline schema, additive — §2/§4) | inline (`name`, `caption`, `description`, `dataType`, `inputType`, `availableValues`) | top-level reference/lookup, tenant-wide |

## 6. INFORMATIONAL taxonomies (structural knowledge, not IO-emitting)

| Taxonomy | Source-mapping | Role |
|---|---|---|
| Contact Mechanisms (Email/Phone/Address, nested) | `EmailData`, `PhoneDataSet`/`PhoneSaveData`, `AddressSaveData` in `sources/apiDefinition.swagger.json` | Informs the nested field-map for Individuals/Organizations |
| Custom Field Values (nested) | `CustomFieldData`/`CustomFieldValueData`/`CustomFieldResultData` | Informs the nested `customFields` field-map for Individuals/Organizations |
| Categories (nested) | `SaveCategoryBasicData` | Informs the nested `categories`/`category` field-map |
| Contact/Lookup search-result shapes | `ContactData`, `IndividualLookupBasicData`, `OrganizationLookupBasicData`, inline "Find Customer by Phone" schema | Informs how Find/Lookup query endpoints should route to Individuals/Organizations, not as new tables |
| Webhooks / Event Notifications | 14 `/api/v1/Webhooks/*` paths + 12 `*Payload` definitions | Informs an eventual webhook-driven incremental/event-sync strategy; NOT itself an IO |
| Authentication & Connection Parameters | `sources/apiProperties.json` (`hostUrl`, `api_key`, `dynamichosturl` policy) + swagger `securityDefinitions` | Informs `CredentialTypeID`/auth-flow construction (§3) |
| Pagination Mechanics | uniform `{Page Number}`-in-path + `{pageNumber, dataList}` envelope across all 116 paths | Informs `PaginationType=PageNumber` + `ResponseDataKey="dataList"` for every list IO |
| Rate-Limit Policy | MS Learn "Throttling Limits" table: 100 calls / 60s / connection | Informs `RateLimitPolicy` (MS-connector-layer; raw-host limit undocumented) |

## 7. Out-of-scope families (known-but-excluded, with reasons)

| Family | Reason excluded |
|---|---|
| Salesforce-route (re:Members AMS Platform built on Salesforce) | A separate deployment architecture some re:Members customers run; this audit's sources document the core REST/Power-Platform surface only. Building against Salesforce objects would require per-customer platform confirmation — out of scope for a docs-only, credential-free audit. |
| Higher Logic Thrive Marketing sync route (shared views / SQL views / query outputs / sync-on-send) | A partner-managed, customer-defined query/export pathway (Higher Logic pulls FROM Impexium via customer-authored queries), not a stable Impexium-published object catalog. |
| Higher Logic Community sync route (security-group / community-profile sync) | Same reasoning — partner-specific mapping convention, not a documented Impexium API object. |
| `apidocs.impexdocs.com` (ImpexDocs) | Vendor name-collision — an unrelated export/shipping-logistics documentation vendor. Excluded per explicit instruction; never fetched. |
| LMS/TopClass/OasisLMS SSO+writeback route | Third-party LMS partner integration guides describe SSO/writeback CONVENTIONS against Individuals/Certifications/EducationCredits already captured from the primary swagger — would double-count, not add new objects. |
| Accounting/Finance (Sage-Intacct-style) route | No Invoice/Payment/Refund endpoint exists anywhere in the swagger's 116 paths. If this route exists for some customers it is not exposed through the documented API surface audited here at all. |

## 8. Scope decision

**In scope**: the full documented object universe reachable through the re:Members AMS / Impexium Power
Platform connector's `apiDefinition.swagger.json` (137 operations / 116 paths / 73 named `definitions` + 1
additive inline schema), cross-checked against the MS Learn rendered action list and the two reachable Higher
Logic support articles. No artificial cap was applied — all 73 definitions were individually triaged into
COVERABLE/INFORMATIONAL, and the accounting closes exactly (§4).

**Justification for `format-verified-no-creds` / doc-coverage <0.7**: 2 of the 4 assigned sources
(`help.remembers.com`, the Postman "what-we-do-api" workspace) could **not** be programmatically retrieved —
one is fully gated behind a MadCap Central login SPA, the other requires a Postman API key for raw export.
The two Higher Logic support articles that *were* reachable are workflow-level prose (object names only, no
field-level API schema) and add essentially no structural evidence beyond the swagger. Effectively **all**
the structural, field-level, CRUD-level evidence in this audit comes from one source (the swagger) plus one
corroborating/cross-checking source (the MS Learn rendered page, generated from the same swagger). This
matches the task's own expectation that doc coverage is likely under 0.7 — **the downstream extract loop
should run its full K=3 amendment budget** rather than assume one-pass completeness, and should treat
`help.remembers.com` as the highest-value still-unexplored source if a login-gated session ever becomes
available (customer-provided export, admin screen-share, etc.).

## 9. Gaps (honest negatives — no source covers these)

| Area | Reason |
|---|---|
| Page size (~250/page, mentioned in the task brief) | Not documented anywhere in the reachable sources — no `maxItems`, no description text stating a count, in the 843KB swagger. `help.remembers.com` (login-gated) may state this; could not verify. Flag as unconfirmed; do not hardcode 250 without a live/sandbox probe. |
| Incremental watermark for 35 of 37 leaves | Only `Exams` (`changedSince`) and `Purchases` (`purchasedSince`) have a documented incremental query parameter anywhere in the 116 paths. `IndividualData` (the highest-volume object) has no `modifiedOn`/`lastModified` field at all. `SupportsIncrementalSync` must be left `false`/unset for the other 35 leaves per this source. |
| Invoices / Payments / Refunds | No endpoint of any kind exists in the 116-path surface. Orders (`PayableOrderData`) and Purchases (`PurchasedItemData`) are the only financial-adjacent objects this API surfaces. |
| Sales Opportunities (as its own IO) | `/api/v1/Sales/Opportunities/{ID}/Activities` and `/Notes` prove the entity exists (stable ID referenced), but there is no `GET`/`List`/`POST`-create endpoint for the Opportunity record itself anywhere in the spec — it cannot be populated as a syncable table from this source alone. Excluded from `TaxonomyLeaves`; its two write sub-actions are already covered generically under the Activities/Notes leaves. |
| MemberTypes / Groups / Chapters (mentioned in general AMS domain knowledge, and in a prior internal planning note in this vendor folder) | **Not provable** from any of the 3 reachable sources — no such endpoint exists in the swagger, the MS Learn page, or the two Higher Logic articles. Likely documented (if at all) only in the login-gated `help.remembers.com`. Do not fabricate these as leaves; they are absent from `TaxonomyLeaves` on provable-only grounds, not oversight. |
| `help.remembers.com` (the full vendor help center) | Fully gated behind a MadCap Central login SPA — confirmed via curl (identical 4,006-byte login shell on every `Content/*.htm` URL tried) and WebFetch. This is almost certainly the single richest field-level prose source for this vendor (search-engine snippets hint at documented endpoints like `GET /api/v1/Individual/{Page}`) and could not be accessed at all. Single largest coverage gap in this audit. |
| Postman "what-we-do-api" workspace raw collection | Web view is a JS SPA; `api.getpostman.com` returned `401 Invalid API Key` for the raw export. Existence confirmed by URL only; zero structural content extracted. Also individually-owned (not an official Impexium Postman org), so even if retrieved it would rank Tier 3, not Tier 2. |
| Auth flow residual ambiguity | The swagger/apiProperties evidence for `x-api-key` header auth against the tenant's own host is Tier-1 and internally consistent (§3), but a prior planning note's citation of an "AppToken"/authenticate-the-user flow (from unreachable `help.remembers.com` text) could not be confirmed or refuted. Recommend a live/sandbox probe settle this definitively before assuming `x-api-key` is the ONLY auth mode in production. |

---

## Files in this study

- `sources/apiDefinition.swagger.json` — full raw Swagger 2.0 spec (843,708 bytes), Tier 1.
- `sources/apiProperties.json` — connection-parameter + auth-policy metadata, Tier 1.
- `sources/full-operation-list.txt` — script-generated flattened path/method/operationId/tag/response-ref table (121 rows), for extractor consumption without re-parsing the raw spec.
- `sources/enumerate-catalog.output.json` — the shared enumerator's stdout (`count: 73`, `fieldCount: 573`) run against the saved repo-local copy of the swagger, reproducing §2.
