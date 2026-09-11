# @memberjunction/ng-whiteboard

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

- ce3d526: Whiteboard: roster follow-ups — Restyle follows the text tool, an empty roster lands on Select, and the host gains `ReadOnly`.

  Four corrections to the `ToolRoster` work, raised in review.

  **Restyle… now follows the `text` tool.** It is the one item-menu action that is also a door to a tool: it opens the toolbar's text style flyout, which only exists because the text tool's button renders it. Under a roster without `text` the entry was present and did nothing. The rest of the item menu stays deliberately roster-blind — Edit, Duplicate, z-order and Delete are authoring on what already exists, not tool selection.

  **An empty or all-typo roster now clamps the active tool to `select`.** It previously left the current tool alone, on the reasoning that the board must always hold something. It must — but holding the tool the roster just revoked was the one answer that kept a _creating_ tool live with no toolbar to see it and no key to change it: `Tool = 'html'` followed by `ToolRoster = []` went on placing widgets. An empty roster still does not make the board read-only.

  **`RealtimeWhiteboardHostComponent` gains `@Input() ReadOnly` (default `false`).** The board component has had it all along; the host had no passthrough, so the documented advice to "use `ReadOnly` for that axis" was an `NG8002` for anyone who followed it. The host now binds it to the board and adds the chrome only it owns: no floating toolbar (matching `WhiteboardSnapshotComponent`), no Undo on the agent toast, and a keyboard handler that returns before any key can act — `Escape` included, because "the keyboard does nothing here" is a rule a user can hold and "does nothing except Escape" is one they have to be told. Pan and zoom stay live. `ReadOnly` does not reset `Tool`; the board ignores edits regardless.

  The two axes are not substitutes: the roster answers _which tools are offered_, `ReadOnly` answers _whether anything mutates_.

  **`ToolRoster` tolerates a non-array and re-clamps on content change.** A static attribute (`ToolRoster="select,pan"`, a plausible slip for the binding) set a string, which reached the roster helpers as an accidental substring matcher and rendered a garbage palette — or threw outright, when the string did not contain the held tool's name and the clamp's `.filter` ran on a `String`. Non-arrays now read as no roster. The kept value is a frozen copy compared by content rather than by identity, which was wrong in both directions: a bound array literal is a new reference every change-detection pass (re-clamping forever, fighting the user for the active tool), and an array mutated in place keeps its reference (never re-clamping, leaving a revoked tool held).

  Behavior change: `ReadOnly` defaults to `false` and every roster default still reproduces today's rendering. `ToolRoster` ships in this same release, so the Restyle and empty-roster rules above are simply how it behaves from the start — the `ToolRoster` entry in these notes describes it the same way. Anyone who adopted the roster before this release from an unreleased build or the `lts/5` backport loses the Restyle entry on sticky and text items when their roster omits `text`; that entry did nothing for them.

- ba71cd4: Whiteboard: a host-controllable `ToolRoster` that gates the toolbar, the keyboard shortcuts and the canvas context menu together.

  `RealtimeWhiteboardHostComponent` gains `@Input() ToolRoster: readonly WhiteboardTool[] | null` (default `null` = all eleven tools, today's rendering). It governs which tools are AVAILABLE, and closes every door to a tool it leaves out: the toolbar button, the single-letter shortcut, and the canvas right-click "add … here" action.

  The invariant is enforced where the tool is written rather than at each place it is read: the host's `Tool` is a setter that ignores a disallowed write, so a shortcut or gesture added later cannot reintroduce a hole by forgetting a guard. If the tool you are holding leaves the roster, the host moves to `select`, or to the roster's first known entry when `select` is not on it — never to whatever the host happened to list first. A roster that names no real tool at all lands on `select` too: the board always holds a tool, and `select` is the one that can create nothing.

  The roster is deliberately NOT a content policy. It does not restrict what already exists on the board, what the agent places, or authoring on existing items: Duplicate, z-order, Delete and pasting an image are unaffected. The one exception is **Restyle…**, which is hidden when the roster omits `text` — Restyle opens the text tool's style flyout, so without that tool the entry would be present and do nothing. Whether anything mutates at all is the separate `ReadOnly` input on the same host.

  Why all three at once: a consumer that hid five toolbar buttons with CSS found the right-click menu still offered "Add widget here" and the `w` key still placed one. A roster that gated only the toolbar would have shipped the same hole as a prop.

  Behavior change: none. Every default reproduces today's rendering; `BuildWhiteboardContextMenu(item)` without a roster is unchanged.

- Updated dependencies [b915983]
- Updated dependencies [197fdf8]
- Updated dependencies [4c1de04]
- Updated dependencies [51017a5]
- Updated dependencies [10cbc60]
  - @memberjunction/ng-code-editor@6.1.0-edge.6
  - @memberjunction/ng-markdown@6.1.0-edge.6
  - @memberjunction/ng-ui-components@6.1.0-edge.6
  - @memberjunction/global@6.1.0-edge.6

## 6.1.0-edge.5

### Patch Changes

- 4273317: Accessibility: shell landmarks + skip link, focus containment, and focus-ring token safety.

  Fixes eight WCAG 2.1 A/AA findings raised against the Explorer shell and shared primitives. A ninth — `mj-dropdown` having no way to be given an accessible name — was fixed independently on this line by #3860 and its follow-ups while this work was in flight, so it is not part of this changeset.

  **Shell (`ng-explorer-core`)**
  - Adds a "Skip to main content" link as the first focusable element in the shell, and marks the routed content region as the `main` landmark (`role="main"`, focusable target). **Consuming apps that added their own skip link should remove it on upgrade** — the shell's now comes first in DOM order, and two stacked skip links is worse than none.
  - The global search input, the account/avatar button and the mobile-nav toggle now carry real accessible names. The avatar's name lives on the button, so it survives the icon-fallback path when the avatar image fails to load.
  - The closed mobile nav drawer and the closed search popup are now `inert` and `visibility: hidden` (transitioned so the slide-out still animates). They previously kept every control inside them in the tab order while closed. When the drawer closes with focus inside it, focus returns to the toggle instead of dropping to `<body>`.
  - The command palette already had `role="dialog"`/`aria-modal`; it now also traps Tab while open and returns focus to whatever was focused when it opened. `aria-modal` never stopped Tab on its own.

  **Focus-ring tokens (`ng-shared-generic`)**
  - New `--mj-focus-ring-color` companion to `--mj-focus-ring`. `--mj-focus-ring` is a two-part box-shadow value: `outline: 2px solid var(--mj-focus-ring)` looks correct, parses, and renders nothing. Use `--mj-focus-ring` in `box-shadow` and `--mj-focus-ring-color` in `outline`. A new `check:focus-ring` gate fails on the broken form.

  **Whiteboard (`ng-whiteboard`)**
  - The eleven bare single-character tool shortcuts (`v h p r s t m w i c e`) listened on `document` and fired anywhere on the page, failing WCAG 2.1.4. They are now scoped to focus being inside the whiteboard host, which is made click-focusable for that purpose. Scoping covers the host's whole keydown handler, so undo/redo (`Cmd/Ctrl+Z`, `+Y`), `Escape` and `Delete`/`Backspace` are focus-gated too — a board that swallows the document's `Cmd+Z` from anywhere on the page is its own bug. **Behavior change**: none of these fire while focus is elsewhere on the page. `EnableGlobalShortcuts` restores the old behavior for surfaces that accept the exposure.

- Updated dependencies [1940a4d]
- Updated dependencies [c09c818]
- Updated dependencies [e93f221]
- Updated dependencies [23c2521]
  - @memberjunction/global@6.1.0-edge.5
  - @memberjunction/ng-ui-components@6.1.0-edge.5
  - @memberjunction/ng-markdown@6.1.0-edge.5
  - @memberjunction/ng-code-editor@6.1.0-edge.5

## 6.1.0-edge.4

### Patch Changes

- Updated dependencies [4586215]
- Updated dependencies [a5f92d2]
  - @memberjunction/global@6.1.0-edge.4
  - @memberjunction/ng-code-editor@6.1.0-edge.4
  - @memberjunction/ng-markdown@6.1.0-edge.4
  - @memberjunction/ng-ui-components@6.1.0-edge.4

## 6.1.0-edge.3

### Patch Changes

- Updated dependencies [834f8d7]
- Updated dependencies [deea1a3]
- Updated dependencies [cefc302]
- Updated dependencies [be0bdb2]
- Updated dependencies [6ecfaa0]
- Updated dependencies [f5ec13b]
- Updated dependencies [1bd9674]
  - @memberjunction/global@6.1.0-edge.3
  - @memberjunction/ng-code-editor@6.1.0-edge.3
  - @memberjunction/ng-ui-components@6.1.0-edge.3
  - @memberjunction/ng-markdown@6.1.0-edge.3

## 6.1.0-edge.2

### Patch Changes

- Updated dependencies [080f4cd]
- Updated dependencies [48ff99f]
- Updated dependencies [de343b5]
  - @memberjunction/global@6.1.0-edge.2
  - @memberjunction/ng-code-editor@6.1.0-edge.2
  - @memberjunction/ng-markdown@6.1.0-edge.2
  - @memberjunction/ng-ui-components@6.1.0-edge.2

## 6.1.0-edge.1

### Patch Changes

- 394d276: Declare @angular/\* peer dependencies as ranges (^21.1.3) instead of exact pins across all Angular library packages. Peer declarations are compatibility claims, not install instructions: the exact pins falsely claimed incompatibility with every other Angular 21.x build, produced 502 peer-resolution errors under strict pnpm workspaces, and structurally blocked Angular security patches behind a full republish. Installed versions remain pinned by consuming apps and the era platform manifest; dependencies/devDependencies keep their exact pins.
- Updated dependencies [394d276]
- Updated dependencies [394d276]
- Updated dependencies [394d276]
  - @memberjunction/ng-ui-components@6.1.0-edge.1
  - @memberjunction/ng-code-editor@6.1.0-edge.1
  - @memberjunction/ng-markdown@6.1.0-edge.1
  - @memberjunction/global@6.1.0-edge.1

## 6.1.0-edge.0

### Patch Changes

- Updated dependencies [b895f92]
- Updated dependencies [b895f92]
- Updated dependencies [d26e202]
  - @memberjunction/ng-ui-components@6.1.0-edge.0
  - @memberjunction/ng-markdown@6.1.0-edge.0
  - @memberjunction/ng-code-editor@6.1.0-edge.0
  - @memberjunction/global@6.1.0-edge.0

## 6.0.0

### Patch Changes

- @memberjunction/ng-code-editor@6.0.0
- @memberjunction/ng-markdown@6.0.0
- @memberjunction/ng-ui-components@6.0.0
- @memberjunction/global@6.0.0

## 5.51.0

### Patch Changes

- @memberjunction/ng-code-editor@5.51.0
- @memberjunction/ng-markdown@5.51.0
- @memberjunction/ng-ui-components@5.51.0
- @memberjunction/global@5.51.0

## 5.50.0

### Patch Changes

- @memberjunction/ng-code-editor@5.50.0
- @memberjunction/ng-markdown@5.50.0
- @memberjunction/ng-ui-components@5.50.0
- @memberjunction/global@5.50.0

## 5.49.0

### Patch Changes

- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [9c07270]
  - @memberjunction/global@5.49.0
  - @memberjunction/ng-markdown@5.49.0
  - @memberjunction/ng-ui-components@5.49.0
  - @memberjunction/ng-code-editor@5.49.0

## 5.48.0

### Patch Changes

- @memberjunction/ng-code-editor@5.48.0
- @memberjunction/ng-markdown@5.48.0
- @memberjunction/ng-ui-components@5.48.0
- @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- @memberjunction/ng-code-editor@5.47.0
- @memberjunction/ng-markdown@5.47.0
- @memberjunction/ng-ui-components@5.47.0
- @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- @memberjunction/ng-code-editor@5.46.0
- @memberjunction/ng-markdown@5.46.0
- @memberjunction/ng-ui-components@5.46.0
- @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/ng-code-editor@5.45.1
- @memberjunction/ng-markdown@5.45.1
- @memberjunction/ng-ui-components@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Patch Changes

- Updated dependencies [13716e4]
- Updated dependencies [c1f2d3d]
  - @memberjunction/ng-ui-components@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/ng-code-editor@5.45.0
  - @memberjunction/ng-markdown@5.45.0

## 5.44.0

### Patch Changes

- 0476455: Migrate inline empty-state placeholders to the canonical `<mj-empty-state>` component across Explorer and Generic Angular packages (UI-consistency objective O4), wiring the component into the packages that needed it (and adding `@memberjunction/ng-ui-components` as a dependency where missing). Also fixes reset-filter CTA correctness in three picker dialogs (sub-agent selector, add-action, action gallery) where the handler cleared only a subset of the active filter dimensions, and refines the UI adoption measurement script with a transparent three-tier empty-state count (raw widened → non-placeholder false-positives → wrappers-around-migrated → genuine).
- Updated dependencies [5396d90]
- Updated dependencies [f8be8a0]
- Updated dependencies [1e5e449]
- Updated dependencies [0476455]
  - @memberjunction/global@5.44.0
  - @memberjunction/ng-ui-components@5.44.0
  - @memberjunction/ng-code-editor@5.44.0
  - @memberjunction/ng-markdown@5.44.0

## 5.43.0

### Patch Changes

- Updated dependencies [9f6aa87]
  - @memberjunction/global@5.43.0
  - @memberjunction/ng-code-editor@5.43.0
  - @memberjunction/ng-markdown@5.43.0

## 5.42.0

### Patch Changes

- Updated dependencies [0fa3cbc]
  - @memberjunction/global@5.42.0
  - @memberjunction/ng-code-editor@5.42.0
  - @memberjunction/ng-markdown@5.42.0

## 5.41.0

### Minor Changes

- cd6c5f0: Realtime AI Agents wave 3: consolidated v5.41 migration (sessions, channels, co-agent schema) with the AIAgentCoAgent affinity registry replacing AIAgentPairedAgent — typed relationship vocabulary (CoAgent implemented; Peer/Delegate/Fallback/Reviewer/Observer reserved), type-level co-agent defaults as junction rows (removing the only FK cycle in core MJ), and the full code sweep (engine cache, resolver resolution chain, server-side invariants, client pairing reads, regenerated manifests). Realtime UX: progressive-disclosure voice console with persisted captions preference, user-owned composer and tabs toggles, audio-reactive visuals; whiteboard pages/multi-select and review-persistence fixes. Gemini Live triggering turns ride realtime text so widget clicks/typed input/narration speak immediately on native-audio models. CodeGen: single-winner IsNameField enforcement with eligibility guardrail fixes, SCC-based cycle diagnostics, and clean-database bootstrap robustness (conditional engine registry datasets).

### Patch Changes

- 8c8b658: Realtime UX wave 2 — the progressive-disclosure console (pure-audio-first overlay with the breathing hero orb, disclosure levels 0–4 ratcheted per-user via UserInfoEngine, gear density escape hatch, unified app-bar, fused composer dock; content never flips the console open — the one auto-reveal is a channel's first agent activity, finished artifacts arrive as glowing unfocused tabs, Activity tab pinned last); audio-reactive call visuals (BaseRealtimeClient GetAudioActivity capability — per-direction RMS + 9-bin spectrum metered on all four drivers via a shared RealtimePcmPlayback master-gain tap / WebRTC stream analysers — driving the hero + app-bar orbs and a true-spectrum EQ through a zero-CD rAF loop, with turn-state fallback). Whiteboard: OneNote-style PAGES (v2 JSON with tolerant v1 migration, AddPage/SwitchPage/RenamePage agent tools, page strip with inline rename + right-click Rename/Delete/New-page context menus, agent-authored page garnish), multi-select (marquee, shift-click, single-undo group drag/delete), hold-to-zoom, multi-page HTML/SVG export, shared active-page note on all item tools, UUIDsEqual compliance. ElevenLabs: tool-schema sanitizer (non-string enums + leaf descriptions, fingerprint-stable) and the absorbed-tool-result voice nudge. Conversations: shared auto-naming helper + race-free realtime naming lifecycle on SessionStarted$, slide-panel splitter rework, angular-split dependency removed. Plus integration-test script groundwork (server/client/runquery cache suites) and cache-layer fixes carried on this branch.
- 15b743b: Real-Time AI Agents — Sessions, Channels & the Realtime Model (plans/ai-agent-sessions.md). Adds the AIAgentSession/AIAgentChannel/AIAgentSessionChannel schema (+ AgentSessionID on AIAgentRun/ConversationDetail, CloseReason on AIAgentSession); the BaseRealtimeModel server primitive with OpenAIRealtime + GeminiRealtime drivers (server-bridged StartSession and client-direct ephemeral-token CreateClientSession, optional SendContextNote/RequestSpokenUpdate interim updates); the new @memberjunction/ai-realtime-client package with the BaseRealtimeClient browser abstraction + OpenAI/Gemini client drivers resolved via ClassFactory by provider key; the Realtime agent type + Voice Co-Agent with RealtimeSessionRunner/RealtimeToolBroker, AgentMemoryContextBuilder extraction, server session lifecycle (SessionManager, SessionJanitor, start/close/heartbeat + client-direct resolvers with delegated-run progress streaming, AwaitingFeedback resume, co-agent observability runs, user-selectable realtime model); the full-panel realtime voice call UX in ng-conversations (phone trigger + agent/model picker, banner/thread/activity rail, delegation working/result cards with provenance, ephemeral paced first-person progress narration driven by DB prompt templates, in-call text composer); Realtime Voice admin (AI Analytics dashboard sections, session/channel custom forms, agent Runs|Sessions execution history); and Query Builder/Strategist reliability fixes (entity catalog in prompt, Get Entity Details sample caps + semantic fallback, plan formatting). Also: the standalone @memberjunction/ng-whiteboard package (collaborative board with agent tool API, sandboxed interactive widgets + input bridge, markdown panels, exports, cancelable before/after events); ElevenLabs Agents + AssemblyAI Voice Agent realtime provider pairs (4-provider matrix, zero contract changes); session review mode with multi-leg resume carryover (timeline dividers, artifact junction closure, prior-transcript model hydration); delegation cancel channel; usage telemetry relay; Realtime Co-Agent rename with run-step/prompt-run observability.
- 1568bae: Realtime ledger completion + two field bugs. SERVER CHANNEL PLUGIN HALF: `ServerPluginClass` is now consumed — `BaseRealtimeChannelServer` lifecycle contract in @memberjunction/ai, `RealtimeChannelServerHost` (ClassFactory resolution mirroring the client half, per-session instances, failure-isolated hooks, post-close dispose linger) in ai-agents with a `WhiteboardChannelServer` reference impl that validates/canonicalizes landed board saves, wired through SessionManager create/close and the channel-state save path. TRANSCRIPT CORRECTIONS END-TO-END: `RealtimeClientTranscript.ReplacesPrevious` (stamped by the ElevenLabs driver on `agent_response_correction`) replaces the caption in place and `RelayRealtimeTranscript(replacesPrevious)` updates the persisted turn instead of appending. ASSEMBLYAI RESUME WINDOW: one-shot `session.resume` reattach on unexpected socket drop (mic/playout survive; failed/second drop falls through to the old fatal path). WHITEBOARD: widget srcdoc rebuilt per mount via a view-scoped pure pipe — SVG charts survive page switches/lazy remounts, and mounted widgets no longer reload on unrelated journal ops (the old journal-invalidated identity cache was both stale on remount and over-eager on 'replace'). CONVERSATIONS: surface-panel (re)creation lands on the marquee channel tab (the whiteboard) instead of the Activity rail, the agent's first stroke reveals synchronously, and session review now merges channel states across ALL chain legs (newest leg with a saved board wins) so resumed sessions never hide an earlier leg's drawing. Plus Per-Minute/Per-Hour AI model price unit types seeded via metadata.
  - @memberjunction/ng-code-editor@5.41.0
  - @memberjunction/ng-markdown@5.41.0
  - @memberjunction/global@5.41.0
