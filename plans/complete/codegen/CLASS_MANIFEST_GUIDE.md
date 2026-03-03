# Class Registration Manifest System

## Overview

MemberJunction uses a dynamic plugin architecture powered by `@RegisterClass` decorators and a global class factory (`MJGlobal.ClassFactory`). When code calls `ClassFactory.CreateInstance()`, it dynamically instantiates a class by name -- there is no static `import` or `new MyClass()` call the bundler can follow.

Modern bundlers (ESBuild, Vite, Webpack) analyze the static dependency graph to find code that is "used." Because the class factory uses dynamic instantiation, bundlers see `@RegisterClass`-decorated classes as unused dead code and **tree-shake them out of the bundle**. The manifest system prevents this.

## How the Manifest Works

The `mj codegen manifest` command:

1. **Walks the dependency tree** from a package's `package.json`, recursively resolving all `dependencies`
2. **Scans `src/**/*.ts` source files** in each dependency (skips `.d.ts`, `dist/`, `node_modules/`)
3. **Parses TypeScript AST** to find classes with `@RegisterClass` decorators
4. **Verifies each class is exported** from the package's public API (via `.d.ts` entry point)
5. **Emits a TypeScript manifest** with named imports and an exported `CLASS_REGISTRATIONS` array

The generated manifest looks like:

```typescript
import { FooEntity } from '@memberjunction/core-entities';
import { BarEngine } from '@memberjunction/some-engine';
// ... hundreds more imports

export const CLASS_REGISTRATIONS: any[] = [
    FooEntity,
    BarEngine,
    // ... references to every imported class
];
```

This creates a **static code path** the bundler cannot eliminate -- every class is explicitly referenced in the array, so the bundler keeps the import, the class gets evaluated, and the `@RegisterClass` decorator registers it in the global factory.

## Architecture: Three Scenarios

The manifest system supports three distinct scenarios. Understanding which one applies to you is critical.

### Scenario 1: Working Inside the MJ Monorepo

**Who:** MJ core developers working in the MemberJunction repository.

When you're inside the monorepo, all packages are symlinked via npm workspaces, so `src/` directories are available for every package. The manifest generator works end-to-end: it can scan all `@memberjunction/*` packages plus any local workspace packages.

**How it works:**
- Bootstrap packages (`@memberjunction/server-bootstrap`, `@memberjunction/ng-bootstrap`) have `prebuild` scripts that generate pre-built manifests covering all MJ classes
- MJAPI and MJExplorer have `prestart`/`prebuild` scripts that generate supplemental manifests with `--exclude-packages @memberjunction` (since MJ classes are covered by the bootstrap manifests)
- The root `npm run mj:manifest` regenerates all 4 manifests in the correct order

**You generally don't need to think about this** -- the build pipeline handles everything automatically.

### Scenario 2: Building a Custom App in Your Own Repo (Using MJ as Dependencies)

**Who:** Developers building their own applications using `@memberjunction/*` npm packages as dependencies. You have your own `package.json`, your own workspace packages, and potentially your own `@RegisterClass`-decorated classes.

**Key insight:** You do **NOT** exclude MJ packages. You want the manifest generator to find both MJ's classes and your own classes. However, the manifest generator scans `src/` directories, and npm-installed packages only have `dist/`. To handle this, you import the **pre-built manifest** from the bootstrap package, which covers all MJ classes, and then generate your own manifest for your custom classes.

**Setup for a server-side app (like MJAPI):**

1. Add `@memberjunction/server-bootstrap` to your dependencies (it transitively includes all MJ server packages)

2. In your app's entry point:
   ```typescript
   // Import pre-built MJ manifest (covers all @memberjunction/* classes)
   import '@memberjunction/server-bootstrap/mj-class-registrations';

   // Import your own manifest (covers your custom classes)
   import './generated/class-registrations-manifest.js';
   ```

3. Add a `prestart` or `prebuild` script to generate your manifest:
   ```json
   {
     "scripts": {
       "prestart": "mj codegen manifest --exclude-packages @memberjunction --output ./src/generated/class-registrations-manifest.ts"
     }
   }
   ```

   The `--exclude-packages @memberjunction` flag skips MJ packages (which don't have `src/` in your `node_modules/` anyway) and only scans your own workspace packages.

**Setup for an Angular app (like MJExplorer):**

1. Add `@memberjunction/ng-bootstrap` to your dependencies

2. In your `app.module.ts` or main entry:
   ```typescript
   // Import pre-built MJ manifest (all @memberjunction/* Angular classes)
   import '@memberjunction/ng-bootstrap';

   // Import your own manifest (your custom classes)
   import './generated/class-registrations-manifest';
   ```

3. Add a `prebuild` script:
   ```json
   {
     "scripts": {
       "prebuild": "mj codegen manifest --exclude-packages @memberjunction --output ./src/app/generated/class-registrations-manifest.ts"
     }
   }
   ```

**What if you have no custom `@RegisterClass` classes?** The manifest generator will produce an empty manifest (0 classes). That's fine -- it's a no-op at runtime. Keep the import anyway so that if you add custom classes later, they'll be picked up automatically.

### Scenario 3: Deploying MJ Distribution (MJAPI/MJExplorer) Outside the Monorepo

**Who:** Teams deploying MemberJunction's MJAPI or MJExplorer in their own infrastructure without the full monorepo.

This is functionally identical to Scenario 2 -- the bootstrap packages ship the pre-built manifests, and your `prestart`/`prebuild` generates a supplemental manifest for any custom additions. The MJAPI and MJExplorer packages are already configured this way.

## CLI Reference

### `mj codegen manifest`

Generate a class registrations manifest to prevent tree-shaking of `@RegisterClass` decorated classes.

**Flags:**

| Flag | Short | Description | Default |
|------|-------|-------------|---------|
| `--output <path>` | `-o` | Output manifest file path | `./src/generated/class-registrations-manifest.ts` |
| `--appDir <path>` | `-a` | App directory containing `package.json` | Current directory |
| `--filter <class>` | `-f` | Only include classes extending this base class (repeatable) | All classes |
| `--exclude-packages <prefix>` | `-e` | Skip packages matching this name prefix (repeatable) | None |
| `--verbose` | `-v` | Show detailed progress | Off |
| `--quiet` | `-q` | Suppress all output | Off |

### Examples

**Generate a full manifest (all packages, all classes):**
```bash
mj codegen manifest --output ./src/generated/class-registrations-manifest.ts
```

**Generate for a specific app directory:**
```bash
mj codegen manifest --appDir ./packages/MJAPI --output ./packages/MJAPI/src/generated/class-registrations-manifest.ts
```

**Exclude MJ packages (for supplemental manifest alongside pre-built):**
```bash
mj codegen manifest --exclude-packages @memberjunction --output ./src/generated/class-registrations-manifest.ts
```

**Filter to only engine classes:**
```bash
mj codegen manifest --filter BaseEngine --output ./src/generated/engines-manifest.ts
```

**Verbose output for debugging:**
```bash
mj codegen manifest --verbose --output ./src/generated/class-registrations-manifest.ts
```

### Root Scripts (MJ Monorepo Only)

| Script | Description |
|--------|-------------|
| `npm run mj:manifest` | Regenerate all 4 manifests in order |
| `npm run mj:manifest:server-bootstrap` | Regenerate server-bootstrap pre-built manifest |
| `npm run mj:manifest:ng-bootstrap` | Regenerate ng-bootstrap pre-built manifest |
| `npm run mj:manifest:api` | Regenerate MJAPI supplemental manifest |
| `npm run mj:manifest:explorer` | Regenerate MJExplorer supplemental manifest |

## How Pre-Built Manifests Ship

### Server Bootstrap (`@memberjunction/server-bootstrap`)

The pre-built manifest is generated during the package's `prebuild` step, compiled by `tsc`, and published in `dist/`. External consumers import it via a **subpath export**:

```typescript
import '@memberjunction/server-bootstrap/mj-class-registrations';
```

This resolves to `dist/mj-class-registrations.js` which re-exports from `dist/generated/mj-class-registrations.js` (the actual manifest).

**Stats:** 623 classes from 54 `@memberjunction/*` packages (958 deps walked).

### Angular Bootstrap (`@memberjunction/ng-bootstrap`)

The pre-built manifest is exported from the package's main `public-api.ts`:

```typescript
export * from './generated/mj-class-registrations';
```

ng-packagr bundles this into the FESM2022 module. All `@memberjunction/*` imports are treated as external dependencies (not bundled). The `CLASS_REGISTRATIONS` array and metadata constants are exported alongside the existing bootstrap exports.

Consumers import it by simply importing the package:

```typescript
import '@memberjunction/ng-bootstrap';
```

**Stats:** 383 classes from 14 `@memberjunction/*` Angular packages (491 deps walked).

## Troubleshooting

### "0 classes found" when running manifest generator

**Cause:** The generator scans `src/` directories. If you're working outside the monorepo, npm-installed packages only have `dist/`.

**Fix:** Use the pre-built manifest from the bootstrap package (see Scenario 2 above). Your supplemental manifest showing 0 MJ classes is correct -- those classes are covered by the pre-built manifest.

### Classes not registering at runtime

1. **Check the import order.** The pre-built manifest import must execute before any code that uses `ClassFactory.CreateInstance()`. Place it at the top of your entry file.

2. **Check that both manifests are imported.** You need the pre-built manifest (MJ classes) AND your supplemental manifest (your classes).

3. **Check that the `prebuild`/`prestart` script ran.** The supplemental manifest is generated on-demand. If you skip the prebuild step, you'll have a stale or missing manifest.

### Manifest is stale / missing new classes

**In the monorepo:** Run `npm run mj:manifest` to regenerate all manifests. Or run the specific script for the package that changed.

**Outside the monorepo:** Update your `@memberjunction/*` packages to the latest version. The pre-built manifest is regenerated with each MJ release.

### "Cannot find module" errors for manifest imports

**For `@memberjunction/server-bootstrap/mj-class-registrations`:**
- Ensure `@memberjunction/server-bootstrap` is version 4.0+ (pre-built manifests were added in this version)
- Check that the subpath export resolves: `node -e "require.resolve('@memberjunction/server-bootstrap/mj-class-registrations')"`

**For the supplemental manifest (`./generated/class-registrations-manifest`):**
- Run your `prebuild` or `prestart` script to generate it
- Check the `--output` path matches where your code imports from

### Duplicate class registrations

The `@RegisterClass` decorator uses the class factory's override mechanism -- if the same class is registered twice, the later registration wins. This is harmless but unnecessary.

To avoid it, use `--exclude-packages @memberjunction` in your supplemental manifest generation so it doesn't try to re-scan MJ packages (which won't work outside the monorepo anyway).

### Build errors in the manifest

The manifest imports classes by their exported names. If a package's public API changes (a class is renamed or removed), the manifest becomes invalid. Regenerate it:

```bash
mj codegen manifest --output <your-manifest-path>
```

## Technical Details

### How the Generator Finds Classes

1. Resolves the dependency tree by reading `package.json` `dependencies` recursively
2. For each package, looks for `src/` directory
3. Scans all `*.ts` files (excluding `*.d.ts`, `dist/`, `node_modules/`)
4. Uses the TypeScript Compiler API to parse AST and find `@RegisterClass` decorators
5. Extracts the class name and verifies it's exported from the package's `.d.ts` entry point
6. Groups classes by package and generates the manifest

### What Gets Generated

The manifest includes:
- **Named imports**: One `import { ClassName } from 'package-name'` per class
- **`CLASS_REGISTRATIONS` array**: References to every imported class (prevents tree-shaking)
- **`CLASS_REGISTRATIONS_MANIFEST_LOADED`**: Boolean marker for runtime checks
- **`CLASS_REGISTRATIONS_COUNT`**: Total class count for validation
- **`CLASS_REGISTRATIONS_PACKAGES`**: List of packages included (for debugging)

### Write-on-Change Behavior

The generator compares the new manifest content against the existing file. If the content is identical, it does **not** write the file. This preserves build cache timestamps and avoids unnecessary recompilation.

### Legacy LoadXXX Functions

There are 650+ empty stub functions (`export function LoadSomeClass() {}`) scattered across the codebase. These are a legacy tree-shaking prevention mechanism predating the manifest system. They will be removed in a future cleanup pass -- the manifest system fully supersedes them.
