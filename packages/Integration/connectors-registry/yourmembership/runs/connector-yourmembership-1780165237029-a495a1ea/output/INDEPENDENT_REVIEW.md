# YourMembership — Independent Adversarial Review

**Reviewer**: IndependentReviewer (claude-sonnet-4-6)
**Run under review**: `connector-yourmembership-1780165237029-a495a1ea`
**Emission reviewed**: `metadata/integrations/yourmembership/.yourmembership.integration.json`
**Review date**: 2026-05-30
**Phase0-slots reference**: `packages/Integration/connector-builder-workshop/floor/phase0-slots.json`

**Read order discipline**: SOURCE_STUDY first, emission second (sample), EXTRACTION_REPORT third.
Expected inventory written to `/tmp/ym_reviewer_expected.txt` before opening EXTRACTION_REPORT.

---

## 1. Confirmed Gaps

### GAP-1: IsForeignKey=true with @lookup target "AmsEvent" resolves to a non-existent IO [BLOCKING]

**What the gap is**: 11 Integration Object Field records in the `AmsEvent_*` sub-resource family carry `IsForeignKey=true` with `RelatedIntegrationObjectID = "@lookup:MJ: Integration Objects.Name=AmsEvent&IntegrationID=@lookup:MJ: Integrations.Name=YourMembership"`. The target IO name `AmsEvent` does not exist anywhere in the emission. The correct target — the top-level events collection — is named `Events` (not `AmsEvent`) in the same emission.

**Affected IOFs** (11 records):
- `AmsEvent_Alias.EventId`
- `AmsEvent_AttendeeTypeSessions.EventId`
- `AmsEvent_AttendeeTypeTickets.EventId`
- `AmsEvent_EventRegistrationSessions.EventID`
- `AmsEvent_EventRegistrations.EventID`
- `AmsEvent_EventSessionGroups.EventId`
- `AmsEvent_Sessions.EventId`
- `AmsEvent_Tickets.EventId`
- `AmsEvent_VirtualMeetings.EventId`
- `AmsEvent_VirtualUsers.EventId`
- `AmsEvent_VirtualWebinars.EventId`

**Source citation**: Independent walk of `https://ws.yourmembership.com/openapi` (fetched 2026-05-30 during this review). The event sub-resources exist at path templates `/Ams/{ClientID}/Event/{EventId}/Sessions`, `/Ams/{ClientID}/Event/{EventId}/Tickets`, etc. There is no standalone `/Ams/{ClientID}/AmsEvent` path — the parent resource lives at `/Ams/{ClientID}/Events` (plural), which the emission correctly names `Events`. `CODE_EVIDENCE.json` entries confirm the producer explicitly set `ParentObjectName=AmsEvent` for each of these 11 sub-resources, and `IOF.AmsEvent_*.EventId.IsForeignKey=true RelatedIntegrationObjectID=AmsEvent`. A `@lookup` against `Name=AmsEvent` will fail with a no-match error at `mj sync push` time because no IO row carries that name.

**What the producer's report says**: The producer's CODE_EVIDENCE explicitly records these FK claims as correct, unaware that the target name "AmsEvent" was a fabricated intermediate name never emitted as its own IO. The EXTRACTION_REPORT (METADATA_REPORT.md) does not address this specific gap.

**Severity**: Blocking. Every `mj sync push` will fail on FK resolution for these 11 IOF records. The `floor-check` bijection rule requires "every IOF with `IsForeignKey=true` has a `RelatedIntegrationObjectID` `@lookup:` reference resolving to a sibling IO." These 11 references resolve to nothing.

**Fix required**: Change all 11 `RelatedIntegrationObjectID` values from `@lookup:...Name=AmsEvent...` to `@lookup:MJ: Integration Objects.Name=Events&IntegrationID=@lookup:MJ: Integrations.Name=YourMembership`.

---

### GAP-2: IsForeignKey=true with @lookup target "Member" resolves to a non-existent IO [BLOCKING]

**What the gap is**: 7 Integration Object Field records in the `YmcCareer` category carry `IsForeignKey=true` with `RelatedIntegrationObjectID` pointing to `Name=Member`. The IO named `Member` does not exist in the emission. The emission contains `Members` (plural, at `/Ams/{ClientID}/Members`) but not `Member` (singular).

**Affected IOFs** (7 records):
- `Pinpoint.MemberID`
- `LocationCoordinates.MemberID`
- `JobAlertsCriteria.MemberID`
- `JobAlerts.MemberID`
- `JobSearch.MemberID`
- `SavedJobs.MemberID`
- `Templates.MemberID`

**Source citation**: Independent walk of `https://ws.yourmembership.com/openapi`. The YMC paths follow the template `/Ymc/{ClientID}/Member/{MemberID}/JobAlerts` etc. The `MemberID` path parameter refers to the same member entity accessible via `/Ams/{ClientID}/Members`. There is no standalone `/Ams/{ClientID}/Member` IO in the emission — the closest is `Members` (plural). `CODE_EVIDENCE.json` entries explicitly state `Pinpoint.MemberID.IsForeignKey=true / RelatedIntegrationObjectID=Member` for all 7, confirming the producer intended the target to be a non-existent IO name.

**What the producer's report says**: CODE_EVIDENCE records these as correctly set FK claims. The review found no attempt to reconcile the singular "Member" FK target with the plural "Members" IO name in the same emission.

**Severity**: Blocking. Same `@lookup` resolution failure as GAP-1. These 7 IOF records will break `mj sync push`.

**Fix required**: Change all 7 `RelatedIntegrationObjectID` values from `@lookup:...Name=Member` to `@lookup:MJ: Integration Objects.Name=Members&IntegrationID=@lookup:MJ: Integrations.Name=YourMembership`. (Alternatively `People` if that is the intended entity — the producer should confirm which of the two member-record IOs is the correct FK target for YMC member paths.)

---

### GAP-3: DeleteAPIPath is set but DeleteIDLocation is null on 13 IOs [BLOCKING]

**What the gap is**: 13 IOs carry a non-null `DeleteAPIPath` but have `DeleteIDLocation = null`. Per the bijection slot table (`phase0-slots.json`), `IntegrationObject.DeleteAPIPath` and `IntegrationObject.DeleteIDLocation` are co-grouped capability slots. When `DeleteAPIPath` is set, `DeleteIDLocation` must be non-null to tell the connector runtime where to place the record identifier in the delete request.

**Affected IOs**:
1. `Auth` — `DELETE /auth` (no path param for record ID — should be `query` per OpenAPI parameter introspection)
2. `AuthByProvider` — `DELETE /auth/{provider}` (provider is in path, but provider is the sub-route selector, not a record ID)
3. `Authenticate` — `DELETE /authenticate` (same as Auth)
4. `AuthenticateByProvider` — `DELETE /authenticate/{provider}` (same shape as AuthByProvider)
5. `AmsEvent_Alias` — `DELETE /Ams/{ClientID}/Event/{EventId}/Alias` (Alias param in query; EventId in path is the parent FK, not the delete target)
6. `AmsEvent_EventRegistrationSessions` — `DELETE /Ams/{ClientID}/Event/{EventID}/EventRegistrationSessions` (RegistrationID in query per OpenAPI)
7. `AmsEvent_EventRegistrations` — `DELETE /Ams/{ClientID}/Event/{EventID}/EventRegistrations` (RegistrationID in query per OpenAPI)
8. `BrandingConfig` — `DELETE /Ams/{ClientID}/BrandingConfig` (Options in query; no path-level record ID)
9. `ContentAreaVersions` — `DELETE /Ams/{ClientID}/ContentAreaVersions` (VersionID in query per OpenAPI)
10. `CustomPages` — `DELETE /Ams/{ClientID}/CustomPages` (PageID in query per OpenAPI)
11. `CustomPageVersions` — `DELETE /Ams/{ClientID}/CustomPageVersions` (VersionID in query per OpenAPI)
12. `People` — `DELETE /Ams/{ClientID}/People` (ProfileID in query per OpenAPI)
13. `StoreProductUpdate` — `DELETE /Ams/{ClientID}/StoreProductUpdate/ResetReserved` (productIdStockLevelCombo in query per OpenAPI)

**Source citation**: Independent fetch of `https://ws.yourmembership.com/openapi` for each of these delete operations, verifying that each has either `"in": "query"` or `"in": "path"` parameters carrying the record identifier. For example, `DELETE /Ams/{ClientID}/People` has `ProfileID` as a `query` parameter (confirmed by OpenAPI param walk of that path's delete operation).

**What the producer's report says**: `DeleteIDLocation` is completely absent from the emission for these 13 IOs. The METADATA_REPORT.md does not address this gap.

**Severity**: Blocking. The `DeleteIDLocation` slot is required alongside `DeleteAPIPath` per phase0-slots.json. A connector built from this emission cannot correctly route the delete record identifier (it will not know whether to append the ID to the path, put it in the query string, or put it in the request body).

**Fix required**: Set `DeleteIDLocation` for each affected IO based on the OpenAPI parameter `"in"` value for the delete operation's primary identifier parameter. Based on independent OpenAPI analysis: IOs #5–13 above should be `query`; the Auth IOs (#1–4) are infrastructure session-logout operations that arguably should not carry `SupportsWrite=true` at all (see GAP-4 below, Judgment Calls section).

---

## 2. Judgment Calls

### JC-1: ServiceStack session-auth endpoints (Auth, AuthByProvider, Authenticate, AuthenticateByProvider) classified as SupportsWrite=true under Category=Authentication

**What the producer chose**: Emit these as data IOs with `SupportsWrite=true`, capturing all four CRUD paths (POST = create session, PUT = update session, DELETE = destroy session, GET = read session). Producer reasoning: "Captured here for surface completeness and operator visibility" (from `Description` field of the Auth IO in the emission).

**What I would have chosen**: These are infrastructure endpoints, not data entities. The SOURCE_STUDY §3.4 explicitly classifies ServiceStack session-auth as `INFORMATIONAL`, stating "Session-issuance mechanic, not an IO source." I would have either omitted them entirely (consistent with how JwtIssuer, OAuthToken are treated as non-write IOs) or retained them with `SupportsWrite=false` as observational IOs for completeness.

**Why neither is wrong**: The producer has a defensible position: the session endpoints DO have distinct HTTP verbs with distinct semantics (POST = authenticate, DELETE = logout) that a downstream action could invoke programmatically. Including them documents that capability. My alternative (informational-only, no write) is also source-grounded: SOURCE_STUDY §3.4 explicitly marks this surface INFORMATIONAL. Both readings are consistent with the source. This is an interpretive call about whether "infrastructure operations" belong in the data-entity IO catalog.

**Note**: If the producer's position is kept (SupportsWrite=true on Auth IOs), GAP-3 (#1–4 above) must still be resolved by setting `DeleteIDLocation`.

---

### JC-2: DonationTransactions, DuesTransactions, StoreOrderDetails, InvoiceItems classified as SupportsIncrementalSync=false despite having DateFrom / LineItemDateEnteredFrom query parameters

**What the producer chose**: SupportsIncrementalSync=false, IncrementalWatermarkField=null for these four IOs.

**What I would have chosen**: Mark these as SupportsIncrementalSync=true with IncrementalWatermarkField set to `DateFrom` (or `LineItemDateEnteredFrom` for InvoiceItems). These are transaction-log entities — by their nature they accumulate over time — and the OpenAPI spec provides `DateFrom` as a query parameter for each, enabling server-side date filtering. This is functionally equivalent to a watermark query.

**Why neither is wrong**: The producer's decision is defensible because the `DateFrom` parameter carries no description in the OpenAPI spec (all fields show "no desc"), and the parameter could represent a filter for UI display rather than a guaranteed monotonic index. Setting `SupportsIncrementalSync=true` requires confidence that the field represents actual insertion/modification time (not, for example, a user-chosen display date). Without semantic documentation, the conservative choice (false) follows the "provable-only" rule. My alternative is also defensible because `DateFrom` names are conventional across many AMS systems for "created at or after" filtering, and the entity types (transactions, dues, store orders) are conventionally append-only. Reasonable producers would differ here.

---

### JC-3: MembersProfiles classified as SupportsIncrementalSync=false despite FilterByDateTime parameter

**What the producer chose**: SupportsIncrementalSync=false.

**What I would have chosen**: Mark SupportsIncrementalSync=true with IncrementalWatermarkField=FilterByDateTime, given this is the canonical bulk-export endpoint for member profiles and the parameter name unambiguously suggests a date-filter semantic.

**Why neither is wrong**: Same reasoning as JC-2. The parameter has no description in the OpenAPI spec, and `FilterByDateTime` is a non-standard name that does not guarantee it is a modification timestamp vs. some other date field. The producer's conservative no-emit is consistent with "extract everything, assume least." My position is that the parameter name is strongly conventional; a sync engine could empirically verify the semantic.

---

### JC-4: Auth/Authenticate endpoints classified as SupportsIncrementalSync=false (correct) but SupportsWrite=true

**What the producer chose**: Auth IOs have both SupportsWrite=true and SupportsIncrementalSync=false. The write paths use POST (create), PUT (update), DELETE (destroy) with CreateMethod=POST, UpdateMethod=PUT.

**What I would have chosen**: Auth endpoints are session-management verbs, not record mutations. In my classification they would be SupportsWrite=false because "write" in the connector framework means "mutate a data record," not "invoke an auth verb." The connector auth flow is separate from IO write capability.

**Why neither is wrong**: The producer's position is technically accurate — these endpoints DO accept POST/PUT/DELETE. My position is that these are protocol-layer verbs, not data-layer writes. Both are grounded in source behavior.

---

## 3. Reviewer Errors

### RE-1: Expected "Member" (singular) IO to be missing — it is intentionally absent, which is correct

**My initial suspicion**: My pre-read expected inventory listed "Member" as a core IO that should appear. I suspected it might be missing if the producer only emitted "Members" (plural).

**What the producer did and why it was right**: The producer correctly chose "Members" (plural) as the name for the `/Ams/{ClientID}/Members` endpoint, which is the canonical collection path. There is no `/Ams/{ClientID}/Member` standalone path in the OpenAPI spec (only `/Ams/{ClientID}/Member/{MemberID}/...` sub-resources, which are correctly modeled under `MemberSub_*`). The absence of a "Member" (singular) IO is correct.

**Concession**: My prediction of a "Member" IO was wrong; the producer's naming is accurate to the OpenAPI surface. However, this does not invalidate GAP-2: the FK references that point to `Name=Member` are still broken because the correct IO name is `Members`, not `Member`.

---

### RE-2: Expected the Auth group to be excluded — producer included them, and the inclusion has a rationale

**My initial suspicion**: Based on SOURCE_STUDY §3.4 classifying session-auth as INFORMATIONAL, I expected the Auth/Authenticate IOs to be excluded from the emission (like how `Ping`, `HelpTopic` are excluded).

**What the producer did**: Included Auth IOs with full CRUD capability modeling. This is a reasonable judgment call (JC-1 above), not an error.

**Concession**: The producer did not emit `Ping`, `HtmlSanitization`, `HelpTopic`, `BrandingConfig.css`, or `Custom.css` as data IOs (confirmed: none of these appear in the emission). The auth inclusion was a deliberate, documented choice. I was wrong to expect full exclusion; the producer's reasoning about "surface completeness" is defensible.

---

### RE-3: Expected GroupMembershipLogs to be SupportsIncrementalSync=true — it's false, and that's defensible

**My initial suspicion**: GroupMembershipLogs has a `StartDate` query parameter (confirmed by OpenAPI) — I expected incremental sync to be marked.

**What the producer did**: SupportsIncrementalSync=false. The parameter name `StartDate` is a generic date filter, not a modification watermark. Logs are fetched by `StartDate` but this could filter by group join date, not record modification time.

**Concession**: The producer's conservative choice is consistent with the provable-only principle. Without a description or semantic guarantee that `StartDate` is a modification timestamp, `false` is correct.

---

## Stats Block

```json
{
  "ConfirmedGapsBlocking": 3,
  "ConfirmedGapsAdvisory": 0,
  "JudgmentCalls": 4,
  "ReviewerErrors": 3,
  "IndependentSourcesFetched": 4,
  "BijectionViolationsFound": 31,
  "ModelObserved": "sonnet"
}
```

**IndependentSourcesFetched detail**:
1. `https://ws.yourmembership.com/openapi` — full Swagger 2.0 spec (297 paths, 656 definitions), fetched fresh via `curl` during this review session for independent path/method/parameter analysis
2. `https://ws.yourmembership.com/openapi` — parameter-level inspection for specific delete operations (second targeted query)
3. `metadata/integrations/yourmembership/.yourmembership.integration.json` — emission file parsed independently via Python
4. `packages/Integration/connector-builder-workshop/floor/phase0-slots.json` — bijection slot table

**BijectionViolationsFound breakdown**:
- 18 IsForeignKey=true IOF records whose `RelatedIntegrationObjectID` @lookup target does not exist as an IO in the emission (11 pointing to "AmsEvent" — should be "Events"; 7 pointing to "Member" — should be "Members")
- 13 IOs where `DeleteAPIPath` is non-null but `DeleteIDLocation` is null (the paired slot required by the bijection)

**Note on IsPrimaryKey**: Zero IOF records carry `IsPrimaryKey=true` in the emission. This is the correct outcome: the YM OpenAPI spec uses no `x-primary-key` extension or equivalent explicit PK marker, and the producer applied the Gap 10 rule correctly (no IsPrimaryKey=true without explicit declaration).
