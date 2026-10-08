# MemberJunction Citizen Agent Builder

> **Instructions for AI coding agents (Claude Code, Antigravity, Cursor, Codex, Windsurf):**
> You are setting up, authoring, testing and packaging MemberJunction AI agents for a business user,
> end to end. Your rulebook is [`AGENTS.md`](AGENTS.md): read it before you do anything else, and
> follow its rules on asking for everything up front, keeping the user informed while setup runs,
> never asking for a secret in chat, and testing the way the user will actually use the agent.

---

## ⚡ Getting started

### Before you start: what you need (about 5 minutes)

Collect these first, so setup never stops part way to ask for them:

| You need | Why | Where it comes from |
|---|---|---|
| **Docker Desktop**, with **12 GB of memory** and **20 GB of free disk** | Runs the local database, API and web app. At Docker's default of 8 GB the install runs out of memory. | [docker.com](https://www.docker.com/products/docker-desktop). Then Docker Desktop → Settings → Resources → Memory. |
| **An AI provider API key** | Your agents call a model with it. | For Anthropic, create one at [console.anthropic.com](https://console.anthropic.com/settings/keys) inside a workspace. A Claude or ChatGPT subscription does not include an API key. |
| **The email you sign in with** | That account gets the role that can run the agents you build. | You. |
| **Sign-in settings** for the web app (Microsoft Entra or Auth0) | Without them the Explorer web app cannot sign you in; you can still build and test from the command line. | Usually your IT or platform team. |

A GitHub token is **not** needed for the public sample data.

### Option A: let your coding agent do it (recommended)

Create an empty folder, open your coding agent in it, and paste:

```markdown
Set up the MemberJunction Citizen Agent Builder in this folder by running
`npx @memberjunction/cli@edge agent init .`, then read AGENTS.md and follow it.

Build me an AI agent that:
[Describe your business goal, e.g. "analyzes customer order frequency and overdue invoices,
flags accounts at risk of churning, and drafts personalized retention outreach emails."]

Test it the way I will use it, package it for promotion, and tell me how to try it myself.
```

### Option B: step by step

1. **Create the workspace** (this also starts it):
   ```bash
   npx @memberjunction/cli@edge agent init ./my-agents
   cd ./my-agents
   ```
   `agent init` picks free ports, generates an encryption key, and lists anything still missing.
   Add `--no-start` to fill in `.env` before anything starts.
2. **Fill in `.env`.** It is a hidden file. Open it with `open -e .env` (macOS), `notepad .env`
   (Windows) or `xdg-open .env` (Linux). The values to fill in are at the top.
3. **Start or restart the stack** after editing `.env`:
   ```bash
   docker compose up -d
   ```
4. **Open your coding agent** in `./my-agents` and say what you want to build.

> `@edge` is required: the agent builder ships in MemberJunction 6.2, which is published as
> `@memberjunction/cli@edge` until it is released.

### How long it takes

| Step | Usually |
|---|---|
| Download and build the images (first time) | 10 to 20 minutes |
| Install MemberJunction (first time) | 10 to 25 minutes |
| Load the sample business data (first time) | 10 to 30 minutes |
| Start the API and web app (every start) | 2 to 6 minutes |

Apple Silicon Macs run the image under emulation, so expect the longer end. Later starts skip the
install steps. Progress is always in **`.mj-status.json`**: the current step, how long it usually
takes, and on failure what went wrong and what to do.

---

## 1. What runs where

> **Product principle:** *make the human surface simple; keep the agent surface complete.*

Everything runs in Docker on your machine:

* **`sqlserver`** (port `DB_PORT`, default 1433): Microsoft SQL Server 2022.
* **`db-init`**: creates the MemberJunction database, then exits.
* **`mj`**: installs MemberJunction on first start, loads the business context app (the More Cheese
  sample data by default, or your organization's), pushes the agents in `./metadata`, then serves:
  * the **API** at `http://localhost:4000` (`API_PORT`), and
  * the **Explorer web app** at `http://localhost:4202` (`EXPLORER_PORT`).

`agent init` moves a port that is already in use on your machine to a free one and writes it to
`.env`. Settings live in `.env`; the container reads it on every start, so restarting is enough
after a change (`./scripts/restart-api.sh` for keys).

### Commands

| Command | What it does |
|---|---|
| `cat .mj-status.json` | Setup progress: step, typical duration, warnings, and errors with what to do. |
| `./scripts/sync-metadata.sh` | Pushes `./metadata/` to the database, then restarts the API so it loads the changes. |
| `./scripts/restart-api.sh` | Applies `.env` changes (keys, sign-in) and restarts the API. |
| `./scripts/generate-capabilities.sh` | Writes `CAPABILITIES.md`: installed apps, entities, actions and agents. |
| `./scripts/query-run-history.sh ["<Agent>"\|<RunID>]` | Agent run history and traces. |
| `docker compose exec -T mj mj ai agents run -a "<Name>" -p "<Input>" --format json` | Runs an agent to completion and prints its result and run ID. |
| `docker compose exec -T mj mj ai audit agent-run <RunID> --format json` | One run's steps, prompts, model output, tokens and tool calls. |
| `docker compose exec -T mj mj doctor --format json` | Diagnostics, with fixes. |
| `docker compose logs -f mj` | The setup log. |

---

## 2. References

* [`AGENTS.md`](AGENTS.md): the coding agent's rulebook for this workspace. **Authoritative.**
* [docs.memberjunction.org](https://docs.memberjunction.org/): [AI agents](https://docs.memberjunction.org/ai/),
  [actions](https://docs.memberjunction.org/actions/),
  [metadata sync](https://docs.memberjunction.org/developer-guide/metadata-sync/),
  [entities](https://docs.memberjunction.org/concepts/entities/).
* In the MemberJunction repository (`https://github.com/MemberJunction/MJ/blob/next/`):
  [`metadata/CLAUDE.md`](https://github.com/MemberJunction/MJ/blob/next/metadata/CLAUDE.md) (metadata
  file rules) and
  [`metadata/agents/.workflow-demo-agents.json`](https://github.com/MemberJunction/MJ/blob/next/metadata/agents/.workflow-demo-agents.json)
  (working Flow agents with steps, paths and mappings).
* [`docs/PROMOTION_GUIDE.md`](docs/PROMOTION_GUIDE.md): how a platform team reviews and deploys a packaged agent.
* [`docs/ENTERPRISE_ORG_SETUP.md`](docs/ENTERPRISE_ORG_SETUP.md): building against your organization's own schemas.

---

## 3. Building against your organization's data

By default the builder installs **More Cheese**, a synthetic dataset spread across several business apps.
To build against your organization's entities, point `OPEN_APP_INSTALL_URL` in `.env` at your
organization's sample-data app (and set `GITHUB_TOKEN` if that repository is private), then start a
fresh workspace. [`docs/ENTERPRISE_ORG_SETUP.md`](docs/ENTERPRISE_ORG_SETUP.md) has the details.
