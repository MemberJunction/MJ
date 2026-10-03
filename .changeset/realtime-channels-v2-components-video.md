---
"@memberjunction/ai": minor
"@memberjunction/ai-gemini": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-realtime-client": minor
"@memberjunction/realtime-runtime": minor
"@memberjunction/ai-agents": minor
"@memberjunction/server": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-react": minor
---

Realtime Channels v2, second phase: an Interactive Component channel, several video sources with one arbiter, and exposure policy. Existing channels, tool names and hosts are unchanged.

`minor` because the branch edits `metadata/` (a new `MJ: AI Agent Channels` row, and `Privacy.ZeroDataRetention` and `RequireZeroDataRetentionFor` in the `IAIConfiguration` / `IAgentSettings` JSON types). There is no migration and no new entity column.

- **Interactive Component channel** (`@memberjunction/ng-conversations`, `@memberjunction/ai-agents`, `@memberjunction/ng-react`). Shows any component artifact next to the call and lets the agent operate it. Multi-instance, opt-in, on-demand. Its contract is derived from the component's spec: custom methods and the standard methods it supports become verbs with parameter schemas, `getCurrentDataState` becomes the instance's data, spec events become channel events, spec properties become the schema of the opening inputs. Built-ins: `open`, `show_version` (swaps an open instance to another version of its own artifact in place, keeping its id), `close`. Artifacts load through the signed-in user's own access. Delegated component artifacts can open automatically (`channels.config.InteractiveComponent.autoOpenDelegatedComponents`, off by default), and a newer version of an open component replaces it in place. `MJReactComponent` gains a public `Refresh()`. New `InteractiveComponentChannelServer` and a `MJ: AI Agent Channels` row.
- **Multi-instance and delegated-artifact hooks** (`@memberjunction/realtime-runtime`). `OnOpen` can name the instance it created; `Complete` and `EmitChannelEvent` take an optional instance. A channel can ask to be offered the artifacts of a delegated run (`AcceptsDelegationArtifacts` / `OnDelegationArtifacts`); the runtime mounts it if needed and reveals its tab.
- **Several video sources** (`@memberjunction/ai`, `@memberjunction/ai-gemini`, `@memberjunction/ai-realtime-client`). Tracks carry a `SourceID` and `Label`; model profiles declare `MaxInboundVideoStreams` (1 for Gemini 3.8 Live and Extended Thinking, 0 without video input) and negotiation caps the streams to it. `SendVideoFrame(data, mime, sourceId?)`. `VideoSourceArbiter` is the single writer of inbound video: it passes every enabled source through on a multi-stream model; on a one-stream model it picks by a policy that is data (user pick, most recent capture, focused surface, newest), tells the model `[The agent is now viewing: <label>]` on every switch, and paces to the negotiated rate. The channel video bridge now registers with the arbiter; its exports are unchanged.
- **"Agent can see" and exposure policy** (`@memberjunction/ai-core-plus`, `@memberjunction/ai-agents`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`). The realtime overlay shows which sources the agent can see, with a switch per source, remembered per user per channel. A channel's exposure is the lowest of its own ceiling, the agent's `channels.config.<Key>.maxExposure`, a zero-data-retention requirement and the user's choice; the server decides all but the last and returns it in the session policy. `requireZeroDataRetentionFor: ['state' | 'pixels']` lowers exposure when the session model's configuration does not declare `Privacy.ZeroDataRetention: true`, and the agent is told why. Exposure gates what is volunteered to the model (state notes and frames), and, for a verb that declares `ReturnsChannelData`, what the agent may ask for (the verb is refused whole below its level; see the third phase).
- **Session tuning.** `realtime.session.unverifiedMaxSeconds` and `verifiedMaxSeconds` (positive integers) pass through the configuration cascade; `channels.config.<Key>` reaches a channel intact.
