# @memberjunction/ng-composer

## 5.45.1

### Patch Changes

- @memberjunction/ng-ui-components@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Minor Changes

- c1f2d3d: User Routines (P1.5): user-owned scheduled/monitoring routines that run an Agent, Action, or Prompt on a cron schedule. New UserRoutine/UserRoutineRecipient/UserRoutineRun schema; UserRoutineDispatcherDriver scheduled-job driver (1-minute sweep, claim-before-run, bounded concurrency, per-routine isolation, runs as the owner, Template-driven notifications with OnChange result-hash detection, RequestedSkillIDs pre-arming for Agent targets); pure UserRoutineProcessor schedule/notify primitives shared with MJUserRoutineEntityServer (NextRunAt on save, cron validation) and MJUserRoutineRecipientEntityServer (User-xor-Email); lazy non-startup UserRoutineEngine; new @memberjunction/ng-user-routines widget set (list/editor/history + command-center composite + slide-in, cancelable Before/After events, Agent-only creation with categorical ng-trees picker); conversations bottom-sidebar Routines section gated by ShowRoutines input AND entity-Read permission (hosted in both the generic workspace sidebar and Explorer's Chat wrapper); Routines Explorer app; pure cron preset/describe helpers now in @memberjunction/global (CronUtils); mj-tree gains a DefaultExpansion input ('first-level' | 'all' | 'none'); BaseScheduledJob gains IsHighFrequencyByDesign so by-design pollers (the routine dispatcher) opt out of the high-frequency cron warning; Agent-target routines run inside a dedicated per-routine Conversation (Application-scoped via the Routines app so it stays out of the default chat list; RunAgentInConversation writes proper user/assistant turns; standalone fallback when the app is absent); UserRoutine.ConversationID schema + open-conversation and open-execution-record event chains through the conversations hosts; server-side cascade delete (recipients + run bookkeeping) so routines that have run delete cleanly; agent picker is a compact mj-tree-dropdown (DefaultExpansion pass-through added); mj-slide-panel settles to transform:none when open so position:fixed descendants (dropdown panels) keep true viewport coordinates; time-relative sidebar/card/history text is snapshot-based (NG0100 fix); 16-test live integration suite + live Playwright E2E; Explorer notifications page rebuilt (day-grouped cards, sanitized HTML + Markdown message rendering with expand/collapse previews, snapshot relative times, removal of a test harness that created junk Conversations on Mark-All-Read) and the seeded routine notification template gains a compact Markdown Text body that the dispatcher now prefers for in-app delivery (the HTML document stays for email); new @memberjunction/ng-composer package extracts the conversations message composer (mention editor + dropdown + message input box) so the routine editor's InitialMessage field uses the mention editor without an ng-conversations dependency cycle — and the composer's mention/command triggers are PLUGGABLE: a generic ComposerTriggerProvider contract (TriggerChar/Key/Priority/GetSuggestions, generic MentionSuggestion with provider-supplied presets) with two supply modes (explicit [TriggerProviders] list, or ClassFactory discovery via @RegisterClass(ComposerTriggerProvider,'<key>') filtered by [ExcludedTriggerKeys]), leaving ng-composer with ZERO AI knowledge; the AI plugins moved to ng-conversations (composer-plugins: 'agent-mentions' '@' agents+users w/ configuration presets, 'record-mentions' '#' entities+queries, 'skill-commands' '/' skills — tree-shake-guarded by LoadComposerPlugins(); MentionAutocompleteService moved back to ng-conversations as a BaseSingleton engine shared by plugins and components) plus a new mj-ai-composer wrapped component that proxies the full mj-message-input-box surface with the AI triggers built in and familiar EnableAgentMentions/EnableEntityMentions/EnableSkillCommands convenience flags (the chat composer now uses it); the routine editor uses discovery mode with agent-mentions excluded.

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [13716e4]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/ng-ui-components@5.45.0
  - @memberjunction/global@5.45.0
