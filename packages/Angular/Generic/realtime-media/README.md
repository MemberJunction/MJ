# @memberjunction/ng-realtime-media

Provider-neutral media UI for realtime sessions and meeting rooms. The components render the `/media` models of
[`@memberjunction/ai-realtime-client`](../../../AI/RealtimeClient/README.md) (`MediaParticipant`,
`MediaVideoSource`, `MediaDevice`, and the agent and connection states) and emit intent. None of them acquires
media or talks to a vendor SDK, so the realtime overlay and the LiveKit meeting room share one implementation.

## Components

| Selector | Class | What it shows |
|---|---|---|
| `mj-media-tile` | `MediaTileComponent` | One participant: their video, or a picture or initials; name, role badge, mute and screen-sharing indicators, connection quality, an active-speaker ring, an optional meter and a pin button |
| `mj-audio-meter` | `MediaAudioMeterComponent` | A bar meter fed by a level reader, `() => number`, smoothed by the shared `AudioLevelSmoother` |
| `mj-agent-state` | `MediaAgentStateComponent` | An orb and a label for the agent's state: idle, listening, thinking, speaking |
| `mj-connection-overlay` | `MediaConnectionOverlayComponent` | Connecting, reconnecting, error and disconnected states, with a retry action |
| `mj-media-device-menu` | `MediaDeviceMenuComponent` | Microphone, camera and speaker pickers, plus optional noise-filter and background-blur toggles |

All are standalone and `OnPush`, with PascalCase inputs and outputs.

## Rules the components follow

- **A tile never plays audio.** A voice must not stop because its tile left the screen, so the host plays each
  voice once, outside the layout. Video is attached with `AttachVideoSource`, and a tile reattaches only when the
  source object changes. Adapters should hand out the same source for the same track (the LiveKit one,
  `ToMediaParticipant` in `@memberjunction/livekit-room-core`, does).
- **Each host keeps its own meter feel.** `mj-audio-meter` and the tile take smoothing settings (bar count,
  attack, decay, silence floor); the LiveKit room passes the values its meter has always used.
- **No vendor imports.** The source may import Angular, `@memberjunction/ng-ui-components` and the `/media`
  entry of the realtime client, nothing else. `src/__tests__/import-boundary.test.ts` enforces it.

## Styling

The components use the semantic `--mj-*` tokens and the `mjButton` directive, so the host application must load
the MemberJunction token stylesheet and `button.scss` from `@memberjunction/ng-ui-components`. Text over video
sits on a dark scrim in both themes.

## Tests

`pnpm test` runs the import-boundary check (node) and a DOM spec next to each component (jsdom). Video in the DOM
specs uses element sources that only record calls; real media is checked live.
