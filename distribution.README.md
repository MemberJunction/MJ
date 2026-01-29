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

MemberJunction uses a **minimal configuration** approach - most settings have sensible defaults from the packages themselves, and you only need to configure what's specific to your environment.

Choose one of two configuration methods:

#### Option A: Using install.config.json (Interactive Setup)

1. Edit `install.config.json` with your database and authentication settings
2. Run the interactive setup (this will configure the environment and run initial setup)

```bash
npm install
npm run setup
```

#### Option B: Using Environment Variables (Recommended)

The simplest approach is to use a `.env` file. MemberJunction automatically loads configuration from environment variables:

1. Create a `.env` file in the root directory:

```bash
# Database Configuration (REQUIRED)
DB_HOST=localhost
DB_PORT=1433
DB_DATABASE=YourDatabase
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_TRUST_SERVER_CERTIFICATE=true

# CodeGen Database User (REQUIRED - needs elevated permissions for schema changes)
CODEGEN_DB_USERNAME=codegen_user
CODEGEN_DB_PASSWORD=codegen_password

# GraphQL Server (Optional - defaults shown)
GRAPHQL_PORT=4000
GRAPHQL_ROOT_PATH=/
GRAPHQL_BASE_URL=http://localhost

# Authentication (Choose one provider)
# Option 1: Microsoft Azure/Entra ID (MSAL)
WEB_CLIENT_ID=your-azure-client-id
TENANT_ID=your-azure-tenant-id

# Option 2: Auth0
# AUTH0_DOMAIN=your-domain.auth0.com
# AUTH0_CLIENT_ID=your-auth0-client-id
# AUTH0_CLIENT_SECRET=your-auth0-client-secret

# Option 3: Okta
# OKTA_DOMAIN=your-domain.okta.com
# OKTA_CLIENT_ID=your-okta-client-id
# OKTA_CLIENT_SECRET=your-okta-client-secret
```

2. **That's it!** The included `mj.config.cjs` uses MemberJunction's minimal configuration system - it already references these environment variables and all other settings come from sensible defaults in the framework packages.

#### Option C: Customizing mj.config.cjs

If you need to override specific settings beyond environment variables, edit `mj.config.cjs`. The file includes extensive comments showing all available options and their defaults. You only need to uncomment and modify settings you want to override.

### 3. **Install Dependencies** ⚠️ IMPORTANT

**This step must be completed before any other commands.**

```bash
npm install
```

✅ This command now works perfectly without any flags!
✅ Installs all dependencies with pinned versions for reproducible builds.

**Note**: Do not use `--legacy-peer-deps` - it's no longer needed!

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

MemberJunction uses a **minimal configuration** approach where most settings come from package defaults:

- **mj.config.cjs** - Minimal configuration file with CodeGen settings and optional overrides
  - Most database/server settings come from `DEFAULT_SERVER_CONFIG` in `@memberjunction/server`
  - Authentication providers auto-configure from environment variables
  - Only uncomment settings you need to override

- **.env** - Environment variables (recommended approach)
  - Required: Database connection settings (`DB_HOST`, `DB_DATABASE`, `DB_USERNAME`, etc.)
  - Required: CodeGen credentials (`CODEGEN_DB_USERNAME`, `CODEGEN_DB_PASSWORD`)
  - Optional: Server settings (`GRAPHQL_PORT`, `GRAPHQL_ROOT_PATH`)
  - Optional: Auth provider settings (`TENANT_ID`/`WEB_CLIENT_ID` or `AUTH0_DOMAIN`/`AUTH0_CLIENT_ID`)

- **install.config.json** - Interactive installation configuration template
  - Alternative to manual `.env` setup
  - Run `npm run setup` after editing

### Benefits of Minimal Configuration (New in v3.0!)

MemberJunction v3.0 introduces a minimal configuration system that dramatically simplifies deployment:

- **Less Boilerplate**: Typical deployments need only ~10 environment variables instead of 250+ lines of config
- **Clearer Intent**: Only see settings you've customized - everything else uses sensible defaults
- **Automatic Defaults**: Package updates can improve defaults without requiring config changes
- **Environment-First**: Follows 12-factor app principles for modern cloud deployments
- **Self-Documenting**: Config file includes extensive comments showing all available options

## Authentication

MemberJunction supports multiple authentication providers with automatic configuration from environment variables:

### Microsoft Azure / Entra ID (MSAL)
Set these environment variables in `.env`:
```bash
TENANT_ID=your-azure-tenant-id
WEB_CLIENT_ID=your-azure-client-id
```

### Auth0
Set these environment variables in `.env`:
```bash
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_CLIENT_ID=your-auth0-client-id
AUTH0_CLIENT_SECRET=your-auth0-client-secret  # Optional
```

### Okta
Set these environment variables in `.env`:
```bash
OKTA_DOMAIN=your-domain.okta.com
OKTA_CLIENT_ID=your-okta-client-id
OKTA_CLIENT_SECRET=your-okta-client-secret  # Optional
```

Authentication providers are automatically configured when their environment variables are present. You can enable multiple providers simultaneously - MemberJunction will accept tokens from any configured provider.

## Need Help?

- **Documentation**: [https://docs.memberjunction.com](https://docs.memberjunction.com)
- **GitHub**: [https://github.com/MemberJunction/MJ](https://github.com/MemberJunction/MJ)
- **Issues**: [https://github.com/MemberJunction/MJ/issues](https://github.com/MemberJunction/MJ/issues)

## License

ISC License - See LICENSE file for details
