# Credential acquisition & credential-free testing

Testing is the crux. The objective is one number: **maximize the assurance a connector is real and correct — with or without a live credential** — and state the residual gap honestly, never launder "format-verified" as "sync-verified".

## 0. Credential-obtainability triage (FIRST, and report it)

Before any extraction, classify and RECORD how reachable a credential is — this sets the realistic test ceiling the floor-check holds the build to.

| class | meaning | action |
|---|---|---|
| `broker-held` | a live secret already exists for us in the credential broker | PATH 1 — full live E2E |
| `self-serve-easy` | free developer signup / public sandbox / public test account, ≤ ~15 min, no human gate | obtain it → PATH 1 |
| `gated-hard` | needs sales contact / partner approval / manual provisioning | **do NOT chase** — flag early, go PATH 2 |
| `none-known` | no path discovered | PATH 2 |

The rule is asymmetric on purpose: **chase a credential only if it's genuinely easy.** A sales/partner/manual gate is nearly impossible without a human — surfacing "this connector can only reach `format-verified-no-creds`, here's why" in the first minutes is a correct, high-value output, not a failure.

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
5. **Mock server from the spec** — generate a mock from the OpenAPI/Swagger (Prism, Microcks, WireMock) and run the connector's **real** discovery + CRUD + pagination against it. Proves request shape, response parsing, paging, and error handling end-to-end with **zero** real creds — the single highest-value credential-free technique.
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

## State the gap honestly

Credential-free proofs CANNOT cover: real-data round-trip completeness, true rate-limit/backoff behavior under load, write side-effects, conflict/echo-loop resolution, and deletes/tombstoning. Whatever you couldn't reach, say so plainly in the report and set `e2eTier` to the ceiling actually achieved — `format-verified-no-creds` is a legitimate, well-evidenced result; a green that *implies* live proof it never had is not.
