# Meeting Vendor Bindings — Teams & Slack (next tier)

**Part of:** [Agent Bridges & Public Widget program](./README.md)
**Decision in force:** D3 (Teams + Slack after telephony)
**Goal:** Bind the Teams bridge to the real ACS calling-bot + Microsoft Graph stack, and bind Slack **only after** the huddle-media access question is resolved. Also bind the shared **calendar** and **identity-provisioner** seams that scheduled/invite joins depend on.

> Do the [telephony bindings](./telephony-vendor-bindings.md) first. They prove the native-SDK + ingress + integration-test pattern on a simpler (audio-only, well-documented) surface. Teams/Slack reuse that pattern with more moving parts.

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
- [ ] Investigate whether a supported huddle bot-media path exists (Slack Enterprise APIs, partner/Chime SDK access, or a verified workaround). Time-box to ~1–2 days.
- [ ] **Decision gate:**
  - If a path exists → Slack proceeds to M3.
  - If not → **park Slack** formally: leave the driver as-is (it stays valid + unit-tested), set its provider row `Status='Disabled'`, and record the blocker here. Do not spend further effort until access changes.
- [ ] **Acceptance:** a written go/no-go in this doc with the evidence. **Slack does NOT proceed to binding without a green here.**

### Phase M1 — Teams native SDK (the meeting proving track)
**(A) Native SDK** — implement `ITeamsMeetingSdk` over ACS application-hosted-media + Graph cloud-communications:
- [ ] Add the ACS calling-bot media SDK to `optionalDependencies` of `@memberjunction/ai-bridge-teams`; wire it behind `TeamsNativeMeetingSdk`'s `NativeModuleSpecifier`.
- [ ] `join` → Graph `POST /communications/calls` (join by meeting URL/coordinates from `Address`); return `{ BotParticipantId, CallId }`.
- [ ] `onAudioFrame`/`sendAudioFrame` → ACS per-participant inbound socket (with speaker labels for diarization) / outbound audio socket. Reuse T0's audio-format note from telephony.
- [ ] Roster (`getParticipants`/`onParticipantJoin`/`onParticipantLeave`) → call participants collection + `participantsUpdated`.
- [ ] `postChatMessage` → Graph `POST /chats/{id}/messages`; `muteParticipant` → participant:mute (needs organizer/presenter); `onHandRaise` → raised-hand signal (**tolerate absence** — partial on some tenants); `onMeetingEnded` → callEnded.

**(B) Ingress & lifecycle:**
- [ ] Graph webhook/notification endpoint in MJAPI for call state + participant updates (`POST /meetings/teams/notifications`), with Graph validation-token handshake.
- [ ] On-demand join trigger: a Remote Operation / mutation `Meeting.JoinByUrl(agentIdentityId, joinUrl)` → `AIBridgeEngine.StartBridgeSession`.

**(C) Identity + auth:**
- [ ] App registration (Azure AD) with cloud-communications + chat permissions; tenant admin consent. The agent's Teams identity comes from `MJ: AI Bridge Agent Identities` (IdentityType `AccountID`/`Email`).
- [ ] Credentials (`AppId`, `TenantId`, client secret/cert) via MJ config — never inline.

**(D) Tests:**
- [ ] **Unit (CI):** native-binding mapping tests with a mocked ACS/Graph client (assert Graph payloads, socket frame mapping, mute/permission gating). `FakeTeamsSdk` already covers the driver.
- [ ] **Integration (credential-gated):** bot joins a real test meeting, exchanges audio with a human, sees the roster, posts a chat line, leaves cleanly. `describe.skipIf(!env)`.
- [ ] **Manual runbook:** schedule a meeting, invite the agent, talk to it — mirror `../gemini-meeting-live-test-runbook.md`.

**Acceptance (M1):** the agent joins a real Teams meeting with two-way audio + roster + chat; unit tests pass in CI; integration passes locally.

### Phase M2 — Calendar + identity provisioner bindings (unblocks scheduled/invite joins)
- [ ] Implement `GraphCalendarSource.ListUpcomingInvites()` (Graph `/me/events` or `/users/{id}/calendarView` delta) and `GoogleCalendarSource.ListUpcomingInvites()` (Calendar `events.list` with `syncToken`); resolve credentials from provider `Configuration`; normalize to the existing `CalendarPollResult` shape (join URL, attendees, start/end, cursor).
- [ ] Implement `StubAgentIdentityProvisioner.Provision()` for the identity types you need: Graph Admin (mailbox/`Email`), Google Workspace Admin (`Email`), telephony carrier (`PhoneNumber`). Use the existing `ApplyProvisionResultToIdentity()` to persist.
- [ ] Wire the host-scheduled hooks (`CalendarWatcher.Sweep`, `ScheduledBridgeRunner.RunDueBridges`, orphan janitor) into MJAPI's scheduler/startup.
- [ ] **Tests:** unit tests with mocked Graph/Google clients (sync-token paging, normalization, NotBound→bound transition); integration gated on real tenant creds.
- [ ] **Acceptance:** a calendar invite to the agent's identity auto-creates a `Scheduled` bridge that fires at meeting start and the agent joins (combine with M1).

### Phase M3 — Slack (ONLY if M0 is green)
- [ ] Implement `ISlackHuddleSdk` over the verified media path; ingress for huddle start/end (Events/Socket Mode); flip the provider row to `Status='Active'`.
- [ ] Same A/B/C/D structure as Teams. Reuse the audio-format note.
- [ ] **Acceptance:** agent joins a real huddle with two-way audio; or, if M0 was no-go, this phase stays closed and the parking note stands.

### Phase M4 — Shared hardening
- [ ] Meeting Controls channel verified end-to-end (roster/hand-raise/mute surface to the agent via `IBridgeChannelHost`).
- [ ] Multi-node room-state caveat: floor/scribe/roster live in-memory per engine instance — confirm host affinity routing or shared state before multi-node production (see `../multi-party-and-meeting-bridge.md`).
- [ ] Recording governance if `Recording` is enabled (see `../livekit-recording-governance.md`).

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

- [ ] Teams: agent joins a real meeting with two-way audio, roster, and chat; unit tests in CI; integration locally; runbook written.
- [ ] Calendar + identity provisioners bound (at least Graph + Google calendar; identity types as needed); scheduled-join hooks wired; a real invite auto-joins the agent.
- [ ] Slack: bound and Active (if M0 green) OR formally parked with the documented blocker (if M0 no-go).
- [ ] Credentials via MJ config; vendor SDKs in `optionalDependencies`; no secrets in code.
- [ ] Touched packages build and unit tests pass.
