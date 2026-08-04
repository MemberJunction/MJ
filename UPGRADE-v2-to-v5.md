# MemberJunction Upgrade Guide: v2.x → v5.x

> **Audience:** MJ platform consumers upgrading from any 2.x version to the latest 5.x release
> **Estimated effort:** 1-2 days for small projects, 2-4 days for large codebases
> **Risk level:** Medium — database migration renames ~160 core entities; automated tools handle most code changes

---

## Overview

This guide covers a **direct upgrade from MJ 2.x to 5.x**. You do NOT need to stair-step through 3.x and 4.x — Flyway runs all intermediate database migrations automatically, and the code changes can be addressed in a single pass.

The upgrade involves four major areas:

| Area | What Changed | Effort |
|------|-------------|--------|
| **Workspace Structure** | Flat directories → npm workspace monorepo | Medium — restructure once |
| **Module System (v4.0)** | CommonJS → ESM; Load*() functions → class registration manifests | Medium — mostly mechanical |
| **Angular (v4.0)** | Angular 18 → 21; Kendo 16 → 22; Webpack → ESBuild/Vite | Low if using fresh bootstrap |
| **Entity Names (v5.0)** | ~160 core entities gain `MJ: ` prefix; class names gain schema prefix | Low — automated scanner tools |

### Recommended Approach: Fresh Bootstrap + Custom Code Migration

The easiest upgrade path — and the one we've used successfully for multiple production migrations — is:

1. **Start from the latest MJ bootstrap files** (MJAPI `index.ts`, MJExplorer `app.module.ts`, etc.) rather than trying to incrementally modify your old code
2. **Migrate your customizations** from the old files into the new minimal structure
3. **Run database migrations and CodeGen**
4. **Fix remaining entity name references** with automated tools

**Why this works best:** Between MJ 2.x and 5.x, MJAPI went from ~35+ lines of manual initialization boilerplate to a **6-line entry point**, and MJExplorer's `app.module.ts` went from 50+ individual imports and manual `LoadXXX()` calls to **3 consolidated module imports**. All the real logic has been abstracted into MJ library packages (`@memberjunction/server-bootstrap`, `@memberjunction/ng-explorer-app`, etc.). Trying to incrementally modify the old code is harder than starting fresh and porting your customizations.

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | 24.0.0+ | Required by MJ 5.x packages |
| npm | 10.0.0+ | Ships with Node 24 |
| MJ CLI | Latest 5.x | `npm install -g @memberjunction/cli@latest` |
| TypeScript | 5.9.x+ | Updated per-package |
| SQL Server | 2019+ | No change from 2.x |

Install the MJ CLI globally before starting:

```bash
npm install -g @memberjunction/cli@latest
mj --version  # Should show 5.x
```

---

## Phase 1: Back Up Your Database

**Do this before anything else.** The v5.0 migrations rename ~160 core entities with an `MJ: ` prefix. This is difficult to reverse.

```sql
BACKUP DATABASE [YourDB]
TO DISK = N'/backups/YourDB_pre_v5_migration.bak'
WITH FORMAT, COMPRESSION, STATS = 10;
```

---

## Phase 2: Create the Workspace Structure

MJ 2.x projects typically use a flat directory structure. MJ 5.x uses an npm workspace monorepo.

### 2.1 Target Directory Structure

Your repository should end up looking like this:

```
YourProject/
├── packages/
│   ├── MJAPI/                     # API server
│   │   ├── src/
│   │   │   ├── index.ts           # Minimal entry point (see Phase 3)
│   │   │   └── generated/         # CodeGen output + manifest
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── MJExplorer/                # Angular app
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── app.module.ts  # Minimal module (see Phase 4)
│   │   │   │   ├── app.component.ts
│   │   │   │   └── generated/     # CodeGen output + manifest
│   │   │   ├── environments/
│   │   │   ├── main.ts
│   │   │   └── styles.scss
│   │   ├── angular.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── GeneratedEntities/         # Entity subclasses (CodeGen output)
│   │   ├── src/
│   │   │   └── generated/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── GeneratedActions/          # Action subclasses (CodeGen output)
│       ├── src/
│       │   └── generated/
│       ├── package.json
│       └── tsconfig.json
├── migrations/                    # Flyway migrations
│   ├── v2/                        # Your existing v2 migrations
│   ├── v3/                        # Will be populated by MJ CLI
│   ├── v4/                        # Will be populated by MJ CLI
│   └── v5/                        # Will be populated by MJ CLI
├── mj.config.cjs                  # MJ configuration
├── package.json                   # Workspace root
├── turbo.json                     # Build orchestration
├── tsconfig.server.json           # Shared server TypeScript config
├── tsconfig.angular.json          # Shared Angular TypeScript config
└── .env                           # Environment variables
```

### 2.2 Create the Root package.json

Create or update your root `package.json` with npm workspace configuration:

```json
{
  "name": "your-project-workspace",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "turbo --log-order=stream build",
    "build:api": "turbo --log-order=stream build --filter=mj_api",
    "build:explorer": "turbo --log-order=stream build --filter=mj_explorer",
    "start:api": "turbo start --filter=mj_api",
    "start:explorer": "turbo start --filter=mj_explorer",
    "mj:migrate": "mj migrate",
    "mj:codegen": "mj codegen"
  },
  "devDependencies": {
    "turbo": "^2.5.4",
    "typescript": "^5.9.3"
  },
  "dependencies": {
    "@memberjunction/global": "5.34.1",
    "@memberjunction/ng-auth-services": "5.34.1"
  }
}
```

> **Note:** The root-level `@memberjunction/global` and `@memberjunction/ng-auth-services` dependencies prevent npm from installing duplicate copies in nested `node_modules`, which causes Angular DI errors (`NG0201: No provider found for _MJAuthBase`).

### 2.3 Create turbo.json

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.html", "src/**/*.scss", "tsconfig.json", "tsconfig.*.json", "package.json"],
      "outputs": ["dist/**"]
    },
    "start": {
      "dependsOn": ["^build"],
      "persistent": true,
      "cache": false
    },
    "test": {
      "dependsOn": ["build"]
    }
  }
}
```

### 2.4 Create Shared TypeScript Configs

**tsconfig.server.json** (for MJAPI and server-side packages):

```json
{
  "compilerOptions": {
    "module": "es2022",
    "target": "es2022",
    "moduleResolution": "bundler",
    "sourceMap": true,
    "experimentalDecorators": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "lib": ["es2022", "esnext.asynciterable", "dom"],
    "allowSyntheticDefaultImports": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "useDefineForClassFields": false
  }
}
```

**tsconfig.angular.json** (for MJExplorer):

```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "inlineSources": true,
    "experimentalDecorators": true,
    "strict": true,
    "skipLibCheck": true,
    "lib": ["es2022", "dom"]
  },
  "angularCompilerOptions": {
    "skipTemplateCodegen": true,
    "strictMetadataEmit": true,
    "enableResourceInlining": true,
    "strictTemplates": true
  }
}
```

### 2.5 Move Your Existing Code

If you have old flat directories, move them into the `packages/` workspace:

```bash
# Move existing directories (adjust paths for your project)
mkdir -p packages
mv MJAPI packages/MJAPI           # or wherever your API server lives
mv MJExplorer packages/MJExplorer # or your Angular app
mv GeneratedEntities packages/GeneratedEntities
mv GeneratedActions packages/GeneratedActions   # if you have this
```

> **Important:** If you have custom packages, move them into `packages/` and add their glob pattern to the `workspaces` array in root `package.json`.

---

## Phase 3: Set Up MJAPI (Fresh Bootstrap)

This is the most impactful simplification. In MJ 2.x, MJAPI's `index.ts` contained 35+ lines of manual initialization — explicit `LoadGeneratedEntities()` calls, provider imports, path resolution, error handling, etc. In MJ 5.x, all of that is handled by `@memberjunction/server-bootstrap`.

### 3.1 What Changed and Why

| 2.x Pattern (OLD) | 5.x Pattern (NEW) | Why |
|---|---|---|
| `import { serve } from '@memberjunction/server'` | `import { createMJServer } from '@memberjunction/server-bootstrap'` | Bootstrap package encapsulates all initialization |
| `LoadGeneratedEntities()` / `LoadGeneratedActions()` | `import 'mj_generatedentities'` (side-effect import) | ESM imports trigger class registration automatically |
| Manual `LoadProvider()` calls for each integration | `import '@memberjunction/server-bootstrap/mj-class-registrations'` | Pre-built manifest registers all MJ classes at once |
| `serve(resolverPaths.map(localPath))` | `createMJServer({ resolverPaths })` | Single function handles DB, GraphQL, WebSocket, REST, shutdown |
| `__dirname` (CommonJS) | `fileURLToPath(new URL('.', import.meta.url))` | ESM has no `__dirname`; this is the standard replacement |

### 3.2 Replace index.ts

Replace your entire MJAPI `src/index.ts` with the current bootstrap. This is the **complete** file:

```typescript
/**
 * MemberJunction API Server (MJ 3.0+ Minimal Architecture)
 * All initialization logic is in @memberjunction/server-bootstrap
 */
import { createMJServer } from '@memberjunction/server-bootstrap';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// Import generated packages to trigger class registration
import 'mj_generatedentities';
import 'mj_generatedactions';

// Import pre-built MJ class registrations manifest (covers all @memberjunction/* packages)
import '@memberjunction/server-bootstrap/mj-class-registrations';

// Import supplemental manifest for user-defined classes (generated at prestart with --exclude-packages @memberjunction)
import './generated/class-registrations-manifest.js';

// Optional: Import communication providers if needed
// import '@memberjunction/communication-sendgrid';
// import '@memberjunction/communication-teams';

// Resolve resolver paths relative to this file
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const resolverPaths = [resolve(__dirname, 'generated/generated.{js,ts}')];

// Start the server
createMJServer({ resolverPaths }).catch(console.error);
```

### 3.3 Migrate Your Custom Code

Before discarding your old `index.ts`, check if it contains any of these customizations:

| Customization | Where It Goes Now |
|---|---|
| **Custom auth/user creation** | Create a separate file (e.g., `src/custom/customUserCreation.ts`) and add `import './custom/customUserCreation.js'` to index.ts |
| **Communication providers** (SendGrid, Teams) | Uncomment the relevant import line in index.ts |
| **Custom action imports** | These are now handled by the class registration manifest. If you have `@RegisterClass`-decorated classes, they'll be auto-discovered by `mj codegen manifest` |
| **Custom resolvers** | Place in `src/generated/` or a custom directory and add the path to `resolverPaths` |
| **Environment-specific logic** | Move to `mj.config.cjs` (see Phase 6) |

### 3.4 Create the Placeholder Manifest

Create `packages/MJAPI/src/generated/class-registrations-manifest.ts`:

```typescript
/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * This file will be regenerated by `mj codegen manifest`
 */
export const CLASS_REGISTRATIONS: unknown[] = [];
export const CLASS_REGISTRATIONS_MANIFEST_LOADED = true;
```

This file is auto-generated at build time by the `prebuild` script. The placeholder prevents import errors before the first build.

### 3.5 Update MJAPI package.json

```json
{
  "name": "mj_api",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "main": "index.js",
  "scripts": {
    "start": "node --experimental-specifier-resolution=node --import ./register.js -r dotenv/config ./src/index.ts",
    "prestart": "mj codegen manifest --exclude-packages @memberjunction --output ./src/generated/class-registrations-manifest.ts",
    "prebuild": "mj codegen manifest --exclude-packages @memberjunction --output ./src/generated/class-registrations-manifest.ts || echo 'Warning: mj codegen manifest not available, using existing manifest'",
    "build": "tsc && tsc-alias -f",
    "check-types": "tsc -noEmit"
  },
  "dependencies": {
    "@memberjunction/ai": "5.34.1",
    "@memberjunction/core": "5.34.1",
    "@memberjunction/global": "5.34.1",
    "@memberjunction/server": "5.34.1",
    "@memberjunction/server-bootstrap": "5.34.1",
    "@memberjunction/sqlserver-dataprovider": "5.34.1",
    "@memberjunction/templates": "5.34.1",
    "mj_generatedentities": "1.0.0",
    "mj_generatedactions": "1.0.0"
  },
  "devDependencies": {
    "dotenv": "17.2.4",
    "typescript": "^5.9.3"
  }
}
```

> **Note:** Add other `@memberjunction/*` packages as needed for your project (e.g., `@memberjunction/communication-sendgrid`, `@memberjunction/messaging-adapters`).

### 3.6 Update MJAPI tsconfig.json

```json
{
  "extends": "../../tsconfig.server.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext"
  },
  "ts-node": {
    "esm": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

---

## Phase 4: Set Up MJExplorer (Fresh Bootstrap)

MJExplorer underwent the same dramatic simplification. In MJ 2.x, `app.module.ts` had 50+ individual Kendo imports, manual MSAL configuration, `LoadXXX()` anti-tree-shaking functions, and ~244 lines of boilerplate. In MJ 5.x, it's ~110 lines using 3 consolidated module bundles.

### 4.1 What Changed and Why

| 2.x Pattern (OLD) | 5.x Pattern (NEW) | Why |
|---|---|---|
| 50+ individual Kendo module imports (`GridModule`, `LayoutModule`, `InputsModule`...) | `MJExplorerModulesBundle` | Single import bundles all Kendo + MJ modules |
| Manual `MsalModule.forRoot()` with inline `PublicClientApplication` config | `AuthServicesModule.forRoot(environment)` | Auth config driven by environment file |
| 242-line `AppComponent` with GraphQL setup, token handling, auth claims processing | 12-line `AppComponent` with `<mj-explorer-app />` | All shell logic moved to `@memberjunction/ng-explorer-app` |
| `LoadGeneratedForms()`, `LoadCoreGeneratedForms()`, `LoadCoreCustomForms()` | `CLASS_REGISTRATIONS` from `@memberjunction/ng-bootstrap-lite` + build-time manifest | Manifests prevent tree-shaking without manual Load functions |
| Separate `app-routing.module.ts` | Routing embedded in `MJExplorerAppModule` | Less boilerplate |
| `@import` for Sass | `@use` | Angular 21 / Sass deprecation |

### 4.2 Replace app.component.ts

Replace your entire `app.component.ts`:

```typescript
import { Component } from '@angular/core';

@Component({
  standalone: false,
  selector: 'app-root',
  template: '<mj-explorer-app />'
})
export class AppComponent {}
```

> **Important:** `standalone: false` is required because Angular 21 defaults to `standalone: true`, but we're using NgModule declarations.

### 4.3 Replace app.module.ts

Replace your entire `app.module.ts`:

```typescript
import { NgModule, APP_INITIALIZER } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

// MJ Consolidated Module Bundles
import { MJExplorerModulesBundle, SharedService } from '@memberjunction/ng-explorer-modules';
import { AuthServicesModule, RedirectComponent, MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJExplorerAppModule } from '@memberjunction/ng-explorer-app';

// Lazy loading infrastructure
import { LazyModuleRegistry, LAZY_FEATURE_CONFIG } from '@memberjunction/ng-explorer-core';

// Class registration manifests (prevents tree-shaking)
import { CLASS_REGISTRATIONS } from '@memberjunction/ng-bootstrap-lite';
import { CLASS_REGISTRATIONS as LOCAL_CLASSES } from './generated/class-registrations-manifest';
const combinedClasses = [...CLASS_REGISTRATIONS, ...LOCAL_CLASSES];

// Project-specific
import { AppComponent } from './app.component';
import { GeneratedFormsModule } from './generated/generated-forms.module';
import { environment } from '../environments/environment';

export function initializeAuth(authService: MJAuthBase): () => Promise<void> {
  return () => authService.initialize();
}

@NgModule({
  declarations: [AppComponent],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    MJExplorerModulesBundle,
    AuthServicesModule.forRoot(environment),
    MJExplorerAppModule.forRoot(environment),
    GeneratedFormsModule
  ],
  providers: [
    SharedService,
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [MJAuthBase],
      multi: true
    },
    {
      provide: APP_INITIALIZER,
      useFactory: (lazyRegistry: LazyModuleRegistry) => () => {
        lazyRegistry.RegisterBulk(LAZY_FEATURE_CONFIG);
        lazyRegistry.WireToClassFactory();
      },
      deps: [LazyModuleRegistry],
      multi: true
    }
  ],
  bootstrap: [AppComponent, RedirectComponent]
})
export class AppModule {}
```

### 4.4 Migrate Your Custom Code

Before discarding your old files, check for customizations:

| Customization | Where It Goes Now |
|---|---|
| **Custom components declared in AppModule** | Keep them in `declarations` and `imports` arrays — add them after `GeneratedFormsModule` |
| **Custom route components** | Register with `@RegisterClass(BaseResourceComponent, 'YourDriver')` — the manifest system discovers them automatically |
| **Additional Kendo module imports** | Already included in `MJExplorerModulesBundle` — remove individual imports |
| **MSAL configuration** | Now driven by `environment.ts` — see Phase 4.6 |
| **Custom form overrides** | Keep as separate modules imported in `app.module.ts` |

### 4.5 Replace main.ts

```typescript
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

async function initAndBootstrap() {
  platformBrowserDynamic().bootstrapModule(AppModule)
    .then(ref => {})
    .catch(err => console.error(err));
}

initAndBootstrap();
```

### 4.6 Update Environment Files

Create `src/environments/environment.development.ts` (for local development):

```typescript
export const environment = {
  production: false,
  NODE_ENV: 'development',
  GRAPHQL_URI: 'http://localhost:4000/',
  GRAPHQL_WS_URI: 'ws://localhost:4000/',
  REDIRECT_URI: 'http://localhost:4200/',
  CLIENT_ID: '<your-azure-ad-app-client-id>',
  TENANT_ID: '<your-azure-ad-tenant-id>',
  CLIENT_AUTHORITY: 'https://login.microsoftonline.com/<your-tenant-id>',
  AUTH_TYPE: 'msal',
  MJ_CORE_SCHEMA_NAME: '__mj',
  AUTOSAVE_DEBOUNCE_MS: 1200,
  SEARCH_DEBOUNCE_MS: 800,
  MIN_SEARCH_LENGTH: 3,
  APPLICATION_NAME: 'Your Application',
  APPLICATION_INSTANCE: 'DEV'
};
```

Create `src/environments/environment.ts` (for production — values typically set by CI/CD):

```typescript
export const environment = {
  production: true,
  NODE_ENV: 'production',
  GRAPHQL_URI: '',
  GRAPHQL_WS_URI: '',
  REDIRECT_URI: '',
  CLIENT_ID: '<your-production-client-id>',
  TENANT_ID: '<your-production-tenant-id>',
  CLIENT_AUTHORITY: 'https://login.microsoftonline.com/<your-tenant-id>',
  AUTH_TYPE: 'msal',
  MJ_CORE_SCHEMA_NAME: '__mj',
  AUTOSAVE_DEBOUNCE_MS: 1200,
  SEARCH_DEBOUNCE_MS: 800,
  MIN_SEARCH_LENGTH: 3,
  APPLICATION_NAME: 'Your Application',
  APPLICATION_INSTANCE: 'PROD'
};
```

### 4.7 Replace styles.scss

```scss
@use "@memberjunction/ng-explorer-app/dist/styles.scss";

html, body, my-app {
    padding: 0;
    height: 100%;
    overflow: hidden;
}

my-app {
    display: flex;
    flex-direction: column;
}

/* Add your application-specific style overrides below */
```

> **Note:** This replaces all the individual Kendo CSS imports, MJ component styles, and Golden Layout styles that were manually imported in 2.x. They're now bundled in `@memberjunction/ng-explorer-app`.

### 4.8 Update MJExplorer package.json

Use the MJ repo's [packages/MJExplorer/package.json](packages/MJExplorer/package.json) as your reference. Key changes from 2.x:

- All `@angular/*` packages at `21.1.3`
- All `@memberjunction/*` packages at the target 5.x version
- `@azure/msal-angular` at `^5.0.3` and `@azure/msal-browser` at `^5.1.0`
- `zone.js` at `^0.16.0`
- `@angular-devkit/build-angular` and `@angular/cli` at `21.1.3`
- TypeScript at `^5.9.3`
- Add `prestart` and `prebuild` scripts for manifest generation

```json
{
  "scripts": {
    "prestart": "mj codegen manifest --exclude-packages @memberjunction --output ./src/app/generated/class-registrations-manifest.ts",
    "prebuild": "mj codegen manifest --exclude-packages @memberjunction --output ./src/app/generated/class-registrations-manifest.ts || echo 'Warning: mj codegen manifest not available, using existing manifest'",
    "start": "NODE_OPTIONS=--max-old-space-size=16384 ng serve --port 4200",
    "build": "NODE_OPTIONS=--max-old-space-size=16384 ng build"
  }
}
```

### 4.9 Update angular.json

Key changes from 2.x:

```json
{
  "architect": {
    "build": {
      "builder": "@angular-devkit/build-angular:application",
      "options": {
        "outputPath": "dist/MJExplorer",
        "browser": "src/main.ts",
        "polyfills": ["@angular/localize/init", "zone.js"],
        "styles": ["src/styles.scss"],
        "stylePreprocessorOptions": {
          "includePaths": ["../../node_modules"]
        }
      }
    },
    "serve": {
      "options": {
        "hmr": true,
        "prebundle": {
          "exclude": ["@memberjunction/*"]
        }
      },
      "defaultConfiguration": "development"
    }
  }
}
```

> **Important:** Build output is now at `dist/[AppName]/browser/` (not `dist/[AppName]/`). Update CI/CD deployment paths accordingly.

### 4.10 Create the Placeholder Manifest

Create `packages/MJExplorer/src/app/generated/class-registrations-manifest.ts`:

```typescript
/**
 * AUTO-GENERATED FILE - DO NOT EDIT
 * This file will be regenerated by `mj codegen manifest`
 */
export const CLASS_REGISTRATIONS: unknown[] = [];
export const CLASS_REGISTRATIONS_MANIFEST_LOADED = true;
```

### 4.11 Create the Placeholder generated-forms.module.ts

Create `packages/MJExplorer/src/app/generated/generated-forms.module.ts`:

```typescript
import { NgModule } from '@angular/core';

@NgModule({
  declarations: [],
  imports: []
})
export class GeneratedFormsModule {}
```

This will be regenerated by CodeGen with your entity-specific form components.

---

## Phase 5: Set Up GeneratedEntities and GeneratedActions

These packages contain auto-generated code from CodeGen. They need the updated package structure.

### 5.1 GeneratedEntities package.json

```json
{
  "name": "mj_generatedentities",
  "type": "module",
  "version": "1.0.0",
  "description": "Generated Entity Subclasses - Automatically Created and Maintained by MemberJunction CodeGen",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "private": true,
  "scripts": {
    "build": "tsc && tsc-alias -f"
  },
  "dependencies": {
    "@memberjunction/core": "5.34.1",
    "@memberjunction/global": "5.34.1",
    "zod": "~3.24.4"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  }
}
```

### 5.2 GeneratedEntities tsconfig.json

```json
{
  "extends": "../../tsconfig.server.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 5.3 ESM Import Extensions

In MJ 5.x (ESM), your `src/index.ts` exports need `.js` extensions:

```typescript
// ❌ OLD (CommonJS)
export * from './generated/entity_subclasses';

// ✅ NEW (ESM)
export * from './generated/entity_subclasses.js';
```

Apply the same pattern for GeneratedActions if you have that package.

---

## Phase 6: Configure mj.config.cjs

Create or update `mj.config.cjs` at the repository root. This file configures CodeGen output paths and server behavior.

```javascript
module.exports = {
  // Database schema settings
  excludeSchemas: ['sys', 'staging'],  // Schemas to exclude from CodeGen
  coreSchema: '__mj',                  // MJ internal schema name

  // CodeGen output directories (adjust paths for your project)
  output: {
    // SQL scripts
    SQLOutput: 'SQL Scripts/generated',

    // Angular forms for your Explorer
    AngularOutput: 'packages/MJExplorer/src/app/generated',

    // GraphQL resolvers for your API
    GraphQLOutput: 'packages/MJAPI/src/generated',

    // Generated entity subclasses
    CoreEntityOutput: 'packages/GeneratedEntities/src/generated',
  },

  // Post-CodeGen build commands (packages that need rebuilding after CodeGen)
  commands: [
    { command: 'npm run build', directory: 'packages/GeneratedEntities' },
    { command: 'npm run build', directory: 'packages/GeneratedActions' },
  ],

  // Auth providers (configured from environment variables by default)
  // Uncomment and customize if needed:
  // authProviders: [
  //   { name: 'msal', type: 'msal', clientId: process.env.WEB_CLIENT_ID, tenantId: process.env.TENANT_ID }
  // ],
};
```

> **Reference:** See the MJ repo's [mj.config.cjs](mj.config.cjs) for a full example with all available options.

---

## Phase 7: Install Dependencies and Run Database Migrations

### 7.1 Clean Install

```bash
# Remove old artifacts
rm -rf node_modules package-lock.json
rm -rf packages/*/node_modules packages/*/dist

# Install all workspace dependencies
npm install
```

### 7.2 Run Database Migrations

```bash
mj migrate
```

This runs Flyway migrations from v2 → v3 → v4 → v5 in sequence. The v5.0 migrations rename ~160 core `__mj` entities with an `MJ: ` prefix.

### 7.3 Verify Migration Success

```sql
-- Check Flyway history
SELECT TOP 20 version, description, success
FROM [__mj].flyway_schema_history
ORDER BY installed_rank DESC;

-- Verify entity rename happened (~160+ rows should have MJ: prefix)
SELECT COUNT(*) FROM [__mj].Entity WHERE Name LIKE 'MJ: %';
```

---

## Phase 8: Run CodeGen

```bash
mj codegen
```

This regenerates:
- Entity subclasses with Zod validation (`packages/GeneratedEntities/src/generated/`)
- GraphQL resolvers (`packages/MJAPI/src/generated/`)
- Angular form components (`packages/MJExplorer/src/app/generated/`)
- SQL objects (stored procedures, views, indexes)

### Non-fatal Warnings You Can Ignore

| Warning | Explanation |
|---------|-------------|
| `Table 'xxx' has no primary key` | Tables without PKs are skipped. Normal for staging/temp tables. |
| `Cyclical dependency detected` | CodeGen handles cycles. Does not affect output. |
| `Cannot create index on column of type nvarchar(max)` | SQL Server limitation. Informational only. |

### Warnings That Need Attention

| Warning | Action |
|---------|--------|
| `Integrity check FAILED: entityFieldsSequenceCheck` | EntityField sequence gap — see Troubleshooting section |
| Any `INSERT INTO [__mj].[EntityField]` in generated migration files | Check if CodeGen is inserting metadata for __mj entities. May indicate a skipped migration. |

---

## Phase 9: Fix Entity Name References in Your Code

MJ v5.0 ships with three automated scanner/fixer tools that find and fix hardcoded entity name strings in your code.

### 9.1 Scan (Dry-Run First)

```bash
# TypeScript files
mj codegen 5-0-fix-entity-names --path packages/

# Angular HTML templates
mj codegen 5-0-fix-html-entity-names --path packages/

# Metadata JSON files (if you have a metadata/ directory)
mj codegen 5-0-fix-metadata-names --path metadata/
```

Review the output. Each finding shows file, line number, old name, new name, and detected pattern.

### 9.2 Apply Fixes

```bash
mj codegen 5-0-fix-entity-names --path packages/ --fix
mj codegen 5-0-fix-html-entity-names --path packages/ --fix
mj codegen 5-0-fix-metadata-names --path metadata/ --fix
```

### 9.3 Manual Review Checklist

After automated fixes, check these areas manually:

- [ ] **Dynamic entity names** — If you construct entity names from variables (e.g., `const name = prefix + 'Models'`), the scanner can't detect these
- [ ] **Raw SQL strings** — Any SQL referencing entity names in application tables
- [ ] **Configuration files** — `.env`, `mj.config.cjs`, or custom config with entity names
- [ ] **External integrations** — API calls to external systems that pass MJ entity names
- [ ] **Class name imports** — If you import entity classes by name (e.g., `import { AIModelEntity }`), update to the new MJ-prefixed names (e.g., `import { MJAIModelEntity }`)

### 9.4 Understanding the Entity Name Changes

```
Before (2.x)              After (5.x)
─────────────             ──────────────
"Users"              →    "MJ: Users"
"Actions"            →    "MJ: Actions"
"AI Models"          →    "MJ: AI Models"
"Entity Fields"      →    "MJ: Entity Fields"
"Templates"          →    "MJ: Templates"
```

The UI is NOT affected — the migration sets `DisplayName` to the old short name, so users still see "Users" in the interface.

Your custom entities are NOT renamed — only entities in the `__mj` schema.

For the complete entity name mapping, check `packages/MJCoreEntities/src/generated/entity_subclasses.ts` — every `@RegisterClass(BaseEntity, 'MJ: XYZ')` line shows the current entity name.

For full details on the entity name changes and scanner tools, see [UPGRADE-v5.0.md](UPGRADE-v5.0.md).

---

## Phase 10: Build and Test

```bash
# Build all packages
npm run build

# Start the API server
npm run start:api

# Start MJExplorer (separate terminal)
npm run start:explorer
```

### Verify

- [ ] MJAPI starts without errors
- [ ] GraphQL playground accessible (default: `http://localhost:4000/`)
- [ ] Entity queries return data
- [ ] Authentication works (Azure AD / Auth0 login)
- [ ] MJExplorer loads in the browser
- [ ] Navigation between entities works
- [ ] Custom resolvers/actions function correctly

---

## Phase 11: Deploy

Follow your standard environment promotion process. See [UPDATES.md](UPDATES.md) for the recommended dev → stage → prod workflow:

1. **Dev** — Merge, migrate, run CodeGen (discard generated code)
2. **Stage** — Migrate, run CodeGen (keep generated code, commit)
3. **Prod** — Merge stage code, migrate, run CodeGen (discard generated code)

### CI/CD Updates

If deploying to Azure App Service or similar:

| Setting | Value |
|---------|-------|
| Node.js version | 24.x |
| Angular build output path | `dist/[AppName]/browser/` (note the `browser/` subdirectory — new in Angular 21) |

---

## Troubleshooting

### EntityField Sequence Gap (FieldCodeName)

During migration, CodeGen may detect a missing `FieldCodeName` field on the `MJ: Entity Fields` entity and insert it with a high sequence number (e.g., 100126) instead of its correct position. Check and fix:

```sql
-- Check for bad sequence
SELECT ID, Name, Sequence
FROM [__mj].[EntityField]
WHERE EntityID = (SELECT ID FROM [__mj].[Entity] WHERE Name = 'MJ: Entity Fields')
  AND Name = 'FieldCodeName';

-- Fix if Sequence is abnormally high
UPDATE [__mj].[EntityField]
SET Sequence = 57
WHERE EntityID = (SELECT ID FROM [__mj].[Entity] WHERE Name = 'MJ: Entity Fields')
  AND Name = 'FieldCodeName'
  AND Sequence > 69;
```

### NG0201: No provider found for _MJAuthBase

Multiple copies of `@memberjunction/ng-auth-services` in nested `node_modules`.

**Fix:** Add to root `package.json`:
```json
"dependencies": {
  "@memberjunction/global": "5.34.1",
  "@memberjunction/ng-auth-services": "5.34.1"
}
```

Then clean and reinstall:
```bash
rm -rf node_modules package-lock.json
npm install
```

### Module '@angular/common/http' errors

Angular 21 uses subpath exports requiring bundler module resolution.

**Fix:** Ensure `tsconfig.json` has:
```json
"moduleResolution": "bundler"
```

### Sass @import deprecation warnings

**Fix:** Change `@import` to `@use ... as *`:
```scss
@use "@memberjunction/ng-explorer-app/dist/styles.scss" as *;
```

### NodeJS.Timeout type error

**Fix:** Use `ReturnType<typeof setInterval>` instead:
```typescript
private timer: ReturnType<typeof setInterval> | null = null;
```

### Blank screen after deployment

Angular 21 outputs to `browser/` subdirectory.

**Fix:** Update deployment path to `dist/[app]/browser/`

### Cannot find module './generated/entity_subclasses.js'

CodeGen hasn't run yet.

**Fix:** Run `mj codegen` before building.

### npm ci fails in CI/CD

`package-lock.json` out of sync.

**Fix:**
```bash
rm package-lock.json
npm install
git add package-lock.json
git commit -m "Regenerate package-lock.json"
```

---

## Quick Reference: New vs Old Commands

| Task | Old (2.x) | New (5.x) |
|------|-----------|-----------|
| Install dependencies | `npm install` (per directory) | `npm install` (repo root only) |
| Build all | PowerShell script or manual | `npm run build` (Turbo-orchestrated) |
| Build API | `cd MJAPI && npm run build` | `npm run build:api` |
| Build Explorer | `cd MJExplorer && npm run build` | `npm run build:explorer` |
| Start API | `cd MJAPI && npm start` | `npm run start:api` |
| Start Explorer | `cd MJExplorer && npm start` | `npm run start:explorer` |
| Run migrations | Manual Flyway or scripts | `mj migrate` |
| Run CodeGen | Manual or scripts | `mj codegen` |
| Update MJ version | Manual package.json edits | `mj bump -r && npm install` |

---

## FAQ

### Should I stair-step through 3.x and 4.x?

**No.** Go directly from 2.x to 5.x. Flyway runs all intermediate database migrations automatically, and the code changes (ESM, manifests, entity names) can all be addressed in a single pass. Stair-stepping creates unnecessary work — at each intermediate version you'd need to bump deps, build, fix breaking changes, and test, only to do it again for the next major version.

### Do I need to understand all the intermediate changes?

**Not if you use the fresh bootstrap approach.** By starting from the latest MJAPI `index.ts` and MJExplorer `app.module.ts`, you skip over all the intermediate refactoring. You just need to understand the end state and migrate your customizations.

### Will my UI show "MJ: Users" everywhere?

**No.** The migration sets `DisplayName` to the old short name. The UI uses `DisplayNameOrName` for labels, so users see "Users", "Actions", "AI Models" — same as before.

### Do I need to update my custom entities?

**No.** Only entities in the `__mj` schema are renamed. Your custom entities in other schemas are completely unaffected.

### What about the old LoadXXX() anti-tree-shaking functions?

They're gone. The class registration manifest system replaces them entirely. The `mj codegen manifest` command (run automatically via `prestart`/`prebuild` scripts) generates a manifest file that creates static import paths for all `@RegisterClass`-decorated classes, preventing the bundler from tree-shaking them out.

### Can I keep my old app-routing.module.ts?

In most cases, no — routing is now handled inside `MJExplorerAppModule`. If you have custom routes, you can still add them, but the base routing is provided by the library.

### What if I have custom entity subclasses?

Keep them in their own package under `packages/`. Register them with `@RegisterClass` decorators, and the manifest system will auto-discover them. Import the package in your MJAPI `index.ts` or MJExplorer `app.module.ts`.

---

## Related Documentation

- **[UPGRADE-v5.0.md](UPGRADE-v5.0.md)** — Detailed guide for the v5.0 entity name changes and automated scanner tools
- **[UPDATES.md](UPDATES.md)** — General environment promotion workflow for any MJ version upgrade
- **[migrations/CLAUDE.md](migrations/CLAUDE.md)** — Comprehensive database migration guidelines
- **[packages/ServerBootstrap/README.md](packages/ServerBootstrap/README.md)** — How `createMJServer()` works
- **[packages/Angular/Bootstrap/README.md](packages/Angular/Bootstrap/README.md)** — How the Angular bootstrap module works
