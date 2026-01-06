# MemberJunction Database Migration Guide

## Quick Start

### Running Migrations

#### For Clean Database Installs (v3.0+)

If you're starting with a **fresh/empty database**, use the v3-only migration:

```bash
# Run ONLY v3 migration (recommended for new databases)
npm run migrate:v3

# With verbose output
npm run migrate:v3:verbose
```

This runs only the v3 structure installation script, which creates the complete database from scratch without running v2 migrations.

#### For Existing Databases or All Migrations

If you have an existing database or need all migrations:

```bash
# Run all pending migrations (v2 and v3)
npm run migrate

# Run with verbose output
npm run migrate:verbose
```

#### Using MJCLI Directly

```bash
# Run all pending migrations
npx mj migrate

# Run with verbose output
npx mj migrate --verbose

# Run migrations from a specific version tag
npx mj migrate --tag v3.0.0
```

#### Using the Shell Script Directly

```bash
# Run all pending migrations
./scripts/migrate-database.sh

# Run ONLY v3 migrations (clean install)
./scripts/migrate-database.sh --v3-only

# Run ONLY v2 migrations (incremental updates)
./scripts/migrate-database.sh --v2-only

# Run with verbose output
./scripts/migrate-database.sh --verbose

# Run from specific version tag (fetches from GitHub)
./scripts/migrate-database.sh --tag v3.0.0

# Dry run (shows what would be executed)
./scripts/migrate-database.sh --dry-run
```

## Prerequisites

### 1. Environment Variables

Create a `.env` file in the project root with the following variables:

```bash
# Database Connection
DB_HOST=localhost
DB_PORT=1433
DB_DATABASE=YourDatabaseName
CODEGEN_DB_USERNAME=YourUsername
CODEGEN_DB_PASSWORD=YourPassword
DB_TRUST_SERVER_CERTIFICATE=true

# MemberJunction Core Schema (optional, defaults to __mj)
MJ_CORE_SCHEMA=__mj
```

### 2. Configuration File

Ensure your `mj.config.cjs` has the migration settings:

```javascript
module.exports = {
  // ... other config
  migrationsLocation: process.env.MIGRATIONS_LOCATION ?? 'filesystem:./migrations',
  mjCoreSchema: process.env.MJ_CORE_SCHEMA ?? '__mj',
  // ... other config
};
```

## Migration File Structure

```
migrations/
├── v2/               # Version 2.x migrations (incremental updates)
│   ├── V202401011200__v2.120.x_Description.sql
│   ├── V202401021430__v2.121.x_Description.sql
│   ├── R__RefreshMetadata.sql  # Repeatable migration
│   └── ...
└── v3/               # Version 3.x migrations (structure installation)
    ├── V20260101__v3.0.x.sql
    └── R__RefreshMetadata.sql  # Same repeatable migration (required for v3-only installs)
```

**Important**: Repeatable migrations (prefixed with `R__`) should exist in **both** v2 and v3 directories so they run regardless of which migration path is used.

## How Flyway Works

Flyway tracks which migrations have been applied using a special table called `flyway_schema_history`. It:

1. **Scans** the migrations folder for SQL files
2. **Compares** file names against the history table
3. **Executes** migrations that haven't been applied yet, in order
4. **Records** each successful migration in the history table

### Versioned Migrations

Migrations follow this naming convention:
```
V[YYYYMMDDHHMM]__v[VERSION].x_[DESCRIPTION].sql
```

Example: `V202601040900__v3.0.x_Initial_Structure.sql`

- `V` - Prefix for versioned migrations
- `202601040900` - Timestamp (YYYYMMDDHHMM) determines execution order
- `v3.0.x` - Version identifier
- `Initial_Structure` - Human-readable description

### Repeatable Migrations

Repeatable migrations run **every time** their checksum changes:
```
R__[DESCRIPTION].sql
```

Example: `R__RefreshMetadata.sql`

- `R__` - Prefix for repeatable migrations (double underscore)
- Runs after all versioned migrations
- Executes every time the file content changes
- Used for: refreshing views, updating metadata, recompiling procedures

**MemberJunction's R__RefreshMetadata.sql**:
- Recompiles all database views
- Syncs entity metadata with actual database schema
- Updates entity field information
- Essential after schema changes to keep metadata in sync

## Important Notes

### ⚠️ Version 3 Migrations

The v3 migration script (`V20260101__v3.0.x.sql`) is a **structure installation script** that creates:
- Database users (MJ_CodeGen, MJ_Connect)
- Security roles (cdp_BI, cdp_CodeGen, cdp_Developer, cdp_Integration, cdp_UI)
- Complete database schema structure

**Always backup your database before running v3 migrations!**

### Schema Placeholder

Migration files use `${flyway:defaultSchema}` as a placeholder that gets replaced with your configured schema (typically `__mj`):

```sql
ALTER TABLE ${flyway:defaultSchema}.TableName ADD ColumnName VARCHAR(100);
```

### One-Way Migrations

By default, migrations are **one-way only** (no automatic rollback). To undo a migration:
- Create a new migration that reverses the changes
- Restore from a database backup

### Migration Best Practices

1. **Test First**: Always test migrations on a development database
2. **Backup**: Create a database backup before running migrations
3. **Version Control**: Keep migrations in version control
4. **Never Modify**: Never modify a migration file after it's been applied
5. **Sequential**: Migrations run in order based on the timestamp prefix

## Troubleshooting

### "Migrations failed" Error

Check the error message for details. Common issues:

1. **Connection Failed**: Verify database credentials in `.env`
2. **Permission Denied**: Ensure user has proper database permissions
3. **Syntax Error**: Check SQL syntax in migration file
4. **Schema Mismatch**: Verify `MJ_CORE_SCHEMA` matches your database

### Viewing Migration History

Connect to your database and query:

```sql
SELECT * FROM flyway_schema_history ORDER BY installed_rank;
```

### Force Re-run a Migration

**Warning**: This is not recommended and can cause issues!

If you absolutely must re-run a migration:

1. Delete the entry from `flyway_schema_history`
2. Run the migration again

Better approach: Create a new migration to fix the issue.

## Advanced Usage

### Running Migrations from Remote Tags

The MJCLI migrate command can fetch migrations from GitHub tags:

```bash
# Run migrations from a specific release
npx mj migrate --tag v3.0.0

# This will:
# 1. Create a temporary directory
# 2. Clone the MJ repository at the specified tag
# 3. Use migrations from that version
# 4. Run the migrations
```

This is useful for:
- Upgrading to a specific version
- Deploying to production with a known release
- Testing migrations from different versions

### Configuration Options

In `mj.config.cjs`, you can configure:

```javascript
{
  migrationsLocation: 'filesystem:./migrations',  // Where to find migrations
  coreSchema: '__mj',                             // Database schema to use
  cleanDisabled: true,                            // Prevent Flyway clean (recommended)
  mjRepoUrl: 'https://github.com/MemberJunction/MJ.git'  // For remote tags
}
```

## Additional Resources

- [Flyway Documentation](https://documentation.red-gate.com/fd)
- [MemberJunction Migration Guidelines](./CLAUDE.md)
- [CodeGen Documentation](../packages/CodeGenLib/README.md)
