# TSConfig Inheritance Standardization Plan

## Executive Summary

This document outlines a plan to standardize TypeScript configuration across the MemberJunction monorepo. Currently, only **9 out of 166 packages (5.4%)** properly inherit from root tsconfig files, resulting in duplicated configuration, inconsistent compiler settings, and maintenance burden.

## Current State Analysis

### Root Configuration Files

| Config | Purpose | Key Settings |
|--------|---------|--------------|
| `tsconfig.server.json` | Server/Node packages | target: es2022, module: es2022, strict: true, composite: true |
| `tsconfig.angular.json` | Angular libraries | target: es2022, module: es2022, strict: true, angularCompilerOptions |

### Inheritance Status

**Packages Properly Inheriting (9 total - 5.4%):**

From `tsconfig.server.json`:
- `AI/A2AServer`
- `AI/MCPServer`
- `MJServer`

From `tsconfig.angular.json`:
- `Angular/Explorer/base-forms`
- `Angular/Explorer/core-entity-forms`
- `Angular/Explorer/dashboards`
- `Angular/Generic/agents`
- `Angular/Generic/file-storage`

From `@tsconfig/node16`:
- `Actions/ScheduledActionsServer`
- `MJCodeGenAPI`

**Packages NOT Inheriting (157 total - 94.6%):**
These duplicate all compiler options locally, creating maintenance burden and inconsistency.

---

## Critical Anomalies Requiring Preservation

### 1. Node16 Module Resolution (MUST PRESERVE)

**Package:** `AI/MCPClient`

**Reason:** The `@modelcontextprotocol/sdk` uses ESM with explicit `.js` extensions in imports:
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
```
This pattern **requires** Node16/NodeNext module resolution. Cannot be changed to es2022.

### 2. `strict: false` Analysis

| Package | Real Strict Errors | Action Required |
|---------|-------------------|-----------------|
| **MJCore** | 643 errors | Major refactoring needed |
| **MJExportEngine** | 2 errors | Trivial fix (2 implicit any) |
| **ServerBootstrap** | 0 errors | Needs `@types/node`, not strict issue |
| **TestingFramework/*** | 0 errors | Needs `@types/jest`, not strict issue |
| **Angular/Bootstrap** | TBD | Requires ng-packagr testing |
| **Actions/ContentAutotag** | TBD | Needs investigation |

**Key Finding:** Most `strict: false` packages don't have real strict mode issues - they have missing type definitions. Only **MJCore** has substantial technical debt.

### 3. Composite Mode (PRESERVE)

These packages use `composite: true` for project references:
- `MJAPI`
- `ServerBootstrap`
- `Angular/Bootstrap`
- `ContentAutotagging`

### 4. ESNext Module (INVESTIGATE)

These packages use `module: "ESNext"` instead of `es2022`:
- `MJAPI`
- `ServerBootstrap`
- `Angular/Bootstrap`

**Question:** Is ESNext required, or can these use es2022?

### 5. Custom Path Mappings (PRESERVE)

| Package | Path Configuration |
|---------|-------------------|
| `Actions/ContentAutotag` | `@memberjunction/content-autotagging` mapping |
| `Angular/Explorer/base-application` | `baseUrl: "./"` with files array |
| `Angular/Generic/credentials` | `@angular/*` mapping |
| `Angular/Generic/markdown` | `baseUrl: "."` with files array |
| `MJExplorer` | `fs` and `@memberjunction/ng-bootstrap` mappings |
| `ContentAutotagging` | `baseUrl: "."` |

### 6. Special Configurations (PRESERVE)

- **MJAPI:** `ts-node` configuration for direct TypeScript execution
- **MJAPI:** Excludes `@types/plotly.js` (type conflicts)
- **MJExplorer, AngularElements demo:** `declaration: false` (applications, not libraries)
- **8 Angular packages:** `useDefineForClassFields: false` (Angular decorator compatibility)
- **4 packages:** `inlineSources: true` (debugging support)

---

## Implementation Plan

### Phase 1: Quick Wins (Low Risk)

**Objective:** Fix packages that incorrectly have `strict: false` due to missing type definitions.

#### 1.1 ServerBootstrap
- Add `@types/node` to devDependencies
- Enable `strict: true`
- Estimated errors: 0

#### 1.2 TestingFramework/* (CLI, Engine, EngineBase)
- Add `@types/jest` to devDependencies
- Enable `strict: true`
- Estimated errors: 0

#### 1.3 MJExportEngine
- Fix 2 implicit any errors on `cell` parameters
- Enable `strict: true`
- Estimated effort: 5 minutes

### Phase 2: Angular Package Standardization

**Objective:** Have all Angular library packages extend `tsconfig.angular.json`.

#### 2.1 Create Migration Script
```bash
# For each Angular package without extends:
# 1. Backup existing tsconfig.json
# 2. Create new tsconfig.json extending root
# 3. Preserve only local overrides (outDir, include, exclude)
# 4. Test build
```

#### 2.2 Packages to Migrate (46 Angular packages)
- `Angular/Explorer/*` (13 packages, 3 already done)
- `Angular/Generic/*` (31 packages, 2 already done)
- `Angular/Bootstrap` (special case - has composite, ESNext)

#### 2.3 Preserve Special Configurations
- `useDefineForClassFields: false` where present
- `paths` configurations
- `inlineSources: true` where present

### Phase 3: Server Package Standardization

**Objective:** Have all server/Node packages extend `tsconfig.server.json`.

#### 3.1 Packages to Migrate (~100 packages)
- `AI/*` (40+ packages)
- `Actions/*` (10+ packages)
- `Communication/*` (10 packages)
- `MJ*` packages (15+ packages)
- Other server packages

#### 3.2 Special Cases
- `AI/MCPClient` - Keep Node16 module resolution
- `MJAPI` - Keep composite, ts-node config, plotly exclusion
- `ServerBootstrap` - Keep composite
- `ContentAutotagging` - Keep composite, baseUrl

### Phase 4: MJCore Strict Mode (High Effort)

**Objective:** Enable `strict: true` on MJCore incrementally.

#### 4.1 Incremental Approach
1. Enable `noImplicitAny` first (~80 errors)
2. Enable `strictPropertyInitialization` (~50 errors)
3. Enable `strictNullChecks` last (~500+ errors)

#### 4.2 Common Fixes Required
```typescript
// strictNullChecks: Add null to types
Name: string = null;           // Before
Name: string | null = null;    // After

// noImplicitAny: Add explicit types
.filter(s => ...)              // Before
.filter((s: string) => ...)    // After

// strictPropertyInitialization: Add assertion or default
PropertyName: string;          // Before
PropertyName!: string;         // After (definite assignment)
```

#### 4.3 Estimated Effort
- 643 errors to fix
- Recommend dedicated sprint or gradual fixes over multiple PRs

---

## Proposed Root Config Changes

### Option A: Keep Current Structure
- `tsconfig.server.json` for server packages
- `tsconfig.angular.json` for Angular packages

### Option B: Add Base Config (Recommended)
```
tsconfig.base.json          # Shared settings (target, strict, skipLibCheck)
├── tsconfig.server.json    # Server-specific (module, lib)
└── tsconfig.angular.json   # Angular-specific (angularCompilerOptions)
```

**Benefits of Option B:**
- Single source of truth for common settings
- Easier to update shared options
- Clearer inheritance hierarchy

### Proposed tsconfig.base.json
```json
{
  "compilerOptions": {
    "target": "es2022",
    "moduleResolution": "node",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "experimentalDecorators": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

---

## Configuration Template for Package Migration

### Server Package Template
```json
{
  "extends": "../../tsconfig.server.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### Angular Library Template
```json
{
  "extends": "../../../../tsconfig.angular.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

---

## Risk Assessment

| Phase | Risk Level | Mitigation |
|-------|------------|------------|
| Phase 1 (Quick Wins) | Low | Only adding type definitions |
| Phase 2 (Angular) | Medium | Test each package individually |
| Phase 3 (Server) | Medium | Test each package individually |
| Phase 4 (MJCore) | High | Incremental flags, extensive testing |

---

## Success Criteria

1. **Coverage:** >90% of packages extend from root configs
2. **Consistency:** All packages use same TypeScript version and base settings
3. **Strict Mode:** All packages except MJCore have `strict: true`
4. **Documentation:** Clear guidelines for new package creation
5. **MJCore:** Incremental progress toward `strict: true`

---

## Appendix: Full Package Inventory

### Packages Currently Inheriting (9)
1. `AI/A2AServer` → tsconfig.server.json
2. `AI/MCPServer` → tsconfig.server.json
3. `MJServer` → tsconfig.server.json
4. `Angular/Explorer/base-forms` → tsconfig.angular.json
5. `Angular/Explorer/core-entity-forms` → tsconfig.angular.json
6. `Angular/Explorer/dashboards` → tsconfig.angular.json
7. `Angular/Generic/agents` → tsconfig.angular.json
8. `Angular/Generic/file-storage` → tsconfig.angular.json
9. `Actions/ScheduledActionsServer` → @tsconfig/node16
10. `MJCodeGenAPI` → @tsconfig/node16

### Packages with `strict: false` (9)
1. `MJCore` - 643 errors, needs major work
2. `MJExportEngine` - 2 errors, trivial fix
3. `Actions/ContentAutotag` - needs investigation
4. `Angular/Bootstrap` - needs ng-packagr testing
5. `ServerBootstrap` - needs @types/node only
6. `TestingFramework/CLI` - needs @types/jest only
7. `TestingFramework/Engine` - needs @types/jest only
8. `TestingFramework/EngineBase` - needs @types/jest only
9. `AngularElements/mj-angular-elements-demo` - demo app, acceptable

### Packages with Special Module Settings
1. `AI/MCPClient` - Node16 (required for MCP SDK)
2. `MJAPI` - ESNext
3. `ServerBootstrap` - ESNext
4. `Angular/Bootstrap` - ESNext
