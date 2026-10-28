# @memberjunction/telephony-adapters

## 6.2.0-edge.6

### Patch Changes

- f7a43b2: Calendars in Communication (#4789, A18). Communication providers gain CreateEvent, UpdateEvent, CancelEvent, GetEvent and SyncEvents, each taking a required CalendarTarget so an event never lands in a default mailbox; a provider without a calendar refuses each by name. The MS Graph provider implements them (calendarView delta sync, organizer cancel or attendee delete) and accepts a caller-supplied `accessToken`; the Gmail provider implements them on Google Calendar with the same OAuth client (the refresh token needs a calendar scope). The Communication engine adds `CalendarEventLinks` to create, update and cancel events linked to any record through `MJ: Calendar Event Links`, and to sync a calendar from the cursor in `MJ: Calendar Sync States`, handing each change to a `BaseCalendarEventLinkHandler` registered for the record's entity; stored credentials resolve through CredentialEngine. The realtime bridge's `GraphCalendarSource` and `GoogleCalendarSource` now read through the providers' SyncEvents; `GraphCalendarClient`, `GoogleCalendarClient`, the `IGraphCalendarLike`/`IGoogleCalendarLike` surfaces and the raw Graph/Google normalizers are removed, along with the bridge's optional Graph and googleapis dependencies. The Teams calendar scheduler polls through the MS Graph provider with the bot token. GetEvents and every existing operation behave as before.
- Updated dependencies [622f166]
- Updated dependencies [68bb7e4]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [c4645bc]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [f7a43b2]
- Updated dependencies [cc41d33]
- Updated dependencies [281724a]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [142d524]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [96c44bf]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [8ec184d]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [c4645bc]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai-agents@6.2.0-edge.6
  - @memberjunction/ai@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/generic-database-provider@6.2.0-edge.6
  - @memberjunction/livekit-room-server@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/communication-ms-graph@6.2.0-edge.6
  - @memberjunction/ai-bridge-server@6.2.0-edge.6
  - @memberjunction/ai-engine-base@6.2.0-edge.6
  - @memberjunction/ai-bridge-base@6.2.0-edge.6
  - @memberjunction/ai-bridge-ringcentral@6.2.0-edge.6
  - @memberjunction/ai-bridge-teams@6.2.0-edge.6
  - @memberjunction/ai-bridge-twilio@6.2.0-edge.6
  - @memberjunction/ai-bridge-vonage@6.2.0-edge.6
  - @memberjunction/server-extensions-core@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- d26183d: Fix CodeQL insecure-randomness and filesystem-race findings in runtime code (#5574).
  - **Open App installs** download migration and teardown SQL into a fresh private temp directory (`mkdtempSync`) instead of a predictable `mj-app-<name>-<timestamp>` path that reused any directory already there.
  - **Password generation** picks and shuffles characters with `crypto.randomInt`, removing the modulo bias of `randomBytes % length`.
  - **Number pool `Random` selection** and the **Pi harness session id** use `node:crypto` instead of `Math.random`.
  - **SQL log reads** drop the existence check before reading; a missing file is still reported through the existing `ENOENT` handling.

- Updated dependencies [3b0e8db]
- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [fd780a9]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [db50c6b]
- Updated dependencies [afc1e0e]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [a9344ad]
- Updated dependencies [d29b5c2]
- Updated dependencies [17c36d1]
- Updated dependencies [0ab85d7]
- Updated dependencies [9d1eb6a]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [542795b]
- Updated dependencies [db39145]
- Updated dependencies [a0db1fb]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [fcc3f03]
- Updated dependencies [230cdad]
- Updated dependencies [7e72c86]
- Updated dependencies [0cc6b08]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [2a7a098]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [1d29837]
- Updated dependencies [006a5e7]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [2ca8690]
- Updated dependencies [c7d1170]
- Updated dependencies [79d4f27]
- Updated dependencies [5f707d1]
- Updated dependencies [e1f2583]
- Updated dependencies [dc38250]
  - @memberjunction/generic-database-provider@6.2.0-edge.5
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-agents@6.2.0-edge.5
  - @memberjunction/ai@6.2.0-edge.5
  - @memberjunction/ai-engine-base@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/server-extensions-core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/livekit-room-server@6.2.0-edge.5
  - @memberjunction/ai-bridge-base@6.2.0-edge.5
  - @memberjunction/ai-bridge-ringcentral@6.2.0-edge.5
  - @memberjunction/ai-bridge-teams@6.2.0-edge.5
  - @memberjunction/ai-bridge-twilio@6.2.0-edge.5
  - @memberjunction/ai-bridge-vonage@6.2.0-edge.5
  - @memberjunction/ai-bridge-server@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- aaf74ca: A realtime agent start that fails now records the failure on the agent's co-agent run, and a LiveKit room start that can't give the user a token starts nothing.
  - The co-agent run of an agent whose start failed read `Completed`: closing its model session finalized the run as a success, whatever the reason for the close. The LiveKit room coordinator and the phone-call starter now finalize the run as `Failed` first, with the start's error as the `ErrorMessage` of the run, its prompt run and its step; the close then finalizes nothing more.
  - `BridgeRealtimeRuntime.Finalize` and `RealtimeClientSessionService.FinalizeCoAgentRun` take an optional error message for a failed finalize.
  - `LiveKitAgentRoomCoordinator.SetFailedStartRecorder` binds how a failed start is recorded; MJServer binds it to the session runtime's `Finalize(false, error)`. Unbound, a failed start's run reads `Completed`, as before.
  - `StartLiveKitAgentRoomSession` mints the user's client token before it starts the agent. Minted after the agent joined, a token that couldn't be minted failed the start with the agent left in the room, its agent session `Active`, and no bridge id for the UI to stop it by.

- 8704df6: A phone call never asks the model for an avatar. A caller hears the agent and sees no video, but a voiced agent whose persona has a face still asked for its avatar on a phone call: on a carrier call (Twilio, Vonage, RingCentral) the Gemini driver refused it as `bridged` and logged that on every call, and on a call that reached a LiveKit room through SIP the room coordinator asked for room delivery whenever its host could publish, so the model rendered avatar video, billed per minute, that the caller never saw. The session prep now decides before the driver: a session marked as a phone call (`PrepareClientSessionInput.PhoneCall`, set from `params.data.realtimePhoneCall`, which `CreateBridgeRealtimeSession` sets from `BridgeRealtimeSessionContext.PhoneCall`) carries no avatar request, keeps the avatar persona's voice so the agent sounds the same as in a call that shows its face, and the default model walk prefers no avatar model for it. The telephony call starter marks every carrier call as a phone call; the room call starter passes its channel to the coordinator (`AgentRoomHostOptions.Channel`), which on `'phone'` skips the native module's avatar probe, passes no room delivery, and marks the session (`RealtimeSessionStartContext.PhoneCall`). Core gains the reason `'phone'` (`RealtimeAvatarUnavailableReason`, read by `ParseRealtimeAvatarStatus` and the bot attribute reader); a phone call's bridged session reports `{ Requested: true, Granted: false, Reason: 'phone' }` as its `AvatarStatus`, so a SIP call's bot joins with `mj.agentAvatar` `audio-only:phone`, and the notice reads "Audio only for {Agent}: the avatar isn't shown on phone calls" (`ng-realtime-media` and the mobile app's copy). The `bridged` reason now covers only a server-side session whose host can't publish video into a room. Integration check RD13 also checks that a phone call in a room that could publish the avatar asks for none and keeps the persona's voice.
- aee2d53: Full-duplex realtime models improvements, speech-tuned Meet room options, audio telemetry, and disconnect reason handling:
  - **FullDuplex metadata**: Added `FullDuplex?: boolean` to Realtime section of `IAIModelConfiguration` with cascaded metadata resolution and helper `ResolveIsModelFullDuplex`. Seeded metadata for full-duplex models (Gemini 3.8 Live family, GPT-Live 1).
  - **Coordinator turn-taking tools & ResolveHostTools seam**: Withhold turn-taking tools (`turnTakingTools = []`) when model is full-duplex. Added `ResolveHostTools` callback seam to `PrepareClientSessionInput` allowing dynamic resolution of host tools based on resolved model/vendor/driver before session startup.
  - **Energy gate bypass**: Bypassed `FullDuplexTurnGate` and `HumanSpeechDetector` for full-duplex models by default unless `MJ_REALTIME_MODERATOR_MODE=on`.
  - **Speech-tuned Meet RoomOptions**: Configured speech defaults (`dtx: false`, `red: true`, `audioPreset: AudioPresets.speech`, `audioCaptureDefaults`) overridable via `RoomOptions` input.
  - **Audio telemetry**: Added inbound inter-frame gap histogram per participant, outbound `queuedDuration` and underrun tracking, event-loop delay p99 (`perf_hooks.monitorEventLoopDelay`) with 30s rolling window, and speech-to-audio latency logging.
  - **LiveKit disconnect reason**: Mapped `null`/`undefined` disconnect reason from `livekit-client` to `'connection-lost'` rather than `'client-initiated'`.
  - **Interaction lifecycle**: Added optional `Status` override on `CloseInteractionParams`.

- 5fcc7b0: A Teams meeting agent's `MJ: AI Agent Sessions` row now closes when the bot's bridge ends (#5427). Before, the session a Teams join (`StartTeamsMeetingSession`) created stayed `Active` after the bot left the meeting, until the janitor's staleness sweep closed it, 15 minutes or more later, as `Janitor`.
  - `TeamsMeetingsService` passes the bridge engine an end-of-session hook, as phone and room calls do. Once the bridge has ended, whatever ended it (the meeting ended, everyone left, the engine reaped the bridge, the model session was lost), the hook closes the session through `CloseAgentSessionRow` with the bridge's reason: `Explicit` for a stop or `HostEnded`, otherwise the bridge's own (`Error`, `Janitor`, `Shutdown`). A session already closed keeps its reason.
  - A scheduled join's session, which the calendar watcher creates and passes in, is left open as before.

- ed8a189: feat(telephony): add ILiveKitSipInboundHandler hook and multi-observer support to RoomHandoffEngine
- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [51c469d]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [822ed69]
- Updated dependencies [1da00cb]
- Updated dependencies [1aa4e00]
- Updated dependencies [acf0f5b]
- Updated dependencies [b73b878]
- Updated dependencies [989f7fe]
- Updated dependencies [b699a37]
- Updated dependencies [bd0ee83]
- Updated dependencies [fd2a410]
- Updated dependencies [0dbd455]
- Updated dependencies [dde482c]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [fcf8e1c]
- Updated dependencies [d86bcbc]
- Updated dependencies [59d47d5]
- Updated dependencies [aaf74ca]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [1b4c9f5]
- Updated dependencies [1c76559]
- Updated dependencies [97bbca4]
- Updated dependencies [c28e243]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [69bf67c]
- Updated dependencies [95e5dd9]
- Updated dependencies [8bac4d6]
- Updated dependencies [08b3d7b]
- Updated dependencies [35d3c95]
- Updated dependencies [dbc3462]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [7177e09]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [45359c6]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [8ed4049]
- Updated dependencies [6c8798b]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [02bb563]
- Updated dependencies [a66f4b0]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [aac148b]
- Updated dependencies [f2f6f4b]
- Updated dependencies [bc0e36f]
- Updated dependencies [e1942c7]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [bdea87a]
- Updated dependencies [d52f9ba]
- Updated dependencies [ed8a189]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [b653746]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [d2ccfef]
- Updated dependencies [6b487b8]
  - @memberjunction/ai-agents@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/ai-engine-base@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/livekit-room-server@6.2.0-edge.4
  - @memberjunction/ai-bridge-base@6.2.0-edge.4
  - @memberjunction/ai-bridge-server@6.2.0-edge.4
  - @memberjunction/ai-bridge-teams@6.2.0-edge.4
  - @memberjunction/generic-database-provider@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/ai-bridge-ringcentral@6.2.0-edge.4
  - @memberjunction/ai-bridge-twilio@6.2.0-edge.4
  - @memberjunction/ai-bridge-vonage@6.2.0-edge.4
  - @memberjunction/server-extensions-core@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- d046715: Add optional FromNumber to DialIntoRoomRequest (honoured in LiveKitSipTelephonyService with fallback to outboundFromNumber) and expose InteractionID on HandoffOfferInfo, the GraphQL HandoffOffer type, and OFFER_FIELDS.
- 3204a32: Add Interaction lifecycle tracking, append-only InteractionEvent enforcement, caller linking, and outbound number pool selection.
  - **Append-only InteractionEvent**: `MJInteractionEventEntityServer` blocks update and delete operations on `MJ: Interaction Events`.
  - **Interaction lifecycle**: `InteractionLifecycleService` manages creation, state transitions, caller linking, event logging, and duration/cost computation across phone and room calls.
  - **Outbound number pool selection**: `NumberPoolSelector` supports `RoundRobin`, `LocalPresence`, and `Random` selection policies, respecting `MaxConcurrentPerNumber` limits.
  - **Inbound routing**: Resolves dialed numbers to active agent identities and associated `PhoneNumber` records.

- a8e162d: Durable hand-off offers backed by MJ: Interaction Offers with compare-and-set and cluster pubsub fan-out
- 4840fff: Phone calls now get the same agent as the browser path, survive a dropped model connection, and can transfer, send DTMF and hang up.
  - **One co-agent resolution for every host.** The MJServer resolver's chain (explicit, the target's `DefaultCoAgentID`, the type default, then the global Realtime Co-Agent) and its `CanRun` filter on delegation agents moved to `ResolveRealtimeCoAgentID` / `FilterAllowedAgentsByCanRun` in `@memberjunction/ai-agents`. Twilio, Vonage and RingCentral use them, and the dialled agent is now the TARGET voiced by the co-agent instead of being used as both.
  - **Caller identity extension point.** `BaseCallerIdentityResolver` (register under `TelephonyCallerIdentity`) lets a host say who an inbound caller is. MJ core knows nothing about contacts; the default treats every caller as anonymous, and the model is told the caller ID is unverified.
  - **Phone-aware agent.** The model is told it is on a phone call and gets `transfer_call`, `send_dtmf` and `end_call` tools, offered per the carrier's `CallTransfer` / `DTMF` features. A transfer destination goes through the same E.164 and allow/block-list policy as an outbound dial. Keypad presses from the caller reach the model as one note per burst.
  - **Transfers go to a configured directory only.** `telephony.transferTargets` (`{ name, number, description? }`) lists where the agent may transfer a call; the tool takes a name, never a number, so an unverified caller cannot get free forwarding to an arbitrary number. Entries are validated against the outbound policy at startup, and with none configured the tool is not offered.
  - **Barge-in follows the browser policy.** Talking over the agent drops queued progress narration but does not cancel delegated work; the new `cancel_pending_work` tool is the explicit cancel.
  - **Transfer and DTMF no longer end the call.** Twilio sends DTMF as in-band tones instead of replacing the TwiML, and a transferred or goodbyed call is handed to the carrier rather than hung up when the media stream stops. Vonage uses its DTMF API; RingCentral detaches without a BYE.
  - **Model-drop recovery.** A lost realtime model session is reopened once with the conversation so far; if that fails the caller hears a carrier-side message (Twilio `<Say>`, Vonage `talk`) and the call ends. No retry loop.
  - **Spoken progress.** Delegations narrate progress on bridged calls.
  - **Transcript in the call's own conversation**, attributed to the dialled agent, instead of a shared "Meeting Room" conversation.
  - **Cleanup.** `ReconcileOrphans` runs at startup and every 10 minutes; ended calls close their `MJ: AI Agent Sessions` row; live calls heartbeat it so the host janitor does not close a long call.
  - **`telephony.maxConcurrentCalls` (default 25).** Over the cap an inbound caller hears "all agents are busy" and an outbound request is refused with `at-capacity`. Set it at or below the realtime model plan's concurrent-session limit.
  - **RingCentral `HealthCheck`** reports unhealthy when SIP registration failed or has been pending past a minute, with the reason.
  - **Audio.** A stateful per-direction resampler with a low-pass filter replaces the stateless one, removing frame-edge clicks and aliasing when 24 kHz model audio is sent at 8 kHz.
  - **Fixes.** Inbound bridge rows are stamped `InboundRoute` / `Active` rather than `OnDemand` / `Passive`; the roster no longer swaps the agent's and the caller's numbers; and the Twilio signature URL is the public URL's origin plus the request path, so a public URL ending in `/graphql` no longer double-counts the path.

- 8db8973: Telephony safety hardening for the Twilio, Vonage and RingCentral bridges. Inbound calls now run as the user named by the new `telephony.inboundRunAsUserEmail` setting instead of falling back to the System/Owner user; with no usable user the call is rejected (polite TwiML/NCCO, or a declined SIP INVITE) and logged — **inbound calls stop working after upgrading until the setting is configured**. Carrier media websockets are authenticated with a per-call secret token (Twilio `<Parameter name="mjToken">`, Vonage `mj_token`); unknown, mismatched or duplicate sockets are refused and never replace a live one, and a Twilio socket that never authenticates is closed after 10 s. Every outbound `Place*Call` is gated by the caller's right to run the agent, a destination allow/block-prefix policy and a per-process hourly rate limit (`telephony.outbound`; the default block list covers premium-rate and Caribbean toll-fraud prefixes). Vonage outbound calls now carry a correlation id so their media socket can be matched (previously outbound Vonage calls had no audio). Twilio gains signature-verified `/status` and `/amd` callbacks and Vonage terminal `/event` handling so unanswered/failed calls end their session, plus configurable answering-machine handling (`onMachine`). The answer webhooks reply immediately and start the bridge session in the background, buffering early audio (bounded). Twilio audio buffered before the stream starts is re-addressed to the real `streamSid` and capped, and phone sessions are capped at `telephony.maxCallSeconds` (default 1800).
- b1b6d3d: Phone calls can now arrive in a LiveKit room, and an agent can bring a person, a phone number or another agent into that same room.

  No database, entity or metadata change. Handoff offers are held in memory per process, so use a single MJAPI instance for human handoff until a database-backed registry exists (see `plans/realtime/bridges-and-widget/LOCAL-HANDOFF-PR3.md`). None of this has been run against a real LiveKit SIP project or Twilio trunk.
  - **`@memberjunction/livekit-room-server`** — `LiveKitSipService` (list, dial, remove and provision SIP participants and trunks through the LiveKit SIP client), `LiveKitWebhookParser` (signed LiveKit webhooks), and the room handoff engine: `RoomHandoffEngine`, `HandoffOfferRegistry` and the handoff types. `LiveKitAgentRoomCoordinator.StartAgentRoomSession` takes optional host options (tools, framing, conversation, transcript sink, barge-in and recovery hooks), and an ended agent leaves the room roster. `LiveKitUserIdentity` is shared by the token minter and the handoff engine.
  - **`@memberjunction/telephony-adapters`** — `telephony.livekitSip` configuration and the `LiveKitSipTelephonyService` server extension (webhook at `/telephony/livekit-sip/webhook`, inbound admission by dialed number, capacity gate, run-as user, outbound through the shared gate), `ISipTrunkCarrier` with a Twilio Elastic SIP implementation that validates configuration only, `RoomCallSessionStarter`, and `PlaceLiveKitSipCall`. Transfer targets gain `kind: 'user' | 'agent'` (`userEmail`, `fallbackNumber`, `agentName`); a `number` target and a call on a carrier media stream behave as before.
  - **`@memberjunction/server`** — the `telephony.livekitSip` config block; `HumanHandoffResolver` (`MyHandoffOffers`, `AcceptHandoffOffer`, `DeclineHandoffOffer`, subscription `HandoffOfferChanges`, all scoped to the signed-in user, failing closed); `StartLiveKitAgentRoomSession` accepts `EnableHandoff` for web-room escalation.
  - **`@memberjunction/graphql-dataprovider`** — `GraphQLHandoffClient`; `EnableHandoff` on the agent room input.
  - **`@memberjunction/ng-conversation-offers`** (new) — `mj-conversation-offers`, a generic widget listing offered conversations with a countdown and Accept / Decline.
  - **`@memberjunction/ng-mj-livekit-room`** — `EnableHandoff` input.
  - **`@memberjunction/ng-explorer-core`** — the Conversation Console resource (`HumanHandoffConsoleResource`), opened by a `handoff-offer` notification.

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [54f4bc1]
- Updated dependencies [0618369]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [b545842]
- Updated dependencies [24ddecc]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [be15f39]
- Updated dependencies [bea2386]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [3204a32]
- Updated dependencies [a8e162d]
- Updated dependencies [1595b7d]
- Updated dependencies [4840fff]
- Updated dependencies [ec97ad4]
- Updated dependencies [8db8973]
- Updated dependencies [b1b6d3d]
- Updated dependencies [eeee8d4]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/generic-database-provider@6.2.0-edge.3
  - @memberjunction/ai-engine-base@6.2.0-edge.3
  - @memberjunction/ai-agents@6.2.0-edge.3
  - @memberjunction/livekit-room-server@6.2.0-edge.3
  - @memberjunction/ai-bridge-base@6.2.0-edge.3
  - @memberjunction/ai-bridge-server@6.2.0-edge.3
  - @memberjunction/ai-bridge-twilio@6.2.0-edge.3
  - @memberjunction/ai-bridge-vonage@6.2.0-edge.3
  - @memberjunction/ai-bridge-ringcentral@6.2.0-edge.3
  - @memberjunction/ai-bridge-teams@6.2.0-edge.3
  - @memberjunction/server-extensions-core@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [ca853fc]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [2552b1e]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [672b4c6]
- Updated dependencies [0e5ad68]
- Updated dependencies [50ba290]
- Updated dependencies [ffb3c0f]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b03a928]
- Updated dependencies [b44c7cf]
- Updated dependencies [0d61b53]
- Updated dependencies [26c0178]
- Updated dependencies [705ab4e]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [f3fa01e]
- Updated dependencies [3276daa]
- Updated dependencies [d0cea53]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-agents@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/generic-database-provider@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ai-bridge-base@6.2.0-edge.2
  - @memberjunction/ai-bridge-ringcentral@6.2.0-edge.2
  - @memberjunction/ai-bridge-teams@6.2.0-edge.2
  - @memberjunction/ai-bridge-twilio@6.2.0-edge.2
  - @memberjunction/ai-bridge-vonage@6.2.0-edge.2
  - @memberjunction/ai-bridge-server@6.2.0-edge.2
  - @memberjunction/server-extensions-core@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [307da67]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
- Updated dependencies [351ba9f]
- Updated dependencies [c4993f3]
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-agents@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/ai-bridge-base@6.2.0-edge.1
  - @memberjunction/ai-bridge-ringcentral@6.2.0-edge.1
  - @memberjunction/ai-bridge-server@6.2.0-edge.1
  - @memberjunction/ai-bridge-teams@6.2.0-edge.1
  - @memberjunction/ai-bridge-twilio@6.2.0-edge.1
  - @memberjunction/ai-bridge-vonage@6.2.0-edge.1
  - @memberjunction/generic-database-provider@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/server-extensions-core@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [e3db74f]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [3d633ed]
- Updated dependencies [e962151]
- Updated dependencies [2c590b0]
  - @memberjunction/ai-agents@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/generic-database-provider@6.2.0-edge.0
  - @memberjunction/ai-bridge-server@6.2.0-edge.0
  - @memberjunction/ai-bridge-base@6.2.0-edge.0
  - @memberjunction/ai-bridge-ringcentral@6.2.0-edge.0
  - @memberjunction/ai-bridge-teams@6.2.0-edge.0
  - @memberjunction/ai-bridge-twilio@6.2.0-edge.0
  - @memberjunction/ai-bridge-vonage@6.2.0-edge.0
  - @memberjunction/server-extensions-core@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [8206993]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [489aecd]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [59def38]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [a723521]
- Updated dependencies [5f33ca8]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [d0568e6]
- Updated dependencies [23c2521]
- Updated dependencies [44fca09]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [8d0d45a]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [9fc0e2d]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [e26c866]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [45ca475]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [cda0187]
- Updated dependencies [f2f1491]
- Updated dependencies [a1a8989]
- Updated dependencies [29c3dc8]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [6d7d3da]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [d8adda1]
- Updated dependencies [88f8898]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/ai-agents@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/generic-database-provider@6.1.0
  - @memberjunction/server-extensions-core@6.1.0
  - @memberjunction/ai-bridge-base@6.1.0
  - @memberjunction/ai-bridge-ringcentral@6.1.0
  - @memberjunction/ai-bridge-teams@6.1.0
  - @memberjunction/ai-bridge-twilio@6.1.0
  - @memberjunction/ai-bridge-vonage@6.1.0
  - @memberjunction/ai-bridge-server@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [44fca09]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [45ca475]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [88f8898]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai-agents@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/generic-database-provider@6.1.0-edge.7
  - @memberjunction/server-extensions-core@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/ai-bridge-base@6.1.0-edge.7
  - @memberjunction/ai-bridge-ringcentral@6.1.0-edge.7
  - @memberjunction/ai-bridge-teams@6.1.0-edge.7
  - @memberjunction/ai-bridge-twilio@6.1.0-edge.7
  - @memberjunction/ai-bridge-vonage@6.1.0-edge.7
  - @memberjunction/ai-bridge-server@6.1.0-edge.7
