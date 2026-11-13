# @memberjunction/ng-conversation-offers

## 6.3.0-edge.0

### Patch Changes

- Updated dependencies [62eca59]
- Updated dependencies [4d2c52d]
- Updated dependencies [7ed32af]
- Updated dependencies [567d7b9]
- Updated dependencies [c07f654]
- Updated dependencies [9ec4dce]
- Updated dependencies [03bb8b6]
- Updated dependencies [0ebebfe]
- Updated dependencies [1b282a0]
- Updated dependencies [9eb002d]
- Updated dependencies [1dd1af1]
- Updated dependencies [87ac205]
- Updated dependencies [18bb8fa]
- Updated dependencies [6049806]
- Updated dependencies [63636e0]
- Updated dependencies [abb285b]
- Updated dependencies [4884a47]
- Updated dependencies [5c3d369]
- Updated dependencies [b2789ee]
- Updated dependencies [31cc053]
- Updated dependencies [2641e47]
- Updated dependencies [b332459]
- Updated dependencies [100b9c2]
- Updated dependencies [6bd8271]
- Updated dependencies [6fd9fb7]
- Updated dependencies [70b5e38]
- Updated dependencies [28cec7d]
- Updated dependencies [b68d388]
- Updated dependencies [5c4fa7c]
- Updated dependencies [8c3c8a4]
- Updated dependencies [fbbc06a]
- Updated dependencies [7ace3ee]
- Updated dependencies [2b349b9]
- Updated dependencies [c889b72]
  - @memberjunction/core@6.3.0-edge.0
  - @memberjunction/global@6.3.0-edge.0
  - @memberjunction/ng-ui-components@6.3.0-edge.0
  - @memberjunction/graphql-dataprovider@6.3.0-edge.0
  - @memberjunction/ng-base-types@6.3.0-edge.0
  - @memberjunction/ng-shared-generic@6.3.0-edge.0

## 6.2.0

### Patch Changes

- b1b6d3d: Phone calls can now arrive in a LiveKit room, and an agent can bring a person, a phone number or another agent into that same room.

  No database, entity or metadata change. Handoff offers are held in memory per process, so use a single MJAPI instance for human handoff until a database-backed registry exists (see `plans/realtime/bridges-and-widget/LOCAL-HANDOFF-PR3.md`). None of this has been run against a real LiveKit SIP project or Twilio trunk.
  - **`@memberjunction/livekit-room-server`** — `LiveKitSipService` (list, dial, remove and provision SIP participants and trunks through the LiveKit SIP client), `LiveKitWebhookParser` (signed LiveKit webhooks), and the room handoff engine: `RoomHandoffEngine`, `HandoffOfferRegistry` and the handoff types. `LiveKitAgentRoomCoordinator.StartAgentRoomSession` takes optional host options (tools, framing, conversation, transcript sink, barge-in and recovery hooks), and an ended agent leaves the room roster. `LiveKitUserIdentity` is shared by the token minter and the handoff engine.
  - **`@memberjunction/telephony-adapters`** — `telephony.livekitSip` configuration and the `LiveKitSipTelephonyService` server extension (webhook at `/telephony/livekit-sip/webhook`, inbound admission by dialed number, capacity gate, run-as user, outbound through the shared gate), `ISipTrunkCarrier` with a Twilio Elastic SIP implementation that validates configuration only, `RoomCallSessionStarter`, and `PlaceLiveKitSipCall`. Transfer targets gain `kind: 'user' | 'agent'` (`userEmail`, `fallbackNumber`, `agentName`); a `number` target and a call on a carrier media stream behave as before.
  - **`@memberjunction/server`** — the `telephony.livekitSip` config block; `HumanHandoffResolver` (`MyHandoffOffers`, `AcceptHandoffOffer`, `DeclineHandoffOffer`, subscription `HandoffOfferChanges`, all scoped to the signed-in user, failing closed); `StartLiveKitAgentRoomSession` accepts `EnableHandoff` for web-room escalation.
  - **`@memberjunction/graphql-dataprovider`** — `GraphQLHandoffClient`; `EnableHandoff` on the agent room input.
  - **`@memberjunction/ng-conversation-offers`** (new) — `mj-conversation-offers`, a generic widget listing offered conversations with a countdown and Accept / Decline.
  - **`@memberjunction/ng-mj-livekit-room`** — `EnableHandoff` input.
  - **`@memberjunction/ng-explorer-core`** — the Conversation Console resource (`HumanHandoffConsoleResource`), opened by a `handoff-offer` notification.

- Updated dependencies [1419ba7]
- Updated dependencies [39b35f1]
- Updated dependencies [d17de94]
- Updated dependencies [e97d95c]
- Updated dependencies [6c36fb6]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [b5955fb]
- Updated dependencies [d538c14]
- Updated dependencies [a3539d2]
- Updated dependencies [dde482c]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [0581392]
- Updated dependencies [29b16ee]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [660ef45]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [7be1684]
- Updated dependencies [21f9e15]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [81aea34]
- Updated dependencies [eb3a8d3]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [83486cf]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [8b62f8c]
- Updated dependencies [490cd8d]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [ea4080e]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [a6f8c1c]
- Updated dependencies [08f8966]
- Updated dependencies [48c9cd2]
- Updated dependencies [56d7614]
- Updated dependencies [683f652]
- Updated dependencies [914e6ff]
- Updated dependencies [2274f42]
- Updated dependencies [7e57b48]
- Updated dependencies [35ed364]
- Updated dependencies [0fb3649]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [5df9486]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [dd34a5c]
- Updated dependencies [5fed75a]
- Updated dependencies [4c0eaec]
- Updated dependencies [e225ece]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [80905a1]
- Updated dependencies [397ae9a]
- Updated dependencies [7e72c86]
- Updated dependencies [dbc3462]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [279b93e]
- Updated dependencies [5e1e343]
- Updated dependencies [f0c78c3]
- Updated dependencies [4ef13d6]
- Updated dependencies [25f7b82]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [db4e210]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [8c120db]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [8d1a373]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [36a3f9e]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [920bef8]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [d0a8dbf]
- Updated dependencies [b1b6d3d]
- Updated dependencies [0e5a4cd]
- Updated dependencies [291485d]
- Updated dependencies [b968642]
- Updated dependencies [af57e8d]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
- Updated dependencies [da449bb]
- Updated dependencies [57fea6a]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [b0b2cc9]
- Updated dependencies [dc38250]
  - @memberjunction/global@6.2.0
  - @memberjunction/core@6.2.0
  - @memberjunction/graphql-dataprovider@6.2.0
  - @memberjunction/ng-shared-generic@6.2.0
  - @memberjunction/ng-ui-components@6.2.0
  - @memberjunction/ng-base-types@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [dd34a5c]
- Updated dependencies [e69634e]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/graphql-dataprovider@6.2.0-edge.8
  - @memberjunction/ng-base-types@6.2.0-edge.8
  - @memberjunction/ng-shared-generic@6.2.0-edge.8
  - @memberjunction/ng-ui-components@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- Updated dependencies [1419ba7]
- Updated dependencies [29b16ee]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [08f8966]
- Updated dependencies [48c9cd2]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [397ae9a]
- Updated dependencies [4ef13d6]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [da449bb]
- Updated dependencies [b0b2cc9]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/graphql-dataprovider@6.2.0-edge.7
  - @memberjunction/ng-shared-generic@6.2.0-edge.7
  - @memberjunction/ng-base-types@6.2.0-edge.7
  - @memberjunction/ng-ui-components@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [b5955fb]
- Updated dependencies [d538c14]
- Updated dependencies [0581392]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [dae1d31]
- Updated dependencies [db4e210]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [5b41d48]
- Updated dependencies [291485d]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/graphql-dataprovider@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ng-shared-generic@6.2.0-edge.6
  - @memberjunction/ng-ui-components@6.2.0-edge.6
  - @memberjunction/ng-base-types@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [39b35f1]
- Updated dependencies [c159e2f]
- Updated dependencies [db39145]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [81aea34]
- Updated dependencies [5465489]
- Updated dependencies [83486cf]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [8b62f8c]
- Updated dependencies [2274f42]
- Updated dependencies [35ed364]
- Updated dependencies [5fed75a]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/graphql-dataprovider@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/ng-shared-generic@6.2.0-edge.5
  - @memberjunction/ng-ui-components@6.2.0-edge.5
  - @memberjunction/ng-base-types@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [d17de94]
- Updated dependencies [dde482c]
- Updated dependencies [49f26d9]
- Updated dependencies [88e6902]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [490cd8d]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [dbc3462]
- Updated dependencies [5e1e343]
- Updated dependencies [f0c78c3]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/graphql-dataprovider@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ng-shared-generic@6.2.0-edge.4
  - @memberjunction/ng-ui-components@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/ng-base-types@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- b1b6d3d: Phone calls can now arrive in a LiveKit room, and an agent can bring a person, a phone number or another agent into that same room.

  No database, entity or metadata change. Handoff offers are held in memory per process, so use a single MJAPI instance for human handoff until a database-backed registry exists (see `plans/realtime/bridges-and-widget/LOCAL-HANDOFF-PR3.md`). None of this has been run against a real LiveKit SIP project or Twilio trunk.
  - **`@memberjunction/livekit-room-server`** — `LiveKitSipService` (list, dial, remove and provision SIP participants and trunks through the LiveKit SIP client), `LiveKitWebhookParser` (signed LiveKit webhooks), and the room handoff engine: `RoomHandoffEngine`, `HandoffOfferRegistry` and the handoff types. `LiveKitAgentRoomCoordinator.StartAgentRoomSession` takes optional host options (tools, framing, conversation, transcript sink, barge-in and recovery hooks), and an ended agent leaves the room roster. `LiveKitUserIdentity` is shared by the token minter and the handoff engine.
  - **`@memberjunction/telephony-adapters`** — `telephony.livekitSip` configuration and the `LiveKitSipTelephonyService` server extension (webhook at `/telephony/livekit-sip/webhook`, inbound admission by dialed number, capacity gate, run-as user, outbound through the shared gate), `ISipTrunkCarrier` with a Twilio Elastic SIP implementation that validates configuration only, `RoomCallSessionStarter`, and `PlaceLiveKitSipCall`. Transfer targets gain `kind: 'user' | 'agent'` (`userEmail`, `fallbackNumber`, `agentName`); a `number` target and a call on a carrier media stream behave as before.
  - **`@memberjunction/server`** — the `telephony.livekitSip` config block; `HumanHandoffResolver` (`MyHandoffOffers`, `AcceptHandoffOffer`, `DeclineHandoffOffer`, subscription `HandoffOfferChanges`, all scoped to the signed-in user, failing closed); `StartLiveKitAgentRoomSession` accepts `EnableHandoff` for web-room escalation.
  - **`@memberjunction/graphql-dataprovider`** — `GraphQLHandoffClient`; `EnableHandoff` on the agent room input.
  - **`@memberjunction/ng-conversation-offers`** (new) — `mj-conversation-offers`, a generic widget listing offered conversations with a countdown and Accept / Decline.
  - **`@memberjunction/ng-mj-livekit-room`** — `EnableHandoff` input.
  - **`@memberjunction/ng-explorer-core`** — the Conversation Console resource (`HumanHandoffConsoleResource`), opened by a `handoff-offer` notification.

- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [d0a8dbf]
- Updated dependencies [b1b6d3d]
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/graphql-dataprovider@6.2.0-edge.3
  - @memberjunction/ng-ui-components@6.2.0-edge.3
  - @memberjunction/ng-base-types@6.2.0-edge.3
  - @memberjunction/ng-shared-generic@6.2.0-edge.3
