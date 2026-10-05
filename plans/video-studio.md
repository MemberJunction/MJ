# MemberJunction — Video Studio
### A core capability for code-rendered, agent-directed video: explainers, product films, and data stories on any topic, including an organization's own data
**Status:** Implementation Spec — ready for build (RFC v1, decisions through 2026-10-05)
**Audience:** MJ engineering team + the implementing agent
**Date:** 2026-10-05
**Inspired by:** "Motion Engineering: Build a Video Studio Around Opus 5.5" (rari, X, Oct 2026) — the five-layer studio model (Director → Reference → Timeline → Renderer → Critic), seekable frame functions, contact-sheet review, and gated long runs. Grounded in a codebase study of the agent framework, AgentSpec/ComponentSpec, artifacts, MJStorage, Plan Mode / HITL, Rubrics, and Predictive Studio.

---

## 0. How to read this document

This is a design record and an implementation spec. **Decisions** are marked **[D]**; **open questions** are marked **[O]**. §1–§14 are the design. **§15 is the Work Breakdown Structure (WBS)**: the authoritative task list. Each task has a stable ID (`VS-<area>-<n>`), dependencies, acceptance criteria, and the packages it touches. Build it as one phase with the sub-phases in §15, and check tasks off in the WBS itself. Nothing is deferred to a "v2": HITL, the consult channel, sandboxed rendering, reference video, and the Studio UI are all in scope.

File references (`path:line`) were taken against `next` at `e4654c81e` and will drift. They show *where* to look, not exact line numbers.

---

## 1. Vision & placement

Anyone can now ask a frontier model for a video. Most of the results look like the same demo: large centered text, a gradient, everything fading in, a logo at the end. The difference between that and a good film is not a secret prompt. It is **the system around the model**:

- **The model writes the program.** The program draws every frame as a pure function of time. The renderer turns frames into a film.
- **A review loop decides whether anyone should see it.** It judges rendered frames, not the agent's intentions.

Video Studio is that system, built into MJ:

1. **A `VideoGenerationSpec`.** This is the production contract (brief, style guide, beats, data bindings, audio, deliverables, gates). It does for video what `AgentSpec` and `ComponentSpec` do for agents and components.
2. **A "Video Studio" agent.** It is a root Loop agent with director, art-direction, storyboard, motion-engineering and critic sub-agents, plus deterministic pre-production and render steps. It can be called **from anywhere**: a conversation, any agent as a sub-agent, an action, or a scheduled job. It returns a finished video as an artifact.
3. **A deterministic render tier.** HyperFrames (headless Chrome + ffmpeg) runs **out of process**, in a worker process, a container, or a remote render service.
4. **A Video Studio application.** It holds productions, brand kits, archetypes, and a copilot pinned to the agent.

**[D] This is CORE MJ, not an Open App.** It composes onto substrates MJ already ships: the agent framework, AI Configurations / presets, artifacts and versions, MJStorage, Plan Mode and AI Agent Requests, Rubrics, Scheduled Jobs, and the ElevenLabs/Gemini/Anthropic drivers.

**[D] The enterprise differentiator is data stories.** A one-prompt clip on a public topic is a commodity. A **monthly KPI briefing about your own data** is not. It has every number bound to a query, frozen in a snapshot, carrying provenance, rendered in your brand, and produced by Query Builder, the Research Agent, or Skip calling Video Studio as a sub-agent. The data path (§10) is designed in from the start.

### 1.1 What code-rendered video is (and isn't) good for

Code-rendered motion is the right tool for product films, UI motion, data stories, typography, diagrams, explainers, and briefings. It is the wrong tool for photoreal scenes, people, and organic movement. **[D]** Video Studio is code-rendered first. Generated imagery (Generate Image) and generated footage enter only as **assets**, placed and timed by the composition. Generated assets are never allowed to stand in for real product screens or real data (§3.4 `NeverInvent`).

---

## 2. Architecture overview

### 2.1 The five layers → MJ components

| Studio layer (article) | Question it answers | MJ component | Kind |
|---|---|---|---|
| **Director** | What is the film trying to say? | `Video Studio - Director` sub-agent → `spec.film`, `spec.assets`, `spec.dataBindings` (intent) | LLM (Loop) |
| **Reference** | What should it feel and look like? | `Video Studio - Art Director` sub-agent → `spec.style`; reads brand kit, reference images, reference video | LLM (Loop, vision) |
| **Timeline** | What changes at each beat? | `Video Studio - Storyboard` sub-agent → `spec.beats`, `spec.audio.script`, per-format layout notes | LLM (Loop) |
| *(pre-production)* | Real data, real voice, real assets | `Video Studio - Pre-Production` sub-agent → data snapshot, narration TTS with timestamps, asset staging, beat-duration fit | **Deterministic code** |
| **Renderer** | How is every frame produced? | `Video Studio - Motion Engineer` sub-agent writes the HyperFrames composition(s); `Video Studio - Render` sub-agent lints, renders, captures contact sheets, and runs deterministic checks | LLM + **deterministic code** |
| **Critic** | What failed, exactly where, and why? | `Video Studio - Critic` sub-agent: a vision judge over contact sheets, scored against the Video Production rubric; returns the top-3 defects with timestamp, evidence, and a local fix | LLM (Loop, vision) |

The **orchestrator** (`Video Studio`, root Loop agent, custom driver `VideoStudioAgent`) sequences these. It **enforces the gates in code** (§5.4), with the same `validateSuccessNextStep` override pattern the Agent Manager's Architect and the Form Builder Designer use. It does not leave sequencing to prompt discipline.

### 2.2 Topology

```
                       ┌──────────────── callers ────────────────┐
  Conversation (Sage / direct @mention) · Query Builder · Research Agent · Skip (via action/MCP)
  Video Studio dashboard copilot · Scheduled Job (monthly KPI film) · ExposeAsAction
                       └──────────────────┬───────────────────────┘
                                          │  Sage: Handoff (§6A) · other agents: sub-agent + 'Consult' (§6)
                                          ▼
                     ┌──────── Video Studio (root, Loop, VideoStudioAgent) ────────┐
                     │ payload = VideoGenerationSpec + production state            │
                     │ presets: Draft / Standard (default) / High                  │
                     │ gates G1–G6 enforced in code                                │
                     └──┬──────────┬───────────┬───────────┬──────────┬────────┬───┘
                        ▼          ▼           ▼           ▼          ▼        ▼
                   Director   Art Director  Storyboard  Pre-Prod   Motion    Render ⇄ Critic
                   (LLM)      (LLM+vision)  (LLM)       (code)     Engineer  (code)   (LLM+vision)
                     │                                    │        (LLM)       │
          Research Agent / Query Builder          ElevenLabs TTS          VideoRenderEngine port
          (relationships, optional)               Data snapshot           ├─ LocalWorker (default)
                                                  MJStorage staging       ├─ Remote (HTTP)
                                                                          └─ Docker sandbox
                                                                               │
                                                     @memberjunction/video-studio-render-worker
                                                     (@hyperframes/producer + engine + lint, ffmpeg)
```

### 2.3 What composes onto existing substrates (grounded findings)

| Need | Existing substrate | Finding / gap |
|---|---|---|
| Spec-as-contract between planner and builder | `AgentSpec` (`packages/AI/CorePlus/src/agent-spec.ts`), `ComponentSpec` (`packages/InteractiveComponents/src/component-spec.ts`), `WorkflowSpec` + pure validator (`packages/AI/CorePlus/src/task-graph/workflow-spec-validator.ts`) | Follow WorkflowSpec: typed interface + pure validator with machine-readable error codes, **no Zod**. LLMs author via `payloadChangeRequest` (`agent-payload-change-request.ts`). |
| Spec-in-prompt without drift | `packages/AI/CorePlus/scripts/generate-prompt-types.mjs` → `generated-for-prompt/*.md`, `{@include ...}` in templates | Script only serves CorePlus today. Generalize it (VS-SPEC-3). |
| Power levels | `MJ: AI Agent Configurations` presets → `MJ: AI Configurations` (Fast / Standard / High Power), `ParentID` inheritance, `MJ: AI Configuration Params`; Research Agent presets (`.research-agent.json:954-1011`); UI mode picker (`conversation-mode-picker.component.ts`) | Works today with no new UI. Sub-agents inherit the parent run's `configurationId` (`base-agent.ts:10581`). |
| Sub-agent "from anywhere" | `resolveSubAgentByName` (children → relationships → runtime grants), `InvocationMode`, `ExposeAsAction`, Find Candidate Agents | A root agent with `InvocationMode: Any` + relationship rows from callers. |
| Child asks parent a question | `ChatHandlingOption` on `MJ: AI Agents` (`Success / Failed / Retry`) | **Gap:** a child's Chat ends the parent run, and the parent's LLM never sees the question. `Retry` remap appears broken. §6. |
| Sage hands a request to another agent | Historically `payload.invokeAgent` → top-level run (client); today `nextStep.type='Tasks'` + one-node fold → Sub-Agent | **Broken** for unrelated root agents: fold rejected by sub-agent validation, retries, then fail or a durable detour; when it works it runs as Sage's child under Sage's config. §6A adds a first-class `Handoff`. |
| Plan approval with the human | Plan Mode (`RequirePlanMode` / `SupportsPlanMode`, `executePlanStep`, `MJ: AI Agent Requests` + auto-resume in `MJAIAgentRequestEntityServer`) | Root-only (`_depth === 0`). Reused as-is for direct use; §6 covers the sub-agent case. |
| Returning a video | `FileOutputRef` (`agent-types.ts:227`) + `AgentRunner.ProcessFileArtifacts` (links an existing `fileId`, no re-upload); Video artifact type + `VideoArtifactViewerPlugin` + `mj-media-player`; `/media/:fileId` Range streaming | Video type has **no `DriverClass`** (full viewer falls back to JSON). `SaveAgentRunMedia` duplicates every media byte into `InlineData` and never sets `FileID`. §11. |
| Storage | `FileStorageEngine.UploadFile`; storage-account resolution chain runtime override → Agent → Category tree → Type → single active account (`base-agent.ts` `getStorageAccountID`) | Upload is Buffer-only (fine for MP4 sizes we target; pre-auth upload URL exists for larger). |
| Vision critic | `ChatMessageContentBlock` `image_url` / `video_url`; `AIPromptRunner.stripUnsupportedMediaBlocks`; template: `RemoteBrowserActionResolver` visual interpreter | Anthropic: 5 images/request, so contact sheets are **tiled**. Gemini accepts `video/mp4`, `video/webm`. Action media never reaches the agent's own LLM (`${media:}` placeholders), so the critic gets its own prompt call with image blocks. |
| Model capability metadata | `MJ: AI Model Modalities`, `ModelSupportsModality` | **Gemini 3.8 Flash, Claude Opus 5.5, Claude Fable 5.1 have no modality rows**, so the capability check says "no Image input". Only Gemini 3.8 Live (+ Extended Thinking) and GPT-Live 1 have rows. §13. |
| TTS | `AITextToSpeechRunner`, ElevenLabs driver (`textToSpeech.convert`), SDK `@elevenlabs/elevenlabs-js@2.34.0` | SDK exposes `convertWithTimestamps` (character-level alignment). Driver doesn't use it; `SpeechResult` has no alignment field. §8. |
| Headless browser | Playwright in `AI/ComputerUse` (`HeadlessBrowserEngine`), Remote Browser self-host | HyperFrames brings **Puppeteer + its own Chromium**. Contained in the render worker, never in MJAPI. |
| ffmpeg | none; `baseAudio.ts` `AudioSplitter` port deliberately avoids bundling a ~70 MB binary | Same philosophy: the **render worker** requires a system ffmpeg; MJAPI does not. |
| Long runs | fire-and-forget agent runs + PubSub + 60 s heartbeat (`RunAIAgentResolver`), action `MaxExecutionTimeMS` (2 h default), `RunActionParams.DeferExecution`, TaskGraph | Renders take minutes, which is fine. Actions can't stream progress, so progress is reported by the orchestrator between stages and by the render driver's callback through the agent's `onProgress`. |
| Sandboxing | `AI/AgentHarness/src/sandbox/DockerSandboxProvider.ts` (per-run container, `--network none`); `@memberjunction/code-execution` (isolated-vm, no DOM) | Docker provider is the basis for the Docker render driver. |
| Quality scoring | Rubrics (`guides/RUBRICS_GUIDE.md`; `MJ: AI Agent Rubrics` with Evaluation / SelfCheck / ProductionSampling) | The critic's scoring vocabulary **is** a rubric. §9. |
| Recurrence | `AgentScheduledJobDriver` (`packages/Scheduling/engine/src/drivers/AgentScheduledJobDriver.ts`) | Refuses Flow agents, so the orchestrator must be Loop. Accepts but **ignores** `ConfigurationID` / `ConversationID` / `OverrideModelID`, and passes no `CompanyID`. §10.5. |
| App + copilot UI | Predictive Studio application + `ps-studio-resource.component.ts` embedding `mj-conversation-chat-area` pinned to an agent | Exact pattern to mirror. §12. |
| Renderer | **HyperFrames** (HeyGen, Apache-2.0, v0.8.x): `@hyperframes/producer` (`createRenderJob` / `executeRenderJob` with progress callback + `AbortSignal`; `startServer()` HTTP render service), `@hyperframes/engine` (`captureFrame` / `captureFrameToBuffer` at exact times), `@hyperframes/lint` (`lintProject`, `shouldBlockRender`), CLI `check --json` (layout, motion, contrast) | Fully local, no API key, no per-render fees. Requires **Node ≥ 22** (MJ is on 24) and **system ffmpeg**. Pre-1.0, so we pin exact versions. |

### 2.4 Package layout **[D]**

Mirrors Predictive Studio (`Core` / `Engine` / `Sidecar`):

| Package | Path | Contents | Runs in |
|---|---|---|---|
| `@memberjunction/video-studio-core` | `packages/AI/VideoStudio/Core` | `VideoGenerationSpec` and sub-types, pure validator, render-worker wire contract, brand-kit / archetype JSON types (JSONType targets), chart-kit data contracts. **Browser-safe; no server deps.** | Browser + server |
| `@memberjunction/video-studio` | `packages/AI/VideoStudio/Engine` | `VideoStudioAgent` + sub-agent driver classes, `VideoRenderEngine` port + driver registry, pre-production (data snapshot, narration), critic orchestration, storage + artifact packaging, actions, remote operations | MJAPI |
| `@memberjunction/video-studio-render-worker` | `packages/AI/VideoStudio/RenderWorker` | Standalone Node ≥22 process wrapping `@hyperframes/producer` / `engine` / `lint`: render, still capture, contact-sheet composition, checks, reference-video keyframe extraction. **No MJ DB access, no credentials.** Ships a `Dockerfile`. | Separate process / container / remote host |
| (Angular) | `packages/Angular/Explorer/dashboards/src/VideoStudio` | Application resources, lazy module | Browser |
| (Angular) | `packages/Angular/Generic/artifacts/.../plugins/video-production-viewer.component.ts` | `VideoProductionViewerPlugin` | Browser |

**[D] Why the spec lives in `video-studio-core`, not `ai-core-plus`:** `AgentSpec` / `WorkflowSpec` are framework contracts every agent may touch. `VideoGenerationSpec` is a domain contract with its own sub-types (brand kits, chart kit, render protocol) that the Angular viewer and the worker both need, without the rest of CorePlus. This follows the `interactive-component-types` / `predictive-studio-core` precedent.

---

## 3. The `VideoGenerationSpec` (the production contract)

The spec is the single source of truth for a production: the **payload** of the Video Studio agent throughout its run, and the **content** of the Video Production artifact afterwards (§11). It separates **facts about the subject** (assets, data, copy the model may not invent) from **choices about the film** (camera, pacing, transitions the model is free to make). That boundary is the article's most important point.

### 3.1 Shape (sketch: final names settle in VS-SPEC-1)

```ts
export interface VideoGenerationSpec {
  SpecVersion: '1.0';
  Status: VideoProductionStatus;            // 'Briefing' | 'Styled' | 'Storyboarded' | 'Approved' | 'PreProduced'
                                            // | 'Composed' | 'RoughCut' | 'Reviewed' | 'Delivered' | 'Blocked'
  Archetype: { ArchetypeID?: string; Name: string };   // from MJ: Video Archetypes (defaults, pacing, beat template)
  BrandKitID?: string;                      // MJ: Video Brand Kits (CompanyID-scoped or org-wide)
  CompanyID?: string;                       // scope for brand kit / data / provenance

  Film: {
    OneSentence: string;                    // what the viewer must remember
    Audience: string;
    Purpose: string;                        // why this film exists
    DurationSeconds: number;
    Formats: VideoFormat[];                 // '16:9' | '9:16' | '1:1' — each is its own composition (§7.5)
    Language?: string;
  };

  Assets: {
    Approved: VideoAsset[];                 // { Key, Kind, FileID | ArtifactVersionID, Source, Usage, MustUse }
    Required: VideoAssetRequirement[];      // what the brief needs; unmet + MustUse => Blocked, ask (never fake)
    NeverInvent: string[];                  // e.g. ['product UI', 'logo', 'metrics', 'customer names']
  };

  Style: {                                  // the style guide, written by the Art Director after inspecting references
    Palette: ColorToken[];                  // actual values, not adjectives
    Typography: TypeSpec[];
    Composition: string;                    // where the eye goes first
    Pacing: { AvgSecondsBetweenChanges: number; HoldRules: string };
    MotionRules: MotionRule[];              // per object class: MicroUI / Panel / Camera / Headline / Mascot ...
    Texture?: string;
    Keep: string[]; Avoid: string[];        // e.g. Avoid: ['centered text on gradient', 'fade-in everything']
    References: ReferenceAnalysis[];        // per reference file: what was learned + DO NOT COPY list
  };

  Beats: VideoBeat[];                       // { Key, Label ('Hook'|'Problem'|...), StartSeconds, EndSeconds,
                                            //   EntryState, ExitState, Purpose, OnScreenText[], DataRefs[],
                                            //   AssetRefs[], NarrationKey?, LayoutNotes: Record<VideoFormat,string> }
  StateList?: string[];                     // for UI motion: SEARCH -> RESULT -> DETAIL -> ACTION -> CONFIRMATION

  DataBindings: VideoDataBinding[];         // §10: every on-screen number points here
  DataSnapshot?: { FileID?: string; Inline?: Record<string, unknown>; AsOf: string; Sources: string[] };

  Audio: {
    Narration?: { VoiceID: string; Provider: string; Script: NarrationLine[] };   // line per beat
    Music?: { AssetKey: string; BeatGrid?: number[] };
    Cues: AudioCue[];                       // timestamped on the SAME timeline as picture
    Captions: 'None' | 'Burned' | 'Sidecar';
  };

  Render: { Renderer: 'HyperFrames'; RendererVersion: string; Fps: number; Seed: number; Quality: 'draft' | 'standard' | 'high' };

  Interaction: {
    Mode: 'Autonomous' | 'ApproveStoryboard' | 'ApproveStoryboardAndRoughCut';   // §6.4
    MaxRepairRounds: number;                // from power level; hard cap (§9)
  };

  Deliverables: { Formats: VideoFormat[]; Poster: boolean; ContactSheets: boolean; Source: boolean; Captions: boolean };

  Review: {                                 // evidence, never intentions
    Gates: GateRecord[];                    // G1..G6 with status, evidence refs, timestamp
    Rounds: CriticRound[];                  // defects { Timestamp, Beat, Severity, Evidence, Fix, Status }
    Scores?: RubricScoreSummary;
    HumanReviewNotes?: string;              // "what still needs human review" (always populated on delivery)
  };

  Output?: VideoProductionManifest;         // §11: file IDs per format, poster, contact sheets, source bundle
}
```

### 3.2 Validation **[D]**

`ValidateVideoGenerationSpec(spec, stage)` is a **pure** function in `video-studio-core` that returns `{ Valid, Errors: { Code, Path, Message }[] }`. It is modeled on `workflow-spec-validator.ts`, is stage-aware (a `Briefing` spec isn't required to have beats), and has no DB access. A server-side `ValidateVideoGenerationSpecAsync` in the engine adds DB checks: brand kit exists and is in the caller's company scope, FileIDs resolve and are readable by `contextUser`, archetype exists. Validation rules include:

- beats are contiguous and cover `DurationSeconds` ± tolerance; every beat has entry state, exit state, and purpose ("if the agent can't explain why shot four exists, shot four does not belong")
- every `OnScreenText` token that parses as a number/percent/currency must reference a `DataBinding` (§10.2)
- every `MustUse` requirement is satisfied by an approved asset, or the spec status is `Blocked`
- every format in `Deliverables.Formats` has layout notes on every beat
- narration lines map to existing beats; `Audio.Cues` fall inside the timeline

### 3.3 Spec in prompts **[D]**

Prompts `{@include}` a generated markdown rendering of the TS types. This uses the CorePlus `generate-prompt-types.mjs` mechanism, generalized to accept a package root (VS-SPEC-3). The Agent Manager Architect's hand-pasted copy of the interface is the anti-pattern this avoids.

### 3.4 Facts vs choices

- **Facts:** `Assets`, `DataBindings`, `DataSnapshot`, approved copy, `NeverInvent`, brand kit. The model **may not invent or alter** these. A missing required fact is a **blocker** that is asked about (§6), never filled.
- **Choices:** camera, transitions, pacing within archetype bounds, motion curves, composition. The model owns these, and records its reasoning in the spec.

---

## 4. Data model

**[D] Three new entities, grouped alphabetically under "Video".** Tables `VideoArchetype`, `VideoBrandKit`, `VideoBrandKitAsset` in `${flyway:defaultSchema}` (`__mj`). Entity names: `MJ: Video Archetypes`, `MJ: Video Brand Kits`, `MJ: Video Brand Kit Assets`.

**[D] Productions are artifacts, not a new entity.** A production is a `Video Production` artifact. Its versions are iterations, sharing and permissions come from the artifact system, and the gallery is a filtered artifact view. Render progress lives on the agent run (steps). **[O-1]** Revisit only if the gallery needs columns artifacts can't index (e.g. archetype, duration) efficiently. Extract rules (§11.2) may be enough.

**[D] Company scoping.** `CompanyID UNIQUEIDENTIFIER NULL` FK → `__mj.Company`. **NULL means org-wide: available to all companies.** This is the convention `MJ: MCP Server Connections.CompanyID` states verbatim. `CompanyID` flows from `ExecuteAgentParams.companyId` (already propagated to sub-agents and recorded on `MJ: AI Agent Runs`).

### 4.1 `MJ: Video Brand Kits`
| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | default `NEWSEQUENTIALID()` |
| `Name` | nvarchar(255) NOT NULL | |
| `Description` | nvarchar(max) NULL | |
| `CompanyID` | uniqueidentifier NULL FK Company | NULL = org-wide |
| `IsDefault` | bit NOT NULL default 0 | at most one default per `CompanyID` scope, enforced in a `ValidateAsync` override (`BASE_ENTITY_SERVER_PATTERNS`), not a trigger |
| `Status` | nvarchar(20) NOT NULL default 'Active' | CHECK `Active`, `Inactive` |
| `Style` | nvarchar(max) NULL | JSON, **JSONType** → `VideoBrandStyle` (palette tokens, typography, motion rules, keep/avoid) |
| `Voice` | nvarchar(max) NULL | JSON, JSONType → `VideoBrandVoice` (TTS provider, voice id, settings, pronunciation notes) |
| `NeverInvent` | nvarchar(max) NULL | JSON array of strings: brand-level facts the model may never fabricate |

### 4.2 `MJ: Video Brand Kit Assets`
| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | |
| `BrandKitID` | uniqueidentifier NOT NULL FK VideoBrandKit | |
| `Name` | nvarchar(255) NOT NULL | |
| `AssetType` | nvarchar(30) NOT NULL | CHECK `Logo`, `LogoMark`, `Font`, `Image`, `Screenshot`, `Video`, `Music`, `SoundEffect`, `Other` |
| `FileID` | uniqueidentifier NOT NULL FK `MJ: Files` | binary in MJStorage |
| `Usage` | nvarchar(max) NULL | when/how to use; fed to the Art Director |
| `IsPrimary` | bit NOT NULL default 0 | e.g. primary logo |
| `Sequence` | int NOT NULL default 0 | |
| `LicenseNotes` | nvarchar(500) NULL | music/fonts: who may use it, where |

### 4.3 `MJ: Video Archetypes`
| Column | Type | Notes |
|---|---|---|
| `ID` | uniqueidentifier PK | |
| `Name` | nvarchar(100) NOT NULL | unique per `CompanyID` scope |
| `Description` | nvarchar(max) NOT NULL | used by the Director to pick an archetype |
| `CompanyID` | uniqueidentifier NULL FK Company | NULL = shipped/org-wide; non-NULL = a company's own archetype |
| `Category` | nvarchar(30) NOT NULL | CHECK `Explainer`, `Product`, `DataStory`, `Social`, `Tutorial`, `Announcement`, `Briefing` |
| `Status` | nvarchar(20) NOT NULL default 'Active' | CHECK `Active`, `Inactive` |
| `DefaultDurationSeconds` / `MinDurationSeconds` / `MaxDurationSeconds` | int NOT NULL | |
| `DefaultFormats` | nvarchar(100) NOT NULL | e.g. `16:9,9:16` |
| `BeatTemplate` | nvarchar(max) NOT NULL | JSON, JSONType → `VideoBeatTemplate[]` (e.g. HOOK 0–2 s / PROBLEM / REVEAL / PROOF / CLOSE) |
| `Pacing` | nvarchar(max) NULL | JSON, JSONType → `VideoPacing` |
| `Guidance` | nvarchar(max) NULL | markdown fed to Director/Storyboard (shipped via `@file:`) |
| `DefaultInteractionMode` | nvarchar(30) NOT NULL default 'Autonomous' | CHECK matches `Interaction.Mode` |

**Shipped archetypes** (metadata, `metadata/video-archetypes/`): *Topic Explainer* (60–120 s), *Product Launch* (15–30 s), *KPI Briefing* (45–90 s, DataStory), *Data Story* (60–180 s), *Social Short* (9:16, 10–30 s), *How-To Tutorial* (60–180 s), *Announcement* (15–45 s), *Executive Briefing* (90–180 s). **[D]** Guidance text may adapt ideas from HyperFrames' Apache-2.0 skills (`faceless-explainer`, `product-launch-video`, `motion-graphics`), with attribution in a `NOTICE` section of the guide.

### 4.4 Changes to existing tables (separate migration, VS-CON-1)
- `AIAgent.ChatHandlingOption`: drop/re-add `CK_AIAgent_ChatHandlingOption` to add **`Consult`**.
- `AIAgentRelationship.ChatHandlingOption`: **new** `NVARCHAR(30) NULL`, same CHECK set. NULL means inherit the parent agent's value. This is the per-pairing override that `packages/AI/Agents/docs/sub-agents-guide.md:379` already (wrongly) claims exists.
- `AIAgent.MaxSubAgentConsultRounds`: **new** `INT NULL`. NULL means the framework default (3). CHECK `> 0`.
- `AIAgentRelationship.ConfigurationPresetID`: **new** `UNIQUEIDENTIFIER NULL` FK → `AIAgentConfiguration`. The default preset the parent uses when calling this sub-agent (§6.5).

**[D]** Two migrations: one for the framework change (Consult), one for Video Studio entities. Each is reviewable on its own and follows `migrations/CLAUDE.md`: DDL + `sp_addextendedproperty` on every column, ≥50 blank lines, CodeGen tail, apply-time `MAX(Sequence)+1` for EntityField inserts, no `__mj_*` columns, no FK indexes, no PG counterpart.

---

## 5. The Video Studio agent

### 5.1 Agent records (`metadata/agents/.video-studio-agent.json`)
- **Root `Video Studio`**: Type **Loop** **[D]**. Loop is required because `AgentScheduledJobDriver` refuses Flow agents, a Flow root compiles to a durable task graph, and the parent's AI Configuration must drive LLM steps. DriverClass `VideoStudioAgent`. `InvocationMode: Any`. `ExposeAsAction: true`. `SupportsPlanMode: true`. `ChatHandlingOption: 'Consult'`, so its own children can consult it. `DefaultArtifactTypeID` = Video Production. Category "Content Creation" (inherits that category's `DefaultStorageAccountID` if an admin sets one). `PayloadSelfWritePaths` limited to `Status`, `Review.*`, `Output.*`, `Interaction.*`.
- **Children** (`ParentID`), each with `PayloadDownstreamPaths` / `PayloadUpstreamPaths` scoped to its section:

| Child | Type / driver | Writes (upstream) | Reads (downstream) | Notes |
|---|---|---|---|---|
| Director | Loop | `Film`, `Archetype`, `Assets.Required`, `Assets.NeverInvent`, `DataBindings` (intent), `Status` | `*` | Related agents: **Research Agent**, **Query Builder** (relationships, `SubAgentOutputMapping` → `research.*` / `dataSources.*`) for topic research and data sourcing |
| Art Director | Loop (vision via custom driver) | `Style` | `Film`, `Assets`, `Archetype`, brand kit | Reference images and video injected as content blocks (§13.2) |
| Storyboard | Loop | `Beats`, `StateList`, `Audio.Script`, `Audio.Cues`, layout notes | `Film`, `Style`, `DataBindings`, `Assets` | |
| Pre-Production | **code** (`VideoStudioPreProductionAgent`, overrides `executeAgentInternal` like `AgentBuilderAgent`) | `DataSnapshot`, `Audio.Narration` timings, `Beats` timing fit, `Assets.Approved` staging | `*` | §8, §10 |
| Motion Engineer | Loop | `Output.Source` (composition files per format) | `*` minus `Review.Rounds` older than current | lint-fix loop (like Form Builder's `Lint Fix`, max 3) |
| Render | **code** (`VideoStudioRenderAgent`) | `Output.*`, `Review.Gates`, deterministic check results | `*` | calls `VideoRenderEngine` (§7) |
| Critic | Loop (vision via custom driver) | `Review.Rounds`, `Review.Scores` | `*` + contact sheets | §9 |

### 5.2 Power levels **[D]**

Presets on the root (`MJ: AI Agent Configurations`), exactly like Research Agent: **Draft**, **Standard** (`IsDefault`), **High**. Each maps to a new **child AI Configuration** that inherits from the shared one through `ParentID`. Model mappings and fallbacks then inherit, and Video Studio gets **its own `AI Configuration Params`** without polluting the shared configs:

| Preset | AI Configuration (ParentID) | Primary model (all LLM prompts) | Fallbacks | Params (`VideoStudio.*`) |
|---|---|---|---|---|
| Draft | `Video Studio Draft` (→ `Fast`) | Gemini 3.8 Flash, lower effort | Gemini 3.8 Flash (Vertex) | `MaxRepairRounds=0`, `RenderQuality=draft`, `Fps=24`, formats = first only |
| Standard | `Video Studio Standard` (→ `Standard`) | **Gemini 3.8 Flash** | Gemini 3.8 Flash (Vertex), Claude Sonnet 5.5 | `MaxRepairRounds=2`, `RenderQuality=standard`, `Fps=30` |
| High | `Video Studio High` (→ `High Power`) | **Claude Opus 5.5** | Claude Fable 5.1, Gemini 3.1 Pro | `MaxRepairRounds=3`, `RenderQuality=high`, `Fps=30`, all formats |

- Prompt-model rows bind per prompt × configuration (`MJ: AI Prompt Models`). The NULL-configuration rows also point at Gemini 3.8 Flash. This matters because when Video Studio runs as a **sub-agent** it inherits the caller's `configurationId`, and a caller config with no matching rows (e.g. "Sage Text") falls through to NULL rows (`BaseModelRunner.getPromptModelsForConfiguration`). So **the default is always Gemini 3.8 Flash**.
- **Model choice per role:** the Art Director prefers a **video-input-capable** model when a reference video is supplied (Gemini 3.8 Flash at Standard). At High, Opus 5.5 gets keyframe sheets (§13.2).
- **[D] Callers can choose a sub-agent's power level** (decided 2026-10-05; was O-2). This is a general framework capability, not specific to Video Studio. See §6.5.
  - **Precedence:** per-call preset (`AgentSubAgentRequest.presetName`) → relationship default preset (`AIAgentRelationship.ConfigurationPresetID`) → inherit the parent run's `configurationId` (today's behavior).
  - **Effect:** a Research Agent run on Standard can ask Video Studio for **High**. Video Studio's prompts then select Opus 5.5, and its pipeline params (repair rounds, quality, fps) come from the `Video Studio High` configuration.

### 5.3 Prompts (`metadata/prompts/.video-studio-prompts.json`, templates under `metadata/prompts/templates/video-studio/`)
`Video Studio - Orchestrator`, `- Director`, `- Art Director`, `- Storyboard`, `- Motion Engineer`, `- Motion Engineer Lint Fix`, `- Critic`, `- Reference Analysis`. All use `ResponseFormat: JSON`, `OutputExample: @file:`, `ValidationBehavior: Strict`, and `{@include}` the generated spec types. The Motion Engineer template carries the **render contract**:
- seekable and deterministic (no `Date.now`, `requestAnimationFrame`, unseeded `Math.random`, or render-time network fetch)
- a frame is `render(time, spec, assets, style, seed)`
- only staged asset paths are allowed
- motion rules per object class
- one composition per format

### 5.4 Gates (enforced in `VideoStudioAgent`) **[D]**

| Gate | Passes when (evidence recorded in `Review.Gates`) | On failure |
|---|---|---|
| **G1 Facts** | brief has `OneSentence` / audience / duration / formats; every `MustUse` requirement resolved to an approved asset; data bindings resolvable | **Consult/ask** (§6) — never fabricate |
| **G2 Plan** | spec validates at `Storyboarded`; style guide + shot list complete | if `Interaction.Mode ≠ Autonomous` → **plan approval** (Plan Mode at root; Consult as sub-agent) before pre-production |
| **G3 Stills** | representative stills (one per beat, per format) captured and pass deterministic checks | repair via Motion Engineer |
| **G4 Rough cut** | full render + contact sheet exists; critic round completed | — |
| **G5 Repair** | top-3 defects fixed and re-verified, **or** `MaxRepairRounds` exhausted with remaining defects listed in `HumanReviewNotes` | bounded loop, then deliver with notes |
| **G6 Deliver** | every format rendered; poster frame; captions if requested; audio present if specified; artifact packaged | Failed with reason |

`validateSuccessNextStep` returns `Retry` with `retryInstructions` naming the missing gate. "Done" means the evidence says the film works, not that the last command exited.

### 5.5 Invocation surfaces
1. **Conversation:** Sage **transfers** video requests to Video Studio with the new `Handoff` step (§6A). Video Studio runs top-level with the user's preset and keeps the conversation. Users can also @mention it directly with the preset picker. Video Studio is root, `InvocationMode: Any`, with a rich Description for Find Candidate Agents.
2. **Sub-agent of other agents:** relationship rows from **Query Builder** and the **Research Agent** (Report Writer), with `ChatHandlingOption: 'Consult'`, an optional `ConfigurationPresetID` (§6.5), `SubAgentInputMapping` from the caller's data or findings into `DataBindings` / `Film`, and `SubAgentOutputMapping` → `video.*`.
3. **Action:** `ExposeAsAction` gives a "Video Studio" action for low-code, MCP, and external callers (Skip, via MJ's action/MCP surface).
4. **Scheduled job:** §10.5.
5. **Video Studio dashboard copilot:** §12.

---

## 6. The parent ↔ child channel: `ChatHandlingOption = 'Consult'` (core framework)

### 6.1 Problem (grounded)
- A child agent returning `FinalStep = 'Chat'` builds `{ step: 'Chat', terminate: true, ... }` and returns `validateChatNextStep(...)` (`base-agent.ts` ~13200 child path, ~14153 related path).
- The parent run **terminates** as `AwaitingFeedback`, and the question goes to the human. **The parent's LLM never sees it**: the markdown result message is skipped, and `formatSubAgentResultAsMarkdown` omits `agentRun.Message` and `responseForm` anyway.
- A root parent doesn't even create an `AI Agent Request` for a propagated child Chat.
- The existing `Retry` remap still carries `terminate: true` (spread), and `validateRetryNextStep` is a no-op. So the parent ends and is finalized as Failed. **This is likely a bug.**
- The parallel sub-agent path has no Chat handling.
- Plan Mode is root-only.

A sub-agent's caller is often **another agent**, which is a different kind of party from an end user. It usually knows the answer: "use the Q3 numbers you were given", "yes, approve the storyboard".

### 6.2 Design
- **Values:** `ChatHandlingOption` gains `Consult`. It is resolved per pairing: `AIAgentRelationship.ChatHandlingOption` → (if NULL) parent `AIAgent.ChatHandlingOption` → NULL (propagate, today's behavior). Children by `ParentID` use the parent agent's value.
- **On a child Chat under `Consult`:** the parent **does not terminate**. It appends a `sub-agent-consult` message to its conversation containing:
  - the child's question (`agentRun.Message`)
  - a rendered summary of the child's `responseForm` (fields, options; a plan-approval form renders as "Approve / Reject / Edit plan")
  - the child's **run ID**
  - the consult round number

  The parent loop then continues.
- **The parent's LLM then chooses one of three things:**
  1. **Answer:** a Sub-Agent step to the same child with `message = answer` and the new optional **`AgentSubAgentRequest.resumeRunId`**. `ExecuteSubAgent` passes `lastRunId = resumeRunId` and `autoPopulateLastRunPayload = true`, and injects the child's question as an `assistant` turn before the answer, so the child continues coherently. This is the precedent the Realtime `runDelegatedAgent` / `ResumeRunID` path already uses.
  2. **Escalate:** a parent Chat (or Plan at root) carrying the question to its own caller. At the root this creates the standard `AI Agent Request`. When the human responds, `MJAIAgentRequestEntityServer` resumes the parent, and the parent re-invokes the child with `resumeRunId` and the human's answer. Escalation recurses naturally up multiple levels.
  3. **Proceed without:** e.g. tell the child to use its best judgment, or abandon the child.
- **Bounds:** `MaxSubAgentConsultRounds` (default 3) per child run chain. When the bound is exceeded, the child's Chat **propagates** as today, so the human always gets the last word.
- **Parallel sub-agents:** the summary includes each child's question, and each can be resumed individually.
- **`Retry` fix:** a `Retry` remap no longer terminates. It pushes the child's message as a sub-agent result and lets the loop continue.
- **System prompt:** `loop-agent-type-system-prompt.template.md` gains a gated `{% if subAgentConsultEnabled %}` section ("A sub-agent is asking you something: answer it from your own context; escalate only when only your caller can answer"). The Sub-Agent role block says "your Chat goes to your **parent agent**, which may answer you". The snapshot test gets updated.
- **Typing and spec plumbing:** `AgentSpec.ChatHandlingOption` gains `'Consult'`, and `AgentSpecSync` and the MCP agent-management validators are updated. `AgentSubAgentRequest` gains `resumeRunId?`.
- **Docs:** fix `sub-agents-guide.md:379`; extend `packages/AI/Agents/docs/HUMAN_IN_THE_LOOP.md` and `guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md` with a "Consult" section.

### 6.3 Why a new value rather than reusing `Retry`
`Retry` means "this outcome was wrong, try again". `Consult` means "your caller is an agent; let it participate". It is a distinct relationship semantic, and the user explicitly wants that difference acknowledged in the model.

### 6.4 How Video Studio uses it
- **Direct use (root):** `SupportsPlanMode` + `Interaction.Mode`. The orchestrator presents the storyboard (beats, a few representative stills when G3 is cheap, estimated render time) as a Plan step, then waits for the human through the standard plan-approval card.
- **As a sub-agent:** the same approval point emits a Chat with a plan-approval `responseForm`. Under `Consult`, the calling agent approves or amends it, and escalates to its human only if it can't decide. A missing `MustUse` asset (G1) consults the same way.
- **Default `Interaction.Mode`:** `Autonomous` when invoked as a sub-agent with no explicit mode; the archetype's `DefaultInteractionMode` when a human invokes it directly.

### 6.5 Caller-selected presets for sub-agents (core framework) **[D]**
Today `ExecuteSubAgent` always passes `configurationId: params.configurationId` (`base-agent.ts:10581`), so a child can only run under its parent's AI Configuration. The durable task-graph runner passes no `configurationId` at all (`packages/MJServer/src/services/TaskGraphAgentRunner.ts:30-41`).

- **Relationship default:** `AIAgentRelationship.ConfigurationPresetID` (new, nullable FK → `MJ: AI Agent Configurations`). It must reference a preset **of the sub-agent**, enforced in the relationship entity's server `ValidateAsync`.
- **Per-call override:** `AgentSubAgentRequest.presetName?: string`. This is the preset's display name (e.g. `High`), resolved against the target agent's presets; an unknown name is a validation error returned to the parent LLM.
- **Discovery:** the sub-agent catalog that `buildAgentBaseCatalog` renders into the parent's prompt lists each sub-agent's available presets, with descriptions, so the parent LLM knows what it can ask for.
- **Resolution:** per-call → relationship → inherit. The resolved preset's `AIConfigurationID` (NULL means the default rows) becomes the child run's `configurationId`. It is recorded on the child's `AIAgentRun` and propagates to the child's own sub-agents under the same rules.
- **Task graphs:** task nodes may carry a `PresetName`, and `TaskGraphAgentRunner` passes the resolved `configurationId` through (fixing today's omission).
- **Scheduled jobs:** `AgentScheduledJobDriver` honors the `ConfigurationID` it already accepts (VS-INV-4).

---

## 6A. Sage transfers: hand the conversation to another agent (core framework) **[D]**

**Requirement (2026-10-05):** Sage is the concierge. When another agent should own a request, Sage must be able to **transfer** it, like a transferred phone call:
- The target agent takes the turn as a **top-level run**, with its own presets and configuration and its own response in the conversation.
- It does **not** run as a sub-agent under Sage.

This used to work and is broken today. It is how users will most often reach Video Studio from a conversation.

### 6A.1 How it used to work (git history)
The local clone is shallow before 2026-07-22; earlier commits were read through the GitHub API.

| When | Commit | Mechanism |
|---|---|---|
| 2025-10-01 | `ce51dafd3`, `e47ee1166` | Sage set `payload.invokeAgent` and the client's `handleSubAgentInvocation` started the target as **its own top-level run**, with its own ConversationDetail, `AgentID`, and the user's saved preset. The prompt said: *"This is **not** the same as a sub-agent… I will bring them into the conversation."* |
| 2025-10-09 | `9fcaf80ca` | Moved to `payload.taskGraph`. For a one-task graph the client's `handleSingleTaskExecution` still started a top-level run attributed to the target ("👉 Delegating to **X**"). **This is the transfer people remember.** |
| 2026-08-07 | `e9bb6237d` (#3574) | Removed the client's one-task special case. All graphs went to the durable server-side dispatcher. |
| 2026-08-07 | `4d89edd54` (#3588) | Sage emits `nextStep.type='Tasks'`. **Constant folding** (D9) added: a one-node graph becomes an in-run **Sub-Agent** step. The payload sniff was removed. |
| 2026-08-09 | `f360972c5` | Task spec v2 (`kind` + `configuration`, no compatibility shim). **`sage.template.md` was never updated**: it still teaches the flat `agentName` shape (`sage.template.md:50-63`). |
| 2026-09-30 | `bb33c773c` (#4873) | `<suggested_agent>` shortcut added on top of the same Tasks path. |

### 6A.2 What happens today (Sage → Research Agent, an unrelated root agent)
1. **Two contradictory schemas.** `sage.template.md` teaches the v1 flat task shape, while the loop system prompt (`enableTaskGraphs`) documents v2 `kind`/`configuration`.
2. **Retry #1.** If Sage follows its own template, `ValidateTaskGraphSpec` fails with `NoAssignment` (`task-graph-validator.ts:710-716`) and `applyTasksStep` returns Retry (`loop-agent-type.ts:195-203`).
3. **Fold.** With v2 shape, `describeFold` folds the one-node graph into a `Sub-Agent` step with `terminateAfter:false` (`loop-agent-type.ts:211-228`). The fold doesn't check whether the target is resolvable.
4. **Fatal break.** `validateSubAgentNextStep` accepts only `getEffectiveSubAgentsForValidation` (`base-agent.ts:5890-5896`): ParentID children + AgentRelationships (for Sage: Workflow Planner, Form Builder). The result is "Sub-agent 'Research Agent' not found or not active" → Retry → after 10 general validation retries the run fails (`base-agent.ts:551`, `6634`).
5. **What the user sees:** latency, then one of:
   - Sage answers itself.
   - The graph escapes to the durable path (2+ nodes or `durable:true`) and runs via `TaskGraphAgentRunner` (`RunAgent`, not `RunAgentInConversation`): no preset, no conversation turn, results delivered later.
   - The run fails.
6. **Even when the fold succeeds** (target is a child or related agent), the target runs as a **child under Sage**:
   - It uses **Sage's** AI Configuration (`base-agent.ts:10581`), not its own preset.
   - Sage paraphrases the answer onto **Sage's** ConversationDetail.
   - Continuity routing (`findLastNonSageAgentId`, `message-input.component.ts:2204,2405`) never sticks to the target.
7. **Dead legacy paths:**
   - The client's `payload.invokeAgent` / `payload.taskGraph` branches (`message-input.component.ts:2777-2785, 3086-3200`) are dead for shipped agents: nothing in `metadata/` emits them anymore.
   - `BaseMessagingAdapter` (`:733, 905-930`) still auto-delegates on `invokeAgent`, plus a text-regex fallback, with **no permission check**.

### 6A.3 Design: a first-class `Handoff` step **[D]**
**Why a distinct step rather than fixing Tasks:**
- Folding exists to keep work *inside* the run; a transfer must *leave* it.
- `Consult` (§6) is agent ↔ agent inside a run; `Handoff` is **ownership of the conversation turn moving to another agent**.

User-facing language is "transferred"; the step type is `Handoff`.

1. **Step:** Loop next-step `type: 'Handoff'`, `{ agentName, brief, reason }`.
   - It is terminal for the source agent and never folded.
   - It is gated by a new `AgentTypePromptParams.enableHandoff`, aligned like `tasks` (`base-agent.ts:9771`). It is on for Sage and off by default for other agents.
   - The source run ends `Success` with a short "Transferring you to **X**…" message, records a `Handoff` run step, and stores `HandoffToAgentID` in the run's step output.
2. **Target resolution (server-side).** By name over `AIEngine.Agents`. The target must:
   - be `Status='Active'`
   - be directly discoverable (`AIAgentPermissionHelper.IsDirectlyDiscoverable`: no ParentID, `InvocationMode ≠ 'Sub-Agent'`)
   - be runnable by the user (`GetAccessibleAgents(user, 'run')`)
   - be in the host's `AllowedAgentIDs` when supplied (enforced server-side, not only in the client)
   - not be the source agent

   On failure, return a Retry to the source listing valid candidates, the same set Find Candidate Agents returns.
3. **Execution (server-side, so every host gets it: Explorer, Slack/Teams, MCP, scheduling).** In the turn host (`RunAIAgentResolver` and `ConversationAgentRunner`), after the source run completes with a handoff:
   - Create a new ConversationDetail (`ParentID` = source detail, `AgentID` = target).
   - Call `AgentRunner.RunAgentInConversation` (as `MJAIAgentRequestEntityServer` already does) with the context listed below.
   - The client receives both details over the existing PubSub stream.

   Context passed to the target: original user message, conversation history (per the target's message settings), the source's `brief` as a context note, attachments / `inputArtifacts`, the previous payload for that agent, `appContext`, plan-mode flag, requested skills.
4. **Preset the target runs with:** conversation `@mention` pin (move `FindConfigurationPresetForAgent` server-side) → user's saved preset for that agent (`mj.agentMode.<agentId>` user setting) → target's `IsDefault` preset. **Never Sage's configuration.**
5. **Stickiness (a transferred call stays transferred):** the target's detail is attributed to the target, so existing continuity routing sends the next user message to it. The user returns to Sage with `@Sage`; the target can `Handoff` back to Sage (Sage is a valid target for non-Sage agents).
6. **Loop prevention:**
   - at most one handoff per user turn per source
   - a target may not hand back to its source within the same turn
   - a hop cap of 3, shared with the messaging adapter's existing constant
   - every hop audited as a run step
7. **UI:** Sage's detail shows a "Sage transferred you to **X**" chip linking to the target's reply. The target's detail renders normally, attributed to X, with its preset badge. Retire the dead `invokeAgent` / `taskGraph` client branches once the server path ships.
8. **Prompts:**
   - Rewrite `sage.template.md` §4: `Handoff` for "another agent should own this"; Tasks (v2 shape, validated) only for multi-step / durable work.
   - Update the `<suggested_agent>` guidance to emit `Handoff`.
   - Add a regression test that every task-graph example in shipped templates passes `ValidateTaskGraphSpec`.
9. **Related fixes:**
   - `describeFold` folds only when `resolveSubAgentByName` would succeed; otherwise the graph goes to durable submission instead of burning retries.
   - `TaskGraphService.resolveAgents` (`TaskGraphService.ts:1339`, name-only) gains the same permission check.
   - `BaseMessagingAdapter` consumes the `Handoff` result (keeping the regex fallback) and gains a permission check.

### 6A.4 Video Studio and the other studios
When a user asks Sage for a video, Sage hands off to **Video Studio**. Video Studio runs top-level with the user's preset (e.g. High), owns the conversation through iterations, and returns its Video Production artifact on its own detail. Predictive Studio's Model Development Agent, the Research Agent and others benefit equally.

---

## 7. Rendering

### 7.1 The `VideoRenderEngine` port **[D]**
`VideoRenderEngine` is an abstract base in the engine package, with drivers registered by `@RegisterClass(VideoRenderDriverBase, '<Name>')` and chosen by config (`mj.config.cjs` → `videoStudio.render`). It follows the `AudioSplitter` port philosophy: MJAPI never links Chromium or ffmpeg.

```ts
abstract class VideoRenderDriverBase {
  abstract Render(req: RenderRequest, onProgress?: (p: RenderProgress) => void, signal?: AbortSignal): Promise<RenderResult>;
  abstract CaptureStills(req: StillsRequest, signal?: AbortSignal): Promise<StillsResult>;     // exact timestamps
  abstract BuildContactSheet(req: ContactSheetRequest): Promise<ContactSheetResult>;           // tiled PNG(s)
  abstract Check(req: CheckRequest): Promise<CheckResult>;                                     // lint + layout/contrast/safe-area
  abstract ExtractKeyframes(req: KeyframeRequest): Promise<KeyframeResult>;                    // reference video → stills
  abstract Health(): Promise<RenderHealth>;                                                    // node/ffmpeg/chrome versions
}
```

The request/response wire types live in `video-studio-core`. Projects travel as a **bundle**: composition files + staged asset bytes + snapshot JSON. The worker never fetches from MJ.

### 7.2 Drivers (all built in this phase)
| Driver | Topology | Use |
|---|---|---|
| `LocalWorkerRenderDriver` **(default)** | Spawns `video-studio-render-worker` as a child process (managed mode, ephemeral port, health poll, SIGTERM cleanup), the same pattern as `MLSidecar` managed mode | Dev and single-node installs |
| `RemoteRenderDriver` | HTTP to a running worker (`VIDEO_STUDIO_RENDER_URL`), e.g. a scaled pool | Production / k8s |
| `DockerRenderDriver` | One container per render via `DockerSandboxProvider` (`--network none`, CPU/mem limits), image built from the worker's `Dockerfile` | Hard isolation for untrusted, model-written code |

**[O-4]** HyperFrames ships AWS Lambda and Cloud Run adapters. A `LambdaRenderDriver` is a natural follow-on and is **not** in this WBS unless requested.

### 7.3 Render worker
- **Runtime:** Node ≥ 22, `@hyperframes/producer`, `@hyperframes/engine`, `@hyperframes/lint`, pinned **exact** (pre-1.0). It requires **ffmpeg** on `PATH`, and `Health()` reports a clear error if ffmpeg is missing.
- **Render:** `createRenderJob({ fps, quality, format: 'mp4', entryFile })` + `executeRenderJob(job, dir, out, onProgress, signal)`. Progress is relayed, and cancellation goes through `AbortSignal` (`RenderCancelledError`).
- **Stills:** `captureFrameToBuffer` at beat midpoints, transition edges, and the final frame.
- **Contact sheets:** composed **by Chromium itself**. The worker lays the stills out as a labelled grid (timestamp, beat, format) in an HTML page and screenshots it, so no `sharp` or canvas dependency is needed. Sheets fit the Anthropic 5-image cap (≤ 4 sheets + 1 strip per critic call).
- **Checks:** `@hyperframes/lint` (`lintProject`, `lintMediaUrls`, `shouldBlockRender`) as a library. HyperFrames' layout, contrast, and motion audit is **CLI-only** in v0.8.134 (`packages/cli/src/commands/check.ts`; no library export). The worker therefore runs `hyperframes check --json` as a subprocess inside its own sandbox (**[O-5]** upstream a library export if the subprocess cost matters). MJ adds its own checks: safe area per format, minimum text size at phone scale, data-literal scan (§10.2).
- **Security [D].** Verified against HyperFrames v0.8.134:
  - The engine launches Chrome itself, with **`--no-sandbox`** and a fixed flag set (`engine/src/services/browserManager.ts`).
  - It exposes **no request-interception hook**.

  Isolation must therefore come from layers we control:
  1. **Content-Security-Policy injected by the worker** into every compiled composition (`default-src 'self' file: data: blob:; connect-src 'none'; frame-src 'none'`). This blocks fetch, XHR, WebSocket, and remote media from inside the page.
  2. **Lint gate:** `lintMediaUrls` + a staged-assets-only rule. Any non-bundle URL blocks the render.
  3. **Per-render temp dir**, deleted on every path (`try/finally`); hard timeout and memory caps; the worker runs as an unprivileged user.
  4. **Docker driver** (`--network none`, read-only root, limits) is the **recommended production driver** whenever model-written compositions come from untrusted prompts. LocalWorker is the dev / single-node default.
  5. **Upstream contribution [D]** (decided 2026-10-05; was O-6): offer HyperFrames (`heygen-com/hyperframes`, Apache-2.0) a small, **purely additive**, opt-in engine option. It is either a request-policy callback (allow/deny per request URL) or `extraChromeArgs` (for `--proxy-server=127.0.0.1:0` style lockdown), off by default with no behavior change for existing users. The PR comes with tests in their suite, following their `CONTRIBUTING.md`.

  **Our security never depends on that PR being accepted.** Layers 1–4 above are the baseline. The hook is defense in depth for LocalWorker. If upstream declines or stalls:
  - **First fallback, a pnpm patch.** Same mechanism and governance MJ already uses for `type-graphql` (`package.json` → `pnpm.patchedDependencies`, `patches/README.md`). The patch goes against the **exact pinned** `@hyperframes/engine` version, applies only to the render worker (the only package that depends on HyperFrames), and is documented in `patches/README.md` with what/why/how-to-regenerate/upstream status. A pin bump that fails to apply the patch fails the install loudly, so it can't silently drop. Worst case if the patch is absent: we're back to layers 1–4, never an unsafe state.
  - **Fork only as a last resort.** If the patch grows beyond a small, reviewable diff, or upstream diverges incompatibly, publish `@memberjunction/hyperframes-engine` from a fork that tracks upstream releases. **[O-6b]** This only arises if both upstream and the patch fail; not planned.

### 7.4 Determinism
`Render.Seed` is passed to the composition, fonts are bundled as brand-kit assets (never system fonts), and `RendererVersion` is recorded. As HyperFrames documents, "exact pixels can still vary with Chrome, fonts, codecs, GPU", so the critic judges the rendered file, not the intent.

### 7.5 Formats are compositions, not crops **[D]**
Each format in `Film.Formats` is a separate composition sharing the same timeline, assets, and narrative states, with per-format layout rules (9:16 = fewer elements and larger type; 1:1 = tighter typography and shorter holds). Each format gets its own contact sheet and critic pass.

---

## 8. Audio

- **Narration with timing [D].** The `BaseAudioGenerator` / `SpeechResult` contract gains optional alignment:
  - `TextToSpeechParams.IncludeTimestamps?: boolean`
  - `SpeechResult.Alignment?: { Characters: string[]; StartSeconds: number[]; EndSeconds: number[] }`
  - a pure `DeriveWordTimings(alignment)` helper in AI Core

  The ElevenLabs driver uses `textToSpeech.convertWithTimestamps` when requested. Other TTS drivers report no alignment, and callers fall back to measured clip duration.
- **Per-beat synthesis:** Pre-Production synthesizes **one clip per narration line**. Each clip's measured duration sets its beat's length (within archetype min/max), and the word timings drive captions and cue placement. The picture and the sound share one timeline because the timeline is **derived from** the sound.
- **Music:** only brand-kit or user-supplied tracks with `LicenseNotes`, never fetched from the web. `Music.BeatGrid` is optional, supplied or estimated. **[O-7]** Automatic beat detection, e.g. ffmpeg `ebur128` / onset analysis in the worker, is a nice-to-have. v1 accepts a supplied grid or narration-derived cue points.
- **Mix:** HyperFrames producer mixes audio tracks (AAC in MP4). Cue timestamps come from `Audio.Cues`, the same timeline as the picture.
- **"Close your eyes" check:** the critic receives a narration/cue timeline table next to the contact sheets, so sync defects (a click landing after the button) are judged on timestamps.

---

## 9. Review: deterministic checks → vision critic → bounded repair

1. **Deterministic checks first (cheap):** lint, layout, contrast, safe area, minimum text size, data-literal scan, missing-asset references, audio present. Failures go straight back to the Motion Engineer, with no LLM critic call.
2. **Vision critic:** `VideoStudioCriticAgent` builds its prompt with `image_url` content blocks (tiled contact sheets + a transition strip), plus the spec's beats, the narration timeline, and the **Video Production Quality rubric** criteria:
   - hook in the first 2 s
   - readability at phone size
   - continuity of type and color
   - motion with weight and clear focus
   - sound sync
   - brand fidelity
   - **data fidelity** (shown values = snapshot values)
   - poster-quality final frame

   Instructions follow the article: *judge only the rendered frames; identify the three largest defects; each with timestamp, beat, evidence, and a local fix.*
3. **Repair:** the Motion Engineer patches **only** the affected sections. The Render agent re-captures the affected stills (and re-renders), and the critic re-judges, up to `MaxRepairRounds`. Remaining defects go into `HumanReviewNotes`.
4. **Rubric [D]:** ship `Video Production Quality` as a Rubric (metadata), linked to the agent with purpose **Evaluation** for test suites. The critic uses the same criteria vocabulary, so the in-run critic and offline evaluation agree. SelfCheck stays **Disabled**, as with every shipped SelfCheck link, because the critic loop already covers it.

---

## 10. Data stories (enterprise)

### 10.1 Bindings, not numbers **[D]**
`DataBindings[]` entries:

```ts
{ Key: 'kpi.revenue.mtd',
  Source: { Kind: 'Query' | 'View' | 'Artifact' | 'Inline';
            QueryID?: string; Parameters?: Record<string, unknown>;
            EntityName?: string; ExtraFilter?: string; Fields?: string[];
            ArtifactVersionID?: string },
  Shape: 'Scalar' | 'Series' | 'Table' | 'Delta',
  Format?: { Kind: 'Currency' | 'Percent' | 'Number' | 'Date'; Currency?: string; Decimals?: number },
  Label?: string }
```

Callers hand data in directly:
- **Query Builder** passes its Data artifact / query ID.
- **Research Agent** passes findings with sources.
- A **Data Snapshot** artifact can be referenced by version.

### 10.2 Snapshot + provenance
- **Snapshot:** Pre-Production executes every binding **as `contextUser`**, so row-level security, entity permissions, and company scope apply. It uses `RunQuery` / `RunViews` (batched, `ResultType: 'simple'` + `Fields`) and freezes the results into `DataSnapshot` (inline when small, an MJStorage JSON file otherwise), with `AsOf` and source list.
- **No literals:** the composition reads `data['kpi.revenue.mtd']` from the snapshot bundled into the render. The Motion Engineer is forbidden from typing literals. The **data-literal scan** flags any rendered numeric text with no binding (composition source scan + spec `OnScreenText` validation), and the critic's data-fidelity criterion checks stills against snapshot values.
- **Provenance:** the end card shows "Data as of {AsOf}" (archetype-controlled). The artifact stores the snapshot, the binding definitions, and the source IDs, so anyone can trace a number in the film to its query.

### 10.3 Chart kit **[D]**
`video-studio-core` ships a small set of deterministic, seekable, brand-token-driven animated primitives:
- KPI tile with count-up
- delta badge
- bar, line, area, donut
- ranked list
- sparkline
- table reveal

They are injected into the render bundle as a script the composition imports. Charts are therefore consistent and on-brand rather than re-improvised per film, and the Motion Engineer composes them instead of hand-drawing axes. They follow the `dataviz` guidance (form heuristics, accessible palettes) using brand-kit tokens.

### 10.4 Security posture **[D]**
- Generation honors the requesting user's data access (`contextUser`). The render worker receives only the frozen snapshot, never DB credentials or network.
- **Sharing a data-bearing video is the sharer's responsibility**, exactly like other data-bearing artifacts. **No system enforcement in this phase** (decision 2026-10-05). The viewer shows a "contains data as of …" badge so the content is obvious.

### 10.5 Recurring briefings
"Monthly KPI briefing" = a Scheduled Job using `AgentScheduledJobDriver` with `StartingPayload` = a saved spec template (archetype KPI Briefing, brand kit, bindings). Each run re-snapshots and renders a **new version** of the same Video Production artifact when `sourceArtifactId` is supplied. Required fixes in the driver (VS-INV-4):
- pass `ConfigurationID` through to `RunAgent` (accepted but ignored today)
- accept and pass a `CompanyID`
- optionally `ConversationID`, so recurring films land in a known conversation

---

## 11. Artifact & storage

### 11.1 `Video Production` artifact type **[D]**
- **Type:** new type `Video Production`, `ParentID` = **JSON**, `ContentType: application/vnd.mj.video-production+json`, `DriverClass: VideoProductionViewerPlugin`, `ExtractRules: @file:extract-rules/video-production.json` (name, description, archetype, duration, formats, as-of, `displayMarkdown` summary), icon `fa-solid fa-clapperboard`.
- **Content:** the full `VideoGenerationSpec`, including `Output: VideoProductionManifest`:
  - per-format MP4 `FileID`s
  - poster `FileID`
  - contact-sheet `FileID`s
  - captions file
  - source bundle (composition HTML as text + asset refs)
  - render metadata (renderer version, seed, fps, durations)
  - critic rounds
- **Viewer:** plays the video first, with format switcher and poster. Tabs:
  - **Brief** (film + one sentence)
  - **Storyboard** (beats with stills)
  - **Style**
  - **Data** (bindings, snapshot, as-of)
  - **Review** (gates, defects, scores, human-review notes)
  - **Source**

  The video plays through `mj-media-player` with `/media/:fileId` Range streaming (or pre-auth URL). An inline preview component shows poster + play in the conversation card.
- **Iteration:** "make the hook faster" produces a new artifact **version** of the same production (`ArtifactDirective: version-source`). Diffs are spec diffs.

### 11.2 Storage **[D]**
- **MJStorage is the default.** The Render agent uploads outputs via `FileStorageEngine.UploadFile` to the agent's resolved storage account (runtime override → Agent → **Category** → Type → single active account) and returns **`FileOutputRef`s with `fileId`**. No base64 travels through the agent or SQL.
- **Inline is the fallback:** only below a small threshold (default 2 MB, config) or when **no storage account resolves**. A visible warning goes in `HumanReviewNotes` and the viewer.
- **Setup:** one File Storage Provider + Account, assigned as `DefaultStorageAccountID` on the agent's category (or the agent). Install-specific, so not shipped in metadata; documented in the guide and checked by a "Video Studio setup" health card in the dashboard.

### 11.3 Framework fixes (benefit every agent)
- **`SaveAgentRunMedia`:** when a media output has (or obtains, by uploading once) a storage file, set `AIAgentRunMedia.FileID` / `FileName` / `FileSizeBytes` and **skip `InlineData`**. `CreateMediaArtifacts` reuses that `fileId` instead of uploading again.
- **Viewer DriverClass:** set `DriverClass: VideoArtifactViewerPlugin` on the **Video** artifact type and `AudioArtifactViewerPlugin` on **Audio**, so the full-panel viewers are reachable.

---

## 12. UX: the Video Studio application

- **`MJ: Applications` row:** `metadata/applications/.video-studio-application.json`, `DefaultForNewUser: false`, icon `fa-solid fa-clapperboard`, a `DefaultSequence` near Predictive Studio.
- **Nav items** (`ResourceType: Custom`):

| Nav | DriverClass | Content |
|---|---|---|
| **Productions** (default) | `VideoStudioProductionsResource` | Gallery of Video Production artifacts the user can see: poster grid, filters (archetype, brand kit, company, date, status). Detail view: the production viewer + **Iterate** (opens the copilot on that artifact) + **Share** (artifact sharing). |
| **Studio** | `VideoStudioStudioResource` | Start a production: pick archetype / brand kit / formats / power level, attach references and data, then the copilot. |
| **Brand Kits** | `VideoStudioBrandKitsResource` | List + editor (generated form + custom asset-upload panel with previews of logos, fonts, music). |
| **Archetypes** | `VideoStudioArchetypesResource` | List + editor; shipped archetypes are read-only templates that can be cloned into a company archetype. |

- **Copilot:** `mj-conversation-chat-area` pinned to the Video Studio agent, in the same pattern as `ps-studio-resource.component.ts`:
  - agent resolved by name through `AIEngineBase`
  - `[showAgentPicker]=false` and `[showAgentModePicker]=true`, so the preset picker shows power levels
  - `[applicationScope]='Application'`
  - `OnChatConversationCreated` flips `ChatIsNewConversation`
- **Conventions:**
  - Explorer chrome trio, `NotifyLoadComplete()`, design tokens only, `mjButton`, `@if`/`@for`, `inject()`
  - data via a `VideoStudioEngine` (`BaseEngine`) caching brand kits + archetypes, so there's no data service layer
  - lazy feature module + subpath export
  - `npm run mj:manifest:explorer`
  - follows `guides/UI_LAYERING_GUIDE.md`: the viewer plugin is L2 in `Generic/artifacts`, the resources are L3

---

## 13. Model capabilities & reference media

### 13.1 Modality metadata fixes **[D]**
Add `MJ: AI Model Modalities` rows (uuidgen PKs, no `sync` block):
- **Gemini 3.8 Flash:** Text in/out, **Image in**, **Video in**, Audio in
- **Claude Opus 5.5** and **Claude Fable 5.1:** Text in/out, **Image in**, File (PDF) in
- **Claude Sonnet 5.5** (fallback): same as Opus

Rows must match driver `GetFileCapabilities` (Anthropic: jpeg/png/gif/webp/pdf, 32 MB, 5 files per request; Gemini: + mp4/webm). **[O-8]** A broader audit of modality rows across all models is valuable, but out of scope beyond the models Video Studio binds.

### 13.2 Reference images and video **[D]**
- **Sources:** user attachments in the conversation, brand-kit assets, URLs approved in the brief (captured by an optional **Capture Web Page** step: Playwright screenshot of an approved URL through `HeadlessBrowserEngine` for real product screens).
- **Routing:** the Art Director's driver checks `ModelSupportsModality(model, 'Video', 'Input')`.
  - **Video-capable** (Gemini 3.8 Flash): the reference video is sent as a `video_url` block (pre-auth URL or inline within limits).
  - **Otherwise** (Opus 5.5): the worker's `ExtractKeyframes` (ffmpeg scene-change + uniform sampling) produces tiled keyframe sheets sent as images.

  Reference video works at every power level.
- **Output:** a `ReferenceAnalysis` (palette, typography, composition, pacing, motion, texture, **DO NOT COPY** list), which becomes a style guide, never a collage.

---

## 14. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Model-written HTML/JS executes in a browser on our infrastructure (HyperFrames runs Chrome with `--no-sandbox`) | Out-of-process worker only; injected CSP (`connect-src 'none'`); lint gate on media URLs; staged assets only; unprivileged user, per-render temp dir, hard timeouts and memory caps; **Docker driver (`--network none`) recommended for production** |
| ffmpeg / Chromium availability and size | Required only by the render worker; `Health()` with actionable errors; worker `Dockerfile` with both; MJAPI unaffected |
| Long renders | Fire-and-forget runs + heartbeat; progress from driver callbacks relayed through `onProgress`; `AbortSignal` cancellation; Draft preset for fast iteration |
| HyperFrames is pre-1.0 | Exact pins; all usage behind `VideoRenderEngine`; worker contract tests with golden fixtures |
| Generic-looking output | Archetypes + brand kits + explicit `Avoid` lists + reference analysis + critic rubric with "hook" and "brand fidelity" criteria |
| Hallucinated product screens / numbers | `NeverInvent`, `MustUse` blockers (consult or ask), data bindings + literal scan, data-fidelity criterion |
| Cost at High | Presets; Draft for exploration; deterministic checks before any vision call; bounded repair rounds |
| Consult loops between agents | `MaxSubAgentConsultRounds`, then propagate to human |
| Storage not configured | Inline fallback with warning; setup health card; guide |

---

## 15. Work Breakdown Structure (the task list)

**One phase, sub-phases VS0–VS11 (plus VS1A, Sage transfers).** VS1 (Consult + presets) and VS1A (Handoff) are framework work that can start immediately and in parallel with VS0/VS2/VS3; they have value independent of Video Studio and could ship in their own PR if the assigned developer prefers. Each task: **ID — title** · _deps_ · **AC** · packages. Treat this list as the backlog and check items off here.

### VS0 — Foundations
- **VS-FND-1 — Scaffold packages.** _deps: none._ `packages/AI/VideoStudio/{Core,Engine,RenderWorker}` with package.json (peer/dep rules per workspace), tsconfig, vitest (`scripts/scaffold-tests.mjs`), README per package. **AC:** all build; tests run; `npm run check:esm` / `check:standards` clean.
- **VS-FND-2 — Migration: Video Studio entities.** _deps: VS-FND-1._ `migrations/v6/V<ts>__v6.2.x__Video_Studio.sql`: `VideoArchetype`, `VideoBrandKit`, `VideoBrandKitAsset` per §4 (CHECKs, FKs to Company / File, extended properties on every column). **AC:** clean apply on a fresh DB (`bootstrap-clean-db`); `check-migration-entityfield-sequence` passes.
- **VS-FND-3 — JSONType definitions + CodeGen.** _deps: VS-FND-2, VS-SPEC-1._ JSONType metadata for `Style`, `Voice`, `BeatTemplate`, `Pacing` → core interfaces; `mj sync push` **before** `mj codegen`; commit CodeGen tail. **AC:** typed entity classes with typed JSON accessors; `check:codegen-tail` passes.
- **VS-FND-4 — Seed metadata.** _deps: VS-FND-3._ `metadata/video-archetypes/` (8 archetypes, guidance via `@file:`), a sample org-wide brand kit ("MemberJunction"), entity permissions/roles, `Video Production` artifact type + extract rules. **AC:** `mj sync validate` clean; push succeeds on a clean DB.
- **VS-FND-5 — Engine cache.** _deps: VS-FND-3._ `VideoStudioEngine extends BaseEngine` caching archetypes, brand kits, assets (Configs + `ObserveProperty`), `BaseSingleton`. **AC:** unit tests; reactive updates on save.

### VS1 — Consult channel (core framework, §6)
- **VS-CON-1 — Migration.** _deps: none._ `V<ts>__v6.2.x__Agent_Consult_Chat_Handling.sql`: CHECK + `Consult` on `AIAgent.ChatHandlingOption`; new `AIAgentRelationship.ChatHandlingOption`; `AIAgent.MaxSubAgentConsultRounds`. CodeGen. **AC:** clean apply; generated unions include `'Consult'`.
- **VS-CON-2 — Resolution + consult flow.** _deps: VS-CON-1._ In `base-agent.ts` child, related **and parallel** paths: resolve the option per pairing; under `Consult`, don't terminate, push a `sub-agent-consult` message (question, form summary, child run ID, round), continue the loop. Extend `formatSubAgentResultAsMarkdown` to include `Message` / `FinalStep` / form. **AC:** new `sub-agent-chat-consult.test.ts` on the `base-agent-loop` harness covers answer / escalate / bound-exceeded / parallel.
- **VS-CON-3 — Resume a child.** _deps: VS-CON-2._ `AgentSubAgentRequest.resumeRunId`; `ExecuteSubAgent` passes `lastRunId` + `autoPopulateLastRunPayload`, injects the prior question as an assistant turn; loop agent type parses it. **AC:** tests prove payload + question continuity across the resumed child run.
- **VS-CON-4 — Escalation + human resume.** _deps: VS-CON-2._ Root parent Chat creates the `AI Agent Request`; on human response the parent resumes and can re-invoke the child with `resumeRunId`. **AC:** integration bundle (deterministic tier) with a stub child that asks, parent escalates, response resumes both.
- **VS-CON-5 — Fix `Retry` remap.** _deps: VS-CON-2._ No terminate; question surfaced to parent. Replace `chat-handling-option.test.ts`'s copied logic with tests against real `BaseAgent`. **AC:** tests fail before / pass after.
- **VS-CON-7 — Caller-selected presets (§6.5).** _deps: VS-CON-1._ Migration adds `AIAgentRelationship.ConfigurationPresetID` (same migration as VS-CON-1); `AgentSubAgentRequest.presetName`; resolution in `ExecuteSubAgent`; presets listed in the sub-agent catalog; task-graph node `PresetName` + `TaskGraphAgentRunner` passes `configurationId`; `AgentSpec`/`AgentSpecSync` support. **AC:** tests prove per-call > relationship > inherit; an invalid preset name returns a validation error to the parent; the child run records the resolved configuration.
- **VS-CON-6 — Prompt + spec plumbing + docs.** _deps: VS-CON-2._ System-prompt section + snapshot update; `AgentSpec`, `AgentSpecSync`, MCP validators accept `Consult`; docs (`sub-agents-guide.md`, `HUMAN_IN_THE_LOOP.md`, `AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md`). **AC:** snapshot test updated; AgentSpecSync round-trips the field on relationships.

### VS1A — Sage transfers (`Handoff`, §6A)
- **VS-SAGE-1 — `Handoff` step type.** _deps: none._ Types in CorePlus (`agent-types.ts`), loop response type + parsing (`loop-agent-type.ts`, `loop-agent-response-type.ts`), `enableHandoff` gate + alignment, system-prompt section, `Handoff` run step. **AC:** `loop-agent-type-handoff.test.ts` covers gate off/on, terminal behavior, never folded.
- **VS-SAGE-2 — Target resolution + permissions.** _deps: VS-SAGE-1._ Active + directly discoverable + run permission + host `AllowedAgentIDs` + not self; Retry lists valid candidates. **AC:** `base-agent-handoff.test.ts`: permission denied, not discoverable, not allowed, self-handoff, unknown name.
- **VS-SAGE-3 — Server-side execution.** _deps: VS-SAGE-2._ `RunAIAgentResolver` + `ConversationAgentRunner` follow-through: new detail (ParentID = source), `RunAgentInConversation` with full context, preset precedence (§6A.3 #4, `FindConfigurationPresetForAgent` moved server-side), hop cap + no ping-pong, audit. **AC:** resolver test (pattern: `RunAIAgentResolver.historyFrom.test.ts`) proves a top-level target run, `AgentID` attribution, target's preset, and the hop cap.
- **VS-SAGE-4 — Sage prompt + task-graph fixes.** _deps: VS-SAGE-1._ Rewrite `sage.template.md` §4 (Handoff vs Tasks v2), `<suggested_agent>` guidance, `enableHandoff:true` on Sage; `describeFold` only folds resolvable targets; `TaskGraphService.resolveAgents` permission check. **AC:** template-examples-validate regression test; `loop-agent-type-task-graphs.test.ts` gains an unrelated-agent case.
- **VS-SAGE-5 — Client + messaging adapters.** _deps: VS-SAGE-3._ Transfer chip on the source detail; continuity routing verified; remove dead `invokeAgent` / `taskGraph` client branches; `BaseMessagingAdapter` consumes Handoff + permission check. **AC:** `BaseMessagingAdapter.test.ts` + `agent-turn-host-rules.test.ts` updated; Playwright: "Sage, have the Research Agent look into X" → a Research Agent reply attributed to it, and the follow-up message stays with Research Agent.
- **VS-SAGE-6 — Integration check + docs.** _deps: VS-SAGE-3, VS-SAGE-4._ Deterministic-tier bundle: Sage hands off to Research Agent (stubbed model); assert top-level run, attribution, preset, continuity. Update or remove `packages/MJServer/src/services/TaskOrchestration-Integration.md`; document Handoff vs Consult vs Sub-Agent vs Tasks in `guides/AGENT_SKILLS_AND_PLAN_MODE_GUIDE.md` (or a new conversation-routing guide). **AC:** `pnpm run test:integration` passes with the new check.

### VS2 — The spec
- **VS-SPEC-1 — Types.** _deps: VS-FND-1._ `VideoGenerationSpec` + sub-types + manifest + render wire contract in `video-studio-core`. **AC:** browser-safe (no server imports); exported; TSDoc on every field.
- **VS-SPEC-2 — Validator.** _deps: VS-SPEC-1._ Pure stage-aware `ValidateVideoGenerationSpec` with error codes (§3.2) + engine-side async validator. **AC:** ≥90% branch coverage; fixtures per error code.
- **VS-SPEC-3 — Prompt-types generation.** _deps: VS-SPEC-1._ Generalize `generate-prompt-types.mjs` to accept a package root + FILE_CONFIGS; wire as `video-studio-core` postbuild. **AC:** `generated-for-prompt/video-generation-spec.ts.generated-for-prompt.md` produced; CorePlus output unchanged byte-for-byte.

### VS3 — Render tier (§7)
- **VS-RND-1 — Worker.** _deps: VS-SPEC-1._ `video-studio-render-worker`: HTTP service (render, stills, contact sheet, check, keyframes, health); exact-pinned HyperFrames packages; ffmpeg detection; per-render temp dirs; injected CSP + lint URL gate; unprivileged execution; timeouts. `Dockerfile` (Node 24, ffmpeg, Chrome deps). **AC:** golden-fixture composition renders to MP4 locally; stills at exact times; contact-sheet PNG; health reports versions; a composition that fetches a remote URL is rejected by lint and, if forced, blocked by CSP (test).
- **VS-RND-2 — Port + LocalWorker driver.** _deps: VS-RND-1._ `VideoRenderDriverBase`, registry, config, managed spawn (ephemeral port, health poll, cleanup) + progress + AbortSignal. **AC:** engine-level test renders through the driver; cancellation kills the job.
- **VS-RND-3 — Remote driver.** _deps: VS-RND-2._ **AC:** same suite passes against a separately started worker via `VIDEO_STUDIO_RENDER_URL`.
- **VS-RND-4 — Docker driver.** _deps: VS-RND-2._ Uses `DockerSandboxProvider` (`--network none`, limits) + worker image. **AC:** same suite passes when Docker is available; skipped visibly otherwise.
- **VS-RND-5 — Deterministic checks.** _deps: VS-RND-1._ Lint + layout/contrast + MJ checks (safe area, min text size, data-literal scan, missing assets). **AC:** each check has a failing fixture.

### VS4 — Audio (§8)
- **VS-AUD-1 — TTS alignment.** _deps: none._ `IncludeTimestamps` / `Alignment` on AI Core audio types; ElevenLabs `convertWithTimestamps`; `DeriveWordTimings`. **AC:** unit tests (mocked SDK); other drivers unaffected.
- **VS-AUD-2 — Narration pipeline.** _deps: VS-AUD-1, VS-SPEC-1._ Per-line synthesis via `AITextToSpeechRunner`, upload clips to storage, beat-length fit, captions from word timings, cue placement. **AC:** fixture spec → timeline whose beat lengths match clip durations; caption file produced.

### VS5 — Data stories (§10)
- **VS-DAT-1 — Snapshot capture.** _deps: VS-SPEC-1._ Execute bindings as `contextUser` (batched), freeze snapshot (inline/storage), provenance. **AC:** RLS respected (integration test with a restricted user); snapshot round-trips.
- **VS-DAT-2 — Chart kit.** _deps: VS-RND-1._ Seekable, token-driven primitives (§10.3) injected into bundles. **AC:** each primitive renders deterministically at arbitrary seek times (golden stills).
- **VS-DAT-3 — Literal enforcement + provenance card.** _deps: VS-DAT-1, VS-RND-5._ **AC:** a composition with an unbound number fails checks; end card shows as-of.

### VS6 — The agent (§5)
- **VS-AGT-1 — Agent metadata.** _deps: VS-FND-4._ Root + 7 children, payload paths, relationships (Research Agent, Query Builder), presets, child AI Configurations + params, prompt records + templates, prompt-model bindings (§5.2). **AC:** `mj sync validate` clean; preset picker shows Draft/Standard/High.
- **VS-AGT-2 — `VideoStudioAgent` driver + gates.** _deps: VS-AGT-1, VS-SPEC-2._ Gate enforcement (§5.4), Plan Mode at root, Consult-aware approval as sub-agent, progress messages between stages. **AC:** unit tests per gate; a run cannot reach Delivered without evidence.
- **VS-AGT-3 — Pre-Production + Render code agents.** _deps: VS-AGT-2, VS-RND-2, VS-AUD-2, VS-DAT-1._ **AC:** deterministic, no LLM calls; Agent Run Steps record outputs.
- **VS-AGT-4 — Motion Engineer lint-fix loop.** _deps: VS-AGT-1, VS-RND-5._ Max 3 attempts, one step per attempt. **AC:** test with a lint-failing first draft.
- **VS-AGT-5 — Critic + repair loop.** _deps: VS-AGT-3, VS-RUB-1._ Vision prompt with tiled sheets, top-3 defects, bounded rounds by preset param. **AC:** stubbed-model test drives two repair rounds then delivers with notes.
- **VS-AGT-6 — Art Director reference routing.** _deps: VS-MOD-1, VS-RND-1._ Video-capable → `video_url`; otherwise keyframe sheets. **AC:** both routes tested.

### VS7 — Artifact, storage & media fixes (§11)
- **VS-ART-1 — Video Production artifact type + viewer.** _deps: VS-FND-4, VS-SPEC-1._ Type metadata, extract rules, `VideoProductionViewerPlugin` + preview. **AC:** viewer plays MP4 via media streaming; tabs render from spec; dark mode verified.
- **VS-ART-2 — Storage-first outputs.** _deps: VS-AGT-3._ `FileOutputRef` with `fileId`; inline fallback + warning; versioning via `version-source`. **AC:** no base64 MP4 in `AIAgentRunMedia.InlineData`.
- **VS-ART-3 — `SaveAgentRunMedia` FileID fix.** _deps: none._ **AC:** test proves `FileID` set and `InlineData` empty when storage exists; single upload shared with artifact.
- **VS-ART-4 — Video/Audio `DriverClass`.** _deps: none._ **AC:** full-panel viewer resolves for plain Video and Audio artifacts.

### VS8 — Models (§13)
- **VS-MOD-1 — Modality rows.** _deps: none._ Gemini 3.8 Flash, Claude Opus 5.5, Fable 5.1, Sonnet 5.5. **AC:** `ModelSupportsModality` returns expected values (test).

### VS9 — Rubric (§9)
- **VS-RUB-1 — Video Production Quality rubric.** _deps: none._ Rubric metadata (criteria, levels), `MJ: AI Agent Rubrics` link (Evaluation). **AC:** published rubric; critic prompt pulls criteria from it.

### VS10 — Invocation surfaces (§5.5, §10.5)
- **VS-INV-1 — Sage → Video Studio transfer.** _deps: VS-AGT-1, VS-SAGE-3._ Description and metadata tuned so Sage (Find Candidate Agents) picks Video Studio for video requests. **AC:** "make a 60-second explainer about X" in a Sage conversation produces a top-level Video Studio run with the user's preset, and the follow-up "make the intro faster" stays with Video Studio.
- **VS-INV-2 — Caller relationships.** _deps: VS-CON-2, VS-AGT-1._ Query Builder / Research Agent → Video Studio with `Consult` + mappings + optional preset (Sage reaches Video Studio by Handoff, not as a sub-agent). **AC:** integration test: Query Builder output → KPI Briefing film.
- **VS-INV-3 — Action exposure.** _deps: VS-AGT-1._ `ExposeAsAction` param mapping (topic, archetype, brand kit, formats, power level, data refs). **AC:** action run returns artifact + file IDs.
- **VS-INV-4 — Scheduled-job driver fixes.** _deps: none._ Pass `ConfigurationID`, `CompanyID`, `ConversationID` through `AgentScheduledJobDriver`. **AC:** unit tests; monthly KPI recipe documented.

### VS11 — UX, docs, quality
- **VS-UX-1 — Application + resources.** _deps: VS-FND-5, VS-ART-1._ Application metadata; Productions, Studio, Brand Kits, Archetypes resources; lazy module; manifests. **AC:** `check:ui` clean; Playwright walkthrough (create brand kit → produce → iterate → share).
- **VS-UX-2 — Copilot.** _deps: VS-UX-1._ Pinned chat area with preset picker. **AC:** first send works in a new conversation; artifacts open in viewer.
- **VS-UX-3 — Setup health card.** _deps: VS-RND-2._ Storage account resolved? Render driver healthy (ffmpeg, Chrome)? Models available? **AC:** each failure state renders an actionable message.
- **VS-DOC-1 — Guide.** _deps: all._ `guides/VIDEO_STUDIO_GUIDE.md` (indexed in `guides/README.md`): architecture, spec, presets, render drivers + deployment (Docker image, ffmpeg), storage setup, data stories, consult channel, HyperFrames attribution. **AC:** `check:claude-md` links valid.
- **VS-QA-1 — Tests.** _deps: all._ Unit tests per package; integration bundles in the deterministic tier with a **fake render driver** (no Chrome in CI) and stubbed models; one opt-in live smoke test (real worker + real models) documented. **AC:** `pnpm run test:integration` passes; counts reported.
- **VS-QA-2 — Changesets.** _deps: all._ `minor` (migrations + metadata). **AC:** `check:changeset` clean.

---

## 16. Decisions log
| # | Decision | Date |
|---|---|---|
| D1 | Core MJ capability, packages `video-studio-core` / `video-studio` / `video-studio-render-worker` | 2026-10-05 |
| D2 | Code-rendered first; HyperFrames renderer behind a driver port | 2026-10-05 |
| D3 | `VideoGenerationSpec` is the payload and the artifact content; typed + pure validator, no Zod | 2026-10-05 |
| D4 | Entities `MJ: Video Archetypes`, `MJ: Video Brand Kits`, `MJ: Video Brand Kit Assets`; nullable `CompanyID` = org-wide | 2026-10-05 |
| D5 | Productions are artifacts; iterations are versions | 2026-10-05 |
| D6 | Power levels Draft/Standard/High via child AI Configurations; Standard = Gemini 3.8 Flash, High = Claude Opus 5.5 | 2026-10-05 |
| D7 | New `ChatHandlingOption = 'Consult'` (agent + relationship) for agent-to-agent questions; bounded; human keeps final word | 2026-10-05 |
| D8 | Render runs out of process from day one; LocalWorker default, Remote and Docker drivers built now | 2026-10-05 |
| D9 | MJStorage-first outputs; inline only as small/unconfigured fallback | 2026-10-05 |
| D10 | Data-bearing videos: sharer's responsibility; no system enforcement this phase | 2026-10-05 |
| D11 | Every on-screen number is bound to data; literal scan enforces it | 2026-10-05 |
| D12 | Everything in one phase, including HITL, sandboxing, reference video, UI | 2026-10-05 |
| D13 | Callers choose sub-agent presets: per-call `presetName` → relationship `ConfigurationPresetID` → inherit | 2026-10-05 |
| D14 | Sage gets a first-class **Transfer** (hand the conversation to another agent as a top-level run), fixed in this work | 2026-10-05 |
| D15 | HyperFrames network hook: offered upstream; pnpm patch fallback; security never depends on it | 2026-10-05 |

## 17. Open questions
- **O-1** Is a dedicated production entity needed for gallery performance, or do artifact extract rules suffice?
- ~~O-2~~ **Resolved:** callers can choose a sub-agent's preset (§6.5, D13).
- ~~O-3~~ **Resolved:** Sage transfers are fixed as part of this work (§6A, D14).
- **O-4** Lambda / Cloud Run render drivers: include or follow-on?
- **O-5** HyperFrames `check` (layout/contrast/motion) is CLI-only in v0.8.134. Is the subprocess-in-worker approach acceptable, or should we upstream a library export (bundle with the O-6 contribution)?
- ~~O-6~~ **Resolved:** contribute an additive hook upstream; fall back to a pnpm patch; security never depends on it (§7.3, D15).
- **O-6b** Fork `@hyperframes/engine` only if both upstream and the patch fail.
- **O-7** Automatic music beat detection in v1?
- **O-8** Broader audit of AI model modality rows beyond the models Video Studio binds.
