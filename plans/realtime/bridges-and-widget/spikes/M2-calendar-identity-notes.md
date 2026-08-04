# M2 — Calendar + Identity Provisioner Bindings (offline implementation notes)

**Part of:** [Meeting Vendor Bindings — Teams & Slack](../meeting-vendor-bindings-teams-slack.md) §1e, §2 (Phase M2)
**Status:** OFFLINE deliverables done (pure code + unit tests). Live tenant wiring + scheduler wiring + DB remain.
**Date:** 2026-06-24
**Package:** `@memberjunction/ai-bridge-server` (`packages/AI/RealtimeBridge/Server/`)

---

## 1. What's done OFFLINE (built + unit-tested, no network/DB)

All three seam classes that were `NotBound`-throwing stubs are now **real implementations over injected,
SDK-free minimal surfaces** — same structural pattern as the completed T1/M1 Twilio/Teams bindings
(`real-twilio-bindings.ts`, `real-teams-bindings.ts`): the vendor SDK is never statically imported; a tiny
local structural interface is injected; all normalization/parsing lives in PURE exported functions; the
SDKs are declared `optionalDependencies` only.

### `calendar-source.ts`
- **`GraphCalendarSource(graph?: IGraphCalendarLike)`** — `ListUpcomingInvites(identityValue, sinceCursor?)`
  now pages a Graph delta poll over the injected `IGraphCalendarLike.listEvents(userId, cursor?)`:
  follows `@odata.nextLink` page-to-page, captures the final `@odata.deltaLink` as `NextCursor`, normalizes
  each event via the pure helpers. **No surface injected → preserves the original
  `CalendarSourceNotBoundError('Microsoft Graph')` throw.**
- **`GoogleCalendarSource(calendar?: IGoogleCalendarLike)`** — pages an incremental sync over
  `IGoogleCalendarLike.listEvents({ calendarId, syncToken | pageToken })`: `syncToken` on the first request,
  `nextPageToken` for in-poll continuation, final `nextSyncToken` → `NextCursor`. **No surface → preserves
  the `CalendarSourceNotBoundError('Google Calendar')` throw.**
- **Pure exported helpers** (directly unit-tested, reusable by the live MJAPI wiring verbatim):
  - Graph: `parseGraphDateTime`, `mapGraphResponseStatus`, `extractGraphJoinUrl` (structured
    `onlineMeeting.joinUrl` → legacy `onlineMeetingUrl` → body-embedded Teams/Meet/Zoom URL),
    `normalizeGraphEvent` (→ `NormalizedCalendarInvite`, drops events with no id / no start).
  - Google: `parseGoogleDateTime` (RFC3339 offset or all-day date), `mapGoogleResponseStatus`,
    `extractGoogleJoinUrl` (`conferenceData` video entry point → `hangoutLink`), `normalizeGoogleEvent`
    (drops `cancelled` events, drops no-id / no-start).
  - Both normalize to the **existing, unchanged `CalendarPollResult` / `NormalizedCalendarInvite` shape** —
    `ICalendarSource` interface was NOT modified, so `CalendarWatcher` is untouched.

### `identity-provisioner.ts`
- **`StubAgentIdentityProvisioner(options?: AgentIdentityProvisionerOptions)`** — `Provision(request)` routes
  by `IdentityType` over injected admin surfaces:
  - `Email` → `IGraphAdminLike.CreateMailbox` (default) **or** `IGoogleWorkspaceAdminLike.CreateMailbox`
    (when `EmailDirectory: 'GoogleWorkspace'`, or when only Workspace is bound).
  - `PhoneNumber` → `ITelephonyCarrierLike.OrderNumber` (carrier allocates when no `RequestedValue`).
  - `AccountID` → still `IdentityProvisionerNotBoundError` (no admin API in scope; stays a seam).
  - **Required surface not bound → `IdentityProvisionerNotBoundError`** with the correct target label.
    Constructed with **no options it reproduces the prior "throws for every type" stub exactly.**
- **Pure exported mapping helpers:** `buildGraphMailboxPayload` (derives `MailNickname` from local part;
  carries `TenantId`/`UsageLocation` from `Configuration`; throws without `RequestedValue`),
  `buildGoogleWorkspaceMailboxPayload` (derives `Domain` from the address; `OrgUnitPath` from config),
  `buildCarrierNumberOrderPayload` (`RequestedValue` optional; `Label` falls back to `AgentID`).
- The existing **`ApplyProvisionResultToIdentity`** was NOT changed — the results returned by `Provision`
  are shaped to feed it (and it is unit-tested here for field mapping incl. `DisplayName` fallback and
  null-`Configuration` paths). The `IAgentIdentityProvisioner` interface was NOT modified.

### `package.json`
- Added `optionalDependencies`: `@microsoft/microsoft-graph-client` (^3.0.7), `googleapis` (^144.0.0), with a
  top-level `"//optionalDependencies"` rule-8 justification string. **Declared only** — no `npm install`, no
  static imports; surfaces are injected. (The telephony carrier SDK is declared by each telephony provider
  package, not here — this package only takes the injected `ITelephonyCarrierLike`.)

### Tests (`src/__tests__/`)
- `calendar-source.test.ts` — Graph + Google: delta/sync-token + page paging, cursor capture, event→
  `CalendarPollResult` normalization incl. join-URL extraction, drop rules, and **NotBound→bound transition**.
- `identity-provisioner.test.ts` — per-type provisioning, directory routing/fallback, carrier allocation,
  pure payload mapping, `ApplyProvisionResultToIdentity` field mapping, and **NotBound throws when unbound**.
- All injected surfaces are mocked — no network, no DB. Existing Server tests stay green.

**Build + test:** `cd packages/AI/RealtimeBridge/Server && npm run build && npm run test` →
build clean; **9 test files / 155 tests pass / 0 fail / 0 skip** (was 7 files / 107 before M2; +2 files, +48 tests).

---

## 2. Host-scheduled hooks that remain to wire into MJAPI (NOT done — needs live scheduler + DB)

These are the "documented hook, not a hard timer" methods M2 unblocks but does not itself schedule. They
need to be invoked on a cadence from MJAPI's scheduler/startup (same posture as the engine's own sweep). All
live in `@memberjunction/ai-bridge-server`:

| Hook | Where it lives | What it does | Wiring still needed |
|------|----------------|--------------|---------------------|
| `CalendarWatcher.Sweep()` | `src/calendar-watcher.ts` (`class CalendarWatcher`, `public async Sweep()`) | Polls each bound identity's `ICalendarSource`, creates `Scheduled` bridges for new invites. | Host must construct a `CalendarWatcher` with a `sourceResolver` that returns a **bound** `GraphCalendarSource`/`GoogleCalendarSource` (i.e. injected with a real `IGraphCalendarLike`/`IGoogleCalendarLike` authenticated from the provider `Configuration`), persist cursors (the current `cursorStore` is in-memory), and call `Sweep()` on an interval (e.g. 30–60s). |
| `ScheduledBridgeRunner.RunDueBridges()` | `src/scheduled-bridge-runner.ts` (`class ScheduledBridgeRunner`, `public async RunDueBridges()`) | Fires `Scheduled` bridges whose start time has arrived → `AIBridgeEngine.StartBridgeSession`. | Host schedules the cadence (e.g. every 30s) at startup. No timer inside the class by design. |
| Orphan janitor | `src/ai-bridge-engine.ts` — `AIBridgeEngine.ReconcileOrphans(contextUser, provider)` (prior-boot orphans) + `SweepStaleSessions(nowMs?)` / `StartStaleSessionSweep()` (same-process idle reap; `StartStaleSessionSweep` is already self-scheduled when started). | Force-closes Connected bridges left by a dead host + reaps idle live sessions. | `ReconcileOrphans` must be called once at MJAPI startup with a `contextUser` + `IMetadataProvider`; `StartStaleSessionSweep()` opted-in once at startup (and `StopStaleSessionSweep()` on shutdown). |

The watcher/runner/engine are already `@RegisterForStartup`-style framework citizens; the missing piece is
the **MJAPI-side scheduler glue** (constructing them with bound sources + credentials and ticking them).
See [`../../realtime-session-lifecycle-and-followups.md`](../../realtime-session-lifecycle-and-followups.md)
for the lifecycle/janitor contract.

---

## 3. Blocked on real tenant credentials + live MJAPI + DB

- **Live `IGraphCalendarLike` / `IGoogleCalendarLike` binding:** needs `@microsoft/microsoft-graph-client` /
  `googleapis` installed and a Graph/Google client authenticated from the bridge provider `Configuration`
  via MJ's credential system (never inline). Graph delta should request UTC via
  `Prefer: outlook.timezone="UTC"`. Requires a real Azure AD app registration (calendar read scopes +
  admin consent) and a Google service account / OAuth client with Calendar API access.
- **Live identity provisioning (`IGraphAdminLike` / `IGoogleWorkspaceAdminLike` / `ITelephonyCarrierLike`):**
  delegated-admin operations against the customer directory — Graph `POST /users` (+ mailbox/calendar perms),
  Google Workspace `admin.users.insert`, and a telephony carrier number-order API — each gated by admin
  consent + minimal scopes, credential resolved from provider `Configuration`. The provisioning handshake is
  a per-deployment governed flow (architecture open sub-question) and is NOT exercised offline.
- **Cursor persistence + dedupe:** `CalendarWatcher`'s cursor store is in-memory; production needs a durable
  per-identity cursor store and the DB-backed `Scheduled` bridge dedupe (`bridgeExistsForEvent`) live against
  the real `MJ: AI Bridge Sessions` / agent-identity entities (DB is DOWN here, so untested end-to-end).
- **Integration/acceptance (credential-gated):** a calendar invite to the agent's identity auto-creating a
  `Scheduled` bridge that fires at meeting start and the agent joining (combine with M1) — gated on real
  tenant creds + a running MJAPI + DB; out of scope for this offline pass.

---

## 4. Deviations / decisions
- The class is still named `StubAgentIdentityProvisioner` (plan §1e names it as such, and the file's class
  identity is referenced by `index.ts` re-export). It is no longer a pure stub — with surfaces injected it
  provisions for real; with none injected it behaves exactly as the old stub. The `IAgentIdentityProvisioner`
  interface and `ApplyProvisionResultToIdentity` signature were left untouched per the "DO NOT change the
  interfaces" constraint.
- Join-URL body-scan in `extractGraphJoinUrl` recognizes Teams/Meet/Zoom URLs (the platforms the
  `JoinUrlResolver` already routes) — intentionally narrow to avoid false positives from arbitrary body links.
- Both calendar sources have a defensive page cap (`MAX_GRAPH_PAGES` / `MAX_GOOGLE_PAGES` = 1000) to guard a
  misbehaving injected surface from an unbounded paging loop.
