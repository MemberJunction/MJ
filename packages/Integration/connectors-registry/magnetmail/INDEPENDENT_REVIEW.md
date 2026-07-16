# Independent Review — MagnetMail (Higher Logic Marketing Enterprise) connector, REDO v2.0.0 — AMENDMENT ROUND 2

**Reviewer position (v2 charter, verbatim per instructions):** This review is a **same-source LINT
review**, not a live-verification pass. I CANNOT certify that paths are LIVE-correct, that pagination
params actually advance, that declared PKs are populated in real records, that the watermark param is
accepted, or that the write surface really exists against a live MagnetMail tenant. Those are the Reality
Probe (S7) / live-tier (T8+) job. This review's green (or red) is a LINT/coherence verdict over the
same credential-free WSDL evidence the producer used — never presented as live verification.

Run reviewed: `connector-magnetmail-1783132483150-5d0b164d`, post-`amend-round2.ts` state of
`metadata/integrations/magnetmail/.magnetmail.integration.json` (45 `MJ: Integration Objects`, 307
`MJ: Integration Object Fields`, 0 zero-field objects — reconfirmed by a fresh count-reconcile, not
carried over from round 1).

**Read order / independence note (SLIM MODE, per task instructions).** I did NOT re-read the 4176-line
WSDL into context. I fetched it fresh this session (`curl -m 30 https://hlma-apie1.magnetmail.net/mmapi.asmx?WSDL`
→ 4176 lines, byte-identical line count to round 1's fetch) into scratch, then ran small node/python
scripts against the saved bytes + the metadata JSON to extract structural facts (operation list, complexType
lineage, specific field/type lookups) — never eyeballing the raw file. I built my expected-inventory checks
(operation count, mutating-op list, pagination-criteria lineage, PK-getById signals) into
`/private/tmp/.../scratchpad/wsdl_facts.mjs` and several targeted python snippets BEFORE opening
round-1's `INDEPENDENT_REVIEW.md` (read second, as the round-1 gap-status baseline), `DEPRECATION_RECORD.md`
(regression-diff baseline, read third), and `contract.json`/`DUAL_DERIVATION.json`/`amend-round2.ts` (read
last, as the producer's own report of what it did). Independently confirmed: 55 SOAP operations (matches
round-1's count exactly), 124 raw `s:complexType` declarations in the XSD.

---

## 0. Carried-forward round-1 gaps — verified status

| Round-1 gap | Status this round | Evidence |
|---|---|---|
| Gap 1.1 (dead pagination on `Recipient` + 4 tracking-data IOs) | **FIXED** | All 5 IOs now `PaginationType:"PageNumber"`/`SupportsPagination:true` with a `Configuration.Pagination` block. I independently re-derived the XSD lineage from my own fresh WSDL fetch: `SearchCriteria{pageNo,pageSize}` (both `minOccurs="1"`) is the base of `RecipientSearchCriteria`; `PagedSearchCriteria{PageNo,PageSize}` (both `minOccurs="1"`) is the base of `DateRangeSearchCriteria` → `MessageLinkTrackingSearchCriteria`/`MessageTrackingSearchCriteria` (used by both `GetMessageSentTracking` and `GetMessageOpenTracking`)/`UnsubscribeSearchCriteria`. Matches the emitted `Configuration.Pagination.{pageParam,sizeParam,operation,criteriaType}` exactly for all 5. I also spot-checked one `PaginationType:"None"` IO (`Message`, governed by `getMessagesUTC`) against the WSDL and confirmed its request element genuinely has zero pagination params (date-range + boolean filters only) — the `None` value there is correct, not a miss. |
| Gap 1.2 (zero FK / hardcoded `defer`) | **PARTIALLY FIXED — root cause still open, see §1.1 below (carried forward, Blocking, with 13 NEW concrete candidates found this round)** | 17 FK edges added across 6 IOs this round (see §2 Reviewer Errors — I initially misread these as a bijection violation; they are correct). But `extract-io-iof.ts`'s hardcoded `FKVerdict:'defer'`/`CrossIOMatch:'no'` for the other 37 IOs was never fixed — only the 8 reviewer-named objects got a hand-patch. I ran a fresh independent cross-IO name-match scan (exact + `<ObjectName>Id`/`<objectname>_id` pattern) over the CURRENT 307-field catalog and found **13 additional credible, currently-unfixed FK candidates** outside the 8 patched objects (see §1.1). |
| Gap 1.3 (78% `IsPrimaryKey` claims rated "Weak") | **WITHDRAWN this round — see Judgment Call JC3** | The producer's `amendmentRejected` block cites a real, current governing document (`​.claude/agents/ioiof-extractor.md`'s "PK POLICY") that explicitly supersedes the `classifyPK`-strict rule I (round-1) had applied. I independently confirmed this policy exists, is current, and its text ("1 Tier-2 signal … → still EMIT IsPrimaryKey=true as a soft key + EvidenceStrength=Weak … No statistical-significance bar for PK") directly authorizes exactly the pattern round-1 flagged as Blocking. Round-1's classification is overruled by a more specific, more authoritative source than the one it cited. Not carried forward. |
| Gap 1.4 (`RecipientGroup` missing `EntityAlias`) | **FIXED** | `RecipientGroup.Configuration.EntityAlias` now present, verbatim per round-1's FixInstruction (`canonicalIO:"MailRecipientGroup"`, positional 7-field match documented). |

**Round-1 disposition: 2 fixed (1.1, 1.4), 1 withdrawn (1.3, overruled by a superseding policy — not a
producer failure), 1 carried forward Blocking with new evidence (1.2's root cause).**

---

## 1. Confirmed Gaps (Blocking)

### 1.1 — `extract-io-iof.ts`'s cross-IO FK detector remains hardcoded to `defer`/`no` outside the 8 reviewer-patched objects; a fresh scan finds 13 more concrete, currently-unfixed candidates

**What the gap is.** `amend-round2.ts` is explicit and honest about its own scope in its `amendmentRejected`
block: it patched FK edges on exactly the 8 objects named in round-1's review, and states the full-catalog
re-pass is "OUT OF SCOPE for this delta round … requires a future full-catalog FK round." That disclosure is
good practice, but the underlying defect (the extractor's matrix-row construction hardcodes `FKVerdict:'defer'`
and `CrossIOMatch:'no'` for every IO, never actually running `aggregatePKFKSignals`'s cross-IO name-matching
step) is unchanged, and I confirmed by an independent mechanical re-scan that it is not a merely theoretical
residual risk — there is live, concrete, missed signal:

I ran a fresh cross-IO name-match pass over the **current** (post-round-2) 307-field catalog: for every field
without a `RelatedIntegrationObjectID`, check whether its name exact-matches another IO's emitted PK, or
matches the `<ObjectName>Id`/`<objectname>_id` convention against another IO's PK. After discarding pure
name-collision noise from the generic PK names `Id`/`ID` shared by several unrelated objects (e.g.
`RecipientGroup.Id` vs `Unsubscribe.Id` — both independently PK'd, no real relationship), **13 credible
candidates remain, none of which have `RelatedIntegrationObjectID` set**:

| Field | Target | Signal |
|---|---|---|
| `Message.user_id` | `User.User_Id` | `<objectname>_id` pattern |
| `MessageDetails.user_id` | `User.User_Id` | `<objectname>_id` pattern |
| `Unsubscribe.UserId` | `User.User_Id` | `<ObjectName>Id` pattern |
| `Unsubscribe.RecipientId` | `Recipient.id` | `<ObjectName>Id` pattern |
| `Unsubscribe.MessageId` | `Message.message_id` | `<ObjectName>Id` pattern |
| `Unsubscribe.GroupId` | `group.group_id` | `<ObjectName>Id` pattern |
| `Unsubscribe.MessageCategoryId` | `MessageCategory.ID` | `<ObjectName>Id` pattern |
| `Unsubscribe.GroupCategoryId` | `GroupCategory.ID` | `<ObjectName>Id` pattern |
| `GroupRecipient.RecipientId` | `Recipient.id` | `<ObjectName>Id` pattern — **this exact one was named in round-1's own FixInstructions and still isn't fixed** (disclosed, not silent, but still open) |
| `UploadInitialJob.UserId` | `User.User_Id` | `<ObjectName>Id` pattern |
| `EventSignUp.UserId` | `User.User_Id` | `<ObjectName>Id` pattern |
| `email_history.message_id` | `Message.message_id` | exact name match |
| `PaidItem.ClientReferenceId` | `Registrant.ClientReferenceId` | exact name match — softer signal (likely a correlation key between sibling child arrays of the same `EventSignUp` request rather than strict parent/child, similar in kind to `GroupRecipient`'s nested-array ambiguity from round-1's RE1 — flag with appropriately hedged confidence) |

Note `Unsubscribe` alone carries 6 of these — it is the single largest remaining exposure and sits entirely
outside the 8-object round-2 patch list (it was not one of the reviewer-flagged objects in round 1 either,
since round 1's flagged set was the *tracking-data* IOs, not the `Unsubscribe` create-object itself).

**Source citation.** Independent script over `metadata/integrations/magnetmail/.magnetmail.integration.json`
(current state, this session) cross-referencing every emitted `IsPrimaryKey=true` field against every
FK-less field's name; `packages/Integration/connectors-registry/magnetmail/scripts/extract-io-iof.ts` (the
hardcoded `defer`/`no` matrix constants, unchanged from round 1's citation).

**What the producer's report says.** `amend-round2.ts`'s `amendmentRejected[1]` correctly discloses the
scope limitation and flags `requiresEscalation` for a full-catalog re-pass, but does not enumerate any of
the 13 specific candidates above (only `GroupRecipient.RecipientId` was previously named, in round 1).

**Severity.** Blocking — carried forward from round 1, now with concrete, independently-verified evidence
that the exposure is real and larger than the single previously-named field. `operation: null` /
`requiresEscalation: true` on the root-cause item (a full re-walk of `extract-io-iof.ts`'s matrix logic is
needed, not a per-slot patch); the 13 individual field-level fixes below ARE mechanically applicable now.

---

## 2. Confirmed Gaps (Advisory)

### 2.1 — Dual-derive's 37-item "object-set under-enumeration" flag sits open/untriaged in `contract.json`/`DUAL_DERIVATION.json` ("skipped-with-reason 0") despite being benign on inspection

`DUAL_DERIVATION.json` reports `enumeratedCount:82` (raw named `s:complexType` count) vs `emittedCount:45`,
listing 37 "missing" record types. I independently walked **every one of the 37 named items** against my own
fresh WSDL fetch: all are non-syncable — RPC result/status wrappers (`AuthenticationResult`,
`EmailToGroupResult`, `EmailToIndividualResult`, `EventSignupResult`, `PaidItemSignupResult`,
`RecipientSuppressionResult`, `RegistrantSignupResult`, `SaveResult`/`saveResult`, `UploadListResult`,
`createEditMessageResult`, `error`), search-criteria/filter parameter shapes (`SearchCriteria`,
`PagedSearchCriteria`, `DateRangeSearchCriteria`, `RecipientSearchCriteria`, `MessageLinkTrackingSearchCriteria`,
`MessageTrackingSearchCriteria`, `UnsubscribeSearchCriteria`, `PersonifySubscriptionMappingSearchCriteria`),
response-envelope wrapper containers around arrays of already-emitted IOs (`MessageLinkTrackingResults`,
`MessageOpenTrackingResults`, `MessageSentTrackingResults`, `RecipientSearchResults`, `PagedSearchResults`,
`PersonifySubscriptionMappingSearchResults`, `UnsubscribeTrackingResults`), the SOAP auth-header type
(`mmAuthHeader`), an abstract shared base already represented via its concrete subtypes (`TrackingDataBase`),
nested write-only parameter sub-structures already folded into their parent IO's fields
(`CreditCardBillingInfo`+`CreditCardInfo`+`PaymentInfo` → `EventSignUp.PaymentInfo` (json); `UploadJobSettings`
→ already documented as folded in `UploadInitialJob.Configuration.NestedWriteConfig` per round-0 Gap 3;
`PersonifyObject`/`sendNotification` → nested request-parameter shapes inside criteria/action payloads, not
independent objects), and one already-decided exclusion (`newsletter`, round-0 Gap 4). None represents a real
missed syncable object.

This is **not** a completeness gap in substance, but the mechanical gate's output is left open with a
literal "skipped-with-reason 0" annotation — meaning the completeness checker that's supposed to force
per-item triage never actually got closed out. Recommend annotating each of the 37 with an explicit
`skipped:{reason:'non-object-wrapper'|'criteria-param-type'|'nested-write-config'|'auth-header'|'already-aliased'}`
so a future audit doesn't have to re-derive this from scratch.

**Severity.** Advisory — downstream can proceed; recommend closing for audit hygiene, not blocking.

### 2.2 — Two genuine mutating SOAP operations (`sendEmailToIndividual`, `sendMessageToGroup`) have zero documented scope-decision anywhere in the emission

The WSDL defines two real, distinct mutating operations beyond the 7 already-modeled write-capable IOs:
`sendEmailToIndividual` (→ `EmailToIndividualResult`) and `sendMessageToGroup` (→ `EmailToGroupResult`, with a
`sendNotification` job-completion-notification sub-payload). Neither appears anywhere in the metadata file
(0 hits for either string) and there is no top-level `OutOfScopeObjectFamilies`-style key in
`Integration.Configuration` at all. On inspection these are transactional "send" RPC actions with no
persisted-record shape (no PK, no get-by-id/list counterpart) — excluding them from object-sync IO modeling
is defensible (see Judgment Call JC4) — but per the capability-honesty check, a real write capability with
no documented scope note is a gap in documentation completeness, distinct from (and much smaller than) the
GZ #30 "zero write-capable IOs for a bidirectional vendor" class, since 7 legitimate write-capable IOs are
already present and honest.

**Severity.** Advisory — recommend a one-line `Configuration.OutOfScopeObjectFamilies` (or equivalent) note
naming both operations + the "transactional action, not a syncable object" rationale.

### 2.3 — `contract.json`'s dual-derive "spec write op(s) with no per-operation columns" flags for `Recipient`/`Message`/`group` are stale/false-positive

`contract.json`'s `gapsRemaining` lists `Recipient`, `Message`, and `group` as having "spec write op(s) with
no per-operation columns: create[, update]" — but I directly confirmed in the CURRENT metadata that all
three have `CreateAPIPath`/`CreateMethod` (and `Update*` where applicable) populated (`/mmapi.asmx` + `POST`).
This looks like a tool heuristic that doesn't correctly recognize a single-shared-endpoint SOAP connector's
per-operation columns (it may expect the path to vary per operation, which it deliberately does not for this
protocol). Not a connector defect; flagging so the tool isn't trusted at face value in a future round.

**Severity.** Advisory — tooling note, not a metadata gap.

### 2.4 — Stale `CODE_EVIDENCE.json` entry for `JobToGroup.group_id.IsPrimaryKey`

`CODE_EVIDENCE.json` still carries a `Weak`-strength `IsPrimaryKey` entry for `JobToGroup.group_id`, but the
current metadata correctly has `IsPrimaryKey:false`/`IsUniqueKey:false` for that field (superseded by its
round-2 FK reclassification to `group.group_id`). The evidence file wasn't pruned when the classification
changed.

**Severity.** Advisory — evidence-hygiene drift, not a live claim inconsistency (the metadata itself is
correct).

---

## 3. Judgment Calls (non-blocking)

### JC1 — SOAP `CreateBodyShape:"literal"` instead of `flat`/`wrapped` (carried forward from round 1, unchanged, still valid)

Unchanged from round 1's JC1: `literal` is the documented, correct escape hatch for a SOAP protocol riding
`BaseRESTIntegrationConnector`, consistently applied with matching `CreateIDLocation:"body"`. Not a gap.

### JC2 — `EntityAlias` as a free-text `Configuration` note rather than a structural FK/lookup field (carried forward from round 1, unchanged, still valid)

Unchanged from round 1's JC2. `group`↔`MailRecipientGroup`, `Message`↔`MessageDetails`, and now
`RecipientGroup`↔`MailRecipientGroup` all use this consistent, defensible pattern for "two response shapes,
one underlying record" relationships that don't map onto the FK slot's parent/child semantics.

### JC3 — Round-1's Gap 1.3 ("78% Weak `IsPrimaryKey` evidence") is overruled by the ioiof-extractor's own PK POLICY, not a defect

**What the producer chose.** Reject the reviewer's `classifyPK`-strict demand entirely, citing
`.claude/agents/ioiof-extractor.md`'s "PK POLICY — soft keys, emit the best-available identity (supersedes
the strict tiers … FOR PK)": a soft PK cannot fail a sync or drop data (no DB constraint enforces it), so
the real cost of demoting a wrong-but-plausible PK to `unique-only` is a PK-less object that stalls CodeGen —
worse than a Weak-evidenced soft PK. The policy text explicitly states a single Tier-2 naming-convention
signal is sufficient to **emit** `IsPrimaryKey=true` + `EvidenceStrength=Weak`, with **no statistical-
significance bar for PK** (the bar only gates FK/hard constraints).

**What round 1 (and I, carrying it forward) would have chosen.** Demote single-Tier-2-signal PKs to
`IsUniqueKey=true`/`IsPrimaryKey=false` per `extractor-script-conventions.md`'s `classifyPK` pseudocode.

**Why neither is wrong, but the producer's citation wins.** I independently confirmed the PK POLICY text is
real, current, and unambiguous that it supersedes `classifyPK` specifically for PK (FK/hard constraints are
NOT exempted — those still need the significance bar, and that's exactly where I found the 13 new candidates
in §1.1 still correctly deferred/missing rather than fabricated). Round 1's Gap 1.3 was reasoning from a
generic convention doc without checking whether a more specific, more recent, connector-build-specific policy
superseded it for this exact case. This is not a producer failure to fix a gap — it's a reviewer citing the
wrong tier of the rulebook. Withdrawn.

### JC4 — `sendEmailToIndividual`/`sendMessageToGroup` excluded from object-IO modeling (new this round)

**What the producer chose (implicitly, by omission).** Model no IO for either transactional send operation.

**What I would have chosen.** Same outcome, but with an explicit `OutOfScopeObjectFamilies`-equivalent note
(see Advisory 2.2) rather than silence.

**Why neither is wrong.** Both operations are genuine RPC actions with a result/status response, not
persisted, independently-queryable records (no PK, no getById/list op) — the correct call is "not an IO,"
matching the same reasoning already applied to `sendNotification`/`PersonifyObject` (nested action
parameters). The only shortfall is the missing paper trail, which is Advisory, not a modeling error.

---

## 4. Reviewer Errors (honest walk-backs)

### RE1 — Initially flagged all 17 round-2 FK edges as a Blocking "half-set FK" bijection violation; on tracing into the real deployed schema, this is correct behavior, not a bug

My first pass read the persisted metadata and found `RelatedIntegrationObjectID` set (e.g.
`@lookup:MJ: Integration Objects.Name=Message&IntegrationID=@parent:IntegrationID` on
`MessageLinkTrackingData.MessageId`) but `IsForeignKey` **absent** (not `false` — the key doesn't exist in
the field's JSON at all) on every one of the 17 fields `amend-round2.ts` touched. `connector-code-
conventions.md`'s text ("a half-set FK is silently dropped … `IsForeignKey=true` + null target") led me to
initially classify this as the inverse half-set defect (target set, flag missing) and treat it as Blocking.

On tracing further — reading `amend-round2.ts`'s own `fkPatch()` (which DOES send `IsForeignKey:true` in its
upsert payload), then the MCP server's `IntegrationObjectFieldSchema` (`packages/MCP/mj-metadata/src/types.ts`,
no `IsForeignKey` field defined at all, so Zod's `.parse()` silently strips it), then
`packages/MCP/mj-metadata/src/MetadataFileStore.ts`'s `DeleteIOFField` doc-comment ("a transient discovery-
signal key like `IsForeignKey`, which the framework intentionally never persisted — the durable equivalent
is `RelatedIntegrationObjectID`/`RelatedIntegrationObjectFieldName`"), and finally a REAL applied migration
(`migrations/v5/V202606180940__v5.42.x__Integration_Connector_Enhancements.sql`: *"NOTE: IsForeignKey and
Source are intentionally NOT added — IsForeignKey is a transient discovery signal (the persisted FK is
RelatedIntegrationObjectID)"*) — I confirmed `IsForeignKey` is **not a deployed column** on
`MJ: Integration Object Fields` in this environment, by deliberate framework decision. My own charter's
bijection slot table (`phase0-slots.json`) confirms this: it lists `RelatedIntegrationObjectID` as a slot
(line 472) but has **no** `IsForeignKey` slot at all. `RelatedIntegrationObjectID` alone is the correct,
sole, durable FK signal. This is not a gap — walked back. (Net effect: `.claude/rules/connector-code-
conventions.md`'s prose describing `IsForeignKey` as a required hard-constraint field is stale relative to
this shipped migration; worth a framework-doc fix outside this review's scope, but not a connector defect.)

### RE2 — Initially suspected the dual-derive tool's "37 record types under-enumerated" flag was a serious completeness gap; confirmed benign on a full independent walk (see Advisory 2.1)

Same investigative arc as round-1's RE1 (`SpamComplaints`/`recp_unsubscribe`): a raw WSDL-type-count vs.
emitted-IO-count mismatch looks alarming until every named item is checked individually. Here it generalizes
across 37 items rather than 1, and all 37 check out as non-object wrapper/criteria/result/nested-config
types. Downgraded from a suspected Blocking gap to an Advisory hygiene note.

---

## 5. Regression-diff (REDO obligation)

Re-confirmed against `DEPRECATION_RECORD.md`'s §2b baseline (22 IO / 126 IOF DB-seeded prior surface). No
round-2 change reintroduces or silently drops anything from the v1 surface — the 8 objects touched this
round (`Recipient`, the 4 tracking-data IOs, `JobToGroup`, `MailRecipientGroup`, `RecipientGroup`) all
already existed in the post-round-0/1 catalog; round 2 only adjusted their pagination/FK/alias fields, not
their existence. `RegressionDiffConfirmed: true` (unchanged from round 1 — nothing in round 2 touches
regression-diff-relevant object/field presence).

## 6. Deploy-preflight

Task brief states zero unresolved DeployPreflight violations this round. I independently corroborate: the
one thing that looked like a preflight-relevant anomaly (the missing `IsForeignKey` key) turned out to be
the CORRECT, schema-compliant state (RE1 above), not a stray key requiring `DeleteIOFField` cleanup — there
is nothing currently in the file that would fail `mj sync push`'s field-validation phase on this account.

---

## Stats

```json
{
  "ConfirmedGapsBlocking": 1,
  "ConfirmedGapsAdvisory": 4,
  "JudgmentCalls": 4,
  "ReviewerErrors": 2,
  "IndependentSourcesFetched": 1,
  "BijectionViolationsFound": 0,
  "RegressionDiffConfirmed": true,
  "DeployPreflightFixesConfirmed": 0,
  "RoundOneGapsFixed": 2,
  "RoundOneGapsWithdrawn": 1,
  "RoundOneGapsCarriedForwardBlocking": 1
}
```

## FixInstructions

```json
[
  {
    "slot": "iof.Message.user_id.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=User&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "User_Id" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (Message.user_id vs emitted PK User.User_Id, <objectname>_id pattern)",
    "rationale": "Cross-IO PK-name match missed by extract-io-iof.ts's hardcoded FKVerdict='defer'."
  },
  {
    "slot": "iof.MessageDetails.user_id.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=User&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "User_Id" },
    "evidence": "Same signal as Message.user_id.",
    "rationale": "Same root cause, representative of the pattern across MessageDetails."
  },
  {
    "slot": "iof.Unsubscribe.UserId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=User&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "User_Id" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (Unsubscribe.UserId vs emitted PK User.User_Id).",
    "rationale": "Unsubscribe was never in the reviewer-flagged 8-object round-2 scope; carries 6 of the 13 missed candidates."
  },
  {
    "slot": "iof.Unsubscribe.RecipientId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=Recipient&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "id" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (Unsubscribe.RecipientId vs emitted PK Recipient.id).",
    "rationale": "Same root cause."
  },
  {
    "slot": "iof.Unsubscribe.MessageId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=Message&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "message_id" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (Unsubscribe.MessageId vs emitted PK Message.message_id).",
    "rationale": "Same root cause."
  },
  {
    "slot": "iof.Unsubscribe.GroupId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=group&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "group_id" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (Unsubscribe.GroupId vs emitted PK group.group_id).",
    "rationale": "Same root cause; note this is a DIFFERENT Unsubscribe than UnsubscribeTrackingData (already fixed in round 2) — the create-object, not the tracking-row object."
  },
  {
    "slot": "iof.Unsubscribe.MessageCategoryId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=MessageCategory&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "ID" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (Unsubscribe.MessageCategoryId vs emitted PK MessageCategory.ID).",
    "rationale": "Same root cause."
  },
  {
    "slot": "iof.Unsubscribe.GroupCategoryId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=GroupCategory&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "ID" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (Unsubscribe.GroupCategoryId vs emitted PK GroupCategory.ID).",
    "rationale": "Same root cause."
  },
  {
    "slot": "iof.GroupRecipient.RecipientId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=Recipient&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "id" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (GroupRecipient.RecipientId vs emitted PK Recipient.id).",
    "rationale": "Named in round-1's FixInstructions already; still open because GroupRecipient was outside amend-round2.ts's declared 8-object scope. Field is also legitimately its own soft PK (IsPrimaryKey=true) per the PK POLICY — both designations are compatible."
  },
  {
    "slot": "iof.UploadInitialJob.UserId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=User&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "User_Id" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (UploadInitialJob.UserId vs emitted PK User.User_Id).",
    "rationale": "Same root cause."
  },
  {
    "slot": "iof.EventSignUp.UserId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=User&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "User_Id" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (EventSignUp.UserId vs emitted PK User.User_Id).",
    "rationale": "Same root cause."
  },
  {
    "slot": "iof.email_history.message_id.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=Message&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "message_id" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (email_history.message_id, exact name match to Message.message_id, field is ALSO email_history's own emitted PK).",
    "rationale": "Field is simultaneously a soft PK (per PK POLICY) and a plausible FK to its parent Message — compatible, both should be set."
  },
  {
    "slot": "iof.PaidItem.ClientReferenceId.IsForeignKey",
    "operation": "set",
    "before": null,
    "after": { "RelatedIntegrationObjectID": "@lookup:MJ: Integration Objects.Name=Registrant&IntegrationID=@parent:IntegrationID", "RelatedIntegrationObjectFieldName": "ClientReferenceId" },
    "evidence": "metadata/integrations/magnetmail/.magnetmail.integration.json (PaidItem.ClientReferenceId, exact match to Registrant's emitted PK ClientReferenceId).",
    "rationale": "Softer signal than the others (likely a correlation key between two sibling child arrays of the same EventSignUp request rather than strict parent/child) — apply with a Configuration note flagging the softer confidence rather than a bare claim."
  },
  {
    "slot": "extract-io-iof.ts:matrixRow.FKVerdict / CrossIOMatch (full 307-field cross-IO re-pass)",
    "operation": null,
    "before": "hardcoded 'defer'/'no' for the 37 IOs outside the round-2 patched 8",
    "after": "implement the real aggregatePKFKSignals cross-IO name-matching step per extractor-script-conventions.md and re-run across the full catalog",
    "evidence": "packages/Integration/connectors-registry/magnetmail/scripts/extract-io-iof.ts; this round's independent scan found 13 more concrete candidates beyond the 1 already named in round 1, confirming the exposure is real and recurring, not merely theoretical.",
    "rationale": "Root cause of Gap 1.1/carried-forward Gap 1.2 in both rounds. The 13 field-level fixes above are illustrative of what a real re-pass would surface; a full re-walk is still needed to catch anything my manual regex-style scan missed (e.g. non-Id-suffixed reference fields).",
    "requiresEscalation": true
  },
  {
    "slot": "integration.Configuration.OutOfScopeObjectFamilies",
    "operation": "set",
    "before": null,
    "after": "[{ \"operation\": \"sendEmailToIndividual\", \"reason\": \"transactional send RPC action, no persisted/queryable record shape (no PK, no getById/list op)\" }, { \"operation\": \"sendMessageToGroup\", \"reason\": \"same — transactional send RPC action\" }]",
    "evidence": "https://hlma-apie1.magnetmail.net/mmapi.asmx?WSDL (sendEmailToIndividual/sendMessageToGroup operation + response-type definitions, fetched fresh this session)",
    "rationale": "Documents the capability-honesty scope decision (Advisory 2.2/JC4) so a future audit doesn't have to re-derive why these 2 real mutating ops aren't modeled as IOs."
  },
  {
    "slot": "CODE_EVIDENCE.json entry for iof.JobToGroup.group_id.IsPrimaryKey",
    "operation": "clear",
    "before": "Weak-strength IsPrimaryKey entry, stale since round 2's FK reclassification",
    "after": "remove or supersede with a note that group_id is now FK-classified, not PK",
    "evidence": "packages/Integration/connectors-registry/magnetmail/CODE_EVIDENCE.json + current metadata (JobToGroup.group_id.IsPrimaryKey=false, IsUniqueKey=false).",
    "rationale": "Evidence-hygiene cleanup (Advisory 2.4) — the metadata itself is already correct, only the evidence trail is stale."
  }
]
```
