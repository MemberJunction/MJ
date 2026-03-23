# Zapier + MemberJunction MCP Integration — Validation & Demo Plan

**Issue**: [#529 - Zapier Integration for MemberJunction](https://github.com/MemberJunction/MJ/issues/529)
**Status**: No new software needed — MJ's existing MCP Client and MCP Server infrastructure supports both directions of Zapier integration out of the box.
**Goal**: Validate, demo, and document the integration. Fix MCP Dashboard UX to handle Zapier's scale (thousands of tools).

---

## Reference Links

### Zapier MCP Documentation
- [Zapier MCP Landing Page](https://zapier.com/mcp) — Overview, pricing, supported clients
- [Zapier MCP GitHub Repository](https://github.com/zapier/zapier-mcp) — Technical details, configuration examples
- [Zapier MCP Quickstart](https://docs.zapier.com/mcp/quickstart) — Getting started guide
- [Zapier MCP Blog Guide](https://zapier.com/blog/zapier-mcp-guide/) — Detailed walkthrough of 30,000+ actions
- [Connect Remote MCP Servers to Zapier (MCP Client)](https://help.zapier.com/hc/en-us/articles/38777069364109-Connect-remote-MCP-servers-to-Zapier-using-MCP-Client) — How Zapier consumes external MCP servers (beta)
- [Zapier MCP Client Integrations](https://zapier.com/apps/mcp-client-by-zapier/integrations) — Zapier's MCP Client app page
- [Use Zapier MCP with Your Client](https://help.zapier.com/hc/en-us/articles/36265392843917-Use-Zapier-MCP-with-your-client) — Client configuration guide

### MCP Protocol References
- [MCP Specification - Transports](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports) — SSE and Streamable HTTP transport specs
- [MCP Framework - HTTP Stream Transport](https://mcp-framework.com/docs/Transports/http-stream-transport/) — Streamable HTTP details
- [MCP 2026 Roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) — Upcoming MCP features (enterprise readiness, auth improvements)

### Community / Reviews
- [I Tested Zapier MCP Server - DEV Community](https://dev.to/therealmrmumba/i-tested-zapier-mcp-server-and-here-are-my-thoughts-2dk2)
- [Top 10 MCP Servers in 2026](https://cybersecuritynews.com/best-model-context-protocol-mcp-servers/)
- [Official Zapier MCP Server on PulseMCP](https://www.pulsemcp.com/servers/zapier)

### MJ Codebase References
- MCP Client: `packages/AI/MCPClient/`
- MCP Server: `packages/AI/MCPServer/`
- MCP Dashboard UI: `packages/Angular/Explorer/dashboards/src/MCP/`
- MCP Actions: `packages/Actions/CoreActions/src/custom/mcp/`
- MCP Entities/Engine: `packages/MJCoreEntities/src/engines/MCPEngine.ts`
- MCP GraphQL Resolver: `packages/MJServer/src/resolvers/MCPResolver.ts`

---

## Part 1: Outbound Validation — MJ Consumes Zapier's MCP Server

**What**: Connect MJ's `MCPClientManager` to Zapier's MCP Server, sync tools, and execute actions.

### 1.1 Zapier Account Setup
- [ ] Create a Zapier account (Free tier is fine for testing — 40 tool calls/hour, 80/day)
- [ ] Go to [mcp.zapier.com](https://mcp.zapier.com) and generate an API key (format: `sk-ak...`)
- [ ] Enable a handful of test actions in Zapier's MCP dashboard — suggested starters:
  - Gmail: Send Email
  - Google Sheets: Create Spreadsheet Row
  - Slack: Send Channel Message
  - Google Calendar: Create Event
- [ ] Note your server URL: `https://actions.zapier.com/mcp/sk-<your-key>/sse`

### 1.2 Register Zapier as an MCP Server in MJ
- [ ] Open MJ Explorer → MCP Dashboard → Servers tab
- [ ] Add a new server:
  - **Name**: `Zapier`
  - **Transport Type**: `SSE` (or `StreamableHTTP` — Zapier supports both)
  - **URL**: `https://actions.zapier.com/mcp/sk-<your-key>/sse`
  - **Auth Type**: `APIKey`
  - **API Key Header**: `x-mcp-zapier-x-api-key`
  - **API Key Value**: `sk-<your-key>`
- [ ] Create a connection from this server

### 1.3 Test Connectivity
- [ ] Use the MCP Dashboard "Test Connection" button
- [ ] Verify: server name, version, latency, capabilities are returned
- [ ] Check MCP execution log for the test call

### 1.4 Sync Tools
- [ ] Click "Sync Tools" on the Zapier connection
- [ ] Verify: tools are discovered and stored in `MCPServerTool` records
- [ ] Verify: MJ Actions are auto-generated for each Zapier tool (via `syncTools()`)
- [ ] Note the tool naming convention (e.g., `gmail_send_email`) and how many tools appear
- [ ] **Key question**: Does Zapier return ALL enabled actions, or does it paginate? Test with 5, 20, 50+ enabled actions.

### 1.5 Execute a Zapier Tool from MJ
- [ ] Use the "Test Tool" dialog on one of the synced tools (e.g., `gmail_send_email`)
- [ ] Provide test parameters and execute
- [ ] Verify: the action completes successfully in Zapier (check Zapier's task history)
- [ ] Verify: MJ's `MCPToolExecutionLog` records the call with duration, result, etc.
- [ ] Confirm task billing: each successful call should consume 2 Zapier tasks

### 1.6 Use Synced Action from MJ AI Agent
- [ ] Run an MJ AI Agent that has access to the synced Zapier actions
- [ ] Ask it to perform a task via Zapier (e.g., "Send an email via Gmail to test@example.com")
- [ ] Verify the agent discovers and invokes the Zapier-originated action correctly

---

## Part 2: Inbound Validation — Zapier Consumes MJ's MCP Server

**What**: Connect Zapier's MCP Client (beta) to MJ's MCP Server, then use MJ tools in Zaps.

### 2.1 Prerequisites
- [ ] MJ's MCP Server must be publicly accessible (not localhost). Options:
  - Deploy to a staging server with a public URL
  - Use ngrok: `ngrok http 3100` → get `https://abc123.ngrok.io`
  - Set `MJAPI_PUBLIC_URL` environment variable if using ngrok
- [ ] MCP Server must have OAuth or API Key auth configured
- [ ] Enable desired tools on the MCP Server (entity CRUD, actions, agents, prompts)

### 2.2 Connect Zapier to MJ's MCP Server
- [ ] In Zapier, go to Apps → search "MCP Client" (beta)
- [ ] Add connection:
  - **Server URL**: Your MJ MCP Server URL (e.g., `https://your-server.com/mcp` or ngrok URL)
  - **Transport**: SSE or Streamable HTTP (match MJ's MCP Server config)
  - **OAuth**: Yes (if using OAuth) or No (if using Bearer Token)
  - **Bearer Token**: Your MJ API key (if using API Key auth)
- [ ] Verify connection succeeds

### 2.3 Test MJ Tools in a Zap
- [ ] Create a test Zap using MCP Client triggers/actions:
  - **Trigger**: "New Tool Result" or manual trigger
  - **Action**: "Run Tool" → select an MJ entity CRUD tool (e.g., `Get_Contacts_Record`)
- [ ] Run the Zap and verify MJ data flows correctly
- [ ] Test a write operation: create or update a record in MJ via Zapier

### 2.4 Validate Scope/Permission Enforcement
- [ ] If using OAuth with scopes, verify that Zapier can only access tools within its granted scopes
- [ ] Test that restricted tools are properly denied

### 2.5 Document Limitations
- [ ] Note any issues with Zapier's MCP Client (it's beta)
- [ ] Document which transports work (SSE vs StreamableHTTP)
- [ ] Document any tool discovery limitations on Zapier's side
- [ ] Note response format compatibility (Zapier expects `content[].text`)

---

## Part 3: MCP Dashboard UX Improvements for Scale

**Problem**: The current MCP Dashboard renders all tools in a flat `@for` loop with no virtual scrolling or pagination. With Zapier exposing thousands of tools, the UI will freeze.

### Current State (What Breaks)
- Tools tab renders ALL tools as DOM nodes (card or table view) — no pagination
- Filter panel does client-side O(n) substring search on every keystroke
- `buildServerGroups()` reconstructs the full grouped list on every filter change
- No lazy loading of tools within server groups
- Test Tool dialog loads all tools into a dropdown

### 3.1 Server-Side Search & Pagination
- [ ] Add `searchText` and pagination params (`skip`, `take`) to the tools data loading
- [ ] Default page size: 50 tools (configurable)
- [ ] Debounced search (already 300ms debounce exists — keep it)
- [ ] Server groups should show tool count but only load tools on expand
- [ ] Search should match across: tool name, description, server name

### 3.2 Virtual Scrolling or Pagination Controls
Two viable approaches (pick one):

**Option A — Pagination (Recommended: simpler, works well with server-side filtering)**
- [ ] Add page controls below the tools list (Previous / Page N of M / Next)
- [ ] Show total tool count and filtered count
- [ ] Pagination state per server group OR flat across all tools

**Option B — Virtual Scroll (Smoother UX, more complex)**
- [ ] Use Angular CDK `cdk-virtual-scroll-viewport` for the tool list
- [ ] Requires fixed row height (works for list view, harder for card view)
- [ ] Keep card view for small datasets, auto-switch to list view for large datasets

### 3.3 Enhanced Filter Panel
- [ ] Add **category/app filter** — group tools by source app (e.g., "Gmail", "Slack", "Sheets")
  - Zapier tools follow naming convention `appname_action_verb` — parse the prefix
- [ ] Add **server filter dropdown** — when multiple MCP servers are connected, filter by server
- [ ] Add **"Recently Used" quick filter** — based on `MCPToolExecutionLog` data
- [ ] Add **"Favorites" capability** — let users star frequently-used tools
- [ ] Show **active filter count** badge on the filter panel header

### 3.4 Tool Count Badges
- [ ] Show tool count per server group header: "Zapier (1,247 tools)"
- [ ] Show total vs. filtered: "Showing 23 of 1,247 tools"
- [ ] Collapse server groups by default when tool count > 100

### 3.5 Test Tool Dialog Improvements
- [ ] Replace the full tool dropdown with a **searchable combobox**
- [ ] Load tools lazily in the dropdown (typeahead search, not preload all)
- [ ] Show recently tested tools at the top

### 3.6 Performance Targets
- [ ] Initial load with 5,000 tools: < 2 seconds to interactive
- [ ] Search keystroke response: < 200ms
- [ ] Page navigation: < 100ms
- [ ] Smooth 60fps scrolling

---

## Part 4: Demo & Documentation

### 4.1 Demo Scenario Script
Build a demo that shows both directions:

**Scene 1: Outbound — MJ Agent sends email via Zapier**
1. Show the MCP Dashboard with Zapier connected
2. Show synced tools (Gmail, Slack, etc.)
3. Open an MJ AI Agent conversation
4. Ask: "Send an email to john@example.com welcoming them to the platform"
5. Agent discovers and invokes the Zapier Gmail action
6. Show the email was sent (check Gmail)

**Scene 2: Inbound — Zapier Zap creates MJ record**
1. Show Zapier's MCP Client connected to MJ's MCP Server
2. Create a Zap: Google Form submission → MCP Client → Create Contact in MJ
3. Submit a Google Form
4. Show the new Contact record in MJ Explorer

**Scene 3: Scale — Thousands of tools**
1. Enable 50+ Zapier actions across different apps
2. Sync tools in MJ
3. Show the improved dashboard UX: search, filter by app, pagination
4. Find a specific tool quickly using search
5. Execute it from the dashboard

### 4.2 Documentation Deliverables
- [ ] **Setup Guide**: Step-by-step for connecting MJ to Zapier (outbound)
- [ ] **Setup Guide**: Step-by-step for connecting Zapier to MJ (inbound)
- [ ] **Architecture Diagram**: Show both directions with MCP as the protocol
- [ ] **FAQ**: Pricing (2 tasks/call), rate limits, auth options, self-hosted considerations
- [ ] **Troubleshooting**: Common issues (transport mismatch, auth failures, tool visibility)

### 4.3 Issue #529 Resolution
- [ ] Post findings to the issue as a comment
- [ ] Propose closing the issue or converting to documentation-only task
- [ ] Reference this plan and demo artifacts

---

## Zapier MCP Technical Quick Reference

| Detail | Value |
|--------|-------|
| Server URL (SSE) | `https://actions.zapier.com/mcp/sk-<key>/sse` |
| Server URL (HTTP) | `https://actions.zapier.com/mcp/sk-<key>/` |
| Auth (personal) | API Key in URL path or header `x-mcp-zapier-x-api-key` |
| Auth (apps) | OAuth 2.1 via `https://mcp.zapier.com/api/v1/connect` |
| Tool naming | Snake_case: `appname_action_verb` (e.g., `gmail_send_email`) |
| Tool count | 40,000+ actions across 8,000+ apps |
| Rate limit (free) | 40 calls/hour, 80/day, 160/month |
| Task cost | 2 Zapier tasks per successful tool call |
| Failed calls | Free (no tasks consumed) |
| Config portal | [mcp.zapier.com](https://mcp.zapier.com) |
| Zapier MCP Client | Beta — supports SSE + Streamable HTTP transports |

---

## Estimated Effort

| Work Item | Effort | New Code? |
|-----------|--------|-----------|
| Part 1: Outbound validation | 1-2 days | No — configuration only |
| Part 2: Inbound validation | 1-2 days | No — configuration only (may need ngrok/staging) |
| Part 3: Dashboard UX | 3-5 days | Yes — Angular component updates |
| Part 4: Demo & docs | 1-2 days | No — documentation |
| **Total** | **~6-11 days** | |

Part 3 (Dashboard UX) is the only piece requiring code changes. Parts 1, 2, and 4 are validation and documentation tasks.
