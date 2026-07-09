# Independent Review — Higher Logic Vanilla (Amendment Round 2 re-review)

## Charter disclaimer (verbatim — read before acting on this review)

I am a **same-source reader**, not a live prober. This review is a **LINT green, never a
verification green**. I CANNOT certify — and explicitly do NOT claim — that any of the following
are true: that the paths in this emission are LIVE-correct against a real Vanilla community, that
pagination params actually advance a real cursor, that declared PKs are populated in real records,
that the watermark param is accepted by a live server, or that the documented write surface really
exists end-to-end. Those are the Reality Probe stage's (S7) job. This review is credential-free,
same-source-docs-only, and slim-mode (mechanical count-reconcile + targeted spot-checks, not a full
re-parse of the 335-path / 380-schema merged OpenAPI spec into context).

**Model-leakage check**: I observe no producer-decision recall beyond what is written in the repo's
own artifacts (SOURCE_STUDY.md, the emission, `contract.json`, the prior `INDEPENDENT_REVIEW.md`).
Running as Claude Sonnet 5, a different model surface than the extraction/coordination agents. No
escalation needed on this axis.

**Process note (read order + what this round actually is)**: I read `SOURCE_STUDY.md` first (the
door-level accounting ledger in §4, the 51-name `TaxonomyLeaves` in §4.4/`sources/derived/taxonomy-
leaves.mapping.json`, the per-taxonomy tables in §5), THEN sampled the current emission
(`metadata/integrations/higherlogic-vanilla/.higherlogic-vanilla.integration.json`) via scratch Node
scripts, THEN opened the prior `INDEPENDENT_REVIEW.md` (605 lines, timestamped **before** the most
recent metadata write) as the round-1 record — not as something to trust uncritically, but as a
checklist of 9 previously-Blocking items to independently re-verify against the CURRENT file state.
**This is round 2**: the workspace already contained a completed round-1 review (B1–B9 Blocking, 3
Advisory, 2 Judgment Calls, 3 Reviewer Errors) when I started. My job this round was to determine,
independently, whether the producer's amendment actually closed those 9 items — not to re-litigate
them from scratch — and separately to run my own fresh enumeration-coverage + bijection sweep in
case the amendment introduced anything new.

**No `EXTRACTION_REPORT.md`** exists in this vendor's workspace (confirmed again this round) — the
v2 pipeline's structural-report equivalent is `contract.json` + `DUAL_DERIVATION.json` +
`EXTRACTION_REPORT_MATRIX.csv`, consistent with round 1's note. Not treated as a structural failure
(same finding as round 1, still true, still not escalation-worthy given the CSV+JSON equivalents
exist and are populated).

---

## 0. Independent re-verification method (slim mode)

1. **Count-reconcile, not re-parse**: I did NOT re-load the 380-schema merged spec into context.
   Instead I trusted (and independently re-derived a subset of) the producer's own script-computed
   ledgers — `sources/derived/taxonomy-leaves.mapping.json` (51 `TaxonomyLeaves`, script-computed)
   and `sources/derived/schema-ledger.full.json` (380-schema bucket accounting, closes exactly:
   46+10+142+182+0=380) — and cross-checked the CURRENT emission's IO name list against both via a
   Node diff script.
2. **Emission sample**: read the metadata file's IO/IOF arrays directly (not the source) for the 9
   specific objects named in round 1's B1–B9, plus a further 15-field spot-check across
   `Escalation`, `Appeal`, `Report`, `ReportReason`, `ModerationMessage`, `ReactionType`, `Draft`,
   `MediaItem`, `CommentReaction`, `DiscussionReaction`, `EscalationLog`, `BadgeRequest` for
   PK/FK/watermark plausibility against SOURCE_STUDY.md §5's tables.
3. **Full mechanical bijection sweep** (all 65 IOs, all IOFs) for: capability-flag ⇒ per-operation
   column non-null; `SupportsIncrementalSync` ⇒ `IncrementalWatermarkField` non-null; FK-lookup
   target-name resolution against the emitted IO-name set. (My first pass at the FK sweep had a bug
   — I initially checked a non-existent `IsForeignKey` boolean field; the actual schema marks an FK
   solely via a populated `RelatedIntegrationObjectID` + `RelatedIntegrationObjectFieldName` +
   `Configuration.ReferencedType`. Caught and corrected before relying on the result — documented
   honestly per the Reviewer Errors discipline, see R1 below.)
4. **Zero-field / zero-PK sweep** across all 65 IOs.

---

## 1. Confirmed Gaps (Blocking)

**None.** All 9 items round 1 classified Blocking (B1–B9) are independently confirmed FIXED in the
current metadata file:

| Round-1 item | What it required | Independently confirmed in current emission |
|---|---|---|
| B1 `BadgeRequest` zero emission | New IO, real PK/FK/CRUD | `BadgeRequest` now emitted: PK `badgeID`+`userID`, `CreateAPIPath=/badges/{id}/requests`, `DeleteAPIPath=/badges/{id}/requests/{userID}`, 5 fields, 3 CODE_EVIDENCE entries |
| B2 reaction-event log missing | `CommentReaction`/`DiscussionReaction` IOs | Both now emitted: PK `recordType`+`recordID`+`userID`+`tagID`, Create+Delete paths wired, 5 fields each |
| B3 `EscalationLog` missing | New IO, PK `escalationLogID` | Now emitted: PK `escalationLogID`, 9 fields, 3 CODE_EVIDENCE entries (list-only, `APIPath=/escalations/log`, consistent with an append-only audit trail — no Create/Delete claimed, honestly) |
| B4 `EventParticipant.SupportsCreate` under-claimed | Wire the RSVP-create endpoint | `SupportsCreate=true`, `CreateAPIPath=/events/{id}/participants`, `CreateMethod=POST` |
| B5 `GroupMember.SupportsUpdate` under-claimed | Wire the role-change endpoint | `SupportsUpdate=true`, `UpdateAPIPath=/groups/{id}/members/{userID}`, `UpdateMethod=PATCH` |
| B6 `UserBadge.SupportsCreate`/`.SupportsDelete` under-claimed | Wire grant/revoke | `SupportsCreate=true` (`/badges/{id}/users`), `SupportsDelete=true` (`/badges/{id}/users/{userID}`) |
| B7 composite-PK omission on 5 join objects | Add parent-scope ID to PK | `GroupApplicant` PK=`userID`+`groupID`; `GroupInvite` PK=`userID`+`groupID`; `GroupMember` PK=`userID`+`groupID`; `GroupTag` PK=`tagID`+`groupID`; `UserBadge` PK=`badgeID`+`userID` — all now composite, mirroring the `EventParticipant`/`ConversationParticipant`/`PollVote` pattern round 1 cited as the correct model |
| B8 bulk-vs-single endpoint on 3 write ops | Point at the single-record sibling path | `GroupApplicant.UpdateAPIPath=/groups/{id}/applicants/{userID}`; `GroupInvite.DeleteAPIPath=/groups/{id}/invites/{userID}`; `GroupMember.DeleteAPIPath=/groups/{id}/members/{userID}` — all now single-record paths, not the bulk array-body endpoints |
| B9 `Icon.DeleteAPIPath` template var mismatch | Rename `{id}`→`{iconUUID}` | `Icon.DeleteAPIPath=/icons/{iconUUID}`, matching the `IsPrimaryKey` IOF `iconUUID` exactly |

I did not merely trust these table rows — each was read directly from the current
`.higherlogic-vanilla.integration.json` via my own Node script (see §0), not copied from any
producer self-report.

**Fresh sweep found nothing new.** Beyond re-verifying B1–B9, I ran the full mechanical checks
independently (not reusing round 1's numbers) across the CURRENT 65-IO emission (up from round 1's
61 — the +4 are `BadgeRequest`, `CommentReaction`, `DiscussionReaction`, `EscalationLog`, i.e.
exactly B1/B2/B3):

- **Enumeration coverage**: all 51 `TaxonomyLeaves` (the script-computed door-level catalog) are
  present in the emission; 14 additional second-layer/join objects are emitted on top
  (`ArticleRevision`, `BadgeRequest`, `CommentReaction`, `ConversationParticipant`,
  `DiscussionReaction`, `EscalationLog`, `EventParticipant`, `GroupApplicant`, `GroupInvite`,
  `GroupMember`, `GroupTag`, `PollVote`, `UserBadge`, `WebhookDelivery`) = 65 total, 0 missing, 0
  unexpected extras beyond the documented second-layer set.
- **Capability↔method bijection**: 0 violations across all 65 IOs — every `SupportsCreate`/
  `SupportsUpdate`/`SupportsDelete=true` has its matching non-null `*APIPath`+`*Method` pair.
- **Watermark bijection**: 0 violations — every `SupportsIncrementalSync=true` IO has a non-null
  `IncrementalWatermarkField`.
- **FK target resolution**: 111 `RelatedIntegrationObjectID` references found; all 111 resolve to an
  IO name actually present in this emission (0 unresolved, 0 singular/plural mismatches, 0
  `@parent:ID`-instead-of-`@parent:IntegrationID` defects).
- **FK-on-non-scalar check**: no IOF marked as an FK carries an array/object `Type` (no path-LMS-
  class access-path-as-FK defect observed in the sampled set).
- **Zero-field / zero-PK sweep**: 0/65 IOs have zero fields; 0/65 have zero `IsPrimaryKey` fields.
- **Capability honesty vs. write-capable vendor**: 54/65 emitted IOs (83%) carry at least one of
  `SupportsCreate`/`SupportsUpdate`/`SupportsDelete=true`, each with a populated per-operation
  path+method+body-shape+ID-location. This is NOT a pull-only shim for a documented
  read-write vendor (the GrowthZone #30 class) — write capability is broadly and honestly claimed,
  consistent with SOURCE_STUDY.md's characterization of Vanilla as having "real Create/Update/Delete
  paths and HTTP methods" for "the large majority" of the 51 coverable doors.

---

## 2. Judgment Calls

Carried forward from round 1 (I independently re-read both; neither producer reasoning nor my own
counter-reasoning has changed, and neither is a gap):

### J1 — `ArticleRevision` promoted to a full IO; `ThemeRevision` (same shape: dedicated numeric PK
`revisionID`, distinct from parent) left informational

**What the producer chose**: promote `ArticleRevision` this round, leave `ThemeRevision` and
`DiscussionStatusLog` (no dedicated PK field) out of `TaxonomyLeaves`/emission.

**What I would have chosen**: promote `ThemeRevision` too, for shape-consistency with
`ArticleRevision`. `DiscussionStatusLog` I'd leave out (genuinely no dedicated PK).

**Why neither is wrong**: both individually source-grounded; `ThemeRevision`'s business value is
materially lower than the B1–B9 items, and reasonable extraction runs draw this exact line
differently. Not escalated as a gap in round 1 or this round.

### J2 — `UserNote`'s list `APIPath` (`/user-notes`, broader) vs. its mutate paths
(`/user-notes/notes[/{id}]`, narrower "plain notes" subtype)

Re-confirmed this round: both sub-paths are real and correctly distinguished in the spec; the
producer's wiring is correct. I'd have added a one-line `Configuration` note about the
list-is-a-superset asymmetry, but its absence isn't a correctness defect.

---

## 3. Reviewer Errors

### R1 (this round) — My first FK-sweep script checked a field (`IsForeignKey`) that doesn't exist
in this connector's IOF shape

The emitted IOF schema marks a foreign key solely via a populated `RelatedIntegrationObjectID` +
`RelatedIntegrationObjectFieldName` + `Configuration.ReferencedType` — there is no separate boolean
`IsForeignKey` field on these rows. My first sweep script filtered on `iof.fields.IsForeignKey`,
which is always `undefined` in this emission, and so reported "0 FK-ish fields found" on objects
(`Escalation`, `Appeal`) that I could independently see, by eye, DO carry real, correctly-wired FK
references (`Escalation.assignedUserID→User`, `Appeal.escalationID→Escalation`, etc.). Caught before
reporting by re-deriving the sweep from `RelatedIntegrationObjectID` presence instead; the corrected
sweep found 111 FK-ish fields, 0 unresolved. Documented per the charter's honesty requirement — not
a producer defect, a reviewer-tooling bug I fixed before relying on the result.

### R2 (carried forward from round 1, still valid) — the producer's own `dual-derive` tool's
"OBJECT-SET fabrication" flag on `ProductMessage`/`UserMention`/`OnlineUser` is a false positive

Re-confirmed this round via the schema-ledger: all three resolve to real, source-grounded paths.
Tooling limitation in the re-derivation walk, not a producer defect.

### R3 (carried forward from round 1, still valid) — round 1's own path-matching script had a
`:param`-vs-`{param}` bug producing 2 false overclaim hits (`Escalation`, `ReportReason`); corrected
before that round's report. I independently re-derived `Escalation`'s and `ReportReason`'s CRUD
wiring this round via direct field reads (not a path-matching script) and confirm both are correctly
wired — no regression.

---

## 4. Confirmed Gaps (Advisory)

Carried forward from round 1, independently re-checked, still non-blocking:

- **A1 — `GroupTag` nested-path (`/groups/{id}/tags`, no page/limit) vs. the flatter
  `/groups/tags` (paginated) choice**: still a real sync-efficiency tradeoff (full-catalog sync
  requires walking every Group first via the nested path), not a coverage defect.
- **A2 — `UserBadge` nested-path (`/users/{id}/badges`) vs. flatter `/badges/users`**: same
  tradeoff class as A1.
- **A3 — Residual `contract.json.gapsRemaining` low-confidence candidate names**: I spot-checked a
  representative subset this round (`AnalyticsDashboard`, `DiscussionStatus`, `UserNoteWarning`,
  `ArticleDraft`, `AnalyticsLeaderboard`, `AuthenticatorDebugLog`, `DashboardMenu`,
  `DiscussionStatusLog`, `Post`, `ReportAutomation`, `RoleRequestMeta`, `UserLeader`, `UserReacted`,
  `ArticleTranslation`, `BadgeUser`) against `sources/derived/schema-ledger.full.json`'s bucket
  assignments. Only 2 of the 15 (`AnalyticsDashboard`, `RoleRequestMeta`) are even real schema names
  in the merged spec, and both are bucketed `topLevelOtherEndpoint` (DTO variant of an
  already-covered/informational door) — NOT unbucketed/unaccounted coverable objects. Combined with
  the schema-ledger's exact 46+10+142+182+0=380 accounting closure and the door-level 79=51+27+1
  closure, this narrows my residual concern from round 1's "20 unverified names, treat with
  suspicion" to "spot-checked subset is consistent with no missed coverage; full closure math
  independently corroborates completeness." Downgrading confidence-of-risk on this item but leaving
  it Advisory (not fully exhaustive-verified item-by-item) rather than closing it outright.

---

## Bijection check against `phase0-slots.json` — this round's independent result

- **Capability→per-operation-column non-null**: 0 violations / 65 IOs.
- **`SupportsIncrementalSync`⇒`IncrementalWatermarkField`**: 0 violations / 65 IOs.
- **FK target resolution**: 111/111 resolve, correct `@parent:IntegrationID` qualifier used
  throughout (no `@parent:ID` defect).
- **Zero-field/zero-PK**: 0/65.

**No mechanical bijection violations found this round.** All 9 previously-Blocking items (which were
precisely the class of defect a mechanical bijection sweep CANNOT catch alone — B8/B9 were non-null
slots holding the WRONG value, B7 was a non-null-but-non-unique PK, B4–B6 were capability
under-claims rather than mismatches) are independently confirmed fixed.

---

```json
{
  "ConfirmedGapsBlocking": 0,
  "ConfirmedGapsAdvisory": 3,
  "JudgmentCalls": 2,
  "ReviewerErrors": 1,
  "IndependentSourcesFetched": 2,
  "BijectionViolationsFound": 0,
  "ModelObserved": "sonnet",
  "ReviewFile": "packages/Integration/connectors-registry/higherlogic-vanilla/INDEPENDENT_REVIEW.md",
  "FixInstructions": []
}
```
