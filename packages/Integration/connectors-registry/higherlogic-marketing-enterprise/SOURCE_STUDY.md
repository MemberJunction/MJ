# Source Study — Higher Logic Marketing Enterprise (formerly Real Magnet / MagnetMail)

Vendor identity note: "Higher Logic Marketing Enterprise" is the current commercial name for the
email-marketing platform originally built by Real Magnet and sold under the "MagnetMail" brand.
Higher Logic acquired Real Magnet and folded it into its "Marketing Enterprise" product line. The
API surface itself was **not** re-platformed post-acquisition — it is still the original legacy SOAP
web service, still hosted at its original `magnetmail.net` domain (`hlma-apie1.magnetmail.net`),
still namespaced `http://www.magnetmail.net/`, and still titled "MagnetMail Web Service" in its own
WSDL `documentation` element. Every finding below reflects that: this is a ~15-20 year old ASP.NET
`.asmx` SOAP service, not a modern REST/GraphQL API, and the whole SOURCE_STUDY is written accordingly.

## Enumeration summary (machine-derived — see "Reproducibility" below)

| Metric | Value |
|---|---|
| `EnumerationStdoutCount` (WSDL `<wsdl:operation>` count) | **55** |
| Independent cross-check (`.asmx` service-description page operation-link count) | **55** (match) |
| Named `<s:complexType>` definitions (excluding `ArrayOf*` wrappers) | **82** |
| `ArrayOf*` list-wrapper complexTypes | 39 |
| Top-level `<s:element>` request/response definitions | 110 |
| Types reachable from the 55 operations via request/response body BFS | 76 |
| **COVERABLE leaves (`TaxonomyLeaves`)** | **42** |
| INFORMATIONAL types (scaffolding the extractor must know about but never emits as IOs) | 31 |
| CONTAINER-FOLDED / alias-of-richer-type (structural duplicates, folded to a canonical leaf) | 3 |
| Unreachable-via-body-BFS named types (SOAP header + XSD abstract base-types) | 6 |
| **Accounting check** | 42 + 31 + 3 + 6 = **82 = E** ✅ balances |

## Reproducibility (code-first — this is how `TaxonomyLeaves` was actually produced)

Two scripts, saved under `scripts/`, were run in sequence against the RAW saved WSDL bytes
(`sources/mmapi.wsdl.xml`, 222,862 bytes, fetched via `curl` and never re-summarized by a model):

1. **`scripts/enumerate-wsdl-operations.mjs`** — regex/depth-counting scan of the raw XML (no XML
   parser dependency). Extracts: every `<wsdl:operation>` in the `MagnetMail_x0020_Web_x0020_ServiceSoap`
   `portType` (55), each operation's request/response element names via `<wsdl:message>` → `<wsdl:part
   element=...>` indirection, every named `<s:complexType>` (82 non-`ArrayOf` + 39 `ArrayOf*`), every
   field of every element/complexType (name/type/minOccurs/maxOccurs/nillable, attribute-order-independent),
   and the `soap12:operation soapAction` for every operation from the `MagnetMail_x0020_Web_x0020_ServiceSoap12`
   binding. Output: `scripts/output/enumerated-operations.json`.
2. **`scripts/classify-taxonomy.mjs`** — reads that JSON (never the raw XML again — read-once → scratch
   → grep/code discipline), builds the type graph (every non-scalar field is an edge to another named
   type), computes the **entry-point set** (every operation's resolved request-payload type + response
   type, unwrapping single-field `ArrayOfX`/`*Results` wrappers), BFS-walks the type graph from those
   entry points to find every **reachable** named type (76 of 82), then classifies each reachable type
   into **COVERABLE** / **INFORMATIONAL** / **CONTAINER-FOLDED** via mechanical rules (detailed in the
   Taxonomy Accounting Ledger below — suffix patterns, singular-nested-only detection, structural
   field-subset / positional-type-sequence alias matching). Output: `scripts/output/classification.json`,
   whose `coverableLeaves` (with 2 documented manual corrections, see ledger) IS `TaxonomyLeaves`.

Both scripts were re-run from their final committed location as a reproducibility check
(`node scripts/enumerate-wsdl-operations.mjs && node scripts/classify-taxonomy.mjs`) and reproduced
`EnumerationStdoutCount: 55` and `coverableCount: 44` (pre-manual-correction) identically.

## Structure of the WSDL (what studying it in full revealed)

- **Single `portType`** (`MagnetMail_x0020_Web_x0020_ServiceSoap`, the ` _x0020_ ` being XML's escape
  for the literal space in the original service name "MagnetMail Web Service") with all 55 operations
  flat — no operation grouping/tag mechanism exists in WSDL the way OpenAPI has tags. The **taxonomy
  groupings below are derived from operation-name prefixes/domains and shared complexType families**,
  which is the WSDL's own de-facto organizing convention (every operation name starts with the noun it
  operates on: `getRecipient*`, `*Group*`, `*Message*`, `*Tracking*`, `uploadList*`/`Upload*`,
  `*Unsubscribe*`/`*Suppression*`, `*SavedSearch*`/`runSavedSearch`, `*EventSignUp*`,
  `getUserDetails`, `*PersonifySubscriptionMapping*`, `getErrorDetails`).
- **Dual binding**: both a `soap` (1.1) and `soap12` (1.2) binding exist for every operation, identical
  operation set, identical `soapAction` URI pattern `http://www.magnetmail.net/<OperationName>`
  (namespace + PascalCase/camelCase-as-authored operation name, no REST-style resource path — this is
  the "APIPath" for every IO in a SOAP connector: the SOAP action URI IS the endpoint).
- **Two-message-part convention per operation**: EVERY operation carries a `<wsdl:part name="parameters"
  element="tns:<opName>">` (the body) **plus** a second `<wsdl:part name="mmAuthHeader"
  element="tns:mmAuthHeader">` referenced from the binding as a `soap:header` — i.e. **every single call
  requires the `mmAuthHeader` SOAP header** (carrying the authenticated session/credential), separate
  from the body payload. This is the authentication mechanism (see Informational Taxonomies below) and
  explains why `Authenticate(username,password)` exists as its own operation — it mints the value that
  goes into every subsequent call's `mmAuthHeader`.
  - **Note:** `mmAuthHeader` is a SOAP *header* element (`wsdl:part` referenced from `soap:header`, not
    from the body `<wsdl:input>` sequence), so it does **not** appear in the request-body BFS the
    enumerator walks — it is one of the 6 "unreachable-via-body-BFS" types, and is real/load-bearing
    (auth mechanics), not dead scaffolding. Documented explicitly in the ledger below.
- **Response-wrapper convention**: EVERY operation's response element has exactly one field,
  `<opName>Result`, typed either as a scalar, a named complexType, or an `ArrayOf<X>` list wrapper. This
  is the SOAP analogue of an OpenAPI `ResponseDataKey` — for a connector, `ResponseDataKey =
  '<opName>Result'` universally, with the payload's ACTUAL shape one level down (unwrap `ArrayOfX` → the
  list of `X` records).
- **Pagination is inconsistent and rare**: of 55 operations, only **3** carry any paging-shaped request
  fields — `getGroupRecipients` (`pageNumber`, `pageCount` — literal PageNumber-style pagination),
  `getDetailedTracking` / `getDetailedTrackingUTC` (`page`, `recordsPerPage` — same PageNumber-style
  pagination, different field names). **Every other list-returning operation returns its ENTIRE result
  set in one call with no paging parameters at all** (`PaginationType = 'None'` for those IOs) — a
  legacy-API idiosyncrasy (results are typically date-range-bounded via `fromDate`/`toDate`/
  `createStartDate`/`createEndDate`/`sentStartDate`/`sentEndDate` request fields instead of paged).
- **UTC-suffixed operation twins**: `getMessagesUTC`/`getMessages`, `getGroupsUTC`/`getGroups`,
  `getMessageListUtc`/`getMessageList`, `getDetailedTrackingUTC`/`getDetailedTracking`,
  `getUploadJobStatusUTC`/`getUploadJobStatus` — identical request/response shapes, the UTC variant
  simply returns date/time fields in UTC instead of the account's local timezone. These are the SAME
  object/operation pair with a `hasUTC` flag, not two different objects — the extractor should treat the
  UTC op as the incremental-sync-friendly variant (UTC timestamps make watermark comparison unambiguous
  across DST boundaries) and prefer it for `IncrementalWatermarkField` sourcing where both exist.
- **`Beta`-labeled operations**: `sendMessageToGroup` and `getRecipientHistory` carry `<wsdl:documentation>`
  text literally prefixed `"BETA:"` — a vendor-declared maturity signal worth surfacing to the extractor
  (still real, callable, schema-complete operations; just vendor-flagged as less stable).
- **Read-vs-write field-fidelity pattern (a genuine, mechanically-confirmed idiom)**: several resources
  are returned by DIFFERENT operations at DIFFERENT levels of field-completeness — a summary/list shape
  and a richer detail/write shape. Three instances were mechanically confirmed via exact field-name-subset
  (or positional-type-sequence) comparison (not eyeballed):
  - **Groups**: `group` (7 fields, from `getGroups`/`getGroupsUTC`'s `ArrayOfGroup`) ⊂ `MailRecipientGroup`
    (12 fields, from `getGroupDetails`) — `group`'s 7 field names are an EXACT subset of
    `MailRecipientGroup`'s. `RecipientGroup` (from `getRecipientGroups`, 7 fields) matches
    `MailRecipientGroup`'s first 7 fields by exact TYPE SEQUENCE though the field names differ
    (`Id`/`Name`/`Created`/... vs `group_id`/`group_name`/`group_created`/...) — a renamed view of the
    same entity in the per-recipient-membership context.
  - **Messages**: `Message` (6 fields, list/summary shape from `getMessageList`/`getMessageListUtc`) ⊂
    `MessageDetails` (23 fields, the full-content authoring shape used by `createMagnetMailMessage` /
    `editMagnetMailMessage` / `GetMessageDetails`).
  - **Errors**: `error` (5 fields, embedded inside the `saveResult`/`createEditMessageResult`
    write-outcome wrappers) has an IDENTICAL field-name+type set to `Error` (5 fields, the standalone
    `getErrorDetails` reference-table lookup) — a duplicated type definition for the same "error detail"
    concept, one top-level-addressable, one embedded.
  In each case the canonical/richer shape is kept as the `TaxonomyLeaves` entry and the narrower shape is
  folded in as a documented alias (see ledger) — this is NOT dropping data, it's recognizing the SAME
  record type appearing in two field-fidelity variants across different operations.
- **Custom fields**: `Recipient` carries exactly 30 generic `custom1`..`custom30` string columns plus a
  `Custom_Id` — the vendor's fixed (non-extensible-by-schema) customer-defined-field convention. There is
  NO dynamic/discoverable custom-field schema endpoint for recipients (contrast `getRecipientFields`,
  which returns `fieldDefn` rows describing **upload-mapping** field definitions, a DIFFERENT concept —
  the CSV-upload column-mapping dictionary, not a live recipient custom-field catalog). Any true "custom
  field" capture for Recipients is therefore the framework's runtime custom-column capture mechanism
  operating over the fixed `custom1..custom30` slots, not vendor-side dynamic schema.
- **Composite / no-full-schema search criteria**: `searchForRecipients`, `GetMessageLinkTracking`,
  `GetMessageSentTracking`, `GetMessageOpenTracking`, `GetUnsubscribeTracking`,
  `SearchPersonifySubscriptionMappings` all take a single `criteria` object (a `*SearchCriteria` named
  type) rather than discrete query-string parameters — the SOAP equivalent of a POST-body search. These
  criteria types are INFORMATIONAL (query-shape, not synced data) per the ledger below, but their
  presence is what an extractor must translate into the connector's `SearchRecords` implementation.
- **XSD inheritance (not modeled by the field-BFS)**: several criteria/results/tracking-data types use
  `<s:complexContent><s:extension base="tns:X">` (XSD inheritance), e.g. `RecipientSearchCriteria` extends
  `DateRangeSearchCriteria` extends `PagedSearchCriteria`; `MessageTrackingData`/`MessageSentTrackingData`/
  `MessageOpenTrackingData`(unused? see ledger) extend `TrackingDataBase`. These base types carry the
  common `fromDate`/`toDate`/paging fields shared across all `*SearchCriteria` subtypes. They do not show
  up in the request/response body BFS (which only follows `<s:sequence>` field edges, not `<s:extension
  base>` edges) and are the bulk of the 6 "unreachable" named types — documented in the ledger as
  legitimate XSD scaffolding, not a missed leaf.

## Named Taxonomies (COVERABLE vs INFORMATIONAL split, with source-mapping citations)

Each taxonomy below is a family discovered by the operation-name-prefix / complexType-family grouping
described above — the WSDL's own de-facto organization (there is no WSDL "tag" concept to hang these on
directly, so the citation is the set of governing SOAP operations + `soapAction` URIs + the `<s:complexType>`
definitions in `sources/mmapi.wsdl.xml`).

### COVERABLE taxonomies (map to syncable IntegrationObjects — the extractor enumerates these into IOs)

| # | Taxonomy | Definition | Coverable leaves | Source mapping (operations / soapAction) |
|---|---|---|---|---|
| 1 | **Recipients** | Individual email/fax subscribers and their group membership, custom fields, suppression state, and extended (upload-derived) fields. | `Recipient`, `RecipientExtended`, `RecipientExtendedField`, `RecipientSuppressionList` | `getRecipientDetails`, `addRecipient`, `editRecipient`, `searchForRecipients`, `runSavedSearch`, `getSuppressedRecipientList`, `uploadSuppressionList`, `editRecipientGroups`, `getRecipientGroups` — all `http://www.magnetmail.net/<op>` |
| 2 | **Groups** | Named recipient-segmentation lists ("groups"), their category taxonomy, and per-group recipient membership rosters. | `MailRecipientGroup` (canonical; folds `group`, `RecipientGroup`), `GroupCategory`, `GroupRecipients`, `GroupRecipient` | `getGroups`/`getGroupsUTC`, `getGroupDetails`, `addGroup`, `getGroupRecipients`, `getGroupRecipientsCount`, `GetGroupCategory`, `GetAllGroupCategories` |
| 3 | **Messages** | Email/fax campaign message definitions, both the authoring/detail shape and the list/summary shape returned by list operations. | `MessageDetails` (canonical; folds `Message`), `MessageList`, `MessageCategory` | `createMagnetMailMessage`, `editMagnetMailMessage`, `GetMessageDetails`, `getMessages`/`getMessagesUTC`, `getMessageList`/`getMessageListUtc`, `GetMessageCategory` |
| 4 | **Message Send / Distribution jobs** | The record of a message having been sent/queued to a specific group (per-group send-fanout tracking, nested under a Message). | `JobToGroup` | nested under `getMessages`/`getMessagesUTC` (`MessageList.GroupsEmailSentTo[]` / `GroupsFaxSentTo[]`) |
| 5 | **Tracking / Reporting** | Aggregate and per-recipient engagement metrics (opens, clicks, bounces, unsubscribes, fax status) for a sent message, plus link-level tracking and detailed per-recipient tracking rows. | `TrackingData`, `TrackingDetails`, `Links`, `recp_track`, `MessageLinkTrackingData`, `MessageSentTrackingData`, `MessageTrackingData` | `getOverallTracking`, `getTrackingData`, `getDetailedTracking`/`getDetailedTrackingUTC`, `getLinkURLs`, `GetMessageLinkTracking`, `GetMessageSentTracking`, `GetMessageOpenTracking` |
| 6 | **Unsubscribes / Suppression** | Recipients who have unsubscribed or been suppressed, plus spam-complaint records and unsubscribe-tracking rollups. | `Unsubscribe`, `recp_unsubscribe`, `UnsubscribeTrackingData` | `unsubscribeRecipients`, `getUnsubscribes`, `getSpamComplaints`, `GetUnsubscribeTracking` |
| 7 | **List Uploads / Import jobs** | Bulk-recipient-upload job submissions (CSV-based), their status/lifecycle, and the CSV-column-to-field mapping used. | `UploadInitialJob`, `UploadInitialQueueStatus`, `UploadColumnMapping` | `UploadListInitialQueue`, `GetUploadInitialQueueJobStatus`; (legacy) `uploadListQueue`/`uploadListQueueTest`/`getUploadJobStatus`/`getUploadJobStatusUTC` share the same job-status shape (`UploadListResult`, itself INFORMATIONAL/operation-outcome per the ledger — the job-status RECORD is `UploadInitialQueueStatus`) |
| 8 | **Recipient History** | Per-recipient historical activity log across email sends, fax sends, and web-form submissions, plus the click-through links captured within email history. | `recipient_history`, `email_history`, `fax_history`, `form_history`, `link`, `website_link` | `getRecipientHistory` (nested: `recipient_history.emailHistory[]`/`faxHistory[]`/`formHistory[]`; `email_history.links[]`; `link.website_links[]`) |
| 9 | **Recipient Field Definitions** | The dictionary of CSV-upload-mapping field definitions available for a given account. | `fieldDefn` | `getRecipientFields` |
| 10 | **Saved Searches** | Account-level saved/reusable recipient-search definitions, executable by name. | `MagnetMailQueries` | `getSavedSearches`, `runSavedSearch` (executes a saved search, returning `Recipient` rows — already counted under taxonomy 1) |
| 11 | **Subscribed Recipients (report)** | Recipients subscribed to a set of groups over a date range — a subscription-status report. | `subscription` | `getSubscribedRecipients` |
| 12 | **Event Sign-Up** | Event registration submissions: the signup job itself, its paid line-items, and its registrant roster (with the per-registrant custom question answers). | `EventSignUp`, `PaidItem`, `Registrant`, `QuestionItem` | `CreateEventSignUp` (nested: `EventSignUp.PaidItems[]`, `EventSignUp.Registrants[]`, `Registrant.QuestionItem[]`) |
| 13 | **User / Account** | The authenticated account's own profile/feature-flag record and its enhanced-personalization-field catalog. | `User`, `ExtendedField` | `getUserDetails`, `GetEnhancedPersonalizedFields` |
| 14 | **Personify Subscription Mapping** | Cross-reference records mapping MagnetMail objects to a linked Personify AMS object (an integration-bridge record type). | `PersonifySubscriptionMapping` | `SearchPersonifySubscriptionMappings` |
| 15 | **Error Reference** | A lookup/reference table for vendor error codes and their descriptions. | `Error` (folds embedded `error`) | `getErrorDetails` |

**42 COVERABLE leaves total** across the 15 taxonomies above (sum of the "Coverable leaves" columns,
deduplicated where a leaf legitimately serves two taxonomies is not the case here — every leaf appears
in exactly one taxonomy).

### INFORMATIONAL taxonomies (vendor mechanics the extractor must know but never emits as IOs)

| # | Taxonomy | Definition | Types in this taxonomy | Source mapping |
|---|---|---|---|---|
| 1 | **Authentication / Session mechanics** | The credential-exchange operation and the per-call SOAP auth header every OTHER operation requires. | `AuthenticationResult` (op-outcome), `mmAuthHeader` (SOAP header, unreachable-via-body — see ledger) | `Authenticate(username,password)`; `mmAuthHeader` referenced from every operation's `soap:header` binding |
| 2 | **Operation-outcome / write-status wrappers** | Generic "did the write succeed" result shapes returned by create/edit/upload/send operations — carry success flags + an embedded `error`/`errorObj`, not a synced record. | `SaveResult`, `saveResult`, `EmailToIndividualResult`, `EmailToGroupResult`, `createEditMessageResult`, `RecipientSuppressionResult`, `EventSignupResult`, `PaidItemSignupResult`, `RegistrantSignupResult`, `PaidItemAPISignupValidationStatusResult`, `UploadListResult` | Response types of `addRecipient`/`editRecipient`, `sendEmailToIndividual`, `sendMessageToGroup`, `createMagnetMailMessage`/`editMagnetMailMessage`, `uploadSuppressionList`, `CreateEventSignUp`, `uploadListQueue`/`getUploadJobStatus` |
| 3 | **Query-criteria shapes** | Search/filter-parameter object shapes accepted by the `*Search*`/`*Tracking*` read operations — describe HOW to query, not a record itself. | `RecipientSearchCriteria`, `MessageLinkTrackingSearchCriteria`, `MessageTrackingSearchCriteria`, `UnsubscribeSearchCriteria`, `PersonifySubscriptionMappingSearchCriteria`, `PersonifyObject` (nested inside the Personify criteria), plus the unreachable XSD base types `SearchCriteria`, `DateRangeSearchCriteria`, `PagedSearchCriteria` | `searchForRecipients`, `GetMessageLinkTracking`, `GetMessageSentTracking`/`GetMessageOpenTracking`, `GetUnsubscribeTracking`, `SearchPersonifySubscriptionMappings` |
| 4 | **List-wrapper containers** | Single-field "here is the array + nothing else" wrapper types that add no information beyond the array they carry — the extractor unwraps through these to the item type. | `MessageLinkTrackingResults`, `MessageOpenTrackingResults`, `MessageSentTrackingResults`, `PersonifySubscriptionMappingSearchResults`, `RecipientSearchResults`, `UnsubscribeTrackingResults`, plus the unreachable XSD base `PagedSearchResults` | Response wrapper one level above the `*TrackingData`/`PersonifySubscriptionMapping`/`Recipient` item arrays |
| 5 | **Nested write-configuration blocks** | Singular (non-list), non-independently-addressable configuration sub-objects embedded in a write payload — no get/list operation ever returns them standalone, so they carry no identity of their own. | `CreditCardInfo`, `CreditCardBillingInfo`, `PaymentInfo` (event-signup billing config), `UploadJobSettings` (upload-job configuration, itself embedding `UploadColumnMapping`†), `newsletter`, `sendNotification` (send-configuration sub-blocks of `sendMessageToGroup`) | Nested fields of `EventSignUp.PaymentInfo`, `UploadInitialJob.Settings`, `sendMessageToGroup`'s request body |

† `UploadColumnMapping` is itself reached via `UploadJobSettings.ColumnMappings[]` — an **unbounded
list** field — so per the mechanical rule (a type reached via ANY list/unbounded field anywhere is a
genuine repeated child record, not folded away merely because it ALSO happens to nest under a singular
config block) it is correctly kept as a **COVERABLE** leaf (taxonomy 7), not informational. Listed here
only because its immediate parent (`UploadJobSettings`) is informational.

**Manual corrections to the mechanical classifier** (documented, not silent): the classifier's
`isNestedOnlyNonListField` rule only flags a type informational when it is reached EXCLUSIVELY via
non-list fields, buried at least one level deep. `newsletter` and `sendNotification` are **direct,
singular request-body fields of a top-level operation** (`sendMessageToGroup`), so the mechanical rule
(which only inspects nesting depth ≥ 1) did not catch them — they were manually reclassified from
COVERABLE to INFORMATIONAL after confirming, by the same evidentiary standard applied everywhere else in
this ledger (no independent get/list/search operation returns either type standalone; both are
configuration sub-blocks scoped to a single send-request), that they belong in the same bucket as
`UploadJobSettings`/`PaymentInfo`. This drops the mechanical `coverableCount` from 44 to the final **42**.

## Taxonomy Accounting Ledger (full E → buckets closure)

`E` = 82 (named, non-`ArrayOf` complexTypes in the WSDL schema — the enumerated universe, printed by
`classify-taxonomy.mjs` as `namedComplexTypeCount_nonArrayOf`, independently cross-checked against the
`.asmx` page's 55-operation count and the WSDL's own 55 `<wsdl:operation>` entries as the two entry-point
signals that seed the reachability walk).

| Bucket | Count | Evidence |
|---|---|---|
| **COVERABLE** (→ `TaxonomyLeaves`) | **42** | Reachable from an operation's request/response body, has ≥1 field, not a query-criteria/op-outcome/list-wrapper/nested-config shape, and not folded into a richer alias. See per-taxonomy table above. |
| **INFORMATIONAL** | 29 (mechanical) + 2 (manual: `newsletter`, `sendNotification`) = **31** | Suffix-pattern match (`*SearchCriteria`, `*Result`, `*Results` single-field), SOAP-header/auth-session role, or singular-nested-only (never independently listable) — full type-by-type list in the "INFORMATIONAL taxonomies" table above. |
| **CONTAINER-FOLDED** (alias-of-richer-type) | **3** | `group` → `MailRecipientGroup` (field-name-set exact subset, mechanically verified); `RecipientGroup` → `MailRecipientGroup` (field-TYPE-sequence exact positional match, names differ); `Message` → `MessageDetails` (field-name-set exact subset, mechanically verified). Each verified by direct set/sequence comparison in `classify-taxonomy.mjs`, not eyeballed. |
| **Unreachable-via-body-BFS (real, but not body-sequence-reachable)** | **6** | `mmAuthHeader` (SOAP header, referenced from `soap:header` binding, not the body `<wsdl:input>` sequence — real auth mechanics, see Informational Taxonomy #1); `TrackingDataBase`, `DateRangeSearchCriteria`, `PagedSearchCriteria`, `PagedSearchResults`, `SearchCriteria` (XSD abstract base types referenced only via `<s:extension base="tns:X">` inheritance edges, which the field-sequence BFS does not traverse — their fields are already counted as inherited-in on their concrete subtypes, e.g. `RecipientSearchCriteria extends DateRangeSearchCriteria extends PagedSearchCriteria`). |
| **Total** | 42 + 31 + 3 + 6 = **82** | = `E`. Balances. |

Independent cross-check on the reachability walk itself: 82 named types − 76 reachable (BFS from the 55
operations' request/response bodies) = 6 unreachable, matching exactly the 6 enumerated above (no
unaccounted gap).

## Scope — what this source covers and what it explicitly does NOT

**Covers**: the full transactional + reporting surface of the legacy MagnetMail platform — recipients,
groups/segmentation, message authoring + send, delivery/engagement tracking, unsubscribe/suppression,
bulk CSV upload jobs, saved searches, per-recipient activity history, event signup/registration, account
profile, and a Personify-AMS cross-reference bridge table.

**Does NOT cover** (gaps — see `Gaps` in the structured return):
- **No webhook / push-notification mechanism** is exposed anywhere in the WSDL — every read is a
  pull/poll operation. A connector's `SupportsIncrementalSync` story for this vendor is watermark-poll
  only (date-range request fields), never event-driven.
- **No schema-discovery / describe operation** — unlike REST APIs with an OpenAPI/describe endpoint,
  this WSDL IS the complete schema (that's the good news: it's exhaustive and machine-readable), but
  there is no vendor-side mechanism to discover CUSTOM per-tenant fields beyond the fixed `custom1..30`
  Recipient slots and the CSV-upload-mapping `fieldDefn` catalog. Any true dynamic-custom-field capture
  is the framework's runtime overflow-column mechanism, not vendor-declared schema.
- **No delete operations** anywhere in the 55-operation surface — `SupportsDelete` is `false` for every
  IO; this is an add/edit/suppress/unsubscribe API, never a hard-delete API (consistent with an
  email-compliance platform where "remove" means unsubscribe/suppress, not delete).
- **No official prose developer-docs page survives** on Higher Logic's current documentation domains for
  this specific API (see `SOURCES.json` entry 3, `AccessStatus: '404'`) — the WSDL + its own embedded
  `<wsdl:documentation>` strings (present on ~most, not all, operations) are the only documentation that
  exists. This is a thin-but-honest outcome, not a failure to find something that's actually there.

## Gaps (for the structured return)

| Area | Reason |
|---|---|
| Prose developer-docs / getting-started guide | `docs-unscrapable` — no surviving Higher Logic public docs page for this legacy MagnetMail SOAP API was found; the WSDL (with its embedded `<wsdl:documentation>` annotations) is the only documentation artifact this vendor publishes for this product. |
| Webhooks / push-notification schema | `vendor-confirmed-absent` — the WSDL exposes no subscription/webhook-registration operation of any kind across all 55 operations; every data-retrieval path is pull/poll. |
| Dynamic custom-field schema (beyond fixed `custom1..30` + upload `fieldDefn`) | `vendor-confirmed-absent` — no operation returns a discoverable, per-tenant custom-field catalog for Recipients; the 30 slots are fixed by the WSDL's own `Recipient`/`RecipientSearchCriteria` type definitions. |
| Delete-capability schema | `vendor-confirmed-absent` — no delete/remove operation exists for any object family; the API's only "removal" primitives are unsubscribe/suppress. |

## Source-mapping cross-reference index

Every taxonomy + every leaf's governing operation(s), SOAP action, response element name, and (when
present) pagination fields is available in full machine-readable detail in
`scripts/output/classification.json` → `coverableWithAccessPath` (door operation + nesting field-path
per leaf) and `scripts/output/enumerated-operations.json` → `operations[].soapAction` /
`.requestFields` / `.responseFields`. These two files are the ground truth this document summarizes;
re-run the two scripts in `scripts/` against `sources/mmapi.wsdl.xml` to regenerate them byte-for-byte.
