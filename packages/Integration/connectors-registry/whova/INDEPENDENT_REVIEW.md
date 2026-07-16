# INDEPENDENT_REVIEW.md — Whova (Amendment Round 1 re-review)

> **v2 charter scope note (read first).** This review is a **same-source LINT pass**, not a live-system
> verification. It confirms enumeration coverage vs. the SCRIPT-enumerated catalog, bijection coherence
> (capability flags ↔ per-operation columns ↔ watermark fields), capability honesty vs. the brand/source
> study, and naming/plurality/evidence-tier discipline. It does **NOT** and **CANNOT** certify that any
> path is LIVE-correct, that pagination actually advances, that declared PKs are populated in real
> records, that a watermark param is accepted, or that the write surface genuinely exists on Whova's
> private backend — Whova publishes no machine-readable API contract at all (`SchemaContractStatus =
> NoMachineReadableContractFound` per SOURCE_STUDY.md §0), so essentially the entire connector surface
> is credential-free `format-verified-no-creds` at best. That verification is the Reality Probe stage's
> (S7) job and did not run as part of this review.

**Model observed**: this review ran on a different model surface than the producer/coordinator context
recalled in this session (no shared recall of producer intermediate decisions was observed) — consistent
with the model-isolation requirement.

**Reviewer independence**: expected inventory
(`/private/tmp/claude-501/-Users-bcladmin-Projects-MemberJunction-MJ/5538b61b-132d-4626-991d-f5f9d59ce21e/scratchpad/whova_reviewer_expected.txt`)
was written BEFORE opening the emission, the prior `INDEPENDENT_REVIEW.md`, or any report-equivalent
artifact, per the strict read order (SOURCE_STUDY.md → emission → report). This is a **re-review of
amendment round 1** — the prior review round (also present in this file's git history / `.backups/`)
found 2 Blocking + 3 Advisory gaps and issued 4 FixInstructions; `scripts/amend-round1.mjs` applied 3 of
them surgically (the 4th was `operation:null`, advisory-only, no change required). This round verifies
those fixes landed correctly, checks for regressions, and re-runs the full adversarial probe fresh
(SLIM MODE — count-reconcile via Node scripts + independent live re-fetch of the load-bearing Zapier
source, never parsing the whole source corpus in-context).

---

## 0. Mechanical count-reconcile (run fresh, not trusted from the producer)

```
Total IOs: 3 (Attendees, Orders, Registrants)
Zero-field IOs: 0            <- was 2 (Orders, Registrants) before amendment round 1
Bijection violations: 0      <- was 1 (Attendees.SupportsWrite=true w/ null Create* cols) before amendment round 1
PK fabrications (bare 'id' or unmarked structural guess): 0
FK-to-nonexistent-sibling violations: 0 (no FK emitted anywhere; Event correctly not modeled as a
  cross-IO FK — it is documented as a per-sync-scope config parameter, consistent with SOURCE_STUDY §6)
```

Independent live re-fetch of `https://zapier.com/apps/whova/integrations` (via both `WebFetch` and a
separate `curl -A "Mozilla/5.0"` pull, two distinct fetch paths) reproduces, verbatim, the exact
trigger/action/field-list claims the emission and PROVENANCE.json rely on: 3 triggers (Get Attendees,
Get Orders, Get Registrants — each scoped by required `Event`), 1 write action (Create or Update
Attendee — required `Event, First Name, Last Name, Email`; optional `Title, Affiliation/Company,
Location, Ticket Types, Audience Type (in_person/remote), Categories`). A keyword scan of the raw fetched
HTML for `delete|remove|archive` returns zero matches — confirms no missed delete capability. A keyword
scan for `exhibitor|sponsor|session|speaker` also returns zero matches on the Zapier page — confirms the
3-object scope is not an under-enumeration relative to this source.

---

## 1. Confirmed gaps

**None.** Both Blocking gaps from the prior review round were closed correctly by amendment round 1,
verified independently below. No new gaps were found in this fresh adversarial pass.

### Verified FIX — prior Gap 1 (BLOCKING, zero-field Orders/Registrants) — CLOSED

`metadata/integrations/whova/.whova.integration.json` → `Orders` and `Registrants` each now carry exactly
one `MJ: Integration Object Fields` row: `Event` (`Type:String, IsRequired:true, IsReadOnly:false,
IsPrimaryKey:false, IsUniqueKey:false, Status:Active`). This is precisely the FixInstruction issued in the
prior round (`slot: iof.Orders.Event` / `iof.Registrants.Event`, `operation:set`). `CODE_EVIDENCE.json`
carries a matching entry (`ScriptPath: scripts/amend-round1.mjs`, `StructuredOutput:
{OrdersEventAdded:1, RegistrantsEventAdded:1, ...}`) and `PROVENANCE.json` carries `iof.Orders.Event.IsRequired`
/ `iof.Registrants.Event.IsRequired`, both Tier-2 `ExplicitStatement` citing
`https://zapier.com/apps/whova/integrations`. Independently re-confirmed against my own live re-fetch above
(§0) — the `Event` field is genuinely the one documented required input on both triggers. Zero-field
hard-fail condition no longer holds for either object.

### Verified FIX — prior Gap 2 (BLOCKING, `Attendees.SupportsWrite=true` bijection violation) — CLOSED

`Attendees` now emits `SupportsWrite:false, SupportsCreate:false, SupportsUpdate:false,
SupportsDelete:false`, with `CreateAPIPath/CreateMethod/CreateBodyShape/CreateBodyKey/CreateIDLocation/
UpdateAPIPath/UpdateMethod` all `null`. This matches the prior FixInstruction
(`slot: io.Attendees.SupportsWrite`, `operation: downgrade-capability`, `before:true, after:false`)
exactly. The real, documented Zapier-level write capability is preserved (not erased) in
`Integration.Configuration.WriteCapability.supported=true` / `scope:"Attendees only..."`, and the IO-level
`Configuration.WriteCapabilityNote` explicitly explains the downgrade rationale (no REST path/method
documented for Whova's private backend behind Zapier's abstraction). This is the correct resolution of the
tension between "a real capability exists" and "the mechanics can't be honestly filled in" — it is the
inverse of the GZ #30 defect (a real capability silently hidden with zero explanation); here the capability
is fully documented at the Integration level and the IO-level flag is conservatively downgraded with an
audit trail, not silently dropped. Re-verified the full mechanical bijection scan (§0) shows zero
violations across all 3 IOs.

### Re-confirmed unchanged, correctly still Advisory-only, not requiring further action

- **Prior Gap 3** (`Exhibitors/Booths` under-enumerated relative to dual-derivation) — unchanged;
  still correctly recorded in `Configuration.OutOfScopeObjectFamilies` (`Family:"exhibitors"`,
  `Family:"sponsors"`, each with a `Reason`). My independent live re-fetch of the Zapier page (§0) found
  zero exhibitor/sponsor/session/speaker triggers, corroborating the scope decision fresh. No fix was
  prescribed for this in the prior round (`operation:null`, advisory) and none is warranted now.
- **Prior Gap 4** (`Attendees` PK candidate `Event+Email` composite not fully representable) — unchanged;
  `Attendees` still does not carry an `Event` field (correctly — it has 8 substantive fields and was never
  zero-field, so the zero-field carve-out that justified adding `Event` to Orders/Registrants does not
  apply here; this is the prior review's own JC1 analysis, re-confirmed still valid). `Email.IsUniqueKey`
  remains `true` without composite scoping — a legitimate, non-blocking representational simplification
  given no separate surrogate ID is ever documented anywhere in the source. No regression.
- **Prior Gap 5** (`Integration.CredentialTypeID`/`ImportPath` absent) — unchanged, still absent, still
  correctly out of `ioiof-extractor`'s remit (owned by `identity-establisher`). The underlying auth-scheme
  gap remains honestly escalated in `Configuration.AuthFlowNote` rather than fabricated. Not counted against
  this review's blocking total, consistent with the prior round's scoping.

---

## 2. Judgment calls

### JC1 (carried forward, re-affirmed) — "Event is a scope parameter, not a synced column," now correctly applied non-uniformly

The producer's amendment resolved the prior round's tension exactly the way I would have recommended:
`Event` is now emitted as a field ONLY on the two objects where omitting it produced a zero-field IO
(Orders, Registrants), while `Attendees` — which has 8 substantive documented fields and was never at risk
of the zero-field condition — correctly keeps `Event` filtered out as a connection-scope parameter rather
than a record attribute. This is precisely the "general rule with a narrow, principled carve-out" I
proposed as my alternative in the prior round's JC1. I no longer have a disagreement to record here; the
amendment converged the producer's approach and mine. Recording this as a judgment call rather than a
reviewer-error-on-my-part because the prior round's JC1 already correctly identified this as a legitimate
interpretive space (not a gap) — the producer simply chose the resolution I'd have chosen too, once forced
to fix the zero-field hard-fail. Both positions were source-grounded from the start.

### JC2 (carried forward, unchanged) — Treating `Exhibitors/Booths` as fully out-of-scope vs. a stub/placeholder IO

Unchanged from the prior round. The producer's choice (record in `Configuration.OutOfScopeObjectFamilies`
only, no stub IO) matches `connector-code-conventions.md`'s discovery-source rule precisely — there is no
discoverable programmatic "door" for exhibitors/sponsors, so no IO should be attached to prose-only field
documentation. My alternative (a `Status:Disabled` stub IO) remains defensible but risks pre-baking guessed
structure the runtime discovery layer can't yet reach either. Both source-grounded; not a gap.

---

## 3. Reviewer errors

### RE1 — Initial suspicion that the amendment might have introduced a new capability-honesty violation

Given the charter's explicit focus on "GZ #30 class" defects (a bidirectional vendor silently shipped
pull-only), I entered this re-review specifically checking whether downgrading `Attendees.SupportsWrite`
to `false` might have crossed into silently erasing a real, documented write capability — the exact failure
mode the charter warns about. On inspection this did not hold: the Integration-level
`Configuration.WriteCapability.supported=true` block is untouched and fully intact, explicitly stating the
scope ("Attendees only") and the evidence source URLs. The IO-level downgrade is accompanied by an explicit,
detailed `WriteCapabilityNote` explaining exactly why the flag differs from the documented capability
(unprovable REST mechanics, not absent capability). This is the opposite of capability-dishonesty — it is a
scrupulously honest resolution of an otherwise-unresolvable tension between "the capability is real" and
"the bijection contract requires provable per-operation columns." My adversarial prior here was reasonable
to check but did not hold up.

### RE2 — Initial suspicion that fixing the zero-field gaps might have papered over the underlying "no output schema" problem

I initially worried the amendment might have quietly fabricated additional Orders/Registrants fields beyond
`Event` to make the objects look more complete than the source actually supports. On inspection, the
amendment added exactly one field to each object — the one documented, required, sourced input field
(`Event`) — and did not touch the honestly-absent output/response schema gap (which remains correctly
unaddressed, since Zapier genuinely never publishes trigger output shapes per SOURCE_STUDY §1.1, confirmed
again by my own live re-fetch). No fabrication occurred; the fix was precisely as surgical as the
FixInstruction specified.

---

## Stats block

```json
{
  "ConfirmedGapsBlocking": 0,
  "ConfirmedGapsAdvisory": 0,
  "JudgmentCalls": 2,
  "ReviewerErrors": 2,
  "IndependentSourcesFetched": 3,
  "BijectionViolationsFound": 0,
  "ModelObserved": "sonnet",
  "ReviewFile": "packages/Integration/connectors-registry/whova/INDEPENDENT_REVIEW.md",
  "FixInstructions": []
}
```
