# @memberjunction/video-studio

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
  - @memberjunction/storage@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8
  - @memberjunction/actions-base@6.2.0-edge.8
  - @memberjunction/actions@6.2.0-edge.8
  - @memberjunction/ai-core-plus@6.2.0-edge.8
  - @memberjunction/ai-agents@6.2.0-edge.8
  - @memberjunction/ai-prompts@6.2.0-edge.8
  - @memberjunction/ai-agent-harness@6.2.0-edge.8
  - @memberjunction/ai-engine-base@6.2.0-edge.8
  - @memberjunction/rubrics-base@6.2.0-edge.8
  - @memberjunction/ai@6.2.0-edge.8
  - @memberjunction/video-studio-core@6.2.0-edge.8

## 6.2.0-edge.7

### Minor Changes

- b0b2cc9: Add Video Studio (`@memberjunction/video-studio-core`, `@memberjunction/video-studio`, `@memberjunction/video-studio-render-worker`), including the Video Studio orchestrator agent and its Pre-Production, Render, Critic, and Repair stages, deterministic G1–G6 quality gates and rubric scoring, optional spoken voiceover narration (`VideoNarrationSpec.Enabled`) with automatic `<audio>` track injection in `BuildRenderBundle`, the isolated HyperFrames render worker and `LocalWorker`, `Remote`, and `Docker` render drivers, the Video Studio application (`Productions`, `Brand Kits`, `Archetypes`) with a built-in `ng-conversations` right-side slide-in copilot pinned to the Video Studio agent, the `Video Production` artifact type and viewer plugin, the `Produce Video` action, and the `VideoStudio.SetupHealth` remote operation and setup health card. Add general `MJ: Brand Kits` (`@memberjunction/ng-brand-kits`) for shared palette, typography, logo, voice, and generation policy management. The Video Studio pages share one right-side slide-in (chat from the first open, the brief above the composer, Iterate on the same conversation), pages can hide the floating chat bubble with `SuppressChatOverlay` in their agent context, and `@memberjunction/ng-brand-kits` adds a brand kit creator with a live preview. Add video generation (`BaseVideoGenerator`, `AIVideoRunner`, the Black Forest Labs FLUX 3 video driver, the `Generate Video` action, and `Per Second` pricing unit support), pre-call generation spend-cap enforcement, and FLUX.2 Pro endpoint, polling, and reported-cost recording fixes. Generated assets are always disclosed in the viewer, inline preview, review notes, and manifest provenance, never stand in for data or `NeverInvent` items, and any integrity criterion failure or synthetic person violation blocks delivery even when repair rounds are exhausted.

  Add the `Consult` sub-agent chat-handling channel (`AIAgent.ChatHandlingOption`, `AIAgent.MaxSubAgentConsultRounds`, `AIAgentRelationship.ChatHandlingOption`), caller-chosen sub-agent configuration presets (`AIAgentRelationship.ConfigurationPresetID`), sub-agent consultation and `resumeRunId` resumption across child, related, parallel, and native sub-agent paths, and root escalation to `MJ: AI Agent Requests` when consult rounds are exhausted. Add peer-to-peer Sage transfers (`Handoff` step type, inline `mj-agent-handoff-card`, conversation ownership chrome, and `FollowHandoffs` messaging-adapter support). `SaveAgentRunMedia` now persists `FileID` on `MJ: AI Agent Run Medias` rows, the artifact viewer registers dedicated Video and Audio plugins, and `AgentScheduledJobDriver` forwards `ConfigurationID` when starting scheduled agent runs.

  Task graphs opted in through agent metadata (`enableTaskGraphs`) now run through `LoopAgentType` with merged prompt parameters and parent hierarchy cycle guards. Explicit `@Sage` mentions or clicking Return to Sage ends specialist agent continuity in every conversation. Follow-up messages to a continued specialist agent resolve that agent's own configuration preset rather than forwarding the conversation manager's preset. Typing a reply in the conversation thread resumes an open sub-agent consult escalated to the user, matching the requests dashboard flow. `ChatHandlingOption = 'Retry'` re-prompts the loop and returns a sub-agent's question to the parent as a result rather than ending the run, capped by the unproductive-retry limit. Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5, and Gemini 3.8 Flash now declare Image and File (and Gemini also Audio and Video) input modalities; Computer Use auto-select now picks Claude Opus 5.5 or Claude Fable 5.1 instead of the text-only fallback, which can change that feature's cost, and chat file attachments turn on for agents using these models. Also harden regex parsing in `@memberjunction/ai-form-builder` and `@memberjunction/database-designer-core` against polynomial backtracking (ReDoS).

  The Video Studio render worker requires Node >= 22 and system `ffmpeg` on `PATH`; the `Docker` render driver is recommended for production deployments.

### Patch Changes

- f0548e1: The Video Studio seed tests no longer require the seed records to lack a `sync` block. `mj sync push` writes that block back into the metadata files when the seeds are first pushed, which the v6.2.0-edge.7 release push did, so the assertion failed on every run after it.
- Updated dependencies [54f6563]
- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [8f370b3]
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
  - @memberjunction/actions-base@6.2.0-edge.7
  - @memberjunction/ai-core-plus@6.2.0-edge.7
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/ai@6.2.0-edge.7
  - @memberjunction/aiengine@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/ai-engine-base@6.2.0-edge.7
  - @memberjunction/ai-prompts@6.2.0-edge.7
  - @memberjunction/ai-agent-harness@6.2.0-edge.7
  - @memberjunction/video-studio-core@6.2.0-edge.7
  - @memberjunction/storage@6.2.0-edge.7
  - @memberjunction/rubrics-base@6.2.0-edge.7
