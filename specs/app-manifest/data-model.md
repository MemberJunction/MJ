# Data Model: MJ Open App System

**Related Spec**: [spec.md](./spec.md)
**Created**: 2026-02-11
**Status**: Draft

---

## Overview

This document defines the database entities required to support the MJ Open App system. These entities live in the `__mj` core schema and track installed apps, their versions, dependencies, and registry information.

---

## Entity Relationship Diagram (Logical)

```
                    ┌──────────────────────┐
                    │   MJ: App Registries │
                    │──────────────────────│
                    │ ID                   │
                    │ Name                 │
                    │ URL                  │
                    │ Type                 │
                    │ APIVersion           │
                    │ Status               │
                    └──────────┬───────────┘
                               │ 1:N
                               ▼
┌──────────────────────────────────────────────────────┐
│                  MJ: Installed Apps                   │
│──────────────────────────────────────────────────────│
│ ID                                                   │
│ Name (unique)                                        │
│ DisplayName                                          │
│ Description                                          │
│ Version                                              │
│ Publisher, PublisherEmail, PublisherURL               │
│ RepositoryURL                                        │
│ SchemaName                                           │
│ MJVersionRange                                       │
│ ManifestJSON                                         │
│ Status (Active | Disabled | Error | Removing)        │
│ RegistryID → MJ: App Registries                      │
│ InstalledByUserID → Users                            │
│ License, Icon, Color                                 │
└───┬──────────────────┬───────────────────┬───────────┘
    │ 1:N              │ 1:N               │ 1:N
    ▼                  ▼                   ▼
┌─────────────┐  ┌──────────────┐  ┌──────────────────┐
│ MJ: Installed│  │ MJ: Installed│  │ MJ: Installed App│
│ App Versions │  │ App Packages │  │ Dependencies     │
│─────────────│  │──────────────│  │──────────────────│
│ ID           │  │ ID           │  │ ID               │
│ AppID        │  │ AppID        │  │ AppID            │
│ Version      │  │ PackageName  │  │ DependsOnAppID   │
│ PrevVersion  │  │ PackageType  │  │ VersionRange     │
│ Action       │  │ Role         │  │ Status           │
│ ManifestJSON │  │ HasManifest  │  └──────────────────┘
│ Success      │  │ Registry     │
│ ErrorMessage │  └──────────────┘
│ ExecutedAt   │
│ ExecutedBy   │
└─────────────┘
```

---

## Entity Definitions

### 1. MJ: App Registries

Tracks known app registries (MJ Central, private registries, etc.).

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | UNIQUEIDENTIFIER | No | NEWSEQUENTIALID() | Primary key |
| Name | NVARCHAR(200) | No | | Registry display name |
| URL | NVARCHAR(500) | No | | Base URL of the registry API |
| Type | NVARCHAR(20) | No | 'Public' | Public, Private, or Local |
| APIVersion | NVARCHAR(20) | No | 'v1' | API version string |
| Description | NVARCHAR(MAX) | Yes | | Registry description |
| AuthMethod | NVARCHAR(50) | Yes | | Authentication method: None, APIKey, OAuth, Token |
| Status | NVARCHAR(20) | No | 'Active' | Active, Inactive, Error |

**Constraints:**
- `PK_AppRegistry` PRIMARY KEY (ID)
- `UQ_AppRegistry_Name` UNIQUE (Name)
- `CK_AppRegistry_Type` CHECK (Type IN ('Public', 'Private', 'Local'))
- `CK_AppRegistry_Status` CHECK (Status IN ('Active', 'Inactive', 'Error'))

**Default Record:**
MJ Central is pre-seeded:
```sql
INSERT INTO __mj.AppRegistry (ID, Name, URL, Type, APIVersion, Status)
VALUES ('A0000000-0000-0000-0000-000000000001', 'MJ Central', 'https://central.memberjunction.org/api/v1', 'Public', 'v1', 'Active');
```

---

### 2. MJ: Installed Apps

The primary entity tracking all apps installed in this MJ instance.

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
| RegistryID | UNIQUEIDENTIFIER | Yes | | Registry this app was discovered through |
| InstalledAt | DATETIMEOFFSET | No | GETUTCDATE() | First installation timestamp |
| UpdatedAt | DATETIMEOFFSET | No | GETUTCDATE() | Last update timestamp |
| InstalledByUserID | UNIQUEIDENTIFIER | No | | User who installed the app |
| Status | NVARCHAR(20) | No | 'Active' | Active, Disabled, Error, Installing, Upgrading, Removing |

**Constraints:**
- `PK_InstalledApp` PRIMARY KEY (ID)
- `UQ_InstalledApp_Name` UNIQUE (Name)
- `UQ_InstalledApp_Schema` UNIQUE (SchemaName) — ensures no two apps share a schema
- `FK_InstalledApp_Registry` FOREIGN KEY (RegistryID) REFERENCES __mj.AppRegistry(ID)
- `FK_InstalledApp_User` FOREIGN KEY (InstalledByUserID) REFERENCES __mj.[User](ID)
- `CK_InstalledApp_Status` CHECK (Status IN ('Active', 'Disabled', 'Error', 'Installing', 'Upgrading', 'Removing'))
- `CK_InstalledApp_Name` CHECK (Name NOT LIKE '%[^a-z0-9-]%') — lowercase + hyphens only

---

### 3. MJ: Installed App Versions

Audit trail of every install, upgrade, and rollback action for each app.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | UNIQUEIDENTIFIER | No | NEWSEQUENTIALID() | Primary key |
| InstalledAppID | UNIQUEIDENTIFIER | No | | Parent app |
| Version | NVARCHAR(50) | No | | Version installed/upgraded to |
| PreviousVersion | NVARCHAR(50) | Yes | | Version before this action (NULL for initial install) |
| Action | NVARCHAR(20) | No | | Install, Upgrade, Rollback, Remove |
| ManifestJSON | NVARCHAR(MAX) | No | | Manifest snapshot at this version |
| MigrationsSummary | NVARCHAR(MAX) | Yes | | Summary of migrations applied |
| MetadataSummary | NVARCHAR(MAX) | Yes | | Summary of metadata changes |
| PackagesSummary | NVARCHAR(MAX) | Yes | | Summary of npm package changes |
| ExecutedAt | DATETIMEOFFSET | No | GETUTCDATE() | When the action was performed |
| ExecutedByUserID | UNIQUEIDENTIFIER | No | | User who performed the action |
| DurationSeconds | INT | Yes | | How long the operation took |
| Success | BIT | No | 1 | Whether the operation succeeded |
| ErrorMessage | NVARCHAR(MAX) | Yes | | Error details if failed |
| ErrorPhase | NVARCHAR(50) | Yes | | Phase where error occurred: Schema, Migration, Metadata, Packages, Manifest, Hooks |

**Constraints:**
- `PK_InstalledAppVersion` PRIMARY KEY (ID)
- `FK_InstalledAppVersion_App` FOREIGN KEY (InstalledAppID) REFERENCES __mj.InstalledApp(ID)
- `FK_InstalledAppVersion_User` FOREIGN KEY (ExecutedByUserID) REFERENCES __mj.[User](ID)
- `CK_InstalledAppVersion_Action` CHECK (Action IN ('Install', 'Upgrade', 'Rollback', 'Remove'))

---

### 4. MJ: Installed App Packages

Tracks the npm packages associated with each installed app.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | UNIQUEIDENTIFIER | No | NEWSEQUENTIALID() | Primary key |
| InstalledAppID | UNIQUEIDENTIFIER | No | | Parent app |
| PackageName | NVARCHAR(200) | No | | npm package name (e.g., @acme/mj-crm-server) |
| PackageVersion | NVARCHAR(50) | No | | Currently installed version |
| PackageType | NVARCHAR(20) | No | | Server, Client, or Shared |
| Role | NVARCHAR(50) | No | | bootstrap, actions, engine, provider, module, components, library |
| HasClassManifest | BIT | No | 0 | Whether this package contains @RegisterClass decorators |
| RegistryURL | NVARCHAR(500) | Yes | | npm registry URL (NULL = default public npm) |
| Status | NVARCHAR(20) | No | 'Installed' | Installed, Error, Pending |

**Constraints:**
- `PK_InstalledAppPackage` PRIMARY KEY (ID)
- `FK_InstalledAppPackage_App` FOREIGN KEY (InstalledAppID) REFERENCES __mj.InstalledApp(ID)
- `UQ_InstalledAppPackage` UNIQUE (InstalledAppID, PackageName) — no duplicate packages per app
- `CK_InstalledAppPackage_Type` CHECK (PackageType IN ('Server', 'Client', 'Shared'))
- `CK_InstalledAppPackage_Status` CHECK (Status IN ('Installed', 'Error', 'Pending'))

---

### 5. MJ: Installed App Dependencies

Tracks inter-app dependency relationships.

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| ID | UNIQUEIDENTIFIER | No | NEWSEQUENTIALID() | Primary key |
| InstalledAppID | UNIQUEIDENTIFIER | No | | The app that has the dependency |
| DependsOnAppName | NVARCHAR(64) | No | | Name of the required app |
| DependsOnAppID | UNIQUEIDENTIFIER | Yes | | FK to InstalledApp if the dependency is installed |
| VersionRange | NVARCHAR(100) | No | | Required semver range |
| InstalledVersion | NVARCHAR(50) | Yes | | Currently installed version of dependency |
| Status | NVARCHAR(20) | No | 'Satisfied' | Satisfied, Missing, Incompatible |

**Constraints:**
- `PK_InstalledAppDependency` PRIMARY KEY (ID)
- `FK_InstalledAppDep_App` FOREIGN KEY (InstalledAppID) REFERENCES __mj.InstalledApp(ID)
- `FK_InstalledAppDep_DepApp` FOREIGN KEY (DependsOnAppID) REFERENCES __mj.InstalledApp(ID)
- `UQ_InstalledAppDep` UNIQUE (InstalledAppID, DependsOnAppName)
- `CK_InstalledAppDep_Status` CHECK (Status IN ('Satisfied', 'Missing', 'Incompatible'))

---

## Entity Registration with MJ Metadata

These entities need to be registered in MJ's entity metadata system. The entity names follow the newer `"MJ: "` prefix convention:

| Entity Name | Base Table | Schema |
|------------|-----------|--------|
| MJ: App Registries | AppRegistry | __mj |
| MJ: Installed Apps | InstalledApp | __mj |
| MJ: Installed App Versions | InstalledAppVersion | __mj |
| MJ: Installed App Packages | InstalledAppPackage | __mj |
| MJ: Installed App Dependencies | InstalledAppDependency | __mj |

---

## Views (Generated by CodeGen)

CodeGen will generate views for each entity. Key computed/joined fields:

### vwInstalledApps
- All InstalledApp columns
- `InstalledByUser` (User.Name via InstalledByUserID join)
- `RegistryName` (AppRegistry.Name via RegistryID join)
- `PackageCount` (count of InstalledAppPackage records)
- `DependencyCount` (count of InstalledAppDependency records)

### vwInstalledAppVersions
- All InstalledAppVersion columns
- `AppName` (InstalledApp.Name via InstalledAppID join)
- `ExecutedByUser` (User.Name via ExecutedByUserID join)

### vwInstalledAppPackages
- All InstalledAppPackage columns
- `AppName` (InstalledApp.Name via InstalledAppID join)

### vwInstalledAppDependencies
- All InstalledAppDependency columns
- `AppName` (InstalledApp.Name via InstalledAppID join)
- `DependsOnAppDisplayName` (InstalledApp.DisplayName via DependsOnAppID join)

---

## Migration File

These tables would be created in a migration like:

```
V{timestamp}__v{version}.x__App_Registry_Entities.sql
```

Following MJ conventions:
- No `__mj_CreatedAt` / `__mj_UpdatedAt` columns (CodeGen adds these)
- No FK indexes (CodeGen creates `IDX_AUTO_MJ_FKEY_*` indexes)
- Use `${flyway:defaultSchema}` for the `__mj` schema
- Hardcoded UUIDs for seed data

---

## Relationship to Existing Entities

| Existing Entity | Relationship |
|----------------|-------------|
| **Users** | InstalledApp.InstalledByUserID, InstalledAppVersion.ExecutedByUserID |
| **Applications** | Apps create Application records via metadata sync (not FK — managed by mj-sync) |
| **Entities** | App entities registered through metadata sync, SchemaName links to app schema |
| **Actions** | App actions registered through metadata sync |
| **AI Prompts** | App prompts registered through metadata sync |
| **AI Agents** | App agents registered through metadata sync |
| **Dashboards** | App dashboards registered through metadata sync |

The key insight is that the `MJ: Installed Apps` entity tracks the **installation state**, while the actual app content (entities, actions, prompts, etc.) lives in their respective MJ core entities, linked implicitly by schema name and metadata ownership.
