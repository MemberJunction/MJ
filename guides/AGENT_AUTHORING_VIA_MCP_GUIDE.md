# Agent Authoring via MCP — External Clients Configuring MJ Agents

How to author, introspect, test, and govern MemberJunction agents **from an external MCP client** — Claude Code, Codex, Claude Desktop, Cursor, or anything MCP-compatible — using the agent-management tool vocabulary on MJ's MCP server.

**Read this before** pointing a desktop agent at an MJ MCP server for agent-building work, granting `agent:manage` scope to anyone, or deciding how MCP-authored agents get promoted to production.

**Companions**: [`packages/AI/MCPServer/README.md`](../packages/AI/MCPServer/README.md) (server configuration reference), [`metadata/CLAUDE.md`](../metadata/CLAUDE.md) (file-based metadata + `mj sync`), `plans/external-agent-harness.md` — [PR #3412](https://github.com/MemberJunction/MJ/pull/3412) (the companion initiative: harnesses *running inside* MJ, where this guide is about harnesses *configuring* MJ).

---

## 1. What this is

MJ agents are metadata — a row in `MJ: AI Agents` plus related records for prompts, actions, sub-agents, and flow steps across 30+ entities. The agent-management MCP tool group lets an external client work with all of that as **one JSON document** (an `AgentSpec`), without knowing the entity schema:

| Tool | Scope required | What it does |
|---|---|---|
| `Get_Agent_Catalog` | `agent:read` | List agents: id, name, description, type, status, invocation mode. Filters: wildcard name pattern, status, top-level-only |
| `Get_Agent_Spec` | `agent:read` | The complete AgentSpec for one agent, recursive over sub-agents — the same shape the write tools accept |
| `Create_Agent` | `agent:manage` | Create an agent (nested sub-agents, actions, prompts included) from a spec; returns the new ID + every DB mutation performed |
| `Update_Agent` | `agent:manage` | Full-replace update from a spec; returns mutations |
| `Get_Agent_Type_List` | `agent:read` | Agent types (Loop, Flow, Realtime, …) → `TypeID` values |
| `Get_Action_Catalog` | `action:read` | Action catalog → `ActionID` values, with name/category/status filters |
| `Execute_ActionSmith_Agent` / `Execute_Codesmith_Agent` | `agent:execute` | Always-on execute tools for the builder agents |

The tools wrap `AgentSpecSync` from `@memberjunction/ai-agent-manager` — the same object model the Agent Manager meta-agent uses — so MCP clients, the Agent Manager, and Explorer all read and write agents through one code path.

The group is on by default when the MCP server is enabled; disable with `mcpServerSettings.agentManagementTools.enabled = false`. Individual tools remain subject to the server's include/exclude filter patterns.

## 2. Connecting a client

The server (`@memberjunction/ai-mcp-server`, default port 3100) exposes **StreamableHTTP at `/mcp`** (preferred) and **SSE at `/mcp/sse`**. Health check at `/health`.

**API key** (simplest — headless clients, CI):

```bash
# Claude Code
claude mcp add memberjunction --transport http http://localhost:3100/mcp \
  --header "x-api-key: <MJ_API_KEY>"
```

The key maps to an MJ user; every tool call executes and is audited as that user.

**OAuth 2.1** (interactive clients; per-human identity): enable `mcpServerSettings.auth` with the OAuth proxy (`auth.proxy.enabled = true`) and clients discover everything via RFC 9728/8414 metadata — Claude Code registers itself through Dynamic Client Registration (RFC 7591) and walks the user through browser sign-in against your IdP. See the MCPServer README's Authentication section for the config reference. Prefer OAuth whenever a human is driving: authoring actions then audit as *that person*, not as a shared service identity.

**Scopes** are the control surface either way (per-key via API-key scopes, per-grant via the OAuth consent flow):

- Browse/read-only review: `agent:read`, `action:read`
- Full authoring: add `agent:manage`
- Test-running agents (including the builder agents): add `agent:execute` (+ `agent:monitor` for the run-diagnostic tools)

`agent:manage` is deliberately separate from `agent:read` and from entity-level CRUD scopes: it gates exactly the two tools that mutate agent metadata, so you can hand out broad read access without handing out authoring.

## 3. The authoring loop

The intended workflow from the client's chat:

1. **Orient** — `Get_Agent_Catalog` (pattern `*`, or `topLevelOnly: true` for the roster), `Get_Agent_Type_List`, `Get_Action_Catalog`.
2. **Introspect** — `Get_Agent_Spec` on an existing agent. This is also the fastest way to *learn the AgentSpec shape*: pull a real agent and read it.
3. **Draft** — build a spec. Minimum viable: `{ "Name": "...", "TypeID": "<Loop type id>", "Prompts": [ ... ] }`. Wire capabilities by ID from the catalogs.
4. **Create or update** — `Create_Agent` / `Update_Agent`. Both return the full **mutation list** (entity, operation, record ID, description) — surface it; it's the reviewable receipt of what actually changed.
5. **Test** — `Run_Agent` (or the per-agent `Execute_<Name>_Agent` tool), then audit with the run-diagnostic tools (`List_Recent_Agent_Runs`, `Get_Agent_Run_Summary`, `Get_Agent_Run_Step_Detail`).
6. **Iterate** — back to 3 until the runs look right.

**Builder agents close the loop when a capability is missing**: if the spec needs an action that doesn't exist, `Execute_ActionSmith_Agent` builds it conversationally (it's MJ's action-builder agent); `Execute_Codesmith_Agent` handles code work. Then re-run `Get_Action_Catalog` and wire the new action in. The builder list is configurable via `mcpServerSettings.agentManagementTools.builderAgents`.

## 4. AgentSpec semantics that will bite you

- **`Update_Agent` is full-replace with orphan cleanup.** The spec you send becomes the truth: agent-action junctions, prompt junctions, flow steps/paths, and relationships that exist in the DB but are missing from your spec are **deleted** (child sub-agents are orphaned — `ParentID` nulled — not deleted). Never hand-craft a partial update spec; always `Get_Agent_Spec` → modify → send the whole thing back.
- **IDs are server-assigned on create.** `Create_Agent` rejects specs carrying an ID; nested new sub-agents/prompts likewise get IDs on save (returned in the mutation list). On update, the top-level ID is required and related-record IDs determine update-vs-create per record.
- **Names must be resolvable.** `Get_Agent_Spec` by `agentName` requires a unique name; prefer IDs once you have them.
- **Sub-agents come in two flavors** — `child` (ParentID-based, shares the parent's payload structure via `PayloadDownstreamPaths`/`PayloadUpstreamPaths`) and `related` (junction-based, with explicit `SubAgentInputMapping`/`SubAgentOutputMapping`/`SubAgentContextPaths`). Get this wrong and payload flow silently doesn't do what you expect — see the AgentSpec TSDoc in `packages/AI/CorePlus/src/agent-spec.ts`.
- **Payload ACL fields default open on save** (`["*"]` for downstream/upstream when unset). For any agent with sub-agents, set the payload path fields deliberately.

## 5. Governance: iterate via MCP, promote via `mj sync`

The MCP write tools mutate the **live database** the moment they run. That is exactly right for iteration environments and exactly wrong as the promotion path to production. The convention:

- **Iterate via MCP** against a dev/sandbox MJ instance: tight loop, conversational, mutation receipts in the chat transcript, full run auditing.
- **Promote via `metadata/` + `mj sync`**: when the agent is right, `mj sync pull` it into the metadata file tree, commit, and let it ride the normal PR review → `mj sync push` deployment path. Agent definitions are code-adjacent artifacts; production changes deserve Git review like any other change.
- **Guard production accordingly**: don't grant `agent:manage` on production-facing keys/consents, or disable the group there outright (`agentManagementTools.enabled = false`). Record Changes tracks every MCP-authored mutation like any other entity write, so there's an audit trail either way — but an audit trail is not a review gate.

The two paths are complementary by design, not competing: MCP authoring is the fast inner loop, file-based metadata is the governed outer loop.

## 6. Troubleshooting

- **Tool missing from the client's list** → check the server's include/exclude filter patterns (`--include`/`--exclude`/`--tools-file`) and, for this group, `agentManagementTools.enabled`; run the server with `--list-tools` to see the registered set.
- **`Authorization denied` with scope in the error** → the session's key/consent lacks that scope path; the error names the scope and resource it evaluated.
- **`Execute_ActionSmith_Agent` absent** → the builder agent isn't in this install's metadata under the expected name, or `builderAgents` was overridden; the server logs a startup warning naming the missing agent.
- **Update seemingly deleted things** → it did; see §4 full-replace semantics. Recover via Record Changes history, and switch to the fetch-modify-send pattern.
