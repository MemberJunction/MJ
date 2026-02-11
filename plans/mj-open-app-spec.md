# MJ Open App Specification

## Overview

This document defines the **MJ Open App** standard — a packaging, distribution, and installation format for self-contained applications that run on the MemberJunction platform. An "app" is a deployable unit consisting of a database schema, metadata, and npm packages — published as a GitHub repository with tagged releases.

### Goals

1. **Standardized packaging** — Any developer can create and distribute an MJ app using a well-defined manifest format.
2. **Schema isolation** — Each app owns a dedicated database schema, preventing collisions with MJ core (`__mj`) or other apps.
3. **Version management** — Apps use semver via GitHub release tags. Migrations manage schema evolution across versions.
4. **Metadata portability** — App metadata (entities, actions, prompts, agents, dashboards, etc.) is packaged using the existing mj-sync format and pushed into the target MJ installation at install time.
5. **npm integration** — App code ships as npm packages (public or private registry) and integrates with MJ's class registration manifest system.
6. **CLI-driven lifecycle** — `mj app install`, `mj app upgrade`, `mj app remove` commands handle the full lifecycle.
7. **MJ Central compatibility** — The spec enables a hosted registry (MJ Central) to wrap discovery, ratings, and UI around the open standard.

### Non-Goals (for now)

- Runtime app sandboxing or permission isolation (apps run with full MJ server privileges)
- Multi-tenancy within a single app (handled at the MJ platform level)
- Hot-swapping apps without server restart
- Paid app licensing enforcement (MJ Central concern, not spec concern)

---

## Terminology

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

## Repository Structure

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
│   │   └── templates/             # Prompt template content files
│   ├── agents/                     # AI agent definitions
│   ├── applications/               # Application nav definitions
│   ├── dashboards/                 # Dashboard definitions
│   └── ...                         # Any mj-sync entity directories
├── packages/                       # Source code (OPTIONAL for closed-source)
│   ├── server/                     # Server-side packages
│   └── client/                     # Client-side packages (Angular, etc.)
├── LICENSE                         # (RECOMMENDED)
├── README.md                       # (RECOMMENDED)
└── CHANGELOG.md                    # (RECOMMENDED)
```

### Versioning via GitHub Releases

- Tags MUST use the format `v{MAJOR}.{MINOR}.{PATCH}` (e.g., `v1.0.0`, `v1.2.3`)
- Pre-release tags MAY use suffixes: `v1.0.0-beta.1`, `v1.0.0-rc.1`
- The `mj-app.json` manifest MUST contain a `version` field matching the release tag
- Each tagged release represents a complete, installable snapshot of the app

### Private Repositories

Private repositories are fully supported. The consumer configures GitHub authentication via PAT, GitHub App Installation Token, or SSH key (stored in `mj.config.cjs` or environment variable). The CLI uses the configured auth when fetching manifests from private repos.

---

## App Manifest (`mj-app.json`)

The manifest is a JSON file at the repository root. It is the single source of truth for what the app is, what it contains, and how to install it.

### Full Example

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
    "engine": "flyway"                          // OPTIONAL - default: "flyway"
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
        "classManifest": true                   // Has @RegisterClass decorators?
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
      "bootstrap": "@acme/mj-crm-server",      // Package to import for server-side init
      "manifestExport": "CLASS_REGISTRATIONS"   // Named export with class registrations
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
    "sourceDirectory": "packages"               // Informational only
  },

  // ── Configuration Schema ──────────────────────────────────
  "configuration": {                            // OPTIONAL - app-specific config schema
    "schema": {                                 // JSON Schema for mj.config.cjs apps.{appName}
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
  },

  // ── Discovery (MJ Central) ───────────────────────────────
  "categories": ["CRM", "Sales"],               // OPTIONAL - max 5
  "tags": ["contacts", "deals", "pipeline"]     // OPTIONAL - max 20, lowercase
}
```

### Field Reference

#### Identity Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `$schema` | string | No | JSON Schema URL for validation |
| `name` | string | Yes | Unique app identifier. Lowercase alphanumeric + hyphens. 3-64 chars. |
| `displayName` | string | Yes | Human-readable name for UI display |
| `description` | string | Yes | Short description (10-500 chars) |
| `version` | string | Yes | Semver version. MUST match GitHub release tag. |
| `license` | string | No | SPDX license identifier |
| `icon` | string | No | Font Awesome icon class |
| `color` | string | No | Hex color string |

#### Publisher

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `publisher.name` | string | Yes | Publisher display name |
| `publisher.email` | string | No | Contact email |
| `publisher.url` | string | No | Publisher website |

#### Compatibility

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `mjVersionRange` | string | Yes | Semver range of compatible MJ versions |
| `dependencies` | object | No | Map of app name to semver range for required peer apps |

#### Database Schema

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `schema.name` | string | Yes (if DB) | SQL Server schema name. Convention: `{publisher}_{app}`. |
| `schema.createIfNotExists` | boolean | No | Create the schema at install time. Default: `true`. |

#### Migrations

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `migrations.directory` | string | No | Relative path to migrations. Default: `"migrations"`. |
| `migrations.engine` | string | No | Only `"flyway"` supported. Default: `"flyway"`. |

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
| `role` | string | Yes | `bootstrap`, `actions`, `engine`, `provider`, `module`, `components`, `library` |
| `classManifest` | boolean | No | Contains `@RegisterClass` decorators? Default: `false`. |

---

## JSON Schema

The formal JSON Schema for `mj-app.json` is at `schemas/mj-app.schema.json` in this plan directory. Key validation rules:

- `name`: Pattern `^[a-z][a-z0-9-]{1,62}[a-z0-9]$` (3-64 chars, lowercase + hyphens)
- `version`: Full semver regex including pre-release and build metadata
- `schema.name`: Pattern `^[a-z][a-z0-9_]{1,126}[a-z0-9]$` (3-128 chars, lowercase + underscores)
- `color`: Pattern `^#[0-9a-fA-F]{6}$`
- `repository`: Must match `^https://github\.com/.+/.+$`
- `tags`: Each tag lowercase alphanumeric + hyphens, max 50 chars, max 20 tags
- `categories`: Max 5

The JSON Schema file is a standalone artifact that can be published to `schema.memberjunction.org` for editor validation.

---

## Database Schema Isolation

### Design Principles

Each app operates in its own SQL Server schema:

- **Namespace isolation** — No table name collisions between apps or with MJ core
- **Clear ownership** — Easy to identify which tables belong to which app
- **Clean removal** — Dropping the schema removes all app database objects
- **Independent migrations** — Each app manages its own migration history

### Schema Naming Convention

```
{publisher}_{appname}
```

Examples: `acme_crm`, `acme_helpdesk`, `oss_analytics`

Rules:
- Lowercase alphanumeric + underscores only
- Must not start with `__` (reserved for MJ system schemas)
- Must not collide with SQL Server reserved schema names (`dbo`, `sys`, `guest`, etc.)
- Max 128 characters

### Cross-Schema References

Apps reference MJ core entities through standard foreign keys:

```sql
CREATE TABLE ${flyway:defaultSchema}.Contact (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    OwnerUserID UNIQUEIDENTIFIER NOT NULL,
    CONSTRAINT PK_Contact PRIMARY KEY (ID),
    CONSTRAINT FK_Contact_User FOREIGN KEY (OwnerUserID)
        REFERENCES __mj.[User](ID)
);
```

Rules:
- Apps MAY reference `__mj` schema entities via foreign keys
- Apps MAY reference other installed app schemas (declared in `dependencies`)
- Apps MUST NOT modify tables in `__mj` or other app schemas
- The `__mj` reference is always literal (not a placeholder) — it's the well-known core schema

### Entity Registration with MJ Core

When an app creates tables in its schema, those tables are registered as MJ entities so they participate in the metadata system (RunView, entity objects, CodeGen, etc.):

1. App's `metadata/entities/` directory declares entity metadata
2. `mj sync push` registers entities in the MJ `Entity` and `EntityField` tables
3. CodeGen runs to generate TypeScript classes, stored procedures, and views
4. The app's entities are now fully functional MJ entities, just living in a different schema

---

## Migrations

### Flyway Integration

App migrations follow the same Flyway conventions as MJ core. The key difference: **the default schema is the app's schema**, not `__mj`.

File naming convention:
```
V{YYYYMMDDHHMM}__v{VERSION}.x_{DESCRIPTION}.sql
```

Examples:
```
V202602010000__v1.0.x__Initial_Schema.sql
V202602150000__v1.0.x__Add_Contact_Status.sql
V202603010000__v1.1.x__Add_Deal_Pipeline.sql
```

### Schema Placeholder

Migrations MUST use `${flyway:defaultSchema}` for the app schema. When the CLI runs migrations, it sets `flyway.defaultSchema` to the app's schema name from the manifest.

### Flyway History Table

Each app gets its own Flyway history table within its schema:
```
acme_crm.flyway_schema_history
```

This keeps migration history isolated per app and allows independent version tracking.

### Migration Rules

All MJ migration rules apply (see `/migrations/CLAUDE.md`), plus:

1. Use `${flyway:defaultSchema}` for app tables — never hardcode the schema name
2. Use `__mj` literally for core references
3. Never modify `__mj` objects
4. Hardcode UUIDs (not `NEWID()`)
5. No `__mj_` timestamp columns — CodeGen adds these
6. No FK indexes — CodeGen creates these

### Baseline Migrations

For major version jumps, apps MAY include a baseline migration using the Flyway `B` prefix:

```
B202602010000__v2.0_Baseline.sql    # Complete schema for fresh v2.0 installs
V202602150000__v2.1.x__Add_Feature.sql
```

---

## Metadata Packaging

### mj-sync Format

App metadata uses the exact same mj-sync format as MJ core. The app's `metadata/` directory mirrors the structure used in `/metadata/` at the MJ repo root.

### Directory Structure

```
metadata/
├── .mj-sync.json                   # Root sync config with directoryOrder
├── entities/
│   ├── .mj-sync.json
│   └── .crm-entities.json
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
│   └── .crm-application.json
├── dashboards/
│   ├── .mj-sync.json
│   └── .crm-dashboards.json
└── scheduled-jobs/
    ├── .mj-sync.json
    └── .crm-jobs.json
```

### Root `.mj-sync.json`

```json
{
  "version": "1.0.0",
  "push": { "autoCreateMissingRecords": true },
  "directoryOrder": [
    "entities", "action-categories", "actions",
    "prompt-categories", "prompts",
    "agent-types", "agents",
    "applications", "dashboard-part-types", "dashboards",
    "scheduled-jobs"
  ]
}
```

### Entity Registration Example

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
      "IncludeInAPI": true
    }
  }
]
```

The `SchemaName` in entity metadata MUST match `schema.name` in the app manifest.

### Application Registration Example

```json
{
  "fields": {
    "Name": "Acme CRM",
    "Description": "Customer relationship management",
    "Icon": "fa-solid fa-handshake",
    "DefaultForNewUser": false,
    "Color": "#2196f3",
    "DefaultSequence": 500,
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
  "relatedEntities": { "Application Entities": [] }
}
```

### Metadata Merge Strategy

When metadata is pushed during install or upgrade:

- **New records** → Created automatically
- **Existing records (by primaryKey)** → Updated with new field values
- **Missing records** → NOT deleted automatically (manual cleanup required)
- **@lookup references** → Resolved against the live database at push time

Apps can safely push metadata on every upgrade — existing customizations to fields not managed by the app are preserved.

---

## NPM Package Integration

### Package Architecture

Apps follow the same package patterns as MJ core:

```
@acme/mj-crm-server          # Server-side bootstrap + services
@acme/mj-crm-actions         # Action implementations
@acme/mj-crm-types           # Shared TypeScript types
@acme/mj-crm-ng              # Angular module + components
```

Packages with `classManifest: true` contain `@RegisterClass` decorators and must be included in manifest generation.

### Integration with Class Registration Manifests

Apps integrate with MJ's class factory through the existing manifest pipeline:

1. Consumer installs app npm packages in their MJAPI/MJExplorer `package.json`
2. Consumer runs `mj codegen manifest` (or existing `prebuild`/`prestart` scripts)
3. The manifest generator discovers `@RegisterClass` decorators in app packages
4. Classes are included in the supplemental manifest alongside any other custom code

This is identical to how custom code integrates today — app packages are just npm dependencies.

### Server-Side Bootstrap

Apps that need server-side initialization beyond class registration:

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

### Private npm Registries

For closed-source apps, configure registry auth in `.npmrc`:
```
@acme:registry=https://npm.acme.com
//npm.acme.com/:_authToken=${NPM_ACME_TOKEN}
```

---

## Installation Lifecycle

### Install Flow

```
mj app install https://github.com/acme/mj-crm [--version 1.2.0]
```

1. **Fetch manifest** — Download `mj-app.json` from the specified GitHub release (latest if no version)
2. **Validate compatibility** — Check `mjVersionRange` against installed MJ version
3. **Check dependencies** — Verify all apps in `dependencies` are installed at compatible versions
4. **Check schema** — Verify `schema.name` doesn't already exist
5. **Create schema** — `CREATE SCHEMA [acme_crm]` if `createIfNotExists` is true
6. **Run migrations** — Execute Flyway against the app schema
7. **Push metadata** — Run `mj sync push` to register entities, actions, prompts, etc.
8. **Run CodeGen** — Generate TypeScript classes, views, and stored procedures for new entities
9. **Install npm packages** — Add packages to consumer's `package.json` and run `npm install`
10. **Regenerate manifests** — Run `mj codegen manifest` to include app's `@RegisterClass` decorators
11. **Execute hooks** — Run `postInstall` hook if defined
12. **Record installation** — Store app version in `__mj.InstalledApp` tracking table

### Upgrade Flow

```
mj app upgrade acme-crm [--version 1.3.0]
```

1. Fetch new manifest from target version
2. Validate compatibility
3. Run migrations (Flyway applies only new ones via `flyway_schema_history`)
4. Push metadata (mj-sync updates existing, creates new records)
5. Run CodeGen for modified entities
6. Update npm package versions, run `npm install`
7. Regenerate manifests
8. Execute `postUpgrade` hook
9. Update version in `__mj.InstalledApp`

### Remove Flow

```
mj app remove acme-crm [--keep-data]
```

1. Check dependents — verify no other installed apps depend on this one
2. Execute `preRemove` hook
3. Remove metadata — delete app's entities, actions, prompts, etc. from MJ metadata tables
4. Remove npm packages from `package.json`, run `npm install`
5. Regenerate manifests
6. Drop schema (unless `--keep-data`) — `DROP SCHEMA [acme_crm]` and all contained objects
7. Remove from `__mj.InstalledApp`

### List and Info

```
mj app list                    # List installed apps with versions
mj app info acme-crm           # Show detailed info about an installed app
mj app check-updates           # Check for available upgrades
```

---

## Data Model

MJ tracks installed apps in core `__mj` entities. These follow the newer `"MJ: "` prefix naming convention.

### Entity Relationship Diagram

```
                    ┌──────────────────────┐
                    │   MJ: App Registries │
                    │──────────────────────│
                    │ ID                   │
                    │ Name                 │
                    │ URL                  │
                    │ Type                 │
                    │ Status               │
                    └──────────┬───────────┘
                               │ 1:N
                               ▼
┌──────────────────────────────────────────────────────┐
│                  MJ: Installed Apps                   │
│──────────────────────────────────────────────────────│
│ ID, Name (unique), DisplayName, Description          │
│ Version, Publisher, RepositoryURL                    │
│ SchemaName (unique), MJVersionRange                  │
│ ManifestJSON, Status, RegistryID, InstalledByUserID  │
└───┬──────────────────┬───────────────────┬───────────┘
    │ 1:N              │ 1:N               │ 1:N
    ▼                  ▼                   ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│ MJ: Installed│  │ MJ: Installed│  │ MJ: Installed App│
│ App Versions │  │ App Packages │  │ Dependencies     │
│─────────────│  │──────────────│  │──────────────────│
│ Version      │  │ PackageName  │  │ DependsOnAppName │
│ PrevVersion  │  │ PackageType  │  │ DependsOnAppID   │
│ Action       │  │ Role         │  │ VersionRange     │
│ Success      │  │ HasManifest  │  │ Status           │
│ ErrorMessage │  │ Registry     │  └──────────────────┘
└─────────────┘  └──────────────┘
```

### MJ: App Registries

Tracks known app registries (MJ Central, private registries, etc.).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | UNIQUEIDENTIFIER | No | NEWSEQUENTIALID() | Primary key |
| Name | NVARCHAR(200) | No | | Registry display name |
| URL | NVARCHAR(500) | No | | Base URL of the registry API |
| Type | NVARCHAR(20) | No | 'Public' | Public, Private, or Local |
| APIVersion | NVARCHAR(20) | No | 'v1' | API version string |
| Description | NVARCHAR(MAX) | Yes | | Registry description |
| AuthMethod | NVARCHAR(50) | Yes | | None, APIKey, OAuth, Token |
| Status | NVARCHAR(20) | No | 'Active' | Active, Inactive, Error |

**Constraints:** PK, UNIQUE(Name), CHECK(Type), CHECK(Status)

**Default seed:** MJ Central pre-seeded with hardcoded UUID.

### MJ: Installed Apps

Primary tracking entity for all apps installed in this MJ instance.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | UNIQUEIDENTIFIER | No | NEWSEQUENTIALID() | Primary key |
| Name | NVARCHAR(64) | No | | Unique app identifier from manifest |
| DisplayName | NVARCHAR(200) | No | | Human-readable name |
| Description | NVARCHAR(MAX) | Yes | | App description |
| Version | NVARCHAR(50) | No | | Currently installed semver version |
| Publisher | NVARCHAR(200) | No | | Publisher name |
| PublisherEmail | NVARCHAR(255) | Yes | | Publisher contact email |
| PublisherURL | NVARCHAR(500) | Yes | | Publisher website |
| RepositoryURL | NVARCHAR(500) | No | | GitHub repository URL |
| SchemaName | NVARCHAR(128) | Yes | | Database schema name (NULL if no DB objects) |
| MJVersionRange | NVARCHAR(100) | No | | Compatible MJ version range |
| License | NVARCHAR(50) | Yes | | SPDX license identifier |
| Icon | NVARCHAR(100) | Yes | | Font Awesome icon class |
| Color | NVARCHAR(20) | Yes | | Hex color for UI |
| ManifestJSON | NVARCHAR(MAX) | No | | Complete manifest JSON at current version |
| ConfigurationSchemaJSON | NVARCHAR(MAX) | Yes | | JSON Schema for app config |
| RegistryID | UNIQUEIDENTIFIER | Yes | | FK to AppRegistry |
| InstalledAt | DATETIMEOFFSET | No | GETUTCDATE() | First installation timestamp |
| UpdatedAt | DATETIMEOFFSET | No | GETUTCDATE() | Last update timestamp |
| InstalledByUserID | UNIQUEIDENTIFIER | No | | FK to User |
| Status | NVARCHAR(20) | No | 'Active' | Active, Disabled, Error, Installing, Upgrading, Removing |

**Constraints:** PK, UNIQUE(Name), UNIQUE(SchemaName), FK(RegistryID → AppRegistry), FK(InstalledByUserID → User), CHECK(Status), CHECK(Name lowercase+hyphens only)

### MJ: Installed App Versions

Audit trail of every install, upgrade, and rollback action.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | UNIQUEIDENTIFIER | No | NEWSEQUENTIALID() | Primary key |
| InstalledAppID | UNIQUEIDENTIFIER | No | | FK to InstalledApp |
| Version | NVARCHAR(50) | No | | Version installed/upgraded to |
| PreviousVersion | NVARCHAR(50) | Yes | | Version before this action (NULL for initial install) |
| Action | NVARCHAR(20) | No | | Install, Upgrade, Rollback, Remove |
| ManifestJSON | NVARCHAR(MAX) | No | | Manifest snapshot at this version |
| MigrationsSummary | NVARCHAR(MAX) | Yes | | Summary of migrations applied |
| MetadataSummary | NVARCHAR(MAX) | Yes | | Summary of metadata changes |
| PackagesSummary | NVARCHAR(MAX) | Yes | | Summary of npm package changes |
| ExecutedAt | DATETIMEOFFSET | No | GETUTCDATE() | When the action was performed |
| ExecutedByUserID | UNIQUEIDENTIFIER | No | | FK to User |
| DurationSeconds | INT | Yes | | How long the operation took |
| Success | BIT | No | 1 | Whether it succeeded |
| ErrorMessage | NVARCHAR(MAX) | Yes | | Error details if failed |
| ErrorPhase | NVARCHAR(50) | Yes | | Schema, Migration, Metadata, Packages, Manifest, Hooks |

**Constraints:** PK, FK(InstalledAppID), FK(ExecutedByUserID), CHECK(Action)

### MJ: Installed App Packages

Tracks npm packages associated with each installed app.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | UNIQUEIDENTIFIER | No | NEWSEQUENTIALID() | Primary key |
| InstalledAppID | UNIQUEIDENTIFIER | No | | FK to InstalledApp |
| PackageName | NVARCHAR(200) | No | | npm package name |
| PackageVersion | NVARCHAR(50) | No | | Currently installed version |
| PackageType | NVARCHAR(20) | No | | Server, Client, Shared |
| Role | NVARCHAR(50) | No | | bootstrap, actions, engine, provider, module, components, library |
| HasClassManifest | BIT | No | 0 | Contains @RegisterClass decorators? |
| RegistryURL | NVARCHAR(500) | Yes | | npm registry URL (NULL = public npm) |
| Status | NVARCHAR(20) | No | 'Installed' | Installed, Error, Pending |

**Constraints:** PK, FK(InstalledAppID), UNIQUE(InstalledAppID, PackageName), CHECK(PackageType), CHECK(Status)

### MJ: Installed App Dependencies

Tracks inter-app dependency relationships.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | UNIQUEIDENTIFIER | No | NEWSEQUENTIALID() | Primary key |
| InstalledAppID | UNIQUEIDENTIFIER | No | | The app that has the dependency |
| DependsOnAppName | NVARCHAR(64) | No | | Name of the required app |
| DependsOnAppID | UNIQUEIDENTIFIER | Yes | | FK to InstalledApp (if installed) |
| VersionRange | NVARCHAR(100) | No | | Required semver range |
| InstalledVersion | NVARCHAR(50) | Yes | | Current version of dependency |
| Status | NVARCHAR(20) | No | 'Satisfied' | Satisfied, Missing, Incompatible |

**Constraints:** PK, FK(InstalledAppID), FK(DependsOnAppID), UNIQUE(InstalledAppID, DependsOnAppName), CHECK(Status)

### Relationship to Existing Entities

| Existing Entity | Relationship |
|----------------|-------------|
| **Users** | InstalledApp.InstalledByUserID, InstalledAppVersion.ExecutedByUserID |
| **Applications** | Apps create Application records via metadata sync (not FK) |
| **Entities** | App entities registered through metadata sync, SchemaName links to app schema |
| **Actions** | App actions registered through metadata sync |
| **AI Prompts** | App prompts registered through metadata sync |
| **AI Agents** | App agents registered through metadata sync |
| **Dashboards** | App dashboards registered through metadata sync |

The `MJ: Installed Apps` entity tracks **installation state**, while actual app content (entities, actions, etc.) lives in their respective MJ core metadata entities, linked implicitly by schema name and metadata ownership.

### Migration SQL

This is the actual migration that would ship with MJ core to create the tracking tables. Follows all MJ migration conventions (no `__mj_` timestamps, no FK indexes — CodeGen handles those).

```sql
-- Migration: App Registry and Installed App tracking tables
-- These tables live in the __mj core schema and are part of MemberJunction itself,
-- not part of any individual app. They track what apps are installed in this instance.

-----------------------------------------------------------------------
-- 1. App Registries
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.AppRegistry (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    URL NVARCHAR(500) NOT NULL,
    Type NVARCHAR(20) NOT NULL DEFAULT 'Public',
    APIVersion NVARCHAR(20) NOT NULL DEFAULT 'v1',
    Description NVARCHAR(MAX) NULL,
    AuthMethod NVARCHAR(50) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_AppRegistry PRIMARY KEY (ID),
    CONSTRAINT UQ_AppRegistry_Name UNIQUE (Name),
    CONSTRAINT CK_AppRegistry_Type CHECK (Type IN ('Public', 'Private', 'Local')),
    CONSTRAINT CK_AppRegistry_Status CHECK (Status IN ('Active', 'Inactive', 'Error'))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Known app registries (MJ Central, private registries, etc.)',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'AppRegistry';
GO

-- Seed MJ Central as the default public registry
INSERT INTO ${flyway:defaultSchema}.AppRegistry (ID, Name, URL, Type, APIVersion, Description, Status)
VALUES (
    'A0E1F2A3-B4C5-D6E7-F8A9-B0C1D2E3F4A5',
    'MJ Central',
    'https://central.memberjunction.org/api/v1',
    'Public',
    'v1',
    'The official MemberJunction app registry and marketplace',
    'Active'
);
GO

-----------------------------------------------------------------------
-- 2. Installed Apps
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.InstalledApp (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(64) NOT NULL,
    DisplayName NVARCHAR(200) NOT NULL,
    Description NVARCHAR(MAX) NULL,
    Version NVARCHAR(50) NOT NULL,
    Publisher NVARCHAR(200) NOT NULL,
    PublisherEmail NVARCHAR(255) NULL,
    PublisherURL NVARCHAR(500) NULL,
    RepositoryURL NVARCHAR(500) NOT NULL,
    SchemaName NVARCHAR(128) NULL,
    MJVersionRange NVARCHAR(100) NOT NULL,
    License NVARCHAR(50) NULL,
    Icon NVARCHAR(100) NULL,
    Color NVARCHAR(20) NULL,
    ManifestJSON NVARCHAR(MAX) NOT NULL,
    ConfigurationSchemaJSON NVARCHAR(MAX) NULL,
    RegistryID UNIQUEIDENTIFIER NULL,
    InstalledAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    UpdatedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    InstalledByUserID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_InstalledApp PRIMARY KEY (ID),
    CONSTRAINT UQ_InstalledApp_Name UNIQUE (Name),
    CONSTRAINT UQ_InstalledApp_Schema UNIQUE (SchemaName),
    CONSTRAINT FK_InstalledApp_Registry FOREIGN KEY (RegistryID)
        REFERENCES ${flyway:defaultSchema}.AppRegistry(ID),
    CONSTRAINT FK_InstalledApp_User FOREIGN KEY (InstalledByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_InstalledApp_Status CHECK (Status IN (
        'Active', 'Disabled', 'Error', 'Installing', 'Upgrading', 'Removing'
    )),
    CONSTRAINT CK_InstalledApp_Name CHECK (Name NOT LIKE '%[^a-z0-9-]%')
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Tracks all MJ Open Apps installed in this instance',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalledApp';
GO

-----------------------------------------------------------------------
-- 3. Installed App Versions (audit trail)
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.InstalledAppVersion (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InstalledAppID UNIQUEIDENTIFIER NOT NULL,
    Version NVARCHAR(50) NOT NULL,
    PreviousVersion NVARCHAR(50) NULL,
    Action NVARCHAR(20) NOT NULL,
    ManifestJSON NVARCHAR(MAX) NOT NULL,
    MigrationsSummary NVARCHAR(MAX) NULL,
    MetadataSummary NVARCHAR(MAX) NULL,
    PackagesSummary NVARCHAR(MAX) NULL,
    ExecutedAt DATETIMEOFFSET NOT NULL DEFAULT GETUTCDATE(),
    ExecutedByUserID UNIQUEIDENTIFIER NOT NULL,
    DurationSeconds INT NULL,
    Success BIT NOT NULL DEFAULT 1,
    ErrorMessage NVARCHAR(MAX) NULL,
    ErrorPhase NVARCHAR(50) NULL,
    CONSTRAINT PK_InstalledAppVersion PRIMARY KEY (ID),
    CONSTRAINT FK_InstalledAppVersion_App FOREIGN KEY (InstalledAppID)
        REFERENCES ${flyway:defaultSchema}.InstalledApp(ID),
    CONSTRAINT FK_InstalledAppVersion_User FOREIGN KEY (ExecutedByUserID)
        REFERENCES ${flyway:defaultSchema}.[User](ID),
    CONSTRAINT CK_InstalledAppVersion_Action CHECK (Action IN (
        'Install', 'Upgrade', 'Rollback', 'Remove'
    )),
    CONSTRAINT CK_InstalledAppVersion_Phase CHECK (ErrorPhase IS NULL OR ErrorPhase IN (
        'Schema', 'Migration', 'Metadata', 'Packages', 'Manifest', 'Hooks', 'CodeGen'
    ))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Audit trail of every install, upgrade, rollback, and removal for installed apps',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalledAppVersion';
GO

-----------------------------------------------------------------------
-- 4. Installed App Packages
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.InstalledAppPackage (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InstalledAppID UNIQUEIDENTIFIER NOT NULL,
    PackageName NVARCHAR(200) NOT NULL,
    PackageVersion NVARCHAR(50) NOT NULL,
    PackageType NVARCHAR(20) NOT NULL,
    Role NVARCHAR(50) NOT NULL,
    HasClassManifest BIT NOT NULL DEFAULT 0,
    RegistryURL NVARCHAR(500) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Installed',
    CONSTRAINT PK_InstalledAppPackage PRIMARY KEY (ID),
    CONSTRAINT FK_InstalledAppPackage_App FOREIGN KEY (InstalledAppID)
        REFERENCES ${flyway:defaultSchema}.InstalledApp(ID),
    CONSTRAINT UQ_InstalledAppPackage UNIQUE (InstalledAppID, PackageName),
    CONSTRAINT CK_InstalledAppPackage_Type CHECK (PackageType IN (
        'Server', 'Client', 'Shared'
    )),
    CONSTRAINT CK_InstalledAppPackage_Status CHECK (Status IN (
        'Installed', 'Error', 'Pending'
    ))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'NPM packages associated with each installed app',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalledAppPackage';
GO

-----------------------------------------------------------------------
-- 5. Installed App Dependencies
-----------------------------------------------------------------------
CREATE TABLE ${flyway:defaultSchema}.InstalledAppDependency (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    InstalledAppID UNIQUEIDENTIFIER NOT NULL,
    DependsOnAppName NVARCHAR(64) NOT NULL,
    DependsOnAppID UNIQUEIDENTIFIER NULL,
    VersionRange NVARCHAR(100) NOT NULL,
    InstalledVersion NVARCHAR(50) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'Satisfied',
    CONSTRAINT PK_InstalledAppDependency PRIMARY KEY (ID),
    CONSTRAINT FK_InstalledAppDep_App FOREIGN KEY (InstalledAppID)
        REFERENCES ${flyway:defaultSchema}.InstalledApp(ID),
    CONSTRAINT FK_InstalledAppDep_DepApp FOREIGN KEY (DependsOnAppID)
        REFERENCES ${flyway:defaultSchema}.InstalledApp(ID),
    CONSTRAINT UQ_InstalledAppDep UNIQUE (InstalledAppID, DependsOnAppName),
    CONSTRAINT CK_InstalledAppDep_Status CHECK (Status IN (
        'Satisfied', 'Missing', 'Incompatible'
    ))
);
GO

EXEC sp_addextendedproperty
    @name = N'MS_Description',
    @value = N'Inter-app dependency relationships between installed apps',
    @level0type = N'SCHEMA', @level0name = N'${flyway:defaultSchema}',
    @level1type = N'TABLE',  @level1name = N'InstalledAppDependency';
GO
```

**Notes on the migration:**
- Uses `${flyway:defaultSchema}` throughout — this resolves to `__mj` since these are core MJ tables
- No `__mj_CreatedAt` / `__mj_UpdatedAt` columns — CodeGen adds those automatically
- No FK indexes — CodeGen creates `IDX_AUTO_MJ_FKEY_*` indexes automatically
- The `InstalledApp` and `InstalledAppVersion` timestamps (`InstalledAt`, `UpdatedAt`, `ExecutedAt`) are business fields distinct from the system audit columns CodeGen manages
- MJ Central is pre-seeded with a hardcoded UUID so it exists out of the box
- The `SchemaName` UNIQUE constraint on `InstalledApp` prevents two apps from claiming the same database schema

---

## Configuration Integration

### App Configuration in `mj.config.cjs`

Apps that need runtime configuration declare a schema in their manifest. Consumers provide values under `apps`:

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

### Environment Variables

Apps MAY reference environment variables in metadata using `@env:` directives:
```json
{ "fields": { "APIKey": "@env:ACME_CRM_API_KEY" } }
```

---

## MJ Central Integration

MJ Central is the hosted registry and marketplace. It wraps this open standard with discovery UI.

### Registry API

```
GET  /api/v1/apps                              # List all published apps
GET  /api/v1/apps/search?q=crm&category=sales  # Search
GET  /api/v1/apps/{name}                       # App details
GET  /api/v1/apps/{name}/versions              # All versions
GET  /api/v1/apps/{name}/versions/{version}    # Specific version manifest
POST /api/v1/apps/{name}/reviews               # Submit a review
```

### Publishing

Publishers register apps by providing their GitHub URL. MJ Central monitors for new tagged releases, fetches/validates manifests, and indexes for discovery.

### CLI Integration

```
mj app search "crm"                           # Search MJ Central
mj app install acme-crm                       # Install by name (resolves via MJ Central)
mj app install https://github.com/acme/mj-crm # Install by URL (bypasses MJ Central)
```

---

## Security Considerations

- **Schema isolation** — Apps can't modify `__mj` or other app schemas. CLI validates migration files.
- **Code trust** — Apps run with server privileges. Installing is a trust decision. MJ Central may offer verified publisher badges and security scanning.
- **Metadata safety** — mj-sync validates before pushing. `@lookup` references are resolved against live DB. `@file:` references are scoped to the app's metadata directory.

---

## Open Questions

1. **Schema name uniqueness** — Should MJ Central maintain a global registry of schema names, or enforce locally only?
2. **Transitive dependencies** — Should `mj app install A` auto-install B if A depends on B?
3. **MJ major version upgrades** — How do apps declare migration paths across MJ breaking changes?
4. **Cross-app metadata references** — Can app A's metadata `@lookup:` entities defined by app B?
5. **Rollback strategy** — Should `mj app upgrade` support automatic rollback on failure?
6. **CodeGen for app entities** — Should app entities participate in MJ core CodeGen output, or should apps maintain their own generated classes?
7. **Angular lazy loading** — How do app Angular modules get lazy-loaded in MJExplorer?
8. **App permissions** — Should there be an app-level permission system beyond entity-level permissions?

---

## Future Enhancements

- **App Templates** — `mj app create --template crm`
- **App Bundles** — Group multiple apps into a single installable bundle
- **Marketplace Reviews** — Ratings and reviews on MJ Central
- **Dependency Visualization** — Graph view of installed apps and dependencies
- **Hot Reload** — Metadata-only updates without server restart
- **App-Scoped Permissions** — Fine-grained access control per app
