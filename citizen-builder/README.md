# MemberJunction Citizen Agent Builder

> **Instructions for AI Coding Agents (Claude Code, Antigravity, Cursor, Codex, Windsurf):**
> If you are an AI coding agent reading this file, you have been tasked with setting up, authoring, testing, and packaging MemberJunction AI Agents for your user end-to-end.
> Follow the numbered steps below. You have the tools to run the bash commands, inspect database traces, author declarative metadata, and package the final agent bundle without requiring your user to write code or manage database migrations.

---

## 1. Overview & Architecture

The **Citizen Agent Builder** provides an isolated, local MemberJunction environment that runs entirely inside Docker:
* **`sqlserver` (Port 1433)**: Microsoft SQL Server 2022.
* **`mj` (Ports 4000 & 4200)**: A Node 24 container that executes `mj install` on first boot, provisions the database schema, installs business context (More Cheese default, or enterprise apps like Blue Cypress), and serves:
  * **MJAPI** at `http://localhost:4000` (GraphQL API and agent execution engine).
  * **MJExplorer** at `http://localhost:4200` (Web UI for testing agents and viewing records).
* **Metadata Directory (`./metadata`)**: Local JSON and Markdown files mapped into the container. Pushing metadata to the database is done with a single command (`./scripts/sync-metadata.sh`).

---

## 2. Step-by-Step Execution Guide for Coding Agents

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
   # Check logs
   docker compose logs -f mj
   ```
   Once the banner appears:
   * **MJAPI is live at**: `http://localhost:4000`
   * **MJExplorer is live at**: `http://localhost:4200`

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

2. **Author Files**:
   * Prompt Markdown template: `metadata/prompts/templates/<slug>.template.md`
   * Prompt metadata JSON: `metadata/prompts/.<slug>-prompt.json`
   * Agent metadata JSON: `metadata/agents/.<slug>-agent.json`
   *(See `metadata/agents/.customer-insight-agent.json` for a reference Flow agent).*

3. **Push to Local Database**:
   ```bash
   ./scripts/sync-metadata.sh
   ```

---

### Step 4: Testing & Autonomous Diagnostics (The Dual Loop)

1. **Interactive Testing (Explorer UI)**:
   Invite the user to test in their browser at `http://localhost:4200`.

2. **Headless Execution**:
   You can trigger test runs directly via CLI:
   ```bash
   docker compose exec mj mj ai agents run -a "<Agent Name>" -p "<Test Input>"
   ```

3. **Diagnosing Errors via Database Run Traces**:
   If an agent errors out or returns poor output, **do not ask the user for console logs**. Run:
   ```bash
   ./scripts/query-run-history.sh
   ```
   This script directly queries:
   * **`[__mj].[vwAIAgentRuns]`**: High-level status, error messages, token usage.
   * **`[__mj].[vwAIAgentRunSteps]`**: The exact prompt sent to the LLM, the model's raw completion, and action parameters for each step.
   * **`[__mj].[vwActionExecutionLogs]`**: Errors and payloads for executed tools.
   
   Analyze the trace, refine your prompt template or mapping, run `./scripts/sync-metadata.sh`, and re-test.

---

### Step 5: Packaging for Promotion

When the user is satisfied, package the agent for promotion to staging or production:

1. Validate that all Tier 1 guardrails are met (no secrets, no hardcoded IDs, `ModelSelectionMode: "Agent Type"`).
2. Query the last successful run metrics using `./scripts/query-run-history.sh`.
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

## 3. Enterprise Organization Setup (e.g. Blue Cypress)

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
