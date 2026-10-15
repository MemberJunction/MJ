# @memberjunction/ng-realtime-channel-examples

## 6.2.0-edge.4

### Minor Changes

- 975948b: Realtime Channels v2, third phase: verb-level exposure policy, an Angular adapter that wraps an existing component as a channel, an opt-in DOM rasterizer, a sample game channel, and the channels guide. Existing channels, tool names and hosts are unchanged.

  `minor` because this branch edits `metadata/` earlier (see the first two phases) and adds two new packages. There is no migration and no new entity column.
  - **Verb results obey exposure** (`@memberjunction/ai-core-plus`, `@memberjunction/realtime-runtime`, `@memberjunction/ng-conversations`). A verb whose result carries what the channel holds declares `ReturnsChannelData: 'state' | 'pixels'` on its descriptor entry. When the channel's effective exposure is below that level the dispatcher, and the native-tool route for a channel mounted at start, refuse the whole call with `exposure_restricted` (policy, not redaction: the verb is refused whole and its result is never filtered); the check comes after `InvokableBy` and before parameter validation, so a malformed call cannot probe a withheld verb. The catalog note and the `exposure_changed` note list the verbs that are unavailable and why. New pure helpers `IsVerbWithheld`, `WithheldVerbs` and `DescribeWithheldVerb`; `BuildToolBackedVerbs` accepts a per-verb flag map. Remote Browser flags `GetPageText` and `AchieveGoal` (`'state'`) and `DescribePage` and `LocateElement` (`'pixels'`); the Interactive Component channel flags `GetDataState`, `Validate`, `IsDirty` and custom methods with a non-void return type (merged verb offers are withheld only when every offer is flagged). This replaces the earlier statement that exposure is not a redaction layer over verb results.
  - **`AngularComponentChannel<TComponent>`** (new package `@memberjunction/ng-realtime-channels`). Wraps an existing Angular component as a channel surface without rewriting it: a descriptor plus `ReadSurfaceState`, `ApplySurfaceVerb` and `SurfaceEvents`, and optional `OnSurfaceOpen`, `SurfaceCompletion`, `OnSurfaceBound` and `SurfaceElement`. It owns binding and unbinding, change-driven perception (an event emitted while the agent's verb runs is attributed to the agent), verb resolution, validation and serialization, completion, state of record, and pictures. A verb that arrives before the surface exists waits, bounded (5 s), for the real component and otherwise fails with `surface_unavailable`; it neither runs against a hidden instance nor is acknowledged and applied later.
  - **Opt-in DOM rasterizer** (`@memberjunction/ng-realtime-channels`). `EnableChannelFrameCapture()` registers a bounded `html-to-image` based capturer (3000 nodes, 4 s, one capture at a time, 1024 px longest edge, no web fonts) that fails soft and turns itself off after repeated or unrecoverable failures, logging one reason. Core ships none by default; Explorer opts in (`@memberjunction/ng-explorer-app`), and the Interactive Component channel sources pictures only while the user allows pixels and a video track is up. `InteractiveComponentFrameCapture` is now `ChannelFrameCapture` in the new package, and `html-to-image` moved with it.
  - **Sample channel** (new package `@memberjunction/ng-realtime-channel-examples`). A tic-tac-toe channel built only through the adapter, not a dependency of anything and loaded only when a host imports it, with tests that play whole games (user win, agent win, draw) against the real component with interleaved user clicks and agent verbs, plus collapse and re-expand, resume, exposure and pictures.
  - **Guide.** `guides/REALTIME_CHANNELS_GUIDE.md` (indexed in `guides/README.md`): the contract, writing a channel from scratch, wrapping a component, scoping, opening on demand, visual perception, the Interactive Component channel, publishing from an Open App, and testing.
  - **Per-verb timeout in the adapter** (`@memberjunction/ng-realtime-channels`). `AngularComponentChannel.VerbTimeoutMs` (15 s, overridable) bounds `ApplySurfaceVerb`. On timeout the call fails with `verb_timeout` and a message the agent can act on, the serialized queue is released and the timeout is logged once with the channel and verb. A late result is never delivered, a late failure is logged, and a late success is recorded as a change so the next perception note shows the real state; nothing is rolled back.
  - **Generic `ClientOnlyChannelServer`** (`@memberjunction/ai-agents`, loaded by `@memberjunction/server`). `MJ: AI Agent Channels.ServerPluginClass` is required, so a channel that runs entirely in the browser sets it to `ClientOnlyChannelServer` instead of writing an empty plugin. It takes its channel name from the registry row, contributes no server tools and does not rewrite saves. `InteractiveComponentChannelServer` and `IdentityVerificationChannelServer` are now thin subclasses of it that keep their existing registry keys and behavior.

### Patch Changes

- Updated dependencies [96d6ec2]
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [e4c355e]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [bb3028a]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [91be34f]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [8bac4d6]
- Updated dependencies [1c9ac95]
- Updated dependencies [4fb501e]
- Updated dependencies [2de7fe0]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [ae78a45]
- Updated dependencies [8704df6]
- Updated dependencies [b2f8b5b]
- Updated dependencies [5345e3d]
- Updated dependencies [dcfdda4]
- Updated dependencies [d714f25]
- Updated dependencies [a35b50f]
- Updated dependencies [3e7f8c8]
- Updated dependencies [4889ca0]
- Updated dependencies [ca2791b]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [891dc77]
- Updated dependencies [0a952ee]
- Updated dependencies [72827e6]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [18c66ce]
- Updated dependencies [84fc9d4]
- Updated dependencies [6328ed3]
- Updated dependencies [b3db2aa]
- Updated dependencies [6c8798b]
- Updated dependencies [b6b3990]
- Updated dependencies [20d1f4a]
- Updated dependencies [f0c78c3]
- Updated dependencies [6a19f78]
- Updated dependencies [74d9357]
- Updated dependencies [a5b4a72]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [44428b5]
- Updated dependencies [1b8791e]
- Updated dependencies [02bb563]
- Updated dependencies [c26b355]
- Updated dependencies [afe9eb4]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/realtime-runtime@6.2.0-edge.4
  - @memberjunction/ng-realtime-channels@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
