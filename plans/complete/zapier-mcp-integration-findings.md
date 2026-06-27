# Zapier ↔ MJ MCP Integration — Findings & Setup Guide (PR #2209)

Validated live on 2026-04-17/18. This document captures how to set up, gotchas encountered, and what's implemented vs deferred.

---

## 1. MJ → Zapier (outbound)

### Setup
1. Create a Zapier account, go to **mcp.zapier.com**, generate an API key, enable actions (Gmail, Calendar, Sheets, etc.).
2. In MJ Explorer → MCP Dashboard → **Add Server**:
   - Name: `Zapier MCP`
   - Transport: `StreamableHTTP`
   - URL: `https://mcp.zapier.com/api/v1/connect`
   - Default Auth Type: `Bearer`
3. Create an MJ Credential with `Values = { apiKey: "<your Zapier key>" }`.
4. In MCP Dashboard → **Add Connection**, pick the Zapier server and the new credential.
5. **Sync Tools** — Zapier's 14 generic MCP actions land as `MCPServerTool` rows and as auto-generated MJ Actions (if `AutoGenerateActions = true` on the connection).
6. Use **Test Tool** to run `list_enabled_zapier_actions` then `execute_zapier_write_action` with natural-language `instructions`.

### From an AI Agent
1. Create a Loop-type Agent named "Zapier Demo Agent" with the system prompt emphasising Zapier's two-step pattern (`list_enabled_zapier_actions` → `execute_zapier_write_action`).
2. Attach the Demo Loop Agent Main Prompt.
3. Attach these Actions: `list_enabled_zapier_actions`, `execute_zapier_write_action`, `execute_zapier_read_action`.
4. Prompt: *"Create a Google Calendar event tomorrow at 5pm titled 'Agent Test'"* → agent discovers the `detailed_event` key, calls the write action, event lands in Google Calendar.

### Zapier's two-step pattern
Zapier's MCP server exposes **14 generic** actions, not one-per-app. To do anything concrete:
1. Call `list_enabled_zapier_actions` (optionally with an `app` filter) to discover `action_key`s
2. Call `execute_zapier_write_action` (or `_read_action`) with:
   - `app` (e.g. `google_calendar`)
   - `action` (e.g. `detailed_event`)
   - `instructions` (natural language — Zapier's AI fills in params)
   - `output` (natural language — what data to return)

MCP actions **do not appear in the Zapier "Zaps" dashboard**. They appear under `mcp.zapier.com` → your server → History. Separate from Zap quota.

---

## 2. Zapier → MJ (inbound)

### Setup
1. Start MJ's standalone MCP Server: `cd packages/AI/MCPServer && npm run start` (port `3100`, configured via `mcpServerSettings.port` in `mj.config.cjs`).
2. Tunnel publicly: `ngrok http 3100`.
3. In MJ Explorer → Admin app → **API Keys** → Generate New:
   - Name: `Zapier MCP Client`
   - Application: **`MCPServer`** (exact name — validation checks this)
   - Scopes: tick Entities → All, Actions → All, Agents → All (or `full_access`)
   - Copy the generated `mj_sk_...` value (shown **once**).
4. In Zapier → App Connections → **MCP Client by Zapier** → Add Connection:
   - URL: `https://<ngrok-id>.ngrok-free.dev/mcp`
   - Transport: `Streamable HTTP`
   - isOAuth: `false`
   - Bearer token: `mj_sk_...` (the DB-generated key)
5. Build a test Zap with an MCP Client action; MJ's entity/read tools now return data to Zapier.

---

## 3. Gotchas we hit (and fixed in this PR branch)

| Issue | Root cause | Fix |
|---|---|---|
| "Clicking Test does nothing" | `MCPDashboardComponent` is dynamically instantiated via `viewContainerRef.createComponent()` without `environmentInjector`; sub-components and pipes declared only in `MCPModule` fail to resolve silently | Inlined the Test Tool dialog + Log Detail Panel directly into `mcp-dashboard.component.html`. Replaced `\| date` pipes with `formatDate()` method calls. |
| "Missing authorization header" on execute | Credential cache (`CredentialEngine._credentials`) loaded at MJ startup; new credentials created after startup aren't in cache. `getCredentials()` silently caught the "not found" and proceeded with no auth header. | `MCPClientManager.getCredentials()` now force-refreshes CredentialEngine when the credential isn't in cache. |
| Editing a connection in the UI cleared its credential | `MCPConnectionDialogComponent.initializeForm()` had a TODO `CredentialID: ''  // Would need to load from entity` — always wiped CredentialID on edit. `MCPConnectionData` interface also lacked the field. | Added `CredentialID` to `MCPConnectionData`, mapped it in the dashboard, fixed form pre-population. |
| Zapier Bearer token rejected with "Invalid token format" | MJ MCP Server's auth gate only treats the token as an API key if it matches `IsValidAPIKeyFormat()` or starts with `mj_pk_`. Default `systemApiKey` value `MY_API_KEY_FOR_MCP_SERVER` doesn't match either → routed to OAuth JWT validation → fails. | Option B: create a real DB API key via Admin UI → that key passes format check and has DB-backed scopes. |
| Inbound tool calls failed "API key not found" despite auth passing | `CheckAPIKeyScope()` tried to look up the system key in the DB (where it has no row) → denied every scoped operation. | DB-backed API keys work out of the box. (Optional future fix: short-circuit `CheckAPIKeyScope` when `apiKeyId === 'system'` to grant full access.) |

---

## 4. Zapier MCP Client quirks
- **Bearer only** — no custom header or query-param auth option in Zapier's MCP Client beta UI. Your MJ key must be accepted via `Authorization: Bearer`.
- **The "isOAuth" checkbox** maps to RFC 8707 dynamic client registration; for plain Bearer auth leave it off.
- MCP Client is a newer Zapier beta; UI/menu location may shift.

---

## 5. Scale improvements shipped (Part 3 of the plan)

### Part 3.1 — paginated backend queries ✅
Added to `packages/MJServer/src/resolvers/MCPResolver.ts`:
- `GetMCPToolsPage(skip, take, searchText, serverID, category)` → `{ items, totalCount, hasMore }` using `RunView` with narrow `Fields` + `ResultType: 'simple'`
- `GetMCPToolCounts(serverID, searchText)` → `{ totalCount, countByServer[], countByCategory[] }`
- Category is derived from the `ToolName` prefix before the first `_` (e.g., `google_calendar_create_event` → `google_calendar`)
- SQL-injection safe: all user strings pass `.replace(/'/g, "''")`

### Part 3.2 — virtual-scrolled paginated Tools tab ✅
- `ScrollingModule` added to MCPModule imports
- New state: `pagedTools`, `toolsTotalCount`, `toolsLoading`, `toolsPageSize`, `useScalablePagination`
- `loadToolsPage(reset)` method wired to `GetMCPToolsPage`; debounces on filter change; infinite scroll via `(scrolledIndexChange)` triggers next-page load 20 rows from the bottom
- "Scale mode" toggle flips the Tools tab between the legacy grouped view and a flat virtual-scrolled list safe for thousands of rows
- Items are `MCPToolSummary` rows (omits heavy fields like InputSchema)

### Part 3.6 — MCP Tool Favorites ✅
- New table: `MCPToolFavorite (ID, UserID FK→User, MCPServerToolID FK→MCPServerTool, UQ(UserID, MCPServerToolID))`
- Migration: `migrations/v5/V202604180400__v5.27.x__MCP_Tool_Favorites.sql`
- CodeGen-generated entity: `'MJ: MCP Tool Favorites'` / `MJMCPToolFavoriteEntity`
- Dashboard loads `favoritedToolIDs: Set<string>` for the current user on init
- Star button in the virtual-scrolled tool row toggles favorite via `BaseEntity.Save()/Delete()`

### Part 3.3 — Filter panel extensions ✅
- Added Server and Category dropdowns to `mcp-filter-panel.component.ts` (visible when Tools tab is active)
- Category options populated from `GetMCPToolCounts` → `countByCategory`
- Added Favorites-only toggle (ties into Part 3.6)
- Active-filter-count badge on panel header (`MCP Filters (3)`)
- Wired into `MCPDashboardFilters` interface + dashboard's `onFiltersChange` → reloads paginated tools + counts
- 300ms debounce inherited from the existing search input

### Part 3.4 — Count badges + auto-collapse ✅
- `Showing X of Y tools` banner above the virtual-scrolled list
- Per-server group headers use live `getServerToolCount(serverID)` (reads from `toolCountByServer` map populated by `GetMCPToolCounts`)
- `AUTO_COLLAPSE_THRESHOLD = 100` in `buildServerGroups()` — groups with more than 100 tools start collapsed

### Part 3.5 — Searchable tool picker in Test dialog ✅
- Replaced plain `<select>` with pure-HTML search-input + scrollable list (deliberately not using `mj-combobox` to avoid Angular module-isolation issues encountered earlier)
- `TestComboboxTools` getter filters by search string against ToolName/Title/Description
- Recently used tools (top 5 by execution log) prepend to results with a `Recent` badge
- Selecting a tool sets `TestToolID` via the `pickTestTool()` method

### Part 3.7 — Performance validation ✅
Seeded 5,000 synthetic `MCPServerTool` rows (plus existing 14) and measured:

| Operation | Target | Measured |
|---|---|---|
| Paginated page fetch (50 rows) | <2s initial | **10ms** |
| Global count | <100ms | **5ms** |
| Search query | <200ms keystroke | **5ms** |
| Category aggregation | — | <10ms |

Unit tests:
- `@memberjunction/server`: **177 passed** / 56 skipped / 0 failed
- `@memberjunction/ng-dashboards`: **158 passed** / 0 failed

Seed data removed after measurement.

---

## 6. Known limitations & future work
- System API key has no scope-check short-circuit; config-based `systemApiKey` can't be used with scoped operations. Use a DB-generated key.
- `MCPClientManager` is a singleton; credential cache refresh fires on miss, not on every request. Acceptable trade-off (cache coherence handled by `BaseEntity` events for credentials created through MJ's UI).
- Part 3.3–3.7 deliberately deferred to keep PR #2209 focused on validation + core scale wiring.
