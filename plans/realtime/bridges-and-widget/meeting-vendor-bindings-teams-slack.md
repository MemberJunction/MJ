# Meeting Vendor Bindings — Teams & Slack (next tier)

**Part of:** [Agent Bridges & Public Widget program](./README.md)
**Decision in force:** D3 (Teams + Slack after telephony)
**Goal:** Bind the Teams bridge to the real ACS calling-bot + Microsoft Graph stack, and bind Slack **only after** the huddle-media access question is resolved. Also bind the shared **calendar** and **identity-provisioner** seams that scheduled/invite joins depend on.

> Do the [telephony bindings](./telephony-vendor-bindings.md) first. They prove the native-SDK + ingress + integration-test pattern on a simpler (audio-only, well-documented) surface. Teams/Slack reuse that pattern with more moving parts.

---

## Status (audited 2026-06-28)

| Phase | Status | Notes |
|---|---|---|
| M0 — Slack media spike (gate) | ✅ **Done — NO-GO** | Verdict + evidence recorded; Slack provider row set `Disabled`. |
| M1 — Teams native SDK | 🟡 **Code-complete, NOT live-testable** | Driver, `RealTeamsBindings`, `RealGraphCallsClient` (live Graph control plane), webhook ingress, `StartTeamsMeetingSession` resolver, config, startup wiring, 104 unit tests — all done. **Two blockers below.** |
| M2 — calendar + identity | 🟡 **Calendar done; identity is a seam** | Graph/Google calendar sources + concrete clients + `StartCalendarScheduler` wired at boot. **Identity provisioner not wired; Google never binds at boot; scheduled-join roster routing is a follow-on.** |
| M3 — Slack | ⛔ **Parked (correct)** | Closed per M0 NO-GO. Driver remains valid + unit-tested. |
| M4 — shared hardening | 🟡 **Partial** | Meeting Controls unit-tested. Multi-node room-state + recording governance not addressed. |

**Two blockers gate live Teams — neither is fixable this weekend:**
1. **Code gap — no live ACS media-socket adapter.** `TeamsAcsMediaRegistry` is built and wired into the router, but nothing drives `AttachTransport`/`DispatchInbound` from a real ACS application-hosted-media socket (only tests call it). The Graph control plane (join/roster/chat/mute) is real; the **audio plane has no live frame source/sink**. So even with a fully entitled tenant, no audio flows yet.
2. **External — entitled Azure tenant.** Live join needs an Azure AD app registration with Graph cloud-communications permissions (`Calls.AccessMedia.All`, `Calls.JoinGroupCall.All`) + **tenant admin consent** + an ACS resource. This is an IT/procurement task with lead time; a personal/trial account won't carry these entitlements.

**Google is further out than Teams** (separate, not in committed scope): the `GoogleMeetNativeMeetingSdk` is a real binding but needs Google's **Meet Media API early-access allowlist** + a deployment-supplied native addon + an MJAPI ingress (none built) + the boot resolver to bind Google (it's Teams-only today). Treat Google as scaffolding, not a shippable surface.

---

## 0. The one-paragraph thesis

Same as telephony: the `TeamsBridge` and `SlackBridge` drivers are **code-complete and unit-tested against fakes**, with native wrappers (`*NativeMeetingSdk` + `Bind*Native()` + auto-registration) already present. The work is implementing the real media/control SDK behind the native loader, standing up the join/invite ingress, and binding the calendar + identity provisioners that feed scheduled joins. **Slack carries a real API-availability risk** (huddle bot-media path is undocumented) and must be gated behind a verification spike.

---

## 1. Current state (verified against code)

### 1a. Base contract — `BaseRealtimeBridge`
`packages/AI/RealtimeBridge/Base/src/base-realtime-bridge.ts`

```typescript
public abstract Connect(ctx: RealtimeBridgeContext): Promise<BridgeConnectResult>;
public abstract Disconnect(reason: BridgeDisconnectReason): Promise<void>;
public abstract SendMedia(track: BridgeMediaTrackKind, frame: BridgeMediaFrame): void;
public abstract OnMedia(handler: (frame: BridgeMediaFrame) => void): void;

interface RealtimeBridgeContext { Features: IBridgeProviderFeatures; ProviderName: string; Address: string; Configuration?: Record<string,unknown>; ContextUser?: UserInfo; }
interface BridgeConnectResult { BotParticipantId: string; ExternalConnectionId: string; }

// capability-gated virtuals (throw BridgeCapabilityNotSupportedError unless feature flag + override):
GetParticipants(): Promise<BridgeParticipantInfo[]>          // SpeakerDiarization
OnParticipantChange(handler): void                          // SpeakerDiarization
StartRecording(): Promise<void>                             // Recording
// helpers: applyContext(ctx), RequireFeature(flag)
GetMeetingControlsEventSource(): IBridgeMeetingControlsEventSource | null
```

### 1b. Teams — scaffolded, native binding present
`packages/AI/RealtimeBridge/Providers/Teams/src/`

```typescript
// teams-sdk.ts — the seam
interface ITeamsMeetingSdk {
  join(args: TeamsJoinArgs): Promise<TeamsJoinResult>;
  leave(): Promise<void>;
  sendAudioFrame(pcm: ArrayBuffer): void;
  onAudioFrame(cb: (frame: TeamsAudioFrame) => void): void;
  onParticipantJoin(cb): void; onParticipantLeave(cb): void;
  onHandRaise(cb: (participantId, raised) => void): void;   // ⚠️ partial on some tenants
  getParticipants(): Promise<TeamsParticipant[]>;
  postChatMessage(text): Promise<void>;
  muteParticipant(participantId): Promise<void>;
  onMeetingEnded(cb): void;
}
```
- `teams-bridge.ts` — `@RegisterClass(BaseRealtimeBridge,'TeamsBridge')`; `Connect` requires `AudioIn`+`AudioOut`, builds Meeting Controls source when `SpeakerDiarization` on; returns `{ BotParticipantId, ExternalConnectionId: callId }`.
- `teams-native-sdk.ts` — `TeamsNativeMeetingSdk` reads `NativeModuleSpecifier` + `{ AppId, TenantId, AccessToken }`; **throws** with a clear message if no specifier configured.
- `register-native.ts` — `RegisterTeamsNativeSdk()` auto-registers `BindTeamsNative()`.
- The production-binding map is documented inline in `teams-sdk.ts` (join→Graph `/communications/calls`, sendAudioFrame→ACS application-hosted-media outbound socket, onAudioFrame→ACS per-participant inbound socket, roster→participants collection, postChatMessage→Graph `/chats/{id}/messages`, muteParticipant→participant:mute, onMeetingEnded→callEnded).
- `__tests__/teams-bridge.test.ts` — `FakeTeamsSdk` with full drive surface.
- Package `@memberjunction/ai-bridge-teams@5.42.0`; native SDK lazy-loaded (not a dep).

### 1c. Slack — scaffolded, **flagged at-risk**
`packages/AI/RealtimeBridge/Providers/Slack/src/`
- `slack-sdk.ts` `ISlackHuddleSdk` mirrors the Teams shape. The file header carries a **🚨 REAL-API RISK** block: Slack publicly documents huddle *signaling* (Web API + Events/Socket Mode) but **not** a **bot-join-with-media** path. Huddles run on **Amazon Chime**; media access may require a Chime-level integration/entitlement Slack doesn't expose. The media ops (`join` w/ media, `sendAudioFrame`, `onAudioFrame`) are designed *as if* that path exists.
- `slack-bridge.ts` ctor `sdkFactory` throws a long message making the risk explicit.
- `register-native.ts` registers `BindSlackNative()` but is commented with the same risk.
- `__tests__/slack-bridge.test.ts` — `FakeSlackHuddleSdk` (note explicitly says it stands in for the gating-unknown media path).
- Package `@memberjunction/ai-bridge-slack@5.42.0`; description carries the risk note.

### 1d. Channel plane (Meeting Controls)
`packages/AI/RealtimeBridge/Base/src/channel-plane.ts`
```typescript
interface IBridgeMeetingControlsEventSource {
  OnRosterChange(handler): void; OnSpeakingChange(handler): void; OnHandRaiseChange(handler): void;
  MuteParticipant(participantId): Promise<void>;
  readonly Capabilities: ReadonlyArray<BridgeMeetingControlsCapability>;
}
interface IBridgeChannelHost {
  StartSessionChannels(sessionId, meetingControls, sendContextNote?): Promise<void>;
  GetSessionServerTools(sessionId): BridgeChannelToolDefinition[];
  ExecuteSessionServerTool(sessionId, toolName, argsJson): Promise<BridgeChannelToolResult>;
  CloseSessionChannels(sessionId): Promise<void>;
}
```

### 1e. Calendar + identity seams (shared, for scheduled/invite joins)
`packages/AI/RealtimeBridge/Server/src/`
```typescript
// calendar-source.ts
interface ICalendarSource { ListUpcomingInvites(identityValue: string, sinceCursor?: string): Promise<CalendarPollResult>; }
class CalendarSourceNotBoundError extends Error {}
class GraphCalendarSource implements ICalendarSource { /* TODO(production): Microsoft Graph /me/events delta */ }
class GoogleCalendarSource implements ICalendarSource { /* TODO(production): Google Calendar events.list syncToken */ }

// identity-provisioner.ts
interface IAgentIdentityProvisioner { Provision(request: AgentIdentityProvisionRequest): Promise<AgentIdentityProvisionResult>; }
class IdentityProvisionerNotBoundError extends Error {}
class StubAgentIdentityProvisioner implements IAgentIdentityProvisioner { /* throws by IdentityType: telephony carrier | platform account | calendar/mailbox directory */ }
function ApplyProvisionResultToIdentity(identity, request, result): void   // already maps result → entity fields
```
Host-scheduled hooks that must be wired (not vendor-specific): `CalendarWatcher.Sweep()`, `ScheduledBridgeRunner.RunDueBridges()`, plus the orphan janitor — see [`../realtime-session-lifecycle-and-followups.md`](../realtime-session-lifecycle-and-followups.md).

---

## 2. Phased task breakdown

### Phase M0 — Slack media-access verification spike (GATE — do FIRST)
- [x] Investigate whether a supported huddle bot-media path exists (Slack Enterprise APIs, partner/Chime SDK access, or a verified workaround). Time-box to ~1–2 days.
- [x] **Decision gate:**
  - If a path exists → Slack proceeds to M3.
  - If not → **park Slack** formally: leave the driver as-is (it stays valid + unit-tested), set its provider row `Status='Disabled'`, and record the blocker here. Do not spend further effort until access changes.
- [x] **Acceptance:** a written go/no-go in this doc with the evidence. **Slack does NOT proceed to binding without a green here.**

> #### ⛔ M0 decision gate — Slack: **NO-GO** (decided 2026-06-24)
>
> Investigation confirms Slack exposes **no supported, documented path for a bot/app to join a
> huddle and access real-time audio media**. Slack's `calls.add`/Calls API only registers
> third-party call metadata for display in the Slack UI ("Slack doesn't make the call") and is
> unrelated to huddles; the sole huddle API primitive is the signaling-only `user_huddle_changed`
> event (presence/metadata, no media). Huddle media runs on a private Amazon Chime SDK backend that
> Slack deliberately controls and does not expose to third parties — no Chime passthrough, no
> Enterprise Grid media API, no partner program. Every commercial "Slack huddle recorder"
> (Recall.ai, etc.) confirms this by relying on **system-audio/screen capture in a logged-in human
> user's desktop session** — undocumented, requires a present user, cannot run headless as a bot.
> This contrasts with **Teams** (documented app-hosted media bots via `Calls.AccessMedia.All`) and
> **Twilio** (documented bidirectional Media Streams). **Slack is PARKED.** M3 stays closed; the
> `SlackBridge` driver remains valid + unit-tested but its provider row should be `Status='Disabled'`.
> Full evidence + re-evaluation triggers: [`spikes/M0-slack-media-findings.md`](./spikes/M0-slack-media-findings.md).

### Phase M1 — Teams native SDK (the meeting proving track) 🟡 code-complete, not live-testable
**(A) Native SDK** — implement `ITeamsMeetingSdk` over ACS application-hosted-media + Graph cloud-communications:
- [x] Add the ACS calling-bot media SDK to `optionalDependencies` of `@memberjunction/ai-bridge-teams`; wire it behind `TeamsNativeMeetingSdk`'s `NativeModuleSpecifier`. — _`@azure/communication-call-automation` + `@microsoft/microsoft-graph-client` declared; `RealTeamsBindings` binds via injected surfaces._
- [x] `join` → Graph `POST /communications/calls` (join by meeting URL/coordinates from `Address`); return `{ BotParticipantId, CallId }`. — _`RealGraphCallsClient` (live Graph control plane)._
- [ ] `onAudioFrame`/`sendAudioFrame` → ACS per-participant inbound socket (with speaker labels for diarization) / outbound audio socket. Reuse T0's audio-format note from telephony. — ⚠️ **BLOCKER #1 (code gap).** The binding maps audio via injected ACS surfaces and the codec/resample is proven offline, but **no live ACS application-hosted-media socket drives `TeamsAcsMediaRegistry`** (only tests call `AttachTransport`/`DispatchInbound`). No audio flows live until this adapter is built.
- [x] Roster (`getParticipants`/`onParticipantJoin`/`onParticipantLeave`) → call participants collection + `participantsUpdated`.
- [x] `postChatMessage` → Graph `POST /chats/{id}/messages`; `muteParticipant` → participant:mute (needs organizer/presenter); `onHandRaise` → raised-hand signal (**tolerate absence** — partial on some tenants); `onMeetingEnded` → callEnded.

**(B) Ingress & lifecycle:**
- [x] Graph webhook/notification endpoint in MJAPI for call state + participant updates (`POST /meetings/teams/notifications`), with Graph validation-token handshake. — _`TeamsMeetingsRouter` + `parseCallNotification`/`validateGraphNotification`._
- [x] On-demand join trigger: a Remote Operation / mutation `Meeting.JoinByUrl(agentIdentityId, joinUrl)` → `AIBridgeEngine.StartBridgeSession`. — _Shipped as the `StartTeamsMeetingSession` resolver → `TeamsMeetingsService`._

**(C) Identity + auth:**
- [ ] App registration (Azure AD) with cloud-communications + chat permissions; tenant admin consent. The agent's Teams identity comes from `MJ: AI Bridge Agent Identities` (IdentityType `AccountID`/`Email`). — ⚠️ **BLOCKER #2 (external).** Admin consent + entitled tenant + ACS resource is an IT/procurement task; not self-serve, not doable this weekend.
- [x] Credentials (`AppId`, `TenantId`, client secret/cert) via MJ config — never inline. — _`telephony.teams` config schema; no inline secrets._

**(D) Tests:**
- [x] **Unit (CI):** native-binding mapping tests with a mocked ACS/Graph client (assert Graph payloads, socket frame mapping, mute/permission gating). `FakeTeamsSdk` already covers the driver. — _104 Teams unit tests + 10 MJServer Teams tests pass._
- [ ] **Integration (credential-gated):** bot joins a real test meeting, exchanges audio with a human, sees the roster, posts a chat line, leaves cleanly. `describe.skipIf(!env)`. — ⚠️ blocked on both M1 blockers above.
- [ ] **Manual runbook:** schedule a meeting, invite the agent, talk to it — mirror `../gemini-meeting-live-test-runbook.md`. — _Not written; deferred until a tenant exists._

**Acceptance (M1):** the agent joins a real Teams meeting with two-way audio + roster + chat; unit tests pass in CI; integration passes locally. — ⚠️ **NOT MET.** Unit tests pass; live join blocked on the ACS media-socket code gap **and** an entitled tenant.

### Phase M2 — Calendar + identity provisioner bindings (unblocks scheduled/invite joins) 🟡 calendar done; identity is a seam
- [x] Implement `GraphCalendarSource.ListUpcomingInvites()` (Graph `/me/events` or `/users/{id}/calendarView` delta) and `GoogleCalendarSource.ListUpcomingInvites()` (Calendar `events.list` with `syncToken`); resolve credentials from provider `Configuration`; normalize to the existing `CalendarPollResult` shape (join URL, attendees, start/end, cursor). — _Sources + concrete `GraphCalendarClient`/`GoogleCalendarClient` (lazy-load optional SDKs), 6 unit tests. ⚠️ Google client is **never bound at boot** — the scheduler resolver is Teams/Graph-only today._
- [ ] Implement `StubAgentIdentityProvisioner.Provision()` for the identity types you need: Graph Admin (mailbox/`Email`), Google Workspace Admin (`Email`), telephony carrier (`PhoneNumber`). Use the existing `ApplyProvisionResultToIdentity()` to persist. — ⚠️ **Deliberate seam, not wired.** No concrete admin-SDK clients; never constructed/invoked in MJServer. Out of this push's scope.
- [x] Wire the host-scheduled hooks (`CalendarWatcher.Sweep`, `ScheduledBridgeRunner.RunDueBridges`, orphan janitor) into MJAPI's scheduler/startup. — _`StartCalendarScheduler` (run-once + interval, mirrors `SessionJanitor`), gated on `telephony.teams.enabled`._
- [x] **Tests:** unit tests with mocked Graph/Google clients (sync-token paging, normalization, NotBound→bound transition); integration gated on real tenant creds. — _`calendar-clients.test.ts` (6) passes; integration gated._
- [ ] **Acceptance:** a calendar invite to the agent's identity auto-creates a `Scheduled` bridge that fires at meeting start and the agent joins (combine with M1). — ⚠️ **NOT verifiable** without a Graph token + DB, and inherits M1's media-socket gap. Also: the scheduled-join factory only handles Teams, and the scheduled-join roster/call-ended notification routing is a documented follow-on (audio is wired, post-join Graph routing for scheduled joins is not).

### Phase M3 — Slack (ONLY if M0 is green) ⛔ parked — M0 NO-GO
- [ ] Implement `ISlackHuddleSdk` over the verified media path; ingress for huddle start/end (Events/Socket Mode); flip the provider row to `Status='Active'`. — ⛔ **Will not be done.** M0 found no public bot huddle-media API exists (closed Amazon Chime backend, no third-party token). No credential or account unblocks this; it is not testable until Slack ships such an API. Driver stays parked + unit-tested; provider row `Disabled`.
- [ ] Same A/B/C/D structure as Teams. Reuse the audio-format note. — ⛔ parked.
- [x] **Acceptance:** agent joins a real huddle with two-way audio; or, if M0 was no-go, this phase stays closed and the parking note stands. — _Satisfied as **formally parked** (M0 NO-GO); the no-go branch of the acceptance criterion is met._

### Phase M4 — Shared hardening 🟡 partial
- [x] Meeting Controls channel verified end-to-end (roster/hand-raise/mute surface to the agent via `IBridgeChannelHost`). — _Unit-tested in isolation; live end-to-end verification depends on M1._
- [ ] Multi-node room-state caveat: floor/scribe/roster live in-memory per engine instance — confirm host affinity routing or shared state before multi-node production (see `../multi-party-and-meeting-bridge.md`). — ⚠️ **NOT addressed.** In-memory per-engine state only; follow-on before multi-node.
- [ ] Recording governance if `Recording` is enabled (see `../livekit-recording-governance.md`). — ⚠️ **NOT addressed** in this push.

---

## 3. Risks & gotchas

- **Slack is a genuine API risk, not a TODO.** M0 is a hard gate. Do not let it consume effort before access is confirmed.
- **Teams entitlements & consent** take real calendar/admin time — start the Azure app registration early, in parallel with M1(A).
- **`onHandRaise` may never fire** on some tenants — the driver already tolerates this; don't treat its absence as a bug.
- **Audio format** — same μ-law/PCM/sample-rate care as telephony; reuse the T0 note.
- **Server-bridged media plane (program README §6 / P5):** meetings rely on the server owning the media socket via the native SDK. Confirm the realtime session's `SendInput/OnOutput` is wired to the attached meeting bridge in `AIBridgeEngine` before integration testing.
- **Don't touch the drivers.** Work lives in the native SDK, ingress, and provisioner seams.

---

## 4. Definition of done

- [ ] Teams: agent joins a real meeting with two-way audio, roster, and chat; unit tests in CI; integration locally; runbook written. — _Unit ✅. Live join blocked on the ACS media-socket code gap + an entitled tenant (M1 blockers)._
- [ ] Calendar + identity provisioners bound (at least Graph + Google calendar; identity types as needed); scheduled-join hooks wired; a real invite auto-joins the agent. — _Graph calendar + scheduler hooks ✅; Google client unbound at boot; identity provisioner is an unwired seam._
- [x] Slack: bound and Active (if M0 green) OR formally parked with the documented blocker (if M0 no-go). — _Formally parked (NO-GO), row `Disabled`, blocker documented._
- [x] Credentials via MJ config; vendor SDKs in `optionalDependencies`; no secrets in code.
- [x] Touched packages build and unit tests pass.
