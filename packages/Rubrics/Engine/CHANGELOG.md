# @memberjunction/rubrics

## 6.2.0-edge.4

### Minor Changes

- 7384dd6: Conversation forks: a conversation is Main (the messages with no branch) plus forks (`MJ: Conversation Branches`). A fork starts at a message and shows as a chip under it (kind icon, up to three avatars, message count, name, last activity); it opens as a full view where the inherited history sits faded behind a dashed rail, up to a fork marker, and the fork's own messages behind a solid rail. "Fork from here" on one of your own messages opens a new fork that replaces that message at once (it starts from the message before it, the composer starts with the message's text, the fork is created on the first send and named from that message, and leaving without sending creates nothing), Edit ("Save as fork"; the original message stays) and Regenerate (the first answer stays) each start a fork. A Forks button lists every fork, nested under its parent, with All and Mine filters. Everyone who can see a conversation sees its forks and who started each one. What a person is looking at is per person and in memory; nothing about the view is stored on the conversation, and changing the view ends an active voice session.
  - New entity `MJ: Conversation Branches` with `Kind` (Fork, Edit, Regenerate; default Fork), `SourceDetailID` and `UserID`; new columns `ConversationDetail.BranchID` and `ConversationDetail.ReplacedAt` (migration, so `minor`).
  - New authorization `Conversations: Fork`, granted to the UI role. The server refuses to create a fork for a person without it; deny it to a role to turn forking off for that role's members. Each person can also switch forking off in My Profile ("Fork when I edit or regenerate"; user setting `mj.conversations.forking.v1`).
  - When forking is off for a person, Edit and Regenerate change the latest turn in place: Regenerate (latest answer) and "Save and resend" (latest user message) hide the current answer and run the agent again; earlier user messages can still be edited ("Save", shown as edited). A replaced answer keeps its row (`ReplacedAt` and `HiddenToUser` set) and is left out of the chat, export, pins, the mobile transcript, rubric subjects, the returning-visitor recap and every agent context read (`ConversationEngine.LiveRowsFilter` and `IsReplacedRow`). A turn a fork depends on is not changed in place.
  - Every writer sets `BranchID` itself (null is Main): the composer and its agent turns, `AgentRunner`, the task-graph deliverer, an agent request resumed from the Agent Requests dashboard or API (the fork of the message that started the run) and realtime transcripts (a voice session's fork is fixed when it starts). The server no longer stamps it and refuses a `BranchID` that names a fork of another conversation.
  - A fork that still has its own messages or child forks cannot be deleted on its own (its messages would move into Main); deleting the conversation deletes its forks and messages.
  - `ConversationEngine` gains `CreateFork`, `ForkPointFrom`, `EditForkPoint`, `RegenerateForkPoint`, `SourceRowsFilter`, `BuildForkSummaries`, `LoadForkSummaries`, `ForkDisplayName`, `LiveRowsFilter` and `IsReplacedRow`.
  - **Removed public Angular API** (the ParentID-based thread panel; a host app that binds any of these must drop the binding): `ConversationChatAreaComponent`'s `ThreadId` input and `ThreadOpened`/`ThreadClosed` outputs; the `ThreadPanelComponent` export; `ConversationWorkspaceComponent`'s `OpenThread`, `CloseThread` and `SelectedThreadId`; `ChatConversationsResource`'s `SelectedThreadId`, `OnThreadOpened` and `OnThreadClosed`; `MessageListComponent`'s `ReplyInThread` and `ViewThread` outputs. Their deprecated camelCase aliases (`threadId`, `threadOpened`, `threadClosed`, `openThread`, `closeThread`, `selectedThreadId`, `onThreadOpened`, `onThreadClosed`, `replyInThread`, `viewThread`) are removed with them.

  Message-anchored scope: every reader of one conversation reads one path through `ConversationScope` (`LoadScope`, `TrunkScope`, `ScopeFilter`, `ScopeSubquery`, `IsInScope`, `FilterToScope`, `ArtifactVersionScopeFilter`): the open view in the chat (window, pins, artifacts, agent polling, export, voice start), and Main for the mobile app, the realtime widget, meeting transcripts, the conversation overview, rubric subjects and the returning-visitor recap. Artifact history is path-aware: the viewer takes a `Scope` input and lists only the versions a message on the path links (any direction) or that no message links, labels a gap as `v4 · from v2`, and falls back to the newest visible version with a notice. Search results carry the fork of each hit; opening one opens that fork, or Main. Skip requests carry `conversationBranchID` from the reply's fork, so Skip Brain keeps one mirror record per path.

### Patch Changes

- a28ce42: Security: the `RunAction` mutation now authorizes each action. Scope-limited sessions (magic-link and widget guests, resource-scoped links) are refused. An Owner may run any action. Any other user needs a role that holds an authorization linked to the action through `MJ: Action Authorizations`; an inactive or denied linked authorization grants nothing, even through its parent. The links, the authorizations and their role grants are all read from the request's provider. An action with no such link runs only when the class that runs it declares `BaseAction.AuthorizesCaller` itself (the Database Designer, rubric and interactive-form actions do); a subclass does not inherit the marker. The client can no longer switch off the action execution log (`SkipActionLog` is ignored).

  `Calculate Expression` now evaluates with a number-only math parser (mathjs 15.2.0) and an allowlist of operators, functions and constants instead of `new Function`, and `Conditional` evaluates with `SafeExpressionEvaluator`. `Run Ad-hoc Query` applies the same checks as `ExecuteAdhocQuery`: it refuses scope-limited sessions, runs only on the read-only database login, and its SQL must pass `ExecuteAdhocQuery`'s table check and timeout limit. MJServer registers both with the action engine at startup (`ActionEngineServer.SetReadOnlyProviderFactory`, `SetAdhocSQLAuthorizer`). Each can be registered once, and a second registration throws. Without them the action refuses.

- Updated dependencies [96d6ec2]
- Updated dependencies [a709bb6]
- Updated dependencies [d17de94]
- Updated dependencies [7ada797]
- Updated dependencies [432cb73]
- Updated dependencies [293c316]
- Updated dependencies [155aa45]
- Updated dependencies [6cd23e1]
- Updated dependencies [51634e7]
- Updated dependencies [1d6e3e8]
- Updated dependencies [de2dc2f]
- Updated dependencies [1da00cb]
- Updated dependencies [b699a37]
- Updated dependencies [a4b23b7]
- Updated dependencies [49f26d9]
- Updated dependencies [961d529]
- Updated dependencies [10c2311]
- Updated dependencies [7384dd6]
- Updated dependencies [88e6902]
- Updated dependencies [bb3028a]
- Updated dependencies [6dc3aa9]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [432fe69]
- Updated dependencies [4889fb2]
- Updated dependencies [b2441c3]
- Updated dependencies [69e19c5]
- Updated dependencies [7316ac3]
- Updated dependencies [8ef5e86]
- Updated dependencies [596855c]
- Updated dependencies [fdf6669]
- Updated dependencies [4c682c1]
- Updated dependencies [f325baa]
- Updated dependencies [08a4cfc]
- Updated dependencies [b09fe34]
- Updated dependencies [8bac4d6]
- Updated dependencies [08b3d7b]
- Updated dependencies [5a3de97]
- Updated dependencies [0d0ba18]
- Updated dependencies [b6fcb30]
- Updated dependencies [f73e192]
- Updated dependencies [8704df6]
- Updated dependencies [5345e3d]
- Updated dependencies [1ea4085]
- Updated dependencies [975948b]
- Updated dependencies [22c9074]
- Updated dependencies [88b85fc]
- Updated dependencies [aee2d53]
- Updated dependencies [5dc3752]
- Updated dependencies [6c8798b]
- Updated dependencies [f0c78c3]
- Updated dependencies [25f7b82]
- Updated dependencies [35ed7b5]
- Updated dependencies [d853bf8]
- Updated dependencies [e293b68]
- Updated dependencies [02bb563]
- Updated dependencies [afe9eb4]
- Updated dependencies [90829e3]
- Updated dependencies [57096ab]
- Updated dependencies [aac148b]
- Updated dependencies [a28ce42]
- Updated dependencies [d2cb42e]
- Updated dependencies [cbddadb]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [57fea6a]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [6b487b8]
  - @memberjunction/ai-core-plus@6.2.0-edge.4
  - @memberjunction/core-entities@6.2.0-edge.4
  - @memberjunction/ai@6.2.0-edge.4
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/ai-prompts@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/actions@6.2.0-edge.4
  - @memberjunction/actions-base@6.2.0-edge.4
  - @memberjunction/rubrics-base@6.2.0-edge.4

## 6.2.0-edge.3

### Minor Changes

- b545842: Rubric evaluators are pluggable. `RubricEngine` creates the evaluator a call names through the class factory (`BaseRubricEvaluator`), so a host can register its own and run it from `EvaluateRecord`, an agent-rubric link's `EvaluatorConfig`, a calibration test, the Evaluate Record Against Rubric action, or `mj rubric evaluate`. Adds a `Decision` evaluator that scores every level-scale criterion as a typed Score question on a Decision-type model (Default Decision: Jev, then LLM Decision) in one call. The LLM evaluator now honors `PromptID`/`PromptName`, `ModelID`, `Mode`, and `Samples`. Self-check, production sampling, and the rubric test oracle honor the link's whole evaluator selection. Evaluations record the evaluator's own type and name, and `AIPromptRunID`/`AIAgentRunID` now point at the run that produced the evaluation instead of the subject. The minor bump is for the updated Evaluate Record Against Rubric action metadata.

  The LLM evaluator's prompts are now metadata. It builds template data and composes three stored prompts into one call: **Rubric Evaluator** (the parent, which owns the JSON reply contract), a **judge** rendered into its `judgePrompt` slot through the prompt runner's child-prompt composition, and **Rubric Criterion**, which renders each criterion (the Decision evaluator asks the same text). The subject is a separate, nonce-delimited user message. `PromptID`/`PromptName` now name the judge; `SystemPromptID`/`Name`, `CriterionPromptID`/`Name`, and `ModelSelection` are new settings. The packaged template copy and `RenderRubricEvaluatorPrompt`, `BuildRubricEvaluatorMessages`, and `FillRubricEvaluatorTemplate` are removed; `BuildCriteriaPromptData`, `PromptData`, `RenderCriteriaText`, and `BuildSubjectMessage` replace them, and `RubricPromptService` gains `RenderCriteria` and `Preview`. Sixteen judge prompts ship, a default and one per core agent (Research Agent and its sub-agents, Sage, Query Builder, Query Strategist, ActionSmith, SkillSmith, Codesmith, Database Designer, Duplicate Resolution, Infographic), every core agent's rubric link names its own, and Sage gains an **Assistant reply** rubric and a Core agent rubrics test. The `llm-judge` oracle runs through the same prompts and accepts a `judgePrompt` config. Agent evaluation tests now propagate the agent link's evaluator configuration to implicit rubric oracles, conversational agent responses fall back to `Message` when `FinalPayload` is empty, and `TraceValidatorOracle` orders step records by `StepNumber` instead of `Sequence`.

### Patch Changes

- bea2386: A run can now be restricted to the credentials its caller supplied, so a customer's work never silently runs on the platform's AI keys.

  Key resolution matched per driver class and fell back to the platform for any class the run did not key. A host running work on a customer's own key had no way to say "only these keys": when the customer's Google key was rejected, failover moved to Vertex, found no customer key, and finished the run on the platform's account — reporting success. Internal prompts that dropped `apiKeys` (AI JSON repair, the parallel result selector) reached the platform key the same way with no failover at all.
  - **`CredentialScope: 'Any' | 'RuntimeOnly'`** (`AICredentialScope` in `@memberjunction/ai`) on `ExecuteAgentParams` and `AIModelRunParams` (so `AIPromptParams`). Omitting the parameter means `'Any'`, which resolves keys as before (the fixes below change some defaults regardless). `'RuntimeOnly'` allows only `apiKeys` and a prompt's per-request `credentialId`: every platform source — `AICredentialBinding`s, the vendor's default credential and `AI_VENDOR_API_KEY__*` — is skipped.
  - Every scope decision goes through `CredentialScopeAllows(scope, source)` in `@memberjunction/ai`, where `source` is an `AICredentialSource` — `'Runtime'`, `'PlatformCredential'` or `'Environment'`. Its exhaustive switch makes a new scope value a compile error until it is answered, and an unknown value at runtime throws rather than falling back to the platform.
  - Enforced in `BaseModelRunner.HasCredentialsAvailable` and `ResolveCredentialForExecution`, which every runner shares. Because candidate selection uses the first, failover stays on vendors the caller keyed; a run they do not cover fails with "No suitable model found … credential scope is RuntimeOnly" instead of running on the platform's key.
  - `BaseAgent` carries the scope to every prompt, sub-agent, action, realtime delegate and realtime session in the run. `GetAIAPIKey` and `MakeAIAPIKeyResolver` take an optional `scope`; `RealtimeClientSessionService` drops its `getAPIKeyForDriver` seam under `'RuntimeOnly'`; image and media runner params gain `CredentialScope`.
  - `@memberjunction/actions-base`: `RunActionParams.CredentialScope` (`RuntimeCredentialScope`). Under `'RuntimeOnly'` the `RuntimeAPIKeyResolver`'s answer is final. `Generate Image` honours it, and Summarize Content, Run Ad-hoc Query, Execute AI Prompt and Execute Agent forward it to the prompt or agent they run — they are not handed the run's keys, so under `'RuntimeOnly'` they fail rather than spend the platform's.
  - Decision calls (FinishIf, decision requests, discovery, catalog narrowing, the payload change check) carry the run's execution scope through `AgentDecisionService` (`AgentDecisionAskParams.ExecutionScope`) to `AIDecisionRunner`, and `LLMDecision`'s own chat prompt runs under it (`LLMDecision.ExecutionScope`). Self-check rubrics do too: `ProviderRubricEngine`, `ProviderPromptService` and `ProviderDecisionService` take an optional execution scope, and the rubric evaluation agent runs under it.
  - A model driver is never constructed without a key under a scope that rules out environment keys: the OpenAI and Anthropic SDKs read `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` themselves when handed none, which parallel prompt tasks could reach.
  - Not covered by the scope: retrieval reranking and embeddings outside a prompt run (platform infrastructure), and agent-harness credential grants.
  - **Prompts started on a run's behalf now run under its scope** — user, provider, configuration, `apiKeys`, `credentialId`, `CredentialScope` — via the new `PickPromptExecutionScope` / `AIPromptExecutionScope`: AI JSON repair, the parallel `PromptSelector` judge, `BaseAgent`'s summarize-range and message-compaction sub-calls, conversation compaction (`CompactIfNeededInput.ExecutionScope`) and conversation naming. Each forwarded `contextUser` at most, so each ran on platform keys and the default configuration inside a customer's run. This applies whatever the scope.
  - `ErrorAnalyzer` classifies Google's invalid-key and expired-key responses ("API key not valid" / `API_KEY_INVALID`, "API key expired" / `API_KEY_EXPIRED`, HTTP 400) as `Authentication`. It fell through to `VendorValidationError`, so an invalid key failed over to another vendor instead of failing.
  - **A failed streaming call keeps its driver's classification.** `BaseLLM` rejects a failed stream with its `ChatResult`, not an `Error`. The prompt runner analyzed that object afresh, so an invalid key the driver classified `Authentication`/`Fatal` became `Unknown`/`Transient` with no message: failover continued onto the same dead key, agents retried the step up to their consecutive-failure limit, and every run recorded "Unknown error". `ErrorAnalyzer` now returns an `errorInfo` the value already carries, and the runner records a rejected `ChatResult` as an `Error` with its real message; any other rejected value is classified as itself before it is wrapped. Affects any streamed prompt with a non-retryable error, whatever the credential scope.

- Updated dependencies [25bb295]
- Updated dependencies [dfe40a4]
- Updated dependencies [131f3c4]
- Updated dependencies [0f04590]
- Updated dependencies [0a75bb2]
- Updated dependencies [41c2c08]
- Updated dependencies [29b6ec3]
- Updated dependencies [279b93e]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [bea2386]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
- Updated dependencies [ec97ad4]
- Updated dependencies [49e0bd8]
  - @memberjunction/ai@6.2.0-edge.3
  - @memberjunction/core-entities@6.2.0-edge.3
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/ai-prompts@6.2.0-edge.3
  - @memberjunction/ai-core-plus@6.2.0-edge.3
  - @memberjunction/actions-base@6.2.0-edge.3
  - @memberjunction/actions@6.2.0-edge.3
  - @memberjunction/rubrics-base@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 4d647e6: Add Rubrics, a core way to score any record against a published set of weighted criteria.

  What ships:
  - Schema for rubrics, versions, criteria, scales, anchors, bands, evaluations, and score rows, plus layered consensus views. Published versions are frozen. Raw writes to a frozen row throw 51101–51110. A draft version delete is an `INSTEAD OF DELETE` trigger. `MJ: Test Rubrics` is deprecated in metadata.
  - `RubricScoring` and `RubricVersionDiff` in `@memberjunction/rubrics-base`. The outcome ladder is Incomplete, NotApplicableFailure, GateFailed, Passed or BelowThreshold, then Scored. The publish base is the highest Published or Retired version.
  - `@memberjunction/rubrics`: LLM, agent, deterministic, and human evaluators. Actions are Evaluate Record Against Rubric, Get Rubric, Get Rubric Subject, Get Rubric Consensus, Create Rubric Draft, and Submit Human Rubric. Create Rubric Draft and the architect import do not publish. The evaluation agent does not call Get Rubric Consensus.
  - Presentational widgets in `@memberjunction/ng-rubrics`, Explorer forms, and a Rubrics application. The agent form has a Rubrics tab.
  - Six guide-example rubrics stay Draft. Seven agent rubrics publish at 1.0.0 and bind to their agents. Marketing Agent is not bound. Shipped self-check links and the sampling job stay Disabled. A test that already has an `llm-judge` oracle keeps it.
  - Testing: rubric resolution, a `rubric` oracle, judge calibration, per-criterion spread on `--flaky-check`, `mj rubric`, and `mj test promote-criteria`. `Test.RubricID` and `TestSuite.RubricID` select a rubric. `TestSuiteRun.Score` is stored.
  - The deterministic integration bundle is IT98 at sequence 49.

  `GeneratePluralName` keeps the head of a name verbatim and pluralizes only the tail, preserving that tail's case. A linear scan finds the tail, so `user_profile` and `userProfile` no longer produce the same view name, a leading character such as Ä stays on the head, and `Contact Person` pluralizes to `Contact People`. The base view for a criterion is `vwRubricCriteria`.

### Patch Changes

- 7bcba8c: Docs: the Rubrics Guide becomes a task-first guide with diagrams (authoring and publishing, shipping rubrics as metadata, scoring from code, human scoring, consensus, tests, agents, adopting rubrics in an application), and the package READMEs point to it. The ng-rubrics README documents every widget's inputs and outputs.
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
- Updated dependencies [21f9e15]
- Updated dependencies [28fdf22]
- Updated dependencies [4248fb3]
- Updated dependencies [f3c6161]
- Updated dependencies [35ffb95]
- Updated dependencies [5148534]
- Updated dependencies [0adaf76]
- Updated dependencies [ce1a5c3]
- Updated dependencies [ef43cf3]
- Updated dependencies [b44c7cf]
- Updated dependencies [26c0178]
- Updated dependencies [594f2e0]
- Updated dependencies [861cbf0]
- Updated dependencies [705ab4e]
- Updated dependencies [e51ce8a]
- Updated dependencies [96daca8]
- Updated dependencies [aa912ca]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [14e2a3a]
- Updated dependencies [5986939]
- Updated dependencies [200e634]
- Updated dependencies [4d647e6]
- Updated dependencies [7bcba8c]
- Updated dependencies [c35f7e5]
- Updated dependencies [369e229]
- Updated dependencies [d13cf6b]
- Updated dependencies [2854a2e]
  - @memberjunction/ai-core-plus@6.2.0-edge.2
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/ai@6.2.0-edge.2
  - @memberjunction/ai-prompts@6.2.0-edge.2
  - @memberjunction/core-entities@6.2.0-edge.2
  - @memberjunction/actions@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
  - @memberjunction/rubrics-base@6.2.0-edge.2
  - @memberjunction/actions-base@6.2.0-edge.2
