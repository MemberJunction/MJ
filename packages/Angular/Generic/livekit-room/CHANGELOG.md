# @memberjunction/ng-livekit-room

## 5.42.0

### Minor Changes

- 5fde509: Add the LiveKit room UX stack — a full-featured, framework-portable LiveKit client plus the MJ realtime-bridge binding, server token/egress support, and an Explorer surface.
  - **`@memberjunction/livekit-room-core`** (new): framework-agnostic pure-TS room controller over `livekit-client` — observable room state, participants, active speakers, audio meters, device control, data-channel messages, audio-autoplay unblock, Krisp noise filter, background blur/virtual background, E2EE, room-free media preview, and a deep **cancelable event architecture** (`event.Cancel = true`).
  - **`@memberjunction/ng-livekit-room`** (new): super-featured portable Angular UI (`mj-livekit-room`) — gallery / active-speaker / **split-view (draggable splitter)** / audio-only layouts with a live switcher, A/V/screen controls, data-channel chat, device + settings menu (noise filter / background blur), **PreJoin lobby**, **StartAudio** unblock, click-to-pin, **agent-state visualizer**, **collaborative whiteboard** (reuses `@memberjunction/ng-whiteboard`, synced over the data channel — agent co-authoring supported), recording control, and E2EE. Every feature gated by a PascalCase `@Input`; core events re-surfaced as `@Output`s. MJ design tokens with fallbacks.
  - **`@memberjunction/livekit-room-server`** (new): scoped client/bot token minting (`livekit-server-sdk`), `LiveKitAgentRoomCoordinator` session-start harness (opens a realtime session → `AIBridgeEngine.StartBridgeSession`), and `LiveKitEgressService` recording.
  - **`@memberjunction/ng-mj-livekit-room`** (new): MJ binding (`mj-livekit-agent-room`) resolving tokens / starting agent sessions / recording via the RealtimeBridge GraphQL surface.
  - **`@memberjunction/graphql-dataprovider`**: adds `GraphQLLiveKitClient` (mint token, start agent room session, start/stop recording).
  - **`@memberjunction/server`**: adds `RealtimeBridgeResolver` (`MintLiveKitClientToken`, `StartLiveKitAgentRoomSession`, `StartLiveKitRecording`, `StopLiveKitRecording`).
  - **`@memberjunction/ng-explorer-core`**: registers a `LiveKitRoomResource` so the room can be opened as an Explorer tab.

  Tests: 74 unit tests across the stack (core 22, server 15, ng-livekit-room 26, GraphQL client 6, resolver 5). No migrations. The agent-talking path additionally requires the deployment to bind a realtime-session factory on `LiveKitAgentRoomCoordinator.Instance` and the LiveKit native room client (`@livekit/rtc-node`) — the documented deployment seams.

- 4ec1732: Make the Meet app's LiveKit Live Room work end-to-end (default agent resolution, realtime model fallback, real backing session row, bridge-driver registration, connect timeout, and active device selection), then build it into a multi-party experience: a pre-join agent picker, threading a target agent so the co-agent actually responds, in-room add/remove of agents, and shareable human invite links. Also improves Entity Vector Sync with a concise per-document summary, verbose-gated pipeline logging, and a batched Entity Record Document existence read that replaces an N+1 query storm.

### Patch Changes

- Updated dependencies [5fde509]
- Updated dependencies [4ec1732]
  - @memberjunction/livekit-room-core@5.42.0
  - @memberjunction/ng-whiteboard@5.42.0
