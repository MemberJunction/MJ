# @memberjunction/ai-form-builder

## 6.3.0-edge.0

### Patch Changes

- Updated dependencies [2cc0cb9]
- Updated dependencies [62eca59]
- Updated dependencies [4d2c52d]
- Updated dependencies [7ed32af]
- Updated dependencies [567d7b9]
- Updated dependencies [c07f654]
- Updated dependencies [9ec4dce]
- Updated dependencies [0d484c2]
- Updated dependencies [03bb8b6]
- Updated dependencies [a01e840]
- Updated dependencies [6555a44]
- Updated dependencies [3c4de2b]
- Updated dependencies [0ebebfe]
- Updated dependencies [16ac431]
- Updated dependencies [9eb002d]
- Updated dependencies [1dd1af1]
- Updated dependencies [87ac205]
- Updated dependencies [18bb8fa]
- Updated dependencies [6049806]
- Updated dependencies [3f95ef5]
- Updated dependencies [63636e0]
- Updated dependencies [abb285b]
- Updated dependencies [4884a47]
- Updated dependencies [5c3d369]
- Updated dependencies
- Updated dependencies [b2789ee]
- Updated dependencies [31cc053]
- Updated dependencies [2641e47]
- Updated dependencies [b332459]
- Updated dependencies [100b9c2]
- Updated dependencies [6bd8271]
- Updated dependencies [6fd9fb7]
- Updated dependencies [70b5e38]
- Updated dependencies [755b210]
- Updated dependencies [b5df80e]
- Updated dependencies [28cec7d]
- Updated dependencies [b9fda3f]
- Updated dependencies [b68d388]
- Updated dependencies [5c4fa7c]
- Updated dependencies [8c3c8a4]
- Updated dependencies [fbbc06a]
- Updated dependencies [7ace3ee]
- Updated dependencies [2b349b9]
- Updated dependencies [d87bb40]
- Updated dependencies [c889b72]
  - @memberjunction/ai-agents@6.3.0-edge.0
  - @memberjunction/core@6.3.0-edge.0
  - @memberjunction/core-entities@6.3.0-edge.0
  - @memberjunction/global@6.3.0-edge.0
  - @memberjunction/aiengine@6.3.0-edge.0
  - @memberjunction/actions@6.3.0-edge.0
  - @memberjunction/ai-core-plus@6.3.0-edge.0
  - @memberjunction/ai-engine-base@6.3.0-edge.0
  - @memberjunction/ai-prompts@6.3.0-edge.0
  - @memberjunction/interactive-component-types@6.3.0-edge.0

## 6.2.0

### Patch Changes

- 9a2d7cc: RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

  **Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

  `MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.

- b0b2cc9: Add Video Studio (`@memberjunction/video-studio-core`, `@memberjunction/video-studio`, `@memberjunction/video-studio-render-worker`), including the Video Studio orchestrator agent and its Pre-Production, Render, Critic, and Repair stages, deterministic G1–G6 quality gates and rubric scoring, optional spoken voiceover narration (`VideoNarrationSpec.Enabled`) with automatic `<audio>` track injection in `BuildRenderBundle`, the isolated HyperFrames render worker and `LocalWorker`, `Remote`, and `Docker` render drivers, the Video Studio application (`Productions`, `Brand Kits`, `Archetypes`) with a built-in `ng-conversations` right-side slide-in copilot pinned to the Video Studio agent, the `Video Production` artifact type and viewer plugin, the `Produce Video` action, and the `VideoStudio.SetupHealth` remote operation and setup health card. Add general `MJ: Brand Kits` (`@memberjunction/ng-brand-kits`) for shared palette, typography, logo, voice, and generation policy management. The Video Studio pages share one right-side slide-in (chat from the first open, the brief above the composer, Iterate on the same conversation), pages can hide the floating chat bubble with `SuppressChatOverlay` in their agent context, and `@memberjunction/ng-brand-kits` adds a brand kit creator with a live preview. Add video generation (`BaseVideoGenerator`, `AIVideoRunner`, the Black Forest Labs FLUX 3 video driver, the `Generate Video` action, and `Per Second` pricing unit support), pre-call generation spend-cap enforcement, and FLUX.2 Pro endpoint, polling, and reported-cost recording fixes. Generated assets are always disclosed in the viewer, inline preview, review notes, and manifest provenance, never stand in for data or `NeverInvent` items, and any integrity criterion failure or synthetic person violation blocks delivery even when repair rounds are exhausted.

  Add the `Consult` sub-agent chat-handling channel (`AIAgent.ChatHandlingOption`, `AIAgent.MaxSubAgentConsultRounds`, `AIAgentRelationship.ChatHandlingOption`), caller-chosen sub-agent configuration presets (`AIAgentRelationship.ConfigurationPresetID`), sub-agent consultation and `resumeRunId` resumption across child, related, parallel, and native sub-agent paths, and root escalation to `MJ: AI Agent Requests` when consult rounds are exhausted. Add peer-to-peer Sage transfers (`Handoff` step type, inline `mj-agent-handoff-card`, conversation ownership chrome, and `FollowHandoffs` messaging-adapter support). `SaveAgentRunMedia` now persists `FileID` on `MJ: AI Agent Run Medias` rows, the artifact viewer registers dedicated Video and Audio plugins, and `AgentScheduledJobDriver` forwards `ConfigurationID` when starting scheduled agent runs.

  Task graphs opted in through agent metadata (`enableTaskGraphs`) now run through `LoopAgentType` with merged prompt parameters and parent hierarchy cycle guards. Explicit `@Sage` mentions or clicking Return to Sage ends specialist agent continuity in every conversation. Follow-up messages to a continued specialist agent resolve that agent's own configuration preset rather than forwarding the conversation manager's preset. Typing a reply in the conversation thread resumes an open sub-agent consult escalated to the user, matching the requests dashboard flow. `ChatHandlingOption = 'Retry'` re-prompts the loop and returns a sub-agent's question to the parent as a result rather than ending the run, capped by the unproductive-retry limit. Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5, and Gemini 3.8 Flash now declare Image and File (and Gemini also Audio and Video) input modalities; Computer Use auto-select now picks Claude Opus 5.5 or Claude Fable 5.1 instead of the text-only fallback, which can change that feature's cost, and chat file attachments turn on for agents using these models. Also harden regex parsing in `@memberjunction/ai-form-builder` and `@memberjunction/database-designer-core` against polynomial backtracking (ReDoS).

  The Video Studio render worker requires Node >= 22 and system `ffmpeg` on `PATH`; the `Docker` render driver is recommended for production deployments.

- Updated dependencies [0d81c53]
- Updated dependencies [abf8778]
- Updated dependencies [ddcd666]
- Updated dependencies [0cc6b08]
- Updated dependencies [622f166]
- Updated dependencies [68bb7e4]
- Updated dependencies [ca853fc]
- Updated dependencies [f555162]
- Updated dependencies [54f6563]
- Updated dependencies [043f418]
- Updated dependencies [1419ba7]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [96d6ec2]
- Updated dependencies [fd780a9]
- Updated dependencies [a709bb6]
- Updated dependencies [39b35f1]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [3fbda62]
- Updated dependencies [eaa9455]
- Updated dependencies [51c469d]
- Updated dependencies [ff00d60]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [a50948e]
- Updated dependencies [2552b1e]
- Updated dependencies [25bb295]
- Updated dependencies [432cb73]
- Updated dependencies [3080e83]
- Updated dependencies [4c6a28b]
- Updated dependencies [c93c0f8]
- Updated dependencies [6c36fb6]
- Updated dependencies [b518dfa]
- Updated dependencies [0eeb89d]
- Updated dependencies [ecf36eb]
- Updated dependencies [52b9fd5]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [822ed69]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [1da00cb]
- Updated dependencies [d43d86e]
- Updated dependencies [bd0ee83]
- Updated dependencies [fd2a410]
- Updated dependencies [0dbd455]
- Updated dependencies [a3539d2]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [91cba84]
- Updated dependencies [b14c72f]
- Updated dependencies [cc41d33]
- Updated dependencies [281724a]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [660ef45]
- Updated dependencies [5e4205c]
- Updated dependencies [10c2311]
- Updated dependencies [8fd1c46]
- Updated dependencies [5da3ad2]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [7be1684]
- Updated dependencies [db50c6b]
- Updated dependencies [afc1e0e]
- Updated dependencies [21f9e15]
- Updated dependencies [1090caa]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [81aea34]
- Updated dependencies [7384dd6]
- Updated dependencies [6849b00]
- Updated dependencies [67f6c85]
- Updated dependencies [ac9b00b]
- Updated dependencies [eb3a8d3]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [b1a656b]
- Updated dependencies [953086f]
- Updated dependencies [e8e6cd6]
- Updated dependencies [142d524]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [e1dd673]
- Updated dependencies [672b4c6]
- Updated dependencies [f3c6161]
- Updated dependencies [0e5ad68]
- Updated dependencies [01fafc6]
- Updated dependencies [9b8a84e]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [50ba290]
- Updated dependencies [ffb3c0f]
- Updated dependencies [d122a41]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [0ff7523]
- Updated dependencies [520bd09]
- Updated dependencies [520bd09]
- Updated dependencies [64b6fa5]
- Updated dependencies [d86bcbc]
- Updated dependencies [307da67]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [af6f892]
- Updated dependencies [aaf74ca]
- Updated dependencies [a65dfb8]
- Updated dependencies [7110019]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [ef43cf3]
- Updated dependencies [6e6e3f1]
- Updated dependencies [b03a928]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [b44c7cf]
- Updated dependencies [0d61b53]
- Updated dependencies [0ab85d7]
- Updated dependencies [9d1eb6a]
- Updated dependencies [0c634ba]
- Updated dependencies [a6f8c1c]
- Updated dependencies [432fe69]
- Updated dependencies [56d7614]
- Updated dependencies [223669e]
- Updated dependencies [683f652]
- Updated dependencies [26c0178]
- Updated dependencies [e3db74f]
- Updated dependencies [594f2e0]
- Updated dependencies [914e6ff]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [7316ac3]
- Updated dependencies [4c682c1]
- Updated dependencies [2274f42]
- Updated dependencies [9ce7cf4]
- Updated dependencies [0fb3649]
- Updated dependencies [131f3c4]
- Updated dependencies [896334a]
- Updated dependencies [861cbf0]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [5fed75a]
- Updated dependencies [e51ce8a]
- Updated dependencies [4c0eaec]
- Updated dependencies [1cb1d52]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [1d43161]
- Updated dependencies [bbca6b6]
- Updated dependencies [f3fa01e]
- Updated dependencies [0a75bb2]
- Updated dependencies [f26084f]
- Updated dependencies [08a4cfc]
- Updated dependencies [542795b]
- Updated dependencies [3276daa]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [7658d68]
- Updated dependencies [7110019]
- Updated dependencies [f2a4171]
- Updated dependencies [e482249]
- Updated dependencies [37e2f6b]
- Updated dependencies [6779eed]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [fcc3f03]
- Updated dependencies [6d5c6ad]
- Updated dependencies [29b6ec3]
- Updated dependencies [0b406e8]
- Updated dependencies [1141164]
- Updated dependencies [44faf83]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [c018cb9]
- Updated dependencies [80905a1]
- Updated dependencies [d0cea53]
- Updated dependencies [4c97994]
- Updated dependencies [397ae9a]
- Updated dependencies [08b3d7b]
- Updated dependencies [35d3c95]
- Updated dependencies [7e72c86]
- Updated dependencies [dbc3462]
- Updated dependencies [b545842]
- Updated dependencies [0cc6b08]
- Updated dependencies [a17a228]
- Updated dependencies [6b08ebf]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ee1f0d9]
- Updated dependencies [ce758af]
- Updated dependencies [89a5b59]
- Updated dependencies [2a7a098]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [7177e09]
- Updated dependencies [8704df6]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [24ddecc]
- Updated dependencies [45359c6]
- Updated dependencies [d7e95b9]
- Updated dependencies [373b180]
- Updated dependencies [6b0de38]
- Updated dependencies [aee2d53]
- Updated dependencies [8420f36]
- Updated dependencies [8ed4049]
- Updated dependencies [f0c78c3]
- Updated dependencies [4ef13d6]
- Updated dependencies [72dd65c]
- Updated dependencies [25f7b82]
- Updated dependencies [8b90b41]
- Updated dependencies [35ed7b5]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [02bb563]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [68f5c01]
- Updated dependencies [a66f4b0]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [1d29837]
- Updated dependencies [14e2a3a]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [8c120db]
- Updated dependencies [57096ab]
- Updated dependencies [bea2386]
- Updated dependencies [9a2d7cc]
- Updated dependencies [bb33c77]
- Updated dependencies [3ab85f9]
- Updated dependencies [aac148b]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [f2f6f4b]
- Updated dependencies [a28ce42]
- Updated dependencies [17a4137]
- Updated dependencies [bc0e36f]
- Updated dependencies [b4afc13]
- Updated dependencies [36a3f9e]
- Updated dependencies [539dfe3]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [d13cf6b]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [4840fff]
- Updated dependencies [ec97ad4]
- Updated dependencies [0e5a4cd]
- Updated dependencies [e962151]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [57fea6a]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [1ba9315]
- Updated dependencies [e1f2583]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [2854a2e]
- Updated dependencies [28df136]
- Updated dependencies [d2ccfef]
- Updated dependencies [b0b2cc9]
- Updated dependencies [dc38250]
- Updated dependencies [c4993f3]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0
  - @memberjunction/ai-agents@6.2.0
  - @memberjunction/ai-prompts@6.2.0
  - @memberjunction/aiengine@6.2.0
  - @memberjunction/ai-core-plus@6.2.0
  - @memberjunction/actions@6.2.0
  - @memberjunction/global@6.2.0
  - @memberjunction/ai-engine-base@6.2.0
  - @memberjunction/core@6.2.0
  - @memberjunction/interactive-component-types@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [6849b00]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [9ce7cf4]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [e69634e]
- Updated dependencies [373b180]
- Updated dependencies [539dfe3]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/core-entities@6.2.0-edge.8
  - @memberjunction/aiengine@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/actions@6.2.0-edge.8
  - @memberjunction/ai-core-plus@6.2.0-edge.8
  - @memberjunction/ai-agents@6.2.0-edge.8
  - @memberjunction/ai-prompts@6.2.0-edge.8
  - @memberjunction/ai-engine-base@6.2.0-edge.8
  - @memberjunction/interactive-component-types@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- 9a2d7cc: RunView's `TotalRowCount` contract is now explicit: a number is always a real total, and `undefined` means the caller passed `SkipTotalRowCount: true`.

  **Contract change.** `RunViewResult.TotalRowCount` is now optional (`TotalRowCount?: number`). With `SkipTotalRowCount: true` it is always `undefined`, including on a page that was not full, where it used to be the number of rows returned. A caller that needs a total must not pass the flag. Strict TypeScript consumers that read the field will see a compile error; a call without the flag always gets a number, so `?? 0` is safe there. `ResultType: 'count_only'` ignores the flag and always counts.

  `MaxRows: 1` is no longer special-cased: a full page of one row now runs the same count as any other full page and reports the real total. Callers that only read `Results` should pass `SkipTotalRowCount: true` to avoid that second query; about 270 such reads in this repo now do. `SkipTotalRowCount` is now sent over GraphQL, so browser callers can use it too.

- b0b2cc9: Add Video Studio (`@memberjunction/video-studio-core`, `@memberjunction/video-studio`, `@memberjunction/video-studio-render-worker`), including the Video Studio orchestrator agent and its Pre-Production, Render, Critic, and Repair stages, deterministic G1–G6 quality gates and rubric scoring, optional spoken voiceover narration (`VideoNarrationSpec.Enabled`) with automatic `<audio>` track injection in `BuildRenderBundle`, the isolated HyperFrames render worker and `LocalWorker`, `Remote`, and `Docker` render drivers, the Video Studio application (`Productions`, `Brand Kits`, `Archetypes`) with a built-in `ng-conversations` right-side slide-in copilot pinned to the Video Studio agent, the `Video Production` artifact type and viewer plugin, the `Produce Video` action, and the `VideoStudio.SetupHealth` remote operation and setup health card. Add general `MJ: Brand Kits` (`@memberjunction/ng-brand-kits`) for shared palette, typography, logo, voice, and generation policy management. The Video Studio pages share one right-side slide-in (chat from the first open, the brief above the composer, Iterate on the same conversation), pages can hide the floating chat bubble with `SuppressChatOverlay` in their agent context, and `@memberjunction/ng-brand-kits` adds a brand kit creator with a live preview. Add video generation (`BaseVideoGenerator`, `AIVideoRunner`, the Black Forest Labs FLUX 3 video driver, the `Generate Video` action, and `Per Second` pricing unit support), pre-call generation spend-cap enforcement, and FLUX.2 Pro endpoint, polling, and reported-cost recording fixes. Generated assets are always disclosed in the viewer, inline preview, review notes, and manifest provenance, never stand in for data or `NeverInvent` items, and any integrity criterion failure or synthetic person violation blocks delivery even when repair rounds are exhausted.

  Add the `Consult` sub-agent chat-handling channel (`AIAgent.ChatHandlingOption`, `AIAgent.MaxSubAgentConsultRounds`, `AIAgentRelationship.ChatHandlingOption`), caller-chosen sub-agent configuration presets (`AIAgentRelationship.ConfigurationPresetID`), sub-agent consultation and `resumeRunId` resumption across child, related, parallel, and native sub-agent paths, and root escalation to `MJ: AI Agent Requests` when consult rounds are exhausted. Add peer-to-peer Sage transfers (`Handoff` step type, inline `mj-agent-handoff-card`, conversation ownership chrome, and `FollowHandoffs` messaging-adapter support). `SaveAgentRunMedia` now persists `FileID` on `MJ: AI Agent Run Medias` rows, the artifact viewer registers dedicated Video and Audio plugins, and `AgentScheduledJobDriver` forwards `ConfigurationID` when starting scheduled agent runs.

  Task graphs opted in through agent metadata (`enableTaskGraphs`) now run through `LoopAgentType` with merged prompt parameters and parent hierarchy cycle guards. Explicit `@Sage` mentions or clicking Return to Sage ends specialist agent continuity in every conversation. Follow-up messages to a continued specialist agent resolve that agent's own configuration preset rather than forwarding the conversation manager's preset. Typing a reply in the conversation thread resumes an open sub-agent consult escalated to the user, matching the requests dashboard flow. `ChatHandlingOption = 'Retry'` re-prompts the loop and returns a sub-agent's question to the parent as a result rather than ending the run, capped by the unproductive-retry limit. Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5, and Gemini 3.8 Flash now declare Image and File (and Gemini also Audio and Video) input modalities; Computer Use auto-select now picks Claude Opus 5.5 or Claude Fable 5.1 instead of the text-only fallback, which can change that feature's cost, and chat file attachments turn on for agents using these models. Also harden regex parsing in `@memberjunction/ai-form-builder` and `@memberjunction/database-designer-core` against polynomial backtracking (ReDoS).

  The Video Studio render worker requires Node >= 22 and system `ffmpeg` on `PATH`; the `Docker` render driver is recommended for production deployments.

- Updated dependencies [54f6563]
- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [b1a656b]
- Updated dependencies [953086f]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [896334a]
- Updated dependencies [4c0eaec]
- Updated dependencies [bbca6b6]
- Updated dependencies [6779eed]
- Updated dependencies [0b406e8]
- Updated dependencies [c018cb9]
- Updated dependencies [397ae9a]
- Updated dependencies [89a5b59]
- Updated dependencies [d7e95b9]
- Updated dependencies [6b0de38]
- Updated dependencies [4ef13d6]
- Updated dependencies [8b90b41]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [b0b2cc9]
  - @memberjunction/ai-agents@6.2.0-edge.7
  - @memberjunction/actions@6.2.0-edge.7
  - @memberjunction/ai-core-plus@6.2.0-edge.7
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/aiengine@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/ai-engine-base@6.2.0-edge.7
  - @memberjunction/ai-prompts@6.2.0-edge.7
  - @memberjunction/interactive-component-types@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [622f166]
- Updated dependencies [68bb7e4]
- Updated dependencies [4c6a28b]
- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [d43d86e]
- Updated dependencies [cc41d33]
- Updated dependencies [281724a]
- Updated dependencies [1090caa]
- Updated dependencies [f2248d5]
- Updated dependencies [e8e6cd6]
- Updated dependencies [142d524]
- Updated dependencies [0ff7523]
- Updated dependencies [a65dfb8]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [1141164]
- Updated dependencies [dae1d31]
- Updated dependencies [4c97994]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [68f5c01]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [33226e0]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/ai-core-plus@6.2.0-edge.6
  - @memberjunction/ai-agents@6.2.0-edge.6
  - @memberjunction/aiengine@6.2.0-edge.6
  - @memberjunction/core-entities@6.2.0-edge.6
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6
  - @memberjunction/ai-engine-base@6.2.0-edge.6
  - @memberjunction/ai-prompts@6.2.0-edge.6
  - @memberjunction/actions@6.2.0-edge.6
  - @memberjunction/interactive-component-types@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [fd780a9]
- Updated dependencies [39b35f1]
- Updated dependencies [3080e83]
- Updated dependencies [52b9fd5]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [db39145]
- Updated dependencies [b14c72f]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [db50c6b]
- Updated dependencies [afc1e0e]
- Updated dependencies [81aea34]
- Updated dependencies [ac9b00b]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [0ab85d7]
- Updated dependencies [9d1eb6a]
- Updated dependencies [0c634ba]
- Updated dependencies [223669e]
- Updated dependencies [2274f42]
- Updated dependencies [5fed75a]
- Updated dependencies [1cb1d52]
- Updated dependencies [542795b]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [fcc3f03]
- Updated dependencies [7e72c86]
- Updated dependencies [0cc6b08]
- Updated dependencies [4e4c82d]
- Updated dependencies [5fed75a]
- Updated dependencies [ce758af]
- Updated dependencies [2a7a098]
- Updated dependencies [8420f36]
- Updated dependencies [72dd65c]
- Updated dependencies [1d29837]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [e1f2583]
- Updated dependencies [dc38250]
  - @memberjunction/core-entities@6.2.0-edge.5
  - @memberjunction/ai-agents@6.2.0-edge.5
  - @memberjunction/ai-prompts@6.2.0-edge.5
  - @memberjunction/ai-core-plus@6.2.0-edge.5
  - @memberjunction/actions@6.2.0-edge.5
  - @memberjunction/ai-engine-base@6.2.0-edge.5
  - @memberjunction/aiengine@6.2.0-edge.5
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5
  - @memberjunction/interactive-component-types@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [51c469d]
- Updated dependencies [432cb73]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [822ed69]
- Updated dependencies [1da00cb]
- Updated dependencies [bd0ee83]
- Updated dependencies [fd2a410]
- Updated dependencies [0dbd455]
- Updated dependencies [49f26d9]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [64b6fa5]
- Updated dependencies [d86bcbc]
- Updated dependencies [af6f892]
- Updated dependencies [aaf74ca]
- Updated dependencies [432fe69]
- Updated dependencies [7316ac3]
- Updated dependencies [4c682c1]
- Updated dependencies [08a4cfc]
- Updated dependencies [6d5c6ad]
- Updated dependencies [08b3d7b]
- Updated dependencies [35d3c95]
- Updated dependencies [dbc3462]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [7177e09]
- Updated dependencies [8704df6]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [45359c6]
- Updated dependencies [aee2d53]
- Updated dependencies [8ed4049]
- Updated dependencies [f0c78c3]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d0df5a1]
- Updated dependencies [d853bf8]
- Updated dependencies [02bb563]
- Updated dependencies [a66f4b0]
- Updated dependencies [90829e3]
- Updated dependencies [57096ab]
- Updated dependencies [aac148b]
- Updated dependencies [f2f6f4b]
- Updated dependencies [a28ce42]
- Updated dependencies [bc0e36f]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [d2ccfef]
  - @memberjunction/ai-agents@6.2.0-edge.4
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/ai-engine-base@6.2.0-edge.4
  - @memberjunction/aiengine@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ai-prompts@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/actions@6.2.0-edge.4
  - @memberjunction/interactive-component-types@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [0a75bb2]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [b545842]
- Updated dependencies [24ddecc]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [4840fff]
- Updated dependencies [ec97ad4]
- Updated dependencies [28df136]
- Updated dependencies [49e0bd8]
  - @memberjunction/aiengine@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-engine-base@6.2.0-edge.3
  - @memberjunction/ai-agents@6.2.0-edge.3
  - @memberjunction/ai-prompts@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/interactive-component-types@6.2.0-edge.3
  - @memberjunction/actions@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [ca853fc]
- Updated dependencies [f555162]
- Updated dependencies [043f418]
- Updated dependencies [e97d95c]
- Updated dependencies [ff3097d]
- Updated dependencies [79279f2]
- Updated dependencies [3fbda62]
- Updated dependencies [eaa9455]
- Updated dependencies [ff00d60]
- Updated dependencies [2552b1e]
- Updated dependencies [660ef45]
- Updated dependencies [8fd1c46]
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [672b4c6]
- Updated dependencies [f3c6161]
- Updated dependencies [0e5ad68]
- Updated dependencies [01fafc6]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [50ba290]
- Updated dependencies [ffb3c0f]
- Updated dependencies [0adaf76]
- Updated dependencies [ef43cf3]
- Updated dependencies [b03a928]
- Updated dependencies [b44c7cf]
- Updated dependencies [0d61b53]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [861cbf0]
- Updated dependencies [705ab4e]
- Updated dependencies [e51ce8a]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [f3fa01e]
- Updated dependencies [3276daa]
- Updated dependencies [d0cea53]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [14e2a3a]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [bb33c77]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-agents@6.2.0-edge.2
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai-prompts@6.2.0-edge.2
  - @memberjunction/aiengine@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/actions@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/ai-engine-base@6.2.0-edge.2
  - @memberjunction/interactive-component-types@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- Updated dependencies [ddcd666]
- Updated dependencies [a50948e]
- Updated dependencies [0eeb89d]
- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [5da3ad2]
- Updated dependencies [67f6c85]
- Updated dependencies [eb3a8d3]
- Updated dependencies [e1dd673]
- Updated dependencies [9b8a84e]
- Updated dependencies [520bd09]
- Updated dependencies [520bd09]
- Updated dependencies [307da67]
- Updated dependencies [7110019]
- Updated dependencies [a7da50b]
- Updated dependencies [1d43161]
- Updated dependencies [7110019]
- Updated dependencies [f2a4171]
- Updated dependencies [e482249]
- Updated dependencies [37e2f6b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
- Updated dependencies [6b08ebf]
- Updated dependencies [c4993f3]
  - @memberjunction/aiengine@6.2.0-edge.1
  - @memberjunction/core-entities@6.2.0-edge.1
  - @memberjunction/ai-agents@6.2.0-edge.1
  - @memberjunction/ai-core-plus@6.2.0-edge.1
  - @memberjunction/ai-prompts@6.2.0-edge.1
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/actions@6.2.0-edge.1
  - @memberjunction/global@6.2.0-edge.1
  - @memberjunction/interactive-component-types@6.2.0-edge.1
  - @memberjunction/ai-engine-base@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [abf8778]
- Updated dependencies [38c4a81]
- Updated dependencies [e51296c]
- Updated dependencies [b518dfa]
- Updated dependencies [37891d3]
- Updated dependencies [6ad6434]
- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [d122a41]
- Updated dependencies [6e6e3f1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [e3db74f]
- Updated dependencies [a8be410]
- Updated dependencies [b87e4ac]
- Updated dependencies [d665a6e]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [7658d68]
- Updated dependencies [44faf83]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8a5d2c0]
- Updated dependencies [e962151]
- Updated dependencies [2c590b0]
  - @memberjunction/ai-agents@6.2.0-edge.0
  - @memberjunction/aiengine@6.2.0-edge.0
  - @memberjunction/core-entities@6.2.0-edge.0
  - @memberjunction/ai-prompts@6.2.0-edge.0
  - @memberjunction/ai-core-plus@6.2.0-edge.0
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/actions@6.2.0-edge.0
  - @memberjunction/ai-engine-base@6.2.0-edge.0
  - @memberjunction/interactive-component-types@6.2.0-edge.0
  - @memberjunction/global@6.2.0-edge.0

## 6.1.0

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [634aa8c]
- Updated dependencies [834f8d7]
- Updated dependencies [a987913]
- Updated dependencies [e533ce5]
- Updated dependencies [b1b24d7]
- Updated dependencies [2c826f7]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [b7819d2]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [4586215]
- Updated dependencies [22ec804]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [8206993]
- Updated dependencies [1a2ce13]
- Updated dependencies [0d3094c]
- Updated dependencies [255d506]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [1940a4d]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [711c208]
- Updated dependencies [e2ad3c0]
- Updated dependencies [5ecfdb4]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [59def38]
- Updated dependencies [2412415]
- Updated dependencies [06ccfb2]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [43f9133]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2cc08e1]
- Updated dependencies [a5f92d2]
- Updated dependencies [2d14c62]
- Updated dependencies [394d276]
- Updated dependencies [c996a56]
- Updated dependencies [de6eb14]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [8ec1515]
- Updated dependencies [9a905e8]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [1fa6f6b]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [394d276]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [080f4cd]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [c643ba3]
- Updated dependencies [e9e9873]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [be0bdb2]
- Updated dependencies [a723521]
- Updated dependencies [5f33ca8]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [48ff99f]
- Updated dependencies [076fa5d]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [23c2521]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [9fc0e2d]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [0db4f4f]
- Updated dependencies [53d256f]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [9a29da4]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [1100077]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [0db6105]
- Updated dependencies [d7feeae]
- Updated dependencies [7fefca2]
- Updated dependencies [a1a8989]
- Updated dependencies [29c3dc8]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [ca3657d]
- Updated dependencies [394d276]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [5c6e36c]
- Updated dependencies [d8adda1]
- Updated dependencies [d078c54]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
- Updated dependencies [ca4feb4]
- Updated dependencies [394d276]
- Updated dependencies [1c0d586]
  - @memberjunction/actions@6.1.0
  - @memberjunction/ai-core-plus@6.1.0
  - @memberjunction/ai-agents@6.1.0
  - @memberjunction/global@6.1.0
  - @memberjunction/core@6.1.0
  - @memberjunction/core-entities@6.1.0
  - @memberjunction/aiengine@6.1.0
  - @memberjunction/ai-engine-base@6.1.0
  - @memberjunction/ai-prompts@6.1.0
  - @memberjunction/interactive-component-types@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [a987913]
- Updated dependencies [61b5612]
- Updated dependencies [ee15cf7]
- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [076fa5d]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [4cdfdcf]
- Updated dependencies [35ace7c]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core-entities@6.1.0-edge.7
  - @memberjunction/ai-engine-base@6.1.0-edge.7
  - @memberjunction/aiengine@6.1.0-edge.7
  - @memberjunction/ai-agents@6.1.0-edge.7
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/ai-prompts@6.1.0-edge.7
  - @memberjunction/ai-core-plus@6.1.0-edge.7
  - @memberjunction/global@6.1.0-edge.7
  - @memberjunction/actions@6.1.0-edge.7
  - @memberjunction/interactive-component-types@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- Updated dependencies [634aa8c]
- Updated dependencies [2c826f7]
- Updated dependencies [b7819d2]
- Updated dependencies [197fdf8]
- Updated dependencies [f6a4341]
- Updated dependencies [67e4c9e]
- Updated dependencies [0d3094c]
- Updated dependencies [0ec1980]
- Updated dependencies [43f9133]
- Updated dependencies [2cc08e1]
- Updated dependencies [2d14c62]
- Updated dependencies [b9de989]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [e9e9873]
- Updated dependencies [a723521]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [0677595]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [c11f8c6]
- Updated dependencies [1748491]
- Updated dependencies [0db6105]
- Updated dependencies [7fefca2]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ai-core-plus@6.1.0-edge.6
  - @memberjunction/ai-agents@6.1.0-edge.6
  - @memberjunction/aiengine@6.1.0-edge.6
  - @memberjunction/core-entities@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6
  - @memberjunction/actions@6.1.0-edge.6
  - @memberjunction/ai-engine-base@6.1.0-edge.6
  - @memberjunction/ai-prompts@6.1.0-edge.6
  - @memberjunction/interactive-component-types@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [b1b24d7]
- Updated dependencies [c42c0e8]
- Updated dependencies [79483bf]
- Updated dependencies [22ec804]
- Updated dependencies [8206993]
- Updated dependencies [1a2ce13]
- Updated dependencies [1940a4d]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [5f33ca8]
- Updated dependencies [23c2521]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [29c3dc8]
- Updated dependencies [905820a]
  - @memberjunction/aiengine@6.1.0-edge.5
  - @memberjunction/core-entities@6.1.0-edge.5
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/ai-agents@6.1.0-edge.5
  - @memberjunction/ai-core-plus@6.1.0-edge.5
  - @memberjunction/ai-engine-base@6.1.0-edge.5
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ai-prompts@6.1.0-edge.5
  - @memberjunction/actions@6.1.0-edge.5
  - @memberjunction/interactive-component-types@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e533ce5]
- Updated dependencies [4586215]
- Updated dependencies [e2ad3c0]
- Updated dependencies [a5f92d2]
- Updated dependencies [de6eb14]
- Updated dependencies [1fa6f6b]
- Updated dependencies [00a2483]
- Updated dependencies [8f199e2]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [0db4f4f]
- Updated dependencies [a1a8989]
- Updated dependencies [d078c54]
  - @memberjunction/aiengine@6.1.0-edge.4
  - @memberjunction/core-entities@6.1.0-edge.4
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ai-agents@6.1.0-edge.4
  - @memberjunction/ai-engine-base@6.1.0-edge.4
  - @memberjunction/ai-core-plus@6.1.0-edge.4
  - @memberjunction/ai-prompts@6.1.0-edge.4
  - @memberjunction/actions@6.1.0-edge.4
  - @memberjunction/interactive-component-types@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [199eb2b]
- Updated dependencies [e7f1f88]
- Updated dependencies [07cb22e]
- Updated dependencies [711c208]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [06ccfb2]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [8ec1515]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [d907a1b]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [c643ba3]
- Updated dependencies [be0bdb2]
- Updated dependencies [68b9cf0]
- Updated dependencies [2741d46]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [53d256f]
- Updated dependencies [f5ec13b]
- Updated dependencies [7a630ba]
- Updated dependencies [ca3657d]
- Updated dependencies [1bd9674]
- Updated dependencies [9f6a53b]
- Updated dependencies [6d7d3da]
- Updated dependencies [d0a2a55]
- Updated dependencies [4b1257f]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/core-entities@6.1.0-edge.3
  - @memberjunction/aiengine@6.1.0-edge.3
  - @memberjunction/ai-agents@6.1.0-edge.3
  - @memberjunction/ai-core-plus@6.1.0-edge.3
  - @memberjunction/ai-prompts@6.1.0-edge.3
  - @memberjunction/ai-engine-base@6.1.0-edge.3
  - @memberjunction/actions@6.1.0-edge.3
  - @memberjunction/interactive-component-types@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [255d506]
- Updated dependencies [5ecfdb4]
- Updated dependencies [59def38]
- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [9fc0e2d]
- Updated dependencies [fccd0b2]
- Updated dependencies [9a29da4]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [d8adda1]
- Updated dependencies [15319b4]
- Updated dependencies [ca4feb4]
- Updated dependencies [1c0d586]
  - @memberjunction/core-entities@6.1.0-edge.2
  - @memberjunction/ai-agents@6.1.0-edge.2
  - @memberjunction/actions@6.1.0-edge.2
  - @memberjunction/ai-core-plus@6.1.0-edge.2
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ai-engine-base@6.1.0-edge.2
  - @memberjunction/aiengine@6.1.0-edge.2
  - @memberjunction/ai-prompts@6.1.0-edge.2
  - @memberjunction/interactive-component-types@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/actions@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/core-entities@6.1.0-edge.1
  - @memberjunction/ai-agents@6.1.0-edge.1
  - @memberjunction/ai-core-plus@6.1.0-edge.1
  - @memberjunction/aiengine@6.1.0-edge.1
  - @memberjunction/ai-engine-base@6.1.0-edge.1
  - @memberjunction/ai-prompts@6.1.0-edge.1
  - @memberjunction/interactive-component-types@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [2412415]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [9a905e8]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
- Updated dependencies [1100077]
- Updated dependencies [5c6e36c]
  - @memberjunction/core-entities@6.1.0-edge.0
  - @memberjunction/actions@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/aiengine@6.1.0-edge.0
  - @memberjunction/interactive-component-types@6.1.0-edge.0
  - @memberjunction/ai-agents@6.1.0-edge.0
  - @memberjunction/ai-engine-base@6.1.0-edge.0
  - @memberjunction/ai-core-plus@6.1.0-edge.0
  - @memberjunction/ai-prompts@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ai-agents@6.0.0
  - @memberjunction/ai-engine-base@6.0.0
  - @memberjunction/ai-core-plus@6.0.0
  - @memberjunction/aiengine@6.0.0
  - @memberjunction/ai-prompts@6.0.0
  - @memberjunction/actions@6.0.0
  - @memberjunction/interactive-component-types@6.0.0
  - @memberjunction/core-entities@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [c382605]
- Updated dependencies [a8fc549]
  - @memberjunction/ai-agents@5.51.0
  - @memberjunction/core@5.51.0
  - @memberjunction/ai-engine-base@5.51.0
  - @memberjunction/ai-core-plus@5.51.0
  - @memberjunction/aiengine@5.51.0
  - @memberjunction/ai-prompts@5.51.0
  - @memberjunction/actions@5.51.0
  - @memberjunction/interactive-component-types@5.51.0
  - @memberjunction/core-entities@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [938ae80]
- Updated dependencies [623dfc5]
- Updated dependencies [8ce3356]
- Updated dependencies [12691e3]
- Updated dependencies [1afdc40]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [764d6f6]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core-entities@5.50.0
  - @memberjunction/core@5.50.0
  - @memberjunction/ai-agents@5.50.0
  - @memberjunction/ai-core-plus@5.50.0
  - @memberjunction/ai-prompts@5.50.0
  - @memberjunction/ai-engine-base@5.50.0
  - @memberjunction/aiengine@5.50.0
  - @memberjunction/actions@5.50.0
  - @memberjunction/interactive-component-types@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [7db8ef5]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [b52ffa8]
- Updated dependencies [85575cf]
- Updated dependencies [5473e9a]
- Updated dependencies [bc388e3]
- Updated dependencies [373c5f6]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/ai-agents@5.49.0
  - @memberjunction/ai-core-plus@5.49.0
  - @memberjunction/ai-prompts@5.49.0
  - @memberjunction/core-entities@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/actions@5.49.0
  - @memberjunction/ai-engine-base@5.49.0
  - @memberjunction/aiengine@5.49.0
  - @memberjunction/interactive-component-types@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
- Updated dependencies [2143b98]
- Updated dependencies [f613d0d]
  - @memberjunction/core@5.48.0
  - @memberjunction/ai-agents@5.48.0
  - @memberjunction/core-entities@5.48.0
  - @memberjunction/ai-engine-base@5.48.0
  - @memberjunction/ai-core-plus@5.48.0
  - @memberjunction/aiengine@5.48.0
  - @memberjunction/ai-prompts@5.48.0
  - @memberjunction/actions@5.48.0
  - @memberjunction/interactive-component-types@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ai-agents@5.47.0
  - @memberjunction/ai-engine-base@5.47.0
  - @memberjunction/ai-core-plus@5.47.0
  - @memberjunction/aiengine@5.47.0
  - @memberjunction/ai-prompts@5.47.0
  - @memberjunction/actions@5.47.0
  - @memberjunction/interactive-component-types@5.47.0
  - @memberjunction/core-entities@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
- Updated dependencies [33741fc]
- Updated dependencies [ef3e802]
  - @memberjunction/core@5.46.0
  - @memberjunction/core-entities@5.46.0
  - @memberjunction/ai-engine-base@5.46.0
  - @memberjunction/aiengine@5.46.0
  - @memberjunction/ai-agents@5.46.0
  - @memberjunction/ai-prompts@5.46.0
  - @memberjunction/ai-core-plus@5.46.0
  - @memberjunction/actions@5.46.0
  - @memberjunction/interactive-component-types@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- Updated dependencies [572d219]
  - @memberjunction/ai-core-plus@5.45.1
  - @memberjunction/ai-agents@5.45.1
  - @memberjunction/ai-engine-base@5.45.1
  - @memberjunction/aiengine@5.45.1
  - @memberjunction/ai-prompts@5.45.1
  - @memberjunction/actions@5.45.1
  - @memberjunction/interactive-component-types@5.45.1
  - @memberjunction/core@5.45.1
  - @memberjunction/core-entities@5.45.1
  - @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [19ec4b0]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [6125dcd]
- Updated dependencies [ad9f4a3]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/ai-agents@5.45.0
  - @memberjunction/core-entities@5.45.0
  - @memberjunction/ai-engine-base@5.45.0
  - @memberjunction/aiengine@5.45.0
  - @memberjunction/ai-core-plus@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ai-prompts@5.45.0
  - @memberjunction/actions@5.45.0
  - @memberjunction/interactive-component-types@5.45.0

## 5.44.0

### Patch Changes

- Updated dependencies [eb38a42]
- Updated dependencies [3633fbb]
- Updated dependencies [d88568e]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [91842c3]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [be5ab50]
- Updated dependencies [aa9102d]
- Updated dependencies [2f926df]
- Updated dependencies [863a10d]
- Updated dependencies [2f9b863]
  - @memberjunction/ai-agents@5.44.0
  - @memberjunction/ai-engine-base@5.44.0
  - @memberjunction/ai-core-plus@5.44.0
  - @memberjunction/aiengine@5.44.0
  - @memberjunction/core-entities@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/global@5.44.0
  - @memberjunction/ai-prompts@5.44.0
  - @memberjunction/actions@5.44.0
  - @memberjunction/interactive-component-types@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [40eb4e0]
- Updated dependencies [aa21fef]
- Updated dependencies [9f6aa87]
- Updated dependencies [9200b13]
- Updated dependencies [ad8d8f1]
- Updated dependencies [a4cdfb0]
  - @memberjunction/core@5.43.0
  - @memberjunction/ai-agents@5.43.0
  - @memberjunction/global@5.43.0
  - @memberjunction/ai-core-plus@5.43.0
  - @memberjunction/actions@5.43.0
  - @memberjunction/ai-prompts@5.43.0
  - @memberjunction/core-entities@5.43.0
  - @memberjunction/ai-engine-base@5.43.0
  - @memberjunction/aiengine@5.43.0
  - @memberjunction/interactive-component-types@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [256ab06]
- Updated dependencies [c871a4d]
- Updated dependencies [9b9b484]
- Updated dependencies [d185a5c]
- Updated dependencies [e7c2437]
- Updated dependencies [37c73f6]
- Updated dependencies [0c6bf61]
- Updated dependencies [78f834d]
- Updated dependencies [4ec1732]
- Updated dependencies [008f449]
- Updated dependencies [2f225e4]
- Updated dependencies [6d970cd]
- Updated dependencies [0fa3cbc]
- Updated dependencies [da5a3dd]
  - @memberjunction/ai-agents@5.42.0
  - @memberjunction/ai-core-plus@5.42.0
  - @memberjunction/ai-prompts@5.42.0
  - @memberjunction/core@5.42.0
  - @memberjunction/actions@5.42.0
  - @memberjunction/aiengine@5.42.0
  - @memberjunction/core-entities@5.42.0
  - @memberjunction/global@5.42.0
  - @memberjunction/ai-engine-base@5.42.0
  - @memberjunction/interactive-component-types@5.42.0

## 5.41.0

### Patch Changes

- Updated dependencies [8fd6f59]
- Updated dependencies [6f227ab]
- Updated dependencies [2e48d1a]
- Updated dependencies [84089ae]
- Updated dependencies [cd6c5f0]
- Updated dependencies [8c8b658]
- Updated dependencies [659ee5b]
- Updated dependencies [cc604aa]
- Updated dependencies [15b743b]
- Updated dependencies [a5f5472]
- Updated dependencies [ddaa30e]
- Updated dependencies [1568bae]
- Updated dependencies [4b3fb9d]
  - @memberjunction/core@5.41.0
  - @memberjunction/core-entities@5.41.0
  - @memberjunction/ai-agents@5.41.0
  - @memberjunction/aiengine@5.41.0
  - @memberjunction/ai-engine-base@5.41.0
  - @memberjunction/ai-core-plus@5.41.0
  - @memberjunction/ai-prompts@5.41.0
  - @memberjunction/actions@5.41.0
  - @memberjunction/interactive-component-types@5.41.0
  - @memberjunction/global@5.41.0

## 5.40.2

### Patch Changes

- @memberjunction/ai-agents@5.40.2
- @memberjunction/ai-engine-base@5.40.2
- @memberjunction/ai-core-plus@5.40.2
- @memberjunction/aiengine@5.40.2
- @memberjunction/ai-prompts@5.40.2
- @memberjunction/actions@5.40.2
- @memberjunction/interactive-component-types@5.40.2
- @memberjunction/core@5.40.2
- @memberjunction/core-entities@5.40.2
- @memberjunction/global@5.40.2

## 5.40.1

### Patch Changes

- Updated dependencies [e50381b]
  - @memberjunction/core@5.40.1
  - @memberjunction/ai-agents@5.40.1
  - @memberjunction/ai-engine-base@5.40.1
  - @memberjunction/ai-core-plus@5.40.1
  - @memberjunction/aiengine@5.40.1
  - @memberjunction/ai-prompts@5.40.1
  - @memberjunction/actions@5.40.1
  - @memberjunction/interactive-component-types@5.40.1
  - @memberjunction/core-entities@5.40.1
  - @memberjunction/global@5.40.1

## 5.40.0

### Patch Changes

- Updated dependencies [804f9f6]
- Updated dependencies [73bb233]
- Updated dependencies [f2cca15]
- Updated dependencies [43e6c0f]
- Updated dependencies [253a188]
- Updated dependencies [6ea4de7]
  - @memberjunction/core@5.40.0
  - @memberjunction/core-entities@5.40.0
  - @memberjunction/ai-agents@5.40.0
  - @memberjunction/ai-engine-base@5.40.0
  - @memberjunction/ai-core-plus@5.40.0
  - @memberjunction/aiengine@5.40.0
  - @memberjunction/ai-prompts@5.40.0
  - @memberjunction/actions@5.40.0
  - @memberjunction/interactive-component-types@5.40.0
  - @memberjunction/global@5.40.0

## 5.39.0

### Patch Changes

- Updated dependencies [26761b8]
- Updated dependencies [3d4510c]
- Updated dependencies [361eb4c]
- Updated dependencies [f4bf584]
- Updated dependencies [3c53858]
- Updated dependencies [d1cc0ad]
- Updated dependencies [db4addf]
- Updated dependencies [8c39dd9]
- Updated dependencies [0f9acba]
- Updated dependencies [ae74fd5]
- Updated dependencies [a2aecc7]
- Updated dependencies [1b0f355]
- Updated dependencies [9bc2916]
- Updated dependencies [34fe6d1]
- Updated dependencies [a101a34]
  - @memberjunction/actions@5.39.0
  - @memberjunction/ai-agents@5.39.0
  - @memberjunction/core@5.39.0
  - @memberjunction/ai-core-plus@5.39.0
  - @memberjunction/core-entities@5.39.0
  - @memberjunction/ai-prompts@5.39.0
  - @memberjunction/global@5.39.0
  - @memberjunction/ai-engine-base@5.39.0
  - @memberjunction/aiengine@5.39.0
  - @memberjunction/interactive-component-types@5.39.0

## 5.38.0

### Patch Changes

- Updated dependencies [6b6c321]
- Updated dependencies [4ee0b06]
- Updated dependencies [30f598d]
- Updated dependencies [748b2e7]
- Updated dependencies [ce7d2f5]
- Updated dependencies [275afda]
- Updated dependencies [d285996]
- Updated dependencies [8bd97f3]
- Updated dependencies [6a3ac36]
- Updated dependencies [918d663]
- Updated dependencies [c0b40c0]
- Updated dependencies [b2e6782]
- Updated dependencies [d5a51b3]
- Updated dependencies [3d739a3]
- Updated dependencies [ebb0e3d]
  - @memberjunction/ai-agents@5.38.0
  - @memberjunction/ai-core-plus@5.38.0
  - @memberjunction/aiengine@5.38.0
  - @memberjunction/core@5.38.0
  - @memberjunction/core-entities@5.38.0
  - @memberjunction/global@5.38.0
  - @memberjunction/interactive-component-types@5.38.0
  - @memberjunction/ai-engine-base@5.38.0
  - @memberjunction/ai-prompts@5.38.0
  - @memberjunction/actions@5.38.0
