Full environment reset and rebuild. Performs these steps IN ORDER — do NOT ask for confirmation, execute each step sequentially and report results as you go:

## Step 1 — Delete all CodeGen-generated files

Delete the following directories (use `rm -rf`):

- `SQL Scripts/generated`
- `packages/GeneratedActions/src/generated`
- `packages/MJExplorer/src/app/generated`
- `packages/MJCodeGenAPI/src/generated`
- `packages/MJCoreEntities/src/generated`
- `packages/ServerBootstrap/src/generated`
- `packages/Angular/Bootstrap/src/generated`
- `packages/Angular/Explorer/explorer-core/src/generated`
- `packages/Angular/Explorer/core-entity-forms/src/lib/generated`
- `packages/Angular/BootstrapLite/src/generated`
- `packages/MJServer/src/generated`
- `packages/MJAPI/src/generated`
- `packages/AI/A2AServer/src/generated`
- `packages/AI/MCPServer/src/generated`
- `packages/ServerBootstrapLite/src/generated`
- `packages/Actions/CoreActions/src/generated`
- `packages/GeneratedEntities/src/generated`

Also delete:
- `migrations/v5/CodeGen_Run_*.sql`
- `migrations/rsu/*.sql`

Report count of dirs and files removed.

## Step 2 — Recreate the database

Run `/Users/madhavsubramaniyam/test2.sql` using SA (MJ_CodeGen lacks CREATE DATABASE rights). Errors about ALTER DATABASE / DROP DATABASE are expected when Test55 doesn't pre-exist — ignore them:

```bash
sqlcmd -S localhost,1433 -U sa -P 'BlueCypress2026@' -i /Users/madhavsubramaniyam/test2.sql
```

Verify Test55 exists:
```bash
sqlcmd -S localhost,1433 -U sa -P 'BlueCypress2026@' -Q "SELECT name FROM sys.databases WHERE name='Test55'"
```

## Step 3 — Migrate

```bash
npx mj migrate
```

## Step 3b — Seed company record

```bash
sqlcmd -S localhost,1433 -U sa -P 'BlueCypress2026@' -i /Users/madhavsubramaniyam/seed-company.sql
```

Report "Company inserted" or "Company already exists".

## Step 4 — First CodeGen

```bash
npx mj codegen
```

## Step 5 — Push metadata

```bash
npx mj sync push --dir metadata
```

Report created/updated/unchanged totals.

## Step 6 — Second CodeGen

```bash
npx mj codegen
```

## Step 7 — Build

```bash
npm run build
```

Report tasks successful / total, or list any TypeScript errors.

---

If any step fails, stop and report the full error before continuing.
