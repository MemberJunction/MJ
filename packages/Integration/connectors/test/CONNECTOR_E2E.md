# Connector e2e — credential-free, real-engine end-to-end harness

This is the **canonical credential-free APPLY test** for connectors. It runs the
**real** MemberJunction sync pipeline through the **real** MJAPI GraphQL API, for
**any** connector shape (REST / GraphQL / SOAP / file-feed), in two modes:

- **`mock`** (credential-free) — a local mock-vendor server replays a connector's
  recorded `fixtures.json`; the same real pipeline runs against it.
- **`live`** (credentialed) — identical pipeline + DB verification against the real
  vendor; the credential is sourced **only** via the broker mailbox, **read-only**,
  and is **never** acked / written back.

Both modes share the **same** DB verification:

| Check | What it proves |
|---|---|
| tables created + readable | `ApplyAll` ran the real SchemaBuilder; dest table + record-map exist |
| row counts + record-map 1:1 (`forward.completeness`) | "all data synced in", no drops, no dupes |
| incremental narrows (`forward.incremental.narrowed`) | watermark + content-hash do less work than a full pull |
| create / update / delete (`delta.*`, **mock only**) | a delta pass's new feed state is applied correctly to the dest table |
| idempotent re-run (`idempotent.*`) | a 2nd sync over unchanged data does **0** work / **0** row delta |

## Files (all in the test layer — no core touched)

| File | Role |
|---|---|
| `connector-e2e-harness.mjs` | IO-injected orchestration. Reuses `gql-live-harness.mjs` phases (`phaseSetup`/`phaseForward`/`phaseTeardown`) **unchanged**; adds `phaseDelta` + `phaseIdempotent` + `makeVerify`. |
| `connector-e2e-adapters.mjs` | Builds the `mock` object: boots the mock server (mock mode) / inert (live mode); derives objects + delta passes from the manifest. |
| `mock-vendor-server.mjs` | Local fixtures-replaying server. `startOrigin` (config-driven connectors), `startForwardProxy` (hardcoded-base connectors), `materializeFileFeed` (file-feed connectors). |
| `connector-e2e-harness.selftest.mjs` | No-cred / no-MJAPI / no-DB self-test of the orchestration (create/update/delete + idempotent verified against a simulated dest store). |
| `fixtures/<connector>/fixtures/fixtures.json` | The **single canonical** fixtures manifest — consumed by **both** this harness **and** the offline tiers (mj-test-runner T5/T6). A sample ships for `propfuel`. |

## The mock-fed-real-engine wiring (how the redirect stays core-safe)

The connector runs **server-side**, instantiated by MJAPI from the persisted
`CompanyIntegration`. So the redirect to the mock cannot be done from the harness
process — it happens at the MJAPI process / connection level. There are two
core-safe paths, chosen by the connector's HTTP shape (declared in its fixtures):

### A) Config-driven base URL — ORIGIN mode (the clean default)

Most connectors (Aptify, iMIS, NetForum, NetSuite, NimbleAMS, GrowthZone, PropFuel,
file-feed …) read their base URL from the persisted `Configuration`. The harness
boots a plain `http://127.0.0.1:<port>` origin and the plan seeds the connection's
`Configuration[ConfigUrlKey]` at it **at CreateConnection time** — `CreateConnectionInput`
already has an optional `Configuration` field (existing public API). **No proxy, no
TLS, no code change.** This is the fully-clean default and covers the majority of
connectors.

> fixtures: `"Transport": "http"`, `"ConfigUrlKey": "BaseURL"` (or whatever config key
> the connector reads), and **no** `UpstreamHost`.

### B) Hardcoded base URL — PROXY mode (env config on the MJAPI process)

A few connectors hardcode their base (e.g. HubSpot `https://api.hubapi.com`) and
**cannot** be redirected via config. The harness boots a forward proxy that answers
every upstream request from the fixtures, and the **MJAPI process** is launched
pointed at it:

```bash
HTTP_PROXY=http://127.0.0.1:<proxyPort> \
HTTPS_PROXY=http://127.0.0.1:<proxyPort> \
NODE_USE_ENV_PROXY=1 \
NODE_EXTRA_CA_CERTS=/abs/path/to/mock-proxy-ca.pem \
  npm run start   # (from packages/MJAPI)
```

- `NODE_USE_ENV_PROXY=1` makes Node 24's **native `fetch`** honor `HTTP(S)_PROXY`
  (it does not by default). All MJ connectors use native `fetch`.
- For HTTPS the proxy MITM-terminates the `CONNECT` tunnel, so MJAPI must trust the
  proxy's CA via `NODE_EXTRA_CA_CERTS`. Generate a throwaway CA/leaf once with
  `openssl` and pass the PEM paths to the harness via `E2E_TLS_CERT` / `E2E_TLS_KEY`
  (the harness reports `mockWiring.proxyEnvExpected` so you can confirm the wiring).

**All of this is ENV configuration of the MJAPI process — not a code change.** The
connector and engine source are untouched.

> fixtures: `"Transport": "http"` **with** `"UpstreamHost": "api.hubapi.com"`.

### File-feed connectors

`"Transport": "file"` → the harness writes the fixture content to a temp file and
the plan seeds `Configuration.storagePath` at it (origin-equivalent for files).

## The `connector-e2e` plan signature

`plans.mjs` registers two tasks (driven by env, no per-vendor hardcoding):

- **`connector-e2e`** — mock mode, `writes:false`, secrets `{ dbPassword, mjSystemKey }`
  (NO vendor secret — credential-free by construction).
- **`connector-e2e-live`** — live mode, `writes:false`, secrets `{ token, dbPassword, mjSystemKey }`
  (token only when not using a pre-seeded `HS_LIVE_CIID` reference).

Config env (non-secret), on top of the existing `HS_LIVE_*` DB/GQL coordinates:

```
E2E_CONNECTOR     registry connector dir name (e.g. propfuel)        [required]
E2E_MODE          mock (default) | live
E2E_FIXTURES_DIR  abs path to the connector's fixtures/ dir
                  [default: <test dir>/fixtures/<connector>/fixtures]
E2E_INTEGRATION   MJ Integration NAME to resolve IntegrationID by (e.g. PropFuel)
E2E_OBJECTS       comma-sep source objects [default: from fixtures Objects[]]
E2E_SCHEMA        dest schema override [default: metadata-resolved]
E2E_PLATFORM      sqlserver | postgresql [default: HS_LIVE_PLATFORM]
E2E_TLS_CERT/KEY  PEM paths for HTTPS-MITM proxy mode (hardcoded-base connectors)
HS_LIVE_GRAPHQL_URL, HS_LIVE_COMPANY_ID, HS_LIVE_CREDTYPE_ID, HS_LIVE_DB_*  (reused)
HS_LIVE_CIID      optional pre-seeded CompanyIntegrationID (reference mode)
```

`writes:false` always: the vendor side is read-only in both modes; the DB writes are
into our **own** destination schema (the point of the test), and mock mode declares
no secret at all.

## Exact run commands

### Mock mode (credential-free) — config-driven connector (e.g. PropFuel)

```bash
# 0) workbench up: MJAPI (port 4000) + a DB (SQL Server or Postgres) with MJ installed.
#    Build the engine + connectors first (no token needed):
#    (cd packages/Integration/engine && npm run build) && (cd packages/Integration/connectors && npm run build)

# 1) Run the mock e2e. Mock mode needs NO vendor key — only the DB password + (if the
#    MJAPI enforces auth) an MJ system key. The origin redirect is seeded into the
#    connection's Configuration at CreateConnection time, so NOTHING needs to be set
#    on the MJAPI process for a config-driven connector.
sudo bash -c 'set -a; . /etc/mj-livetest.env; set +a; \
  E2E_CONNECTOR=propfuel \
  E2E_INTEGRATION=PropFuel \
  E2E_MODE=mock \
  HS_LIVE_GRAPHQL_URL=http://localhost:4000/ \
  HS_LIVE_PLATFORM=sqlserver \
  HS_LIVE_COMPANY_ID=<companyId> \
  HS_LIVE_CREDTYPE_ID=<credTypeId> \
  HS_LIVE_DB_NAME=<db> HS_LIVE_DB_USER=<user> \
  exec node packages/Integration/connectors/test/run-plan.mjs connector-e2e'
```

The plan prints a scrubbed JSON result with `steps.{setup,forward,delta,idempotent,teardown}`
and a `mockWiring` summary.

### Mock mode — hardcoded-base connector (e.g. HubSpot), needs the proxy

```bash
# 1) once: generate a throwaway CA + leaf for api.hubapi.com (openssl), note the CA pem path.
# 2) launch MJAPI pointed at the proxy the harness will boot. Because the harness picks a
#    RANDOM proxy port, the simplest workbench pattern is to run the proxy on a FIXED port:
#    boot mock-vendor-server.startForwardProxy on a known port in a tiny wrapper, set
#    HTTP_PROXY/HTTPS_PROXY/NODE_USE_ENV_PROXY/NODE_EXTRA_CA_CERTS on MJAPI to it, then run
#    the harness against that same connection. (The harness reports proxyEnvExpected to verify.)
# 3) run the plan with E2E_TLS_CERT / E2E_TLS_KEY pointing at the leaf PEM.
```

> See the **no-core-blocked gaps** section below for the one rough edge here (fixed
> proxy port vs. the harness's ephemeral port) and why it is a workbench-wiring item,
> not a core change.

### Live mode (credentialed, read-only) — via the broker

```bash
# OUTSIDE the agent sandbox, you, holding the secret:
sudo bash -c 'set -a; . /etc/mj-<vendor>.env; . /etc/mj-livetest.env; set +a; \
  E2E_CONNECTOR=<connector> E2E_INTEGRATION=<IntegrationName> E2E_MODE=live \
  MJ_CRED_MAILBOX=/abs/path/to/shared/mailbox \
  exec node packages/Integration/connectors/test/credential-broker.mjs'

# the agent (inside the sandbox) drops a job:  { "jobId":"e2e-1", "task":"connector-e2e-live" }
# and reads the scrubbed result. token-free reference mode: set HS_LIVE_CIID instead of a token.
```

### Self-test (no creds, no MJAPI, no DB — runs anywhere)

```bash
node packages/Integration/connectors/test/connector-e2e-harness.selftest.mjs   # exit 0 = pass
```

## Fixtures contract (one canonical file; shared with T5/T6)

`fixtures/<connector>/fixtures/fixtures.json` — shape matches mj-test-runner
`src/tiers/fixtures.ts`:

```jsonc
{
  "Transport": "http",            // "http" | "file"
  "ConfigUrlKey": "BaseURL",      // config key the connector reads its base URL from (http origin mode)
  "UpstreamHost": "api.x.com",    // PRESENT ⇒ hardcoded-base ⇒ proxy mode; ABSENT ⇒ config-driven ⇒ origin mode
  "Configuration": { "ApiKey": "mock-dummy" },  // extra static config merged into the connection (dummy creds OK)
  "Routes": [                     // recorded responses; exact-path then longest-prefix match
    { "Path": "/contacts", "Method": "GET", "Status": 200, "Body": [ /* rows */ ] }
    // Body may be { "$file": "contacts.json" } to load a sibling file
  ],
  "FileContent": "id,name\n…",    // file transport: raw initial file content
  "Objects": [ { "Name": "Contacts", "OrderingField": "updated_at" } ],
  "DeltaPasses": [                // ≥1 pass encoding create/update/delete for the e2e + T6
    {
      "Object": "Contacts",
      "Routes": [ { "Path": "/contacts", "Body": [ /* new feed state */ ] } ],
      "FileContent": "…",         // (file transport delta)
      "ExpectedPresent": ["c1","c2","c4"],                                   // created / surviving
      "ExpectedUpdates": [ { "ExternalID": "c2", "Field": "name", "Value": "…" } ], // overwrite proven
      "ExpectedDeletes": ["c3"]                                             // removed (or tombstoned)
    }
  ]
}
```

A sample for `propfuel` ships at `fixtures/propfuel/fixtures/fixtures.json`.

The offline tiers find the same file by pointing their registry root at the fixtures
tree:

```bash
MJ_CONNECTORS_REGISTRY=packages/Integration/connectors/test/fixtures \
  mj-test-runner …   # T5/T6 now resolve fixtures/<connector>/fixtures/fixtures.json
```

## Relationship to T6 (mj-test-runner)

`t6Sqlite.ts` is a **fast offline approximation** (minimal SQLite upsert/tombstone,
no MJAPI, no DB, no engine). It is **superseded** by this real-engine `connector-e2e`
(mock mode) for any claim that "the apply works". T6's header, summary line, and
advisory all now say so explicitly, and the two consume the **same** `fixtures.json`
so there is no drift. Keep T6 as the millisecond smoke; run `connector-e2e` (mock)
for the real proof.

## What is static-verified vs. needs the workbench

**Statically verified (this change):**
- `node --check` on every `.mjs` (harness, adapters, mock server, plans, self-test).
- `connector-e2e-harness.selftest.mjs` — 6 cases, all green: setup→forward→delta→idempotent→teardown,
  real-engine create/update/delete **verified against a simulated dest store**, delta-on-absence
  regression caught, non-idempotent re-run caught, live mode skips deltas.
- mock-vendor-server functional smoke: origin boots + serves + delta-swaps; forward proxy
  serves plain absolute-form from fixtures and reports `tlsRequired`.
- `mj-test-runner`: `tsc` clean + `vitest` 27/27 green.

**Requires the workbench to prove green (NOT fabricated here):**
- A real `connector-e2e` mock run against a live MJAPI + DB (origin mode, PropFuel):
  CreateConnection → ApplyAll builds the `propfuel` tables → StartSync runs the real
  IntegrationEngine over the mock → DB verify of completeness + delta + idempotent.
- A real proxy-mode run for a hardcoded-base connector (HubSpot) with the MJAPI process
  proxied + `NODE_EXTRA_CA_CERTS` trusting the mock CA.

These need a running MJAPI + DB (the workbench) and are out of scope for a static
verification pass; the wiring is in place and the orchestration is unit-proven.

## No-core-blocked gaps (explicit; nothing silently worked around)

These cannot be closed **without** touching core (engine / schema-builder / connector
src), so per the boundary they are reported, not patched:

1. **Hardcoded-base connectors need a process-level proxy + MITM-TLS to mock.**
   HubSpot-style connectors hardcode `https://…`. The only core-safe redirect is the
   MJAPI-process env-proxy (`HTTP_PROXY`+`NODE_USE_ENV_PROXY=1`+`NODE_EXTRA_CA_CERTS`).
   A *clean* fix (read base URL from `Configuration` like the config-driven connectors)
   would be a **connector src change** — out of bounds here. Documented; origin mode is
   the clean path for the majority.

2. **Fixed-vs-ephemeral proxy port.** The harness boots its forward proxy on an
   ephemeral port, but the MJAPI process must be pointed at the proxy *before* it
   starts. Bridging that needs either (a) a workbench wrapper that boots the proxy on
   a fixed port and starts MJAPI against it (workbench config — fine), or (b) the
   harness to own MJAPI's lifecycle (not its job). No core change closes this; it is a
   workbench-wiring item, documented above.

3. **`ExpectedDeletes` asserts delete-on-absence reconciliation.** The fixtures express
   a delete as "id vanished from the feed". Whether the **engine** propagates that as a
   destination delete (full-snapshot reconciliation) vs. only honoring explicit
   tombstones is **engine behavior**. The harness asserts it and reports a red step if
   the row survives — that is a *finding about the engine*, not a harness bug, and
   fixing the engine (if it should delete-on-absence and doesn't) is a **core change**
   outside this boundary. For connectors that only emit explicit tombstones, encode the
   delete as a tombstone record in the delta `Routes` instead of relying on absence.

4. **Cross-object FK/DAG ordering in a delta pass** is exercised by `forward` (full
   pull applies parents before children via the engine's DAG) but the delta phase
   re-syncs per-object; asserting DAG order *within* a delta would need the harness to
   drive multi-object delta passes in dependency order — addable in the test layer, but
   the **engine's** DAG resolution itself is core and already covered by `forward` +
   the engine's own unit tests. Not a hole in the apply proof; noted for completeness.
