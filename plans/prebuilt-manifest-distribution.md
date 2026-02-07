# Pre-Built Class Registration Manifests for Distribution

## Status: COMPLETE
**Created:** 2026-02-06
**Branch:** `angular-21-upgrade`

---

## Problem Statement

MemberJunction uses a dynamic plugin architecture powered by `@RegisterClass` decorators and a class factory system (`MJGlobal.ClassFactory`). Modern bundlers (ESBuild, Vite, Webpack) cannot detect these dynamic instantiation paths and aggressively tree-shake the classes out of the final bundle. To prevent this, MJ has a manifest generator (`mj codegen manifest`) that scans the dependency tree, finds all `@RegisterClass`-decorated classes via TypeScript AST parsing, and emits a manifest file with named imports + an exported array that creates a static code path the bundler cannot eliminate.

**The critical gap:** The manifest generator scans `src/` directories for `.ts` source files. This works inside the MJ monorepo where all packages are symlinked workspace packages with source available. But when MJ packages are distributed via npm, consumers receive only `dist/` with compiled `.js` and `.d.ts` files -- **no `src/` directory exists**. Running `mj codegen manifest` in an external consumer's repo finds zero `@RegisterClass` classes from any `@memberjunction/*` package. The manifest only captures the consumer's own classes, breaking the entire registration system.

**Who is affected:** Any team deploying MemberJunction outside the monorepo (e.g., v3.4 deployed instances). The `prestart`/`prebuild` scripts in MJAPI and MJExplorer run `mj codegen manifest` which silently produces an incomplete manifest missing all MJ core classes.

---

## Background

### Current Architecture

**Manifest Generator** (`packages/CodeGenLib/src/Manifest/GenerateClassRegistrationsManifest.ts`):
1. Walks the transitive dependency tree from an app's `package.json`
2. For each dependency, scans `src/**/*.ts` files (skips `.d.ts`, `dist/`, `node_modules/`)
3. Uses TypeScript compiler API to parse AST and find `@RegisterClass` decorators
4. Verifies each found class is exported from the package's public API (via `.d.ts` entry point)
5. Generates a TypeScript manifest with named imports and a `CLASS_REGISTRATIONS` array
6. Only writes if content changed (preserves build cache)

**Current Usage:**
- MJAPI (`packages/MJAPI/package.json`): `prestart`/`prebuild` runs `mj codegen manifest --output ./src/generated/class-registrations-manifest.ts`
- MJExplorer (`packages/MJExplorer/package.json`): `prestart`/`prebuild` runs `mj codegen manifest --output ./src/app/generated/class-registrations-manifest.ts`
- Root convenience scripts: `npm run mj:manifest:api` and `npm run mj:manifest:explorer`

**Current MJAPI manifest stats:** 989 packages walked, 54 contain `@RegisterClass`, 623 classes total
**Current MJExplorer manifest stats:** 1145 packages walked, 14 contain `@RegisterClass`, ~300 classes total

**Legacy LoadXXX System:**
There are 651+ empty stub functions (`export function LoadXxxClass() {}`) scattered across the codebase as a parallel tree-shaking prevention mechanism. These are legacy -- the manifest system supersedes them. They will be removed in a future pass after this work is complete.

### Bootstrap Packages (Distribution Vehicles)

Two bootstrap packages already exist and are the natural home for pre-built manifests:

1. **`@memberjunction/server-bootstrap`** (`packages/ServerBootstrap/`)
   - Encapsulates all server initialization into `createMJServer()`
   - Published to npm, consumed by external MJAPI instances
   - Currently has no manifest -- relies on MJAPI's `prestart` script

2. **`@memberjunction/ng-bootstrap`** (`packages/Angular/Bootstrap/`)
   - Encapsulates Angular auth and initialization into `MJBootstrapModule`
   - Published to npm, consumed by external MJExplorer instances
   - Currently has no manifest -- relies on MJExplorer's `prestart` script

---

## Solution

### Core Idea

Generate manifests for all `@memberjunction/*` packages at **MJ build/publish time** and embed them inside the bootstrap packages. These manifests compile to regular JavaScript and ship with the package. External consumers import the pre-built manifest to cover all MJ classes, then their own `prestart`/`prebuild` script generates a supplemental manifest covering only their custom classes.

### Architecture

```
MJ REPO (build time):
  mj codegen manifest
    --> packages/ServerBootstrap/src/generated/mj-class-registrations.ts     (server-side MJ classes)
    --> packages/Angular/Bootstrap/src/generated/mj-class-registrations.ts   (client-side MJ classes)
  These files compile into dist/ and ship with the npm package.

EXTERNAL CONSUMER REPO (prestart/prebuild):
  Their MJAPI index.ts:
    import '@memberjunction/server-bootstrap/mj-class-registrations';   // Pre-built MJ manifest
    import './generated/class-registrations-manifest';                    // Their own classes only

  Their mj codegen manifest (with --exclude-packages @memberjunction):
    --> Only scans non-MJ packages (their own workspace packages)
    --> Generates a small supplemental manifest
```

### Key Design Decisions

1. **Pre-built manifests in bootstrap packages** -- not hacky `.d.ts` scanning or transpiled JS parsing
2. **New `--exclude-packages` flag** on `mj codegen manifest` -- allows excluding packages by prefix (e.g., `@memberjunction`) so the consumer's `prestart` script doesn't redundantly scan MJ packages (which would fail anyway without source)
3. **MJAPI/MJExplorer `prestart` scripts remain** -- they still run `mj codegen manifest` but with `--exclude-packages @memberjunction` to only capture user-defined classes
4. **Manifests are auto-generated during MJ's build** -- new npm scripts in root `package.json` and in each bootstrap package's `prebuild` script
5. **Version-locked** -- manifests update automatically with each MJ release, no manual maintenance

---

## Phased Task List

### Phase 1: Manifest Generator Enhancement
Add the `--exclude-packages` flag to the CLI and generator.

- [x] **Task 1.1**: Add `excludePackages` option to `GenerateManifestOptions` interface in `packages/CodeGenLib/src/Manifest/GenerateClassRegistrationsManifest.ts`
- [x] **Task 1.2**: Implement filtering logic in `walkDependencyTree()` to skip packages matching excluded prefixes
- [x] **Task 1.3**: Add `--exclude-packages` flag to CLI command in `packages/MJCLI/src/commands/codegen/manifest.ts`
- [x] **Task 1.4**: Build and verify CodeGenLib and MJCLI compile cleanly

### Phase 2: Server Bootstrap Pre-Built Manifest
Add full MJ deps to server-bootstrap and generate/embed the pre-built manifest.

- [x] **Task 2.1**: Added 54 `@memberjunction/*` dependencies to `packages/ServerBootstrap/package.json`
- [x] **Task 2.2**: Ran `npm install` at repo root -- workspace deps wired up
- [x] **Task 2.3**: Added `prebuild` script: `mj codegen manifest --output ./src/generated/mj-class-registrations.ts`
- [x] **Task 2.4**: Root-level script deferred to Phase 4 Task 4.6
- [x] **Task 2.5**: Generated manifest: 633 classes from 54 packages (958 deps walked)
- [x] **Task 2.6**: Created `src/mj-class-registrations.ts` entry point + `exports` map in package.json for subpath `./mj-class-registrations`
- [x] **Task 2.7**: tsconfig already includes `src/**/*.ts`, generated file compiles into `dist/`
- [x] **Task 2.8**: `files: ["dist/**/*"]` already covers the manifest output
- [x] **Task 2.9**: Full build passes: prebuild regenerates manifest, tsc compiles cleanly

### Phase 3: Angular Bootstrap Pre-Built Manifest
Add full MJ Angular deps to ng-bootstrap and generate/embed the pre-built manifest.

- [x] **Task 3.1**: Added 14 `@memberjunction/*` dependencies to `packages/Angular/Bootstrap/package.json` + updated `allowedNonPeerDependencies` in ng-package.json
- [x] **Task 3.2**: Ran `npm install` at repo root -- workspace deps wired up
- [x] **Task 3.3**: Added `prebuild` script: `mj codegen manifest --output ./src/generated/mj-class-registrations.ts`
- [x] **Task 3.4**: Root-level script deferred to Phase 4 Task 4.6
- [x] **Task 3.5**: Generated manifest: 384 classes from 14 packages (491 deps walked)
- [x] **Task 3.6**: Exported from main `public-api.ts` via `export * from './generated/mj-class-registrations'` -- ng-packagr embeds it into FESM bundle
- [x] **Task 3.7**: ng-packagr handled the manifest natively -- all imports treated as external deps, CLASS_REGISTRATIONS array exported in FESM bundle
- [x] **Task 3.8**: Full build passes: prebuild generates manifest, ng-packagr compiles and bundles cleanly

### Phase 4: Update MJAPI and MJExplorer
Update the apps to use pre-built manifests + supplemental user manifests.

- [x] **Task 4.1**: Updated MJAPI's `prestart`/`prebuild` to pass `--exclude-packages @memberjunction`
- [x] **Task 4.2**: Updated MJAPI's `src/index.ts` to import `@memberjunction/server-bootstrap/mj-class-registrations`
- [x] **Task 4.3**: Updated MJExplorer's `prestart`/`prebuild` to pass `--exclude-packages @memberjunction`
- [x] **Task 4.4**: Updated MJExplorer's `app.module.ts` to import `@memberjunction/ng-bootstrap` (manifest is part of main export)
- [x] **Task 4.5**: Regenerated both app manifests -- both correctly show 0 MJ classes (MJAPI: 78 non-MJ deps, MJExplorer: 809 non-MJ deps)
- [x] **Task 4.6**: Updated root `mj:manifest` to chain: server-bootstrap -> ng-bootstrap -> api -> explorer. Added `mj:manifest:server-bootstrap` and `mj:manifest:ng-bootstrap` scripts.

### Phase 5: Integration Testing and Validation

- [x] **Task 5.1**: MJAPI manifest with `--exclude-packages @memberjunction` shows 0 MJ classes (78 non-MJ deps walked)
- [x] **Task 5.2**: MJExplorer manifest with `--exclude-packages @memberjunction` shows 0 MJ classes (809 non-MJ deps walked)
- [x] **Task 5.3**: MJAPI builds cleanly with dual-manifest architecture (runtime start requires DB connection -- verified compilation only)
- [x] **Task 5.4**: MJExplorer builds cleanly with dual-manifest architecture (`ng build` succeeds, only pre-existing CommonJS warnings)
- [x] **Task 5.5**: Pre-built manifests verified in `dist/`: ServerBootstrap has `dist/mj-class-registrations.js` (subpath entry) + `dist/generated/mj-class-registrations.js` (manifest); ng-bootstrap embeds manifest in `dist/fesm2022/memberjunction-ng-bootstrap.mjs`
- [x] **Task 5.6**: Metadata constants verified: ServerBootstrap `CLASS_REGISTRATIONS_COUNT = 623` (54 packages), ng-bootstrap `CLASS_REGISTRATIONS_COUNT = 383` (14 packages)

### Phase 6: Documentation and CI

- [x] **Task 6.1**: Updated root `CLAUDE.md` with "Class Registration Manifests" section under Build Commands, documents dual-manifest architecture and key scripts
- [x] **Task 6.2**: MJAPI `src/index.ts` and MJExplorer `src/app/app.module.ts` already have clear comments explaining the dual-manifest approach (added during Phase 4)
- [x] **Task 6.3**: Root `mj:manifest` convenience script already updated to chain all 4 targets (done during Phase 4, Task 4.6)

### Phase 7: Developer Guide and ng-packagr Review

- [x] **Task 7.1**: Comprehensive guide written at `packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md` covering: (a) How the manifest system works (AST scanning, static code paths), (b) Three scenarios: MJ monorepo developers, custom app builders (do NOT exclude MJ), MJ distribution deployers (DO exclude MJ), (c) Full CLI reference with all flags, (d) Setup instructions for server and Angular apps, (e) Troubleshooting guide for common issues, (f) Technical details on write-on-change, legacy LoadXXX, etc.
- [x] **Task 7.2**: ng-packagr review complete -- all 383 classes correctly included in FESM2022 bundle, all @memberjunction/* imports preserved as external references, CLASS_REGISTRATIONS array properly exported, zero risk of duplicate registrations (--exclude-packages prevents overlap), bundle size reasonable at 41KB. No caveats found.

---

## Resolved Design Decisions

### Bootstrap Package Dependencies (RESOLVED)

**Verified:** `@memberjunction/server-bootstrap` is consumed ONLY by MJAPI. `@memberjunction/ng-bootstrap` is consumed ONLY by MJExplorer and `@memberjunction/ng-explorer-app` (which itself is only used by MJExplorer).

**Decision:** Mirror all `@memberjunction/*` dependencies from MJAPI into `server-bootstrap`'s `package.json`, and all `@memberjunction/*` dependencies from MJExplorer into `ng-bootstrap`'s `package.json`. This is required because:

- The generated manifest contains `import { FooClass } from '@memberjunction/some-package'` statements
- Those packages must be real `dependencies` in the bootstrap package's `package.json` or the build will fail
- Since each bootstrap package has exactly one consumer chain, adding these deps causes zero bloat -- the consumer already has them all

**For server-bootstrap**, add from MJAPI's deps:
- `@memberjunction/ai`
- `@memberjunction/communication-sendgrid`
- `@memberjunction/global`
- `@memberjunction/sqlserver-dataprovider`
- `@memberjunction/templates`
- Plus all transitive `@memberjunction/*` deps that the manifest references

**For ng-bootstrap**, add from MJExplorer's deps:
- `@memberjunction/core-entities`
- `@memberjunction/ng-base-forms`
- `@memberjunction/ng-core-entity-forms`
- `@memberjunction/ng-dashboards`
- `@memberjunction/ng-explorer-core`
- `@memberjunction/ng-explorer-modules`
- Plus all transitive `@memberjunction/*` deps that the manifest references

**Note:** The exact set of deps to add will be determined by the manifest content -- every package that appears in an `import { ... } from '...'` line in the manifest must be a dependency.

### Manifest Generation Context (RESOLVED)

The manifests will be generated from the bootstrap package's own `package.json` context (after deps are added), NOT from MJAPI/MJExplorer. This is cleaner because:
- The bootstrap package has the correct dependency tree for what it needs to cover
- No cross-package output path needed
- The `prebuild` script runs naturally in the package's own directory

### ng-packagr Integration (RESOLVED)

ng-packagr handles the manifest natively:
- Exported from main `public-api.ts` (no secondary entry point needed)
- All `@memberjunction/*` imports treated as external dependencies (not bundled)
- `CLASS_REGISTRATIONS` array and metadata constants exported in the FESM bundle
- `allowedNonPeerDependencies` in ng-package.json updated to suppress warnings
- Full review of runtime behavior deferred to Task 7.2

---

## Progress Log

_Updated as tasks are completed._

| Date | Task | Notes |
|------|------|-------|
| 2026-02-06 | Plan created | Initial architecture and task breakdown |
| 2026-02-06 | Phase 1 complete | `--exclude-packages` flag added to CodeGenLib + MJCLI, both compile clean |
| 2026-02-06 | Phase 2 complete | ServerBootstrap: 54 deps added, manifest generated (633 classes), subpath export configured, builds clean |
| 2026-02-06 | Phase 3 complete | ng-bootstrap: 14 deps added, manifest generated (384 classes), exported via public-api.ts, ng-packagr builds clean |
| 2026-02-06 | Phase 4 complete | MJAPI/MJExplorer updated: prestart uses --exclude-packages, imports pre-built + supplemental manifests, root mj:manifest chains all 4 targets |
| 2026-02-06 | Phase 5 complete | All validation passed: both app manifests show 0 MJ classes, both build clean, dist/ contains correct pre-built manifests with metadata |
| 2026-02-06 | Phase 6 complete | CLAUDE.md updated with manifest architecture section, MJAPI/MJExplorer comments already in place from Phase 4, root mj:manifest script already updated |
| 2026-02-06 | Phase 7 complete | Comprehensive developer guide at `packages/CodeGenLib/CLASS_MANIFEST_GUIDE.md`, ng-packagr review confirmed all 383 classes correct in FESM bundle with no issues |
| 2026-02-06 | **ALL PHASES COMPLETE** | Pre-built manifest distribution system fully implemented and documented |
