# Composer Adoption Proposal — where `@memberjunction/ng-composer` goes next

**Date:** 2026-07-03 · **Status:** Proposal for review (Amith) · **Basis:** two full-repo studies (omnibar deep-dive + all-surface sweep), file:line-verified.

`ng-composer` is now a fully generic, leaf-level primitive: a mention/command editor with pluggable `ComposerTriggerProvider`s (`@RegisterClass` discovery or explicit lists), zero AI knowledge, graceful degradation to a plain editor when no providers are registered. The AI plugins (`@` agents, `#` entity/query types, `/` skills) live in `ng-conversations`; `mj-ai-composer` wraps the full surface for chat. This proposal ranks every credible adoption surface and the new providers worth defining.

**Two structural facts that shape everything below:**
- `ng-composer` depends only on `core` / `global` / `ng-ui-components` — **no package can create a cycle by adopting it**, and discovery-mode adoption is a no-op plain editor wherever `ng-conversations` isn't loaded (in MJ Explorer it always is).
- The highest-leverage moves are **not** one-off textarea swaps — they are (a) one form-infrastructure opt-in that lights up many fields at once, and (b) the omnibar, which replaces three divergent quick-switcher UXs with one primitive.

---

## HIGH priority

### H1. The command-palette omnibar (the "Search everything" box)

**Today Explorer has three overlapping quick-switchers**: the Ctrl+K omnibar (`mj-search-composite` in `shell.component.html:49-64`, backed by the cross-source `SearchEngine` via `GraphQLSearchClient` — vectors + FTS + entities + storage, scope-aware), a separate Notion-style **app command palette on Ctrl+/** (`explorer-core/src/lib/command-palette/`, fuzzy app scoring + UserInfoEngine recents), and a legacy per-entity "Search Popup" overlay (`shell.component.html:208-230`). One trigger-provider omnibar unifies all three:

| Input | Behavior | Backing |
|---|---|---|
| plain text | today's global cross-source search (preview dropdown → Enter opens the Search Results tab) | existing `SearchService.PreviewSearch` / `NavigationService.OpenSearch` |
| `#` | **jump-to-record** — entity, then record lookup | NEW record-level provider (today's `#` completes entity *types*; records need an `EntityRecordName`/`RunView` 2-step) |
| `/` | commands — app/nav shortcuts, actions | NEW nav provider over `ApplicationManager` + `NavigationService` (absorbs the Ctrl+/ palette, reuses its fuzzy scoring + recents) |
| `@` | agents — open chat pre-addressed | existing `AgentMentionProvider` + navigation glue to Conversations |

**Composer gaps to close first (all additive, small, in `ng-composer`):**
1. `[commandMode]` — select = emit + navigate, **don't** insert a chip (`mention-editor.component.ts:463` currently always inserts).
2. Single-line mode + Enter-with-no-selection = submit (maps to today's `OnQuerySubmit`).
3. An empty-trigger "default provider" path (plain text → global search) — today no-trigger closes the dropdown (`mention-editor.component.ts:330-373`); alternatively host-side branch to `SearchService`.
4. (Nice-to-have) a recents provider for the empty state — recents already live in `SearchService.RecentSearches$` + `CommandPaletteService`.

**Why high:** every backing API and navigation target already exists — this is mostly composition; the payoff is Explorer's front door becoming one coherent, extensible palette (OpenApps can register palette commands via the same registry). **Scope:** composer features (small) + 2–3 providers (medium) + shell wiring & consolidation of the three surfaces (small-medium). Suggest its own design pass (`/design-ux`) since it's Explorer's most-touched surface.

### H2. `base-forms` long-text opt-in — one change, many fields

`mj-form-field`'s `@case ('textarea')` renders a plain `<textarea>` (`base-forms/src/lib/field/form-field.component.html:310-315`). Adding an opt-in editor mode (e.g. `EditRichTextMode = 'mention'`) that renders `mj-mention-editor` in discovery mode simultaneously lights up **every designated entity long-text field in every generated + custom form**: AI Skill `Instructions`, AI Agent `Description`, AI Prompt `AssistantPrefill`, Agent Note bodies, and anything else we flag. Chips serialize as `#"Membership Renewals"` — exactly what a stored description should carry.

- No cycle (`base-forms` already depends on `ng-ui-components`); degrades to plain text outside Explorer.
- Decide the opt-in surface: per-field flag threaded from `EntityField` metadata (cleanest — CodeGen-emittable) vs. custom-form-only input.
- **Effort:** medium (one component + the opt-in plumbing). **Payoff:** the widest.

### H3. Communications compose + the `~` merge-field provider

`communication-new-message-resource.component.ts:124-129` is a raw `<textarea>` whose placeholder literally says `Hi {{FirstName}},…`. This is the single most natural bespoke-provider fit in the codebase: a **`~` (or `{{`) merge-field provider** listing the selected audience entity's fields, plus `#` record references. The dashboards package already depends on `ng-composer` + `ng-conversations` — the editor swap is drop-in; the provider is small-medium. Immediate, visible value for anyone composing outbound email.

---

## MEDIUM priority

### M1. The `!` Actions and `~` Template-params providers (cross-cutting)
The two new providers with the broadest pull across surfaces (skills instructions, agent descriptions, action prompts, communications). Define once in the right home (`!` actions provider likely in a package with actions metadata access; `~` params provider is context-parameterized — needs a small design note since its suggestion list depends on the host field's context). Unblocks several items below.

### M2. AI Skill `Instructions` + AI Agent `Description` (rides H2)
Both render via `mj-form-field` (`mjaiskill.form.component.html:39`; `ai-agent-form.component.html:1466-1479`) — once H2 exists these are per-field flags. Skill instructions want `#` entities + `!` actions + `/` skills; agent descriptions feed delegation decisions, so validated references beat free text.

### M3. Agent Request response box
`agent-requests/.../agent-request-panel.component.html:87-92` — a human answering an agent's question. `#` cite the record you're answering about, `@` mention people/agents. New (safe) `ng-composer` dep; one textarea swap. **Effort:** small.

### M4. Collection & Artifact create/edit modals
`conversations/.../collection-form-modal.component.ts:39-44`, `artifact-create-modal.component.ts:52-68`. Package already has everything — genuine **drop-in**. `#` references now; a future `^` collections provider adds cross-refs.

### M5. Action form `UserPrompt`
`action-form.component.html:360-365` — the NL→code generation prompt. Bespoke textarea (not `mj-form-field`), so a direct swap; wants `#` + `!` + `~`. **Effort:** small-medium.

---

## LOW priority (worth doing opportunistically)

- **L1. Feedback form** (`feedback/.../feedback-form.component.ts:57-63`) — `#` the record/screen you're reporting on. Small.
- **L2. Component-feedback comment** (`artifacts/.../component-feedback-panel.component.html:117-123`). Small, niche.
- **L3. Whiteboard rich-note body** (`whiteboard-board.component.html:346-366`) — `@` teammates/agents on a canvas is genuinely novel, but the mention dropdown inside transformed canvas nodes needs positioning work (we just fixed exactly this class of bug in `mj-slide-panel`). Medium-high effort; defer.
- **L4. Flow-editor step/path descriptions** (`agent-properties-panel.component.html:63-66`). Small effort, low payoff.
- **L5. AI Prompt `Description`** (bespoke textarea `ai-prompt-form.component.html:73-77`; `AssistantPrefill` rides H2).
- **L6. `^` collections / `$` reports providers** — hold until a surface demands them.

---

## Explicitly NOT recommended

- **Template/prompt TEMPLATE TEXT** (`template-editor.component.ts` → CodeMirror with an existing placeholders panel): swapping to a contenteditable loses syntax highlighting. If param completion is wanted there, extend the **code editor**, not the composer.
- **JSON/config fields** (mapping textareas, StartingPayload) — code editors by design.
- **Read-only surfaces** (task description displays, entity-communication preview) — nothing to edit.

## Noted gaps
- Record Process Studio has **no Infer-instructions field yet** (editor wires only FieldRules today) — when Infer authoring lands, it's an instant Tier-1 candidate (`#` + `~`).
- There is no separate ask-skip input — Skip chat already flows through the conversations composer.

## Suggested sequencing

1. **H2** (base-forms opt-in) + **M2** flags — cheapest path to daily-use value across many forms.
2. **H3** (communications + `~` provider) — first bespoke provider, proves the extension story.
3. **H1** (omnibar) — its own design pass + build; biggest UX statement.
4. **M1** providers + M3–M5 swaps opportunistically.
