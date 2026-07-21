# Omnibar Command Palette — Design Plan (locked)

**Basis:** approved mockup `mockups/omnibar-command-palette.html` + proposal H1. **Branch:** `omnibar-command-palette` (from next post-#3035).

## Architecture decisions

1. **The palette consumes the `ComposerTriggerProvider` registry directly — it does NOT embed `mj-mention-editor`.** A palette never inserts chips; its input is single-line plain text. The editor's value is chip editing; the *registry* is the shared substrate. Providers are plain classes — the palette calls `provider.GetSuggestions()` itself and renders its own rich results panel (group labels, relevance bars, scope pills, footer — per mockup). This supersedes the proposal's "commandMode/single-line editor gaps": consuming the registry is the leaner, honest reuse. No `ng-composer` changes required.
2. **Palette providers register under their own base — `OmnibarProvider` (extends `ComposerTriggerProvider`)** — via `@RegisterClass(OmnibarProvider, '<key>')`. ClassFactory registrations are keyed by the base you register against, so palette `#`/`/` semantics do NOT leak into text editors' `ComposerTriggerProvider` discovery (a `#` record-jump provider must not concatenate into the routine editor's `#` record-mentions). Extensibility story preserved: OpenApps register `OmnibarProvider` subclasses to add palette modes.
3. **Home: `explorer-core`** (`src/lib/omnibar/`) — the palette wires `NavigationService`, `SearchService` (ng-search), and the shell; it is Explorer chrome. `OmnibarProvider` + suggestion nav-payload contract live there too.
4. **Navigation contract:** `MentionSuggestion.data` carries a discriminated payload the palette executes: `{ kind: 'record', entityName, recordId } | { kind: 'search', query } | { kind: 'app', appName } | { kind: 'nav', ... } | { kind: 'agent', agentName } | { kind: 'file', ... }` → routed through the existing `NavigationService.OpenEntityRecord / OpenSearch / SwitchToApp` + `FileOpenService`.

## Pieces (build order)

1. **`OmnibarProvider` base + contract** (`explorer-core/src/lib/omnibar/omnibar-provider.ts`): extends `ComposerTriggerProvider`; adds `GroupLabel`, optional `EmptyStateSuggestions()` (recents), and the typed `OmnibarNavPayload`. `DiscoverOmnibarProviders()` mirrors composer discovery against the `OmnibarProvider` base.
2. **Providers** (each `@RegisterClass(OmnibarProvider, key)` + Load guard):
   - `OmnibarSearchProvider` — TriggerChar `''` (default mode): debounced `SearchService.PreviewSearch`, maps `SearchResultItem` → suggestions with score + group (Records/Files/Content) + a trailing "See all results" suggestion (`kind:'search'`). Scope pills read the same `SearchService.LoadScopes()`.
   - `OmnibarRecordProvider` — `#`: entity-name matches from `Metadata` (grouped "Entities"), plus top records of the best-matching entity via `RunView` (`MaxRows` small, `ResultType:'simple'`, name field via `EntityInfo.NameField`) (grouped "Matching records"). Fail-soft per entity.
   - `OmnibarCommandProvider` — `/`: apps (reuse `CommandPaletteService` fuzzy scoring + UserInfoEngine recents) + Explorer nav targets; suggestions carry `kind:'app'|'nav'`.
   - `OmnibarAgentProvider` — `@`: wraps the conversations `agent-mentions` composer provider when present (resolved from the *composer* registry at runtime — no compile dep on ng-conversations; absent ⇒ provider yields []); payload `kind:'agent'` → Conversations app with an `agent` query param.
3. **`OmnibarPaletteComponent`** (`mj-omnibar-palette`): centered modal per mockup — input row (mode badge, trigger lead), scope pills (search mode only), grouped results with keyboard nav (↑↓/Enter/Esc), empty state = trigger-hint chips + recents (`SearchService.RecentSearches$` + palette-recent apps), footer legend + provider count. OnPush; snapshot-safe times; design tokens only; announced via `role="dialog"`.
4. **Shell consolidation** (`shell.component`): Ctrl/Cmd+K opens the palette (replaces focus-the-composite); the header search box becomes a click-to-open affordance (visual per mockup); Ctrl/Cmd+/ opens the palette in `/` mode (old `CommandPaletteComponent` overlay retired from the shell template; service's recents logic reused by the command provider); legacy Search Popup (`toggleSearch`) routes to the palette. `mj-search-composite` stays for the Search Results page only.
5. **Chat pre-addressing**: `chat-conversations-resource` honors an `agent=<name>` query param → prefills the composer with `@Agent ` mention (small, additive).
6. **Tests**: DOM tests for the palette (mode routing with fake OmnibarProviders, keyboard nav, Enter dispatch per payload kind); provider unit tests (search mapping + see-all, record two-phase, command fuzzy + recents, agent wrap/absent); E2E `e2e/specs/omnibar.spec.ts` (Ctrl+K → search → `#` → `/` app switch → `@` → Esc; zero non-cosmetic console errors).
7. **Docs + changeset**: JSDoc, explorer-chrome conventions note (one palette, three entry points), changeset minor for `ng-explorer-core` (+ any touched packages).

## Out of scope (v1)
Quick-action commands beyond apps/nav ("Create Skill…" style) — follow-up; deep `#Entity record-query` grammar (v1 = best-entity records); mobile palette layout; removing `CommandPaletteService` (logic reused, component retired).
