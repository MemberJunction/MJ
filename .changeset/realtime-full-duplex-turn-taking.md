---
"@memberjunction/ai": patch
"@memberjunction/ai-openai": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-bridge-base": patch
"@memberjunction/ai-bridge-server": patch
"@memberjunction/livekit-room-server": patch
"@memberjunction/server": patch
"@memberjunction/graphql-dataprovider": patch
"@memberjunction/ng-livekit-room": patch
"@memberjunction/ng-mj-livekit-room": patch
"@memberjunction/ng-explorer-core": patch
---

Multi-agent rooms now take turns properly with full-duplex realtime models, and the Live Room doubles as an agent test bed.

- **Model-side addressing.** `IAddressedMatcher` gains a model-judged implementation next to the name-matching one. Full-duplex sessions get two host tools, `i_am_addressed` and `yield_turn`, because neither vendor offers a native signal. `TurnAddressing` (`Auto` | `ModelSide` | `Regex`) is selectable per session; `Auto` uses the model's judgement when the model reports the new `FullDuplex` capability (GPT-Live, Gemini 3.8 Live with always-on proactive audio) and name matching otherwise.
- **Floor discipline.** `MultiAgentRoomCoordinator` now grants hand-offs with a TTL (a third agent cannot jump in), keeps backchannels (short "mm-hm" acknowledgements) off the floor, lets a person's speech preempt the holder through the existing barge-in flush path while delegated work keeps running, and caps consecutive agent-to-agent turns (default 8, configurable). A new `FullDuplexTurnGate` enforces it on models that decide for themselves when to speak, so two agents never speak at once even if neither asks first.
- **Test bed.** New `GetLiveKitRoomTurnState` query and typed `GraphQLLiveKitClient.GetRoomTurnState`; new `mj-livekit-turn-state` widget; the Live Room gets per-agent turn mode and addressing pickers, roster badges and a live Turns panel (floor holder, hand-offs, backchannels, loop cap, event feed) that also works for a person who joins an existing room.
- **Tests.** A deterministic replay harness with twelve recorded room timelines asserts no overlapping agent speech, no run beyond the loop cap, humans always preempt and backchannels never take the floor.

No schema, metadata or CodeGen changes. Live-model behaviour of the host tools is not yet verified; see the "Multi-agent rooms" section of `plans/realtime/bridges-and-widget/LIVE-CALL-CHECKLIST.md`.
