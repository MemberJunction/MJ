# @memberjunction/ng-media-player

## 6.2.1

### Patch Changes

- Updated dependencies [41142bd]
  - @memberjunction/core@6.2.1
  - @memberjunction/ng-base-types@6.2.1
  - @memberjunction/graphql-dataprovider@6.2.1

## 6.2.0

### Minor Changes

- b0b2cc9: Add Video Studio (`@memberjunction/video-studio-core`, `@memberjunction/video-studio`, `@memberjunction/video-studio-render-worker`), including the Video Studio orchestrator agent and its Pre-Production, Render, Critic, and Repair stages, deterministic G1–G6 quality gates and rubric scoring, optional spoken voiceover narration (`VideoNarrationSpec.Enabled`) with automatic `<audio>` track injection in `BuildRenderBundle`, the isolated HyperFrames render worker and `LocalWorker`, `Remote`, and `Docker` render drivers, the Video Studio application (`Productions`, `Brand Kits`, `Archetypes`) with a built-in `ng-conversations` right-side slide-in copilot pinned to the Video Studio agent, the `Video Production` artifact type and viewer plugin, the `Produce Video` action, and the `VideoStudio.SetupHealth` remote operation and setup health card. Add general `MJ: Brand Kits` (`@memberjunction/ng-brand-kits`) for shared palette, typography, logo, voice, and generation policy management. The Video Studio pages share one right-side slide-in (chat from the first open, the brief above the composer, Iterate on the same conversation), pages can hide the floating chat bubble with `SuppressChatOverlay` in their agent context, and `@memberjunction/ng-brand-kits` adds a brand kit creator with a live preview. Add video generation (`BaseVideoGenerator`, `AIVideoRunner`, the Black Forest Labs FLUX 3 video driver, the `Generate Video` action, and `Per Second` pricing unit support), pre-call generation spend-cap enforcement, and FLUX.2 Pro endpoint, polling, and reported-cost recording fixes. Generated assets are always disclosed in the viewer, inline preview, review notes, and manifest provenance, never stand in for data or `NeverInvent` items, and any integrity criterion failure or synthetic person violation blocks delivery even when repair rounds are exhausted.

  Add the `Consult` sub-agent chat-handling channel (`AIAgent.ChatHandlingOption`, `AIAgent.MaxSubAgentConsultRounds`, `AIAgentRelationship.ChatHandlingOption`), caller-chosen sub-agent configuration presets (`AIAgentRelationship.ConfigurationPresetID`), sub-agent consultation and `resumeRunId` resumption across child, related, parallel, and native sub-agent paths, and root escalation to `MJ: AI Agent Requests` when consult rounds are exhausted. Add peer-to-peer Sage transfers (`Handoff` step type, inline `mj-agent-handoff-card`, conversation ownership chrome, and `FollowHandoffs` messaging-adapter support). `SaveAgentRunMedia` now persists `FileID` on `MJ: AI Agent Run Medias` rows, the artifact viewer registers dedicated Video and Audio plugins, and `AgentScheduledJobDriver` forwards `ConfigurationID` when starting scheduled agent runs.

  Task graphs opted in through agent metadata (`enableTaskGraphs`) now run through `LoopAgentType` with merged prompt parameters and parent hierarchy cycle guards. Explicit `@Sage` mentions or clicking Return to Sage ends specialist agent continuity in every conversation. Follow-up messages to a continued specialist agent resolve that agent's own configuration preset rather than forwarding the conversation manager's preset. Typing a reply in the conversation thread resumes an open sub-agent consult escalated to the user, matching the requests dashboard flow. `ChatHandlingOption = 'Retry'` re-prompts the loop and returns a sub-agent's question to the parent as a result rather than ending the run, capped by the unproductive-retry limit. Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5, and Gemini 3.8 Flash now declare Image and File (and Gemini also Audio and Video) input modalities; Computer Use auto-select now picks Claude Opus 5.5 or Claude Fable 5.1 instead of the text-only fallback, which can change that feature's cost, and chat file attachments turn on for agents using these models. Also harden regex parsing in `@memberjunction/ai-form-builder` and `@memberjunction/database-designer-core` against polynomial backtracking (ReDoS).

  The Video Studio render worker requires Node >= 22 and system `ffmpeg` on `PATH`; the `Docker` render driver is recommended for production deployments.

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [39b35f1]
- Updated dependencies [d17de94]
- Updated dependencies [e97d95c]
- Updated dependencies [6c36fb6]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [a3539d2]
- Updated dependencies [dde482c]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [660ef45]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [7be1684]
- Updated dependencies [21f9e15]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [81aea34]
- Updated dependencies [eb3a8d3]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [42df19d]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [ea4080e]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [a6f8c1c]
- Updated dependencies [08f8966]
- Updated dependencies [48c9cd2]
- Updated dependencies [56d7614]
- Updated dependencies [683f652]
- Updated dependencies [914e6ff]
- Updated dependencies [2274f42]
- Updated dependencies [7e57b48]
- Updated dependencies [35ed364]
- Updated dependencies [0fb3649]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [5df9486]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [dd34a5c]
- Updated dependencies [5fed75a]
- Updated dependencies [4c0eaec]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [80905a1]
- Updated dependencies [397ae9a]
- Updated dependencies [7e72c86]
- Updated dependencies [dbc3462]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [279b93e]
- Updated dependencies [f0c78c3]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [5986939]
- Updated dependencies [8c120db]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [8d1a373]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [d0a8dbf]
- Updated dependencies [b1b6d3d]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [af57e8d]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [b0b2cc9]
- Updated dependencies [dc38250]
  - @memberjunction/core@6.2.0
  - @memberjunction/graphql-dataprovider@6.2.0
  - @memberjunction/ng-base-types@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [dd34a5c]
- Updated dependencies [e69634e]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/graphql-dataprovider@6.2.0-edge.8
  - @memberjunction/ng-base-types@6.2.0-edge.8

## 6.2.0-edge.7

### Minor Changes

- b0b2cc9: Add Video Studio (`@memberjunction/video-studio-core`, `@memberjunction/video-studio`, `@memberjunction/video-studio-render-worker`), including the Video Studio orchestrator agent and its Pre-Production, Render, Critic, and Repair stages, deterministic G1–G6 quality gates and rubric scoring, optional spoken voiceover narration (`VideoNarrationSpec.Enabled`) with automatic `<audio>` track injection in `BuildRenderBundle`, the isolated HyperFrames render worker and `LocalWorker`, `Remote`, and `Docker` render drivers, the Video Studio application (`Productions`, `Brand Kits`, `Archetypes`) with a built-in `ng-conversations` right-side slide-in copilot pinned to the Video Studio agent, the `Video Production` artifact type and viewer plugin, the `Produce Video` action, and the `VideoStudio.SetupHealth` remote operation and setup health card. Add general `MJ: Brand Kits` (`@memberjunction/ng-brand-kits`) for shared palette, typography, logo, voice, and generation policy management. The Video Studio pages share one right-side slide-in (chat from the first open, the brief above the composer, Iterate on the same conversation), pages can hide the floating chat bubble with `SuppressChatOverlay` in their agent context, and `@memberjunction/ng-brand-kits` adds a brand kit creator with a live preview. Add video generation (`BaseVideoGenerator`, `AIVideoRunner`, the Black Forest Labs FLUX 3 video driver, the `Generate Video` action, and `Per Second` pricing unit support), pre-call generation spend-cap enforcement, and FLUX.2 Pro endpoint, polling, and reported-cost recording fixes. Generated assets are always disclosed in the viewer, inline preview, review notes, and manifest provenance, never stand in for data or `NeverInvent` items, and any integrity criterion failure or synthetic person violation blocks delivery even when repair rounds are exhausted.

  Add the `Consult` sub-agent chat-handling channel (`AIAgent.ChatHandlingOption`, `AIAgent.MaxSubAgentConsultRounds`, `AIAgentRelationship.ChatHandlingOption`), caller-chosen sub-agent configuration presets (`AIAgentRelationship.ConfigurationPresetID`), sub-agent consultation and `resumeRunId` resumption across child, related, parallel, and native sub-agent paths, and root escalation to `MJ: AI Agent Requests` when consult rounds are exhausted. Add peer-to-peer Sage transfers (`Handoff` step type, inline `mj-agent-handoff-card`, conversation ownership chrome, and `FollowHandoffs` messaging-adapter support). `SaveAgentRunMedia` now persists `FileID` on `MJ: AI Agent Run Medias` rows, the artifact viewer registers dedicated Video and Audio plugins, and `AgentScheduledJobDriver` forwards `ConfigurationID` when starting scheduled agent runs.

  Task graphs opted in through agent metadata (`enableTaskGraphs`) now run through `LoopAgentType` with merged prompt parameters and parent hierarchy cycle guards. Explicit `@Sage` mentions or clicking Return to Sage ends specialist agent continuity in every conversation. Follow-up messages to a continued specialist agent resolve that agent's own configuration preset rather than forwarding the conversation manager's preset. Typing a reply in the conversation thread resumes an open sub-agent consult escalated to the user, matching the requests dashboard flow. `ChatHandlingOption = 'Retry'` re-prompts the loop and returns a sub-agent's question to the parent as a result rather than ending the run, capped by the unproductive-retry limit. Claude Opus 5.5, Claude Fable 5.1, Claude Sonnet 5.5, and Gemini 3.8 Flash now declare Image and File (and Gemini also Audio and Video) input modalities; Computer Use auto-select now picks Claude Opus 5.5 or Claude Fable 5.1 instead of the text-only fallback, which can change that feature's cost, and chat file attachments turn on for agents using these models. Also harden regex parsing in `@memberjunction/ai-form-builder` and `@memberjunction/database-designer-core` against polynomial backtracking (ReDoS).

  The Video Studio render worker requires Node >= 22 and system `ffmpeg` on `PATH`; the `Docker` render driver is recommended for production deployments.

### Patch Changes

- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [08f8966]
- Updated dependencies [48c9cd2]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [397ae9a]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [b0b2cc9]
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/graphql-dataprovider@6.2.0-edge.7
  - @memberjunction/ng-base-types@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [dae1d31]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [5931f0d]
- Updated dependencies [0a348e2]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/graphql-dataprovider@6.2.0-edge.6
  - @memberjunction/ng-base-types@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [39b35f1]
- Updated dependencies [c159e2f]
- Updated dependencies [db39145]
- Updated dependencies [5e4205c]
- Updated dependencies [0cc6b08]
- Updated dependencies [81aea34]
- Updated dependencies [5465489]
- Updated dependencies [c6b4b85]
- Updated dependencies [d29b5c2]
- Updated dependencies [2274f42]
- Updated dependencies [35ed364]
- Updated dependencies [5fed75a]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [0cc6b08]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/graphql-dataprovider@6.2.0-edge.5
  - @memberjunction/ng-base-types@6.2.0-edge.5

## 6.2.0-edge.4

### Patch Changes

- Updated dependencies [d17de94]
- Updated dependencies [dde482c]
- Updated dependencies [49f26d9]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [dbc3462]
- Updated dependencies [f0c78c3]
- Updated dependencies [90829e3]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
  - @memberjunction/graphql-dataprovider@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ng-base-types@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [d046715]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [d0a8dbf]
- Updated dependencies [b1b6d3d]
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/graphql-dataprovider@6.2.0-edge.3
  - @memberjunction/ng-base-types@6.2.0-edge.3

## 6.2.0-edge.2

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [660ef45]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [0adaf76]
- Updated dependencies [5ee02db]
- Updated dependencies [ea4080e]
- Updated dependencies [7e57b48]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/graphql-dataprovider@6.2.0-edge.2
  - @memberjunction/ng-base-types@6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

- Updated dependencies [a3539d2]
- Updated dependencies [41274aa]
- Updated dependencies [eb3a8d3]
- Updated dependencies [a7da50b]
- Updated dependencies [17cc774]
- Updated dependencies [80905a1]
  - @memberjunction/core@6.2.0-edge.1
  - @memberjunction/graphql-dataprovider@6.2.0-edge.1
  - @memberjunction/ng-base-types@6.2.0-edge.1

## 6.2.0-edge.0

### Patch Changes

- Updated dependencies [7be1684]
- Updated dependencies [e1fd4c1]
- Updated dependencies [9b5b489]
- Updated dependencies [683f652]
- Updated dependencies [5df9486]
- Updated dependencies [f48dffc]
- Updated dependencies [630bb88]
- Updated dependencies [bfd67c6]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [104125c]
- Updated dependencies [5513c2a]
- Updated dependencies [8d1a373]
- Updated dependencies [8a5d2c0]
- Updated dependencies [af57e8d]
- Updated dependencies [2c590b0]
  - @memberjunction/core@6.2.0-edge.0
  - @memberjunction/graphql-dataprovider@6.2.0-edge.0
  - @memberjunction/ng-base-types@6.2.0-edge.0

## 6.1.0

### Patch Changes

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [834f8d7]
- Updated dependencies [b915983]
- Updated dependencies [394d276]
- Updated dependencies [c42c0e8]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [199eb2b]
- Updated dependencies [07cb22e]
- Updated dependencies [1d2ffd4]
- Updated dependencies [e2ad3c0]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [9699d0e]
- Updated dependencies [394d276]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [2d14c62]
- Updated dependencies [c996a56]
- Updated dependencies [38d4482]
- Updated dependencies [052b4c7]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [c996a56]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [8d880cc]
- Updated dependencies [cefc302]
- Updated dependencies [841e6ea]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [d66a26a]
- Updated dependencies [1d88e00]
- Updated dependencies [647bd71]
- Updated dependencies [8288711]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [68b9cf0]
- Updated dependencies [27e4d09]
- Updated dependencies [d90a3ea]
- Updated dependencies [048c5ce]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [8ad04e8]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [98841bb]
- Updated dependencies [53c341c]
- Updated dependencies [2e2879e]
- Updated dependencies [394d276]
- Updated dependencies [b46330e]
- Updated dependencies [fccd0b2]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [2be2960]
- Updated dependencies [cf2484c]
- Updated dependencies [7f3c60c]
- Updated dependencies [97aefcc]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [5fc861f]
- Updated dependencies [1748491]
- Updated dependencies [d7feeae]
- Updated dependencies [a1a8989]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
- Updated dependencies [905820a]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [7fcdc2d]
- Updated dependencies [15319b4]
- Updated dependencies [d0a2a55]
- Updated dependencies [6cd337d]
  - @memberjunction/core@6.1.0
  - @memberjunction/ng-base-types@6.1.0
  - @memberjunction/graphql-dataprovider@6.1.0

## 6.1.0-edge.7

### Patch Changes

- Updated dependencies [c996a56]
- Updated dependencies [c996a56]
- Updated dependencies [cf2484c]
- Updated dependencies [97aefcc]
- Updated dependencies [7fcdc2d]
  - @memberjunction/core@6.1.0-edge.7
  - @memberjunction/graphql-dataprovider@6.1.0-edge.7
  - @memberjunction/ng-base-types@6.1.0-edge.7

## 6.1.0-edge.6

### Patch Changes

- b915983: Align the Angular toolchain on the current 21.x patch line: framework packages 21.1.3 → 21.2.22,
  CLI/builders 21.1.3 → 21.2.23, CDK 21.1.3 → 21.2.14, ng-packagr → 21.2.7, PrimeNG 21.1.1 → 21.1.9.

  This is a patch-level move inside the supported Angular 21 LTS line, not a framework migration.
  It closes every open Angular security advisory on the repository — fifteen distinct GHSAs
  (i18n and template-sanitizer XSS bypasses, service-worker header leakage and credential
  stripping, HttpTransferCache cross-request leakage, and formatDate/number-format DoS), all fixed
  in 21.2.19 or earlier — which together accounted for 438 of the 749 open Dependabot alerts.

  Every published `@memberjunction/ng-*` package's `@angular/*` peer range moves from `^21.1.3`
  (or `^21.0.0`) to `^21.2.22`, so consumers must be on at least that patch. The era-6 platform
  manifest in `release-lines.json` records the new pin; era 5 (the certified 5.51 line) is
  unchanged.

  Also moves the exact `@angular/*` runtime pins that 23 libraries carried in `dependencies`
  into caret `peerDependencies` (adding the missing peers on `ng-react`), so a consumer on any
  in-range Angular 21.2.x build gets a single Angular copy instead of a nested second runtime, and
  drops the unused `primeng` peer from `ng-base-forms` (nothing in the repo imports PrimeNG).

- Updated dependencies [b915983]
- Updated dependencies [197fdf8]
- Updated dependencies [67e4c9e]
- Updated dependencies [0ec1980]
- Updated dependencies [2d14c62]
- Updated dependencies [38d4482]
- Updated dependencies [8d880cc]
- Updated dependencies [6485ef0]
- Updated dependencies [b954812]
- Updated dependencies [9b9e5a4]
- Updated dependencies [f544a93]
- Updated dependencies [9f73528]
- Updated dependencies [63bc733]
- Updated dependencies [92f2ac9]
- Updated dependencies [98841bb]
- Updated dependencies [2be2960]
- Updated dependencies [7f3c60c]
- Updated dependencies [1748491]
- Updated dependencies [b00a985]
- Updated dependencies [041865c]
  - @memberjunction/ng-base-types@6.1.0-edge.6
  - @memberjunction/core@6.1.0-edge.6
  - @memberjunction/graphql-dataprovider@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- Updated dependencies [c42c0e8]
- Updated dependencies [1d2ffd4]
- Updated dependencies [d66a26a]
- Updated dependencies [5fc861f]
- Updated dependencies [d7feeae]
- Updated dependencies [905820a]
  - @memberjunction/core@6.1.0-edge.5
  - @memberjunction/graphql-dataprovider@6.1.0-edge.5
  - @memberjunction/ng-base-types@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [e2ad3c0]
- Updated dependencies [647bd71]
- Updated dependencies [d90a3ea]
- Updated dependencies [8ad04e8]
- Updated dependencies [53c341c]
- Updated dependencies [a1a8989]
  - @memberjunction/core@6.1.0-edge.4
  - @memberjunction/ng-base-types@6.1.0-edge.4
  - @memberjunction/graphql-dataprovider@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [199eb2b]
- Updated dependencies [07cb22e]
- Updated dependencies [c581b4f]
- Updated dependencies [d79fe39]
- Updated dependencies [08829f5]
- Updated dependencies [815b9bc]
- Updated dependencies [f5ec13b]
- Updated dependencies [50987c4]
- Updated dependencies [7b4abe7]
- Updated dependencies [051e0ff]
- Updated dependencies [95fc3e6]
- Updated dependencies [cefc302]
- Updated dependencies [bbb7fcc]
- Updated dependencies [b8130f3]
- Updated dependencies [68b9cf0]
- Updated dependencies [048c5ce]
- Updated dependencies [7300953]
- Updated dependencies [7300953]
- Updated dependencies [2e2879e]
- Updated dependencies [b46330e]
- Updated dependencies [84f276e]
- Updated dependencies [6ecfaa0]
- Updated dependencies [d0a2a55]
- Updated dependencies [6cd337d]
  - @memberjunction/core@6.1.0-edge.3
  - @memberjunction/graphql-dataprovider@6.1.0-edge.3
  - @memberjunction/ng-base-types@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [8288711]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/graphql-dataprovider@6.1.0-edge.2
  - @memberjunction/ng-base-types@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/ng-base-types@6.1.0-edge.1
  - @memberjunction/graphql-dataprovider@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [27e4d09]
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/ng-base-types@6.1.0-edge.0
  - @memberjunction/graphql-dataprovider@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ng-base-types@6.0.0
  - @memberjunction/graphql-dataprovider@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ng-base-types@5.51.0
  - @memberjunction/graphql-dataprovider@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/ng-base-types@5.50.0
  - @memberjunction/graphql-dataprovider@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [505c8b5]
- Updated dependencies [88d707b]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/graphql-dataprovider@5.49.0
  - @memberjunction/ng-base-types@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
  - @memberjunction/core@5.48.0
  - @memberjunction/ng-base-types@5.48.0
  - @memberjunction/graphql-dataprovider@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ng-base-types@5.47.0
  - @memberjunction/graphql-dataprovider@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/ng-base-types@5.46.0
  - @memberjunction/graphql-dataprovider@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/graphql-dataprovider@5.45.1
- @memberjunction/ng-base-types@5.45.1
- @memberjunction/core@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/graphql-dataprovider@5.45.0
  - @memberjunction/ng-base-types@5.45.0

## 5.44.0

### Minor Changes

- aa9102d: feat(media+realtime): generic media player, end-to-end media streaming, and the realtime/LiveKit recording stack

  A new media + recording platform spanning the player, storage, server, and the realtime/voice stack.

  **Generic media player (`@memberjunction/ng-media-player`, new package)** — a framework-agnostic
  `mj-media-player` (transport, click/drag scrubber, playback speed, ±skip, keyboard, fullscreen,
  multi-track video grid, a real decoded audio waveform that doubles as the scrubber and accepts
  precomputed `MediaTrack.Peaks`, a time-synced clickable transcript, loading/buffering state with an
  `aria-live` status, cancelable `Before*` events, and an imperative API) plus an MJStorage-bound
  `mj-storage-media-player` that resolves a `FileID` to an authenticated, range-streamed source. The
  artifact audio/video viewers and previews now embed it.

  **MJStorage streaming (`@memberjunction/storage`)** — `FileStorageBase.GetObjectStream` +
  `SupportsStreaming` + `StreamingNotSupportedError`, implemented for all seven drivers (Box, AWS S3,
  Azure, GCS, Google Drive, SharePoint, Dropbox).

  **Authenticated media delivery (`@memberjunction/server`)** — a `CreateMediaAccessToken` mutation
  (short-lived, permission-gated, returns precomputed waveform peaks) and a `GET /media/:fileId?token=`
  HTTP-Range streaming route — any stored asset is served to the browser by `FileID` with real
  streaming + permissions, no public links.

  **Realtime co-agent recording (`@memberjunction/ng-conversations`, `@memberjunction/ai-realtime-client`,
  `@memberjunction/ai-agents`)** — client-direct sessions record a seekable 16-bit WAV with capture-time
  waveform peaks (a `peaks.json` sidecar); the agent's remote audio is mixed in when its WebRTC track
  lands (`OnRemoteMediaStream`/`AttachRemoteStream`); transcript cue timing anchors to real audio onset
  across tool-call gaps; recorded sessions stream back through the player. Plus reactive fixes
  (`ConversationEngine.EnsureConversationLoaded` in `@memberjunction/core-entities`) so new conversations
  and recordings appear without a refresh.

  **LiveKit meeting recording (`@memberjunction/livekit-room-server`, `@memberjunction/server`,
  `@memberjunction/graphql-dataprovider`, `@memberjunction/ng-mj-livekit-room`)** — egress output is
  registered as an `MJ: Files` row linked to the Meeting-Room `Conversation` (new `RecordingFileID` /
  `EgressID`), with point-at-sink or copy-to-canonical storage, and played back in the Meet UI.

  **Realtime surface-tab overhaul (`@memberjunction/ng-conversations`)** — channel tabs appear only once
  used (Whiteboard excepted), each color/icon-coded; the Activity tab is gated, restyled, and
  right-aligned; agent-run artifacts move out of per-artifact tabs into the Activity tab with a
  resizable, `UserInfoEngine`-persisted split viewer.

  The Media channel can now show MJStorage files (`fileId`) in addition to URLs. The realtime
  recordings dashboard (`@memberjunction/ng-dashboards`) and CodeGen-regenerated entity forms
  (`@memberjunction/ng-core-entity-forms`) reflect the new recording fields.

### Patch Changes

- Updated dependencies [3633fbb]
- Updated dependencies [1367fbb]
- Updated dependencies [5396d90]
- Updated dependencies [7279819]
- Updated dependencies [d44e430]
- Updated dependencies [6f74b17]
- Updated dependencies [aa9102d]
- Updated dependencies [2f9b863]
  - @memberjunction/graphql-dataprovider@5.44.0
  - @memberjunction/core@5.44.0
  - @memberjunction/ng-base-types@5.44.0
