# @memberjunction/ng-realtime-channel-examples

Worked examples for building realtime-agent channels. **Not loaded by default and not a dependency of anything in MemberJunction**: nothing here runs unless a host imports it, calls the `Load...` function and brings the channel to a session. It exists so the guide has something real and tested to point at.

The guide is [`guides/REALTIME_CHANNELS_GUIDE.md`](../../../../guides/REALTIME_CHANNELS_GUIDE.md) (section 3 walks through this package line by line).

## Tic-tac-toe

The user plays X by clicking; the agent plays O by calling a verb. The channel is built **only** by wrapping a plain Angular component with [`AngularComponentChannel`](../realtime-channels/README.md); the component has no idea a channel exists.

| File | What it is |
|---|---|
| `tic-tac-toe-engine.ts` | The rules as pure functions (the layer an app already has). |
| `tic-tac-toe-board.component.ts` | An ordinary standalone component: signals for state, one `Play(mark, cell)` method where the rules live, a click handler, `Moved` and `GameOver` outputs. |
| `tic-tac-toe-channel.ts` | `TicTacToeChannel extends AngularComponentChannel<TicTacToeBoardComponent>`: descriptor, `ReadSurfaceState`, `ApplySurfaceVerb`, `SurfaceEvents`, and the optional hooks. `LoadExampleTicTacToeChannel()` keeps the registration from being tree-shaken. |
| `tic-tac-toe-channel.dom.test.ts` | Plays whole games (a user win, an agent win, a draw) with the real component, the real adapter and the real `ChannelActionDispatcher`: the user clicks real buttons, the agent's moves go through `ContextTool`-shaped dispatches, with refusals, a collapse and re-expand mid-game, a resume from saved state, exposure policy and pictures. |

The descriptor shows the habits to copy: `Instructions` written for the model (roles, coordinates, when to act), compact state (`board: ['X.O', '.X.', '...']`), acting verbs that return what they did and not the board (`{ placed: 4 }`), and `read_board` flagged `ReturnsChannelData: 'state'` so it is refused whole when the model may not see the board.

### Using it

```ts
import { LoadExampleTicTacToeChannel } from '@memberjunction/ng-realtime-channel-examples';

LoadExampleTicTacToeChannel(); // once, at startup

// Bring it to a session as a host channel (works with no registry rows, e.g. an embed):
await runtime.StartRealtimeSession(agentId, conversationId, null, null, null, null, null, null, null, null, applicationId, null, {
    HostChannels: [{ ClientPluginClass: 'ExampleTicTacToeChannel', DisplayPolicy: 'on-demand' }],
});
```

or through an `MJ: AI Agent Channels` row with `ClientPluginClass: 'ExampleTicTacToeChannel'` and a server plugin (see the guide's section 8), and include `TicTacToe` in the agent's or app's channel scope (it is `opt-in`). Then say "let's play tic-tac-toe": the agent opens the channel through `ContextTool` and plays from the descriptor alone.

## Testing

```bash
cd packages/Angular/Generic/realtime-channel-examples
pnpm test
pnpm run test:types
pnpm run build
```
