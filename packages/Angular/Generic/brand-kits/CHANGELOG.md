# @memberjunction/ng-brand-kits

## 6.3.0-edge.0

### Patch Changes

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
- Updated dependencies [a0079ce]
- Updated dependencies [0ebebfe]
- Updated dependencies [1b282a0]
- Updated dependencies [9eb002d]
- Updated dependencies [1dd1af1]
- Updated dependencies [87ac205]
- Updated dependencies [18bb8fa]
- Updated dependencies [6049806]
- Updated dependencies [63636e0]
- Updated dependencies [abb285b]
- Updated dependencies [4884a47]
- Updated dependencies [5c3d369]
- Updated dependencies [b2789ee]
- Updated dependencies [31cc053]
- Updated dependencies [2641e47]
- Updated dependencies [b332459]
- Updated dependencies [100b9c2]
- Updated dependencies [6bd8271]
- Updated dependencies [6fd9fb7]
- Updated dependencies [70b5e38]
- Updated dependencies [28cec7d]
- Updated dependencies [b68d388]
- Updated dependencies [5c4fa7c]
- Updated dependencies [8c3c8a4]
- Updated dependencies [fbbc06a]
- Updated dependencies [7ace3ee]
- Updated dependencies [2b349b9]
- Updated dependencies [d87bb40]
- Updated dependencies [c889b72]
  - @memberjunction/core@6.3.0-edge.0
  - @memberjunction/core-entities@6.3.0-edge.0
  - @memberjunction/ng-file-storage@6.3.0-edge.0
  - @memberjunction/global@6.3.0-edge.0
  - @memberjunction/ng-ui-components@6.3.0-edge.0
  - @memberjunction/graphql-dataprovider@6.3.0-edge.0
  - @memberjunction/ng-base-types@6.3.0-edge.0
  - @memberjunction/ng-media-player@6.3.0-edge.0
  - @memberjunction/ng-shared-generic@6.3.0-edge.0

## 6.2.0

### Minor Changes

- b0b2cc9: Add Video Studio (`@memberjunction/video-studio-core`, `@memberjunction/video-studio`, `@memberjunction/video-studio-render-worker`), including the Video Studio orchestrator agent and its Pre-Production, Render, Critic, and Repair stages, deterministic G1–G6 quality gates and rubric scoring, optional spoken voiceover narration (`VideoNarrationSpec.Enabled`) with automatic `<audio>` track injection in `BuildRenderBundle`, the isolated HyperFrames render worker and `LocalWorker`, `Remote`, and `Docker` render drivers, the Video Studio application (`Productions`, `Brand Kits`, `Archetypes`) with a built-in `ng-conversations` right-side slide-in copilot pinned to the Video Studio agent, the `Video Production` artifact type and viewer plugin, the `Produce Video` action, and the `VideoStudio.SetupHealth` remote operation and setup health card. Add general `MJ: Brand Kits` (`@memberjunction/ng-brand-kits`) for shared palette, typography, logo, voice, and generation policy management. The Video Studio pages share one right-side slide-in (chat from the first open, the brief above the composer, Iterate on the same conversation), pages can hide the floating chat bubble with `SuppressChatOverlay` in their agent context, and `@memberjunction/ng-brand-kits` adds a brand kit creator with a live preview. Add video generation (`BaseVideoGenerator`, `AIVideoRunner`, the Black Forest Labs FLUX 3 video driver, the `Generate Video` action, and `Per Second` pricing unit support), pre-call generation spend-cap enforcement, and FLUX.2 Pro endpoint, polling, and reported-cost recording fixes. Generated assets are always disclosed in the viewer, inline preview, review notes, and manifest provenance, never stand in for data or `NeverInvent` items, and any integrity criterion failure or synthetic person violation blocks delivery even when repair rounds are exhausted.

  Add the `Consult` sub-agent chat-handling channel (`AIAgent.ChatHandlingOption`, `AIAgent.MaxSubAgentConsultRounds`, `AIAgentRelationship.ChatHandlingOption`), caller-chosen sub-agent configuration presets (`AIAgentRelationship.ConfigurationPresetID`), sub-agent consultation and `resumeRunId` resumption across child, related, parallel, and native sub-agent paths, and root escalation to `MJ: AI Agent Requests` when consult rounds are exhausted. Add peer-to-peer Sage transfers (`Handoff` step type, inline `mj-agent-handoff-card`, conversation ownership chrome, and `FollowHandoffs` messaging-adapter support). `SaveAgentRunMedia` now persists `FileID` on `MJ: AI Agent Run Medias` rows, the artifact viewer registers dedicated Video and Audio plugins, and `AgentScheduledJobDriver` forwards `ConfigurationID` when starting scheduled agent runs.

  Task graphs opted in through agent metadata (`enableTaskGraphs`) now run through `LoopAgentType` with merged prompt parameters and parent hierarchy cycle guards. Explicit `@Sage` mentions or clicking Return to Sage ends specialist agent continuity in every conversation. Follow-up messages to a continued specialist agent resolve that agent's own configuration preset rather than forwarding the conversation manager's preset. Typing a reply in the conversation thread resumes an open sub-agent consult escalated to the user, matching the requests dashboard flow. `ChatHandlingOption = 'Retry'` re-prompts the loop and returns a sub-agent's question to the parent as a result rather than ending the run, capped by the unproductive-retry limit. Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5, and Gemini 3.8 Flash now declare Image and File (and Gemini also Audio and Video) input modalities; Computer Use auto-select now picks Claude Opus 5.5 or Claude Fable 5.1 instead of the text-only fallback, which can change that feature's cost, and chat file attachments turn on for agents using these models. Also harden regex parsing in `@memberjunction/ai-form-builder` and `@memberjunction/database-designer-core` against polynomial backtracking (ReDoS).

  The Video Studio render worker requires Node >= 22 and system `ffmpeg` on `PATH`; the `Docker` render driver is recommended for production deployments.

### Patch Changes

- Updated dependencies [0d81c53]
- Updated dependencies [1419ba7]
- Updated dependencies [a709bb6]
- Updated dependencies [39b35f1]
- Updated dependencies [d17de94]
- Updated dependencies [e97d95c]
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
- Updated dependencies [0eeb89d]
- Updated dependencies [ecf36eb]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [29129bd]
- Updated dependencies [1d6e3e8]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [d43d86e]
- Updated dependencies [b5955fb]
- Updated dependencies [d538c14]
- Updated dependencies [a3539d2]
- Updated dependencies [dde482c]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [0581392]
- Updated dependencies [91cba84]
- Updated dependencies [b14c72f]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [660ef45]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [7be1684]
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
- Updated dependencies [83486cf]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [4248fb3]
- Updated dependencies [e1dd673]
- Updated dependencies [f3c6161]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [8b62f8c]
- Updated dependencies [d122a41]
- Updated dependencies [490cd8d]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [307da67]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [ef43cf3]
- Updated dependencies [6e6e3f1]
- Updated dependencies [ea4080e]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [b44c7cf]
- Updated dependencies [0c634ba]
- Updated dependencies [a6f8c1c]
- Updated dependencies [08f8966]
- Updated dependencies [48c9cd2]
- Updated dependencies [56d7614]
- Updated dependencies [223669e]
- Updated dependencies [683f652]
- Updated dependencies [914e6ff]
- Updated dependencies [a8be410]
- Updated dependencies [7316ac3]
- Updated dependencies [2274f42]
- Updated dependencies [7e57b48]
- Updated dependencies [35ed364]
- Updated dependencies [9ce7cf4]
- Updated dependencies [0fb3649]
- Updated dependencies [131f3c4]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [5df9486]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [dd34a5c]
- Updated dependencies [5fed75a]
- Updated dependencies [4c0eaec]
- Updated dependencies [e225ece]
- Updated dependencies [1cb1d52]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [6779eed]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [29b6ec3]
- Updated dependencies [44faf83]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [80905a1]
- Updated dependencies [4c97994]
- Updated dependencies [397ae9a]
- Updated dependencies [08b3d7b]
- Updated dependencies [7e72c86]
- Updated dependencies [dbc3462]
- Updated dependencies [a17a228]
- Updated dependencies [6b08ebf]
- Updated dependencies [5fed75a]
- Updated dependencies [ee1f0d9]
- Updated dependencies [ce758af]
- Updated dependencies [89a5b59]
- Updated dependencies [1ea4085]
- Updated dependencies [aee2d53]
- Updated dependencies [279b93e]
- Updated dependencies [5e1e343]
- Updated dependencies [8420f36]
- Updated dependencies [f0c78c3]
- Updated dependencies [4ef13d6]
- Updated dependencies [25f7b82]
- Updated dependencies [8b90b41]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [db4e210]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [68f5c01]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [b1e628e]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [c35f7e5]
- Updated dependencies [8c120db]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [aac148b]
- Updated dependencies [0cc6b08]
- Updated dependencies [8d1a373]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [36a3f9e]
- Updated dependencies [539dfe3]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [920bef8]
- Updated dependencies [d046715]
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
- Updated dependencies [d0a8dbf]
- Updated dependencies [ec97ad4]
- Updated dependencies [b1b6d3d]
- Updated dependencies [0e5a4cd]
- Updated dependencies [291485d]
- Updated dependencies [b968642]
- Updated dependencies [af57e8d]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [e7b2ebc]
- Updated dependencies [e0cf9ed]
- Updated dependencies [da449bb]
- Updated dependencies [57fea6a]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [2854a2e]
- Updated dependencies [b0b2cc9]
- Updated dependencies [dc38250]
- Updated dependencies [49e0bd8]
  - @memberjunction/core-entities@6.2.0
  - @memberjunction/global@6.2.0
  - @memberjunction/core@6.2.0
  - @memberjunction/graphql-dataprovider@6.2.0
  - @memberjunction/ng-file-storage@6.2.0
  - @memberjunction/ng-shared-generic@6.2.0
  - @memberjunction/ng-ui-components@6.2.0
  - @memberjunction/ng-media-player@6.2.0
  - @memberjunction/ng-base-types@6.2.0

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
- Updated dependencies [dd34a5c]
- Updated dependencies [e69634e]
- Updated dependencies [539dfe3]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/core-entities@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/graphql-dataprovider@6.2.0-edge.8
  - @memberjunction/ng-base-types@6.2.0-edge.8
  - @memberjunction/ng-file-storage@6.2.0-edge.8
  - @memberjunction/ng-media-player@6.2.0-edge.8
  - @memberjunction/ng-shared-generic@6.2.0-edge.8
  - @memberjunction/ng-ui-components@6.2.0-edge.8

## 6.2.0-edge.7

### Minor Changes

- b0b2cc9: Add Video Studio (`@memberjunction/video-studio-core`, `@memberjunction/video-studio`, `@memberjunction/video-studio-render-worker`), including the Video Studio orchestrator agent and its Pre-Production, Render, Critic, and Repair stages, deterministic G1–G6 quality gates and rubric scoring, optional spoken voiceover narration (`VideoNarrationSpec.Enabled`) with automatic `<audio>` track injection in `BuildRenderBundle`, the isolated HyperFrames render worker and `LocalWorker`, `Remote`, and `Docker` render drivers, the Video Studio application (`Productions`, `Brand Kits`, `Archetypes`) with a built-in `ng-conversations` right-side slide-in copilot pinned to the Video Studio agent, the `Video Production` artifact type and viewer plugin, the `Produce Video` action, and the `VideoStudio.SetupHealth` remote operation and setup health card. Add general `MJ: Brand Kits` (`@memberjunction/ng-brand-kits`) for shared palette, typography, logo, voice, and generation policy management. The Video Studio pages share one right-side slide-in (chat from the first open, the brief above the composer, Iterate on the same conversation), pages can hide the floating chat bubble with `SuppressChatOverlay` in their agent context, and `@memberjunction/ng-brand-kits` adds a brand kit creator with a live preview. Add video generation (`BaseVideoGenerator`, `AIVideoRunner`, the Black Forest Labs FLUX 3 video driver, the `Generate Video` action, and `Per Second` pricing unit support), pre-call generation spend-cap enforcement, and FLUX.2 Pro endpoint, polling, and reported-cost recording fixes. Generated assets are always disclosed in the viewer, inline preview, review notes, and manifest provenance, never stand in for data or `NeverInvent` items, and any integrity criterion failure or synthetic person violation blocks delivery even when repair rounds are exhausted.

  Add the `Consult` sub-agent chat-handling channel (`AIAgent.ChatHandlingOption`, `AIAgent.MaxSubAgentConsultRounds`, `AIAgentRelationship.ChatHandlingOption`), caller-chosen sub-agent configuration presets (`AIAgentRelationship.ConfigurationPresetID`), sub-agent consultation and `resumeRunId` resumption across child, related, parallel, and native sub-agent paths, and root escalation to `MJ: AI Agent Requests` when consult rounds are exhausted. Add peer-to-peer Sage transfers (`Handoff` step type, inline `mj-agent-handoff-card`, conversation ownership chrome, and `FollowHandoffs` messaging-adapter support). `SaveAgentRunMedia` now persists `FileID` on `MJ: AI Agent Run Medias` rows, the artifact viewer registers dedicated Video and Audio plugins, and `AgentScheduledJobDriver` forwards `ConfigurationID` when starting scheduled agent runs.

  Task graphs opted in through agent metadata (`enableTaskGraphs`) now run through `LoopAgentType` with merged prompt parameters and parent hierarchy cycle guards. Explicit `@Sage` mentions or clicking Return to Sage ends specialist agent continuity in every conversation. Follow-up messages to a continued specialist agent resolve that agent's own configuration preset rather than forwarding the conversation manager's preset. Typing a reply in the conversation thread resumes an open sub-agent consult escalated to the user, matching the requests dashboard flow. `ChatHandlingOption = 'Retry'` re-prompts the loop and returns a sub-agent's question to the parent as a result rather than ending the run, capped by the unproductive-retry limit. Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5, and Gemini 3.8 Flash now declare Image and File (and Gemini also Audio and Video) input modalities; Computer Use auto-select now picks Claude Opus 5.5 or Claude Fable 5.1 instead of the text-only fallback, which can change that feature's cost, and chat file attachments turn on for agents using these models. Also harden regex parsing in `@memberjunction/ai-form-builder` and `@memberjunction/database-designer-core` against polynomial backtracking (ReDoS).

  The Video Studio render worker requires Node >= 22 and system `ffmpeg` on `PATH`; the `Docker` render driver is recommended for production deployments.

### Patch Changes

- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [08f8966]
- Updated dependencies [48c9cd2]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [6779eed]
- Updated dependencies [397ae9a]
- Updated dependencies [89a5b59]
- Updated dependencies [4ef13d6]
- Updated dependencies [8b90b41]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [da449bb]
- Updated dependencies [b0b2cc9]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/graphql-dataprovider@6.2.0-edge.7
  - @memberjunction/ng-shared-generic@6.2.0-edge.7
  - @memberjunction/ng-file-storage@6.2.0-edge.7
  - @memberjunction/ng-media-player@6.2.0-edge.7
  - @memberjunction/ng-base-types@6.2.0-edge.7
  - @memberjunction/ng-ui-components@6.2.0-edge.7
