# @memberjunction/ng-realtime-channels

Build realtime-agent channels in Angular without the call overlay. A small package on purpose: it depends on the channel contract (`@memberjunction/realtime-runtime`, `@memberjunction/ai-core-plus`) and Angular's core, and nothing else of MemberJunction's UI (no overlay, no Explorer, no router), so an embed or an Open App can use it without pulling in the conversations stack.

The how-to is [`guides/REALTIME_CHANNELS_GUIDE.md`](../../../../guides/REALTIME_CHANNELS_GUIDE.md); a complete worked example is [`@memberjunction/ng-realtime-channel-examples`](../realtime-channel-examples/README.md).

## What is in it

| Export | Purpose |
|---|---|
| `AngularComponentChannel<TComponent>` | A base class that turns an **existing** Angular component into a realtime channel surface without rewriting it. You write a descriptor and a few binding functions; the adapter owns binding, perception, verbs, completion, persistence and pictures. |
| `ChannelSurfaceEvent` | What a component's output becomes: `{ Name, Payload?, Author?, Perceive? }`. |
| `EnableChannelFrameCapture(options?)` | Opts a host in to showing the model pictures of channel surfaces: registers a bounded `html-to-image` based rasterizer. Returns a function that removes it. |
| `CreateDomFrameCapturer(options?)`, `DomFrameCaptureOptions`, `DomRasterizer` | Build a capturer with different limits or a different rasterizer. |
| `ChannelFrameCapture`, `ElementFrameCapturer` | The singleton that holds the host's capturer (`Instance.Register(fn \| null)`, `Instance.Capturer`). |

## `AngularComponentChannel`

```ts
@RegisterClass(BaseRealtimeChannelClient, 'SudokuChannel')
export class SudokuChannel extends AngularComponentChannel<SudokuComponent> {
    protected readonly ComponentClass: Type<SudokuComponent> = SudokuComponent;
    protected readonly Descriptor: RealtimeChannelDescriptor = { Key: 'Sudoku', /* ... for the model ... */ };

    protected ReadSurfaceState(c: SudokuComponent): JSONObject { return { board: c.Board, moves: c.MoveCount }; }
    protected ApplySurfaceVerb(c: SudokuComponent, verb: string, args: JSONObject, actor: RealtimeChannelActor): RealtimeChannelVerbResult { /* ... */ }
    protected SurfaceEvents(c: SudokuComponent): Observable<ChannelSurfaceEvent> { return c.CellChanged.pipe(map(/* ... */)); }
}
export function LoadSudokuChannel(): void {}
```

Required members: `ComponentClass`, `Descriptor`, `ReadSurfaceState`, `ApplySurfaceVerb`, `SurfaceEvents`. Optional: `OnSurfaceOpen` (apply `open` inputs), `SurfaceCompletion` (a stream that becomes `Complete(output)`), `OnSurfaceBound` (restore a component created again from the last state), `SurfaceElement` (the root element, so the model can be shown a picture). A subclass that overrides `OnInitialize` must call `super.OnInitialize()`.

What the adapter does:

* **Binding.** `BindSurface` subscribes to `SurfaceEvents` and `SurfaceCompletion`, restores the last state through `OnSurfaceBound`, applies `open` inputs that arrived early and releases waiting verbs. `UnbindSurface` keeps the last state and lets go. A collapsed-then-expanded panel creates a new component, so durable state belongs to the channel.
* **Perception.** Every event, and every successful verb, is recorded as a change: observers get a typed event and the model gets one coalesced delta note, gated by exposure policy. An event emitted while the adapter is running the agent's verb is attributed to the agent.
* **Verbs.** Resolved against the descriptor (case-insensitive), refused for the agent when exposure is below the verb's `ReturnsChannelData`, validated against the parameter schema, serialized, run on the component. A throw becomes a `verb_failed` result the model can read, and is logged.
* **A verb with no surface.** It waits, bounded (`SurfaceBindTimeoutMs`, 5 s), for the component to bind and runs against the real one; if it never binds the call fails with `surface_unavailable` and a message telling the agent to ask the user to open it. Not a hidden headless instance (it would hold state nobody is looking at) and not queue-and-acknowledge (the agent needs the real outcome).
* **A verb that never answers.** Each verb has a bounded execution time (`VerbTimeoutMs`, 15 s, overridable; a non-positive value turns it off). On timeout the call fails with `verb_timeout` ("The X didn't respond to \"play\" within 15s; try again or ask the user."), the queue is released and the timeout is logged once with the channel and verb. The adapter cannot cancel the promise: a late result is never delivered, a late failure is logged, and a late success (the component changed after the agent was told it had not) is recorded as a change so the next perception note shows the real state. Nothing is rolled back, so the component's own rules must reject a duplicate retry.
* **Persistence.** `SerializeState()` and `RestoreState()` carry the last state as JSON (a non-object is refused).
* **Pictures.** If `SurfaceElement` returns an element and the host called `EnableChannelFrameCapture`, the channel sources the model's video track and a frame is pushed after each user change, only while the effective exposure is `'pixels'` and a video track is established.

## The rasterizer

Core ships no rasterizer: it is a heavy dependency every embed would pay for. A host that wants the model to see surfaces calls `EnableChannelFrameCapture()` once at startup, **before a session is minted** (Explorer does this in `ExplorerAppComponent`). The capturer is bounded (3000 nodes, 4 s, one capture at a time, a 1024 px longest edge, no web fonts) and fails soft: it costs the model a frame, never a call, and after three consecutive failures (or at once on one that cannot recover) turns itself off for the session and logs one reason.

## Layering

Layer **L1 (widgets)**: no router, no Explorer, no overlay. See [`guides/UI_LAYERING_GUIDE.md`](../../../../guides/UI_LAYERING_GUIDE.md).

## Testing

```bash
cd packages/Angular/Generic/realtime-channels
pnpm test           # node preset (adapter) + jsdom preset (rasterizer)
pnpm run test:types # typecheck the specs
pnpm run build
```
