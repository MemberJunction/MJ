# @memberjunction/ng-composer

## 6.1.0-edge.2

### Minor Changes

- 2792d97: Add a Skills button to the composer, beside Plan Mode.

  `/` skill commands already worked, but were reachable only by knowing to type `/`. Nothing on
  screen said the feature existed, so a user who had never been told about it had no way to find it.
  The button is the visible door to the same trigger.

  Clicking it calls the new `MentionEditorComponent.OpenTrigger('/')`, which opens the dropdown
  WITHOUT writing anything into the editor. The trigger character only ever exists as the chip the
  user picks, so dismissing leaves the message exactly as they left it. With no character to anchor
  on, the editor captures a baseline length when a trigger opens this way, and three paths consult
  it: typing filters against the baseline rather than searching for the character, chip insertion
  removes only what was typed, and dismissal has nothing to undo.

  It also toggles: a second click closes, because a disclosure control has to be able to close what
  it opened. Without that the second click re-ran the open path, re-emitting the event pair and
  re-capturing the baseline at the new caret.

  Built as a sibling of the existing strip controls, with the same `attach-button-icon` chrome and
  the same active treatment as Plan Mode. The ARIA deliberately differs: Plan Mode is a toggle button
  (a mode that stays on) so `aria-pressed` is correct there, while this opens a popup and therefore
  uses `aria-expanded` + `aria-haspopup`. Announcing "pressed" for revealing a list is the wrong
  thing for a screen reader to say. It joins the strip's
  visibility gate so a composer offering skills but no attachments, voice or plan mode still renders
  the strip.

  **Before/After pair, per `guides/UI_LAYERING_GUIDE.md` section 6.** Opening skills is an action a
  host might veto, so it ships as `BeforeSkillsOpened` (carrying `BeforeSkillsOpenedEventArgs` with
  `Cancel` / `CancelReason`) and `AfterSkillsOpened`. `After` is not emitted on the canceled path, and
  not emitted when no active provider owns the trigger, so a host counting it counts dropdowns the
  user saw rather than clicks. `Before` handlers must be synchronous: EventEmitter's synchronous
  dispatch is how `Cancel` travels back.

  The base, `CancellableComposerEventArgs`, is per-domain rather than shared. That matches the same
  guide's naming table, which specifies `Cancellable<Domain>EventArgs` for exactly this class, and the
  sixteen packages already following it. It is also the only option here on dependency grounds:
  `ng-composer` is the generic layer and cannot import from `ng-conversations`.

  **The expanded state is derived, not an input.** Plan Mode's active state is a persisted user
  preference the host owns and threads down. "Is the skill dropdown open" is intrinsic to the
  composer, so it reads `MentionEditorComponent.IsTriggerOpen('/')` instead. An `@Input` there would
  be an API no host could answer, and would leave the button permanently collapsed if nobody bound it.

  No new host-level cap: the button is gated on the existing `EnableSkillCommands` /
  `enableSkillCommands` / `allowSkillCommands` chain, which already defaults true at every layer. The
  button and the keystroke are two doors to one feature, so one flag governs both rather than letting
  a composer advertise skills it will not serve.

  **Two pre-existing dropdown bugs fixed along the way**, both of which affect every trigger
  (`@`, `#`, `/`) rather than only the new button:
  - **Click-away never dismissed.** Dismissal relied entirely on the editor's blur, and clicking a
    non-focusable area does not blur a contenteditable, so the dropdown stayed open with nothing able
    to close it. A `document:mousedown` listener now closes it, chosen over `click` because mousedown
    fires before focus moves and therefore cannot race blur's 200ms timer. Clicks inside the
    component are exempt, so a suggestion row still selects. The Skills button sits OUTSIDE the
    editor's host, so it needs the same exemption: without it the button's mousedown read as an
    outside press and closed the dropdown, then the click saw it already closed and reopened it, so
    the toggle never appeared to work. That seam is covered by a DOM test that fires real bubbling
    mousedown/click rather than calling the handler, which is what hid the bug.
  - **The dropdown could land off screen.** Positioning measures the caret, and a collapsed range in
    an empty editor measures 0x0 at 0,0 in every browser, pinning the menu to the bottom-left corner
    of the viewport. It now falls back to the editor's own box. The menu also prefers to open ABOVE
    the composer: the composer sits at the bottom of the chat, so a downward menu covers the text
    being typed.
  - **A button-opened menu anchors to the button, not the caret.** On the typed path the user's eyes
    and query are both at the caret, so the caret is the right anchor. On the button path nobody is
    looking at the caret. The anchored menu aligns left and grows rightward, flipping to right-aligned
    only when that would overflow the viewport — and the flip aligns to the COMPOSER's right edge
    rather than the button's, because the strip is pinned bottom-right and Skills is the leftmost of
    five icons, so pinning to that one icon hangs the menu's whole width out to its left. Coordinates
    are viewport-relative throughout, since the dropdown renders with `useFixedPositioning`.

  `OpenTrigger` and `IsTriggerOpen` are public and generic. Any trigger character with an active
  provider can now be opened from a control, and any control can reflect whether its trigger is open.

  **BREAKING (renames), and the reason this is `minor` rather than `patch`.** `MessageInputBoxComponent`
  was violating MJ's convention that public class members are `PascalCase`, so every public input,
  output, getter and method on it is renamed: `placeholder` to `Placeholder`, `disabled` to `Disabled`,
  `value` to `Value`, `valueChange` to `ValueChange`, `textSubmitted` to `TextSubmitted`,
  `planModeToggle` to `PlanModeToggle`, `canSend` to `CanSend`, `onSendClick` to `OnSendClick`, and so
  on for all of them. `TriggerProviders`, `ExcludedTriggerKeys` and `Provider` were already correct.

  Native DOM bindings and framework members are deliberately untouched: `[disabled]` on a `<button>`
  is a DOM property, `ngOnInit` / `writeValue` / `registerOnChange` are framework contracts, and
  `mj-mention-editor`'s own inputs keep their current casing because that component is not renamed
  here.

  `mj-ai-composer` is updated to the new names. Any other consumer binding these inputs or listening
  to these outputs must rename accordingly.

### Patch Changes

- Updated dependencies [080f4cd]
- Updated dependencies [8288711]
- Updated dependencies [48ff99f]
- Updated dependencies [fccd0b2]
- Updated dependencies [0967ba7]
- Updated dependencies [de343b5]
- Updated dependencies [15319b4]
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/core@6.1.0-edge.2
  - @memberjunction/ng-ui-components@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/ng-ui-components@6.1.0-edge.1
  - @memberjunction/core@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- b895f92: Angular DOM unit-testing — Phase 4 coverage push. Dev-only (test files + test-config/CI-gate scoping); no runtime change.

  Drives the Generic DOM-coverage ratchet (`scripts/dom-test-report.mjs … --max-none`) from **185 → 137** by writing DOM specs, in usage-ranked order, for every Generic Angular component appropriate for a DOM unit test. Highlights:
  - **Highest-leverage primitives** — `MjFormFieldComponent` (the field renderer behind ~4,000 usages) across its read/edit type matrix; the `ui-components` design system (`MJEmptyStateComponent`, the `mj-page-*` chrome family, `MJDropdown`/`MJCombobox`/`MJFilterPopover` via a new CDK-overlay test helper in `ng-test-utils`, the `mj-dialog` family, tabs, filter panel, left-nav).
  - **Form host stack** — `MjRecordFormContainer`, `MjFormToolbar`, `MjEntityFormHost`, `MjIsaRelatedPanel`, `FormPanelSlot`, `ExplorerEntityDataGrid`, `InteractiveForm`.
  - **Viewers, grids & dialogs** — `EntityDataGrid` + `QueryDataGrid` (AG-Grid chrome), `EntityViewer`, `ArtifactViewerPanel`, the ERD component family (`ERDComposite`/`MJEntityERD`/`ERDDiagram`), plus a broad set of panels/editors/dialogs across agents, artifacts, search, composer, list-management, scheduling, record-process-studio, user-routines, entity-action-ux, actions, and testing.
  - **`Angular/Bootstrap` onboarded** — the last untracked library tree gains a DOM test tier (`MJAuthShell`, `MJBootstrap`) and its own `--max-none=0` CI gate, so every shipped Angular library tree (Explorer, Generic, Bootstrap) is now gated.

  Reusable patterns established for the harder components: drive internal state before the first render (`setup`) rather than mutating post-render (unreliable under zoneless CD); stub the heavy core (AG-Grid, React bridge, SVG layout, plugin viewers) and spy async loaders so specs exercise the component's own chrome/wiring; add each component **and its injected services** to enumerated `tsconfig.spec.json` files (or AOT drops decorator metadata → NG0202).

  Deliberately **not** covered, and left at the 137 floor: five integration/e2e-tier orchestrators (`ConversationChatArea`, `MessageInput`, `RealtimeWhiteboardBoard`, `AITestHarness`, `RealtimeSessionOverlay`) — 1,800–4,600-line components with realtime/WebRTC/canvas cores or 14–30 dependencies, which belong in the browser regression suite rather than DOM units.

- Updated dependencies [b895f92]
- Updated dependencies [9699d0e]
- Updated dependencies [052b4c7]
- Updated dependencies [841e6ea]
- Updated dependencies [1d88e00]
- Updated dependencies [d26e202]
- Updated dependencies [27e4d09]
  - @memberjunction/ng-ui-components@6.1.0-edge.0
  - @memberjunction/core@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- Updated dependencies [a2670a9]
  - @memberjunction/core@6.0.0
  - @memberjunction/ng-ui-components@6.0.0
  - @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- Updated dependencies [a8fc549]
  - @memberjunction/core@5.51.0
  - @memberjunction/ng-ui-components@5.51.0
  - @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- Updated dependencies [623dfc5]
- Updated dependencies [ce6374c]
- Updated dependencies [deb02b4]
- Updated dependencies [0ba33b3]
- Updated dependencies [dd04a24]
  - @memberjunction/core@5.50.0
  - @memberjunction/ng-ui-components@5.50.0
  - @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/ng-ui-components@5.49.0

## 5.48.0

### Minor Changes

- f613d0d: Unified Ctrl+K omnibar command palette + composer draft persistence.
  - **Omnibar (ng-explorer-core)**: pluggable `OmnibarProvider` ClassFactory registry powering a unified Ctrl+K palette (search, `@agent`, `#entity`, `/skills`, `>commands`, recent searches), gated by a two-layer switch — the `Shell.Omnibar.Enabled` instance config flag is the master availability switch (default ON; OFF = legacy trio for everyone), and each user opts in personally via My Profile → Command Palette (UserInfoEngine setting `mj.shell.omnibar.enabled`, default OFF, cross-device, flips live). Modal palette is summonable from within editable elements (Slack/Linear semantics). `@agent` selection lands in Chat with a one-shot `agent|agentReq` nonce instruction so URL↔tab-config sync echoes can never re-stage the pre-address or wipe an in-progress draft.
  - **Composer (ng-composer)**: public `InsertMention()` API stages a resolved mention pill programmatically (chip + trailing space + caret focus), `FocusCaretAtEnd()`, blur output, and full serialized-mention rehydration — `writeValue` re-renders `@{...}` tokens as pills via `ParseSerializedMentions`.
  - **Conversations (ng-conversations)**: `InsertAgentMention()` resolves an agent name to a pill with replace-not-stack semantics and focus re-assertion; new `ComposerDraftStore` persists in-progress drafts per conversation (plus the new-conversation composer) via `UserInfoEngine` under `mj.chat.drafts.v1` — debounced while typing, flushed on blur, cleared on send, restored (pills included) on reload across sessions/devices.
  - **core-entities**: `UserInfoEngine.SetSetting` recovers when a cached settings row was deleted out-of-band (recreates instead of failing the UPDATE).

### Patch Changes

- Updated dependencies [09e1b4b]
  - @memberjunction/core@5.48.0
  - @memberjunction/ng-ui-components@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/ng-ui-components@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/ng-ui-components@5.46.0
  - @memberjunction/global@5.46.0

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
