# Docker Configurations — Context for Claude

This directory contains Docker configurations for MemberJunction. When working with Docker in this repo, use this context.

## Directory Layout

### docker/MJAPI/
**Purpose**: Production MJAPI container, published with each MJ release.

- Runs Flyway migrations, CodeGen, then starts MJAPI via PM2
- Build from repo root: `docker build -f docker/MJAPI/Dockerfile -t memberjunction/api .`
- Configured via environment variables (see `docker.config.cjs`)
- SSH debugging on port 2222 (password: `Docker!`)

### docker/workbench/
**Purpose**: Claude Code workbench with dedicated SQL Server for autonomous development and testing.

- `docker-compose.yml` spins up two containers: `sql-claude` (SQL Server 2022) and `claude-dev` (Node 24 + Claude Code + MJ CLI)
- SQL Server SA credentials: `sa` / `Claude2Sql99` (docker-internal only, not a real password)
- SQL Server accessible from host at `localhost:1444`
- Claude Code and MJ CLI auto-update on every container start via `entrypoint.sh`
- MJ repo is auto-cloned to `/workspace/MJ` on first start (from `next` branch)
- Pre-configured permissions in `claude-settings.json` allow npm, git, sqlcmd, mj, and other common commands
- Oh-My-Zsh with aliases: `cc` = `claude --dangerously-skip-permissions`

**Starting the workbench:**
```bash
cd docker/workbench
./start.sh
docker exec -it claude-dev zsh
```

**Running Claude inside the workbench:**
```bash
cc                          # Interactive Claude with skip-permissions
ccp "run the migrations"    # One-shot prompt
ccr                         # Resume last conversation
```

**SQL from inside the container:**
```bash
sql                         # Interactive sqlcmd as SA
sqlq "SELECT name FROM sys.databases"  # Inline query
sqldbs                      # List all databases
```

## MJ Repository and Branch Workflow

The workbench entrypoint automatically clones the MJ repo to `/workspace/MJ` from the `next` branch on first startup. On subsequent starts, it fetches the latest from `origin/next`.

### CRITICAL: Branch Rules for All Work

**NEVER work directly on the `next` branch.** Always follow this workflow:

1. **Before starting any new task**, ensure you're up to date with `next`:
   ```bash
   cd /workspace/MJ
   git checkout next
   git pull origin next
   ```

2. **Create a new feature branch** for every task:
   ```bash
   git checkout -b claude/<descriptive-name>
   ```

3. **Push the branch to remote and track it** (same-named remote branch):
   ```bash
   git push -u origin claude/<descriptive-name>
   ```

4. **Verify tracking** before every push:
   ```bash
   git branch -vv
   # Should show: * claude/<name> [origin/claude/<name>]
   # NEVER: * claude/<name> [origin/next]  ← DANGEROUS
   ```

5. **When done**, create a PR targeting `next`:
   ```bash
   gh pr create --base next --title "..." --body "..."
   ```

### Why This Matters
- Pushing directly to `next` bypasses PR review and can break the main branch
- Feature branches isolate work and enable clean PRs
- Same-name tracking prevents accidental pushes to the wrong remote branch
- The `claude/` prefix makes it clear which branches were created in the workbench

### Starting a New Project After Previous Work
```bash
cd /workspace/MJ
git checkout next
git pull origin next
git checkout -b claude/<new-task-name>
git push -u origin claude/<new-task-name>
```

### GitHub Authentication
Run `gh auth login` once inside the container. The credential is persisted in the `gh-config` Docker volume across restarts.

## When to Use Each

| Scenario | Use |
|----------|-----|
| Deploy MJAPI for users | `docker/MJAPI/` |
| Give Claude a SQL Server sandbox | `docker/workbench/` |
| Automated testing with Claude | `docker/workbench/` |
| CI/CD pipeline with Claude | `docker/workbench/` |
| Database experimentation | `docker/workbench/` |

## Managing the Workbench via Slash Command

Use `/docker-workbench` to start, stop, and interact with the workbench from any Claude Code session. See `.claude/commands/docker-workbench.md` for details.
