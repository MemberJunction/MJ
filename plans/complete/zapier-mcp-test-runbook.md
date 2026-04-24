# Zapier ↔ MJ MCP — End-to-End Test Runbook (PR #2209)

Walks through every step we validated in the session. Follow top to bottom; each section's output is the next section's input.

## Prerequisites

- **Local servers running:**
  - **MJAPI** on port `4000` — from `packages/MJAPI`: `npm run start`
  - **MJExplorer** on port `4201` — from `packages/MJExplorer`: `npm run start`
  - **MJ MCP Server** on port `3100` — from `packages/AI/MCPServer`: `npm run start` (separate process, not auto-started with MJAPI)
- **Database:** Test56 (per `.env` `DB_DATABASE='Test56'`)
- **Tools on your machine:** `ngrok` (`brew install ngrok` if missing), `sqlcmd`
- **Zapier account:** free trial is fine; Professional trial gives you 13 days of paid features
- **Google account with Calendar, Gmail, and a Google Sheet** for testing

Keep a terminal tab open running `tail -f /tmp/mjapi.log` while testing — any auth or connect errors surface there.

---

# PART 1 — Outbound: MJ → Zapier

## 1.1 Zapier account + MCP Server setup

1. Go to **mcp.zapier.com** and sign in.
2. In the top-right, create/copy your **API key** (format: starts with `sk-ak-...` or similar long token). Paste it somewhere safe — you'll need it in step 1.3.
3. On the Actions page, **enable 4 or 5 actions** — minimum for the demo:
   - Google Calendar → **Create Detailed Event**
   - Gmail → **Send Email**
   - Google Sheets → **Lookup Spreadsheet Row** (or any row tool)
   - Optional: Slack → **Channel Message**, Webhooks → **POST**
4. Click through the OAuth prompts for each to connect your Google/Slack/etc. account.

**Verify**: mcp.zapier.com dashboard should now show "4 apps, 1 action each" (or however many you enabled).

## 1.2 Create the MJ Credential that holds the Zapier key

1. In MJExplorer, open the **Admin** application (top-left app switcher → robot icon ▼ → Admin).
2. Top nav → **API Keys**? Wait, wrong — for *credentials* (not *API Keys*), open the **Credentials** entity (Ctrl+K → "Credentials").
3. Click **+ New Credential**:
   - **Name**: `Zapier Connection Token`
   - **Credential Type**: pick the API Key type (usually named "API Key" or "Generic Bearer")
   - **Value**: the **raw Zapier key** from step 1.1 (will be stored as `{"apiKey":"<your key>"}` when you save)
4. Save. The `Values` column is now encrypted on disk. Only decrypts via BaseEntity.

**Gotcha we hit**: the credential is loaded into `CredentialEngine`'s in-memory cache at MJAPI startup. New credentials created after startup are picked up on-demand (we added a cache-refresh fallback in `MCPClientManager.getCredentials()`). So you don't have to restart MJAPI.

## 1.3 Register Zapier as an MCP Server in MJ

1. In MJExplorer, switch to your **AI app** (or any app where the MCP Dashboard nav item appears).
2. Top nav → **MCP** (plug icon).
3. **Servers** tab → **+ Add Server**:
   - **Name**: `Zapier MCP`
   - **Description**: `Zapier's MCP server — routes tool calls to your enabled Zapier actions`
   - **Transport Type**: `StreamableHTTP`
   - **Server URL**: `https://mcp.zapier.com/api/v1/connect`
   - **Default Auth Type**: `Bearer`  ⚠️ **not** `APIKey` — Zapier requires `Authorization: Bearer <token>`, not a custom header
   - **Status**: `Active`
4. Save. A card appears in the Servers tab showing TRANSPORT=StreamableHTTP, AUTH=Bearer.

## 1.4 Create the Connection between the server + credential

1. **Connections** tab → **+ Add Connection**:
   - **Name**: `Zapier Connection 1`
   - **Server**: pick `Zapier MCP` from the dropdown
   - **Credential**: pick `Zapier Connection Token` from the dropdown ⚠️ **must select this — if blank, execute fails with "API key not found"**
   - **Company**: pick your company (required)
   - **Auto-sync Tools**: checked
   - **Log Tool Calls**: checked
   - **Status**: `Active`
2. Save.

**Gotcha we fixed this session**: the connection dialog's edit mode used to silently wipe `CredentialID` back to empty. If you ever edit the connection and it loses the credential, you'd get the same "API key not found" error. The fix pre-populates `CredentialID` on edit.

## 1.5 Sync tools

1. On the Zapier connection card, click **Sync Tools** (icon that looks like a rotating arrow).
2. Wait 10-30 seconds. Result banner reads `Synced: 0 added, 14 updated, 0 deprecated` (counts depend on what you've enabled in Zapier).
3. **Tools** tab now shows 14 tools. They're Zapier's *generic* actions:
   - `list_zapier_skills`, `get_configuration_url`, `list_enabled_zapier_actions`, `discover_zapier_actions`
   - `enable_zapier_action`, `disable_zapier_action`
   - `execute_zapier_read_action`, `execute_zapier_write_action`
   - `create_zapier_skill`, `get_zapier_skill`, `update_zapier_skill`, `delete_zapier_skill`, `list_zapier_skills`
   - `auto_provision_mcp`, `send_feedback`
4. **These are not per-app tools**. Zapier's MCP exposes 14 generic actions that route through your enabled integrations via an `app` + `action_key` parameter pattern.

**Verify corresponding MJ Actions auto-generated**:
```sql
SELECT Name FROM __mj.Action WHERE Name LIKE '%zapier%' OR Name LIKE '%mcp%';
-- Should return 16 rows (14 Zapier + Execute MCP Tool + List MCP Tools + Sync MCP Tools + Test MCP Connection)
```

## 1.6 Test Tool dialog — end-to-end call (the 3-step flow)

### Zero-param test (proves the pipeline)
1. Tools tab → click **Test** on `list_zapier_skills` (0 params).
2. **Step 1 (Select)**: server and connection pre-populate; tool dropdown shows `list_zapier_skills`. Click **Next**.
3. **Step 2 (Configure)**: empty — no params needed. Click **Execute**.
4. **Step 3 (Results)**: green banner "Execution Successful" + duration. Response text contains the Zapier onboarding skill JSON. This proves: MJ → MJAPI → MCPClient → Zapier MCP works, auth is correct, JSON-RPC handshake valid.

### List enabled actions — find an action_key
1. Test `list_enabled_zapier_actions`. First call without params gives you: `{"apps":[{"app":"Google Calendar","action_count":1}, ...]}`
2. Run again with `app: Google Calendar` → returns `[{"key":"detailed_event","name":"Create Detailed Event","tool":"execute_zapier_write_action"}]`.
3. Note the `detailed_event` key — you'll use it next.

### Execute a write action — create a calendar event
1. Test `execute_zapier_write_action`. Required params:
   - `app`: `google_calendar`
   - `action`: `detailed_event` *(the exact key from above)*
   - `instructions`: `Create event titled "MJ MCP Test" tomorrow 3pm Eastern, 30 min duration`
   - `output`: `the event ID, title, and calendar link`
   - `params`: leave blank (Zapier's AI resolves from `instructions`)
2. Click **Execute**. Expect ~3-10s response.
3. Response contains `"status":"SUCCESS"` + `event_id` + a `calendar_link` URL.
4. **Open your Google Calendar** — the event is there.
5. **Click the `feedbackUrl`** from the response (`https://mcp.zapier.com/mcp/servers/.../history/executions/...`) to view the execution in Zapier's MCP History (note: **NOT** Zap history — MCP actions are tracked separately).

## 1.7 Logs verification

1. **Logs** tab — count badge shows how many executions ran. Should match the number of tests you did.
2. Each row: tool name, server, connection, duration, status.
3. Click a row → slide-in panel shows:
   - Connection + server
   - Input Arguments (pretty-printed JSON)
   - Result (pretty-printed JSON)
   - Error Message (if failed)
   - **Run Again** button (re-opens Test dialog pre-filled)
4. **Close** button closes panel; backdrop click also closes.

**Gotcha we fixed**: both the Test Tool dialog and the Log Detail Panel used to silently fail because `MCPDashboardComponent` is dynamically instantiated without `environmentInjector` — sub-components declared in `MCPModule` can't resolve. Both dialogs are now inlined in the dashboard's HTML. If you ever see a button do nothing, check the browser console for `NG0302` or "component not found" errors.

## 1.8 AI Agent end-to-end

1. **Agents** tab (top nav) → **+ New Agent**:
   - **Name**: `Zapier Demo Agent`
   - **Type**: `Loop` (required for tool-calling pattern)
   - **Status**: `Active`
   - **System Prompt**: *optional — leave blank*
2. Save.

3. On the saved agent → **Prompts** sub-tab → **Add Prompt** → pick `Demo Loop Agent - Main Prompt` (an existing shared prompt). Save.
   - **Gotcha**: without a prompt, running the agent fails with `No prompts configured for agent`.

4. On the agent → **Actions** sub-tab → **Add Action** 3 times, picking:
   - `list_enabled_zapier_actions`
   - `execute_zapier_write_action`
   - `execute_zapier_read_action`
   - **Gotcha**: if you add `enable_zapier_action` instead of `execute_zapier_write_action`, the agent will loop 10 times trying to enable actions that are already enabled and fail with *"Maximum validation retries of 10 exceeded"*. The agent can't execute without the execute tool.

5. **Run** the agent with prompt: `Create a Google Calendar event tomorrow at 5pm titled "Agent End-to-End Test"`

6. Expected trace (visible in Agent Run view):
   - LLM calls `list_enabled_zapier_actions({app: "Google Calendar"})`
   - Gets back `detailed_event` key
   - Calls `execute_zapier_write_action({app, action, instructions, output})`
   - Returns success; `taskComplete: true`

7. Open Google Calendar — the event is there.

---

# PART 2 — Inbound: Zapier → MJ

## 2.1 Start the MJ MCP Server

⚠️ This is a **separate process** from MJAPI. It doesn't start automatically with `npm run start` in MJAPI.

```bash
cd packages/AI/MCPServer
npm run start
```

Expected startup log lines:
```
MCP Server: Auth mode: both
MemberJunction MCP Server running on port 3100
Streamable HTTP endpoint: http://localhost:3100/mcp
```

Verify:
```bash
curl -s http://localhost:3100/.well-known/oauth-protected-resource | head -20
# HTTP 200 + JSON metadata
```

## 2.2 Expose via ngrok

```bash
ngrok http 3100
# In the UI output, copy the https URL:
# Forwarding  https://<your-tunnel-id>.ngrok-free.dev -> http://localhost:3100
```

Verify the tunnel + MCP handshake:
```bash
curl -s -X POST \
  -H "Authorization: Bearer YOUR_KEY_HERE" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  https://YOUR-NGROK.ngrok-free.dev/mcp
```
Without a valid token you get `{"error":"unauthorized","message":"Invalid token format"}`. With a valid token (step 2.3) you get `event: message\ndata: {...serverInfo...}`.

## 2.3 Create a proper DB-backed MJ API Key

**Why we need this and not the config key:** MJ MCP Server validates Bearer tokens through two layers:
1. **Identity** — is this a known API key? ✅ Config-file `systemApiKey` passes this.
2. **Scopes** — is this key allowed to do `entity:read`? ❌ Config key has no DB row, so scope lookup fails with *"API key not found"*.

DB-backed keys pass both layers.

1. In MJExplorer, switch to the **Admin** application (top-left app switcher ▼ → Admin).
2. Top nav → **API Keys**.
3. Click **+ Generate New** / **+ Create Key**.

4. **Step 1 (Configure)**:
   - **Name**: `Zapier MCP Client`
   - **Application**: `MCPServer` ⚠️ **exact spelling — the auth layer matches against this**
   - **Description**: `API key for Zapier's MCP Client to call MJ tools`
   - **Expires**: set a reasonable date or leave blank for no expiry

5. **Step 2 (Permissions)**: tick these scopes (or pick **full_access** for a demo):
   - **Entities** → All (grants `entity:read` + `entity:write`)
   - **Actions** → All (grants `action:execute`)
   - **Agents** → All (if you want Zapier to trigger MJ agents)

6. Click **Generate Key**.

7. **CRITICAL**: the next screen shows the raw key `mj_sk_...` + 64-char hash **exactly once**. Copy it to your clipboard immediately. If you miss it, you have to regenerate.

## 2.4 Configure Zapier MCP Client

1. In Zapier → **App Connections** (or the hamburger menu → Apps).
2. Search **"MCP Client by Zapier"** → click **+ Add connection**.
3. Fill in:
   - **Server URL**: `https://YOUR-NGROK.ngrok-free.dev/mcp` (the endpoint, include the `/mcp` path)
   - **Transport**: `Streamable HTTP`
   - **isOAuth**: **false** (Bearer token, not OAuth)
   - **Bearer token**: `mj_sk_...` (the DB-backed key from step 2.3)
4. Save / Connect.

Zapier validates the connection by calling `initialize` + `tools/list` — you should see **"Connected"** within a few seconds. If it fails:
- `Authorization denied ... scope: entity:read` → your key is DB-backed but doesn't have the `entity:read` scope. Fix: edit the key, grant Entities → All.
- `Invalid token format` → you're using a key that doesn't start with `mj_pk_` or match the MJ key format. Regenerate via Admin → API Keys.
- `Connection refused` → ngrok tunnel is down. Re-check `ngrok http 3100`.

## 2.5 Build a test Zap using an MJ tool

1. Click **Create** (orange button top-left) → new Zap.
2. **Trigger**: pick **Schedule by Zapier** → "Every day" (for testing, we'll trigger manually).
3. **Action step** → search **MCP Client by Zapier** → pick your MemberJunction connection.
4. The **Action** dropdown should list all MJ's exposed MCP tools — entity readers, view runners, etc. Pick a simple one like `runView` or `GetEntity`.
5. Fill in params:
   - **Entity Name**: `Users`
   - **Max Rows**: `5`
6. Click **Test step**.
7. Zapier returns 5 user records from MJ. This validates Zapier → MJ.

**Gotcha we documented**: Zapier's MCP Client is a beta. The UI location shifts; if you don't see it, search "MCP" in Zapier's top search bar or go to `zapier.com/app/connections`.

---

# PART 3 — Dashboard scale features

These should be tested AFTER Parts 1 + 2 are working.

## 3.1 + 3.2 — Paginated Tools + Virtual Scroll

1. In MCP Dashboard → **Tools** tab.
2. Upper-right has a **"Scale mode (virtual scroll, paginated)"** checkbox. Tick it.
3. View flips from grouped card layout to a flat virtual-scrolled list.
4. Above the list: `Showing N of Total tools` banner.
5. Scroll to the bottom → once within 20 rows of the end, the next page (50 rows) auto-loads.

## 3.3 — Filters (server, category, favorites-only)

Note: these dropdowns appear in the filter panel (left side) **only when the Tools tab is active**.

1. Open the filter panel if hidden (button near the search/filters area).
2. **Server** dropdown — pick `Zapier MCP`. List reloads showing only Zapier's tools.
3. **Category** dropdown — pick `google_calendar`. Now showing only 1 row (`detailed_event`). The dropdown options are derived from `GetMCPToolCounts.countByCategory` — the prefix before the first `_` in each tool name, with counts per category.
4. **Favorites only** checkbox (requires first favoriting a tool — see 3.6) — filters to starred tools only.
5. **MCP Filters badge**: header shows `MCP Filters (3)` when 3 filters are active. Reset via the existing Reset Filters button.

## 3.4 — Count badges + auto-collapse

- Group header for each server shows `NNN tools` using the live count from the resolver (not just what's currently rendered client-side).
- In scale mode, above the list: `Showing N of Total` counter.
- **Auto-collapse test**: seed 200+ tools for one server (see 3.7), reload → that server's group starts **collapsed** because it exceeds `AUTO_COLLAPSE_THRESHOLD = 100`. Click header to expand.

## 3.5 — Searchable Test-Tool picker

1. Tools tab → click **Test** on any tool.
2. **Step 1 — Select Tool**:
   - An input above the list searches across `ToolName`, `ToolTitle`, `ToolDescription`.
   - **Recently used** tools from your execution logs appear at the top with a blue `Recent` badge.
   - Clicking a row selects it (checkmark appears on right); the old plain `<select>` is gone.
   - Type partial text (e.g. `execute`) → list narrows instantly.

## 3.6 — Favorites

1. Switch Tools tab to **Scale mode** (checkbox at top).
2. Each tool row has a **star icon** on the right.
3. Click → fills yellow, row is now favorited.
4. Reload the dashboard → star is still filled (persisted in `MCPToolFavorite` table).
5. Filter panel → check **Favorites only** → list restricts to starred tools.

Under the hood:
```sql
-- See your favorites
SELECT UserID, MCPServerToolID FROM __mj.MCPToolFavorite;
```
The unique constraint `UQ_MCPToolFavorite_User_Tool` prevents double-favoriting.

## 3.7 — Performance validation (optional, but proves the scale claim)

Seed synthetic tools:
```sql
USE Test56;
DECLARE @serverID UNIQUEIDENTIFIER = (SELECT TOP 1 ID FROM __mj.MCPServer);
DECLARE @i INT = 1;
WHILE @i <= 5000
BEGIN
    INSERT INTO __mj.MCPServerTool (MCPServerID, ToolName, ToolTitle, ToolDescription, InputSchema, Status)
    VALUES (@serverID,
        CONCAT('perf_seed_cat', (@i % 20), '_act', @i),
        CONCAT('Perf Tool ', @i),
        CONCAT('Synthetic row ', @i),
        '{"type":"object","properties":{}}',
        'Active');
    SET @i = @i + 1;
END;
```

Measure:
- Refresh dashboard → Scale mode toggle → initial page **<2s**
- Type in filter panel search → keystroke latency **<200ms**
- Scroll the virtual viewport → **60fps**
- Category dropdown populates from `GetMCPToolCounts`

Clean up:
```sql
DELETE FROM __mj.MCPServerTool WHERE ToolName LIKE 'perf_seed%';
```

Our measured numbers: paginated query (50 rows of 5,014) = **10ms**, global count = **5ms**, search = **5ms**. Well under all targets.

---

# PART 4 — Final checks

## 4.1 Unit tests
```bash
cd packages/MJServer && npm test          # Expect: 177 passed, 0 failed
cd packages/Angular/Explorer/dashboards && npm test   # Expect: 158 passed, 0 failed
```

## 4.2 Build everything
```bash
cd /Users/madhavsubramaniyam/Projects/MJ/mj-pr-2209-zapier-mcp
npm run build
```
Expect all packages green.

## 4.3 Git status
- Branch: `feature/pr1-hubspot-ym-bidirectional`
- Commits from this session should include:
  - Credential cache refresh in MCPClientManager
  - CredentialID in MCPConnectionData + dialog pre-population
  - Inlined Test Tool dialog + Log Detail Panel
  - `| date` pipe → `formatDate()` method
  - Paginated GraphQL queries (`GetMCPToolsPage`, `GetMCPToolCounts`) in MCPResolver
  - `MCPToolFavorite` migration + auto-generated entity
  - Dashboard: virtual scroll, filter dropdowns, searchable test picker, count badges, auto-collapse
  - Docs at `plans/complete/zapier-mcp-integration-findings.md` and this runbook

## 4.4 Known limitations to call out in the PR body
1. **Zapier MCP Client is a beta**; UI location may move; Bearer-only auth (no custom header support).
2. **System API key** can authenticate but can't perform scoped operations. Use DB-backed keys for all external integrations.
3. **ngrok free tier** gives a new URL on every restart; for persistent testing use ngrok paid or a proper staging deploy.
4. **`ScrollingModule` virtual scroll** works best with fixed `itemSize` rows; if we add variable heights later we'd need `autosize` strategy.
5. **Scale-mode toggle** is currently manual (checkbox). Could auto-enable when `totalCount > 200` as a future polish.

---

# Troubleshooting cheat sheet

| Symptom | Check | Fix |
|---|---|---|
| Test Tool dialog opens blank | Browser console → look for NG0302 (pipe not found) | Hard-refresh; verify dashboards lib rebuilt |
| "Clicking Test does nothing" | Console NG0919 circular dep? | Ensure MCPResourceComponent is `standalone: false` and in MCPModule.declarations (not imports) |
| Zapier→MJ call: "API key not found" | Your Bearer token | Must be `mj_sk_...` DB-backed key, application=`MCPServer`, with proper scopes |
| Zapier→MJ: "Invalid token format" | Your Bearer token | Config `systemApiKey` is not accepted; generate DB key |
| MJ→Zapier: "Missing authorization header" | MJ connection has a credential, credential exists in cache | Check MCPConnection.CredentialID is set, restart MJAPI to refresh CredentialEngine cache |
| Dashboard "Server unavailable — viewing cached data" | WebSocket port 4002 conflict | Kill stale processes on 4002, or ignore (REST/GraphQL still works via 4000) |
| Agent fails "Maximum validation retries" | Agent has wrong actions attached | Must attach `execute_zapier_write_action`, not `enable_zapier_action` |
| Favorite click does nothing | Browser console | Check `Save()` returns false → check `entity.LatestResult.CompleteMessage` for the actual error |
