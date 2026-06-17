# Testing the LiveKit Room Stack Locally

How to verify the LiveKit room UX stack after pulling the branch — unit tests (no infra), then live
testing (needs a LiveKit server). See the package READMEs for API detail and
[`livekit-recording-governance.md`](./livekit-recording-governance.md) for the recording roadmap.

---

## 1. Pull, install, build

```bash
git checkout claude/livekit-ui-component-design-u6r4fm
npm install     # pulls livekit-client, livekit-server-sdk, @livekit/krisp-noise-filter, @livekit/track-processors
npx turbo build --filter=@memberjunction/livekit-room-core \
  --filter=@memberjunction/livekit-room-server \
  --filter=@memberjunction/ng-livekit-room \
  --filter=@memberjunction/ng-mj-livekit-room \
  --filter=@memberjunction/server --filter=@memberjunction/ng-explorer-core
```

## 2. Unit tests (no LiveKit needed — 74 tests)

```bash
npx turbo test --filter=@memberjunction/livekit-room-core \
  --filter=@memberjunction/livekit-room-server \
  --filter=@memberjunction/ng-livekit-room
cd packages/GraphQLDataProvider && npx vitest run src/__tests__/graphQLLiveKitClient.test.ts
cd packages/MJServer          && npx vitest run src/__tests__/RealtimeBridgeResolver.test.ts
```

Coverage: core controller + events + audio meter (22), server token/coordinator/egress (15),
ng-livekit-room logic + whiteboard sync + presentational components (26), GraphQL client (6),
resolver mapping/gating (5). `turbo test` builds dependencies first.

> **DOM-render tests** for the template/DI-heavy components (main room, tile, audio-meter, PreJoin,
> MJ binding) are intentionally **not** here — they require the jsdom + zoneless TestBed harness tracked
> in [`../testing/angular-dom-testing-rollout.md`](../testing/angular-dom-testing-rollout.md). The components'
> logic is extracted into tested pure modules; the templates are `ngc`-compile-verified.

## 3. Stand up a LiveKit server + credentials

**Local dev (fastest):**
```bash
docker run --rm -p 7880:7880 -p 7881:7881 -p 7882:7882/udp \
  livekit/livekit-server --dev --bind 0.0.0.0
# dev key/secret: devkey / secret ; URL: ws://localhost:7880
```
**Or LiveKit Cloud:** create a free project → `wss://<proj>.livekit.cloud` + API key/secret.

Set these where **MJAPI** runs (`packages/MJAPI/.env` or `mj.config.cjs`):
```
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
```

## 4. Fastest live smoke — the UI with zero MJ backend

Proves the whole component (grid / spotlight / split, screen-share, chat, **whiteboard sync**, device
pickers, meters) by joining a raw room from two browser tabs:
```bash
lk token create --api-key devkey --api-secret secret --join --room test --identity me --valid-for 24h
```
Render `<mj-livekit-room [ServerUrl]="ws://localhost:7880" [Token]="<token>" [ShowWhiteboard]="true">` in a
harness page (or use the LiveKit **Agents Playground** as a second participant). Open two tabs in the same
room → verify participants, screen-share, chat, and whiteboard sync over the data channel.

## 5. MJ token path (credentials only — no agent/native client)

Run MJAPI + MJExplorer, then in the GraphQL playground:
```graphql
mutation { MintLiveKitClientToken(input:{RoomName:"test"}){ Success ServerUrl Token Identity ErrorMessage } }
```
A `Token` back confirms the server seam works end-to-end. Feed it into `<mj-livekit-room>`.

## 6. In Explorer (the "Realtime" app)

```bash
npx mj sync push --dir=metadata        # pushes the "Realtime" app + "Live Room" nav item
```
Add the **Realtime** app to your user (it is `DefaultForNewUser: false`) and open **Live Room**.

> ⚠️ **The Explorer "Live Room" resource currently defaults to AGENT mode**
> (`Mode="agent"` → `StartLiveKitAgentRoomSession`). That path needs the agent deployment seams in §7, so
> out of the box the tab will surface an error until those exist. The **human-join** path (§4–§5) works
> today. (A follow-up can make the resource `join`-mode by default + agent id-configurable for one-click
> in-app smoke testing.)

## 7. What needs more than credentials

| Capability | Requirement |
|---|---|
| **Agent talking in the room** | (1) an active `MJ: AI Bridge Providers` row with `DriverClass='LiveKitBridge'`; (2) a realtime-session factory bound via `LiveKitAgentRoomCoordinator.Instance.SetSessionFactory(...)`; (3) the native room client `@livekit/rtc-node` bound on the LiveKit bridge (`LiveKitBridge.SetSdkFactory(...)` / the native-SDK registry). |
| **Recording (egress)** | Egress configured on the LiveKit project (Cloud includes it; local dev needs an egress container). Governed-recording roadmap: [`livekit-recording-governance.md`](./livekit-recording-governance.md). |
| **Krisp noise filter** | LiveKit Cloud only. |
| **Background blur / virtual bg** | `@livekit/track-processors` (already a dependency) + a camera track. |
| **E2EE** | Host supplies a worker + passphrase to `<mj-livekit-room [E2EEPassphrase] [E2EEWorker]>`. |

## 8. Quick reference — what works at each level

| You have… | You can test… |
|---|---|
| Nothing (just the repo) | All 74 unit tests (§2) |
| A LiveKit server + a hand-minted token | Full UI: layouts, screen-share, chat, whiteboard, devices, meters (§4) |
| LiveKit creds in MJAPI | `MintLiveKitClientToken` → humans join MJ-issued rooms (§5) |
| + agent seams (§7) | An MJ agent talking in the room |
| + egress configured | Cloud recording |
