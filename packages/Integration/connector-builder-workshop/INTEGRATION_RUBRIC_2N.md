# INTEGRATION_RUBRIC_2N.md — the universal 2ⁿ integration-quality rubric

A holistic, vendor-agnostic rubric for grading any MemberJunction integration. The structure is deliberately
two-layered:

- **The floor (`1.0.0`) is a GATE, not a score.** It is the 7 MUSTs — a connector either clears all 7 or it is
  not a `1.0.0` at all (it is a draft). The MUSTs are conjunctive (AND), not additive: a connector that nails 6
  and fails 1 is *not* "85% done", it is **not shippable**.
- **Above the floor, quality is a vector of `n` orthogonal factors.** Each factor is itself graded 0–3 (absent /
  declared / verified-mock / verified-live). The "order 2ⁿ" framing is literal: with `n` orthogonal factors,
  there are `2ⁿ` *capability combinations* a vendor's API can present (each factor present or absent), and the
  rubric must grade a connector against **whichever subset its vendor actually supports** — never penalize a
  connector for a capability its vendor lacks, never let it skip a capability its vendor has. The grade is the
  factor vector, projected onto the vendor's supported subset, rolled up to a tier.

This rubric is designed to drive gates: every factor maps to a concrete floor-check rule / matrix cell, and the
final section maps all 24 credential-free matrix cells onto the factors so the existing harness *is* the rubric's
measurement instrument.

---

## Layer 0 — the floor: `1.0.0` = the 7 MUSTs (conjunctive gate)

These are the user's 7 MUSTs verbatim, each restated as a binary, measurable predicate with its enforcing gate.
A connector is `1.0.0` iff **all 7 are TRUE**.

| # | MUST | Measurable predicate | Enforcing gate (built) |
|---|---|---|---|
| M1 | **Common auth** | TestConnection succeeds against the real auth scheme (token/OAuth2/Basic/SOAP-login); auth is configured once and reused | `verification-ladder` T8 (live) / RealityProbe `path` 401→`gated-exists` (cred-free); E-LIVE1 C1 |
| M2 | **Discovery of objects + columns given creds** | `DiscoverObjects`/`DiscoverFields` (or Declared metadata) enumerate the vendor's object universe with non-empty fields per object | `enumerate-catalog.mjs` (universe), `io-name-quality.mjs` (names), `zero-field-io` (fields) |
| M3 | **Create all objects** | ApplyAll materializes every selectable IO as an entity+table+maps | `hybrid-e2e` ApplyAll map-count; E-LIVE1 C3 (`ApplyAll N objs/N maps`) |
| M4 | **All records sync every table** | every `SupportsRead` IO lands rows (or is honestly `NO_ENUMERATION_ENDPOINT`); coverage = N/N, anti-vacuous | `behavioral-coverage.mjs` + `anti-vacuous.mjs`; E-LIVE1 C4 (rowcount-asserted) |
| M5 | **Viable incremental / Merkle** | a re-sync narrows (watermark) OR writes nothing (content-hash/Merkle) — never re-writes everything | `forward.incremental.narrowed` + `idempotent` cells; E-LIVE1 C5 (725→725 stable) |
| M6 | **Schema discover + update** | runtime discovery can add a new object/column and the overlay deactivates a removed one (reversible) | `discoverOverlay.reversible` cell; `IntegrationSchemaSync` overlay |
| M7 | **Bidirectional-safe** | the connector **cannot damage the external system** — writes are gated, idempotent, and the live tier is READ-ONLY by construction | `write-coverage.mjs` + read-only live contract (`connector-test-conventions.md`) |

**Why a gate, not a score:** M7 in particular is non-negotiable — a connector that could corrupt the source is
worse than no connector. The live tier is read-only *by construction* (no create/update/delete/ack ever runs
against a real vendor), so M7's "cannot damage" is proven structurally + by mocked write tiers, never by a live
mutation. M4's anti-vacuous requirement is what makes "all records sync" real: a green coverage cell over 0
actual rows (E1 novi class) is a FAIL, not a pass.

---

## Layer 1 — the `n` orthogonal quality factors (above the floor)

Twelve factors (`n = 12`). Each is **orthogonal** (a vendor can support any subset independently) and graded on
the same 0–3 scale. They are derived directly from the failure classes this run hit (ERRORS.md E-numbers cited).

| Grade | Meaning |
|---|---|
| **0 — absent** | the connector does not address this factor and the vendor needs it (defect) |
| **1 — declared** | metadata/config declares it; never exercised (the structural-green trap) |
| **2 — verified-mock** | proven against the credential-free mock / spec / probe (the `format-verified-no-creds` ceiling) |
| **3 — verified-live** | proven against the real vendor read-only (the `live-verified` ceiling) |

> A factor the vendor genuinely **lacks** is scored **N/A** (excluded from the projection), never 0. "This vendor
> has no incremental cursor" is not a connector defect — provable-only applies to capabilities too.

### F1 — Auth-model coverage
Every auth scheme the vendor offers is handled: API key / Basic / Bearer / OAuth2 (authorization_code,
client_credentials, password), SOAP login token, signed requests (HMAC). Sovereign-cloud/authority-host
override where applicable. **Failure seen:** E9 (OAuth2 client_credentials token escaping to real Azure AD),
E21 (rhythm Auth0 ignored AccessToken-bypass), E6 (sharepoint hardcoded token endpoint). **Gate:** RealityProbe
auth verdict + `capability-honesty`.

### F2 — Pagination correctness
The declared pagination param/style actually advances the result set past page 1, and termination is bounded.
**Failure seen:** GZ #1/#2/#3 (`skip` vs `$skip`, every object capped at page 1, uncapped pages); E2 (watermark
param detection). **Gate:** RealityProbe `pagination` verdict (declared param must advance), `spec-conformance`
param existence; bounded-Goldilocks termination (feedback memory).

### F3 — Incremental / watermark / content-hash
A re-sync does minimal work: a watermark narrows the fetch (timestamp cursor), OR a content-hash/Merkle skips
unchanged records, OR keyset resume handles a no-watermark stream. **Failure seen:** E2 (false watermark red),
E3/E-LIVE (idempotency on insert-only streams), SF watermark-save bug (memory). **Gate:** `forward.incremental.narrowed`
+ `idempotent.no-redundant-writes` (pass on EITHER `Processed` drop OR `Succeeded===0`).

### F4 — Identity / idempotency (no duplicate growth)
Every record has a stable identity: a real declared PK, OR a composite key, OR a stable content-hash over a
*declared-field projection* (not the volatile raw record). A replay must not grow row counts. **Failure seen:**
GZ #22/#23 (127→254 dupe growth), Leak #12 (29/103 Neon objects keyless → volatile content-hash),
`project_connector_nested_pk_dupe` (object-valued PK not descended to scalar `.id`). **Gate:** T12
two-pass volatile-field replay; `second-sync-grew` floor rule; `pk-defer-rate-too-high`.

### F5 — DAG / dependency ordering
Doors/parents sync before children; a child never relies on a 2nd-sync self-heal. **Failure seen:** GZ #21/#28
(children before doors → ZERO_PARENTS, "self-heals" on 2nd sync); E16 (SECOND_LAYER_EMPTY). **Gate:**
`dag-completeness.mjs` + `first-sync-incomplete` floor rule (2nd-sync self-heal is a FAIL).

### F6 — Access-path / nesting traversal
Objects reachable only by nesting inside a door (GraphQL connections, REST embedded children, search-then-detail)
are reached via a consumed `Configuration.AccessPath`, not a literal-path 404. **Failure seen:** Leak #11 (Neon
synced 5/119 — hubs mapped to by-id detail paths, AccessPath had no runtime consumer); E15 (cvent get-one
artifacts emitted as IOs). **Gate:** every `SupportsRead` IO must have an enumeration path (list/search/resolvable
access-path) — a bare `/{id}` hub fails; `behavioral-coverage` lands rows on >1 family.

### F7 — Rate-limit / concurrency handling
The connector honors the vendor's documented limits (token bucket, Retry-After parsing, per-layer concurrency
hint) and recovers from 429. **Failure seen:** (not a green-shipping defect this run, but) the `RateLimitPolicy`/
`ExtractRetryAfterMs` hooks are optional and mostly un-filled. **Gate:** stateful-mock once-only-429 cell;
`RateLimitPolicy` presence where the vendor documents limits.

### F8 — Schema-drift handling
Source-side AND local-side column add/remove are absorbed: new columns via Discovered/Custom intake, removed
columns deactivated (reversible) by the authoritative-discovery overlay. **Failure seen:** E-FLEET stubs imply
no drift exercise; `discoverOverlay.reversible` reds. **Gate:** `DiscoveryIsAuthoritative` overlay +
`discoverOverlay.reversible` cell.

### F9 — Scale / clustering
A large catalog (hundreds–thousands of objects) syncs within budget: O(1) map creation, bounded memory, clustered
FK ordering. **Failure seen:** E13 (SF 1695 map-creation O(N²)), E22 (MJAPI OOM on 1695-object sync), salesforce
"scale ceiling" (FINAL_SCORECARD). **Gate:** `materializability.mjs` (column-count wall E19) + a sibling
heap/row budget; map-creation perf is framework.

### F10 — Error / retry resilience
Transient failures (network, 5xx, mid-sync API restart) leave the watermark unchanged and resume cleanly;
strategy rotation mid-sync; grace handling maximizes landed data. **Failure seen:** SF watermark-save-on-empty
bug (memory); `feedback_network_retry_in_workflows`. **Gate:** PhaseB.3.8 resilience cells; partial-failure
watermark-unchanged test.

### F11 — Bounded typing (no NVARCHAR(MAX) sprawl) + materializability
Fields carry source-declared MaxLength/Precision so columns are bounded; wide facades degrade gracefully
(custom-overflow) instead of crashing CREATE TABLE. **Failure seen:** E19 (SQL Server 8060-byte row limit on
netforum/SF wide objects), E11 (netforum >1024 columns). **Gate:** `materializability.mjs` (advisory→strict);
`CapColumnsForSqlServerRowSize` (E19 RESOLVED).

### F12 — PII / credential safety + full-record pass-through
Credentials never enter agent context (broker-held); PII scrubbed from fixtures; every record carries the full
source record in `Fields` (forward-compat custom capture). **Failure seen:** (no green-ship defect; this is the
standing safety floor) — credential-broker isolation, `scrub-fixture`, `FullRecordPassThrough` T1 check.
**Gate:** `floor-check` scrub/teardown rules + T1 `FullRecordPassThrough`.

---

## Layer 2 — the 2ⁿ tier roll-up

The grade is a vector `[F1..F12]`, each ∈ {N/A, 0, 1, 2, 3}, **projected onto the vendor's supported subset**
(N/A factors dropped). Define `applicable` = the non-N/A factors. The connector's **tier** is:

| Tier | Name | Condition |
|---|---|---|
| **Draft** | not shippable | any MUST (M1–M7) FALSE |
| **1.0.0** | floor met | all 7 MUSTs TRUE; applicable factors may be grade 1 (declared) |
| **1.x — verified-mock** | structurally + behaviorally proven cred-free | all 7 MUSTs TRUE; **every applicable factor ≥ 2** (verified-mock); ceiling `format-verified-no-creds` |
| **2.x — verified-live** | proven against the real vendor read-only | all 7 MUSTs TRUE; **every applicable factor ≥ 2**, and the credential-only factors (F1 auth round-trip, F4 idempotency, F6 coverage anti-vacuous) at **grade 3** for the cells a read-only live run can reach |
| **3.x — production-hardened** | dual-dialect + scale + resilience proven | 2.x **and** F7/F9/F10 at grade 3 (rate-limit, scale, resilience proven under real volume), proven on SQL Server (Postgres when its baseline is regenerated) |

**The "2ⁿ" payoff:** because the factors are orthogonal, the rubric grades exactly the capability *combination*
the vendor presents. A pull-only file-feed vendor (PropFuel) has F7/bidirectional N/A and reaches `2.x` on a
12-cell projection; a rich bidirectional CRM (HubSpot/Salesforce) has all 12 applicable and must clear a much
larger surface for the same tier. Neither is penalized for the other's shape. The tier is a function of
*(factor grades × vendor's supported subset)*, which is the literal projection of the `2ⁿ` capability lattice
onto the connector under test.

**Worked examples from this run (FINAL_SCORECARD):**
- **orcid / fonteva / propfuel / novi / path-lms** — `1.x verified-mock` (full 24-cell green, all applicable
  factors ≥ 2). propfuel's bidirectional factor is N/A (file-feed) so its projection is smaller.
- **GrowthZone / PheedLoop / SharePoint** — `2.x verified-live` (E-LIVE1/2: 725/283/583 real rows, idempotent
  725→725, DAG + Merkle — F4/F5/F6 at grade 3 read-only).
- **salesforce** — `Draft→1.0.0` boundary: M1–M3 met, M4 blocked by the F9 scale ceiling (1695-object single-pass
  matrix > SQL 600s). It is a *documented F9=0-with-reason*, not a hidden failure.
- **cvent (pre-fix)** — **Draft**: M2 violated (66 `.json`-name garbage IOs that never resolve), caught by
  `io-name-quality`. M2 is a gate, so cvent was not a `1.0.0` until the names were fixed.

---

## Layer 3 — the 24 credential-free matrix cells → factor map

The existing harness's 24-cell matrix IS the rubric's measurement instrument. Each cell measures one factor at
grade 2 (verified-mock); the live run lifts the credential-only cells to grade 3.

| Matrix cell (from the harness / graders) | MUST / Factor | Grade it sets | ERRORS evidence |
|---|---|---|---|
| `coverage.all-objects` (N/N) | M4 / F6 | 2 (mock) → 3 (live) | E16, E17 |
| `coverage` anti-vacuous (rows>0) | M4 | 2/3 | E1 (novi 0-row trap) |
| `forward.full-sync` | M4 / F6 | 2/3 | E14, Leak #11 |
| `forward.incremental.narrowed` | M5 / F3 | 2/3 | E2, E3, E-LIVE |
| `idempotent.no-redundant-writes` | M5 / F4 | 2/3 | E3, GZ #22 |
| `idempotent.replay` (T12 two-pass volatile) | F4 | 2 | Leak #12 |
| `watermark` (server-side filter) | F3 | 2/3 | E2 |
| `content-hash` / `merkle` skip | F3 / M5 | 2/3 | openwater, E-LIVE |
| `delta-CRUD` (mocked write tiers) | M7 / F7 | 2 (mock only — never live) | read-only contract |
| `bidirectional` (conflict/echo, mocked) | M7 | 2 (mock only) | stateful-mock |
| `pagination` advances | F2 | 2/3 | GZ #1–3, E2 |
| `pagination.termination` (bounded) | F2 | 2 | bounded-Goldilocks |
| `DiscoverObjects` | M2 / F8 | 2 | nimble Declared-vs-runtime |
| `DiscoverFields` (non-zero per IO) | M2 | 2 | E-FLEET zero-field |
| `discoverOverlay.reversible` | M6 / F8 | 2 | E-FLEET |
| `dag.ordering` (doors before children) | F5 | 2/3 | GZ #21/#28, E16 |
| `first-sync.complete` (no self-heal) | F5 | 2/3 | GZ #28 |
| `second-layer` (nested children land) | F6 | 2/3 | E16 |
| `custom-column.capture` engaged | F8 | 2/3 | GZ #29/#31 |
| `rate-limit.429` once-only | F7 | 2 | stateful-mock |
| `error.partial-failure` watermark-unchanged | F10 | 2 | SF watermark bug |
| `materializability` (column budget) | F11 | 2 | E19, E11 |
| `bounded-typing` (no MAX sprawl) | F11 | 2 | E19 |
| `full-record-passthrough` (Fields complete) | F12 | 2 | T1 FullRecordPassThrough |

**Reading the map:** a `topOk=true` (all 24 green) = every applicable factor at grade 2 = **`1.x verified-mock`**.
The cells marked "mock only — never live" (`delta-CRUD`, `bidirectional`, `429`) are the write/conflict factors
that the read-only live contract *deliberately* never exercises against a real vendor — they top out at grade 2
by construction (M7 "cannot damage" is proven by the mock + the structural read-only guarantee, not a live
write). This is why `2.x verified-live` requires grade 3 only on the *read-side* credential-only cells (auth,
coverage anti-vacuous, idempotency), not the write cells.

**The skip-discipline rule this rubric demands (ties to ARC_HOLES HOLE-4):** a red cell on a factor the vendor
genuinely lacks (N/A) must be a typed `skip` with an enumerated reason, NOT a red that drags `topOk` to false.
The rubric's projection-onto-supported-subset only works if "this vendor can't do F-x" is a machine fact, not a
human waiver. That is the mechanical replacement for "residuals are harness-only."
