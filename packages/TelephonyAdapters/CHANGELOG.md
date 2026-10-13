# @memberjunction/telephony-adapters

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
