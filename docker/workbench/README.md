# Workbench

A Docker Compose environment that pairs **Claude Code** with a dedicated **SQL Server 2022** instance, giving Claude autonomous access to a full database environment for MemberJunction development, testing, and automation.

## What's Included

### claude-dev container
- **Node.js 24** (Bookworm)
- **Claude Code** (latest, auto-updated on each container start)
- **@memberjunction/cli** (latest, auto-updated on each container start)
- **Oh-My-Zsh** with aliases and shortcuts
- **SQL Server tools** (sqlcmd, ODBC 18)
- **Angular CLI**, **Playwright + Chromium**, **GitHub CLI**
- Pre-configured Claude Code permissions for common dev commands

### sql-claude container
- **SQL Server 2022 Developer Edition** (linux/amd64)
- SA access with password `Claude2Sql99`
- Persistent data volume (`sql-claude-data`)
- Health check ensures SQL is ready before Claude starts
- Accessible from host on port `1444`

## Quick Start

```bash
cd docker/workbench
cp .env.example .env        # Optionally set ANTHROPIC_API_KEY (or use OAuth)
./start.sh
```

Then connect:
```bash
docker exec -it claude-dev zsh
cc                          # Start Claude Code (skip permissions)
```

## Shell Aliases

When you enter the container, these aliases are available:

### Claude Code
| Alias | Command |
|-------|---------|
| `cc` | `claude --dangerously-skip-permissions` |
| `ccp` | `cc -p <prompt>` (one-shot) |
| `ccr` | `cc --resume` |
| `ccc` | `claude --continue` |

### SQL Server
| Alias | Command |
|-------|---------|
| `sql` | `sqlcmd` connected to sql-claude as SA |
| `sqlq` | Inline query: `sqlq "SELECT 1"` |
| `sqldbs` | List all databases |
| `sqld` | Connect to specific DB: `sqld MyDB` |

### Git
| Alias | Command |
|-------|---------|
| `gs` | `git status` |
| `gd` | `git diff` |
| `gl` | `git log --oneline -20` |

## Auto-Update

Every time the container starts, the entrypoint automatically runs:
```bash
npm update -g @anthropic-ai/claude-code @memberjunction/cli
```
This ensures Claude Code and the MJ CLI are always at the latest version without rebuilding the image.

## SQL Server Connection

From inside the container, Claude can connect using the environment variables in `.env.database`:

```
DB_HOST=sql-claude
DB_PORT=1433
DB_USER=sa
DB_PASSWORD=Claude2Sql99
```

The file is mounted read-only at `/workspace/.env.database` and also injected as container environment variables.

From the host machine (e.g., Azure Data Studio):
```
Server: localhost,1444
User: sa
Password: Claude2Sql99
```

## Permissions

The container includes a pre-configured `claude-settings.json` that allows common dev commands (npm, git, sqlcmd, mj, node, etc.) without interactive approval. For fully autonomous operation, use the `cc` alias which skips all permission checks.

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Container image definition |
| `docker-compose.yml` | Compose stack (SQL Server + Claude) |
| `entrypoint.sh` | Auto-update and shell startup |
| `.zshrc` | Oh-My-Zsh config with aliases |
| `.env.database` | SQL connection details (committed, docker-internal only) |
| `.env.example` | Template for user-specific settings |
| `claude-settings.json` | Pre-approved Claude Code permissions |
| `start.sh` | One-command setup script |

## Architecture

```
┌─────────────────────────────────────────────┐
│  Docker Compose Network                     │
│                                             │
│  ┌──────────────┐    ┌──────────────────┐   │
│  │  sql-claude   │    │  claude-dev      │   │
│  │  SQL Server   │◄───│  Node 24 + zsh   │   │
│  │  2022 Dev Ed  │    │  Claude Code     │   │
│  │  Port 1433    │    │  MJ CLI          │   │
│  └──────────────┘    │  Playwright      │   │
│        │              └──────────────────┘   │
│        │ Port 1444                           │
└────────┼────────────────────────────────────┘
         ▼
    Host machine
  (Azure Data Studio,
   DBeaver, etc.)
```
