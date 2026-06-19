# GrowthZone → Gate audit: does the agentic architecture now catch what GZ shipped green?

**Question (the morning-pitch claim):** "the GZ experience taught us exactly what APIs need; we should NOT
have to change the agentic architecture or the integration framework drastically for future connectors."

**Method:** take each failure class from `connectors-registry/growthzone/PROBLEMS_LOG.md` §H.1 (the
DEFECT → OWNING STAGE → MISSING INVARIANT map the 20-hour repair produced) and verify the invariant is
now a **real, load-bearing gate** — a floor-check rule or a verification-ladder rung that *fails the build* —
not just prose. Every "wired" below cites the file:line that enforces it.

**Verdict: the invariants are BUILT, not just written.** Every GZ failure class is now a hard gate. Two
honest residuals remain (one a physics limit, one a single judgment-backed gate) — stated plainly below
because they make the claim credible, not weaker.

---

## 1. The gate map — every GZ failure class → its enforcing gate

| GZ defect (PROBLEMS_LOG #) | Class | Enforcing gate | Where | Wired? |
|---|---|---|---|---|
| §B, #24 — 17 wrong API paths shipped as live | wrong paths | RealityProbe `path` verdict (404→`wrong`) → `reality-probe-verdicts-unresolved` fails the build | `scripts/reality-probe.mjs:171`; `floor-check:664` | ✅ |
| #1/#2/#3 — `skip` vs `$skip` dead pagination (every object capped at page 1) | dead pagination | RealityProbe `pagination` verdict: declared param must *advance past page 1*; probes the `$`-alternate | `reality-probe.mjs:183-209`; `floor-check:664` | ✅ (cred-gated — see Residual 1) |
| #5/#20 — PK declared on always-null fields (13 objects) | null PK | RealityProbe `pk` verdict (`present===0 → wrong`) + extractor PK-defer ceiling | `reality-probe.mjs:212-223`; `floor-check:738` (`pk-defer-rate-too-high`) | ✅ (cred-gated for the live check) |
| #22/#23 — content-hash dupe growth 127→254 on re-sync | non-idempotent identity | **Two** catches: credential-free ladder rung `T12_IdempotencyReplay` (two-pass volatile-field replay) **and** live `second-sync-grew` | `verification-ladder:182`; `floor-check:699` | ✅✅ |
| #21/#28 — children synced before doors → ZERO_PARENTS, "self-heals" on 2nd sync | door-before-child ordering | `first-sync-incomplete` — "second-sync self-heal is a FAIL, not a footnote" | `floor-check:702` | ✅ |
| #29/#31 — custom-column capture silently no-opped (overflow column absent) | silent capture no-op | `capture-not-engaged` — fails if overflow column absent or 0 customs captured while markers observed | `floor-check:705` | ✅ |
| #30 — pull-only connector shipped for a bidirectional vendor | write under-reach | `capability-dishonest` — brand study `WriteCapability` is BINDING; read-write + 0 write-IOs + no evidenced scope decision = fail | `floor-check:679` | ✅ (judgment-backed — see Residual 2) |
| #31/#13 — stale nested `@memberjunction/integration-*` dist silently disables a framework feature | env rot | `env-preflight-missing` + `stale-nested-dist` (S0, before any stage burns) | `floor-check:688,690` | ✅ |
| #25 — credential-free tiers are CIRCULAR (fixtures from the connector's own guesses) | fixture circularity | `e2e-mock-dodge` (live is MANDATORY when a cred exists) + probe captures become the fixtures (provenance: live-capture) | `floor-check:652`; `reality-probe.mjs:174-176` | ✅ |
| Path-LMS "16 of 38 objects" (completeness, sibling lesson) | missing objects | `source-diff-closed` — every universe object must be extracted | `floor-check:395` | ✅ |
| PropFuel "3-stream freeze" / catalog baked from a sample | authorship-from-live | `discovery-hardcoded` / `catalog-in-code` / `extractor-reads-output` / `credential-used-at-build` (anti-baking firewall) | `floor-check:511,555,577,604` | ✅ |

**Placement is correct:** the RealityProbe (S7) runs at `_TEMPLATE.workflow.js:337` — *after* extract/gap-fill,
*before* CodeBuild (`:395`). Its falsified verdicts feed ONE mandatory `ProbeAmend` round (`:380`), and
**reality outranks the frozen contract** — corrections are re-sourced from the docs, never invented. The probe
**may never author metadata** (`reality-probe-authored-metadata`, `floor-check:667`): verdicts in, authorship out.

**The structural win for the pitch:** GZ's 23 vendor bugs were not transcription slips — each was a *missing
invariant in a named stage*. The repair converted each into a gate that **fails the next connector's build**.
That is why "no drastic re-architecture for future connectors" is structural, not hopeful: the failure modes
are now caught by deterministic gates, so new API variety lands as metadata + connector-local code, and the
engine/floor hold.

---

## 1b. Custom objects + custom fields — the three-tier intake (ALL BUILT)

This is the heart of an AMS connector, and it exists end-to-end. WHERE a custom object/field comes from is
decided by HOW its structure is reachable — the `MetadataSource` enum `{Declared, Discovered, Custom}` is the
unifying model. All three tiers are wired:

| Tier | Reachability | Mechanism (exists) | Materializes as | Gate |
|---|---|---|---|---|
| **Declared** | credential-free docs/spec | extractor seeds static metadata at build | `Declared` IO/IOF | `source-diff-closed` (completeness) |
| **Discovered** | auth-gated schema/describe/list endpoint, *or* streamed records | `DiscoverObjects` / `DiscoverFields`; `StreamingDiscovery` (reads records read-only, accumulates full column corpus + per-column uniqueness/null stats in one bounded pass) | `Discovered` IO/IOF → `PersistDiscoveredSchema` overlay → ApplyAll **creates the table/column** | `discovery-hardcoded` + `catalog-in-code` (must reach the source, never a frozen catalog) |
| **Custom** | no schema endpoint — only the records show it | `__mj_integration_CustomOverflow` capture → `CustomColumnPromotion.planPromotions` **mints real EntityField columns + IOF rows** (`IsCustom`) | promoted real columns | `capture-not-engaged` (fails if capture silently no-ops) |

**Custom OBJECTS** (entirely new entities): runtime `DiscoverObjects` → `Discovered` IO → `IntegrationSchemaSync.PersistDiscoveredSchema` → ApplyAll materializes. The `discovery-hardcoded` gate (`floor-check:470-502`)
*guarantees* this can happen — it fails any connector whose `DiscoverObjects` returns a baked catalog instead
of reaching the source, so the object set grows with the tenant.

**Custom FIELDS** (new fields on known objects): two intake paths — `DiscoverFields`/`StreamingDiscovery` when a
schema/describe endpoint exists (Discovered tier), and the overflow→promotion path when it doesn't (Custom tier).
**Proven live on GZ this session:** capture populated `__mj_integration_CustomOverflow` on 452/452 Contact rows,
then promotion minted **14 real columns** + IOFs + field maps (#33). The silent-no-op that made this dead
framework-wide (#31 stale nested dist) is now an `env-preflight`/`stale-nested-dist` gate (`floor-check:688/690`)
plus the `capture-not-engaged` e2e gate (`705`).

**Status, stated as fact (not as a gap):** custom-field capture+promotion I watched work end-to-end on GZ;
custom-object runtime discovery is built and gated but was not re-exercised live in this session. That is a
"proven vs built-and-gated" distinction — both mechanisms are **present and wired**, not missing.

---

## 2. Two honest residuals (state them in the pitch — they make the claim credible)

### Residual 1 — A credential gates the highest-value probe verdicts (a physics limit, honestly labeled)

The `path` and `writeSurface` verdicts work **unauthenticated** (status code / OPTIONS). But `pagination`,
`pk`, and `watermark` need a *readable page* — `reality-probe.mjs:178` bails to deeper claims only on a 2xx.
So a **credential-free build catches wrong paths + missing write surface, but labels dead-pagination (GZ #1)
and null-PK (GZ #5) `unverified`, not `wrong`.** This is honest, not silent — every un-probed claim is named
(`verdicts[].verdict==='unverified'`, surfaced in `unverifiedByName`), and the report ceiling is
`format-verified-no-creds`.

- **Why it can't be fixed credential-free:** you cannot tell a query param is *silently ignored* without
  reading two real pages. No amount of static analysis substitutes for a live read.
- **What compensates:** the credential-free `T12_IdempotencyReplay` rung catches the *identity-drift* half of
  the PK class via two-pass fixtures; and the build-connector skill's Step-0 intake **pushes hard for a
  self-serve credential** (sandbox/test-token/free-tier) precisely because one cheap credential lifts the
  whole pagination+PK+watermark tier from `unverified` to *caught*.
- **Pitch framing:** "credential-free gets you path-correctness + completeness + write-surface + idempotency-
  replay; one read-only test credential gets you the full GZ-class catch. We make getting that credential the
  first thing the pipeline tries."

### Residual 2 — The write-under-reach catch leans on the brand study's judgment, not a deterministic probe

`capability-dishonest` (`floor-check:679`) is binding and correct — **but** the RealityProbe can only check
write paths the metadata *already declares* (`reality-probe.mjs:237-239` skips absent paths). It cannot probe
a write surface that was never declared. So the catch for "should be bidirectional, shipped pull-only" rests
on `vendor-brand-researcher` reporting `WriteCapability=read-write|bidirectional`.

That study is **explicitly hardened against the GZ/PropFuel under-reach** — it characterizes the vendor's full
nature *independent of the provided context* (`vendor-brand-researcher.md:11,39`), it is adversarially
reviewed, and the gate is binding on its output. That's a reasonable place to rely on judgment. The residual:
it is the **one** GZ-class gate backed by an LLM research verdict rather than a deterministic probe — if the
study itself under-reports write capability, the gate sees a consistent (read-only ↔ no-write-IOs) story and
passes.

- **Concrete additive hardening (NOT a redesign):** extend the RealityProbe to OPTIONS-probe the vendor's
  *documented collection roots* even when no write path is declared. A `405 Allow: POST,PUT,DELETE` on a root
  the metadata models read-only turns the under-reach into a **deterministic** `writeSurface: wrong` verdict,
  removing the last judgment-only dependency. ~20 lines in `reality-probe.mjs`; purely additive.

---

## 3. Bottom line for the pitch

- **Does the agentic architecture now get everything it needs given how bad GZ was? — Substantially yes.**
  All ~11 GZ/PropFuel/Path-LMS failure classes are real, load-bearing gates that fail the build (§1, with
  line numbers). The 20-hour post-mortem's invariants are *implemented*, the probe runs before code, reality
  outranks the contract, and authorship-from-live is firewalled.
- **The two residuals are characterized, not hidden:** one is a physics limit (page-needing verdicts require a
  credential — mitigated by the idempotency-replay rung + a self-serve-credential push), one is a single
  judgment-backed gate with a clear ~20-line additive hardening. Neither requires re-architecting anything.
- **So the platform claim holds:** future connectors are metadata + connector-local code + the occasional
  opt-in hook — not framework surgery. The era of drastic change is behind us; what remains is (a) keep a
  credential in the loop wherever one is self-serve, and (b) optionally land the collection-root OPTIONS probe
  to make the write-scope catch fully deterministic.

---

*Audit artifact — generated for review, not staged for the PR. Cite line numbers against the files as of this
branch (`connectors/growthzone`).*
