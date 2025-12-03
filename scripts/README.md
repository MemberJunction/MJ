# MemberJunction Dependency Management Scripts

This directory contains scripts for managing dependencies across the MemberJunction monorepo.

## Overview

The MemberJunction monorepo uses npm workspaces, which can hide missing dependencies through "hoisting" - where packages can access dependencies from other packages in the workspace. This works locally but breaks when packages are published to npm.

These scripts help detect and fix dependency issues before they affect published packages.

## Available Scripts

### 1. Check for Missing Dependencies

```bash
npm run deps:missing
```

Uses [Knip](https://knip.dev) to detect packages that are imported in code but not declared in `package.json`. These dependencies work locally due to workspace hoisting but will fail in published packages.

**Output:**
```
@memberjunction/actions-base  packages/Actions/CoreActions/src/action.ts:7:10
rxjs                         packages/Angular/Explorer/core-entity-forms/src/component.ts:3:26
```

### 2. Check for Unused Dependencies

```bash
npm run deps:unused
```

Detects dependencies declared in `package.json` but never imported in code. Removing these reduces bundle size and installation time.

### 3. Full Dependency Analysis

```bash
npm run deps:full
```

Runs complete Knip analysis including:
- Missing dependencies
- Unused dependencies
- Unused exports
- Unused files
- Type issues

## Auto-Fix Scripts

### Fix Missing Dependencies

**Dry run (preview changes):**
```bash
npm run deps:fix-missing:dry
```

**Apply changes:**
```bash
npm run deps:fix-missing
```

**What it does:**
1. Runs Knip to detect missing dependencies
2. Groups missing deps by package
3. Determines correct version for each dependency
   - `@memberjunction/*` packages use current monorepo version
   - External packages use version from other packages in workspace
4. Adds dependencies to `package.json` files
5. Runs `npm install` to update lock file

**Example output:**
```
📦 @memberjunction/core-actions
   Path: packages/Actions/CoreActions
   Adding 3 dependencies:
   + @memberjunction/actions-base@2.122.0
   + rxjs@^7.8.0
   + dotenv@^16.0.0

📊 Summary:
   Packages to update: 45
   Total dependencies to add: 127
```

### Remove Unused Dependencies

**Dry run (preview changes):**
```bash
npm run deps:remove-unused:dry
```

**Apply changes (with 5-second warning):**
```bash
npm run deps:remove-unused
```

**What it does:**
1. Runs Knip to detect unused dependencies
2. Groups unused deps by package
3. Removes from `package.json` files
4. Runs `npm install` to update lock file

**⚠️ WARNING:** Always review changes before removing dependencies. Some deps may be:
- Used only in production (not dev)
- Required by peer dependencies
- Used in ways Knip doesn't detect

## Workflow Integration

The GitHub Actions workflow `.github/workflows/dependency-check.yml` automatically:
- Runs on every PR to `next` branch
- Checks for missing dependencies
- Posts results as PR comment
- Uploads detailed report as artifact

This catches dependency issues before merge.

## Common Workflows

### Before Publishing a New Package

```bash
# Check what's missing
npm run deps:missing

# Preview fixes
npm run deps:fix-missing:dry

# Apply fixes
npm run deps:fix-missing

# Test build
npm run build

# Commit if successful
git add packages/*/package.json package-lock.json
git commit -m "fix: add missing dependencies to package"
```

### Cleanup Pass

```bash
# Check unused deps
npm run deps:unused

# Preview removals
npm run deps:remove-unused:dry

# Apply removals
npm run deps:remove-unused

# Test build
npm run build

# If build succeeds, commit
git add packages/*/package.json package-lock.json
git commit -m "chore: remove unused dependencies"

# If build fails, restore
git restore packages/*/package.json package-lock.json
npm install
```

### Fix Specific Package

```bash
# Missing deps for one package
node scripts/fix-missing-dependencies.mjs --package=Actions/CoreActions

# Unused deps for one package
node scripts/remove-unused-dependencies.mjs --package=Angular/Explorer/dashboards
```

## Understanding the Problem

### Why Missing Dependencies Work Locally

```
/MJ/
├── node_modules/           ← Everything hoisted here
│   ├── @memberjunction/actions-base  ← Installed by Engine package
│   └── rxjs                          ← Installed by Angular packages
└── packages/
    └── Actions/
        └── CoreActions/
            ├── package.json          ← Missing: actions-base, rxjs
            └── src/
                └── action.ts         ← Imports work due to hoisting!
```

Node.js walks UP the directory tree, finds deps in root `node_modules/`, so imports succeed.

### Why Published Packages Break

When someone installs `@memberjunction/core-actions`:
```bash
npm install @memberjunction/core-actions
```

They get:
- ✅ `@memberjunction/core-actions`
- ✅ Dependencies listed in its `package.json`
- ❌ **NOT** `actions-base` or `rxjs` (not in package.json)

Imports fail: `MODULE NOT FOUND`

## Best Practices

1. **Always declare direct dependencies** - Don't rely on transitive dependencies
2. **Run checks before PRs** - Use `npm run deps:missing` locally
3. **Test builds after fixes** - Ensure `npm run build` succeeds
4. **Review auto-fix changes** - Scripts are smart but not perfect
5. **Fix before publishing** - Catch issues before they reach consumers

## Troubleshooting

### False Positives for Missing Dependencies

If Knip reports a dependency as missing but it's actually in devDependencies or peerDependencies:
- This is usually correct - devDeps aren't available to consumers
- Move to `dependencies` if the code actually imports it

### False Positives for Unused Dependencies

If Knip reports a dependency as unused but you know it's needed:
- Check if it's a peer dependency requirement
- Check if it's used in ways Knip doesn't detect (dynamic imports, string references)
- Add to `knip.json` `ignoreDependencies` array

### Build Failures After Removing Unused

```bash
# Restore everything
git restore packages/*/package.json package-lock.json
npm install

# Review which deps were removed
git diff HEAD~1 packages/*/package.json

# Add back the ones that are actually needed
```

## Configuration

Knip configuration is in `/knip.json`:

```json
{
  "ignore": [
    "**/*.spec.ts",    // Test files
    "**/dist/**",      // Build output
    "**/generated/**"  // CodeGen files
  ],
  "ignoreDependencies": [
    "typescript",           // Build tool
    "@angular/compiler",    // Build tool
    "sass"                  // Build tool
  ]
}
```

## References

- [Knip Documentation](https://knip.dev)
- [GitHub Workflow Documentation](../.github/workflows/DEPENDENCY-CHECK.md)
- [npm Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces)
