# Docker Configurations

This directory contains Docker configurations for MemberJunction development and deployment.

## Directory

| Directory | Purpose | Audience |
|-----------|---------|----------|
| [MJAPI/](MJAPI/) | Production-ready MJAPI container with Flyway migrations, CodeGen, and PM2 | MJ users deploying the API server |
| [workbench/](workbench/) | Claude Code workbench with SQL Server for autonomous development and testing | MJ developers using Claude Code for automated tasks |

## Quick Start

### MJAPI (Production/Deployment)
```bash
docker build -f docker/MJAPI/Dockerfile -t memberjunction/api .
docker run -p 4000:4000 --env-file .env memberjunction/api
```

### Workbench (Development)
```bash
cd docker/workbench
cp .env.example .env        # Edit if you need to set ANTHROPIC_API_KEY
./start.sh                  # Builds and starts SQL Server + Claude Code container
docker exec -it claude-dev zsh
cc                          # Alias for claude --dangerously-skip-permissions
```

See each directory's README for detailed documentation.
