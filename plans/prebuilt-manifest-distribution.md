# Pre-Built Class Registration Manifests for Distribution

## Status: IN PROGRESS
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

- [ ] **Task 1.1**: Add `excludePackages` option to `GenerateManifestOptions` interface in `packages/CodeGenLib/src/Manifest/GenerateClassRegistrationsManifest.ts`
- [ ] **Task 1.2**: Implement filtering logic in `walkDependencyTree()` to skip packages matching excluded prefixes
- [ ] **Task 1.3**: Add `--exclude-packages` flag to CLI command in `packages/MJCLI/src/commands/codegen/manifest.ts`
- [ ] **Task 1.4**: Build and verify CodeGenLib and MJCLI compile cleanly

### Phase 2: Server Bootstrap Pre-Built Manifest
Add full MJ deps to server-bootstrap and generate/embed the pre-built manifest.

- [ ] **Task 2.1**: Add all `@memberjunction/*` dependencies from MJAPI's `package.json` into `packages/ServerBootstrap/package.json`. These are required for the manifest's import statements to resolve.
- [ ] **Task 2.2**: Run `npm install` at repo root to wire up the new workspace dependencies
- [ ] **Task 2.3**: Add `prebuild` script to `packages/ServerBootstrap/package.json` that runs `mj codegen manifest` from ServerBootstrap's directory, outputting to `src/generated/mj-class-registrations.ts`
- [ ] **Task 2.4**: Add root-level npm script `mj:manifest:server-bootstrap` to generate the ServerBootstrap manifest from the repo root
- [ ] **Task 2.5**: Generate the manifest for the first time and verify it captures all expected server-side MJ classes (should match or closely match what MJAPI's manifest currently has)
- [ ] **Task 2.6**: Export the manifest from ServerBootstrap's `src/index.ts` (or as a separate entry point like `src/mj-class-registrations.ts`)
- [ ] **Task 2.7**: Ensure `tsconfig.json` includes the generated file and it compiles into `dist/`
- [ ] **Task 2.8**: Verify the manifest is included in the `files` array of `package.json` for npm distribution
- [ ] **Task 2.9**: Build and verify the package compiles cleanly with the embedded manifest

### Phase 3: Angular Bootstrap Pre-Built Manifest
Add full MJ Angular deps to ng-bootstrap and generate/embed the pre-built manifest.

- [ ] **Task 3.1**: Add all `@memberjunction/*` dependencies from MJExplorer's `package.json` into `packages/Angular/Bootstrap/package.json`. These are required for the manifest's import statements to resolve.
- [ ] **Task 3.2**: Run `npm install` at repo root to wire up the new workspace dependencies
- [ ] **Task 3.3**: Add `prebuild` script to `packages/Angular/Bootstrap/package.json` that generates the manifest, outputting to `src/generated/mj-class-registrations.ts`
- [ ] **Task 3.4**: Add root-level npm script `mj:manifest:ng-bootstrap` to generate the Angular Bootstrap manifest from the repo root
- [ ] **Task 3.5**: Generate the manifest for the first time and verify it captures all expected client-side MJ classes (should match or closely match MJExplorer's current manifest)
- [ ] **Task 3.6**: Export the manifest from ng-bootstrap's `public-api.ts` (or as a secondary entry point via ng-packagr)
- [ ] **Task 3.7**: Handle Angular library build specifics -- ng-packagr needs to see and compile the generated file
- [ ] **Task 3.8**: Build and verify the package compiles cleanly with the embedded manifest

### Phase 4: Update MJAPI and MJExplorer
Update the apps to use pre-built manifests + supplemental user manifests.

- [ ] **Task 4.1**: Update MJAPI's `prestart`/`prebuild` script to pass `--exclude-packages @memberjunction`
- [ ] **Task 4.2**: Update MJAPI's `src/index.ts` to import the pre-built manifest from `@memberjunction/server-bootstrap`
- [ ] **Task 4.3**: Update MJExplorer's `prestart`/`prebuild` script to pass `--exclude-packages @memberjunction`
- [ ] **Task 4.4**: Update MJExplorer's `src/app/app.module.ts` to import the pre-built manifest from `@memberjunction/ng-bootstrap`
- [ ] **Task 4.5**: Regenerate both app manifests to verify they now only contain non-MJ classes (should be empty or near-empty in the monorepo context)
- [ ] **Task 4.6**: Update root `package.json` `mj:manifest` script to include bootstrap manifest generation

### Phase 5: Integration Testing and Validation

- [ ] **Task 5.1**: Run `mj codegen manifest` for MJAPI with `--exclude-packages @memberjunction` and verify the output is correct (empty or only user packages)
- [ ] **Task 5.2**: Run `mj codegen manifest` for MJExplorer with `--exclude-packages @memberjunction` and verify
- [ ] **Task 5.3**: Verify MJAPI starts correctly with both manifests (pre-built + supplemental)
- [ ] **Task 5.4**: Verify MJExplorer builds and starts correctly with both manifests
- [ ] **Task 5.5**: Simulate external consumer scenario: verify that the pre-built manifest in `dist/` contains all expected MJ classes
- [ ] **Task 5.6**: Verify the `CLASS_REGISTRATIONS_COUNT` and `CLASS_REGISTRATIONS_PACKAGES` metadata in pre-built manifests look correct

### Phase 6: Documentation and CI

- [ ] **Task 6.1**: Update root `CLAUDE.md` to document the pre-built manifest architecture
- [ ] **Task 6.2**: Add comments to MJAPI and MJExplorer explaining the dual-manifest approach
- [ ] **Task 6.3**: Update root `mj:manifest` convenience script to regenerate all manifests (bootstrap + app)

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

### ng-packagr Integration (OPEN)

For Angular libraries, need to evaluate whether:
- A side-effect import of the main package entry suffices
- A secondary entry point (subpath export) is needed to keep the main entry clean
- ng-packagr can handle the generated file in `src/generated/`

This will be resolved during Phase 3 implementation.

---

## Progress Log

_Updated as tasks are completed._

| Date | Task | Notes |
|------|------|-------|
| 2026-02-06 | Plan created | Initial architecture and task breakdown |
