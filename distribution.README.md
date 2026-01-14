# MemberJunction Distribution

Welcome to MemberJunction! This distribution provides a complete, production-ready metadata-driven application framework.

## What's Included

This monorepo distribution includes:

### Applications
- **MJAPI** - GraphQL API server with comprehensive metadata management (`apps/MJAPI`)
- **MJExplorer** - Angular-based UI for data exploration and administration (`apps/MJExplorer`)

### Packages
- **GeneratedEntities** - Auto-generated TypeScript entity classes based on your database schema (`packages/GeneratedEntities`)
- **GeneratedActions** - Auto-generated action classes for workflow and automation (`packages/GeneratedActions`)

### Database & Scripts
- **migrations/** - Database migration scripts using Flyway
- **SQL Scripts/** - SQL views, stored procedures, and database objects

## Prerequisites

- **Node.js** 22.0.0 or higher
- **npm** 10.0.0 or higher
- **SQL Server** 2019 or higher (or Azure SQL Database)
- A SQL Server database (can be empty or existing)

## Quick Start

### 1. Extract the Distribution

Extract the zip file to your desired location:

```bash
unzip MemberJunction_Code_Bootstrap_*.zip -d /path/to/your/project
cd /path/to/your/project
```

### 2. Configure Your Environment

Choose one of two configuration methods:

#### Option A: Using install.config.json (Interactive Setup)

1. Edit `install.config.json` with your database and authentication settings
2. Run the interactive setup (this will configure the environment and run initial setup)

```bash
npm install
npm run setup
```

#### Option B: Using mj.config.cjs (Manual Setup)

1. Copy `.env.example` to `.env` (if provided) or create a new `.env` file
2. Edit `mj.config.cjs` with your configuration
3. Set environment variables in `.env`:

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=1433
DB_DATABASE=YourDatabase
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_TRUST_SERVER_CERTIFICATE=true

# CodeGen Database User (needs elevated permissions)
CODEGEN_DB_USERNAME=codegen_user
CODEGEN_DB_PASSWORD=codegen_password

# GraphQL Server
GRAPHQL_PORT=4000
GRAPHQL_ROOT_PATH=/

# Authentication (MSAL Example)
WEB_CLIENT_ID=your-client-id
TENANT_ID=your-tenant-id

# Or Auth0
# AUTH0_DOMAIN=your-domain.auth0.com
# AUTH0_CLIENT_ID=your-client-id
# AUTH0_CLIENT_SECRET=your-client-secret
```

### 3. Install Dependencies

```bash
npm install
```

This will install all dependencies for all packages in the monorepo.

### 4. Run Database Migrations

```bash
npm run mj:migrate
```

This creates all necessary MemberJunction metadata tables and core schema objects.

### 5. Run Code Generation

```bash
npm run mj:codegen
```

This generates:
- TypeScript entity classes from your database schema
- GraphQL API resolvers
- Angular UI components
- SQL views and stored procedures

### 6. Build All Packages

```bash
npm run build
```

Or build specific packages:

```bash
npm run build:generated    # Build GeneratedEntities and GeneratedActions
npm run build:api          # Build MJAPI only
npm run build:explorer     # Build MJExplorer only
```

### 7. Start the Application

Start both API and UI:

```bash
npm start
```

Or start individually:

```bash
npm run start:api          # Start GraphQL API on port 4000
npm run start:explorer     # Start Angular UI on port 4200
```

## Common Commands

| Command | Description |
|---------|-------------|
| `npm install` | Install all dependencies |
| `npm run build` | Build all packages in the monorepo |
| `npm start` | Start both API and Explorer |
| `npm run start:api` | Start GraphQL API server only |
| `npm run start:explorer` | Start Angular Explorer UI only |
| `npm run mj:migrate` | Run database migrations |
| `npm run mj:codegen` | Generate code from database schema |
| `npm run mj` | Run MemberJunction CLI commands |

## Directory Structure

```
.
├── package.json              # Root package.json with monorepo configuration
├── turbo.json               # Turbo build configuration
├── mj.config.cjs            # MemberJunction configuration
├── install.config.json      # Installation configuration template
├── migrations/              # Flyway database migrations
│   ├── v2/                  # Version 2 migrations
│   └── v3/                  # Version 3 migrations
├── SQL Scripts/             # SQL views, stored procedures
│   └── generated/           # Auto-generated SQL objects
├── apps/                    # Application packages
│   ├── MJAPI/              # GraphQL API server
│   └── MJExplorer/         # Angular UI application
└── packages/                # Library packages
    ├── GeneratedEntities/  # Generated entity classes
    └── GeneratedActions/   # Generated action classes
```

## Monorepo Structure

This is an **npm workspaces** monorepo using **Turbo** for build orchestration. Key benefits:

- **Unified Dependencies**: Run `npm install` once at the root
- **Smart Builds**: Turbo only rebuilds changed packages
- **Parallel Execution**: Multiple packages build simultaneously
- **Dependency Graph**: Packages build in correct order automatically

## Development Workflow

### After Making Database Changes

1. Run migrations (if you created new migration files):
   ```bash
   npm run mj:migrate
   ```

2. Run code generation to update generated code:
   ```bash
   npm run mj:codegen
   ```

3. Rebuild affected packages:
   ```bash
   npm run build
   ```

### Updating MemberJunction Packages

To update all MemberJunction packages to the latest published versions:

```bash
./Update_MemberJunction_Packages_To_Latest.ps1
```

Then run:

```bash
npm install
npm run build
```

## Configuration Files

- **mj.config.cjs** - Main configuration for CodeGen, MJAPI, and MJCLI
- **install.config.json** - Installation configuration template
- **.env** - Environment variables (create from .env.example)

## Authentication

MemberJunction supports multiple authentication providers:

- **MSAL** (Microsoft Entra ID / Azure AD)
- **Auth0**
- **Okta**

Configure your provider in `mj.config.cjs` and set the appropriate environment variables.

## Need Help?

- **Documentation**: [https://docs.memberjunction.com](https://docs.memberjunction.com)
- **GitHub**: [https://github.com/MemberJunction/MJ](https://github.com/MemberJunction/MJ)
- **Issues**: [https://github.com/MemberJunction/MJ/issues](https://github.com/MemberJunction/MJ/issues)

## License

ISC License - See LICENSE file for details
