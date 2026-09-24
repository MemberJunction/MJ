# Explorer Localization & On-Demand Translation

**Status:** Scoping / phased implementation plan (pre-build)
**Date:** 2026-09-24
**Owner:** Ian Zygmunt
**Scope:** `packages/MJCoreEntities` (UserInfoEngine, new entities), `packages/MJCore` (EntityInfo display-name resolution, formatting helpers), `packages/Actions/CoreActions` (Translate Text action), `metadata/prompts`, `packages/Angular/Generic/*` (L1 translate widget, `t` pipe, primitives), `packages/Angular/Explorer/explorer-core` (shell, language switcher), `packages/CodeGenLib` (section-name emission), one migration in `migrations/v6/`.
**Supersedes / extends:** [`plans/weekly-exploration/2026-08-29/idea-2-localization-by-default.md`](weekly-exploration/2026-08-29/idea-2-localization-by-default.md) (metadata-text substrate; never built).

---

## 0. TL;DR

Izzy shipped a read-only, on-demand AI translation of inbound messages and drafts
(Izzy branch `translate-view`, commit `edf756a8`). The ask is to bring that concept to
all of MJ Explorer for language access.

"Translate all of Explorer" is really **two problems sharing one foundation**:

| Problem | What it is | Right tool |
|---|---|---|
| **Content translation** | Text a user wrote: conversation messages, artifacts, notes, description fields | On-demand AI, read-only, cached in memory, never persisted. This is Izzy's model and ports almost directly. |
| **UI localization** | Labels, buttons, tooltips, toasts, nav, section titles, entity/field display names | A stored catalog + runtime resolver + user language preference. AI seeds the catalog; a human approves. |

Shared foundation: a server-side user language preference, correct locale formatting, and
`lang`/`dir` on the document. **None of this exists today** (§1).

Four phases. Phases 1 and 2 are roughly three weeks combined and deliver most of what
users notice. Phase 3 is where the accessibility case is strongest (it flows to OpenApp
member-facing surfaces, not just Explorer). Phase 4 is the long tail and is designed to
be incremental and never block on completion.

---

## 1. Current state (measured 2026-09-24)

### 1.1 No i18n exists in MJ

- `@angular/localize` is a dependency of `packages/MJExplorer` and is in the `angular.json`
  polyfills, but there are **0** `$localize` calls and **0** `i18n` attributes anywhere.
- No `LOCALE_ID` provider, no `registerLocaleData`, no ngx-translate/transloco, no
  translate pipe, no `LocalizationService`.
- No language/locale field on the User entity. No `MJ: Languages` or translation entity.
  The only locale column anywhere is `MJAIPersonaEntity.Locale` (BCP-47, unused by TS).
- `UserInfoEngine` has no locale setting. Existing setting keys follow a
  `mj.<area>.<name>` convention (e.g. `mj.predictiveStudio.models.layout`).
- **59** call sites hardcode `toLocale*String('en-US', …)`. Hotspots: `Angular/Explorer/dashboards`
  (16), `Angular/Generic/versions` (3), `MJCore/src/generic/compositeFilter.ts`,
  `MJGlobal/src/fieldRules`. `MJCore/src/generic/util.ts:44` `FormatDateOnly` already
  accepts a `locale` argument and is the seed for a shared formatter.
- `packages/MJExplorer/src/index.html:2` hardcodes `<html lang="en">`. No `dir` handling.
- Only locale-aware runtime code: `explorer-core/src/lib/shell/loading-themes.ts:886`
  `GetBrowserLocale()` picks loading-screen themes from `navigator.language`.

### 1.2 What Izzy built (reference implementation)

Izzy repo, branch `translate-view`, commit `edf756a8` (11 files, +1,271). Not merged to
`stage` as of this writing. Read with `git show edf756a8 -- <path>`.

| Layer | File | Notes |
|---|---|---|
| Component | `packages/IzzyUI/src/lib/components/message-viewer/message-viewer.component.{ts,html,css}` | Per-pane state `idle → picking → loading → shown / error`. "Translate to" bar with `<select>`, Translate, Cancel. Banner: *"Translated from {detected} to {target} for reading only. The original is what the sender wrote."* + **Show original**. Approve/edit hidden while a translated draft is shown. State resets on message change; late results for a message the user left are dropped. |
| Client service | `packages/IzzyUI/src/lib/services/izzy-translation.service.ts` | Looks up action by name, calls `GraphQLActionClient.RunAction`. In-memory `Map` cache keyed `messageId|field|lang|len|djb2(text)`, capped at 200. Language list hardcoded (29 languages). Default `'English'`; last pick in `localStorage` `izzy.translate.lastLanguage`. |
| Action | `packages/IzzyActions/src/actions/TranslateMessageContent.action.ts` | `@RegisterClass(BaseAction, "__TranslateMessageContent")`. Whitelists field names. Validates language name `/^[\p{L}\p{M} ()'-]+$/u`, max 40. Loads the record **as the context user** and reads text from the DB, not the request. Resolves org AI config via `AIConfigurationEngine.resolveForChannel`. |
| Lib service | `packages/IzzyLib/src/services/MessageTranslationService.ts` | Stateless `TranslateText`. Finds prompt by name, runs `AIPromptRunner.ExecutePrompt` with `configurationId` + `apiKeys`. `CleanAndParseJSON`. 60,000-char input cap (`INPUT_TOO_LONG`). |
| Prompt | `metadata/prompts/templates/izzy-message-translator.template.md` | Vars `AgentName`, `targetLanguage`, `sourceSubject`, `sourceText`. Returns `{detectedLanguage, translatedText, translatedSubject}`. Preserves markup/URLs/names. JSON response format, Highest power preference, caching off. Model bindings: GPT-OSS-120B (Groq, Cerebras), Gemini 3 Flash / 3.1 Flash-Lite / 3.7 Flash. |

**Nothing is persisted.** MJ core has no translation action or prompt; the only trace is
an idea stub in `packages/Actions/future-action-ideas.md:32-40` ("Content Translation Action").

### 1.3 Explorer's string surface

Explorer loads 16 real packages under `Angular/Explorer`, 70 under `Angular/Generic`,
plus Bootstrap. Counts are regex hits, not hand review; treat as ±20%.

| Surface | Approx. count | Where it concentrates |
|---|---|---|
| Template text nodes (`.html` + inline) | 7,500 | Explorer dashboards 2,743 html + 1,061 inline (AI 851, Integration 515, KnowledgeHub 227); Generic 1,480 html + 550 inline (artifacts 322, conversations 261, entity-viewer 154) |
| Template attributes (`placeholder`, `title`, `aria-label`, `label=`, `{{'Lit'}}`) | 2,700 | `title=` alone is 1,410 hits; there is **no shared tooltip directive** (7 `matTooltip`, `[mjTip]` is workspace-tabs only) |
| TypeScript literals (toasts, errors, `title:`, `label:`, `tooltip:`, `message:`) | 3,500 | `CreateSimpleNotification(` 962 calls, 439 with a literal first arg |
| Generated form section names (`SectionName="…"`) | 2,219 (1,183 unique) | Baked as literals by `CodeGenLib/src/Angular/angular-codegen.ts` (lines ~742, 894-916, 1007, 1062-1093) from `EntityField.Category` and relationship/entity DisplayName |
| Nav labels in `metadata/applications/*.json` | 83 | Already metadata-driven |
| Generated form **field labels** | 4,746 `<mj-form-field FieldName>` | **Already runtime-resolved** via `base-forms/src/lib/field/form-field.component.ts:338` `get DisplayName()` → `DisplayNameOverride` → related name field → `field.DisplayNameOrName`. Free once display names resolve per language. |

### 1.4 Choke points (shared primitives most templates route through)

All under `packages/Angular/Generic/` unless noted. Uses = tag/call sites across Explorer + Generic.

| Primitive | Path | Uses | Text inputs |
|---|---|---|---|
| Notifications | `notifications/src/lib/notifications.service.ts:354` `CreateSimpleNotification` | 962 | message string |
| Empty state | `ui-components/src/lib/empty-state/empty-state.component.ts` | 524 | `Title`, `Message`, `ActionText` |
| Loading | `shared/src/lib/loading/loading.component.ts` | 330 | message |
| Alert | `ui-components` `mj-alert` | 131 | projected |
| Page header | `ui-components/src/lib/page-header/page-header.component.ts` | 99 (+51 interior) | `Title`, `Subtitle` |
| Dialog / confirm | `ui-components/src/lib/dialog/dialog.service.ts`, `confirm-dialog/confirm-dialog.component.ts` | ~60 tags, 36 `open`, 10 `confirm` | **English defaults hardcoded**: `'Confirm'`, `'Are you sure?'`, `'Cancel'` |
| Form field label | `base-forms/src/lib/field/form-field.component.ts:338` | 4,746 | metadata; hardcodes `'Created'` / `'Updated'` for `__mj_` fields |
| Section panel | `base-forms/src/lib/panel/collapsible-panel.component.ts:572` | 2,219 | `SectionName` verbatim |
| Grid headers | `entity-viewer/src/lib/entity-data-grid/entity-data-grid.component.ts:2794, 2887` | all grids | `field.DisplayNameOrName` |
| App nav | `Explorer/base-application/src/lib/application-manager.ts` (~250) → `BaseApplication.GetNavItems()` | 83 labels | `NavItem.Label` |
| Button | `ui-components/src/lib/button/button.directive.ts` | 953 | projected content; **not** a text choke point |

### 1.5 Display-name resolution in MJCore

`packages/MJCore/src/generic/entityInfo.ts`: `EntityFieldInfo.DisplayName` (846),
`.Description` (847), `.Category` (878), `DisplayNameOrName` (2243); `EntityInfo.DisplayName`
(2450), `.Description` (2458), `DisplayNameOrName` (3517); `EntityRelationshipInfo.DisplayName`
(112). Built in `providerBase.ts:5134` as plain copies of DB values. **No locale parameter,
no lookup hook.** Angular usage: `DisplayNameOrName` 83, `.DisplayName` 265, `.Description` 798.

---

## 2. Design decisions

### 2.1 Runtime resolution, not compile-time `$localize`

Angular's built-in i18n is rejected. It requires one build per locale, message extraction
across 86 library packages, cannot cover metadata text or OpenApps, and cannot react to a
per-user preference at runtime. Remove the dead `@angular/localize` polyfill as part of Phase 1.

### 2.2 Two translation modes, clearly separated in the UI

- **Content translation** (Phase 2) is *ephemeral and labelled*. The banner copy from Izzy
  ("…for reading only. The original is what the sender wrote.") stays. Never persisted,
  never sent, never substituted for the source in any write path.
- **UI localization** (Phases 3–4) is *served from an approved catalog*. AI-suggested
  strings default to `AISuggested` status and are not served until approved. A per-deployment
  setting allows unreviewed serving for orgs that want it.

### 2.3 Language preference is server-side

Stored as `mj.locale.language` (BCP-47) via `UserInfoEngine.SetSetting`, not localStorage.
It follows the user across devices and is readable by Izzy, the mobile host, and any OpenApp.
A browser-only fallback (`navigator.language`) applies before first login.

### 2.4 Source-text keys for hardcoded UI strings

Phase 4 uses the English source string as the catalog key (`{{ 'Close Tab' | t }}`), not
synthetic IDs. This avoids a key registry, makes templates stay readable, lets an extraction
script build the catalog mechanically, and matches how `MJ: Localized Strings` keys
metadata text (`SourceKey` + `SourceTextHash`). A stale-hash check catches edited source text.

### 2.5 Chrome's page translate is the baseline to beat

Browser auto-translate already works on Explorer for free. Anything shipped here must beat it
on: no flicker on Angular re-render, correct handling of `placeholder`/`aria-label`/`title`,
consistent domain terminology (entity names, statuses), and not translating identity keys.
A DOM-walking "translate this page" AI mode was considered and rejected for the same reasons
Chrome's version is unsatisfying: fragile under re-render, no terminology control, and cost
per view.

---

## 3. Phases

### Phase 1 — Locale foundation (~1 week)

Useful on its own even if nothing else ships. Screen readers announce the correct language,
dates and numbers format correctly, and the preference exists for everything downstream.

1. **Preference.** `mj.locale.language` on `UserInfoEngine` (get/set + `Preference$`
   observable, mirroring how `ThemeService.Preference$` is consumed in
   `shell.component.ts:2789-2821`). Fallback chain: setting → `navigator.language` → `en`.
2. **Switcher.** New `user-menu-item` in the shell avatar menu
   (`shell.component.html:185-241`, alongside `toggle-theme`). Language list comes from
   Phase 3's `MJ: Languages` once it exists; Phase 1 ships with a static list matching Izzy's 29.
3. **Document attributes.** A `LocaleService` (L0, browser-safe, in `Angular/Generic/shared`)
   sets `document.documentElement.lang` and `dir` (`rtl` for `ar`, `he`, `fa`, `ur`) on
   preference change. Replace the static `lang="en"` in `MJExplorer/src/index.html`.
4. **Formatting.** One shared formatter (extend `MJCore/src/generic/util.ts` `FormatDateOnly`
   / `FormatValue` to take the active locale; add `FormatNumber`). Replace the 59
   `toLocale*String('en-US')` calls. Provide Angular `LOCALE_ID` from the preference so
   `DatePipe`/`DecimalPipe`/`CurrencyPipe` follow it.
5. **Cleanup.** Remove the unused `@angular/localize` dependency, polyfill, and `types` entry.

**Exit criteria:** switching language updates `lang`/`dir` and every date/number in the
shell without reload; preference persists across devices; zero remaining `'en-US'` literals
in `packages/Angular/**`.

### Phase 2 — Port Izzy's content translation to core (~2 weeks)

1. **Action.** `Translate Text` in `packages/Actions/CoreActions` (retire the stub in
   `future-action-ideas.md`). Two input shapes:
   - `EntityName` + `RecordID` + `FieldName` → loads the record as the context user, reads
     the field from the DB (Izzy's security posture; row-level permissions apply).
   - `Text` (direct) → for transient content such as an unsent draft or an artifact body.

   Inputs: `TargetLanguage` (validated as in Izzy), optional `SourceLanguage`. Outputs:
   `TranslatedText`, `DetectedLanguage`, optional `TranslatedTitle`. 60,000-char cap.
   Result codes: `SUCCESS`, `INPUT_TOO_LONG`, `INVALID_LANGUAGE`, `FIELD_NOT_ALLOWED`,
   `PERMISSION_DENIED`, `AI_FAILED`.
2. **Prompt.** `MJ: Text Translator` in `metadata/prompts`, template ported from
   `izzy-message-translator.template.md` with `AgentName` removed. JSON response format,
   caching off. Model bindings chosen at deploy time; default to the cheapest fast tier.
3. **Client service.** `TranslationClientService` in `Angular/Generic/shared`: wraps
   `RunAction`, in-memory cache keyed `entity|record|field|lang|len|hash` (cap 200), last
   language remembered via `UserInfoEngine` (`mj.locale.translateTarget`), not localStorage.
4. **Widget.** `mj-translate-toggle` (L1, `Angular/Generic/ui-components`): the
   Translate button, "Translate to" picker, loading state, banner with **Show original**,
   error state. Takes either a record reference or a text getter. Emits `Translated` /
   `Cleared` so hosts can hide edit affordances while a translation is shown (Izzy hides
   approve/edit for translated drafts).
5. **First surfaces** (in order of read volume):
   - Conversation messages: `Generic/conversations/.../message/message-item.component`.
   - Artifact viewer: `Generic/artifacts/.../artifact-viewer-panel.component` (text/markdown
     artifact types only; plugin viewers opt in).
   - Long-text form fields: `base-forms/.../form-field.component` when `Type === 'textarea'`
     or `'code'` with a markdown/text extended type, read-only mode only.
   - Entity-data-grid cell expand/preview for long text (stretch).

**Exit criteria:** a Chinese conversation message can be read in Spanish with the banner
and original restored on click; translated text never reaches a Save path; a user without
read permission on the record gets `PERMISSION_DENIED`, not a translation.

### Phase 3 — Metadata text catalog (4–6 weeks)

Adopts the 2026-08-29 proposal with corrections from this scoping.

1. **Entities** (one migration in `migrations/v6/`; entity via CodeGen; seed via `metadata/`):
   - `MJ: Languages`: `Code` (BCP-47), `Name`, `NativeName`, `IsRTL`, `IsActive`, `IsDefault`.
   - `MJ: Localized Strings`: `SourceType` (`EntityDisplayName` / `EntityDescription` /
     `EntityFieldDisplayName` / `EntityFieldDescription` / `EntityFieldCategory` /
     `EntityFieldValue` / `RelationshipDisplayName` / `ApplicationName` / `NavItemLabel` /
     `UIString`), `SourceKey`, `LanguageID`, `TranslatedText`, `SourceTextHash`, `Status`
     (`Draft` / `AISuggested` / `Approved`), `ApprovedByUserID`.
   - Setting: `mj.locale.serveUnapproved` (deployment-level) for orgs that accept AI output.
2. **Engine.** `LocalizationEngine` (`BaseEngine`, browser-safe; lives with the other
   client-safe engines in `packages/MJCoreEntities/src/engines/` unless it grows enough to
   warrant its own package). `Resolve(sourceType, sourceKey, lang): string | undefined`
   with hash-staleness; O(1) map lookup after load; refreshes on the standard
   pub/sub metadata-change channel.
3. **Hook display names.** Add a locale-aware accessor layer rather than mutating
   `EntityInfo`: `EntityFieldInfo.GetDisplayName(lang?)`, `EntityInfo.GetDisplayName(lang?)`,
   etc., defaulting to the current `DisplayNameOrName` behaviour when no translation exists.
   Update the four consumers that matter: `form-field.component.ts:338`,
   `entity-data-grid.component.ts:2794/2887`, `collapsible-panel.component.ts:572`, and the
   entity-description surfaces. Leave the 265 raw `.DisplayName` reads for Phase 4's sweep.
4. **Section names.** Change `angular-codegen.ts` to emit the *key* (`EntityField.Category`
   value or relationship ID) alongside `SectionName`, and have `collapsible-panel` resolve
   through the engine at render time. One CodeGen run regenerates all 391 templates.
5. **Nav labels.** `NavItem.Label` is an identity key (URLs at `shell.component.ts:1882`,
   lookups at `:1461`, `:3025`, `tab-container.component.ts:1890/2910`,
   `app-nav.component.ts:459/492`, omnibar IDs in `omnibar-command.provider.ts:89-97`).
   Add `DisplayLabel` to `NavItem`, resolved via `NavItemLabel` source type; never translate
   `Label` itself.
6. **Translation Suggestion action** (bulk): enumerate untranslated keys for an entity or
   application, call `Translate Text` per batch, write `AISuggested` rows.
7. **Localization Center dashboard** (`scaffold-mj-dashboard`): coverage matrix (source type ×
   language), review queue with side-by-side approve, stale-hash queue, "translate this
   entity/app" bulk action. Mockup already exists at
   `plans/weekly-exploration/2026-08-29/mockups/localization-center.html`.

**Exit criteria:** with Spanish active, a generated Contact form shows translated field
labels, section titles, and grid headers; renaming a field's DisplayName flags its
translations stale; OpenApp entities get the same treatment with no app-side code.

### Phase 4 — Hardcoded UI strings (incremental, multi-month)

Never a single project. Infrastructure first, then per-package chores.

1. **Pipe + directive.** `t` pipe (`{{ 'Close Tab' | t }}`) and `[mjT]` attribute directive
   for `placeholder`/`title`/`aria-label`. Both resolve `UIString` through
   `LocalizationEngine`, falling back to the source text. A `T()` function for TS literals
   (toasts, `title:`, `label:` config objects).
2. **Extraction script.** `scripts/extract-ui-strings.mjs` walks templates and TS for
   `| t`, `[mjT]`, and `T(`, emits the `UIString` catalog as metadata seed JSON. Runs in
   CI to keep the catalog current.
3. **CI ratchet.** Same shape as the Generic DOM coverage ratchet in
   `.github/workflows/test.yml` (an absolute cap on unpiped user-facing literals per tree,
   lowered as packages are converted). Non-blocking report first, gate after the shell and
   primitives are done.
4. **Order of conversion** (highest visibility per edit first):
   1. Shell chrome (`explorer-core/shell`): "Skip to main content", "Search everything", tab
      menu, unsaved-changes prompts, 14 `Label:` literals.
   2. Shared primitives: confirm-dialog defaults, dialog service, empty-state, page-header,
      loading, alert, `form-field`'s `'Created'`/`'Updated'`.
   3. Notification messages via a `CreateSimpleNotification` sweep (439 literal calls).
   4. Generic packages by traffic: conversations, artifacts, entity-viewer, file-storage.
   5. Explorer dashboards by usage, AI dashboard first (851 nodes).
5. **Tooltips.** Introduce a shared `[mjTooltip]` directive during the primitives pass so the
   1,410 `title=` attributes gain a choke point; convert opportunistically.
6. **Bulk seed.** Once a package is piped, run Translation Suggestion over its `UIString`
   keys for each active language; approve in the Localization Center.

**Exit criteria (per package):** ratchet count for the package is 0; catalog rows exist for
every active language; DOM tests for the package pass with a non-English preference set.

---

## 4. Out of scope (explicitly deferred)

- **RTL layout mirroring.** Phase 1 sets `dir`; actual mirroring of flex/grid layouts,
  icons, and the shell is a separate effort after Phase 3.
- **Pluralization and grammatical gender.** `TranslatedText` is a single string. Add
  `VariantJSON` when a real deployment needs it.
- **Translating user data at rest** (writing translated values into records). Content
  translation is read-only by design.
- **Communication templates.** The catalog supports a `CommunicationTemplate` source type
  later; not wired in these phases.
- **Mobile host.** Reads the same `mj.locale.language` setting; no mobile-specific work here.

---

## 5. Risks

| Risk | Mitigation |
|---|---|
| AI cost per content translation | Client cache, 60k cap, cheap-tier default model, no auto-translate on view (always user-initiated). |
| Terminology drift across UI strings | Prompt receives a glossary of entity/status names from metadata; Localization Center review queue. |
| Identity-key breakage (nav `Label`, `SectionName` lookups) | `DisplayLabel` split (Phase 3.5); CodeGen emits keys (Phase 3.4). Grep for `=== .*Label` before touching. |
| Re-render flicker when preference changes | Engine is synchronous after load; pipe is pure with a language input, so change detection swaps text in one pass. |
| OpenApp regressions from display-name accessor changes | Accessors default to today's behaviour when no translation exists; integration tier run with `en` and one non-`en` language. |
| CodeGen regeneration churn in Phase 3.4 | Land the template change and the regeneration in one PR; `check:codegen-tail` as usual. |

---

## 6. Sequencing and branching

- Phase 1 → `feat/locale-foundation`. Small, self-contained, no migration.
- Phase 2 → `feat/translate-text-core`. Depends on Phase 1 for the target-language default only; can start in parallel.
- Phase 3 → `feat/localized-strings` (migration + metadata; `minor` changeset). Depends on Phase 1.
- Phase 4 → one branch per package, `feat/i18n-<package>`, after Phase 3's engine lands.

Each phase's Definition of Done follows the repo rule: package unit tests plus the
deterministic integration tier, with a non-English preference exercised in at least one
DOM test per touched Angular package.
