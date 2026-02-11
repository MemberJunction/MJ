# MJ Open App Specification

**Feature Branch**: `app-manifest-spec`
**Created**: 2026-02-11
**Status**: Draft
**Authors**: MemberJunction Team

---

## 1. Overview

The **MJ Open App** specification defines a standard for packaging, distributing, and installing self-contained applications that run on the MemberJunction platform. An "app" is a deployable unit consisting of database schema, metadata, and npm packages — published as a GitHub repository with tagged releases.

### Goals

1. **Standardized packaging** — Any developer can create and distribute an MJ app using a well-defined manifest format.
2. **Schema isolation** — Each app owns a dedicated database schema, preventing collisions with MJ core (`__mj`) or other apps.
3. **Version management** — Apps use semver via GitHub release tags. Migrations manage schema evolution across versions.
4. **Metadata portability** — App metadata (entities, actions, prompts, agents, dashboards, etc.) is packaged using the existing mj-sync format and pushed into the target MJ installation at install time.
5. **npm integration** — App code ships as npm packages (public or private registry) and integrates with MJ's class registration manifest system.
6. **CLI-driven lifecycle** — `mj app install`, `mj app upgrade`, `mj app remove` commands handle the full lifecycle.
7. **MJ Central compatibility** — The spec enables a hosted registry (MJ Central) to wrap discovery, ratings, and UI around the open standard.

### Non-Goals

- Runtime app sandboxing or permission isolation (apps run with full MJ server privileges)
- Multi-tenancy within a single app (handled at the MJ platform level)
- Hot-swapping apps without server restart
- Paid app licensing enforcement (MJ Central concern, not spec concern)

---

## 2. Terminology

| Term | Definition |
|------|-----------|
| **App** | A distributable unit of functionality for MemberJunction, defined by a manifest |
| **App Manifest** | A `mj-app.json` file at the repository root describing the app |
| **App Schema** | The dedicated database schema owned by the app (e.g., `crm`, `helpdesk`) |
| **App Version** | A semver version corresponding to a GitHub release tag |
| **App Registry** | A service (like MJ Central) that indexes available apps and their versions |
| **Core Schema** | The `__mj` schema where MemberJunction core entities live |
| **Consumer** | An MJ installation that installs and runs apps |
| **Publisher** | The developer or organization that creates and maintains an app |

---

## 3. Repository Requirements

An MJ Open App is a **GitHub repository** (public or private) that conforms to the following structure:

```
my-mj-app/
├── mj-app.json                    # App manifest (REQUIRED)
├── migrations/                     # Database migrations (REQUIRED if app has schema)
│   ├── V202602010000__v1.0.x__Initial_Schema.sql
│   ├── V202603150000__v1.1.x__Add_Status_Column.sql
│   └── ...
├── metadata/                       # mj-sync metadata files (REQUIRED)
│   ├── .mj-sync.json              # Sync configuration with directoryOrder
│   ├── entities/                   # Entity metadata registrations
│   ├── actions/                    # Action definitions
│   ├── prompts/                    # AI prompt definitions
│   │   └── templates/             # Prompt template content
│   ├── agents/                     # AI agent definitions
│   ├── applications/               # Application nav definitions
│   ├── dashboards/                 # Dashboard definitions
│   └── ...                         # Any mj-sync entity directories
├── packages/                       # Source code (OPTIONAL for closed-source)
│   ├── server/                     # Server-side packages
│   └── client/                     # Client-side packages (Angular, etc.)
├── LICENSE                         # License file (RECOMMENDED)
├── README.md                       # Documentation (RECOMMENDED)
└── CHANGELOG.md                    # Version history (RECOMMENDED)
```

### 3.1 Versioning via GitHub Releases

Apps are versioned through **GitHub release tags** using semver:

- Tags MUST use the format `v{MAJOR}.{MINOR}.{PATCH}` (e.g., `v1.0.0`, `v1.2.3`)
- Pre-release tags MAY use suffixes: `v1.0.0-beta.1`, `v1.0.0-rc.1`
- The `mj-app.json` manifest MUST contain a `version` field matching the release tag
- Each tagged release represents a complete, installable snapshot of the app

### 3.2 Private Repositories

Private repositories are fully supported. The consumer must configure GitHub authentication:

- **GitHub Personal Access Token (PAT)** — stored in `mj.config.cjs` or environment variable
- **GitHub App Installation Token** — for organization-managed access
- **SSH Key** — for clone-based access

The CLI will use the configured auth when fetching manifests and release assets from private repos.

---

## 4. App Manifest (`mj-app.json`)

The manifest is a JSON file at the repository root. It is the single source of truth for what the app is, what it contains, and how to install it.

### 4.1 Full Schema

```jsonc
{
  // ── Identity ──────────────────────────────────────────────
  "$schema": "https://schema.memberjunction.org/mj-app/v1.json",
  "name": "acme-crm",                          // REQUIRED - unique identifier (lowercase, hyphens)
  "displayName": "Acme CRM",                   // REQUIRED - human-readable name
  "description": "Customer relationship management for MemberJunction",  // REQUIRED
  "version": "1.2.0",                          // REQUIRED - semver, must match release tag
  "license": "MIT",                             // RECOMMENDED - SPDX identifier
  "icon": "fa-solid fa-handshake",              // RECOMMENDED - Font Awesome icon class
  "color": "#2196f3",                           // OPTIONAL - hex color for UI theming

  // ── Publisher ─────────────────────────────────────────────
  "publisher": {                                // REQUIRED
    "name": "Acme Corporation",                 // REQUIRED
    "email": "dev@acme.com",                    // OPTIONAL
    "url": "https://acme.com"                   // OPTIONAL
  },

  // ── Repository ────────────────────────────────────────────
  "repository": "https://github.com/acme/mj-crm",  // REQUIRED - GitHub repo URL

  // ── MJ Compatibility ─────────────────────────────────────
  "mjVersionRange": ">=4.0.0 <5.0.0",          // REQUIRED - semver range of compatible MJ versions

  // ── Database Schema ───────────────────────────────────────
  "schema": {                                   // REQUIRED if app has database objects
    "name": "acme_crm",                         // REQUIRED - SQL schema name (unique per app)
    "createIfNotExists": true                   // OPTIONAL - default: true
  },

  // ── Migrations ────────────────────────────────────────────
  "migrations": {                               // REQUIRED if app has database objects
    "directory": "migrations",                  // OPTIONAL - default: "migrations"
    "engine": "flyway"                          // OPTIONAL - default: "flyway" (only supported engine)
  },

  // ── Metadata ──────────────────────────────────────────────
  "metadata": {                                 // REQUIRED
    "directory": "metadata",                    // OPTIONAL - default: "metadata"
    "schemaAutoAddEntities": true               // OPTIONAL - auto-register entities in app's Application
  },

  // ── NPM Packages ─────────────────────────────────────────
  "packages": {                                 // REQUIRED
    "registry": "https://registry.npmjs.org",   // OPTIONAL - default: npm public registry
    "server": [                                 // Server-side packages
      {
        "name": "@acme/mj-crm-server",
        "role": "bootstrap",                    // bootstrap | actions | engine | provider | library
        "classManifest": true                   // Whether package contains @RegisterClass decorators
      },
      {
        "name": "@acme/mj-crm-actions",
        "role": "actions",
        "classManifest": true
      }
    ],
    "client": [                                 // Client-side packages (Angular)
      {
        "name": "@acme/mj-crm-ng",
        "role": "module",                       // module | components | library
        "classManifest": true
      }
    ],
    "shared": [                                 // Packages used by both server and client
      {
        "name": "@acme/mj-crm-types",
        "role": "library",
        "classManifest": false
      }
    ]
  },

  // ── Entry Points ──────────────────────────────────────────
  "entryPoints": {                              // REQUIRED if packages have classManifest: true
    "server": {
      "bootstrap": "@acme/mj-crm-server",      // Package to import for server-side initialization
      "manifestExport": "CLASS_REGISTRATIONS"   // Named export containing class registrations
    },
    "client": {
      "module": "@acme/mj-crm-ng",             // Angular module to import
      "manifestExport": "CLASS_REGISTRATIONS"
    }
  },

  // ── App Dependencies ──────────────────────────────────────
  "dependencies": {                             // OPTIONAL - other MJ apps this app requires
    "acme-billing": ">=1.0.0",                  // App name → semver range
    "acme-contacts": "^2.0.0"
  },

  // ── Code Visibility ───────────────────────────────────────
  "code": {                                     // OPTIONAL - defaults to closed-source
    "visibility": "public",                     // public | private
    "sourceDirectory": "packages"               // Where source code lives (informational only)
  },

  // ── Configuration Schema ──────────────────────────────────
  "configuration": {                            // OPTIONAL - app-specific config schema
    "schema": {                                 // JSON Schema for app config section in mj.config.cjs
      "type": "object",
      "properties": {
        "apiEndpoint": {
          "type": "string",
          "description": "External CRM API endpoint"
        },
        "syncInterval": {
          "type": "integer",
          "description": "Sync interval in minutes",
          "default": 60
        }
      }
    }
  },

  // ── Hooks ─────────────────────────────────────────────────
  "hooks": {                                    // OPTIONAL - lifecycle hooks
    "postInstall": "node scripts/post-install.js",
    "postUpgrade": "node scripts/post-upgrade.js",
    "preRemove": "node scripts/pre-remove.js"
  }
}
```

### 4.2 Field Reference

#### Identity Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string | No | JSON Schema URL for validation |
| `name` | string | Yes | Unique app identifier. Lowercase alphanumeric + hyphens. Max 64 chars. Must be globally unique across MJ Central. |
| `displayName` | string | Yes | Human-readable name for UI display |
| `description` | string | Yes | Short description (max 500 chars) |
| `version` | string | Yes | Semver version. MUST match the GitHub release tag. |
| `license` | string | No | SPDX license identifier |
| `icon` | string | No | Font Awesome icon class for UI |
| `color` | string | No | Hex color string for UI theming |

#### Publisher Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `publisher.name` | string | Yes | Publisher display name |
| `publisher.email` | string | No | Contact email |
| `publisher.url` | string | No | Publisher website |

#### Compatibility

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mjVersionRange` | string | Yes | Semver range of compatible MJ versions (e.g., `">=4.0.0 <5.0.0"`) |
| `dependencies` | object | No | Map of app name to semver range for required peer apps |

#### Database Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schema.name` | string | Yes (if app has DB) | SQL Server schema name. Must be unique. Convention: publisher prefix + app name with underscores. |
| `schema.createIfNotExists` | boolean | No | Whether the CLI should create the schema. Default: `true`. |

#### Migrations

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `migrations.directory` | string | No | Relative path to migrations. Default: `"migrations"`. |
| `migrations.engine` | string | No | Migration engine. Currently only `"flyway"`. Default: `"flyway"`. |

#### Packages

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `packages.registry` | string | No | npm registry URL. Default: public npm. |
| `packages.server` | array | No | Server-side npm packages |
| `packages.client` | array | No | Client-side npm packages |
| `packages.shared` | array | No | Packages used by both server and client |

Each package entry:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | npm package name (e.g., `@acme/mj-crm-server`) |
| `role` | string | Yes | Package role: `bootstrap`, `actions`, `engine`, `provider`, `module`, `components`, `library` |
| `classManifest` | boolean | No | Whether package contains `@RegisterClass` decorators. Default: `false`. |

---

## 5. Database Schema Isolation

### 5.1 Design Principles

Each app operates in its own SQL Server schema, providing:

- **Namespace isolation** — No table name collisions between apps or with MJ core
- **Clear ownership** — Easy to identify which tables belong to which app
- **Clean removal** — Dropping the schema removes all app database objects
- **Independent migrations** — Each app manages its own migration history

### 5.2 Schema Naming Convention

```
{publisher}_{appname}
```

Examples:
- `acme_crm` — Acme's CRM app
- `acme_helpdesk` — Acme's helpdesk app
- `oss_analytics` — Open-source analytics app

Rules:
- Lowercase alphanumeric + underscores only
- Must not start with `__` (reserved for MJ system schemas)
- Must not collide with SQL Server reserved schema names (`dbo`, `sys`, `guest`, etc.)
- Max 128 characters (SQL Server limit)

### 5.3 Cross-Schema References

Apps commonly need to reference MJ core entities (Users, Employees, etc.). This is done through standard foreign keys:

```sql
CREATE TABLE ${flyway:defaultSchema}.Contact (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    -- Reference to MJ core entity
    OwnerUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_Contact PRIMARY KEY (ID),
    CONSTRAINT FK_Contact_User FOREIGN KEY (OwnerUserID)
        REFERENCES __mj.[User](ID)
);
```

**Rules for cross-schema references:**
- Apps MAY reference `__mj` schema entities via foreign keys
- Apps MAY reference other installed app schemas (declared in `dependencies`)
- Apps MUST NOT modify tables in `__mj` or other app schemas
- The `__mj` schema reference is always literal (not a placeholder) since it is the well-known core schema

### 5.4 Entity Registration with MJ Core

When an app creates tables in its schema, those tables must be registered as MJ entities so they participate in the metadata system (RunView, entity objects, CodeGen, etc.). This happens through the metadata sync step:

1. App's `metadata/entities/` directory declares entity metadata
2. `mj sync push` registers entities in the MJ `Entity` and `EntityField` tables
3. CodeGen runs to generate TypeScript classes, stored procedures, and views
4. The app's entities are now fully functional MJ entities, just living in a different schema

The `schemaAutoAddEntities` manifest flag controls whether new entities are automatically added to the app's Application record.

---

## 6. Migrations

### 6.1 Flyway Integration

App migrations follow the same Flyway conventions as MJ core, with one key difference: **the default schema is the app's schema**, not `__mj`.

Migration files use the standard naming convention:
```
V{YYYYMMDDHHMM}__v{VERSION}.x_{DESCRIPTION}.sql
```

Example:
```
V202602010000__v1.0.x__Initial_Schema.sql
V202602150000__v1.0.x__Add_Contact_Status.sql
V202603010000__v1.1.x__Add_Deal_Pipeline.sql
```

### 6.2 Schema Placeholder

Migrations MUST use `${flyway:defaultSchema}` for the app schema:

```sql
CREATE TABLE ${flyway:defaultSchema}.Contact (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Email NVARCHAR(255) NULL,
    CONSTRAINT PK_Contact PRIMARY KEY (ID)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'CRM contacts managed by Acme CRM app',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'Contact';
GO
```

When the CLI runs migrations, it sets `flyway.defaultSchema` to the app's schema name from the manifest.

### 6.3 Flyway History Table

Each app gets its own Flyway history table within its schema:

```
acme_crm.flyway_schema_history
```

This keeps migration history isolated per app and allows independent version tracking.

### 6.4 Migration Rules

All MJ migration rules apply (see `/migrations/CLAUDE.md`), plus:

1. **Use `${flyway:defaultSchema}` for app tables** — never hardcode the schema name
2. **Use `__mj` literally for core references** — foreign keys to MJ core use the literal `__mj` schema
3. **Never modify `__mj` objects** — apps must not ALTER, DROP, or INSERT into core schema tables
4. **Hardcode UUIDs** — same as MJ core, use declared UUIDs, not `NEWID()`
5. **No `__mj_` timestamp columns** — CodeGen adds these automatically
6. **No FK indexes** — CodeGen creates these automatically

### 6.5 Baseline Migrations

For major version jumps, apps MAY include a baseline migration using the Flyway `B` prefix:

```
B202602010000__v2.0_Baseline.sql    # Complete schema for fresh v2.0 installs
V202602150000__v2.1.x__Add_Feature.sql
```

This allows new installations to start from the baseline rather than replaying all historical migrations.

---

## 7. Metadata Packaging

### 7.1 mj-sync Format

App metadata uses the exact same mj-sync format as MJ core metadata (see Section 3 research above). The app's `metadata/` directory mirrors the structure used in `/metadata/` at the MJ repo root.

### 7.2 Directory Structure

```
metadata/
├── .mj-sync.json                   # Root sync config with directoryOrder
├── entities/
│   ├── .mj-sync.json
│   └── .crm-entities.json          # Entity registrations for app tables
├── actions/
│   ├── .mj-sync.json
│   ├── .crm-actions.json
│   └── templates/
│       └── sync-contacts.md
├── prompts/
│   ├── .mj-sync.json
│   ├── .crm-prompts.json
│   └── templates/
│       └── contact-summary.md
├── agents/
│   ├── .mj-sync.json
│   └── .crm-agents.json
├── applications/
│   ├── .mj-sync.json
│   └── .crm-application.json       # App's MJ Application with nav items
├── dashboards/
│   ├── .mj-sync.json
│   └── .crm-dashboards.json
└── scheduled-jobs/
    ├── .mj-sync.json
    └── .crm-jobs.json
```

### 7.3 Root `.mj-sync.json`

```json
{
  "version": "1.0.0",
  "push": {
    "autoCreateMissingRecords": true
  },
  "directoryOrder": [
    "entities",
    "action-categories",
    "actions",
    "prompt-categories",
    "prompts",
    "agent-types",
    "agents",
    "applications",
    "dashboard-part-types",
    "dashboards",
    "scheduled-jobs"
  ]
}
```

### 7.4 Entity Registration Example

An app's entity metadata registers its database tables as MJ entities:

```json
[
  {
    "fields": {
      "Name": "Contacts",
      "SchemaName": "acme_crm",
      "BaseTable": "Contact",
      "Description": "CRM contacts tracked by Acme CRM",
      "AllowCreateAPI": true,
      "AllowUpdateAPI": true,
      "AllowDeleteAPI": true,
      "TrackRecordChanges": true,
      "AuditRecordAccess": false,
      "IncludeInAPI": true
    }
  }
]
```

Note: The `SchemaName` in entity metadata MUST match `schema.name` in the app manifest.

### 7.5 Application Registration Example

The app registers itself as an MJ Application with navigation items:

```json
{
  "fields": {
    "Name": "Acme CRM",
    "Description": "Customer relationship management",
    "Icon": "fa-solid fa-handshake",
    "DefaultForNewUser": false,
    "Color": "#2196f3",
    "DefaultSequence": 500,
    "SchemaAutoAddNewEntities": "acme_crm",
    "DefaultNavItems": [
      {
        "Label": "Contacts",
        "Icon": "fa-solid fa-address-book",
        "ResourceType": "Custom",
        "DriverClass": "AcmeCRMContactsResource",
        "isDefault": true
      },
      {
        "Label": "Deals",
        "Icon": "fa-solid fa-chart-line",
        "ResourceType": "Custom",
        "DriverClass": "AcmeCRMDealsResource",
        "isDefault": false
      }
    ]
  },
  "relatedEntities": {
    "Application Entities": []
  }
}
```

### 7.6 Metadata Merge Strategy

When metadata is pushed during install or upgrade:

- **New records** → Created automatically
- **Existing records (by primaryKey)** → Updated with new field values
- **Missing records (previously existed)** → NOT deleted automatically (manual cleanup required)
- **@lookup references** → Resolved against the live database at push time

This means apps can safely push metadata on every upgrade — existing customizations to fields not managed by the app are preserved.

---

## 8. NPM Package Integration

### 8.1 Package Architecture

An MJ app's npm packages follow the same patterns as MJ core packages:

```
@acme/mj-crm-server          # Server-side bootstrap + services
@acme/mj-crm-actions         # Action implementations
@acme/mj-crm-types           # Shared TypeScript types
@acme/mj-crm-ng              # Angular module + components
```

Each package that contains `@RegisterClass` decorators must set `classManifest: true` in the manifest so the CLI knows to include it in manifest generation.

### 8.2 Package Versioning

App npm packages SHOULD follow the same version as the app itself. When a new app version is released, all packages should be published at that version.

```json
{
  "name": "@acme/mj-crm-server",
  "version": "1.2.0"
}
```

### 8.3 Integration with Class Registration Manifests

Apps integrate with MJ's class factory system through the manifest generation pipeline:

1. Consumer installs app npm packages in their MJAPI/MJExplorer `package.json`
2. Consumer runs `mj codegen manifest` (or the existing `prebuild`/`prestart` scripts)
3. The manifest generator discovers `@RegisterClass` decorators in app packages
4. Classes are included in the supplemental manifest alongside any other custom code

This works identically to how custom code integrates today — app packages are just npm dependencies.

### 8.4 Server-Side Bootstrap

For apps that need server-side initialization beyond class registration (e.g., Express middleware, scheduled tasks, event listeners):

```typescript
// @acme/mj-crm-server/src/bootstrap.ts
import { AppBootstrap } from '@memberjunction/core';

@RegisterClass(AppBootstrap, 'acme-crm')
export class AcmeCRMBootstrap extends AppBootstrap {
    async Initialize(): Promise<void> {
        // Register webhooks, start sync timers, etc.
    }

    async Shutdown(): Promise<void> {
        // Cleanup resources
    }
}
```

### 8.5 Private npm Registries

For closed-source apps, packages may be published to private registries:

```json
{
  "packages": {
    "registry": "https://npm.acme.com",
    "server": [
      { "name": "@acme/mj-crm-server", "role": "bootstrap", "classManifest": true }
    ]
  }
}
```

The consumer configures registry auth in their `.npmrc`:
```
@acme:registry=https://npm.acme.com
//npm.acme.com/:_authToken=${NPM_ACME_TOKEN}
```

---

## 9. Installation Lifecycle

### 9.1 Install Flow

```
mj app install https://github.com/acme/mj-crm [--version 1.2.0]
```

**Step-by-step:**

1. **Fetch manifest** — Download `mj-app.json` from the specified GitHub release (latest if no version given)
2. **Validate compatibility** — Check `mjVersionRange` against installed MJ version
3. **Check dependencies** — Verify all apps listed in `dependencies` are installed at compatible versions
4. **Check schema** — Verify `schema.name` doesn't already exist (unless upgrading)
5. **Create schema** — `CREATE SCHEMA [acme_crm]` if `createIfNotExists` is true
6. **Run migrations** — Execute Flyway against the app schema with `flyway.defaultSchema = acme_crm`
7. **Push metadata** — Run `mj sync push --dir=<downloaded-metadata>` to register entities, actions, prompts, etc.
8. **Run CodeGen** — Execute `mj codegen` to generate TypeScript classes, views, and stored procedures for new entities
9. **Install npm packages** — Add app packages to consumer's `package.json` and run `npm install`
10. **Regenerate manifests** — Run `mj codegen manifest` to include app's `@RegisterClass` decorators
11. **Execute hooks** — Run `postInstall` hook if defined
12. **Record installation** — Store app version in `__mj.InstalledApp` tracking table

### 9.2 Upgrade Flow

```
mj app upgrade acme-crm [--version 1.3.0]
```

1. **Fetch new manifest** — Download `mj-app.json` from the target version
2. **Validate compatibility** — Same as install
3. **Run migrations** — Flyway applies only new migrations (existing ones tracked in `flyway_schema_history`)
4. **Push metadata** — mj-sync updates existing records, creates new ones
5. **Run CodeGen** — Regenerate TypeScript for modified entities
6. **Update npm packages** — Bump package versions in `package.json`, run `npm install`
7. **Regenerate manifests** — Update class registration manifests
8. **Execute hooks** — Run `postUpgrade` hook if defined
9. **Update tracking** — Update version in `__mj.InstalledApp`

### 9.3 Remove Flow

```
mj app remove acme-crm [--keep-data]
```

1. **Check dependents** — Verify no other installed apps depend on this one
2. **Execute hooks** — Run `preRemove` hook if defined
3. **Remove metadata** — Delete app's entities, actions, prompts, etc. from MJ metadata tables
4. **Remove npm packages** — Remove from `package.json`, run `npm install`
5. **Regenerate manifests** — Update class registration manifests
6. **Drop schema** (unless `--keep-data`) — `DROP SCHEMA [acme_crm]` and all contained objects
7. **Remove tracking** — Delete from `__mj.InstalledApp`

### 9.4 List and Info

```
mj app list                    # List installed apps with versions
mj app info acme-crm           # Show detailed info about an installed app
mj app check-updates           # Check for available upgrades
```

---

## 10. App Tracking Entity

MJ tracks installed apps in a core entity. This entity lives in `__mj` and is part of MJ core.

### 10.1 InstalledApp Table

```sql
CREATE TABLE __mj.InstalledApp (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(64) NOT NULL,                 -- App identifier from manifest
    DisplayName NVARCHAR(200) NOT NULL,          -- Human-readable name
    Description NVARCHAR(MAX) NULL,
    Version NVARCHAR(50) NOT NULL,               -- Currently installed version
    Publisher NVARCHAR(200) NOT NULL,
    RepositoryURL NVARCHAR(500) NOT NULL,
    SchemaName NVARCHAR(128) NULL,               -- Database schema name
    ManifestJSON NVARCHAR(MAX) NOT NULL,          -- Full manifest at install time
    InstalledAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    InstalledByUserID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active', -- Active | Disabled | Error
    CONSTRAINT PK_InstalledApp PRIMARY KEY (ID),
    CONSTRAINT UQ_InstalledApp_Name UNIQUE (Name),
    CONSTRAINT FK_InstalledApp_User FOREIGN KEY (InstalledByUserID)
        REFERENCES __mj.[User](ID)
);
```

### 10.2 InstalledAppVersion Table (Upgrade History)

```sql
CREATE TABLE __mj.InstalledAppVersion (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InstalledAppID UNIQUEIDENTIFIER NOT NULL,
    Version NVARCHAR(50) NOT NULL,
    PreviousVersion NVARCHAR(50) NULL,
    Action NVARCHAR(20) NOT NULL,               -- Install | Upgrade | Rollback
    ManifestJSON NVARCHAR(MAX) NOT NULL,
    ExecutedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    ExecutedByUserID UNIQUEIDENTIFIER NOT NULL,
    Success BIT NOT NULL DEFAULT 1,
    ErrorMessage NVARCHAR(MAX) NULL,
    CONSTRAINT PK_InstalledAppVersion PRIMARY KEY (ID),
    CONSTRAINT FK_InstalledAppVersion_App FOREIGN KEY (InstalledAppID)
        REFERENCES __mj.InstalledApp(ID),
    CONSTRAINT FK_InstalledAppVersion_User FOREIGN KEY (ExecutedByUserID)
        REFERENCES __mj.[User](ID)
);
```

---

## 11. MJ Central Integration

MJ Central is the hosted registry and marketplace that wraps this open spec with a UI.

### 11.1 Registry API

MJ Central provides a REST API for app discovery:

```
GET  /api/v1/apps                          # List all published apps
GET  /api/v1/apps/search?q=crm&category=sales  # Search apps
GET  /api/v1/apps/{name}                   # Get app details
GET  /api/v1/apps/{name}/versions          # List all versions
GET  /api/v1/apps/{name}/versions/{version}  # Get specific version manifest
GET  /api/v1/apps/{name}/readme            # Get rendered README
POST /api/v1/apps/{name}/reviews           # Submit a review
```

### 11.2 Publishing to MJ Central

Publishers register their apps with MJ Central by providing their GitHub repository URL. MJ Central then:

1. Monitors the repo for new tagged releases
2. Fetches and validates the `mj-app.json` manifest
3. Indexes the app for search and discovery
4. Generates documentation from README.md
5. Tracks download/install metrics

### 11.3 CLI Integration with MJ Central

```
mj app search "crm"                       # Search MJ Central
mj app install acme-crm                   # Install by name (resolves via MJ Central)
mj app install https://github.com/acme/mj-crm  # Install by URL (bypasses MJ Central)
```

When installing by name (without a URL), the CLI queries MJ Central to resolve the GitHub repo URL, then proceeds with the standard install flow.

### 11.4 Categories and Tags

MJ Central supports categorization:

```json
{
  "categories": ["CRM", "Sales"],
  "tags": ["contacts", "deals", "pipeline", "sales-automation"]
}
```

These fields are optional in `mj-app.json` and primarily used by MJ Central for discovery.

---

## 12. Configuration Integration

### 12.1 App Configuration in `mj.config.cjs`

Apps that need runtime configuration declare a schema in their manifest (`configuration.schema`). Consumers provide values in `mj.config.cjs`:

```javascript
// mj.config.cjs
module.exports = {
  // ... existing MJ config ...

  apps: {
    "acme-crm": {
      apiEndpoint: "https://api.acme.com/crm",
      syncInterval: 30
    }
  }
};
```

App code reads configuration at runtime:

```typescript
import { MJConfig } from '@memberjunction/config';

const config = MJConfig.Instance;
const crmConfig = config.GetAppConfig('acme-crm');
// { apiEndpoint: "https://api.acme.com/crm", syncInterval: 30 }
```

### 12.2 Environment Variables

Apps MAY reference environment variables in metadata using the existing `@env:` directive:

```json
{
  "fields": {
    "APIKey": "@env:ACME_CRM_API_KEY"
  }
}
```

---

## 13. Security Considerations

### 13.1 Schema Isolation

- Apps operate in their own schema and cannot modify core or other app schemas
- The CLI validates that migration files do not contain `ALTER` or `DROP` statements targeting `__mj`
- Cross-schema foreign keys are read-only relationships

### 13.2 Code Trust

- Apps run with the same privileges as the MJ server process
- There is no runtime sandboxing — installing an app is a trust decision
- MJ Central MAY provide verified publisher badges and security scanning
- Private repos require explicit auth configuration (the CLI never stores credentials in the manifest)

### 13.3 Metadata Safety

- mj-sync validates all metadata before pushing
- @lookup references are resolved against the live database (no arbitrary SQL injection)
- File references (`@file:`) are scoped to the app's metadata directory

---

## 14. Example: Complete "Acme CRM" App

### 14.1 Repository Structure

```
acme-mj-crm/
├── mj-app.json
├── LICENSE
├── README.md
├── CHANGELOG.md
├── migrations/
│   ├── V202602010000__v1.0.x__Initial_Schema.sql
│   ├── V202602100000__v1.0.x__Add_Deal_Table.sql
│   └── V202603010000__v1.1.x__Add_Pipeline_Status.sql
├── metadata/
│   ├── .mj-sync.json
│   ├── entities/
│   │   ├── .mj-sync.json
│   │   └── .crm-entities.json
│   ├── actions/
│   │   ├── .mj-sync.json
│   │   ├── .crm-actions.json
│   │   └── templates/
│   │       └── sync-contacts.md
│   ├── applications/
│   │   ├── .mj-sync.json
│   │   └── .crm-application.json
│   └── dashboards/
│       ├── .mj-sync.json
│       └── .crm-dashboard.json
└── packages/
    ├── server/
    │   ├── package.json          # @acme/mj-crm-server
    │   └── src/
    │       ├── index.ts
    │       ├── bootstrap.ts
    │       └── services/
    ├── actions/
    │   ├── package.json          # @acme/mj-crm-actions
    │   └── src/
    │       ├── index.ts
    │       └── SyncContactsAction.ts
    ├── types/
    │   ├── package.json          # @acme/mj-crm-types
    │   └── src/
    │       └── index.ts
    └── angular/
        ├── package.json          # @acme/mj-crm-ng
        └── src/
            ├── public-api.ts
            ├── crm.module.ts
            └── components/
```

### 14.2 Manifest

```json
{
  "$schema": "https://schema.memberjunction.org/mj-app/v1.json",
  "name": "acme-crm",
  "displayName": "Acme CRM",
  "description": "Full-featured CRM for MemberJunction with contact management, deal tracking, and sales pipeline automation.",
  "version": "1.1.0",
  "license": "MIT",
  "icon": "fa-solid fa-handshake",
  "color": "#2196f3",
  "publisher": {
    "name": "Acme Corporation",
    "email": "mj-apps@acme.com",
    "url": "https://acme.com"
  },
  "repository": "https://github.com/acme/acme-mj-crm",
  "mjVersionRange": ">=4.0.0 <5.0.0",
  "schema": {
    "name": "acme_crm"
  },
  "migrations": {
    "directory": "migrations"
  },
  "metadata": {
    "directory": "metadata",
    "schemaAutoAddEntities": true
  },
  "packages": {
    "server": [
      { "name": "@acme/mj-crm-server", "role": "bootstrap", "classManifest": true },
      { "name": "@acme/mj-crm-actions", "role": "actions", "classManifest": true }
    ],
    "client": [
      { "name": "@acme/mj-crm-ng", "role": "module", "classManifest": true }
    ],
    "shared": [
      { "name": "@acme/mj-crm-types", "role": "library", "classManifest": false }
    ]
  },
  "entryPoints": {
    "server": {
      "bootstrap": "@acme/mj-crm-server",
      "manifestExport": "CLASS_REGISTRATIONS"
    },
    "client": {
      "module": "@acme/mj-crm-ng",
      "manifestExport": "CLASS_REGISTRATIONS"
    }
  },
  "configuration": {
    "schema": {
      "type": "object",
      "properties": {
        "externalCrmEndpoint": {
          "type": "string",
          "description": "Optional external CRM API for bi-directional sync"
        },
        "syncIntervalMinutes": {
          "type": "integer",
          "description": "How often to sync with external CRM (0 = disabled)",
          "default": 0
        }
      }
    }
  },
  "categories": ["CRM", "Sales"],
  "tags": ["contacts", "deals", "pipeline", "sales"]
}
```

### 14.3 Initial Migration

```sql
-- V202602010000__v1.0.x__Initial_Schema.sql
-- Acme CRM: Initial schema - contacts and companies

CREATE TABLE ${flyway:defaultSchema}.Company (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    Website NVARCHAR(500) NULL,
    Industry NVARCHAR(100) NULL,
    Size NVARCHAR(50) NULL,
    OwnerUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_Company PRIMARY KEY (ID),
    CONSTRAINT FK_Company_User FOREIGN KEY (OwnerUserID)
        REFERENCES __mj.[User](ID)
);
GO

CREATE TABLE ${flyway:defaultSchema}.Contact (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255) NULL,
    Phone NVARCHAR(50) NULL,
    CompanyID UNIQUEIDENTIFIER NULL,
    OwnerUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_Contact PRIMARY KEY (ID),
    CONSTRAINT FK_Contact_Company FOREIGN KEY (CompanyID)
        REFERENCES ${flyway:defaultSchema}.Company(ID),
    CONSTRAINT FK_Contact_User FOREIGN KEY (OwnerUserID)
        REFERENCES __mj.[User](ID)
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Companies tracked in Acme CRM',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'Company';
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Individual contacts associated with companies',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE', @level1name = N'Contact';
GO
```

---

## 15. Open Questions and Future Considerations

### 15.1 Open Questions

1. **Schema name uniqueness enforcement** — Should MJ Central maintain a global registry of schema names, or is uniqueness only enforced locally at install time?

2. **Dependency resolution order** — When app A depends on app B, should `mj app install A` automatically install B? Or require explicit install?

3. **Breaking changes across MJ versions** — When MJ ships a major version, how do apps declare migration paths? Should there be a concept of "app migration from MJ v4 to v5"?

4. **App-to-app metadata references** — Can app A's metadata use `@lookup:` references to entities defined by app B? This requires app B to be installed first and creates tight coupling.

5. **Rollback strategy** — Should `mj app upgrade` support automatic rollback if migration/metadata push fails? Flyway migrations are not easily reversible.

6. **CodeGen for app entities** — Should app entities participate in the MJ core CodeGen output, or should apps maintain their own generated entity classes?

7. **Angular lazy loading** — How do app Angular modules get lazy-loaded in MJExplorer? Should the manifest declare route definitions?

8. **App permissions** — Should there be an app-level permission system beyond MJ's existing entity-level permissions?

### 15.2 Future Enhancements

- **App Templates** — Scaffold new apps with `mj app create --template crm`
- **App Bundles** — Group multiple apps into a single installable bundle
- **Marketplace Reviews** — Ratings and reviews on MJ Central
- **Dependency Visualization** — Graph view of installed apps and their dependencies
- **App Hooks API** — Richer lifecycle hooks (onEntityCreate, onUserLogin, etc.)
- **Hot Reload** — Metadata-only updates without server restart
- **App-Scoped Permissions** — Fine-grained access control per app

---

## 16. Relationship to Existing MJ Concepts

| MJ Concept | Relationship to Apps |
|------------|---------------------|
| **Applications** (entity) | Each app creates one or more Application records for nav/UI |
| **Component Registry** | Apps may register components; the registry is a complementary system |
| **Class Registration Manifests** | App packages participate in the existing manifest pipeline |
| **mj-sync** | App metadata uses the same sync format and tooling |
| **Flyway Migrations** | App migrations use the same engine, different schema |
| **CodeGen** | App entities go through CodeGen for views/SPs/TypeScript |
| **mj.config.cjs** | Apps add their config under the `apps` key |
| **Bootstrap Packages** | Apps follow the same bootstrap pattern for server initialization |
