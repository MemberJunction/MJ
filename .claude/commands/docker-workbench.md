---
action: Action to perform (start, stop, status, exec, rebuild, logs)
command: Command to run inside the container (only used with exec action)
---

# Docker Workbench Management

Manage the Docker Workbench — a Docker Compose environment with Claude Code + SQL Server 2022.

The workbench lives at `docker/workbench/` in this repository.

## Actions

Based on the requested action, perform the following:

### start
Start the workbench (build if needed, wait for SQL to be healthy):
```bash
cd docker/workbench && docker compose up -d --build
```
Then wait for SQL Server health check:
```bash
docker compose -f docker/workbench/docker-compose.yml exec sql-claude bash -c 'until /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$SA_PASSWORD" -C -Q "SELECT 1" &>/dev/null; do sleep 2; done'
```
Report that the workbench is ready and remind the user:
- `docker exec -it claude-dev zsh` to connect
- `cc` alias for Claude with skip-permissions
- SQL Server available at `localhost:1444` from host

### stop
Stop and remove all containers (preserve volumes):
```bash
docker compose -f docker/workbench/docker-compose.yml down
```

### status
Check if the workbench is running:
```bash
docker compose -f docker/workbench/docker-compose.yml ps
```

### exec
Run a command inside the claude-dev container:
```bash
docker exec -it claude-dev zsh -c '{{command}}'
```
{{#if command}}
Execute the provided command: `{{command}}`
{{/if}}
{{#unless command}}
If no command was provided, ask the user what command they want to run.
{{/unless}}

### rebuild
Force rebuild the workbench image (pulls latest claude-code and MJ CLI):
```bash
docker compose -f docker/workbench/docker-compose.yml build --no-cache claude-dev && docker compose -f docker/workbench/docker-compose.yml up -d
```

### logs
Show recent logs from the containers:
```bash
docker compose -f docker/workbench/docker-compose.yml logs --tail=50
```

## Important Notes

- The `.env` file in `docker/workbench/` must exist before starting. If it doesn't, copy from `.env.example`.
- SQL Server data persists in the `sql-claude-data` Docker volume across restarts.
- Claude settings persist in the `claude-settings` Docker volume.
- The workbench auto-updates Claude Code and MJ CLI on every container start.
- SA password is `Claude2Sql99` (docker-internal only, disposable environment).
