# Making MemberJunction Feel Like Home for Business Users

**Status:** Active · Phase 1 (Foundation) in progress
**Branch:** `claude/mj-business-user-usability-onfrmz`
**Owner:** Platform / Explorer

---

## 1. Why this work exists

MemberJunction is, today, an exceptional platform *for the people who build on it*. The README says it plainly — "the open-source, AI-native data platform," "175 modular TypeScript packages," "one object model that runs identically on the server, in the browser, in the CLI." Every hero example is a code snippet. The docs speak of metadata, CodeGen, providers, schema, GraphQL. That framing is correct and it is a strength: MJ's technical depth is real and hard-won.

But there is a second audience who never writes a line of that code and yet is supposed to get value from the platform every day: the **business user**. The membership director who wants to know who's about to lapse. The events coordinator updating a batch of registrations. The ops manager who just wants to ask a question about the data and trust the answer. For that person, MJ's technical excellence is invisible at best and intimidating at worst.

The good news — and the thesis of this entire effort — is this:

> **MJ has already built almost every consumer-grade primitive a business user needs. They are just latent, off-by-default, and wearing developer vocabulary.**

This is not a "build a business-user product" problem. It is a **framing, defaults, and on-ramp** problem. That is dramatically cheaper to solve and it compounds: every fix makes the next feature land better.

### The evidence (from a four-surface audit)

A structured audit of the surfaces business users actually touch — Explorer end-user UX, the conversational/agent surface, the no-code building tools, and the cross-cutting onboarding/permissions/sharing concerns — found the same story on every surface:

**The friendly parts already exist.** The Google-Docs-grade share dialog. The unified notification engine (in-app + email + SMS, per-user prefs, per-type templates). Self-service User Routines with a genuinely approachable "run this for me every weekday morning" form. A personalized Home with drag-to-reorder pins, favorites, and recents. Sage as a zero-config default agent. And the standout: the **Bulk Operations Studio** with its dry-run → diff → confirm → apply flow — the single most business-user-friendly pattern in the codebase.

**But they are gated behind developer wiring or turned off.** Chat ships a blank box with *no* starter prompts. Email/SMS notifications default **off** for "your agent finished." The Appearance/theme tab is literally `disabled: true`. Tool-confirmation safety gates only fire if a developer coded a handler. The app "marketplace" (Open Apps) is Git-and-CLI only, with no in-product browse-and-click.

**And developer nouns leak everywhere a user navigates.** The default Data Explorer app — pitched as data browsing — says *"Search entities…"*, *"142 entities across 8 applications"*, *"No Entities Available."* Record labels fall back to `Contacts: 8f3a1b2…` truncated GUIDs. The Sharing Center groups by *"Access Control Rules"* and *"Resource Permissions."* `MJ:` schema prefixes surface in settings labels. "Entity" is a data-modeling term; a business user thinks *Contacts*, *Invoices*, *Members* — never "entities."

### The north star

MJ's real differentiator for business users is the combination it already has: **unified data + agents that operate on that data + dry-run safety.** The one-sentence promise is:

> **Ask questions about your data, and safely act on it — without code.**

The three pillars of that promise already ship (Sage chat, Bulk Ops dry-run, Predictive Studio's "Predictions" door). This effort is about making that promise **visible, humane, and on by default**.

---

## 2. Design principles

Every change in this effort is measured against these.

1. **Use the user's domain nouns, not the platform's meta-nouns.** A user never thinks "entity." Show the thing (*Contacts*, *Members*) via each entity's configured `DisplayName`; only fall back to a generic word ("data," "records") when there is genuinely no specific name. The *specific* name should win almost always.
2. **Match the word to the reader.** Keep technical terms where the audience is technical — the Admin app, developer docs, and **agent-tool contracts** (tool names like `OpenEntityData` are a machine interface, not user copy). Only translate on surfaces a business user lands on: Home, Data Explorer, Chat, Search, Sharing Center, Settings, notifications.
3. **One word per concept, everywhere.** The View / Query / Report / Dashboard tangle confuses because it is four overlapping words for "saved output" with no explanation. Pick the smallest vocabulary and reuse it relentlessly.
4. **Safe, humane defaults.** A preference a user would obviously want on (email me when my agent finishes) should be on. Safety a user would obviously expect (confirm before an agent sends an email) should not depend on a developer having wired it.
5. **Latent capability must be switched on and dressed up, not rebuilt.** Before building anything, check whether the primitive already exists. It usually does.
6. **Configurable per deployment.** MJ serves many organizations. Vocabulary is not a hardcode — a membership org should see "Members," a law firm "Matters," and neither should ever see "entity." The mechanism is metadata (`DisplayName`), not string literals.

---

## 3. The vocabulary translation

This is the heart of Phase 1. The mapping below is the agreed target. Note: **"agent" stays** — it has crossed into common usage and renaming it to "assistant" would make MJ read as *behind*, not friendlier. We translate only the genuinely platform-internal terms.

### Core data browsing (the worst offender — the default Data Explorer app)

| Current (leaks) | Target | Rationale |
|---|---|---|
| "Entity" / "Entities" | The entity's `DisplayName` (plural) — *Contacts, Invoices*. Generic fallback: **"data"** / **"records"** | Never show the meta-noun; show the thing |
| "Search entities…" | **"Search your data…"** | Plain, action-oriented |
| "142 entities across 8 applications" | **"142 types of data across 8 apps"** — or hide the count | The count is a schema fact, not a user need |
| "No Entities Available" | **"Nothing here yet"** + a teaching CTA | Empty state as a teaching moment |
| `Contacts: 8f3a1b2…` (GUID fallback) | A resolved name, or **"Untitled …"** | GUIDs erode trust instantly |

### Permissions & sharing (the share *dialog* is already good; the Sharing *Center* leaks)

| Current | Target |
|---|---|
| "Access Control Rules" | **"Rules"** or fold into the resource it governs |
| "Resource Permissions" | **"Shared items"**; group by the real thing: *Dashboards, Files, Collections* |
| "Dashboard Permissions" / "Artifact Permissions" | **"Dashboards"** / **"Files"** — drop "Permissions"; the "Shared with me" tab already implies it |
| "Revoke access… cannot be undone" | **"Remove access"** with **Undo** (match the dialog's gentler model) |

### AI surface (keep "agent")

| Current | Target |
|---|---|
| "Agent" | **Keep** |
| "Auto (use default)" | **"Sage (default agent)"** — name it |
| "Loading agents…" | **"Getting your agents ready…"** |
| "Plan Mode" | **"Review before acting"** — describe the benefit, not the mechanism |
| `/skill` (undiscoverable) | Vocabulary is fine; the fix is *teaching* it exists, not renaming |

### Saved outputs (collapse the four-word tangle)

| Current | Target framing |
|---|---|
| View / Query / Report / Dashboard | Lead with two user-facing ideas: **"Views"** (a saved, filtered list of your data) and **"Dashboards"** (a page of charts). Treat Query/Report as plumbing that *produces* those, not user-facing choices. |
| "Shared view" (unexplained toggle) | **"Let teammates see this view"** |
| "Scope" | **"Which records"** / **"Where to look"** |

### Routines (the Advanced pane leaks hardest)

| Current | Target |
|---|---|
| "Monitoring vs Scheduled" | **"Watch for changes"** vs **"Run on a schedule"** |
| "Cron expression" | Hide behind the friendly frequency control; reveal only under a clearly-labeled Advanced |
| "IANA timezone" | **"Time zone"** with a friendly dropdown |
| "Starting payload (JSON)" | **"Extra instructions"** — plain text for the default case |
| "NotifyCondition: OnChange" | **"Tell me only when something changes"** |

### Cross-cutting

Strip the `MJ:` prefix and platform words (*metadata, schema, provider, CodeGen, GraphQL*) from anything a business user reads. Those belong to the Admin app and developer docs only.

---

## 4. The mechanism: a display-vocabulary layer, not scattered edits

The durable version of this is **not** find-and-replace across templates. It is a thin, one-place vocabulary layer with two tiers:

1. **Per-entity, admin-configurable (the primary path).** Every entity already carries a `DisplayName` (`EntityInfo.DisplayNameOrName`). The moment an admin renames an entity's DisplayName to the client's own language ("Members"), every surface that respects it updates for free. This turns vocabulary from a one-time cleanup into a **per-deployment configuration** — exactly what a multi-tenant data platform needs.
   - **Gap closed in Phase 1:** there was no *plural* form. A grid header, an empty state ("No **Members** yet"), a count ("142 **Members**") all want the plural. Phase 1 adds `EntityInfo.DisplayNamePlural`, deriving it from `DisplayNameOrName` via the existing `generatePluralName` helper in `@memberjunction/global` (which already handles irregulars, `-y → -ies`, `-s/ch/sh/x/z → -es`). Admin renames DisplayName → correct plural flows automatically.

2. **Generic fallback words (the last resort).** Where no single entity is in scope — "Search your data…", "142 types of data" — the generic noun ("data," "records") is UI copy. Short-term these are direct string edits on the handful of business-user surfaces. **Long-term the proper home is Angular's i18n (`$localize`)**, which also closes the localization gap the audit flagged (no multi-language support today). Vocabulary cleanup and localization are the *same effort* done properly — a strong reason to route generic UI copy through `$localize` as the effort matures.

**What must NOT change:** property bindings (`[entities]="entities"`), CSS class names (`.entity-icon`), TypeScript identifiers, and **agent-tool/context contracts** (`OpenEntityData`, `SelectedEntityName`, `VisibleEntityCount`). These are machine interfaces. Only human-visible display text is translated.

---

## 5. Roadmap

### Phase 1 — Foundation: vocabulary + safe defaults (weeks, high leverage) — IN PROGRESS

The multiplier. Everything else lands better once a user isn't tripping over "entities" and blank boxes on day one.

- **1a. `EntityInfo.DisplayNamePlural`** — the plural mechanism, unit-tested. *(this PR)*
- **1b. Data Explorer vocabulary** — translate the display strings on the default data-browsing app (Search placeholder, loading text, counts, empty states, "Recent Entities"). Bindings/classes/agent-tools untouched. *(this PR — the first, highest-visibility application)*
- **1c. Safe defaults** — flip email/in-app notifications on for Agent Completion + Routine types; enable the Appearance/theme tab; ship default "try asking…" starter prompts in the chat empty state.
- **1d. Sharing Center vocabulary** — humanize the permission-domain section labels.
- **1e. First-run experience** — a lightweight tour over the shell (app switcher → search → Home pins → chat) and consistent teaching empty states. There is *none* today.

### Phase 2 — Turn latent power into a product (the strategic bets)

- **2a. Lean into the agent as the no-code path.** Seed the planned NL→FieldRules authoring agent for Bulk Ops — erases the one friction point (raw formula/lookup/condition expressions) in the closest-to-ready no-code surface. Same pattern for "ask for a view in plain English → get a saved view."
- **2b. In-product app/template marketplace.** Expose Open Apps as a browse-and-click gallery of **role-specific starter workspaces** (Membership Director, Events Coordinator) with sample content — the shipped apps today skew admin/developer.
- **2c. Agent catalog in chat.** A browsable "here's what your agents can do" with plain-language descriptions and safe/consequential labeling — discovery is `@`-typeahead only today.
- **2d. Trust made human, by default.** Make tool-confirmation ("Allow the agent to send this email?") a framework default for consequential actions rather than dev-wired; render "here's what I'm about to do / did" as plain-language summaries.

### Phase 3 — Bigger directional bets

- **3a. No-code dashboard/report assembler.** Dashboards are developer-only authoring today (write an Angular component). A lightweight "pin these views and charts into a page" composer opens the biggest remaining self-service gap. Views + Filter Builder are already fully no-code — extend that energy upward.
- **3b. Role-based onboarding.** On first login, "What do you do?" → provision a role-appropriate workspace, sample data, and the relevant agents/routines already switched on.

---

## 6. What's explicitly in vs. out for Phase 1 (this PR)

**In:**
- `EntityInfo.DisplayNamePlural` getter + unit tests (the plural mechanism).
- Data Explorer display-string vocabulary cleanup (the first, most-visible application).

**Out (later phases, tracked above):** notification defaults, theme tab, chat starter prompts, first-run tour, Sharing Center labels, the marketplace, the NL-authoring agent, the dashboard assembler. These are real feature work and are sequenced deliberately — not crammed into the foundation.

---

## 7. Guardrails for anyone extending this effort

- **Never translate a binding, class, TS identifier, or agent-tool/context name.** Only human-visible copy.
- **Prefer `DisplayName`/`DisplayNamePlural` over a literal.** If a specific entity is in scope, use its configured name so per-deployment renaming works.
- **Route generic UI copy toward `$localize`** as the effort matures — it doubles as localization.
- **Default toward "on" for preferences a user would obviously want, and toward "safe" for gates a user would obviously expect** — but never toward surprising outbound side effects.
- **Check for the existing primitive first.** The audit's recurring finding is that it already exists.
