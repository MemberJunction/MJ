# Global Configuration Surfaces — Review & Evaluation

**Status:** For review/decision (assigned: @rkihm-bc) · **Raised:** 2026-07-04 · **Origin:** Omnibar PR #3042 added a `Shell.Omnibar.Enabled` flag via Instance Configurations, prompting the question: *why do we have both `ApplicationSetting` (NULL ApplicationID = global) and the standalone `InstanceConfiguration` table?*

Both are legitimate mechanisms with real, current consumers. This doc inventories where each is used today, compares them honestly, and frames the decision: **adopt a doctrine for when to use which — or consolidate.** No code changes in this PR.

---

## 1. The two surfaces

### `__mj.InstanceConfiguration` (entity: `MJ: Instance Configurations`)

| Column | Notes |
|---|---|
| `FeatureKey` | **Unique** dot-notation key (`Shell.SearchBar.Enabled`) — one flat namespace |
| `Value` / `ValueType` / `DefaultValue` | Typed, self-describing, with a declared default |
| `Category` / `DisplayName` / `Description` | Admin-UI metadata — the row *documents itself* |

- **Engine:** `InstanceConfigEngine` (`MJCoreEntities/src/engines/InstanceConfigEngine.ts`) — typed getters (`GetBoolean/GetNumber/GetJSON/Get`), **default-on-absent semantics** (a flag can ship as code-default with no row), admin `Set()`.
- **Scope model:** deliberately none — one value per key per deployment.

### `__mj.ApplicationSetting` (entity: `MJ: Application Settings`)

| Column | Notes |
|---|---|
| `ApplicationID` | **Nullable** — NULL = global, non-NULL = app-scoped |
| `Name` / `Value` | Plain name/value; no type, no default, no display metadata |

- **Engine:** `ApplicationSettingEngine` (`@RegisterForStartup`) — `GetSetting(name, applicationId?)` resolves **app-scoped first, then global fallback**; debounced `SetSetting` write path.
- **Scope model:** two tiers (app → global) in one read.

*(Third tier for completeness: per-user preferences live in `UserInfoEngine` / `MJ: User Settings` — not part of this question.)*

## 2. Where each is used today (inventory, 2026-07-04)

### InstanceConfiguration — 8 seeded rows (`metadata/instance-configurations/`) + 1 code-default key

| FeatureKey | Category | Consumer |
|---|---|---|
| `Shell.SearchBar.Enabled` / `.EnablePreview` | Shell | `shell.component.ts` |
| `Shell.ChatOverlay.Enabled` / `.AllowOpenInFullApp` | Shell | shell / chat overlay |
| `Shell.Omnibar.Enabled` *(code default, no row — PR #3042)* | Shell | shell → omnibar palette |
| `Search.FullTextSearch.Enabled` / `.VectorSearch.Enabled` / `.DefaultMinScore` | Search | search stack |
| `KnowledgeHub.Enabled` | Applications | Knowledge Hub gating |

Additional consumers: `about-dialog.component.ts` (Explorer), **DevTools `settings-explorer.component.ts`** — an admin UI that browses these rows (leveraging Category/DisplayName/Description).

### ApplicationSetting — 2 live rows

| Name | ApplicationID | Consumer |
|---|---|---|
| `Conversations.DefaultAgentID` | NULL (global) | `ConversationsRuntime` / `DefaultAgentResolver` — resolution chain is *explicit → app-scoped setting → global setting → code-const Sage fallback*; the app→global fallback is load-bearing here |
| `classify.org.context` | (AI app) | Autotagging (dashboards: classify-org-context editor, source-type dialog) |

## 3. Compare & contrast

| Dimension | InstanceConfiguration | ApplicationSetting (NULL = global) |
|---|---|---|
| Uniqueness | Enforced unique FeatureKey | Duplicable name across apps (by design) |
| Typing | `ValueType` + typed getters | Untyped strings |
| Defaults | First-class `DefaultValue` + code-default-on-absent | None — absence handled per consumer |
| Self-documentation | Category/DisplayName/Description → admin browsable (settings-explorer) | None |
| Scoping | None (instance-wide only) | App → global fallback in one call |
| Write path | Admin `Set()` | Debounced `SetSetting` (UI-friendly) |
| Startup cost | Lazy engine | `@RegisterForStartup` (always loaded) |
| Natural fit | **Feature flags & deployment knobs** | **App-configurable settings that may need a global default** |

**The overlap:** a *global-only* setting fits both. `Conversations.DefaultAgentID` (global row) could have been an InstanceConfiguration; `Shell.Omnibar.Enabled` could have been a NULL-app ApplicationSetting. Today the choice is made by precedent-per-area, not doctrine — that's the gap.

## 4. Options

**A. Keep both + write the doctrine (low effort, recommended starting point).**
Rule of thumb: *"Would an app-scoped override of this value ever make sense?"* Yes → ApplicationSetting. No (deployment-wide switch/knob) → InstanceConfiguration. Document in root CLAUDE.md + a short guide section; optionally add a lint-style review checklist item. Existing rows stay put.

**B. Consolidate into ApplicationSetting.**
Add the missing columns (ValueType/DefaultValue/Category/DisplayName/Description), migrate the 8 instance rows to NULL-app rows, retire InstanceConfiguration + engine, point settings-explorer at the enriched table. Pros: one table, scoping for free. Cons: real migration + engine/API churn across shell/search/KH consumers; `@RegisterForStartup` engine becomes the single (heavier) path; unique-key semantics for flags get weaker (name+NULL-app uniqueness needed).

**C. Consolidate into InstanceConfiguration (add an ApplicationID column).**
Inverse of B; keeps the typed/self-describing shape and the admin explorer, adds nullable scoping + the fallback read. Cons: same churn on the conversations/autotagging side; two-tier resolution must be rebuilt there.

## 5. Evaluation criteria for the decision

1. How many *future* settings genuinely need app-scoped overrides vs. instance-wide flags? (History: 8 flags vs. 2 settings — flags are winning.)
2. Cost of carrying two engines/tables + doctrine vs. one-time consolidation churn.
3. Admin UX: settings-explorer's browsability depends on the typed/self-describing columns — any consolidation must preserve them.
4. Startup/caching posture: flags want cheap, lazy, default-on-absent reads; app settings want startup-warm caches for resolution chains.

## 6. Suggested next steps

1. @rkihm-bc reviews this inventory + options; pick A now (doctrine) even if B/C is desired later — it stops new drift immediately.
2. If A: PR the doctrine into root CLAUDE.md + `guides/` (half a day).
3. If B or C: spec the migration (column adds, row moves, engine merge, consumer re-points — the inventory above is the full blast radius today, ~10 files) as its own project.
