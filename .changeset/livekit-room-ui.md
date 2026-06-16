---
'@memberjunction/livekit-room-core': minor
'@memberjunction/ng-livekit-room': minor
'@memberjunction/livekit-room-server': minor
'@memberjunction/ng-mj-livekit-room': minor
'@memberjunction/graphql-dataprovider': minor
'@memberjunction/server': minor
---

Add the LiveKit room UX stack — a full-featured, framework-portable LiveKit client plus the MJ realtime-bridge binding.

- **`@memberjunction/livekit-room-core`** (new): framework-agnostic, pure-TS room controller over `livekit-client` — observable room state, participants, active speakers, audio meters, device control, data-channel messages, and a deep **cancelable event architecture** (Before-events with `event.Cancel = true`, mirroring the conversations stack).
- **`@memberjunction/ng-livekit-room`** (new): a super-featured, portable Angular component (`mj-livekit-room`) — participant grid/spotlight/audio-only layouts, A/V/screen controls, data-channel chat, device pickers, active-speaker rings, per-tile audio meters. Every feature is gated by a PascalCase `@Input`; the core's cancelable events are re-surfaced as `@Output`s. Themed via MJ design tokens (with fallbacks so it works in any Angular app).
- **`@memberjunction/livekit-room-server`** (new): server-side token minting (`livekit-server-sdk`) — the browser-facing seam that lets a human join an MJ-issued room — plus `LiveKitAgentRoomCoordinator`, the session-start harness that opens a realtime model session and bridges it into a LiveKit room via `AIBridgeEngine.StartBridgeSession`.
- **`@memberjunction/ng-mj-livekit-room`** (new): the MJ binding (`mj-livekit-agent-room`) — resolves a scoped token / starts an agent room session via the RealtimeBridge GraphQL surface and renders the generic room with MJ user/provider/agent context threaded in.
- **`@memberjunction/graphql-dataprovider`**: adds `GraphQLLiveKitClient` (mint client token / start agent room session).
- **`@memberjunction/server`**: adds `RealtimeBridgeResolver` (`MintLiveKitClientToken`, `StartLiveKitAgentRoomSession`).

No migrations. The agent-talking path additionally requires the deployment to bind a realtime-session factory on `LiveKitAgentRoomCoordinator.Instance` and the LiveKit native room client (`@livekit/rtc-node`) — the documented deployment seams.
