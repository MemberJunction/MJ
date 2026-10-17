---
"@memberjunction/ai": minor
"@memberjunction/ai-agent-harness": minor
"@memberjunction/ai-agent-manager": minor
"@memberjunction/ai-agents": minor
"@memberjunction/ai-blackforestlabs": minor
"@memberjunction/ai-core-plus": minor
"@memberjunction/ai-elevenlabs": minor
"@memberjunction/ai-engine-base": minor
"@memberjunction/ai-mcp-server": minor
"@memberjunction/ai-prompts": minor
"@memberjunction/aiengine": minor
"@memberjunction/core-actions": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/messaging-adapters": minor
"@memberjunction/ng-artifacts": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-brand-kits": minor
"@memberjunction/ng-conversations": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-file-storage": minor
"@memberjunction/ng-media-player": minor
"@memberjunction/ng-shared-generic": minor
"@memberjunction/scheduling-base-types": minor
"@memberjunction/scheduling-engine": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/task-graph": minor
"@memberjunction/video-studio": minor
"@memberjunction/video-studio-core": minor
"@memberjunction/video-studio-render-worker": minor
---

Add Video Studio (`@memberjunction/video-studio-core`, `@memberjunction/video-studio`, `@memberjunction/video-studio-render-worker`), including the Video Studio orchestrator agent and its Pre-Production, Render, Critic, and Repair stages, deterministic G1–G6 quality gates and rubric scoring, the isolated HyperFrames render worker and `LocalWorker`, `Remote`, and `Docker` render drivers, the Video Studio application and copilot workspace, the `Video Production` artifact type and viewer plugin, the `Produce Video` action, and the `VideoStudio.SetupHealth` remote operation and setup health card. Add general `MJ: Brand Kits` (`@memberjunction/ng-brand-kits`) for shared palette, typography, logo, voice, and generation policy management. Add video generation (`BaseVideoGenerator`, `VideoGeneratorRunner`, the Black Forest Labs FLUX 3 video driver, the `Generate Video` action, and `Per Second` pricing unit support), alongside FLUX.2 Pro endpoint, polling, and reported-cost recording fixes. Generated assets are always disclosed in the viewer, inline preview, review notes, and manifest provenance, never stand in for data or `NeverInvent` items, and any integrity criterion failure or synthetic person violation blocks delivery even when repair rounds are exhausted.

Add the `Consult` sub-agent chat-handling channel (`AIAgent.ChatHandlingOption`, `AIAgent.MaxSubAgentConsultRounds`, `AIAgentRelationship.ChatHandlingOption`), caller-chosen sub-agent configuration presets (`AIAgentRelationship.ConfigurationPresetID`), sub-agent consultation and `resumeRunId` resumption across child, related, parallel, and native sub-agent paths, and root escalation to `MJ: AI Agent Requests` when consult rounds are exhausted. Add peer-to-peer Sage transfers (`NextStep = 'Handoff'`, `HandoffTargetAgent`, inline `mj-agent-handoff-card`, conversation ownership chrome, and `FollowHandoffs` messaging-adapter support). `SaveAgentRunMedia` now persists `FileID` on `MJ: AI Agent Run Medias` rows, the artifact viewer registers dedicated Video and Audio plugins, and `AgentScheduledJobDriver` forwards `ConfigurationID` when starting scheduled agent runs.

Task graphs opted in through metadata (`AllowTaskGraph` / `TaskGraphMode`) now run through `LoopAgentType` with merged prompt parameters and parent hierarchy cycle guards. Explicit `@Sage` mentions or clicking Return to Sage ends specialist agent continuity in every conversation. Follow-up messages to a continued specialist agent resolve that agent's own configuration preset rather than forwarding the conversation manager's preset. Typing a reply in the conversation thread resumes an open sub-agent consult escalated to the user, matching the requests dashboard flow. `ChatHandlingOption = 'Retry'` re-prompts the loop and returns a sub-agent's question to the parent as a result rather than ending the run, capped by the unproductive-retry limit. Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5, and Gemini 3.8 Flash now declare Image and File (and Gemini also Audio and Video) input modalities; Computer Use auto-select now picks Claude Opus 5.5 or Claude Fable 5.1 instead of the text-only fallback, which can change that feature's cost, and chat file attachments turn on for agents using these models.

The Video Studio render worker requires Node >= 22 and system `ffmpeg` on `PATH`; the `Docker` render driver is recommended for production deployments.
