# Idea 2: Localization-by-Default Framework Layer

**Week of 2026-08-29 · Creative exploration · Framework-level (core, not a vertical app)**

## The problem, framed for the world, not the codebase

Immigrant-serving nonprofits, multilingual congregations, international professional societies,
and global NGOs all share a quiet exclusion built into most of the software they run on: it speaks
one language, and everything else is a bolt-on. A member whose first language isn't English has to
navigate a renewal form, a donation receipt, or an event confirmation in a language they're not
fully comfortable in — or staff have to hand-translate every important communication, one email at
a time, forever. For organizations that receive federal funding, this isn't only an inclusion
problem; U.S. federal guidance under Title VI directs recipients to take reasonable steps to
provide meaningful access for people with Limited English Proficiency (LEP) — a compliance
obligation layered on top of the basic fact that excluding people who can't read the default
language is bad for the mission, not just bad optics.

Looking at how the association-management market handles this in 2026 is instructive: multilingual
support shows up as a differentiator, not a default — one platform is available in exactly two
languages, another offers multilingual microsites as a premium capability. Nobody treats
translation as a property of the *generator*, the way MJ could. That's the gap: because MJ
auto-generates the majority of the UI text any app built on it will ship — field labels,
descriptions, validation messages, value-list options — from metadata, it is uniquely positioned to
make "configure N languages, every generated surface picks it up" a framework capability instead of
a per-app translation project. This is the same leverage argument the accessibility idea made for
disability access, applied to language access.

## What already exists (and why this doesn't duplicate it)

- **The accessibility-by-default work** (2026-08-07 idea 3, now in progress as PR #3609) is the
  direct precedent for *how* to do this: fix it once at the CodeGen template layer so every existing
  app inherits it on the next `mj codegen`, plus a dashboard for visibility. This proposal follows
  that exact playbook for language instead of ARIA/contrast — same leverage point, different axis
  of exclusion. It does not touch PR #3609's code; it applies the same *pattern* to a disjoint set
  of templates (text-emitting, not markup/ARIA-emitting).
- **`Entity.DisplayNamePlural`** and the "Business-user usability" work (PR #3043, open) already
  established the principle that a field's on-screen label is a *stored, admin-editable* value with
  an algorithmic fallback, not a hardcoded string baked into the generated component — and flagged
  that stored value as "the seam for non-English plurals" without building it. This proposal is
  that seam, generalized from "one plural form" to "N language variants."
- **`UserInfoEngine`** (`packages/MJCore`, documented in `.claude/rules/data-access.md`) is already
  the correct, cross-device place to persist a user's preferred language — this proposal stores the
  choice as `mj.locale.language` via `UserInfoEngine.Instance.SetSetting()`, exactly like every
  other per-user preference in the system. **No new preference-storage mechanism is introduced.**
- **Communication templates** (`packages/Actions/CoreActions/src/custom/communication/*`) already
  render templated messages. This proposal's translation substrate is the source of *variant text*
  those templates can select by recipient language — it does not touch template rendering or
  delivery logic.
- This is explicitly **not** a translation *service* (no MJ-hosted machine-translation vendor) — it
  is the metadata substrate plus a pluggable `Action` seam (mirroring how the Data Health idea this
  same week keeps `ExternalReference` rules as a hook, not a vendor integration) so any org can wire
  in the AI provider or translation vendor of their choice.

## Proposed architecture

### New entities (`__mj` core schema)

| Entity | Purpose |
|---|---|
| `MJ: Languages` | `Code` (BCP-47, e.g. `es`, `fr-CA`), `Name`, `NativeName`, `IsActive`, `IsDefault` |
| `MJ: Localized Strings` | The generic translation unit: `SourceType` (`EntityField` / `EntityFieldValue` / `UIString` / `CommunicationTemplate`), `SourceKey` (e.g. `Entity:Contact.FirstName` for a field label, or a template's content-block ID), `LanguageID`, `TranslatedText`, `SourceTextHash` (hash of the source-language text at translation time — see staleness below), `Status` (`Draft` / `AISuggested` / `Approved`), `ApprovedByUserID` (nullable) |

One generic table, keyed by a source type + key, covers every kind of translatable text in the
system — entity labels/descriptions, dropdown/value-list option text, static UI strings CodeGen
emits, and communication template content — without a bespoke translation table per surface.

### `LocalizationEngine` (new package, `packages/Core/Localization`, `Base` + `Engine` split)

- `Resolve(sourceType, sourceKey, languageCode)` — the hot-path lookup: returns the approved
  translation if one exists and its `SourceTextHash` still matches the current source text,
  otherwise falls back to the source-language text. Cached the same way every other small,
  frequently-read entity set is cached in MJ (`BaseEngine` + `ObserveProperty`, per the caching
  guide) — this is a per-request lookup path, so it has to be effectively free.
- **Staleness detection**: whenever a translated source string changes (an admin renames a field's
  `DisplayName`, or edits a communication template), the stored `SourceTextHash` on every
  `Localized Strings` row for that key no longer matches — `Resolve()` can then flag it as stale
  rather than silently serving a translation of text that no longer exists. This directly answers
  the open question the 2026-08-07 Decision Provenance idea's outcome record raised about
  extraction depending on voluntary upkeep: staleness here is *detected*, not hoped for.
- **`Translation Suggestion` action** (`CoreActions`, using `AIPromptRunner` exactly like the
  existing `SummarizeContentAction`/`ContentSummarizer` pattern documented in
  `packages/Actions/CLAUDE.md`) — given a source string and a target language, proposes a
  translation and writes it as `Status = AISuggested`. A human always approves before it's served
  to end users by default (configurable per deployment for orgs that trust AI-suggested text
  unreviewed) — the same "AI proposes, a human commits" posture the accessibility idea and this
  week's Data Health idea both use.

### CodeGen touch point (the leverage point, mirroring the accessibility template fix)

- Generated Angular form/grid templates (`packages/CodeGenLib/src/Angular/angular-codegen.ts` and
  the related-entity component generators) call `LocalizationEngine.Resolve('EntityField',
  '<Entity>.<Field>', currentLanguage)` for field labels, descriptions, and validation messages,
  falling back to the existing `DisplayName`/`Description` metadata when no translation exists —
  **zero behavior change for any deployment that never configures a second language.** This is the
  same "off-by-default, latent capability" shape the business-user-usability work used for the
  theme picker: the mechanism ships everywhere, the cost is paid only by orgs that turn it on.

### UI (Angular, L1/L2 per the UI layering guide)

- **Language switcher** — a small avatar-menu control (same UI slot pattern as the existing theme
  switcher from PR #3043), writing the choice to `UserInfoEngine` as described above.
- **Localization Center dashboard** (`packages/Angular/Explorer/dashboards`, `scaffold-mj-dashboard`
  pattern) — a coverage matrix (entities × languages, % translated), a review queue of
  `AISuggested`/stale strings with side-by-side source/translation and one-click approve, and a
  "translate this entity" bulk action that queues the `Translation Suggestion` action across every
  untranslated field/value on an entity.

### Why this belongs in core, not an app

A university's alumni portal, a professional society's member directory, and a healthcare network's
patient-facing intake form all need the same thing: every generated label, message, and template
available in more than one language, with a clear signal when a translation has gone stale. The
mechanism (a generic key→language→text table, a CodeGen-level resolution call, an AI-assisted
suggestion action) is completely domain-agnostic; only *which languages an org enables* and *which
strings get prioritized* are configuration choices left to the app builder.

## Phased rollout

1. **Phase 1** — `Languages` + `Localized Strings` entities, `LocalizationEngine.Resolve()` with
   staleness detection, `UserInfoEngine`-backed language switcher, CodeGen template fix for
   generated form field labels/descriptions (the highest-value, most-visible surface first).
2. **Phase 2** — `Translation Suggestion` action, the Localization Center dashboard, value-list
   option text and validation-message coverage.
3. **Phase 3** — Communication template content coverage, and a `check:i18n`-style CI report
   (non-blocking at first, mirroring how `check:a11y` seeded a baseline before gating) that flags
   newly added user-facing strings with no translation entry, so coverage doesn't silently regress
   as an app evolves.

## Open questions

- Right-to-left language support (Arabic, Hebrew) touches layout, not just text substitution — this
  proposal's entities and resolution engine are RTL-agnostic, but the Angular layout work to
  actually mirror generated forms is a larger, separate effort flagged for a future cycle, not
  bundled into this one so the core translation substrate can ship independently.
- Pluralization and gendered-language grammar rules (a translated string sometimes needs to vary by
  count or grammatical gender, not just swap 1:1) are deferred past Phase 1 — `TranslatedText` is a
  single string in the initial design; a follow-on could add an optional `PluralForms`/`VariantJSON`
  column once real deployments hit the need, rather than over-designing it speculatively now.

## Mockup

See [`mockups/localization-center.html`](./mockups/localization-center.html) — the Localization
Center dashboard showing per-language coverage, the AI-suggested translation review queue, and a
generated Contact form rendered in Spanish as a live example of the CodeGen template fix. Screenshot:
[`screenshots/idea-2-localization-center.png`](./screenshots/idea-2-localization-center.png).
