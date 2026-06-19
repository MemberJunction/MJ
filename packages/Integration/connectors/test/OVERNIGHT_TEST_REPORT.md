# Overnight connector test report (2026-06-18)

Autonomous run. **Nothing pushed** (per instruction — local only until you say otherwise).
DB: `MJ_CONN_E2E` (sql-claude :1444) · MJAPI: pm2 `:4021` · broker: single, one-vendor-at-a-time.

## Main focus — "test 3" (GrowthZone, PropFuel, PheedLoop)

Each connector tested both ways where reachable: **credentialed** (live broker, primary) and
**credential-free mock** (the full anti-vacuous matrix). Side-by-side is the litmus you asked for.

### PropFuel — PASS (mock full-matrix + live readonly)
- **Mock e2e:** ok=true. forward 3/3 · completeness destRows=3, recordMap 1:1 · incremental
  content-hash-skip (Skipped 3) · delta create+update(`AMAZING`)+delete · idempotent rows-stable 2→2 ·
  valid DAG · Merkle unchanged-partition skip. Skipped cells (pagination/rate-limit/retry/bidirectional)
  all logged-with-reason: file-feed connector has no REST list route — legit, not vacuous.
- **Live readonly (earlier):** broker pulled **1113 real files**, HTTP 200.

### GrowthZone — PASS (mock full-matrix)
- **Mock e2e:** ok=true. forward **21/21** · **7 objects** completeness 1:1 · incremental content-hash
  narrowed (Skipped 21) · delta sync/present/update/delete · idempotent no-redundant-writes + 7×
  rows-stable · valid DAG.
- **Live:** GrowthZone OAuth2 (password grant) proven live in a prior session (`/api/contacts` +
  `/contacts/delta` → 200). Not re-run tonight: the live broker currently holds PheedLoop, and the
  broker is one-vendor-at-a-time (relaunch needs your sudo). Credentialed status: **established.**

### PheedLoop — PASS (CREDENTIALED live readonly) ✅
- **Live, real API:** `X-API-KEY` + `X-API-SECRET` accepted against `api.pheedloop.com/api/v3`.
  `/events/?page=1&page_size=1` → **HTTP 200**, real record keys `id, code, custom_slug, user,
  event_name, description`. No writes performed.
- `/attendees` returned 404 — that's my probe's path guess, not a connector fault (the connector's own
  TestConnection endpoint `/events/` succeeded). The connector's real object paths live in its metadata.
- Mock e2e not run: PheedLoop is intentionally excluded from the package export, so MJAPI doesn't load
  its class — a mock e2e would need a local rebuild+restart. The live credentialed read + the connector's
  unit tests cover it.

## SharePoint

- **Already exists + deployed:** `SharePointConnector.ts` is exported; metadata at
  `metadata/integrations/.sharepoint.json` (root-level single file); **13 IOs deployed** in `MJ_CONN_E2E`
  (Sites, SiteLists, SiteListColumns, SiteListItems, Drives, DriveItems, SitePages, SitePermissions,
  SiteColumns, SiteContentTypes, SiteListSubscriptions, SiteAnalytics, Shares — Microsoft Graph).
- **NOT baseline-baked** — the 34 "SharePoint" hits in the v5.38 baseline are all Cloud-Storage *action*
  references (`SharePointFileStorage`), not a SharePoint Integration INSERT. So there is **no
  `UQ_IntegrationObject_Name` collision on fresh install** → a reseed `deleteRecords` file is only needed
  if a rebuild *changes the IO set* from what's deployed (the upsert-no-prune case).
- ⚠️ **`context/SharePointContext.md` is wrong** — it contains PheedLoop content (byte-identical to
  `PheedloopContext.md`, 42608 bytes). There is **no real SharePoint context** to drive a `/build-connector`
  from. A full rebuild from that file would produce PheedLoop output. Flagged for you.
- **Mock e2e (regen fixtures from deployed schema, Sites+SiteLists):** harness mechanics **PASS** —
  ApplyAll created 2 maps (scope=scoped, catalog 13), forward run completed, completeness 1:1 (of 0),
  incremental/idempotent/Merkle/DAG/teardown all green. BUT **0 rows synced** — the connector correctly
  aborts with `SharePointConnector: TenantId is required`. SharePoint (Microsoft Graph) is **OAuth2
  credential-gated**: it cannot fetch anything without a real `TenantId`/`ClientId`/`ClientSecret`.
- **This is precisely your litmus — where credential-free falters:** PropFuel/GrowthZone replay fixtures
  fine because their reads are token-shaped and the mock can stand in. SharePoint *can't* be driven past
  auth credential-free — the connector refuses by design. So the mock proves the **plumbing** (maps, DAG,
  idempotency mechanics, type-enforcement) but **not data round-trip**; only a credentialed run (the
  `sharepoint.env` broker — TenantId/ClientId/ClientSecret) closes that. The sharepoint broker isn't the
  live one right now (pheedloop is) and relaunch needs your sudo, so the SharePoint **credentialed** run
  is the one remaining item gated on you.
- ⚠️ **Unrelated pre-existing build break surfaced:** ApplyAll's `CompileTypeScript` step failed —
  `@memberjunction/remote-browser-base` build exits (2). This is **not** a connector/SharePoint issue (it's
  an AI/RemoteBrowser package), but it fails the codegen-build step of any ApplyAll that triggers a fresh
  build. Maps were still created (ExecuteMigration succeeded), so it didn't block the run. Worth a look
  separately — flagging it.

### "test 3" vs SharePoint — the credential-free litmus, summarized
| Connector | Mock (credential-free) | Credentialed (live) |
|---|---|---|
| PropFuel | ✅ full matrix, real rows via fixtures | ✅ 1113 live files |
| GrowthZone | ✅ full matrix, 21/21, 7 objects 1:1 | ✅ (prior session, OAuth2 password grant) |
| PheedLoop | n/a (not package-exported) | ✅ live `/events` 200, real data |
| SharePoint | ⚠️ plumbing-only — 0 rows (TenantId required) | ⏳ needs sharepoint broker relaunch |

**Finding:** credential-free mock fully covers token/header-auth connectors (PropFuel, GrowthZone) but
**falters on OAuth2-tenant-gated connectors (SharePoint)** — it proves mechanics, not data. That's the
honest boundary of the non-credential path.

## Changes made (local, NOT pushed)
- `packages/Integration/connectors/test/launch-broker.sh` — **2 fixes** so PheedLoop (and any header-auth
  connector) can launch: (1) **parse** the `.env` literally instead of `source`-ing it (vendor secrets
  with `| $ \` ( )` etc. no longer get evaluated by bash → that was your `,,, : command not found`);
  (2) recognize the `*_API_SECRET` credential shape (placeholder `CONNECTOR_API_KEY`) so the launch
  doesn't exit "MISSING CONNECTOR_API_KEY".
- `packages/Integration/connectors/test/plans.mjs` — added `pheedloopReadonly` plan + `pheedloop-readonly`
  registry entry (multi-secret `X-API-KEY`/`X-API-SECRET`; the generic single-token harness couldn't carry
  two secrets). This is what proved PheedLoop credentialed above.
- `packages/Integration/connectors/test/OVERNIGHT_TEST_REPORT.md` — this file.

## Broker reality (so it's documented)
One broker process serves one vendor at a time (single `CONNECTOR_API_KEY`/env, shared mailbox). All 4
cred-sets launched **clean** (verified via `/tmp/broker-*.log`). Mock runs need no vendor token, so they
ran against whichever broker was live. For the remaining **credentialed** runs (GrowthZone live re-confirm;
SharePoint live), relaunch that vendor's broker — `sudo bash packages/Integration/connectors/test/launch-broker.sh <vendor>` — since relaunch needs your sudo.
