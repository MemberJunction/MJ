# UX Audit — Agent Admin Surfaces

Task 1H.2 · Inventory of where scope + `SearchScopeAccess` configuration needs to land in the AI Agent form.

## Current AI Agent form tabs

Existing tabs on `MJ: AI Agents` form (`core-entity-forms` generated + extended):

1. **Overview** — Name, Description, ParentID, Status, TypeID, etc.
2. **Prompts** — `MJ: AI Agent Prompts` rows.
3. **Actions** — `MJ: AI Agent Actions` rows.
4. **Notes &amp; Examples** — `InjectNotes`, `InjectExamples`, `NoteInjectionStrategy`, notes + examples grids.
5. **Data Sources** — `MJ: AI Agent Data Sources` rows (Phase 2 briefing preloader).
6. **Runs** — recent runs table.

## New tab: Search

Mockup 5 (+ dark variant mockup 9) shows the new tab layout:

- Section 1: **SearchScopeAccess** radio card group (All / Assigned / None).
- Section 2: **Assigned Scopes** grid (`MJ: AI Agent Search Scopes` rows) — Phase, Priority, Status, Start/End At, MaxResults, MinScore, QueryTemplate, FusionWeightsOverride, IsDefault.
- Section 3: info callout explaining the Phase semantics.

## Where each field lives today vs. after

| Field | Today | After |
|---|---|---|
| `AIAgent.SearchScopeAccess` | n/a (new in v5.28.x) | radio cards at the top of the Search tab |
| `AIAgentSearchScope.*` | n/a | inline grid in the Search tab, with add-row/edit/delete |
| `SearchScope.*` metadata | Admin / Search Scopes section (mockups 3 + 4) | unchanged |

## Gaps / follow-up items

- **Preview**: add a "preview RAG" affordance on the Search tab that lets an admin send a sample query and see exactly what the agent would be injected. Defer to Phase 1H+ polish (not required for demo).
- **Scope templates**: the `QueryTemplateID` dropdown should filter to Templates whose content-block mentions RAG variables (`lastUserMessage`, `recentMessages`, etc.). Follow-up via smart filter on the dropdown.
- **Copy-from-agent**: quality-of-life action to copy an agent's scope assignments from another agent. Follow-up.

## Components we touch

| Component | Change |
|---|---|
| `core-entity-forms` — `MJAIAgentFormComponentExtended` | Add "Search" tab template + bindings. |
| Generated form re-register | Ensure custom form registers AFTER generated (the project's standard extended-form pattern). |
| `SearchScopeSelectorComponent` | Reuse for the scope dropdown inside the grid's "Add Scope" action. |
