# M1 — Teams Native SDK Binding Notes (offline pieces + live-wiring blockers)

**Part of:** [Meeting Vendor Bindings — Teams & Slack](../meeting-vendor-bindings-teams-slack.md) — Phase M1, deliverables (A)/(B)/(C).
**Status:** The **offline, unit-tested** pieces are done (see below). The **live** MJAPI Graph-webhook endpoint, the
`Meeting.JoinByUrl` mutation, the Azure AD app registration + admin consent, and the real ACS media socket are
blocked on real Teams/Azure credentials + a publicly reachable URL + the DB (for the mutation resolver / CodeGen).

---

## What landed offline (this push)

All in `packages/AI/RealtimeBridge/Providers/Teams/src/`, framework-free + unit-tested (no Express, no network,
no DB, no Graph/ACS install):

- **`real-teams-bindings.ts`** — `RealTeamsBindings implements ITeamsMeetingSdk` over two injected, SDK-free
  minimal surfaces:
  - `IGraphCallsLike` — the Graph cloud-communications **control plane**: `CreateCall` (join via
    `POST /communications/calls`), `DeleteCall` (hangup), `GetParticipants`, `PostChatMessage`
    (`POST /chats/{id}/messages`), `MuteParticipant` (participant:mute), `OnParticipantsUpdated`
    (`participantsUpdated`), `OnCallEnded` (`callEnded`).
  - `IAcsMediaLike` — the ACS application-hosted-media **audio plane**: `SendAudioFrame` (outbound voice),
    `OnAudioFrame` (inbound per-participant hearing, carrying the diarization speaker label), and an
    **optional** `OnHandRaise` (present-or-absent — see tolerance note below).
  - Method mapping per the documented `teams-sdk.ts` map: `join`→Graph create-call (returns
    `{ BotParticipantId, CallId }`); `sendAudioFrame`/`onAudioFrame`→ACS outbound/inbound sockets (transcoded
    via the **T0 codec** `resamplePcm16Buffer`, ACS↔model rate; per-participant labels preserved);
    `getParticipants`/`onParticipantJoin`/`onParticipantLeave`→participants collection + `participantsUpdated`
    (the binding diffs roster snapshots into per-participant join/leave); `postChatMessage`→Graph chat;
    `muteParticipant`→participant:mute; `onHandRaise`→raised-hand (**tolerated absent**); `onMeetingEnded`→callEnded.
  - **Pure exported helpers** (unit-tested directly, reused by the ingress + live router): `parseTeamsJoinUrl`
    (thread id from the `meetup-join` path + `Tid`/`Oid` from the `context` blob, never throws on a malformed
    context), `buildGraphCreateCallRequest` (the join-payload shape; prefers explicit `ThreadId`/`TenantId`),
    `mapGraphRole` / `normalizeGraphParticipant` / `normalizeGraphRoster`, and `transcodeInboundAudio` /
    `transcodeOutboundAudio` (the T0 resample wrappers).
- **`teams-ingress.ts`** — pure ingress helpers: `validateGraphNotification` (the Graph
  **validation-token handshake** + a constant-time `clientState` shared-secret check, returning a discriminated
  `validation` / `notification` / `reject` result), `parseCallNotification` (Graph call/participant notification
  → normalized `{ callId, state, participants }`; resolves the call id from `resourceData.id` or the `resource`
  path), and `buildJoinByUrlRequest(joinUrl, botDisplayName?, tenantId?)` (the on-demand-join trigger payload,
  a thin wrapper over `buildGraphCreateCallRequest`).
- **`__tests__/real-teams-bindings.test.ts`** (28 tests) + **`__tests__/teams-ingress.test.ts`** (14 tests) —
  join payload shape, meeting-URL/coordinate parsing, roster normalization, audio transcode round-trip via the
  T0 codec, mute/chat REST shape via injected mocks, **hand-raise-absence tolerance** (an ACS plane with no
  `OnHandRaise` method: join does not throw, handler never fires), validation-token handshake, `clientState`
  gate, and notification parsing. Existing `teams-bridge.test.ts` (26) + `teams-native-sdk.test.ts` (19) stay green.
- **`package.json`** — `@microsoft/microsoft-graph-client` (control plane) + `@azure/communication-call-automation`
  (ACS media plane) added to `optionalDependencies` (CLAUDE rule 8, category 2; never statically imported — both
  wired behind the injected surfaces). Justification lives in the top-level `"//optionalDependencies"` string key
  (NOT a `"//"` key inside the deps object, which breaks `npm install`). **Declared only — `npm install` not run**
  (DB/network env is down).

These are pure functions/seams the MJAPI router will call verbatim — the live router holds **no** Teams-specific
logic beyond plumbing HTTP/WS to these helpers, the injected Graph/ACS clients, and the engine.

> **Which SDK names + why both.** The documented binding splits into two planes, so two optional deps:
> `@microsoft/microsoft-graph-client` is the only first-party Node client for the Graph cloud-communications
> **control** plane (create/join call, roster, chat, mute, hangup). `@azure/communication-call-automation` is the
> Azure SDK fronting the ACS calling/**media** plane for application-hosted media (the inbound per-participant +
> outbound PCM audio sockets). A deployment may further wrap the ACS real-time-media bits as an N-API addon (the
> `TeamsNativeMeetingSdk` lazy-specifier path already covers that), but the package declares the official Azure
> packages so the dependency is visible to npm/bundlers per rule 8.

---

## Two complementary bindings (both offline-complete)

- **`TeamsNativeMeetingSdk`** (pre-existing, `teams-native-sdk.ts`) — binds via a deployment-supplied **native
  real-time-media addon/sidecar** behind `NativeModuleSpecifier` (lazy `import()`); registered as the default by
  `register-native.ts`.
- **`RealTeamsBindings`** (this push, `real-teams-bindings.ts`) — binds via **injected Graph + ACS surfaces**
  (the structural-seam style of the T1 Twilio `RealTwilioBindings`), so the live MJAPI wiring can construct it
  directly from a real `@microsoft/microsoft-graph-client` instance + an ACS media adapter without a native addon.
  Both implement the same `ITeamsMeetingSdk`; the driver and its tests are untouched.

---

## Intended MJAPI live wiring (the remaining pieces)

### `POST /meetings/teams/notifications` (Graph change-notification webhook)
```
1. If req.query.validationToken present → validateGraphNotification(token, clientState, [])
     → { Kind: 'validation' } → respond 200 text/plain echoing the exact token (the subscription handshake).
2. Else → validateGraphNotification(undefined, clientState, body.value.map(n => n.clientState))
     → { Kind: 'reject' } → 202 + drop;  { Kind: 'notification' } → proceed.
3. For each item: parseCallNotification(item) → { callId, state, participants }
     → drive the engine session lifecycle (established → ensure session; terminated → end session;
        participants → roster/diarization).
4. Respond 202 Accepted promptly (Graph requires a fast ack).
```
Mounted **publicly** (Graph can't carry an MJ JWT — the validation-token handshake + the `clientState` shared
secret are the gate). Needs a publicly reachable URL (`MJAPI_PUBLIC_URL` / ngrok in dev) Graph can POST to.

### `Meeting.JoinByUrl(agentIdentityId, joinUrl)` (on-demand join trigger)
A GraphQL mutation / Remote Operation that resolves the agent's Teams identity from
`MJ: AI Bridge Agent Identities` (IdentityType `AccountID`/`Email`), builds the Graph create-call body with
`buildJoinByUrlRequest(joinUrl, botDisplayName, tenantId)`, and calls
`AIBridgeEngine.StartBridgeSession(...)`. The bound binding's `join` issues the real
`POST /communications/calls`; the returned call id becomes the session's external connection id.

---

## Credential config block

Resolved via MJ config / credential system — **never inlined**. In `mj.config.cjs`:
```js
meetings: {
  teams: {
    appId: '…',          // the bot's Azure AD application (client) id
    tenantId: '…',       // the home tenant id
    clientSecret: '…',   // OR a certificate (clientCertificate / thumbprint) — cert preferred for prod
    // cert: { thumbprint: '…', privateKeyPem: '…' },
    notificationUrl: 'https://<MJAPI_PUBLIC_URL>/meetings/teams/notifications',  // Graph webhook target
    notificationClientState: '…',  // the shared secret echoed in each notification + checked by validateGraphNotification
    acsConnectionString: '…',      // ACS resource for application-hosted media (audio sockets)
    botDisplayName: 'AI Agent',
    modelSampleRate: 16000         // model PCM rate; RealTeamsBindings resamples ACS↔model via the T0 codec
  }
}
```
These map onto `RealTeamsBindingsOptions` (the injected `Graph`/`Media` are constructed from `appId`/`tenantId`/
`clientSecret`/`acsConnectionString`) and `TeamsNativeSdkConfig` (`AppId`/`TenantId`/`AccessToken`/
`NativeModuleSpecifier`). `notificationClientState` doubles as the `validateGraphNotification` secret.

---

## P5 confirmation — server owns the media socket (wireTransportSeam already covers it)

The agent's audio plane is owned **server-side** by the bound `ITeamsMeetingSdk` (here `RealTeamsBindings` over
the ACS application-hosted-media sockets), exactly as program README §6 / P5 requires. The bridge driver's
`SendMedia`/`OnMedia` are already wired to `session.SendInput`/`session.OnOutput` by `AIBridgeEngine`'s
`wireTransportSeam` (the same seam Twilio/Zoom use) — so once a real Graph/ACS binding is injected, no driver or
engine change is needed for two-way audio. The native SDK / `RealTeamsBindings` owns the socket; the engine seam
is unchanged.

---

## Precisely what's blocked on Azure/Teams credentials + live wiring

1. **Azure AD app registration + admin consent** — register the bot app with Graph **cloud-communications**
   application permissions (`Calls.AccessMedia.All`, `Calls.JoinGroupCall.All`, `Calls.InitiateGroupCall.All`)
   + **chat** permissions (`ChatMessage.Send` / `Chat.ReadWrite.All`), and obtain **tenant admin consent**.
   Calendar/admin time — start early, in parallel. Nothing offline can substitute for consent.
2. **Graph webhook public URL** — the `POST /meetings/teams/notifications` endpoint must be publicly reachable
   for the Graph subscription validation handshake + change notifications. Not buildable/testable offline.
3. **ACS media socket** — a real ACS resource + the application-hosted-media audio sockets wired into
   `IAcsMediaLike` (and/or the native addon behind `NativeModuleSpecifier`). The PCM rate + the T0 resample are
   confirmed offline; the live socket is credential-gated.
4. **`Meeting.JoinByUrl` mutation / Remote Operation** — needs the DB reachable (CodeGen for the resolver + the
   agent-identity lookup) and Azure credentials to place a real join. **DB is currently down.**
5. **Metadata / config schema** — if the `meetings.teams` block needs a provider `Configuration` schema row, that
   is a DB migration + CodeGen (currently blocked: DB unreachable).
6. **Integration tests** (`describe.skipIf(!process.env.TEAMS_TEST_*)`) — bot joins a real test meeting, exchanges
   audio with a human, reads the roster, posts a chat line, leaves cleanly. Never run in CI; credential-gated.

The seams + pure helpers are complete and proven offline; the above is purely the network/credential/DB-bound
activation.
