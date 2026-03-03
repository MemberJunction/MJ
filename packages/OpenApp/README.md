# MemberJunction Open Apps

Open Apps is MemberJunction's plugin and distribution system for self-contained applications that run on the MJ platform. An Open App bundles everything needed — database schema, migrations, metadata, server-side logic, and client-side UI components — into a single installable unit managed through the MJ CLI.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [What You Need to Build an Open App](#what-you-need-to-build-an-open-app)
  - [1. The App Manifest (`mj-app.json`)](#1-the-app-manifest-mj-appjson)
  - [2. Database Migrations](#2-database-migrations)
  - [3. Metadata (Optional)](#3-metadata-optional)
  - [4. npm Packages](#4-npm-packages)
  - [5. GitHub Repository with Releases](#5-github-repository-with-releases)
- [Repository Structure](#repository-structure)
- [Building Server-Side Packages](#building-server-side-packages)
- [Building Client-Side Packages](#building-client-side-packages)
- [App Manifest Reference](#app-manifest-reference)
- [Installation Lifecycle](#installation-lifecycle)
- [CLI Commands](#cli-commands)
- [How It All Connects](#how-it-all-connects)
- [Worked Example: Acme CRM](#worked-example-acme-crm)
- [Key Concepts](#key-concepts)
- [Troubleshooting](#troubleshooting)

---

## Overview

An Open App is a **versioned, installable extension** for MemberJunction that:

- **Owns a dedicated database schema** — preventing collisions with MJ core (`__mj`) or other apps
- **Ships as npm packages** — server packages load into MJAPI, client packages load into MJExplorer
- **Uses semantic versioning** — versions come from GitHub release tags
- **Manages its own migrations** — Skyway (Flyway-compatible) runs SQL migrations scoped to the app's schema
- **Declares metadata** — entities, actions, prompts, and UI configurations are pushed via `mj-sync`
- **Supports dependency chains** — apps can depend on other Open Apps with semver ranges
- **Has a full lifecycle** — install, upgrade, disable, enable, and remove via the `mj` CLI

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Repository                         │
│  mj-app.json  │  migrations/  │  metadata/  │  packages/    │
└───────┬─────────────────────────────────────────────────────┘
        │  mj app install https://github.com/acme/mj-crm
        ▼
┌─────────────────────────────────────────────────────────────┐
│                    MJ CLI (Orchestrator)                      │
│                                                               │
│  1. Fetch manifest from GitHub                                │
│  2. Validate manifest (Zod schema)                            │
│  3. Check MJ version compatibility                            │
│  4. Resolve + install dependencies                            │
│  5. Create database schema                                    │
│  6. Run Skyway migrations                                     │
│  7. Add npm packages to MJAPI/MJExplorer package.json         │
│  8. Run npm install                                           │
│  9. Update mj.config.cjs (server dynamic packages)            │
│  10. Regenerate open-app-bootstrap.generated.ts (client)      │
│  11. Execute lifecycle hooks                                  │
│  12. Record installation in MJ: Open Apps entity              │
└─────────────────────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────┐     ┌─────────────────────────┐
│  MJAPI (Server)      │     │  MJExplorer (Client)     │
│                      │     │                          │
│  mj.config.cjs       │     │  open-app-bootstrap      │
│  dynamicPackages: {  │     │  .generated.ts           │
│    server: [         │     │                          │
│      @acme/mj-crm-   │     │  import '@acme/mj-crm-  │
│       server          │     │   ng-bootstrap';         │
│    ]                  │     │                          │
│  }                   │     │  // Triggers              │
│                      │     │  // @RegisterClass        │
│  Loads on startup ──►│     │  // decorators            │
│  Calls startup export│     │                          │
└─────────────────────┘     └─────────────────────────┘
```

---

## What You Need to Build an Open App

### 1. The App Manifest (`mj-app.json`)

Every Open App has a `mj-app.json` file at the repository root. This is the single source of truth for the app's identity, packages, schema, and configuration.

```json
{
  "manifestVersion": 1,
  "name": "acme-crm",
  "displayName": "Acme CRM",
  "description": "Customer relationship management for MemberJunction",
  "version": "1.0.0",
  "license": "MIT",
  "icon": "fa-solid fa-handshake",
  "color": "#2196f3",

  "publisher": {
    "name": "Acme Corporation",
    "email": "dev@acme.com",
    "url": "https://acme.com"
  },

  "repository": "https://github.com/acme/mj-crm",
  "mjVersionRange": ">=5.0.0 <6.0.0",

  "schema": {
    "name": "acme_crm",
    "createIfNotExists": true
  },

  "migrations": {
    "directory": "migrations",
    "engine": "skyway"
  },

  "metadata": {
    "directory": "metadata"
  },

  "packages": {
    "server": [
      {
        "name": "@acme/mj-crm-server",
        "role": "bootstrap",
        "startupExport": "LoadAcmeCRM"
      }
    ],
    "client": [
      {
        "name": "@acme/mj-crm-ng-bootstrap",
        "role": "bootstrap",
        "startupExport": "LoadAcmeCRMComponents"
      }
    ],
    "shared": [
      {
        "name": "@acme/mj-crm-core",
        "role": "library"
      }
    ]
  },

  "dependencies": {
    "some-other-app": ">=1.0.0"
  },

  "hooks": {
    "postInstall": "node scripts/post-install.js",
    "postUpgrade": "node scripts/post-upgrade.js",
    "preRemove": "node scripts/pre-remove.js"
  },

  "categories": ["crm", "sales"],
  "tags": ["customer-management", "contacts", "deals"]
}
```

#### Manifest Field Rules

| Field | Required | Description |
|-------|----------|-------------|
| `manifestVersion` | Yes | Must be `1` |
| `name` | Yes | Lowercase alphanumeric + hyphens, 3-64 chars (e.g., `acme-crm`) |
| `displayName` | Yes | Human-readable name, max 200 chars |
| `description` | Yes | 10-500 chars |
| `version` | Yes | Valid semver (e.g., `1.0.0`, `2.1.0-beta.1`) |
| `publisher` | Yes | Object with `name` (required), `email` and `url` (optional) |
| `repository` | Yes | GitHub URL (e.g., `https://github.com/acme/mj-crm`) |
| `mjVersionRange` | Yes | Semver range for MJ compatibility (e.g., `>=5.0.0 <6.0.0`) |
| `schema` | No | Database schema config (`name` must be lowercase + underscores, 3-128 chars) |
| `migrations` | No | Migration config (default engine: `skyway`, default directory: `migrations`) |
| `metadata` | No | Dev-time metadata directory (not processed at install) |
| `packages` | Yes | npm packages grouped by `server`, `client`, `shared` |
| `dependencies` | No | Other Open Apps this app depends on (semver ranges) |
| `hooks` | No | Lifecycle shell commands (`postInstall`, `postUpgrade`, `preRemove`) |
| `categories` | No | Up to 5 discovery categories |
| `tags` | No | Up to 20 discovery tags (lowercase + hyphens) |

#### Package Roles

Each package entry has a `role` that describes its purpose:

| Role | Description | `startupExport` Required? |
|------|-------------|---------------------------|
| `bootstrap` | Entry point loaded at startup; triggers `@RegisterClass` decorators | **Yes** |
| `actions` | MJ Action implementations | No |
| `engine` | Business logic engine classes | No |
| `provider` | Data providers or integrations | No |
| `module` | Angular modules | No |
| `components` | Angular components | No |
| `library` | Shared utilities and types | No |

> **Important**: Packages with `role: "bootstrap"` **must** have a `startupExport` — the named export that the MJ runtime calls to initialize the package and trigger `@RegisterClass` decorators.

---

### 2. Database Migrations

If your app needs its own database tables, place SQL migration files in the `migrations/` directory (or wherever `migrations.directory` points in your manifest).

#### Migration File Naming

Skyway uses Flyway-compatible versioned migration naming:

```
V1__Initial_schema.sql
V2__Add_contacts_table.sql
V3__Add_deals_pipeline.sql
V1.1__Add_contact_notes.sql
```

Rules:
- Prefix with `V` followed by a version number
- Double underscore (`__`) separates version from description
- Underscores in the description replace spaces
- Files are applied in version order
- Once applied, a migration is **never re-run** (tracked in `flyway_schema_history`)

#### Migration Content

All migrations run against the app's own schema. Use `${flyway:defaultSchema}` as a placeholder for portability:

```sql
-- V1__Initial_schema.sql
CREATE TABLE ${flyway:defaultSchema}.Contact (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255),
    Phone NVARCHAR(50),
    CompanyName NVARCHAR(200),
    Status NVARCHAR(20) NOT NULL DEFAULT 'Active',
    CONSTRAINT PK_Contact PRIMARY KEY (ID),
    CONSTRAINT CK_Contact_Status CHECK (Status IN ('Active', 'Inactive', 'Lead'))
);

CREATE TABLE ${flyway:defaultSchema}.Deal (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    ContactID UNIQUEIDENTIFIER NOT NULL,
    Amount DECIMAL(18,2),
    Stage NVARCHAR(50) NOT NULL DEFAULT 'Prospecting',
    CONSTRAINT PK_Deal PRIMARY KEY (ID),
    CONSTRAINT FK_Deal_Contact FOREIGN KEY (ContactID)
        REFERENCES ${flyway:defaultSchema}.Contact(ID)
);
```

> **Note**: Do NOT include `__mj_CreatedAt`/`__mj_UpdatedAt` columns or foreign key indexes — MJ's CodeGen handles those automatically after entity registration.

---

### 3. Metadata (Optional)

The `metadata/` directory holds declarative JSON files that define MJ entities, actions, prompts, and other records managed by `mj-sync`. This is a development-time concern — `mj-sync push` is used during development to push metadata into the database, and the install orchestrator does **not** process this directory at install time (it relies on migrations for DDL and seed data).

Typical structure:

```
metadata/
├── actions/
│   └── .acme-crm-actions.json
├── applications/
│   └── .acme-crm-application.json
├── prompts/
│   └── .acme-crm-prompts.json
└── queries/
    └── .acme-crm-queries.json
```

---

### 4. npm Packages

Your app ships as one or more npm packages. At minimum, you typically need:

#### Server Bootstrap Package

This package contains server-side logic (actions, providers, engine classes) and a bootstrap export that triggers `@RegisterClass` decorators:

```typescript
// packages/server/src/index.ts
import { RegisterClass } from '@memberjunction/global';
import { BaseAction } from '@memberjunction/actions';

@RegisterClass(BaseAction, 'Acme CRM: Create Contact')
export class CreateContactAction extends BaseAction {
    // ... implementation
}

@RegisterClass(BaseAction, 'Acme CRM: Create Deal')
export class CreateDealAction extends BaseAction {
    // ... implementation
}

/**
 * Bootstrap export called by MJAPI at startup.
 * Simply importing this module triggers the @RegisterClass decorators above.
 */
export function LoadAcmeCRM(): void {
    // No-op — the import side-effects register everything
}
```

The `startupExport` in the manifest (`"LoadAcmeCRM"`) tells MJAPI which named export to call after dynamically importing the package.

#### Client Bootstrap Package

This package contains Angular components and a bootstrap export:

```typescript
// packages/ng-bootstrap/src/index.ts
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { AcmeCRMDashboardComponent } from './dashboard/dashboard.component';
import { AcmeCRMContactsComponent } from './contacts/contacts.component';

// Register components with MJ's class factory
@RegisterClass(BaseResourceComponent, 'AcmeCRMDashboard')
export class AcmeCRMDashboardResource extends AcmeCRMDashboardComponent {}

@RegisterClass(BaseResourceComponent, 'AcmeCRMContacts')
export class AcmeCRMContactsResource extends AcmeCRMContactsComponent {}

/**
 * Tree-shaking prevention + bootstrap export.
 * Called via the static import in open-app-bootstrap.generated.ts.
 */
export function LoadAcmeCRMComponents(): void {
    // No-op — the import side-effects register everything
}
```

#### Shared Library Package (Optional)

Types, utilities, and business logic shared between server and client:

```typescript
// packages/core/src/index.ts
export interface AcmeContact {
    ID: string;
    FirstName: string;
    LastName: string;
    Email?: string;
    Phone?: string;
    CompanyName?: string;
    Status: 'Active' | 'Inactive' | 'Lead';
}

export interface AcmeDeal {
    ID: string;
    Name: string;
    ContactID: string;
    Amount?: number;
    Stage: string;
}
```

---

### 5. GitHub Repository with Releases

The CLI fetches your app manifest and migrations from GitHub. Your repository must:

1. **Have a `mj-app.json` at the root**
2. **Use GitHub Releases** with semver tags (e.g., `v1.0.0`, `v1.1.0`)
3. **Publish npm packages** to a registry (npmjs.com or a private registry)

The version in `mj-app.json` should match the GitHub release tag (minus the `v` prefix).

---

## Repository Structure

Here's the recommended directory layout for an Open App repository:

```
acme-mj-crm/
├── mj-app.json                          # App manifest (REQUIRED)
├── package.json                         # Root package.json for npm workspace
├── tsconfig.json                        # Root TypeScript config
│
├── migrations/                          # Database migrations
│   ├── V1__Initial_schema.sql
│   ├── V2__Add_notes_table.sql
│   └── V3__Add_pipeline_stages.sql
│
├── metadata/                            # MJ metadata (dev-time, mj-sync)
│   ├── actions/
│   │   └── .acme-crm-actions.json
│   ├── applications/
│   │   └── .acme-crm-application.json
│   └── prompts/
│       └── .acme-crm-prompts.json
│
├── packages/
│   ├── core/                            # Shared library (@acme/mj-crm-core)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       └── index.ts
│   │
│   ├── server/                          # Server package (@acme/mj-crm-server)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                 # Exports LoadAcmeCRM()
│   │       └── actions/
│   │           ├── create-contact.ts
│   │           └── create-deal.ts
│   │
│   └── ng-bootstrap/                    # Client package (@acme/mj-crm-ng-bootstrap)
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts                 # Exports LoadAcmeCRMComponents()
│           ├── dashboard/
│           │   ├── dashboard.component.ts
│           │   └── dashboard.component.html
│           └── contacts/
│               ├── contacts.component.ts
│               └── contacts.component.html
│
└── scripts/                             # Lifecycle hooks (optional)
    ├── post-install.js
    └── post-upgrade.js
```

---

## Building Server-Side Packages

Server packages are loaded by MJAPI at startup through the `dynamicPackages.server` array in `mj.config.cjs`. When installed, the CLI adds entries like:

```javascript
// mj.config.cjs (auto-managed by CLI)
module.exports = {
  // ... existing config ...
  dynamicPackages: {
    server: [
      {
        PackageName: '@acme/mj-crm-server',
        StartupExport: 'LoadAcmeCRM',
        AppName: 'acme-crm',
        Enabled: true
      }
    ]
  }
};
```

At MJAPI startup:
1. MJAPI reads `dynamicPackages.server`
2. For each enabled entry, it calls `import(PackageName)`
3. It then calls the `StartupExport` function (e.g., `LoadAcmeCRM()`)
4. This triggers all `@RegisterClass` decorators in the package

### Server Package Requirements

Your server package should:
- Export a named function matching `startupExport` in the manifest
- Use `@RegisterClass` decorators for all classes that need to be discoverable (actions, providers, etc.)
- Depend on `@memberjunction/global` (for `RegisterClass`) and any MJ packages it needs
- Be published to npm (or a private registry specified in `packages.registry`)

---

## Building Client-Side Packages

Client packages are loaded by MJExplorer through static imports in the auto-generated `open-app-bootstrap.generated.ts` file. When installed, the CLI adds:

```typescript
// packages/MJExplorer/src/app/generated/open-app-bootstrap.generated.ts
// AUTO-GENERATED — do not edit

// acme-crm (v1.0.0)
import '@acme/mj-crm-ng-bootstrap';
```

This static import ensures ESBuild includes your package in the bundle and triggers `@RegisterClass` decorators at module evaluation time.

### Creating Resource Components

Resource components are Angular components that render as tabs within MJ Explorer applications. Each component:

1. **Extends `BaseResourceComponent`** from `@memberjunction/ng-shared`
2. **Registers with `@RegisterClass`** using a unique driver class name
3. **Implements required abstract methods** for display name and icon

```typescript
import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';

@RegisterClass(BaseResourceComponent, 'AcmeCRMDashboard')
@Component({
  selector: 'acme-crm-dashboard',
  template: `
    <div class="dashboard-container">
      <h2>CRM Dashboard</h2>
      <!-- Your dashboard content -->
    </div>
  `
})
export class AcmeCRMDashboardComponent extends BaseResourceComponent {
  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    return 'CRM Dashboard';
  }

  async GetResourceIconClass(data: ResourceData): Promise<string> {
    return 'fa-solid fa-chart-line';
  }

  ngOnInit(): void {
    // Access context via this.Data (ResourceData)
    const config = this.Data.Configuration;

    // Load your data, then signal completion
    this.LoadData().then(() => this.NotifyLoadComplete());
  }

  private async LoadData(): Promise<void> {
    // Your data loading logic
  }
}
```

### Defining Application Nav Items

To make your resource components appear in MJ Explorer as navigable tabs, define an application in your metadata:

```json
{
  "fields": {
    "Name": "Acme CRM",
    "Description": "Customer relationship management",
    "Icon": "fa-solid fa-handshake",
    "Color": "#2196f3",
    "DefaultForNewUser": false,
    "DefaultSequence": 100,
    "Status": "Active",
    "NavigationStyle": "Both",
    "DefaultNavItems": [
      {
        "Label": "Dashboard",
        "Icon": "fa-solid fa-chart-line",
        "ResourceType": "Custom",
        "DriverClass": "AcmeCRMDashboard",
        "isDefault": true
      },
      {
        "Label": "Contacts",
        "Icon": "fa-solid fa-address-book",
        "ResourceType": "Custom",
        "DriverClass": "AcmeCRMContacts",
        "isDefault": false
      },
      {
        "Label": "Deals",
        "Icon": "fa-solid fa-money-bill-trend-up",
        "ResourceType": "Custom",
        "DriverClass": "AcmeCRMDeals",
        "isDefault": false
      }
    ]
  }
}
```

The `DriverClass` value must exactly match the second argument of `@RegisterClass(BaseResourceComponent, 'DriverClass')`.

### Nav Item Types

| Pattern | `ResourceType` | `DriverClass` | `RecordID` | Use Case |
|---------|---------------|---------------|------------|----------|
| Custom Component | `"Custom"` | Required | Optional | Your own Angular component |
| Dashboard | `"Dashboards"` | Not needed | Required | Load an MJ Dashboard record |
| Route | N/A | N/A | N/A | Navigate to a URL route (use `Route` field) |

---

## App Manifest Reference

### Identity Fields

| Field | Type | Validation |
|-------|------|------------|
| `name` | string | `/^[a-z][a-z0-9-]{1,62}[a-z0-9]$/` (3-64 chars, lowercase + hyphens) |
| `displayName` | string | 1-200 chars |
| `description` | string | 10-500 chars |
| `version` | string | Valid semver (supports pre-release + build metadata) |
| `icon` | string | Font Awesome class (optional) |
| `color` | string | Hex color `#RRGGBB` (optional) |

### Schema Configuration

```json
{
  "schema": {
    "name": "acme_crm",
    "createIfNotExists": true
  }
}
```

- `name`: Lowercase alphanumeric + underscores, 3-128 chars (`/^[a-z][a-z0-9_]{1,126}[a-z0-9]$/`)
- `createIfNotExists`: If `true` (default), the CLI creates the schema during install

### Package Configuration

```json
{
  "packages": {
    "registry": "https://npm.acme.com",
    "server": [
      { "name": "@acme/mj-crm-server", "role": "bootstrap", "startupExport": "LoadAcmeCRM" }
    ],
    "client": [
      { "name": "@acme/mj-crm-ng-bootstrap", "role": "bootstrap", "startupExport": "LoadAcmeCRMComponents" }
    ],
    "shared": [
      { "name": "@acme/mj-crm-core", "role": "library" }
    ]
  }
}
```

- `registry`: Optional custom npm registry URL (defaults to npmjs.com)
- `server`: Packages added to `packages/MJAPI/package.json`
- `client`: Packages added to `packages/MJExplorer/package.json`
- `shared`: Packages added to **both** MJAPI and MJExplorer

### Dependencies

Dependencies can be a simple semver range string or an object with version and repository:

```json
{
  "dependencies": {
    "some-app": ">=1.0.0",
    "another-app": {
      "version": ">=2.0.0",
      "repository": "https://github.com/org/another-app"
    }
  }
}
```

When the dependency includes a `repository`, the CLI will automatically install it if it's not already present.

---

## Installation Lifecycle

### Install Flow (`mj app install`)

| Step | Phase | What Happens |
|------|-------|-------------|
| 1 | Fetch | Download `mj-app.json` from GitHub at the specified (or latest) tag |
| 2 | Validate | Parse and validate manifest against Zod schema |
| 3 | Compatibility | Check `mjVersionRange` against the running MJ version |
| 4 | Dependencies | Resolve dependency graph with topological sort |
| 5 | Dependencies | Recursively install any missing dependency apps |
| 6 | Schema | Check for schema name collisions |
| 7 | Schema | Create the database schema (`CREATE SCHEMA acme_crm`) |
| 8 | Migrations | Download and run Skyway migrations against the app's schema |
| 9 | Record | Create `MJ: Open Apps` record with status `Installing` |
| 10 | Packages | Add npm packages to MJAPI/MJExplorer `package.json` files |
| 11 | Packages | Run `npm install` from the monorepo root |
| 12 | Config | Add entries to `dynamicPackages.server` in `mj.config.cjs` |
| 13 | Config | Regenerate `open-app-bootstrap.generated.ts` for client imports |
| 14 | Hooks | Execute `postInstall` hook (if defined) |
| 15 | Finalize | Set app status to `Active` and record install history |

If any step fails, the orchestrator attempts compensating actions (e.g., dropping a newly created schema) and records the failure in the install history.

### Upgrade Flow (`mj app upgrade`)

Similar to install, but:
- Validates that the target version is newer than the installed version
- Reuses the existing schema (Skyway only applies new migrations)
- Updates the existing `MJ: Open Apps` record
- Runs `postUpgrade` hook instead of `postInstall`

### Remove Flow (`mj app remove`)

1. Check for dependent apps (fails unless `--force`)
2. Run `preRemove` hook
3. Remove config entries, client bootstrap imports, and npm package references (in parallel)
4. Run `npm install` to clean up
5. Remove entity metadata for the app's schema
6. Drop the database schema (unless `--keep-data`)
7. Set app status to `Removed`

---

## CLI Commands

```bash
# Install an app from GitHub
mj app install https://github.com/acme/mj-crm
mj app install https://github.com/acme/mj-crm --version 1.2.0

# Upgrade an installed app
mj app upgrade acme-crm
mj app upgrade acme-crm --version 2.0.0

# Remove an installed app
mj app remove acme-crm
mj app remove acme-crm --keep-data    # Preserve database schema
mj app remove acme-crm --force         # Remove even if other apps depend on it

# List installed apps
mj app list

# Show app details
mj app info acme-crm

# Disable/enable without removing
mj app disable acme-crm
mj app enable acme-crm

# Check for available updates
mj app check-updates
```

After install/upgrade/remove, you must:
1. **Restart MJAPI** to pick up server-side package changes
2. **Rebuild MJExplorer** to bundle the new client-side imports

---

## How It All Connects

### Server Side

1. **`mj.config.cjs`** gets a new entry in `dynamicPackages.server`:
   ```javascript
   { PackageName: '@acme/mj-crm-server', StartupExport: 'LoadAcmeCRM', AppName: 'acme-crm', Enabled: true }
   ```
2. **MJAPI startup** reads this config and dynamically imports the package
3. The import triggers `@RegisterClass` decorators, registering your actions/providers with MJ's `ClassFactory`
4. MJ's runtime can now discover and execute your registered classes

### Client Side

1. **`open-app-bootstrap.generated.ts`** gets a static import:
   ```typescript
   import '@acme/mj-crm-ng-bootstrap';
   ```
2. **ESBuild** includes your package in the MJExplorer bundle
3. The import triggers `@RegisterClass(BaseResourceComponent, 'AcmeCRMDashboard')` decorators
4. When a user navigates to your app, MJ Explorer:
   - Reads the application's `DefaultNavItems` JSON
   - Finds `DriverClass: "AcmeCRMDashboard"`
   - Looks up the component via `ClassFactory.GetRegistration(BaseResourceComponent, 'AcmeCRMDashboard')`
   - Instantiates and renders your component in a tab

### Database

1. Your app's schema (e.g., `acme_crm`) is created automatically
2. Skyway runs your migrations against that schema
3. A `flyway_schema_history` table tracks applied migrations within the schema
4. MJ CodeGen can register your tables as MJ entities for full CRUD support

---

## Worked Example: Acme CRM

### Step 1: Create the manifest

```json
// mj-app.json
{
  "manifestVersion": 1,
  "name": "acme-crm",
  "displayName": "Acme CRM",
  "description": "Simple CRM with contacts and deals management",
  "version": "1.0.0",
  "license": "MIT",
  "icon": "fa-solid fa-handshake",
  "color": "#4caf50",
  "publisher": { "name": "Acme Corp" },
  "repository": "https://github.com/acme/mj-crm",
  "mjVersionRange": ">=5.0.0 <6.0.0",
  "schema": { "name": "acme_crm" },
  "migrations": { "directory": "migrations" },
  "packages": {
    "server": [
      { "name": "@acme/mj-crm-server", "role": "bootstrap", "startupExport": "LoadAcmeCRM" }
    ],
    "client": [
      { "name": "@acme/mj-crm-ng-bootstrap", "role": "bootstrap", "startupExport": "LoadAcmeCRMComponents" }
    ]
  }
}
```

### Step 2: Write migrations

```sql
-- migrations/V1__Initial_schema.sql
CREATE TABLE ${flyway:defaultSchema}.Contact (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Email NVARCHAR(255),
    CompanyName NVARCHAR(200),
    CONSTRAINT PK_Contact PRIMARY KEY (ID)
);

CREATE TABLE ${flyway:defaultSchema}.Deal (
    ID UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID(),
    Name NVARCHAR(200) NOT NULL,
    ContactID UNIQUEIDENTIFIER NOT NULL,
    Amount DECIMAL(18,2),
    Stage NVARCHAR(50) NOT NULL DEFAULT 'Prospecting',
    CONSTRAINT PK_Deal PRIMARY KEY (ID),
    CONSTRAINT FK_Deal_Contact FOREIGN KEY (ContactID)
        REFERENCES ${flyway:defaultSchema}.Contact(ID)
);
```

### Step 3: Build server package

```typescript
// packages/server/src/index.ts
import { RegisterClass } from '@memberjunction/global';
import { BaseAction, RunActionParams } from '@memberjunction/actions';
import { UserInfo } from '@memberjunction/core';

@RegisterClass(BaseAction, 'Acme CRM: Create Contact')
export class CreateContactAction extends BaseAction {
    async Run(params: RunActionParams, contextUser: UserInfo): Promise<void> {
        // Implementation
    }
}

export function LoadAcmeCRM(): void { /* triggers @RegisterClass */ }
```

### Step 4: Build client package

```typescript
// packages/ng-bootstrap/src/index.ts
import { Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent, ResourceData } from '@memberjunction/ng-shared';

@RegisterClass(BaseResourceComponent, 'AcmeCRMDashboard')
@Component({
  selector: 'acme-crm-dashboard',
  template: '<div><h2>CRM Dashboard</h2><p>Welcome to Acme CRM</p></div>'
})
export class AcmeCRMDashboardComponent extends BaseResourceComponent {
  async GetResourceDisplayName(data: ResourceData): Promise<string> { return 'Dashboard'; }
  async GetResourceIconClass(data: ResourceData): Promise<string> { return 'fa-solid fa-chart-line'; }
}

export function LoadAcmeCRMComponents(): void { /* triggers @RegisterClass */ }
```

### Step 5: Publish and install

```bash
# Publish packages to npm
cd packages/server && npm publish
cd packages/ng-bootstrap && npm publish

# Create a GitHub release tagged v1.0.0

# Install into a MemberJunction instance
mj app install https://github.com/acme/mj-crm

# Restart MJAPI and rebuild MJExplorer
```

---

## Key Concepts

### Schema Isolation

Each app owns a dedicated SQL Server schema (e.g., `acme_crm`). This ensures:
- No table name collisions between apps or with MJ core (`__mj` schema)
- Clean removal — `DROP SCHEMA CASCADE` removes all app tables
- Clear ownership — every table belongs to exactly one app

### Dependency Resolution

When app A depends on app B:
1. The CLI performs a topological sort of the dependency graph
2. Dependencies are installed depth-first before the dependent app
3. Dependency versions are checked with semver satisfaction
4. Removal of a depended-upon app is blocked unless `--force` is used

### Version Compatibility

- `mjVersionRange` uses standard semver range syntax (e.g., `>=5.0.0 <6.0.0`)
- The CLI checks this against the running MJ version before installation
- Upgrades must target a version newer than the currently installed version

### Dynamic Package Loading

**Server side**: MJAPI reads `mj.config.cjs` → `dynamicPackages.server[]` and dynamically imports each package, calling its `StartupExport` function.

**Client side**: Static imports in `open-app-bootstrap.generated.ts` are resolved by ESBuild at build time. The file is regenerated whenever apps are installed/removed/toggled.

### App Status Lifecycle

```
                    ┌──────────┐
         install    │Installing│
         ────────►  └────┬─────┘
                         │ success
                         ▼
                    ┌──────────┐     disable     ┌──────────┐
                    │  Active  │ ──────────────► │ Disabled │
                    └────┬─────┘ ◄────────────── └──────────┘
                         │              enable
                    upgrade│
                         ▼
                    ┌──────────┐
                    │Upgrading │
                    └────┬─────┘
                         │ success
                         ▼
                    ┌──────────┐
                    │  Active  │
                    └────┬─────┘
                         │ remove
                         ▼
                    ┌──────────┐
                    │ Removing │
                    └────┬─────┘
                         │ success
                         ▼
                    ┌──────────┐
                    │ Removed  │
                    └──────────┘

     Any phase failure ──────► ┌──────────┐
                               │  Error   │
                               └──────────┘
```

---

## Troubleshooting

### "Schema already exists"

The app's schema name collides with an existing schema. Either:
- The app was previously installed and removed with `--keep-data`
- Another app or manual process created the schema

To reinstall over a kept schema, the CLI automatically detects and reuses it.

### "Incompatible MJ version"

Your `mjVersionRange` doesn't match the running MJ version. Update the manifest to support the installed MJ version, or upgrade MJ.

### "Dependency not installed and no repository URL"

A dependency is declared as a simple version string (e.g., `"some-app": ">=1.0.0"`) but is not already installed. Either:
- Install the dependency first: `mj app install https://github.com/org/some-app`
- Use the object form with a repository URL so the CLI can auto-install it:
  ```json
  { "some-app": { "version": ">=1.0.0", "repository": "https://github.com/org/some-app" } }
  ```

### Components not appearing after install

1. Verify you restarted MJAPI and rebuilt MJExplorer
2. Check `open-app-bootstrap.generated.ts` contains your import (not commented out)
3. Check `mj.config.cjs` has your server package entry with `Enabled: true`
4. Verify your `@RegisterClass` decorator names match the `DriverClass` values in your application's `DefaultNavItems`

### Migration failures

- Check that migration files follow Flyway naming conventions (`V{version}__{description}.sql`)
- Verify SQL uses `${flyway:defaultSchema}` instead of hardcoded schema names
- Check the Skyway `flyway_schema_history` table in your app's schema for applied migration records
