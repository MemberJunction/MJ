# MJAPI Docker Container

Production-ready Docker container for running the MemberJunction API server. Published with each MJ release so users can quickly spin up an MJAPI instance.

## What's Included

- **Node.js 24.x** runtime
- **Flyway 11.20.0** for database migrations
- **SQL Server tools** (sqlcmd, ODBC drivers)
- **PM2** process manager for Node.js
- **@memberjunction/cli** for migrations and code generation
- **SSH server** on port 2222 for remote debugging

## How It Works

The container runs an automated startup sequence via `entrypoint.sh`:

1. Starts SSH daemon (port 2222, for debugging)
2. Runs `mj migrate` to apply database migrations via Flyway
3. Runs `mj codegen` to generate TypeScript from the database schema
4. Starts MJAPI with PM2 on port 4000

## Building

From the **repository root** (not this directory):

```bash
docker build -f docker/MJAPI/Dockerfile -t memberjunction/api .
```

The build context must be the repo root because the Dockerfile copies `package.json`, `packages/MJAPI/`, `packages/GeneratedEntities/`, `packages/GeneratedActions/`, and `migrations/`.

## Configuration

All configuration is via environment variables, read by `docker.config.cjs`:

### Database
| Variable | Description | Default |
|----------|-------------|---------|
| `DB_HOST` | SQL Server hostname | — |
| `DB_PORT` | SQL Server port | `1433` |
| `DB_DATABASE` | Database name | — |
| `DB_USERNAME` | Database username | — |
| `DB_PASSWORD` | Database password | — |

### CodeGen
| Variable | Description | Default |
|----------|-------------|---------|
| `CODEGEN_DB_USERNAME` | Separate user for CodeGen (needs DDL rights) | falls back to `DB_USERNAME` |
| `CODEGEN_DB_PASSWORD` | Password for CodeGen user | falls back to `DB_PASSWORD` |

### Authentication
| Variable | Description |
|----------|-------------|
| `TENANT_ID` | Azure AD Tenant ID |
| `WEB_CLIENT_ID` | Azure AD Client ID |
| `AUTH0_DOMAIN` | Auth0 domain |
| `AUTH0_CLIENT_ID` | Auth0 Client ID |
| `OKTA_DOMAIN` | Okta domain |
| `OKTA_CLIENT_ID` | Okta Client ID |

### Server
| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` / `GRAPHQL_PORT` | GraphQL server port | `4000` |
| `GRAPHQL_ROOT_PATH` | GraphQL endpoint path | `/` |
| `AUTO_CREATE_NEW_USERS` | Auto-create users on first login | `false` |

## SSH Access

For debugging, SSH is available:

```bash
ssh root@<container-ip> -p 2222
# Password: Docker!
```

## Files

| File | Purpose |
|------|---------|
| `Dockerfile` | Multi-stage build definition |
| `entrypoint.sh` | Container startup script |
| `docker.config.cjs` | MJ configuration (reads env vars) |
| `sshd_config` | SSH server configuration |
