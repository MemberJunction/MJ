# Credential acquisition & credential-free testing

Testing is the crux. The objective is one number: **maximize the assurance a connector is real and correct — with or without a live credential** — and state the residual gap honestly, never launder "format-verified" as "sync-verified".

> **⏱️ CREDENTIAL TIMING — AUTHORSHIP NEVER, VERDICTS REQUIRED (v2 — replaces the v1 "test-time only" rule).**
> The v1 rule existed to stop sample-discovery being baked into static catalogs (the PropFuel 3-stream
> freeze). That half stays absolute: **no build phase may AUTHOR metadata — catalogs, objects, fields,
> paths — from live data.** But v1 over-rotated: by also forbidding *checking* docs-derived claims against
> the live system before code was built on them, it shipped GrowthZone with 17 wrong API paths, dead
> pagination (`skip` vs `$skip` — every object silently capped at one page), PKs declared on always-null
> fields, and a pull-only connector for a bidirectional vendor — **all green** (GZ PROBLEMS_LOG #1–#5, §B,
> #30; full audit in `connector-builder-workshop/ARCHITECTURE_REFACTOR.md`). The v2 rule splits authorship
> from verification:
>
> - **AUTHORSHIP from live data: forbidden, always** (unchanged). The extractor seeds Declared metadata
>   from credential-free docs only; discovery code expresses the MECHANISM, never a baked answer.
> - **VERDICTS from live data: REQUIRED, via the Reality Probe stage (S7) — after extraction, BEFORE
>   code-build.** The probe is read-only and emits ONLY pass/fail verdicts on already-declared claims:
>   per-object path status + records-present, pagination-param-advances (declared form vs alternates),
>   per-declared-PK populated/null over the probe page, watermark param accepted/rejected, write-surface
>   existence (OPTIONS/405/401 evidence — **never a write call**), observed rate-limit headers. Verdicts
>   feed ONE mandatory amendment round (corrections come from the docs, confirmed by re-probe).
>   Floor-check rejects any metadata DELTA that *originates* from the probe — verdicts in, authorship out.
> - **No credential → the probe DEGRADES, never disappears:** unauthenticated status-code probing of every
>   declared door (401/403 = path real + auth-gated; 404 = path wrong) plus param probing where the
>   endpoint tolerates it, and the report's ceiling is `format-verified-no-creds` with every un-probed
>   claim enumerated BY NAME — never a blanket green.
>
> Credential *custody* is unchanged: broker-held, the agent never sees credential bytes; the probe runs
> through the broker / credential-isolated runner exactly like T8.

> **🥇 Credentialed testing is strictly the best, and self-obtainable credentials must be surfaced EARLY.**
> A live round-trip against real (or vendor-sandbox) data proves things no credential-free technique can. So
> the **very first** thing the discovery pass does is answer "can *we* get data out of this API ourselves,
> right now, without a human?" — and if the answer is yes (public sandbox, free dev tier, vendor test token),
> **report it in the first minutes and pursue PATH 1**, rather than settling into credential-free proofs. The
> cost of missing an easy self-serve credential is a whole tier of lost assurance; the cost of a 10-minute
> signup is trivial. Bias toward getting real data when it's genuinely self-serve.
>
> **🚨 STANDING RULE (user-directed, 2026-06-14, explicitly allowed) — ALWAYS substitute a SELF-SERVE live DB for the user's credentials; NEVER use the user's/customer's production credential when a self-serve path exists, for READ or WRITE.** The single best proof a connector works is the full **hybrid-e2e** round-trip against a live DB — and that is almost always obtainable WITHOUT the user's creds. The agent must PROACTIVELY find and pursue the best legal self-serve live-DB path for THIS vendor, in priority order:
> 1. **Vendor free Developer Edition / dev org** — the gold standard: a REAL instance with REAL sample data + the full API, self-serve in minutes, no card, no human gate, and the org is *yours*, never the customer's. **Salesforce → `developer.salesforce.com/signup`**; many SaaS vendors (HubSpot, Zendesk, etc.) have an equivalent free dev org. **Custom objects/fields are creatable in your own dev org**, so the custom-discovery path is testable against real custom data for free.
> 2. **Vendor sandbox / test-mode with published test credentials** (`pk_test_…` / `sk_test_…`, Twilio test creds, PayPal/Square/Plaid sandboxes).
> 3. **Free developer tier / instant API key** signup. 4. **Public demo / playground / sandbox** instances.
>
> **WRITE-BACK testing IS ALLOWED and ENCOURAGED on a self-serve org/sandbox that is YOURS** (a free Dev Edition, a test-mode account, disposable test data): run the FULL bidirectional / write-back / conflict / delete / idempotency hybrid-e2e, tagging every created record (`mj_test_run=<runID>`) and deleting exactly those in a `finally`. **The READ-ONLY contract (see `connector-test-conventions.md`) exists ONLY to protect a CUSTOMER's real records reached via a CUSTOMER credential — it does NOT restrict writes against your own disposable self-serve org.** So: prefer a self-serve org → do the complete read+write hybrid-e2e there → never touch the user's credential. Only when NO self-serve path exists at all does the read-only-against-user-credential or fully-credential-free fallback apply. Surface the self-serve plan to the user EARLY ("this vendor has a free Dev Edition — I'll prove read AND write against real data there, never your org").

## 0. Credential-obtainability triage (FIRST, and report it loudly)

Before any extraction, classify and RECORD how reachable a credential is — this sets the realistic test ceiling the floor-check holds the build to. **Emit this classification as an early artifact** so the operator sees the achievable tier up front.

| class | meaning | action |
|---|---|---|
| `broker-held` | a live secret already exists for us in the credential broker | PATH 1 — full live E2E |
| `self-serve-easy` | free dev signup / public sandbox / **vendor-published test token** (`pk_test_…`, Twilio test creds) / public test account — ≤ ~15 min, no human gate | **obtain it → PATH 1** (preferred over any credential-free path) |
| `gated-hard` | needs sales contact / partner approval / manual provisioning | **do NOT chase** — flag early, go PATH 2 |
| `none-known` | no path discovered | PATH 2 |

The rule is asymmetric on purpose: **chase a credential whenever it's genuinely easy, but never when it's a human gate.** A sales/partner/manual gate is nearly impossible without a human — surfacing "this connector can only reach `format-verified-no-creds`, here's why" in the first minutes is a correct, high-value output, not a failure. The two early-report cases are symmetric in value: "I can self-serve a real credential, pursuing live E2E" and "no self-serve path exists, here's the credential-free ceiling" — say whichever is true, immediately.

### 0a. Self-serve credential sources to check (in priority order)
1. **Vendor sandbox / test mode with published test tokens** — the gold standard for paid enterprise APIs. Many vendors ship public test credentials *designed* to simulate production workflows free of charge: **Stripe** (`pk_test_…` / `sk_test_…`), **Twilio** (test Account SID/Auth Token), PayPal/Square/Plaid sandboxes, etc. These are real API surfaces with real request/response semantics — treat a test-mode credential as PATH 1.
2. **Free developer tier / instant signup** — a dev account that issues a real key in minutes (no card, no sales call). If the connector's vendor has one, take it.
3. **Public demo / playground instance** — some vendors expose an unauthenticated or shared-demo API; opportunistic real reads count as live evidence.
4. **Public zero-auth utility APIs** — not the target vendor, but invaluable for smoke-proving the connector's **generic HTTP machinery** (auth header injection, pagination loop, retry/backoff, JSON parsing, error mapping) against a real network before you ever have vendor creds: **JSONPlaceholder** (`https://jsonplaceholder.typicode.com` — fake CRUD), **reqres.in** (login/token payloads), **HTTPBin** (`https://httpbin.org` — echoes back your exact headers/verbs/body, perfect for asserting the connector sends the right auth header + content-type + query params).
5. **In-doc API consoles / OAuth playgrounds** — many vendors embed a live "Try it out" console (Swagger UI / Redoc / API explorer) or an OAuth playground (Google OAuth Playground, vendor-hosted token minters) that issues a short-lived real token from the docs page itself. If one exists and is self-serve, it's a legitimate live-token path.
6. **Operator/broker already holds one** — before concluding `none-known`, ask whether the operator or credential broker already has a test/sandbox credential for this vendor. The cheapest real credential is one that already exists; just request it via the broker (never have it pasted into context).
7. **Self-serve dev signup (incl. temp-email-assisted)** — a free developer account that issues a real key in minutes. A disposable inbox (Mailinator / temp-mail) for the *signup verification* of a legitimate free dev program is fine; signing up under genuinely false pretenses where the ToS forbids it is not (see legal boundary).

### 0b. 🚦 Legal boundary — non-negotiable
Every acquisition path above is legal **only** when it stays inside these lines. When in doubt, stop and report rather than proceed.
- **Never use production or `.env` secrets, or ANY credential not explicitly provisioned for *testing*.** A prod key may carry real client data — using it for connector testing is forbidden regardless of how convenient (standing rule). Only broker-injected references and self-minted *test/sandbox* credentials are in-bounds.
- **Never use a credential that isn't yours to use** — no keys found in public GitHub/git history, gists, pastebins, leaked-secret feeds, or another tenant's account. Finding a key in the wild is not obtaining a credential; it's a security incident to report, not a test input.
- **Never bypass, brute-force, or evade authentication / rate limits / paywalls**, and never access data you aren't authorized to. Endpoint probing (§ PATH 2) means observing public status codes and headers on *your own* unauthenticated requests — not circumventing a gate.
- **Respect each vendor's Terms of Service, `robots`/automation policies, and rate limits.** Shared demo/sandbox instances are read-only and gentle by default; don't mutate shared state or hammer a free tier.
- **Disposable-email + free-tier signups are legitimate** for vendor *developer programs that invite them*; do not impersonate a real person or organization, and do not create accounts where the ToS prohibits automated/throwaway signups.

The throughline: *self-mint or request a credential made for testing, observe only what's public on your own requests, and honor the vendor's rules.* That covers essentially every legal avenue — and excludes every illegal one.

## PATH 1 — live credential (broker): full §1→§7 E2E, reference-mode, token-free

The broker holds the secret and injects it at the DB layer; the agent passes only an **opaque credential reference** to `mcp-mj-test-runner`, which dereferences it in isolation — **credential bytes never enter the conversation.** Run the full ordered ladder (setup → pull/full → incremental/content-hash → scale/rate → push/CRUD → bidirectional/conflict → teardown). Live E2E is the **only** thing that proves real-data round-trip completeness, true rate-limit behavior, and write side-effects.

## PATH 2 — credential-free assurance (no live data, still high-confidence)

No credential is **not** "untestable." These techniques carry most of the quality risk. Run as many as the source supports, capture structured evidence, and label the ceiling `format-verified-no-creds`.

**Endpoint reality (the host + paths + auth scheme are real):**
1. **curl/HTTP status probing** — hit every documented endpoint. A `401`/`403` PROVES the endpoint exists and auth-gates correctly; a `404` proves the path/host is wrong; a `405` reveals the wrong verb. Capture per endpoint `{ method, url, status, key headers }` — a full table of 401/403s across the surface is strong proof the paths + auth scheme the connector targets are real.
2. **Auth / rate-limit header introspection** — even a `401` usually returns `WWW-Authenticate`, `X-RateLimit-*`, `Retry-After`, `X-Request-Id`. These prove the auth scheme and the rate-limit policy the connector must honor (feeds `RateLimitPolicy` / `ExtractRetryAfterMs`).
3. **OPTIONS / HEAD probing + CORS** — `Allow:` / `Access-Control-Allow-Methods` reveal the real verbs per resource.
4. **TLS / DNS reachability** — host resolves, TLS handshake succeeds, base URL + version path are live.

**Contract / shape (the requests + responses match the documented schema):**
5. **Mock server from the spec** — generate a mock from the OpenAPI/Swagger and run the connector's **real** discovery + CRUD + pagination against it. Proves request shape, response parsing, paging, and error handling end-to-end with **zero** real creds — the single highest-value credential-free technique. Tools, roughly by setup cost: **Prism** (`@stoplight/prism` — `prism mock spec.yaml`, instant OpenAPI mock), **Microcks** (spec-driven, supports examples + assertions), **WireMock** (record/replay + stateful scenarios), **Mockoon** (local desktop/CLI mock, no cloud/login), **Beeceptor** (browser-instant mock endpoints, can simulate OAuth2 / S3 flows without provider creds). Prefer a spec-driven mock (Prism/Microcks) so the mock's contract is the vendor's own schema, not your guess.
6. **OpenAPI / spec contract validation** — validate every connector request (path, method, query/body params, content-type) against the spec; validate the connector's response models against the spec's response schemas.
7. **Recorded fixtures / cassettes (VCR-style)** — replay any recorded request/response pairs (doc examples, a one-time capture, a partner's HAR) through the connector's parser to prove mapping fidelity.
8. **Documented example-response validation** — most API docs ship example payloads; assert the connector's field mapping + type coercion against them.
9. **SDK / published-types diff** — if the vendor ships an SDK or types (TS/OpenAPI-gen), diff the connector's IO/IOF set + field types against them.
10. **Postman / Insomnia collection replay** — many vendors publish a collection; use it as both the endpoint source-of-truth and a fixture set.

**Completeness / correctness (nothing missing, nothing invented):**
11. **Bijective documentation proof** — every documented object / field / endpoint ↔ an emitted IO / IOF and vice-versa: no orphan emissions, no missing coverage (the `compute-source-diff` / `floor-check` completeness, applied to the spec).
12. **Differential schema test** — the connector's discovered schema (types, required, enums, lengths, PK/FK) must match the spec/SDK; flag every divergence.
13. **Pagination / filter / sort param existence** — confirm the connector's paging strategy + incremental-watermark field are real params in the spec (not invented).
14. **Static / compile proofs** — the connector compiles; discovery + per-operation CRUD are implemented; field maps reference emitted columns; **no stringly-typed catch-all** (the bounded-typing rule); no fabricated constraints (provenance rule).
15. **Adversarial review** — a different-model `independent-reviewer` rebuilds the expected inventory from the docs FIRST, then checks the connector against it (catches "plausible but wrong").

**Opportunistic live (no auth needed):**
16. **Public sandbox / demo / playground instances** — some vendors expose unauthenticated demo APIs; if one exists, run an opportunistic real round-trip (read-only) against it.
17. **Transport-machinery smoke against echo/dummy APIs** — point the connector's HTTP layer at a public zero-auth utility to prove the *generic plumbing* over a real network, independent of the vendor: **HTTPBin** (`https://httpbin.org/anything` echoes your exact method, headers, query, and body back — assert the connector injected the right `Authorization` header, `Content-Type`, pagination cursor, and idempotency key), **JSONPlaceholder** (real CRUD verbs + JSON parsing + non-2xx handling), **reqres.in** (token/login payload shape). This catches auth-header and retry/backoff bugs that a static mock with no real socket can miss.

## State the gap honestly

Credential-free proofs CANNOT cover: real-data round-trip completeness, true rate-limit/backoff behavior under load, write side-effects, conflict/echo-loop resolution, and deletes/tombstoning. Whatever you couldn't reach, say so plainly in the report and set `e2eTier` to the ceiling actually achieved — `format-verified-no-creds` is a legitimate, well-evidenced result; a green that *implies* live proof it never had is not.
