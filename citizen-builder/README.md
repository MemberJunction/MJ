# MemberJunction Citizen Agent Builder

> **Instructions for AI Coding Agents (Claude Code, Antigravity, Cursor, Codex, Windsurf):**
> If you are an AI coding agent reading this file, you have been tasked with setting up, authoring, testing, and packaging MemberJunction AI Agents for your user end-to-end.
> Follow the numbered steps below. You have the tools to run the bash commands, inspect database traces, author declarative metadata, and package the final agent bundle without requiring your user to write code or manage database migrations.

---

## ⚡ Getting Started (Choose Your Path)

### Option A: The Agent-Driven Path (Recommended — Zero Manual Setup)
You don't need to manually run CLI commands, configure Docker files, or edit JSON files by hand. Simply create a new empty directory, open your favorite AI coding agent (**Claude Code**, **Antigravity**, **Cursor**, **Codex**, or **Windsurf**), and paste this prompt:

```markdown
Please review the MemberJunction Citizen Agent Builder guide at:
https://github.com/MemberJunction/MJ/tree/next/citizen-builder

Follow the instructions in that guide:
1. Initialize a new MemberJunction agent builder workspace here using `npx @memberjunction/cli agent init .`
2. Start the local Docker environment and verify services are running.
3. Review available entities and actions in CAPABILITIES.md.
4. Build me an AI agent that:
   [Describe your business goal here — e.g. "analyzes customer order frequency and overdue invoices, flags accounts at risk of churning, and drafts personalized retention outreach emails."]
5. Push the metadata, run test executions, verify the run traces in the database, and package the final distributable bundle for promotion.
```

Your coding agent will read the guide, scaffold the workspace, start the local database and API, author the declarative agent metadata, test it against local data, and hand you a packaged distribution `.zip` file with an `AGENT_MANIFEST.md` report.

---

### Option B: The Manual / Step-by-Step Path
If you prefer to initialize the workspace and start the Docker environment yourself before handing off to an agent:

1. **Scaffold the workspace**:
   ```bash
   npx @memberjunction/cli agent init ./my-agents
   cd ./my-agents
   ```
2. **Add your LLM API Key**:
   Open `.env` and add your OpenAI, Anthropic, Gemini, or Groq API key:
   ```bash
   OPENAI_API_KEY=sk-...
   ```
3. **Start the local Docker stack**:
   ```bash
   docker compose up -d
   ```
4. **Launch your coding agent**:
   Open your coding agent in `./my-agents` and tell it what you want to build:
   ```
   "Build me an agent that monitors accounts receivable aging and drafts payment follow-ups."
   ```
   The coding agent will detect `AGENTS.md`, adhere to the 3-tier safety boundaries, and build the agent for you.

---

## 1. Overview & Architecture

> **Product Principle:** *Make the human surface simple; keep the agent surface complete.*
> The business-user experience is a straightforward chat. The agent experience is comprehensive — giving coding agents full machine-readable access to live entity metadata, actions, progressive CLI discovery, diagnostic probes, execution traces, and packaging.

The **Citizen Agent Builder** provides an isolated, local MemberJunction environment that runs entirely inside Docker:
* **`sqlserver` (Port 1433)**: Microsoft SQL Server 2022.
* **`mj` (Ports 4000 & 4202)**: A Node 24 container that executes `mj install` on first boot, provisions the database schema, installs business context (More Cheese default, or enterprise apps like Blue Cypress), and serves:
  * **MJAPI** at `http://localhost:4000` (GraphQL API and agent execution engine).
  * **MJExplorer** at `http://localhost:4202` (Web UI for testing agents and viewing records; port 4202 is an authorized redirect URI for Auth0/MSAL).
* **Metadata Directory (`./metadata`)**: Local JSON and Markdown files mapped into the container. Pushing metadata to the database is done with a single command (`./scripts/sync-metadata.sh`).

### Available Agent Tools & CLI Commands

Every tool and command in this workspace supports machine-readable output (`--format json`) for autonomous coding agents:

| Tool / Command | What It Does |
|---|---|
| `./scripts/sync-metadata.sh` | Pushes declarative metadata files in `./metadata/` to the database, resolving `@lookup` and `@file` references. |
| `./scripts/query-run-history.sh ["<Agent>"\|<ID>]` | Queries agent run history, step execution traces, and action logs via native CLI. |
| `./scripts/generate-capabilities.sh` | Re-scans the live database and regenerates `CAPABILITIES.md` with current entities and actions. |
| `docker compose exec -T mj mj doctor --format json` | Runs system diagnostics returning structured checks, failures, and auto-remediations. |
| `docker compose exec -T mj mj doctor --format json --scope [ai\|runtime\|install]` | Filters diagnostics by specific subsystem (e.g. AI provider credentials or encryption keys). |
| `docker compose exec -T mj mj ai actions list --format json` | Lists all available system and business actions with parameter schemas. |
| `docker compose exec -T mj mj ai agents list --format json` | Lists all existing agents, agent types, and categories in the instance. |
| `docker compose exec -T mj mj ai agents run -a "<Name>" -p "<Input>" --format json` | Executes an agent headlessly and emits structured execution results. |
| `docker compose exec -T mj mj ai audit agent-run <ID> --format json` | Audits an agent run: step-by-step prompts, LLM completions, token counts, and tool calls. |

---

## 2. Documentation & Architecture References

When authoring agents or researching MemberJunction APIs, consult these authoritative resources:

### A. Official Documentation Portal (`docs.memberjunction.org`)
Use your web search or fetch tools to research topics across the documentation portal:
* **Documentation Portal**: [https://docs.memberjunction.org/](https://docs.memberjunction.org/)
* **AI Agents Architecture**: [https://docs.memberjunction.org/ai/](https://docs.memberjunction.org/ai/) — Details on Agent Types (`Flow` deterministic step graphs vs `Loop` iterative tool-calling), Prompt bindings, model selection, execution lifecycles, and sub-agents.
* **Actions Framework**: [https://docs.memberjunction.org/actions/](https://docs.memberjunction.org/actions/) — Available actions, parameter definitions, and result codes.
* **Metadata Sync System**: [https://docs.memberjunction.org/developer-guide/metadata-sync/](https://docs.memberjunction.org/developer-guide/metadata-sync/) — Complete specification for declarative metadata files, reference resolution, and upsert mechanics.
* **Entity Data Platform**: [https://docs.memberjunction.org/concepts/entities/](https://docs.memberjunction.org/concepts/entities/) — Core entities, schema relationships, permissions, and query patterns.

### B. MemberJunction Repository Specifications
If you have access to the repository (or view them on GitHub at `https://github.com/MemberJunction/MJ/blob/next/`):
* [`metadata/CLAUDE.md`](https://github.com/MemberJunction/MJ/blob/next/metadata/CLAUDE.md): **The Definitive Metadata Specification**. Rules on `@lookup`, `@file`, `@parent`, native nested JSON objects, and `mj sync push` mechanics.
* [`packages/Actions/CLAUDE.md`](https://github.com/MemberJunction/MJ/blob/next/packages/Actions/CLAUDE.md): Action authoring conventions and parameter schemas.
* [`packages/AI/README.md`](https://github.com/MemberJunction/MJ/blob/next/packages/AI/README.md): AI Agent execution engine, state machines, and task graph dispatcher.

---

## 3. Step-by-Step Execution Guide for Coding Agents

### Step 1: Initialize & Start the Environment

1. **Verify Docker Status**:
   Run `docker info` in the terminal.
   * If running: proceed.
   * If on macOS and Docker Desktop is stopped, run `open -a Docker` and wait 15–20 seconds for the daemon to start.
   * If Docker is not installed, provide your user with the installation link: `https://www.docker.com/products/docker-desktop` (or `brew install --cask docker`).

2. **Configure Environment Variables**:
   If `.env` does not exist, copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```
   Ask the user to supply their LLM API key (e.g. `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY`) and set it in `.env`.

3. **Start the Stack**:
   Run:
   ```bash
   docker compose up -d
   ```
   *On first start, the container runs `mj install`, applies core migrations, installs the business context app (More Cheese), and launches both MJAPI and MJExplorer.*
   Monitor startup until ready:
   ```bash
   docker compose logs -f mj
   ```
   Once the banner appears:
   * **MJAPI is live at**: `http://localhost:4000`
   * **MJExplorer is live at**: `http://localhost:4202`

---

### Step 2: Understand the 3-Tier Boundary & Guardrails

Always enforce these constraints when authoring agents:

| Tier | Classification | What You May Author | Human Approval Needed? |
|---|---|---|---|
| **Tier 1** | **Declarative Only** | Flows, Loops, prompts, step mappings, action bindings, and sub-agent composition. | No — auto-promotable |
| **Tier 2** | **Runtime Code** | Sandboxed JavaScript **Runtime Actions** with explicit permission scopes. | Yes — admin code review |
| **Tier 3** | **Schema Changes** | New database tables, columns, migrations, or entity CodeGen. | **Strictly Off-Limits** |

#### Mandatory Defaults:
1. **`ModelSelectionMode: "Agent Type"`**: Never hardcode specific provider models (`gpt-4o`, `claude-3-5-sonnet`). The destination environment maps models to Agent Types.
2. **`ExposeAsAction: false`**: Do not set `true` unless the user explicitly wants other agents to call this agent as an action.
3. **Dynamic Record Resolution**: Never hardcode record IDs or personal names. Use queries, parameters, or lookup actions.
4. **Prefer `Flow` Agents**: Use `Flow` agents for predictable step-by-step tasks. Use `Loop` only for dynamic problem-solving with open-ended tool calling.

---

### Step 3: The Authoring Loop

1. **Check Available Tools & Entities**:
   Review `CAPABILITIES.md` (or run `./scripts/generate-capabilities.sh` to update it). This file contains the exact entity names, fields, and available actions in the running instance.

2. **Metadata Formatting Rules (CRITICAL)**:
   * **Native JSON Objects**: Fields storing JSON (such as `Configuration` or `Settings`) **MUST** be written as clean, native nested JSON objects. **NEVER** write escaped JSON strings (`"Configuration": "{\"Steps\":...}"`), as this breaks `@lookup` reference resolution!
   * **No `sync` Blocks**: Do not author `sync` blocks (`lastModified`, `checksum`). `mj sync push` manages these automatically.
   * **Assign Deterministic UUIDs**: Assign a fresh uppercase UUID for `primaryKey` (e.g. via CLI `uuidgen | tr '[:lower:]' '[:upper:]'`).
   * **Use Dynamic References**:
     - `@lookup:<EntityName>.<FieldName>=<Value>` for foreign keys (e.g. `@lookup:MJ: AI Agent Types.Name=Flow`).
     - `@file:<relativePath>` for external template files (e.g. `@file:templates/<slug>.template.md`). Note that `@file:` paths are resolved at push time; running `./scripts/sync-metadata.sh` updates the database.
     - `@parent:ID` for linking child records to parent records in nested structures.

3. **Author Files**:
   * Prompt Markdown template: `metadata/prompts/templates/<slug>.template.md`
   * Prompt metadata JSON: `metadata/prompts/.<slug>-prompt.json`
   * Agent metadata JSON: `metadata/agents/.<slug>-agent.json`
   *(See `metadata/agents/.customer-insight-agent.json` for a reference Flow agent).*

4. **Push to Local Database**:
   ```bash
   ./scripts/sync-metadata.sh
   ```

---

### Step 4: Testing & Autonomous Diagnostics (The Dual Loop)

1. **Interactive Testing (Explorer UI)**:
   Invite the user to test in their browser at `http://localhost:4202`.

2. **Headless Execution**:
   You can trigger test runs directly via CLI with structured output:
   ```bash
   docker compose exec -T mj mj ai agents run -a "<Agent Name>" -p "<Test Input>" --format json
   ```

3. **Diagnosing Errors & Auditing Execution Traces**:
   When an agent runs, **do not ask the user for console logs**. Audit execution traces directly via native CLI:
   ```bash
   # List recent runs for this agent
   ./scripts/query-run-history.sh "<Agent Name>"

   # View full machine-readable JSON trace for a specific run ID
   ./scripts/query-run-history.sh <RunID> --format json

   # Or drill down into specific steps or errors
   ./scripts/query-run-history.sh <RunID> --step 1 --detail full
   ./scripts/query-run-history.sh <RunID> --errors
   ```
   
   **Trace Verification Assertions**:
   * Verify that `actionsUsed` matches expected actions and tools.
   * Verify that `actionsNotUsed` contains sensitive or dangerous actions.
   * Check step prompts, outputs, and token counts to spot prompt drift or infinite loops.
   
   Analyze the trace, refine your prompt template or mapping, run `./scripts/sync-metadata.sh`, and re-test.

---

### Step 5: Packaging for Promotion

When the user is satisfied, package the agent for promotion to staging or production:

1. Validate that all Tier 1 guardrails are met (no secrets, no hardcoded IDs, `ModelSelectionMode: "Agent Type"`).
2. Query the last successful run metrics using `./scripts/query-run-history.sh "<Agent Name>"`.
3. Generate `AGENT_MANIFEST.md` detailing:
   * Agent Name, Purpose, and Author.
   * Tier Classification (Tier 1 vs Tier 2).
   * Data Footprint (Entities Read vs Entities Written).
   * Bound Tools and Actions.
   * Sample Execution Trace Receipt.
4. Create the distribution archive:
   ```bash
   mkdir -p dist
   zip -r "dist/<agent-slug>-package.zip" \
     AGENT_MANIFEST.md \
     metadata/agents/.*"<agent-slug>"*.json \
     metadata/prompts/.*"<agent-slug>"*.json \
     metadata/prompts/templates/"<agent-slug>"*.md
   ```
5. Give the user the path to `dist/<agent-slug>-package.zip` and explain how their platform admin can review and deploy it (see `docs/PROMOTION_GUIDE.md`).

---

## 4. Enterprise Organization Setup (e.g. Blue Cypress)

By default, the builder runs against **More Cheese** (a rich synthetic dataset covering 9 business apps).

To build agents against your organization's **real schemas and synthetic records** (e.g. **Blue Cypress / BC**):
1. In `.env`, set:
   ```bash
   OPEN_APP_INSTALL_URL=https://github.com/BlueCypress/bc-sampledata
   GITHUB_TOKEN=ghp_yourReadOnlyTokenHere
   ```
2. Restart the container:
   ```bash
   docker compose down -v && docker compose up -d
   ```
3. Run `./scripts/generate-capabilities.sh` to refresh `CAPABILITIES.md` with your organization's custom entities and actions.
👉 For complete enterprise details, see [docs/ENTERPRISE_ORG_SETUP.md](docs/ENTERPRISE_ORG_SETUP.md).
