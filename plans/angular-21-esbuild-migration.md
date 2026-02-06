# Angular 21 + ESBuild Migration Plan

**Status**: In Progress
**Created**: 2026-02-05
**Branch**: `angular-21-upgrade`
**Goal**: Migrate MJExplorer from Angular 18 with Webpack to Angular 21 with ESBuild/Vite for faster builds, proper HMR, and improved developer experience while maintaining source map debugging for symlinked monorepo packages.

---

## Executive Summary

MJExplorer currently uses Webpack (`@angular-devkit/build-angular:browser`) after a failed attempt to use ESBuild in late January 2026. The issues were:
1. Source maps not resolving for symlinked `@memberjunction/*` packages
2. Vite HMR not working with `preserveSymlinks: true`
3. Dev server instability requiring excessive memory (16-48GB heap)

**Before upgrading Angular**, we will first standardize TSConfig inheritance across all 166 packages (currently only 5.4% properly inherit from root configs) and upgrade to Node 24 LTS. This ensures a clean, consistent foundation.

Angular 21 brings **Vite 7.3.0** (up from 5.4.14), which has resolved the HMR + symlinks issue, plus **rolldown** (new Rust-based bundler) and HMR for both styles and templates enabled by default.

---

## Current State Analysis

### Build Configuration

| Setting | Current Value | Target |
|---------|---------------|--------|
| Builder | `@angular-devkit/build-angular:browser` (Webpack) | `application` (ESBuild) |
| Angular | 18.2.14 | 21.1.x |
| Node.js | 24.13.0 ✓ | 24.x LTS |
| Vite | 5.4.14 | 7.3.0 |
| esbuild | 0.23.0 | 0.27.2 |
| TSConfig Inheritance | 5.4% (9/166 packages) | >95% |

### Key Files

- **angular.json**: `/packages/MJExplorer/angular.json`
- **tsconfig.json**: `/packages/MJExplorer/tsconfig.json`
- **tsconfig.server.json**: `/tsconfig.server.json` (root)
- **tsconfig.angular.json**: `/tsconfig.angular.json` (root)
- **launch.json**: `/packages/MJExplorer/.vscode/launch.json`

### Git History of Previous ESBuild Attempt

| Date | Commit | Change |
|------|--------|--------|
| Jan 28 | `cc650a5cd` | Switched TO ESBuild (`application` builder) |
| Feb 1 | `1792d199b` | Added `prebundle: false` + `preserveSymlinks: true` |
| Feb 3 | `042f3a476` | Increased heap to 48GB |
| Feb 3 | `9f1db86aa` | Reduced heap to 16GB, added poll watching |
| Feb 4 | `f00fcfaed` | **Reverted to Webpack** - source maps broken |

### Root Causes of Previous Failure

1. **Vite 5.x HMR Bug**: [vitejs/vite#6479](https://github.com/vitejs/vite/issues/6479) - HMR doesn't work with `preserveSymlinks: true`. Status: **COMPLETED** (fixed in Vite 7.x).

2. **Source Map Path Resolution**: VSCode Chrome debugger couldn't resolve paths to symlinked packages. Missing `sourceMapPathOverrides` configuration.

3. **Vite Prebundling Conflicts**: Vite's dependency prebundling conflicted with npm workspace symlinks.

4. **Inconsistent TSConfig**: 94.6% of packages don't inherit from root configs, creating build inconsistencies.

---

## Implementation Tasks

### Phase 1: Foundation - TSConfig Standardization & Node Upgrade

This phase establishes a clean, consistent build foundation before upgrading Angular.

---

#### Phase 1a: Preparation & Baseline
**Status**: Complete ✓
**Completed**: 2026-02-05
**Estimated Complexity**: Low

- [x] **1a.1** Create feature branch `angular-21-upgrade`
- [x] **1a.2** Document current working state
  - [x] Record current build times for comparison
  - [x] Note current HMR behavior (full reload on all changes)
  - [x] Document current Node.js version: 22.14.0

##### Baseline Metrics (2026-02-05)
| Metric | Value |
|--------|-------|
| Node.js | v22.14.0 |
| NPM | 11.4.2 |
| Full Build Time | 33.2s (156/168 cached) |
| HMR Behavior | Full page reload on all changes |
| Total Packages | 175 |
| Packages Extending Root TSConfig | 8 (4.6%) |

- [x] **1a.3** Verify full build succeeds on current state
  ```
  Tasks:    168 successful, 168 total
  Cached:   156 cached, 168 total
  Time:     33.181s
  ```

- [x] **1a.4** Create inventory of packages by category:
  - Angular packages: 62
  - Server packages: 88
  - Other packages: 25
  - **Currently extending tsconfig.angular.json**: 5
  - **Currently extending tsconfig.server.json**: 3

**Verification**: ✓ Baseline documented, build succeeds

---

#### Phase 1b: TSConfig Quick Wins
**Status**: Complete ✓ (ServerBootstrap now inherits strict from root)
**Completed**: 2026-02-05
**Estimated Complexity**: Low
**Risk**: Low

Fix packages that incorrectly have `strict: false` due to missing type definitions only.

- [x] **1b.1** ServerBootstrap - **RESOLVED**
  - Now extends `tsconfig.server.json` which has `strict: true`
  - Builds clean with inherited strict mode

- [x] **1b.2** TestingFramework/CLI
  - [x] Enable `strict: true`
  - [x] Fixed 4 errors: added `|| 'console'` fallback for format, type assertion for config
  - [x] Verify build passes ✓

- [x] **1b.3** TestingFramework/Engine
  - [x] Enable `strict: true`
  - [x] Fixed 6 errors: catch block type assertions, null coalescing for undefined/null mismatches
  - [x] Verify build passes ✓

- [x] **1b.4** TestingFramework/EngineBase
  - [x] Enable `strict: true`
  - [x] Fixed 1 error: non-null assertion for provider parameter
  - [x] Verify build passes ✓

- [x] **1b.5** MJExportEngine
  - [x] Enable `strict: true`
  - [x] Fixed 1 error: non-null assertion for workbook title
  - [x] Verify build passes ✓

- [x] **1b.6** Run full build to verify no regressions
  ```
  Tasks:    168 successful, 168 total
  Cached:   136 cached, 168 total
  Time:     42.658s
  ```

**Verification**: 4/5 quick win packages have `strict: true`, full build passes. ServerBootstrap deferred.

---

#### Phase 1c: TSConfig Angular Package Standardization
**Status**: Complete ✓
**Completed**: 2026-02-05
**Estimated Complexity**: Medium
**Risk**: Medium

Have all Angular library packages extend `tsconfig.angular.json`.

##### Already Inheriting (5 packages - skip):
- `Angular/Explorer/base-forms`
- `Angular/Explorer/core-entity-forms`
- `Angular/Explorer/dashboards`
- `Angular/Generic/agents`
- `Angular/Generic/file-storage`

##### Special Configurations to Preserve:
- `useDefineForClassFields: false` (8 packages - Angular decorator compatibility)
- `inlineSources: true` (4 packages - debugging support)
- Custom `paths` mappings where present
- `Angular/Bootstrap` - has `composite: true`, `ESNext` module

##### Migration Template:
```json
{
  "extends": "../../../../tsconfig.angular.json",
  "compilerOptions": {
    "outDir": "./dist"
    // Add local overrides only where needed
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **1c.1** Angular/Explorer packages (13 total, 3 already done)
  - [ ] `explorer-core` - migrate to extend root
  - [ ] `explorer-settings` - migrate to extend root
  - [ ] `ask-skip` - migrate to extend root
  - [ ] `data-tables` - migrate to extend root
  - [ ] `entity-action-buttons` - migrate to extend root
  - [ ] `entity-record-browser` - migrate to extend root
  - [ ] `general-components` - migrate to extend root
  - [ ] `report-browser` - migrate to extend root
  - [ ] `user-view-grid` - migrate to extend root
  - [ ] Verify each builds after migration

- [ ] **1c.2** Angular/Generic packages (31 total, 2 already done)
  - [ ] Migrate each package to extend `tsconfig.angular.json`
  - [ ] Preserve `useDefineForClassFields: false` where present
  - [ ] Preserve custom `paths` configurations
  - [ ] Verify each builds after migration

- [ ] **1c.3** Angular/Bootstrap (special case)
  - [ ] Keep `composite: true`
  - [ ] Keep `module: ESNext` if required
  - [ ] Extend `tsconfig.angular.json` with overrides
  - [ ] Verify build passes

- [ ] **1c.4** Run full Angular build verification
  ```bash
  npm run build:explorer
  ```

**Verification**: All 46 Angular packages extend root config, Explorer builds successfully

---

#### Phase 1d: TSConfig Server Package Standardization
**Status**: Complete ✓
**Completed**: 2026-02-05
**Estimated Complexity**: High (volume)
**Risk**: Medium

Have all server/Node packages extend `tsconfig.server.json`.

##### Already Inheriting (3 packages - skip):
- `AI/A2AServer`
- `AI/MCPServer`
- `MJServer`

##### Special Cases to Preserve:
- `AI/MCPClient` - **MUST keep Node16 module resolution** (MCP SDK requires `.js` extensions)
- `MJAPI` - Keep `composite`, `ts-node` config, `@types/plotly.js` exclusion
- `ServerBootstrap` - Keep `composite`
- `ContentAutotagging` - Keep `composite`, `baseUrl`

##### Migration Template:
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

- [ ] **1d.1** AI packages (~40 packages)
  - [ ] Migrate each to extend `tsconfig.server.json`
  - [ ] **Exception**: `AI/MCPClient` - keep Node16 module resolution
  - [ ] Verify each builds after migration

- [ ] **1d.2** Actions packages (~10 packages)
  - [ ] Migrate each to extend `tsconfig.server.json`
  - [ ] Verify each builds after migration

- [ ] **1d.3** Communication packages (~10 packages)
  - [ ] Migrate each to extend `tsconfig.server.json`
  - [ ] Verify each builds after migration

- [ ] **1d.4** Core MJ packages (~15 packages)
  - [ ] `MJCore` - extend root but keep `strict: false` (Phase 1e)
  - [ ] `MJGlobal`, `MJCoreEntities`, etc. - migrate to extend root
  - [ ] Verify each builds after migration

- [ ] **1d.5** Remaining server packages
  - [ ] Templates, Scheduling, Credentials, APIKeys, etc.
  - [ ] Verify each builds after migration

- [ ] **1d.6** Handle special cases
  - [ ] `MJAPI` - preserve ts-node config, plotly exclusion
  - [ ] `ServerBootstrap` - preserve composite
  - [ ] `ContentAutotagging` - preserve composite, baseUrl

- [ ] **1d.7** Run full build verification
  ```bash
  npm run build
  ```

**Verification**: ~100 server packages extend root config, full build passes

---

#### Phase 1e: TSConfig MJCore Strict Mode
**Status**: STASHED (Deferred)
**Estimated Complexity**: High
**Risk**: High

Attempted enabling `strict: true` on MJCore. Significant progress made but stashed due to cascading breakage.

**Stash**: `git stash list` → `stash@{0}` on `angular-21-upgrade`
**Stash message**: "Phase 1e WIP: MJCore semantic typing improvements (strict:false)..."

##### What Was Done:
- Fixed 613+ strict errors across MJCore (entityInfo.ts, baseEntity.ts, queryInfo.ts, securityInfo.ts, etc.)
- Used ground truth from `packages/MJCoreEntities/src/generated/entity_subclasses.ts` for nullability
- Mandatory DB fields: `string | null` → `string!:` (definite assignment) - **NON-BREAKING**
- Added `DisplayNameOrName` getter on `EntityRelationshipInfo`
- Fixed Angular UI consumers (base-forms, link-field, entity-viewer, ng-react)
- Used duck typing for BaseEntity checks instead of `instanceof`

##### What Broke:
- **Widening changes** (`string` → `string | null`) broke strict consumers like CodeGenLib
- CodeGenLib has its own `strict: true` independently - saw MJCore's changed types
- Cascading errors in 60+ files across codegen-lib, angular packages

##### To Resume:
1. `git stash pop`
2. Revert all **widening** changes (`string` → `string | null`) — keep only **narrowing** changes
3. Keep `strict: false` on MJCore, keep type annotations as semantic documentation
4. Rebuild — should be clean
5. Alternatively, fix all strict consumers (much larger effort)

##### Key Files Modified (in stash):
- `packages/MJCore/src/generic/entityInfo.ts` - DisplayNameOrName getter on EntityRelationshipInfo
- `packages/Angular/Explorer/base-forms/src/lib/` - Multiple strict fixes
- `packages/Angular/Generic/react/` - EntityByName guard
- `packages/CodeGenLib/src/Misc/graphql_server_codegen.ts` - Non-null assertions

---

#### Phase 1f: Node 24 LTS Upgrade
**Status**: Complete ✓
**Completed**: 2026-02-05
**Estimated Complexity**: Low
**Risk**: Low

Upgraded from Node 22.14.0 to Node 24.13.0 LTS (npm 11.6.2).

- [x] **1f.1** Check Angular 21 Node requirements
  - Angular 21 supports: `^20.19.0`, `^22.12.0`, or `^24.0.0`
  - Node 24.x is current Active LTS ✓

- [x] **1f.2** Update local Node.js
  ```
  Node: v24.13.0
  NPM: 11.6.2
  ```

- [x] **1f.3** Created `.nvmrc` with `24`

- [ ] **1f.4** Update CI/CD configurations (deferred - not part of local dev setup)
  - [ ] GitHub Actions workflows
  - [ ] Azure Pipelines if used
  - [ ] Docker files if present

- [ ] **1f.5** Update `engines` in root package.json if specified (deferred)

- [x] **1f.6** Clean install and verify
  ```
  rm -rf node_modules && rm package-lock.json && npm install
  npm run build
  Tasks:    168 successful, 168 total
  Cached:   87 cached, 168 total
  Time:     59.043s
  ```

- [x] **1f.7** Fix: Upgraded `babel-loader` 9.1.3 → 10.0.0 in `@memberjunction/react-runtime`
  - Node 24's stricter ESM resolution broke `find-cache-dir` import in babel-loader 9.x
  - babel-loader 10.0.0 dropped the `find-cache-dir` dependency entirely

**Verification**: ✓ Node 24.13.0 installed, full build passes (168/168 tasks)

---

### Phase 2: Angular 18 → 21 Upgrade
**Status**: Complete ✓
**Completed**: 2026-02-05
**Commit**: `8793d3e6b` - "feat: upgrade Angular 18 → 21, Kendo UI 16 → 22, TypeScript 5.4 → 5.9"
**Estimated Complexity**: Medium

Upgraded directly (not incrementally per major version). All packages updated:
- Angular: 18.2.14 → 21.1.3
- Kendo UI: 16.2.0 → 22.0.1
- TypeScript: 5.4.5 → 5.9.3
- zone.js: 0.14.x → 0.15.0

- [x] **2.1** Update Angular packages across 67 packages
  ```bash
  cd packages/MJExplorer
  ng update @angular/core@19 @angular/cli@19
  ```
- [x] **2.2** Update Kendo UI across 31 packages
- [x] **2.3** Update TypeScript to 5.9.3
- [x] **2.4** Update zone.js to 0.15.0
- [x] **2.5** Build verification passes
- [x] **2.6** All 168 Turbo tasks succeed

**Verification**: ✓ Full build passes on Angular 21 with Webpack

---

### Phase 3: Upgrade Other Dependencies
**Status**: In Progress
**Estimated Complexity**: Medium

#### Phase 3a: Non-MSAL Auth, Markdown & Utility Dependencies
**Status**: Complete ✓
**Completed**: 2026-02-05

Upgraded: @auth0/auth0-angular 2.2→2.6, @okta/okta-auth-js 7.8→7.14, marked 12→14, marked-alert/gfm-heading-id/highlight/smartypants, mermaid 10→11, prismjs 1.29→1.30, tslib 2.6→2.8, rxjs 7.8.1→7.8.2

#### Phase 3b: Full Dependency Upgrade to Latest
**Status**: In Progress
**Estimated Complexity**: High (198 outdated packages, 79 major version bumps)

Mass upgrade all 198 outdated dependencies to their latest versions based on the comprehensive audit in `/plans/dependency-audit.csv`.

**Notable major version bumps**:
- zod: 3.x → 4.3.6 (19 locations)
- dotenv: 16.x → 17.2.4 (30 locations)
- uuid: 9/10 → 13.0.0 (10 locations)
- openai: 4/5.x → 6.18.0 (6 locations)
- jest/ts-jest/babel-jest: 29.x → 30.x (13 locations)
- mssql: 10/11 → 12.2.0 (13 locations)
- sass: 1.77 → 1.97.3 (9 locations)
- rimraf: 5.x → 6.1.2 (17 locations)
- ag-grid: 34 → 35 (3 locations)
- MSAL: 3.x → 5.x (auth-services, MJExplorer)

**Exception**: `@types/node` → `^24.10.11` (not 25.x, staying on Node 24 LTS)

#### Phase 3c: Remove Axios
**Status**: Not Started
**Estimated Complexity**: Medium

Remove `axios` dependency entirely (15 locations) and replace with Node.js built-in `fetch()` (available since Node 18, stable in Node 24 LTS).

Also remove `@types/axios` (2 locations) and `axios-retry` (2 locations) if no longer needed.

**Why**: Node 24 LTS includes a mature, stable `fetch()` implementation. Axios adds unnecessary bundle weight and an extra dependency surface. Node's built-in fetch covers all our use cases (GET, POST, JSON parsing, headers, timeouts).

**Steps**:
- [ ] Identify all 15 packages using axios
- [ ] For each package, replace `axios` calls with `fetch()` equivalents
- [ ] Handle axios-retry patterns (implement simple retry with fetch or use a lightweight alternative)
- [ ] Remove `axios`, `@types/axios`, and `axios-retry` from all package.json files
- [ ] Run `npm install` and `npm run build` to verify
- [ ] Test API calls still work correctly

**Migration patterns**:
```typescript
// Before (axios)
const response = await axios.get(url, { headers });
const data = response.data;

// After (fetch)
const response = await fetch(url, { headers });
const data = await response.json();

// Before (axios POST)
const response = await axios.post(url, body, { headers });

// After (fetch POST)
const response = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify(body)
});
```

---

### Phase 4: (was Phase 5 in original plan)

---

### Phase 5: Switch to ESBuild Application Builder
**Status**: Not Started
**Estimated Complexity**: High

This is the critical phase where we switch from Webpack to ESBuild/Vite.

- [ ] **5.1** Update `angular.json` builder configuration:
  ```json
  {
    "build": {
      "builder": "@angular-devkit/build-angular:application",
      "options": {
        "outputPath": "dist/MJExplorer",
        "index": "src/index.html",
        "browser": "src/main.ts",
        "polyfills": ["zone.js"],
        "tsConfig": "tsconfig.app.json"
      }
    }
  }
  ```

- [ ] **5.2** Remove Webpack-specific options from `angular.json`:
  - Remove `buildOptimizer`
  - Remove `vendorChunk`
  - Remove `commonChunk`
  - Remove `resourcesOutputPath` if present
  - Change `main` to `browser`
  - Ensure `polyfills` is an array

- [ ] **5.3** Update development configuration:
  ```json
  {
    "development": {
      "optimization": false,
      "extractLicenses": false,
      "preserveSymlinks": true,
      "sourceMap": true,
      "namedChunks": true
    }
  }
  ```

- [ ] **5.4** Configure Vite prebundling for monorepo:
  ```json
  {
    "serve": {
      "builder": "@angular-devkit/build-angular:dev-server",
      "options": {
        "prebundle": {
          "exclude": ["@memberjunction/*"]
        }
      }
    }
  }
  ```

- [ ] **5.5** Build and verify:
  ```bash
  npm run build
  ```

**Verification**: Production build succeeds with ESBuild

---

### Phase 6: Source Map Configuration for Debugging
**Status**: Not Started
**Estimated Complexity**: High

This phase ensures VSCode debugging works with symlinked packages.

- [ ] **6.1** Update `.vscode/launch.json` with comprehensive source map overrides:
  ```json
  {
    "version": "0.2.0",
    "configurations": [
      {
        "name": "Debug MJExplorer",
        "type": "chrome",
        "request": "launch",
        "url": "http://localhost:4201",
        "webRoot": "${workspaceFolder}/packages/MJExplorer",
        "runtimeArgs": ["--preserve-symlinks"],
        "sourceMaps": true,
        "sourceMapPathOverrides": {
          "webpack:///./*": "${workspaceFolder}/packages/MJExplorer/*",
          "webpack:///./~/*": "${workspaceFolder}/node_modules/*",
          "/@fs/*": "/*",
          "../Angular/*": "${workspaceFolder}/packages/Angular/*",
          "../../packages/Angular/*": "${workspaceFolder}/packages/Angular/*",
          "../../../packages/Angular/*": "${workspaceFolder}/packages/Angular/*",
          "/@memberjunction/ng-*": "${workspaceFolder}/packages/Angular/**/*",
          "/@memberjunction/core": "${workspaceFolder}/packages/MJCore/src/*",
          "/@memberjunction/core-entities": "${workspaceFolder}/packages/MJCoreEntities/src/*",
          "/@memberjunction/global": "${workspaceFolder}/packages/MJGlobal/src/*",
          "/node_modules/@memberjunction/*": "${workspaceFolder}/packages/**/*"
        },
        "resolveSourceMapLocations": [
          "${workspaceFolder}/**",
          "!**/node_modules/**"
        ],
        "trace": true
      }
    ]
  }
  ```

- [ ] **6.2** Update `tsconfig.json` to ensure source maps are generated:
  ```json
  {
    "compilerOptions": {
      "sourceMap": true,
      "inlineSources": true,
      "sourceRoot": "/"
    }
  }
  ```

- [ ] **6.3** Test debugging:
  - [ ] Set breakpoint in MJExplorer's own code
  - [ ] Set breakpoint in `@memberjunction/core` (symlinked)
  - [ ] Set breakpoint in `@memberjunction/ng-explorer-core` (symlinked)
  - [ ] Verify all breakpoints hit correctly
  - [ ] Verify source code displays correctly (not compiled)

**Verification**: Breakpoints work in both MJExplorer code and symlinked @memberjunction packages

---

### Phase 7: HMR Configuration & Testing
**Status**: Not Started
**Estimated Complexity**: Medium

- [ ] **7.1** Verify HMR is enabled (default in Angular 21):
  ```json
  {
    "serve": {
      "options": {
        "hmr": true
      }
    }
  }
  ```

- [ ] **7.2** Test style HMR:
  - [ ] Start dev server: `npm run start`
  - [ ] Modify a `.scss` file
  - [ ] Verify styles update WITHOUT page reload
  - [ ] Verify component state is preserved

- [ ] **7.3** Test template HMR:
  - [ ] Modify a `.component.html` file
  - [ ] Verify template updates WITHOUT page reload
  - [ ] Verify component state is preserved (form inputs, etc.)

- [ ] **7.4** Test TypeScript HMR:
  - [ ] Modify a `.component.ts` file
  - [ ] Note: Full reload may still be required for TS changes
  - [ ] Verify reload is faster than Webpack

- [ ] **7.5** Test symlinked package HMR:
  - [ ] Modify a file in `packages/Angular/Explorer/explorer-core`
  - [ ] Verify change is detected
  - [ ] Verify HMR or fast reload works

- [ ] **7.6** If HMR issues occur, try disabling prebundling:
  ```json
  {
    "prebundle": false
  }
  ```

**Verification**: HMR works for styles and templates, symlinked packages trigger rebuilds

---

### Phase 8: Performance Optimization
**Status**: Not Started
**Estimated Complexity**: Low

- [ ] **8.1** Measure and compare build times:
  - [ ] Cold build time (before vs after)
  - [ ] Incremental rebuild time (before vs after)
  - [ ] Dev server startup time (before vs after)

- [ ] **8.2** Optimize memory usage:
  - [ ] Start with 8GB heap: `NODE_OPTIONS=--max-old-space-size=8192`
  - [ ] Monitor memory during build
  - [ ] Increase only if needed

- [ ] **8.3** Consider enabling Vite prebundling for third-party deps:
  ```json
  {
    "prebundle": {
      "exclude": ["@memberjunction/*"],
      "include": ["ag-grid-*"]
    }
  }
  ```

- [ ] **8.4** Document final configuration settings

**Verification**: Build times improved, memory usage reasonable

---

### Phase 9: Comprehensive Testing
**Status**: Not Started
**Estimated Complexity**: Medium

- [ ] **9.1** Run existing test suite:
  ```bash
  npm run test
  ```

- [ ] **9.2** Manual smoke tests:
  - [ ] Login/authentication
  - [ ] Navigation between routes
  - [ ] Entity forms load and save
  - [ ] Dashboards render correctly
  - [ ] AG Grid works
  - [ ] Golden Layout works

- [ ] **9.3** Test production build:
  ```bash
  npm run build
  ```
  - [ ] Verify output size is reasonable
  - [ ] Verify all assets are generated
  - [ ] Test serving production build locally

- [ ] **9.4** Test staging configuration:
  ```bash
  npm run build:stage
  ```

**Verification**: All tests pass, application fully functional

---

### Phase 10: Documentation & Cleanup
**Status**: Not Started
**Estimated Complexity**: Low

- [ ] **10.1** Update `CLAUDE.md` with new build system notes
- [ ] **10.2** Update any developer onboarding docs
- [ ] **10.3** Document known issues/workarounds
- [ ] **10.4** Remove any temporary debugging/workaround code
- [ ] **10.5** Create PR with comprehensive description
- [ ] **10.6** Move this plan to `plans/complete/`

**Verification**: Documentation updated, PR ready for review

---

## Configuration Reference

### Root TSConfig Files

#### tsconfig.server.json (existing)
```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "strict": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true
  }
}
```

#### tsconfig.angular.json (existing)
```json
{
  "compilerOptions": {
    "target": "es2022",
    "module": "es2022",
    "strict": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "experimentalDecorators": true
  },
  "angularCompilerOptions": {
    "enableI18nLegacyMessageIdFormat": false,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true
  }
}
```

### Final angular.json (Target)

```json
{
  "$schema": "./node_modules/@angular/cli/lib/config/schema.json",
  "version": 1,
  "projects": {
    "MJExplorer": {
      "projectType": "application",
      "root": "",
      "sourceRoot": "src",
      "prefix": "app",
      "architect": {
        "build": {
          "builder": "@angular-devkit/build-angular:application",
          "options": {
            "outputPath": "dist/MJExplorer",
            "index": "src/index.html",
            "browser": "src/main.ts",
            "polyfills": ["zone.js"],
            "tsConfig": "tsconfig.app.json",
            "assets": [
              "src/favicon.ico",
              "src/favicon.svg",
              "src/assets",
              "src/staticwebapp.config.json",
              {
                "glob": "**/*",
                "input": "../../node_modules/@memberjunction/ng-explorer-app/dist/assets",
                "output": "/assets"
              }
            ],
            "styles": ["src/styles.scss"],
            "scripts": []
          },
          "configurations": {
            "production": {
              "budgets": [
                {
                  "type": "initial",
                  "maximumWarning": "15mb",
                  "maximumError": "50mb"
                },
                {
                  "type": "anyComponentStyle",
                  "maximumWarning": "6kb"
                }
              ],
              "outputHashing": "all"
            },
            "staging": {
              "sourceMap": true,
              "fileReplacements": [
                {
                  "replace": "src/environments/environment.ts",
                  "with": "src/environments/environment.staging.ts"
                }
              ]
            },
            "development": {
              "optimization": false,
              "extractLicenses": false,
              "preserveSymlinks": true,
              "sourceMap": true,
              "namedChunks": true,
              "fileReplacements": [
                {
                  "replace": "src/environments/environment.ts",
                  "with": "src/environments/environment.development.ts"
                }
              ]
            },
            "local_modules": {
              "optimization": false,
              "extractLicenses": false,
              "preserveSymlinks": true,
              "sourceMap": true,
              "namedChunks": true,
              "fileReplacements": [
                {
                  "replace": "src/environments/environment.ts",
                  "with": "src/environments/environment.development.ts"
                }
              ]
            }
          },
          "defaultConfiguration": "production"
        },
        "serve": {
          "builder": "@angular-devkit/build-angular:dev-server",
          "options": {
            "hmr": true,
            "prebundle": {
              "exclude": ["@memberjunction/*"]
            }
          },
          "configurations": {
            "production": {
              "buildTarget": "MJExplorer:build:production"
            },
            "staging": {
              "buildTarget": "MJExplorer:build:staging"
            },
            "development": {
              "buildTarget": "MJExplorer:build:development"
            },
            "local_modules": {
              "buildTarget": "MJExplorer:build:local_modules"
            }
          },
          "defaultConfiguration": "development"
        }
      }
    }
  },
  "cli": {
    "analytics": false
  }
}
```

---

## Troubleshooting Guide

### Issue: Source maps not working for @memberjunction packages

**Symptoms**: Breakpoints not hit, or source shows compiled JS instead of TS

**Solutions**:
1. Verify `sourceMap: true` in tsconfig.json
2. Check `sourceMapPathOverrides` patterns in launch.json
3. Enable `trace: true` in launch.json and check debug console
4. Verify symlinks are resolved: `ls -la node_modules/@memberjunction`
5. Try adding `"inlineSources": true` to tsconfig.json

### Issue: HMR not working for styles

**Symptoms**: Full page reload on style changes

**Solutions**:
1. Check `hmr: true` in serve options
2. Disable service worker in dev config
3. Check for `statsJson: true` (known to break HMR)
4. Try `NG_HMR_TEMPLATES=0 ng serve` to isolate

### Issue: HMR not working for templates

**Symptoms**: Full page reload on template changes

**Solutions**:
1. Verify Angular 21+ (templates HMR default since 19.1)
2. Disable service worker in dev config
3. Check for errors in browser console
4. Try fresh build: delete `dist/` and `.angular/cache/`

### Issue: Dev server crashes or high memory

**Symptoms**: Out of memory errors, server stops responding

**Solutions**:
1. Increase heap: `NODE_OPTIONS=--max-old-space-size=16384`
2. Enable `prebundle: false` to reduce memory during startup
3. Check for circular dependencies in packages
4. Consider using poll-based file watching: `"poll": 1000`

### Issue: Symlinked packages not rebuilding

**Symptoms**: Changes to @memberjunction packages don't trigger rebuild

**Solutions**:
1. Verify `preserveSymlinks: true` in development config
2. Exclude @memberjunction from prebundling
3. Check file watcher is detecting changes
4. Try poll-based watching: `"poll": 1000`

---

## Rollback Plan

If the migration fails and cannot be resolved:

1. **Quick rollback** (ESBuild only):
   ```bash
   git checkout f00fcfaed -- packages/MJExplorer/angular.json
   git checkout f00fcfaed -- packages/MJExplorer/.vscode/launch.json
   ```

2. **Full rollback**:
   ```bash
   git checkout next
   git branch -D angular-21-upgrade
   ```

3. **Document failure**: Add notes to this plan about what failed and why

---

## References

- [Angular Build System Migration Guide](https://angular.dev/tools/cli/build-system-migration)
- [Angular Version Compatibility](https://angular.dev/reference/versions)
- [Vite HMR + Symlinks Issue #6479](https://github.com/vitejs/vite/issues/6479) (COMPLETED)
- [Angular CLI Source Maps Issue #31331](https://github.com/angular/angular-cli/issues/31331)
- [Angular 21 Announcement](https://blog.angular.dev/announcing-angular-v21-57946c34f14b)
- [Node.js Releases](https://nodejs.org/en/about/previous-releases)
- [TSConfig Inheritance Standardization Plan](./tsconfig-inheritance-standardization.md)

---

## Success Criteria

### Phase 1 (Foundation)
- [ ] >95% of packages extend from root tsconfig files
- [ ] All packages except MJCore have `strict: true`
- [ ] MJCore has `strict: true` (643 errors fixed)
- [x] Node 24 LTS installed and working (v24.13.0)
- [ ] Full build passes

### Phase 2-10 (Angular + ESBuild)
- [ ] Application builds successfully with ESBuild
- [ ] Dev server starts without crashes
- [ ] Breakpoints work in VSCode for MJExplorer code
- [ ] Breakpoints work in VSCode for @memberjunction symlinked packages
- [ ] HMR works for style changes (no page reload)
- [ ] HMR works for template changes (no page reload, state preserved)
- [ ] Changes to symlinked packages trigger rebuild
- [ ] Build time improved vs Webpack
- [ ] Memory usage is reasonable (< 16GB)
- [ ] All existing tests pass
- [ ] Production build works correctly
