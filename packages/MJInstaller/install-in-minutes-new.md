# Installation in Minutes

MemberJunction is an open-source platform designed to help organizations efficiently manage data, build applications, and leverage AI for better insights. This guide walks you through the complete setup process using the automated installer, which handles downloading, configuring, building, and validating your MemberJunction installation.

## Prerequisites

Before running the installer, make sure you have the following ready:

1. **SQL Server** — SQL Server 2022 or above. Can be a local SQL Server instance (including Docker) or Azure SQL. You do **not** need to create a database ahead of time — the installer generates a setup script that handles that.
   > **Note:** If using a local SQL Server with a self-signed certificate (common with Docker or default installations), the installer will ask if you want to trust the server certificate. Azure SQL handles encryption automatically, so this step is not needed for Azure SQL.

2. **Node.js 22 or above** (Node.js 24 recommended) — Install from [nodejs.org](https://nodejs.org). Verify with:
   ```
   node --version
   ```

3. **npm** — Comes with Node.js. Verify with:
   ```
   npm --version
   ```

4. **At least 2 GB of free disk space** — The installer checks this automatically.

5. **A working directory** — Create an empty directory on your computer where MemberJunction will be installed. We recommend making this a clone of a remote Git repository (GitHub, Bitbucket, etc.) so you can track your customizations.

## Steps

### 1. Install the MJ CLI

Install the MemberJunction CLI tool globally:

```
npm install --global @memberjunction/cli
```

Verify the installation:

```
mj version
```

### 2. Run the Installer

Navigate to your empty working directory and run:

```
mj install
```

The installer runs through 9 phases automatically. Here's what happens at each step:

1. **Preflight** — Checks your environment (Node.js version, disk space, port availability, SQL Server connectivity)
2. **Scaffold** — Lets you choose a MemberJunction release version, then downloads and extracts the release package from GitHub
3. **Configure** — Prompts you for database credentials, ports, and authentication settings, then generates configuration files (`.env`, `mj.config.cjs`, and Explorer environment files)
4. **Database** — Generates SQL setup scripts for creating your database, logins, users, and permissions. **You must run these scripts manually** (see [Running the Database Scripts](#running-the-database-scripts) below)
5. **Platform Compatibility** — Patches npm scripts for your operating system (e.g., adds `cross-env` on Windows)
6. **Dependencies** — Runs `npm install` and `npm run build` to install and compile all packages
7. **Migrate** — Runs database migrations to create the `__mj` schema with all MemberJunction tables, views, stored procedures, and seed data
8. **CodeGen** — Generates TypeScript entity classes, SQL stored procedures, Angular forms, and class registration manifests for your specific database
9. **Smoke Test** — Starts MJAPI and MJExplorer to verify they launch correctly, then shuts them down

#### Configuration Prompts

During the configure step, the installer will ask for:

| Setting | Default | Description |
|---------|---------|-------------|
| Database hostname | `localhost` | Your SQL Server address |
| Database port | `1433` | SQL Server TCP port |
| Database name | `MemberJunction` | Target database name |
| Trust self-signed certificate | No | Set to Yes for local SQL Server instances |
| CodeGen login | `MJ_CodeGen` | A privileged SQL login for schema management |
| CodeGen password | *(none)* | Password for the CodeGen login |
| API login | `MJ_Connect` | A SQL login for application data access |
| API password | *(none)* | Password for the API login |
| GraphQL API port | `4000` | Port for the MJAPI server |
| Explorer UI port | `4200` | Port for the MJExplorer dev server |
| Authentication provider | None | Choose Microsoft Entra (MSAL), Auth0, or skip for now |

If you choose an authentication provider, you'll also be prompted for the provider-specific settings (Client ID, Tenant ID, etc.).

> **Note on Authentication:** If you skip authentication setup, MJAPI will start but MJExplorer will not be fully functional until you configure an auth provider. The installer will warn you about this. See [Configuring Authentication](#configuring-authentication) below.

### 3. Run the Database Scripts

After the configure step completes, the installer generates two SQL scripts in your working directory:

- **`mj-db-setup.sql`** — Creates the database (if it doesn't exist), the `__mj` schema, SQL Server logins, database users, and assigns permissions
- **`mj-db-validate.sql`** — Verifies that the setup was applied correctly

**You need to run these scripts manually** using SQL Server Management Studio (SSMS), Azure Data Studio, or any SQL client:

1. Connect to your SQL Server as an administrator (e.g., `sa` or a login with `sysadmin` role)
2. Open and execute `mj-db-setup.sql`
3. Optionally, run `mj-db-validate.sql` to confirm everything was created correctly

> **Why manual?** Creating server-level logins requires elevated SQL Server permissions (`sysadmin` or `securityadmin`) that the installer shouldn't hold. Running the script manually lets you review and approve the changes.

Once the scripts are complete, the installer will continue with the remaining phases (dependencies, migrations, codegen, and smoke test).

### 4. Verify Your Installation

Once the installer completes all 9 phases, it will have already run a smoke test by starting MJAPI and MJExplorer to confirm they launch. If everything passed, your installation is ready.

To start the services for regular use:

**Start MJAPI** (in one terminal window):
```
npm run start:api
```

**Start MJExplorer** (in a second terminal window, after MJAPI is running):
```
npm run start:explorer
```

Then open your browser to `http://localhost:4200` (or whatever port you configured). You should see the MJExplorer login page.

> **Important:** Always start MJAPI before MJExplorer — the Explorer needs the API server to be running.

> MJExplorer is a useful application to test your installation. Even if you don't plan to use it in production, browsing some of your data through it helps validate that everything is set up correctly.

### 5. What to Do If Something Goes Wrong

#### Resume a Failed Install

If the installer fails partway through, just run it again:

```
mj install
```

The installer saves a checkpoint file (`.mj-install-state.json`) after each phase. On re-run, it automatically resumes from where it left off — you won't have to re-download or re-configure anything.

If there's an error based on a partial broken installation you can start from the beginning. To start completely fresh instead of resuming:

```
mj install --no-resume
```

#### Run Diagnostics

If you're having trouble with an existing installation, the doctor command can help identify issues:

```
mj doctor
```

This checks your environment for common issues: Node.js version, SQL Server connectivity, disk space, configuration files, authentication configuration, and known compatibility problems.

#### Generate a Diagnostic Report

If you need to share your installation state with the MemberJunction team for support, generate a diagnostic report:

```
mj doctor --report
```

This creates a `mj-diagnostic-report.md` file in your install directory containing your environment info, install state, diagnostic check results, key file status, and a sanitized view of your configuration. **All passwords, API keys, and secrets are automatically redacted.**

For a more comprehensive report that includes configuration file snapshots and service startup log capture, use the extended report:

```
mj doctor --report_extended
```

This creates a `mj-diagnostic-report-extended.md` file with everything in the basic report plus:
- **Configuration file snapshots** — Sanitized copies of your `.env` files, Explorer environment files, and `mj.config.cjs`
- **Service startup logs** — Briefly starts MJAPI and MJExplorer to capture their startup output, then shuts them down. This detects runtime errors like missing modules, database connectivity failures, or authentication issues.

The extended report takes longer to generate (~1-3 minutes) because it needs to start and observe the services. Both report files can coexist in the same directory — running `--report_extended` does not overwrite a previously generated `--report`.

> **Tip:** When requesting installation support, always include the extended report if possible — it gives the support team the most complete picture of your setup.

---

## Non-Interactive Installation

For automated or repeat installations, you can skip all prompts:

```
mj install --yes
```

This auto-selects the latest stable release and uses default values for all settings. You can combine it with a config file to provide your specific values:

```
mj install --yes --config ./install.config.json
```

### Config File Format

Create an `install.config.json` to save your settings for reuse:

```json
{
  "DatabaseHost": "localhost",
  "DatabasePort": 1433,
  "DatabaseName": "MemberJunction",
  "DatabaseTrustCert": true,
  "CodeGenUser": "MJ_CodeGen",
  "CodeGenPassword": "YourStrongPassword1!",
  "APIUser": "MJ_Connect",
  "APIPassword": "YourStrongPassword2!",
  "APIPort": 4000,
  "ExplorerPort": 4200,
  "AuthProvider": "entra",
  "AuthProviderValues": {
    "TenantID": "your-tenant-id",
    "ClientID": "your-client-id"
  }
}
```

### Environment Variables

You can also provide configuration via environment variables (useful for CI/CD):

| Variable | Maps To |
|----------|---------|
| `MJ_INSTALL_DB_HOST` | Database hostname |
| `MJ_INSTALL_DB_PORT` | Database port |
| `MJ_INSTALL_DB_NAME` | Database name |
| `MJ_INSTALL_DB_TRUST_CERT` | Trust self-signed cert (`true`/`false`) |
| `MJ_INSTALL_CODEGEN_USER` | CodeGen SQL login |
| `MJ_INSTALL_CODEGEN_PASSWORD` | CodeGen password |
| `MJ_INSTALL_API_USER` | API SQL login |
| `MJ_INSTALL_API_PASSWORD` | API password |
| `MJ_INSTALL_API_PORT` | GraphQL API port |
| `MJ_INSTALL_EXPLORER_PORT` | Explorer UI port |
| `MJ_INSTALL_AUTH_PROVIDER` | Auth provider (`entra`, `auth0`, `none`) |
| `MJ_INSTALL_ENTRA_TENANT_ID` | Entra Tenant ID |
| `MJ_INSTALL_ENTRA_CLIENT_ID` | Entra Client ID |
| `MJ_INSTALL_AUTH0_DOMAIN` | Auth0 Domain |
| `MJ_INSTALL_AUTH0_CLIENT_ID` | Auth0 Client ID |
| `MJ_INSTALL_AUTH0_CLIENT_SECRET` | Auth0 Client Secret |
| `MJ_INSTALL_OPENAI_KEY` | OpenAI API Key |
| `MJ_INSTALL_ANTHROPIC_KEY` | Anthropic API Key |
| `MJ_INSTALL_MISTRAL_KEY` | Mistral API Key |

---

## Additional Options

### Install a Specific Version

```
mj install -t v5.9.0
```

### Fast Mode

Skip the smoke test and optimize post-codegen steps (saves 2-3 minutes). Re-run without `--fast` if you encounter issues:

```
mj install --fast
```

### Skip Database Phases

If your database is already set up and you only need to rebuild the application:

```
mj install --skip-db
```

### Skip Smoke Test

If you don't want the installer to start MJAPI and MJExplorer at the end:

```
mj install --skip-start
```

### Dry Run

See the install plan without actually executing anything:

```
mj install --dry-run
```

### Verbose Output

Show detailed output for debugging:

```
mj install --verbose
```

---

## Configuring Authentication

MJExplorer requires an authentication provider to function. MemberJunction supports two providers:

### Microsoft Entra (MSAL)

1. Register an application in [Azure Portal > App Registrations](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
2. Note the **Application (client) ID** and **Directory (tenant) ID**
3. Under **Authentication**, add `http://localhost:4200` as a redirect URI (Single-page application type)
4. Provide these values during installer configuration, or edit the files manually afterward:

**`.env`** (in the root directory and in `apps/MJAPI/.env`):
```
TENANT_ID=your-tenant-id
WEB_CLIENT_ID=your-client-id
```

**Explorer environment files** (in `apps/MJExplorer/src/environments/environment.ts` and `environment.development.ts`):
```typescript
AUTH_TYPE: 'msal' as const,
CLIENT_ID: 'your-client-id',
TENANT_ID: 'your-tenant-id',
CLIENT_AUTHORITY: 'https://login.microsoftonline.com/your-tenant-id',
```

### Auth0

1. Create an application in your [Auth0 Dashboard](https://manage.auth0.com/)
2. Note the **Domain**, **Client ID**, and **Client Secret**
3. Under **Settings > Application URIs**, add `http://localhost:4200` as an Allowed Callback URL
4. Provide these values during installer configuration, or edit the files manually afterward:

**`.env`**:
```
AUTH0_DOMAIN=your-domain.us.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
```

**Explorer environment files**:
```typescript
AUTH_TYPE: 'auth0' as const,
AUTH0_DOMAIN: 'your-domain.us.auth0.com',
AUTH0_CLIENTID: 'your-client-id',
```

> **Tip:** If you skipped authentication during install and want to set it up later, edit the files listed above and restart both MJAPI and MJExplorer.

---

## Troubleshooting

### MJExplorer shows "Missing required environment variable: CLIENT_ID"

Authentication is not configured. See [Configuring Authentication](#configuring-authentication) above.

### MJExplorer is stuck on the loading screen after a page refresh

This usually means the MSAL token cache in your browser has expired. Open your browser's DevTools, go to **Application > Storage**, and clear **Local Storage** and **Session Storage** for `localhost:4200`. Then refresh the page.

### npm install fails with ERESOLVE errors

The installer automatically retries with `--legacy-peer-deps`. If it still fails, check that you're using Node.js 22 or above (24 recommended).

### Build fails for generated packages

This is expected on a fresh install — packages like `mj_generatedentities` and `mj_generatedactions` need CodeGen to run first. The installer handles this automatically by tolerating these failures and regenerating the packages during the CodeGen phase.

### Database migrations fail

Make sure you ran the `mj-db-setup.sql` script (generated during the database phase) before the installer reached the migration step. The migrations need the database, schema, and SQL logins to already exist.

### The installer failed and I want to start over

```
mj install --no-resume
```

This ignores any saved checkpoint and runs the full installation from scratch.

### Ports 4000 or 4200 are already in use

Either stop the processes using those ports, or configure different ports during installation (or via `install.config.json`).

### Smoke test warnings

The smoke test at the end is non-blocking — if MJAPI or MJExplorer fail to start during the smoke test, the installer will report warnings but still mark the installation as complete. You can debug startup issues by running the services manually with `npm run start:api` and `npm run start:explorer`.
