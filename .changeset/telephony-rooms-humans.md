---
"@memberjunction/livekit-room-server": patch
"@memberjunction/telephony-adapters": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-conversation-offers": patch
"@memberjunction/ng-mj-livekit-room": patch
"@memberjunction/ng-explorer-core": patch
---

Phone calls can now arrive in a LiveKit room, and an agent can bring a person, a phone number or another agent into that same room.

No database, entity or metadata change. Handoff offers are held in memory per process, so use a single MJAPI instance for human handoff until a database-backed registry exists (see `plans/realtime/bridges-and-widget/LOCAL-HANDOFF.md`). None of this has been run against a real LiveKit SIP project or Twilio trunk.

- **`@memberjunction/livekit-room-server`** — `LiveKitSipService` (list, dial, remove and provision SIP participants and trunks through the LiveKit SIP client), `LiveKitWebhookParser` (signed LiveKit webhooks), and the room handoff engine: `RoomHandoffEngine`, `HandoffOfferRegistry` and the handoff types. `LiveKitAgentRoomCoordinator.StartAgentRoomSession` takes optional host options (tools, framing, conversation, transcript sink, barge-in and recovery hooks), and an ended agent leaves the room roster. `LiveKitUserIdentity` is shared by the token minter and the handoff engine.
- **`@memberjunction/telephony-adapters`** — `telephony.livekitSip` configuration and the `LiveKitSipTelephonyService` server extension (webhook at `/telephony/livekit-sip/webhook`, inbound admission by dialed number, capacity gate, run-as user, outbound through the shared gate), `ISipTrunkCarrier` with a Twilio Elastic SIP implementation that validates configuration only, `RoomCallSessionStarter`, and `PlaceLiveKitSipCall`. Transfer targets gain `kind: 'user' | 'agent'` (`userEmail`, `fallbackNumber`, `agentName`); a `number` target and a call on a carrier media stream behave as before.
- **`@memberjunction/server`** — the `telephony.livekitSip` config block; `HumanHandoffResolver` (`MyHandoffOffers`, `AcceptHandoffOffer`, `DeclineHandoffOffer`, subscription `HandoffOfferChanges`, all scoped to the signed-in user, failing closed); `StartLiveKitAgentRoomSession` accepts `EnableHandoff` for web-room escalation.
- **`@memberjunction/graphql-dataprovider`** — `GraphQLHandoffClient`; `EnableHandoff` on the agent room input.
- **`@memberjunction/ng-conversation-offers`** (new) — `mj-conversation-offers`, a generic widget listing offered conversations with a countdown and Accept / Decline.
- **`@memberjunction/ng-mj-livekit-room`** — `EnableHandoff` input.
- **`@memberjunction/ng-explorer-core`** — the Conversation Console resource (`HumanHandoffConsoleResource`), opened by a `handoff-offer` notification.
