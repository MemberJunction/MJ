# @memberjunction/livekit-room-core

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

- Updated dependencies [80905a1]
  - @memberjunction/global@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [4586215]
- Updated dependencies [197fdf8]
- Updated dependencies [1940a4d]
- Updated dependencies [a5f92d2]
- Updated dependencies [cefc302]
- Updated dependencies [080f4cd]
- Updated dependencies [be0bdb2]
- Updated dependencies [48ff99f]
- Updated dependencies [23c2521]
- Updated dependencies [f5ec13b]
- Updated dependencies [de343b5]
- Updated dependencies [1bd9674]
- Updated dependencies [7fcdc2d]
  - @memberjunction/global@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [7fcdc2d]
  - @memberjunction/global@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [197fdf8]
  - @memberjunction/global@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [1940a4d]
- Updated dependencies [23c2521]
  - @memberjunction/global@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/global@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [de343b5]
  - @memberjunction/global@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [9c07270]
  - @memberjunction/global@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [c1f2d3d]
  - @memberjunction/global@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [5396d90]
  - @memberjunction/global@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0

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

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0
