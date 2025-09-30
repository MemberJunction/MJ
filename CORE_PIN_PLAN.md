# PLAN: Pin @memberjunction/core and @memberjunction/global to 2.100.3 While Advancing Other Packages

## Executive Summary

**Problem:** `@memberjunction/core@2.101.0` and `@memberjunction/core@2.102.0` failed to publish to npm (403 error), but all other packages published successfully. This blocks users from installing the latest MJ versions.

**Solution:** Pin BOTH `@memberjunction/core` AND `@memberjunction/global` at 2.100.3 (last working versions) while allowing other packages to continue versioning to 2.102.1+.

**Why pin global too?** Core depends on global (see core's package.json line 23), so we need to keep them in sync at 2.100.3 to avoid dependency mismatches.

**Challenge:** Your changesets config uses `"fixed": [["@memberjunction/*"]]`, which forces ALL packages to version together. We need to work around this constraint.

---

## Current State Analysis

### What's in npm Registry
- ✅ `@memberjunction/core@2.100.3` - Last successfully published
- ❌ `@memberjunction/core@2.101.0` - Failed (403 error)
- ❌ `@memberjunction/core@2.102.0` - Failed (403 error)
- ✅ `@memberjunction/global@2.100.3` - Last successfully published
- ✅ `@memberjunction/global@2.101.0` - Published successfully (but we'll pin to 2.100.3)
- ✅ `@memberjunction/global@2.102.0` - Published successfully (but we'll pin to 2.100.3)
- ✅ All other packages at 2.101.0 and 2.102.0 - Published successfully

**Note:** We're pinning global@2.100.3 even though newer versions exist, to keep it in sync with core@2.100.3 (core depends on global).

### What's in Local Repo
- All packages currently at version 2.101.0 (files show 2.101.0, you mentioned 2.102.0)
- 6 pending changeset files ready for next version bump
- 101+ packages depend on `@memberjunction/core`

### Versioning System
- **Tool:** Changesets CLI (`@changesets/cli`)
- **Fixed Group:** All `@memberjunction/*` packages version together
- **Workflow:** GitHub Actions runs on main branch push
- **Reference Package:** Workflows use `packages/MJCore/package.json` to determine version
- **Commands:**
  - `npm run change version` - Bumps versions
  - `npm run change publish` - Publishes to npm

---

## Implementation Plan

### PHASE 1: Downgrade Core and Global to 2.100.3 in Local Repo

#### Step 1.1: Manually Edit Core Package
**File:** `/Users/ethanlin/Projects/MJ/MJ/packages/MJCore/package.json`

**Change the version field:**
```json
{
  "name": "@memberjunction/core",
  "version": "2.100.3",  // ← Change from 2.101.0 to 2.100.3
  "dependencies": {
    "@memberjunction/global": "2.100.3"  // ← Also pin global to 2.100.3
  }
}
```

**Why:** This sets core back to the last known working version in npm, and keeps its global dependency in sync.

---

#### Step 1.2: Manually Edit Global Package
**File:** `/Users/ethanlin/Projects/MJ/MJ/packages/MJGlobal/package.json`

**Change the version field:**
```json
{
  "name": "@memberjunction/global",
  "version": "2.100.3"  // ← Change from 2.101.0 to 2.100.3
}
```

**Why:** Keep global in sync with core at 2.100.3 to avoid dependency version mismatches.

---

#### Step 1.3: Update All Core Dependencies Using VSCode Find & Replace

You need to update all 101+ package.json files that depend on core.

**Method: Use VSCode Regex Find & Replace**

1. **Open Find & Replace** (Cmd+Shift+H or Ctrl+Shift+H)

2. **Enable Regex Mode** (click the `.*` button)

3. **Set Files to Include:**
   ```
   packages/**/package.json
   ```

4. **Set Files to Exclude:**
   ```
   **/node_modules/**
   ```

5. **Find Pattern:**
   ```regex
   "@memberjunction/core": "2\.10[12]\.0"
   ```

   **Explanation:**
   - Matches `"@memberjunction/core": "2.101.0"` OR `"2.102.0"`
   - `\.` escapes the period
   - `10[12]` matches either `101` or `102`

6. **Replace With:**
   ```
   "@memberjunction/core": "2.100.3"
   ```

7. **Click "Replace All"**

**Expected Result:** ~101 replacements across all package.json files

---

#### Step 1.4: Update All Global Dependencies Using VSCode Find & Replace

Now update global dependencies (there will be fewer of these).

**Repeat the same process:**

1. **Find Pattern:**
   ```regex
   "@memberjunction/global": "2\.10[12]\.0"
   ```

2. **Replace With:**
   ```
   "@memberjunction/global": "2.100.3"
   ```

3. **Click "Replace All"**

**Expected Result:** ~50-60 replacements (fewer packages depend on global)

---

#### Step 1.5: Regenerate package-lock.json

**Command:**
```bash
cd /Users/ethanlin/Projects/MJ/MJ
npm install
```

**What this does:**
- Updates `package-lock.json` to reference `core@2.100.3` and `global@2.100.3` from npm registry
- Resolves all workspace dependencies
- Downloads core@2.100.3 and global@2.100.3 to node_modules

**Expected output:** Should complete without errors since both 2.100.3 versions exist in npm.

---

#### Step 1.6: Verify Build Works

**Command:**
```bash
npm run build
```

**What to check:**
- All packages compile successfully
- No TypeScript errors
- Core and global packages at 2.100.3 work with other packages at 2.101.0

**Why this works:** Core 2.100.3 → 2.101.0 and global 2.100.3 → 2.101.0 likely have no breaking changes, just patches/features.

---

### PHASE 2: Configure Changesets to Ignore Core (⚠️ SKIPPED DUE TO VALIDATION ERRORS)

#### ⚠️ UPDATE: This Phase Was Attempted But Abandoned

**Original Plan:** Add core and global to changesets ignore list.

**What Went Wrong:** When running `npm run change`, changesets validation failed with errors like:
```
🦋  error The package "@memberjunction/a2aserver" depends on the ignored package "@memberjunction/core",
but "@memberjunction/a2aserver" is not being ignored. Please add "@memberjunction/a2aserver" to the `ignore` option.
```

**Root Cause:** Changesets has a rule: if you ignore a package, you must also ignore ALL packages that depend on it. Since every MJ package (100+) depends on core/global, we'd have to ignore everything, which defeats the purpose.

**Solution:** Remove core and global from ignore list and rely solely on the **post-hook script** (Phase 4) as the primary protection mechanism.

**Current State:** `.changeset/config.json` remains unchanged with only `"ignore": ["mj_*"]`

**Result:** The post-hook script in Phase 4 is now the ONLY mechanism protecting core/global pins during changeset operations.

---

### PHASE 3: Modify MJ CLI Bump Command

The `mj bump` command is used to update all `@memberjunction/*` dependencies to a specific version. This is defined in the MJCLI package and needs modification to skip the core package.

#### Understanding `mj bump -r`

**Location:** `/Users/ethanlin/Projects/MJ/MJ/packages/MJCLI/src/commands/bump/index.ts`

**What it does:**
- Line 70: Finds all `package.json` files (recursively with `-r` flag)
- Line 80: Uses regex `/"@memberjunction\/([^"]+)":(\s*)("[^"]+")/g` to match all MJ dependencies
- Line 98: Replaces ALL `@memberjunction/*` versions with target version
- Target version comes from:
  - `-t` flag (e.g., `mj bump -r -t 2.102.1`)
  - OR CLI's own version from `this.config.pjson.version` (line 64)

**Current behavior:** Bumps **ALL** @memberjunction packages including core and global.

**Problem:** When you run `mj bump -r -t 2.102.1`, it will update core AND global to 2.102.1, breaking our pins.

---

#### Step 3.1: Modify Bump Command to Skip Core and Global

**File:** `/Users/ethanlin/Projects/MJ/MJ/packages/MJCLI/src/commands/bump/index.ts`

**Find lines 79-98:**
```typescript
const skipped = [];
const mjRegx = /"@memberjunction\/([^"]+)":(\s*)("[^"]+")/g;
const banner = 'Bumping packages... ';
const spinner = ora(banner);
spinner.start();
normalLogger('');

try {
  for (let i = 0; i < packageJsonFiles.length; i++) {
    const packageJson = `./${packageJsonFiles[i]}`;
    const packageJsonContents = readFileSync(packageJson).toString();
    if (!mjRegx.test(packageJsonContents)) {
      skipped.push(packageJson);
      continue;
    }

    verboseLogger(`\tBumping ${dirname(packageJson)}`);
    spinner.text = `${banner} ${i + 1 - skipped.length}/${packageJsonFiles.length - skipped.length}`;

    const bumpedPackageJson = packageJsonContents.replaceAll(mjRegx, `"@memberjunction/$1":$2"${targetVersion}"`);
```

**Replace with:**
```typescript
const skipped = [];
const mjRegx = /"@memberjunction\/([^"]+)":(\s*)("[^"]+")/g;
const banner = 'Bumping packages... ';
const spinner = ora(banner);
spinner.start();
normalLogger('');

// TEMPORARY: Pin core and global at 2.100.3 until npm registry issue is resolved
const PINNED_VERSION = '2.100.3';
const PINNED_PACKAGES = ['core', 'global'];

try {
  for (let i = 0; i < packageJsonFiles.length; i++) {
    const packageJson = `./${packageJsonFiles[i]}`;
    const packageJsonContents = readFileSync(packageJson).toString();
    if (!mjRegx.test(packageJsonContents)) {
      skipped.push(packageJson);
      continue;
    }

    verboseLogger(`\tBumping ${dirname(packageJson)}`);
    spinner.text = `${banner} ${i + 1 - skipped.length}/${packageJsonFiles.length - skipped.length}`;

    // Replace all @memberjunction dependencies, but pin core and global at 2.100.3
    const bumpedPackageJson = packageJsonContents.replaceAll(
      mjRegx,
      (match, packageName, spacing, version) => {
        // Skip bumping pinned packages - keep them at 2.100.3
        if (PINNED_PACKAGES.includes(packageName)) {
          return `"@memberjunction/${packageName}":${spacing}"${PINNED_VERSION}"`;
        }
        return `"@memberjunction/${packageName}":${spacing}"${targetVersion}"`;
      }
    );
```

**What this does:**
- Adds a callback function to `replaceAll` instead of a simple string replacement
- Defines `PINNED_PACKAGES` array containing both `'core'` and `'global'`
- Checks if the package name is in the pinned list
- If it's pinned: replaces with `2.100.3`
- If it's any other package: replaces with target version
- Developers can still run `mj bump -r` safely

---

#### Step 3.2: Rebuild MJCLI Package

After modifying the bump command, you need to rebuild the CLI:

```bash
cd /Users/ethanlin/Projects/MJ/MJ/packages/MJCLI
npm run build
```

**What this does:** Compiles TypeScript changes to JavaScript in the `dist` folder.

---

#### Step 3.3: Test the Modified Bump Command Locally

**Option 1: Test with local CLI (in dev mode)**
```bash
cd /Users/ethanlin/Projects/MJ/MJ/packages/MJCLI
./bin/dev.js bump -rdv
```

**Option 2: Link CLI globally for testing**
```bash
cd /Users/ethanlin/Projects/MJ/MJ/packages/MJCLI
npm link

# Now test from repo root
cd /Users/ethanlin/Projects/MJ/MJ
mj bump -rdv
```

**Expected output:**
- Shows it would bump all packages EXCEPT core and global stay at 2.100.3
- The `-d` (dry run) flag prevents actual changes
- The `-v` (verbose) flag shows all files being processed

---

#### Step 3.4: Verify Bump Works Correctly

**Scenario 1: Bump to new version**
```bash
cd /Users/ethanlin/Projects/MJ/MJ
mj bump -r -t 2.102.1

# Check results - Core pinned
jq -r .version packages/MJCore/package.json
# Should output: 2.100.3 (unchanged!)

# Check results - Global pinned
jq -r .version packages/MJGlobal/package.json
# Should output: 2.100.3 (unchanged!)

# Check results - Other packages bumped
jq -r .version packages/MJServer/package.json
# Should output: 2.102.1 (bumped!)

# Check core dependency in other packages
jq -r '.dependencies["@memberjunction/core"]' packages/MJServer/package.json
# Should output: 2.100.3 (pinned!)

# Check global dependency in core
jq -r '.dependencies["@memberjunction/global"]' packages/MJCore/package.json
# Should output: 2.100.3 (pinned!)
```

**Important:** The CLI itself will also be bumped to the target version, so when you publish CLI@2.102.1, the `mj bump` command will default to bumping packages to 2.102.1 (except core and global).

---

### PHASE 4: Create Post-Version Hook Script

## ⚠️ WHY WE NEED THIS PHASE - DETAILED EXPLANATION

**The Problem with Changesets Ignore:**

Even though we added core and global to the `ignore` list in Phase 2, **changesets may still modify them indirectly** through its internal dependency resolution. Here's why:

1. **How Changesets Works:**
   - When you run `changeset version`, it reads all `.changeset/*.md` files
   - It calculates what versions packages should be bumped to
   - It updates ALL package.json files in the workspace
   - It updates dependencies based on `updateInternalDependencies` setting

2. **The `ignore` Config Limitation:**
   - `ignore` prevents changesets from:
     - Creating a CHANGELOG entry for that package
     - Publishing that package with `changeset publish`
   - But it does NOT prevent changesets from:
     - Updating the package's version number in package.json
     - Updating other packages' dependencies to reference new versions

3. **What Can Go Wrong:**
   - Changeset reads a changeset file that mentions core as "minor"
   - Even though core is in ignore, changeset might still update core's version in its package.json
   - Changesets sees global is in the `fixed` group and updates it to match other packages
   - Other packages' dependencies get updated to reference core@2.102.1 instead of 2.100.3
   - The `updateInternalDependencies: "patch"` setting can cause version bumps in dependencies

4. **Real Example Scenario:**
   ```bash
   # Before running changeset version:
   packages/MJCore/package.json: "version": "2.100.3"
   packages/MJServer/package.json: "@memberjunction/core": "2.100.3"

   # After running changeset version (BAD - without post-hook):
   packages/MJCore/package.json: "version": "2.102.1"  ← Got bumped despite ignore!
   packages/MJServer/package.json: "@memberjunction/core": "2.102.1"  ← Updated!

   # With post-hook (GOOD):
   packages/MJCore/package.json: "version": "2.100.3"  ← Restored by post-hook
   packages/MJServer/package.json: "@memberjunction/core": "2.100.3"  ← Fixed by post-hook
   ```

**Why the Post-Hook is Our Primary Protection:**

The post-version hook script runs **immediately after** `changeset version` completes and:
- ✅ Forces core back to 2.100.3 (in case changesets touched it)
- ✅ Forces global back to 2.100.3 (in case changesets touched it)
- ✅ Scans ALL package.json files and fixes any core/global dependency references
- ✅ Runs `npm install` to update package-lock.json
- ✅ Guarantees consistency even if changesets behavior changes in the future

**⚠️ NOTE:** Originally we planned to use changesets' `ignore` config as a second layer of defense, but it caused validation errors (see Phase 2). The post-hook is now our **sole protection mechanism** for maintaining the pins.

---

Now let's create the actual hook script:

#### Step 4.1: Create Script File
**File:** `/Users/ethanlin/Projects/MJ/MJ/scripts/post-changeset-version.js`

**Content:**
```javascript
#!/usr/bin/env node
/**
 * Post-Changeset Version Hook
 *
 * This script runs after 'changeset version' to:
 * 1. Reset @memberjunction/core to 2.100.3 (in case changesets touched it)
 * 2. Reset @memberjunction/global to 2.100.3 (in case changesets touched it)
 * 3. Update all package dependencies to reference core@2.100.3 and global@2.100.3
 * 4. Ensure core's dependency on global is 2.100.3
 * 5. Regenerate package-lock.json
 *
 * This is a temporary measure while core@2.101.0 and 2.102.0 have npm registry issues.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const glob = require('glob');

const PINNED_VERSION = '2.100.3';
const PINNED_PACKAGES = {
  core: { name: '@memberjunction/core', path: 'packages/MJCore/package.json' },
  global: { name: '@memberjunction/global', path: 'packages/MJGlobal/package.json' }
};

console.log('\n🔧 Running post-changeset version hook...\n');

// Step 1: Reset pinned packages to 2.100.3
console.log('Step 1: Resetting pinned packages to 2.100.3...');
Object.entries(PINNED_PACKAGES).forEach(([key, { name, path: pkgPath }]) => {
  const fullPath = path.join(__dirname, '..', pkgPath);
  const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));

  if (pkg.version !== PINNED_VERSION) {
    const oldVersion = pkg.version;
    pkg.version = PINNED_VERSION;

    // Special case: core depends on global, ensure it's pinned too
    if (key === 'core' && pkg.dependencies?.['@memberjunction/global']) {
      pkg.dependencies['@memberjunction/global'] = PINNED_VERSION;
    }

    fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`   ✓ Reset ${name}: ${oldVersion} → ${PINNED_VERSION}`);
  } else {
    console.log(`   ✓ ${name} already at ${PINNED_VERSION}`);
  }
});

// Step 2: Update all packages that depend on pinned packages
console.log('\nStep 2: Updating all dependencies to pinned versions...');
const packageFiles = glob.sync('packages/**/package.json', {
  ignore: ['**/node_modules/**'],
  cwd: path.join(__dirname, '..')
});

let updatedCount = 0;
packageFiles.forEach(file => {
  const pkgPath = path.join(__dirname, '..', file);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

  let modified = false;

  // Check dependencies for both core and global
  Object.values(PINNED_PACKAGES).forEach(({ name }) => {
    ['dependencies', 'devDependencies'].forEach(depType => {
      if (pkg[depType]?.[name]) {
        if (pkg[depType][name] !== PINNED_VERSION) {
          pkg[depType][name] = PINNED_VERSION;
          modified = true;
        }
      }
    });
  });

  if (modified) {
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    updatedCount++;
  }
});

console.log(`   ✓ Updated ${updatedCount} packages`);

// Step 3: Update package-lock.json
console.log('\nStep 3: Updating package-lock.json...');
try {
  execSync('npm install', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..')
  });
  console.log('   ✓ package-lock.json updated');
} catch (error) {
  console.error('   ✗ Failed to update package-lock.json:', error.message);
  process.exit(1);
}

console.log('\n✅ Post-changeset version hook completed successfully!\n');
console.log(`📌 Pinned packages: core@${PINNED_VERSION}, global@${PINNED_VERSION}\n`);
```

**Make executable:**
```bash
chmod +x scripts/post-changeset-version.js
```

**What this does:**
1. Checks if core version changed from 2.100.3, resets it if needed
2. Scans all package.json files and updates core dependency references
3. Runs `npm install` to regenerate package-lock.json
4. Ensures consistency after any changeset operations

---

#### Step 4.2: Update Root Package Scripts
**File:** `/Users/ethanlin/Projects/MJ/MJ/package.json`

**Find the scripts section:**
```json
{
  "scripts": {
    "change": "changeset",
    "mergemain": "node ci/merge_main.mjs",
    "mergemain:update-lock": "node ci/merge_main_and_update_lock.mjs",
    "commitpush": "node ci/commit_push.mjs"
  }
}
```

**Add new script:**
```json
{
  "scripts": {
    "change": "changeset",
    "version:safe": "changeset version && node scripts/post-changeset-version.js",
    "mergemain": "node ci/merge_main.mjs",
    "mergemain:update-lock": "node ci/merge_main_and_update_lock.mjs",
    "commitpush": "node ci/commit_push.mjs"
  }
}
```

**Usage:**
- **Local development:** Developers run `npm run version:safe` instead of `npm run change version`
- **GitHub Actions:** We'll update the workflow to use this script

---

### PHASE 5: Modify GitHub Actions Publish Workflow

The publish workflow needs several modifications to handle the pinned core and global packages.

**File:** `/Users/ethanlin/Projects/MJ/MJ/.github/workflows/publish.yml`

**⚠️ IMPORTANT:** Both core AND global are pinned at 2.100.3, so we cannot use either as the version reference. We'll use **MJServer** instead, which versions normally along with all other packages.

---

#### Change 5.1: Use MJServer Package as Version Reference

**Line 97 - Find:**
```bash
CURRENT_VERSION=$(jq -r .version packages/MJCore/package.json)
```

**Replace with:**
```bash
# Use MJServer package as version reference since core and global are pinned at 2.100.3
CURRENT_VERSION=$(jq -r .version packages/MJServer/package.json)
```

**Why:** Both core and global are frozen at 2.100.3, so we need a different package that versions normally to track the actual release version. MJServer is a good choice as it's a core package that always publishes with each release.

---

#### Change 5.2: Update Version Check

**Line 113 - Find:**
```bash
NEXT_VERSION=$(jq -r .version packages/MJCore/package.json)
```

**Replace with:**
```bash
NEXT_VERSION=$(jq -r .version packages/MJServer/package.json)
```

---

#### Change 5.3: Update Version Command to Use Post-Hook

**Line 112 - Find:**
```bash
npm run change version
```

**Replace with:**
```bash
npm run version:safe
```

**Why:** This runs the post-hook to ensure core stays at 2.100.3 after versioning.

---

#### Change 5.4: Fix Package Count Validation

**Lines 119-125 - Find:**
```bash
MJ_PACKAGE_COUNT=$(grep --exclude-dir node_modules  --include package.json -R '"name": "@memberjunction/' | wc -l)
NEXT_VERSION_PACKAGE_COUNT=$(grep --exclude-dir node_modules  --include package.json -R '"version": "'$NEXT_VERSION'"' | wc -l)
if [ "$MJ_PACKAGE_COUNT" != "$NEXT_VERSION_PACKAGE_COUNT" ]; then
  echo "::error::One or more packages would not be published with the expected next version ($EXPECTED_NEXT_VERSION)"
  grep --exclude-dir node_modules  --include package.json -RL '"version": "'$NEXT_VERSION'"' | xargs grep '"name": "@memberjunction/'
  exit 1
fi
```

**Replace with:**
```bash
# Verify core and global are still pinned at 2.100.3
CORE_VERSION=$(jq -r .version packages/MJCore/package.json)
GLOBAL_VERSION=$(jq -r .version packages/MJGlobal/package.json)

if [ "$CORE_VERSION" != "2.100.3" ]; then
  echo "::error::Core package version ($CORE_VERSION) has changed from pinned version 2.100.3"
  echo "Core must remain at 2.100.3 until npm registry issue is resolved"
  exit 1
fi

if [ "$GLOBAL_VERSION" != "2.100.3" ]; then
  echo "::error::Global package version ($GLOBAL_VERSION) has changed from pinned version 2.100.3"
  echo "Global must remain at 2.100.3 until npm registry issue is resolved"
  exit 1
fi

# Count all @memberjunction packages EXCEPT core and global
MJ_PACKAGE_COUNT=$(grep --exclude-dir node_modules --include package.json -R '"name": "@memberjunction/' | grep -v '@memberjunction/core' | grep -v '@memberjunction/global' | wc -l)
NEXT_VERSION_PACKAGE_COUNT=$(grep --exclude-dir node_modules --include package.json -R '"version": "'$NEXT_VERSION'"' | grep -v packages/MJCore/package.json | grep -v packages/MJGlobal/package.json | wc -l)

if [ "$MJ_PACKAGE_COUNT" != "$NEXT_VERSION_PACKAGE_COUNT" ]; then
  echo "::error::One or more packages (excluding core and global) would not be published with version ($NEXT_VERSION)"
  echo "Packages not at expected version:"
  grep --exclude-dir node_modules --include package.json -RL '"version": "'$NEXT_VERSION'"' | grep -v packages/MJCore/package.json | grep -v packages/MJGlobal/package.json | xargs grep '"name": "@memberjunction/'
  exit 1
fi

echo "✓ Version validation passed:"
echo "  - Core pinned at: $CORE_VERSION"
echo "  - Global pinned at: $GLOBAL_VERSION"
echo "  - Other packages at: $NEXT_VERSION"
echo "  - Package count: $MJ_PACKAGE_COUNT"
```

**Why:**
- Validates core is still at 2.100.3
- Excludes core from version count checks
- Provides better error messages

---

#### Change 5.5: Update Git Tag Version Reference

**Line 146 - Find:**
```bash
VERSION="v"$(jq -r .version packages/MJCore/package.json)
```

**Replace with:**
```bash
VERSION="v"$(jq -r .version packages/MJServer/package.json)
```

**Why:** Git tags should reflect the actual release version (e.g., v2.102.1), not the pinned core/global version (2.100.3). MJServer versions normally so it provides the correct release version.

---

#### Change 5.6: Fix Docker Workflow Version Reference

**File:** `/Users/ethanlin/Projects/MJ/MJ/.github/workflows/docker.yml`

**Line 28 - Find:**
```bash
VERSION=$(jq -r .version packages/MJCore/package.json)
```

**Replace with:**
```bash
# Use MJServer package since core and global are pinned at 2.100.3
VERSION=$(jq -r .version packages/MJServer/package.json)
```

**Why:** Docker images are tagged with the release version. Using MJCore would tag images as v2.100.3 when the actual release is v2.102.1, breaking Docker deployments.

**Critical:** This was discovered during workflow review and is essential for correct Docker image tagging.

---

### PHASE 6: Modify Migration Validation Workflow

**File:** `/Users/ethanlin/Projects/MJ/MJ/.github/workflows/changes.yml`

#### Change 6.1: Update Version Reference

**Line 32 - Find:**
```bash
CURRENT_VERSION=$(jq -r .version packages/MJCore/package.json)
```

**Replace with:**
```bash
# Use MJServer package since core and global are pinned at 2.100.3
CURRENT_VERSION=$(jq -r .version packages/MJServer/package.json)
```

**Why:** Migration filenames should use the actual release version, not core/global's pinned version. MJServer versions normally so it provides the correct release version.

---

### PHASE 7: Test Locally Before Committing

#### Step 7.1: Verify Current State
```bash
cd /Users/ethanlin/Projects/MJ/MJ

# Check core version
jq -r .version packages/MJCore/package.json
# Should output: 2.100.3

# Check global version
jq -r .version packages/MJGlobal/package.json
# Should output: 2.100.3

# Check core's dependency on global
jq -r '.dependencies["@memberjunction/global"]' packages/MJCore/package.json
# Should output: 2.100.3

# Check another package version (should be higher)
jq -r .version packages/MJServer/package.json
# Should output: 2.101.0 (or current version)
```

---

#### Step 7.2: Test Build
```bash
npm run build
```

**Expected:** Should complete successfully with no errors.

---

#### Step 7.3: Test Version Bump (Dry Run)
```bash
# Add a test changeset
npm run change
# Choose a package (e.g., global)
# Choose patch
# Write a message: "Test changeset"

# Run version with our new script
npm run version:safe
```

**Expected results:**
1. Other packages bump to next version (e.g., 2.101.0 → 2.102.1)
2. Core stays at 2.100.3
3. Global stays at 2.100.3
4. Script output shows:
   ```
   🔧 Running post-changeset version hook...
   Step 1: Resetting pinned packages to 2.100.3...
      ✓ @memberjunction/core already at 2.100.3
      ✓ @memberjunction/global already at 2.100.3
   Step 2: Updating all dependencies to pinned versions...
      ✓ Updated 0 packages (or some number)
   Step 3: Updating package-lock.json...
      ✓ package-lock.json updated
   ✅ Post-changeset version hook completed successfully!
   📌 Pinned packages: core@2.100.3, global@2.100.3
   ```

---

#### Step 7.4: Verify Results
```bash
# Check core is still at 2.100.3
jq -r .version packages/MJCore/package.json
# Should output: 2.100.3

# Check global is still at 2.100.3
jq -r .version packages/MJGlobal/package.json
# Should output: 2.100.3

# Check other package bumped
jq -r .version packages/MJServer/package.json
# Should output: 2.102.1 (or next version)

# Check core's global dependency
jq -r '.dependencies["@memberjunction/global"]' packages/MJCore/package.json
# Should output: 2.100.3

# Check server's core dependency
jq -r '.dependencies["@memberjunction/core"]' packages/MJServer/package.json
# Should output: 2.100.3

# Check that build still works
npm run build
```

---

#### Step 7.5: Revert Test Changes
```bash
# If you created a test changeset, delete it
rm .changeset/[test-changeset-name].md

# Revert any version bumps
git checkout packages/*/package.json
git checkout package-lock.json
```

---

### PHASE 8: Commit and Deploy

#### Step 8.1: Review All Changes
```bash
git status
```

**Expected changed files:**
- `packages/MJCore/package.json` - Version changed to 2.100.3, global dependency to 2.100.3
- `packages/MJGlobal/package.json` - Version changed to 2.100.3
- 101+ `packages/*/package.json` - Core and global dependencies changed to 2.100.3
- `package-lock.json` - Updated with 2.100.3 references for both packages
- `packages/MJCLI/src/commands/bump/index.ts` - Modified to skip core and global
- `packages/MJCLI/dist/**` - Rebuilt CLI output
- `package.json` - New version:safe script
- `.github/workflows/publish.yml` - Multiple modifications
- `.github/workflows/changes.yml` - Version reference updated
- `.github/workflows/docker.yml` - Version reference updated
- `scripts/post-changeset-version.js` - New file

**Note:** `.changeset/config.json` is NOT modified (Phase 2 was skipped)

---

#### Step 8.2: Create Commit
```bash
git add .
git commit -m "Pin @memberjunction/core and @memberjunction/global to 2.100.3 while npm issue is resolved

- Core and global pinned at 2.100.3 (last working versions in npm)
- Created post-version hook as primary protection mechanism
- Modified mj bump command to skip core and global
- Updated workflows to use MJServer package as version reference
- Modified validation to exclude core and global from version checks
- Added version:safe script to run changesets with post-hook

Note: Changesets ignore config NOT used due to validation errors

This is temporary until npm resolves 403 errors for core@2.101.0 and 2.102.0"
```

---

#### Step 8.3: Push to Feature Branch First
```bash
# Create feature branch
git checkout -b fix/pin-core-2.100.3

# Push to remote
git push -u origin fix/pin-core-2.100.3
```

---

#### Step 8.4: Create Pull Request
- Create PR to `next` branch
- Title: "Pin @memberjunction/core to 2.100.3 (npm registry issue)"
- Description: Link to this plan document
- Request review from team

---

#### Step 8.5: After PR Merged - Test Release
1. Merge PR to `next` branch
2. Create PR from `next` to `main` with pending changesets
3. When merged to `main`, GitHub Actions will:
   - Run version bump using `npm run version:safe`
   - Core stays at 2.100.3
   - Other packages bump to 2.102.1 (or next version)
   - Publish to npm (core skipped via ignore list)
   - Create git tag v2.102.1

---

## What Happens on Each Release Going Forward

### Developer Workflow - Creating Changes
1. Make changes to packages
2. Run `npm run change` to create changeset
3. Commit changeset file
4. Create PR to `next` branch

### Developer Workflow - Bumping Dependencies (Local Development)

**When working locally and need to update MJ dependencies:**

```bash
# Bump all @memberjunction/* dependencies to latest (except core and global stay at 2.100.3)
mj bump -r

# Or specify a version
mj bump -r -t 2.102.1

# Dry run to preview changes
mj bump -rdv
```

**What happens:**
- All `@memberjunction/*` dependencies get bumped to target version
- **EXCEPT** `@memberjunction/core` which stays at `2.100.3`
- **EXCEPT** `@memberjunction/global` which stays at `2.100.3`
- The modified CLI ensures both core and global are never bumped
- After bumping, run `npm install` to update package-lock.json

**Important:** Once the CLI is published with the modified bump command, all developers will automatically get the core/global-pinning behavior when they install the new CLI version.

### Release Workflow (Automated)
1. PR merged to `main` branch
2. GitHub Actions runs:
   ```bash
   npm run version:safe
   # ↳ changeset version (bumps all non-core/non-global packages)
   # ↳ post-changeset-version.js (ensures core and global stay at 2.100.3)
   ```
3. Packages published:
   - Core: **Skipped** (still at 2.100.3, won't be published since no version bump)
   - Global: **Skipped** (still at 2.100.3, won't be published since no version bump)
   - Server: Published at 2.102.1
   - All others: Published at 2.102.1
4. Git tag created: `v2.102.1`

### User Installation Experience

**Scenario 1: Fresh Install of Latest MJ**
```bash
npm install @memberjunction/cli@latest
# OR
npm install @memberjunction/cli@2.102.1
```

**What npm does:**
1. Fetches `@memberjunction/cli@2.102.1` from npm registry
2. Reads its package.json dependencies:
   ```json
   {
     "@memberjunction/core": "2.100.3",
     "@memberjunction/global": "2.100.3",
     "@memberjunction/server": "2.102.1",
     ...
   }
   ```
3. Fetches `@memberjunction/core@2.100.3` from npm (available)
4. Fetches `@memberjunction/global@2.100.3` from npm (available)
5. Fetches all other packages at `2.102.1` from npm
6. Installs everything successfully

**Result:** User gets working MJ installation with no errors!

---

**Scenario 2: Updating Existing MJ Installation**
```bash
cd my-mj-project
npm update @memberjunction/cli
```

**What npm does:**
1. Checks current version (e.g., 2.100.3)
2. Fetches latest version (2.102.1)
3. Updates cli to 2.102.1
4. Resolves dependencies per cli's package.json
5. **Downgrades** core from 2.101.0 → 2.100.3 (if user had 2.101.0 locally)
6. **Keeps** global at 2.100.3
7. **Upgrades** all other packages to 2.102.1

**Result:** Everything works! Core and global stay at 2.100.3, everything else updates.

---

**Scenario 3: Installing Specific Package**
```bash
npm install @memberjunction/server@latest
```

**What npm does:**
1. Fetches `@memberjunction/server@2.102.1`
2. Sees it requires `@memberjunction/core@2.100.3` (peer dependency)
3. Fetches core@2.100.3 from npm
4. Fetches global@2.100.3 from npm (core's dependency)
5. Installs successfully

**Result:** Works perfectly - gets the right versions!

---

### Comparison: BEFORE vs AFTER This Plan

**BEFORE (Current Broken State):**
```bash
npm install @memberjunction/cli@2.102.0
# Error: 404 Not Found - @memberjunction/core@2.102.0
# ❌ FAILS - User cannot install!
```

**AFTER (With Our Plan):**
```bash
npm install @memberjunction/cli@2.102.1
# Fetching @memberjunction/cli@2.102.1...
# Fetching @memberjunction/core@2.100.3... ← Uses available version!
# Fetching @memberjunction/global@2.100.3... ← Uses available version!
# Fetching @memberjunction/server@2.102.1...
# ✅ SUCCESS - Works exactly like before!
```

**Key Point:** From the user's perspective, **NOTHING changes** in how they install or update MJ. It works exactly the same way, just with core and global pinned at 2.100.3 while other packages advance.

---

## Reverting When npm Fixes the Issue

When npm resolves the 403 error for core package:

### Step 1: Manually Publish Missing Core Versions
```bash
# Checkout the git tags for missing versions
git checkout v2.101.0
cd packages/MJCore

# Publish manually
npm publish

# Repeat for 2.102.0 and any other missing versions
git checkout v2.102.0
cd packages/MJCore
npm publish
```

### Step 2: Bump Core and Global to Latest Version
```bash
git checkout next

# Update core version to match other packages (use whatever version other packages are at)
npm pkg set version=2.102.1 --workspace=packages/MJCore

# Update global version to match other packages
npm pkg set version=2.102.1 --workspace=packages/MJGlobal

# Update all dependencies
# Use VSCode Find & Replace:
# Find:    "@memberjunction/core": "2\.100\.3"
# Replace: "@memberjunction/core": "2.102.1"

# Find:    "@memberjunction/global": "2\.100\.3"
# Replace: "@memberjunction/global": "2.102.1"

npm install
npm run build
```

### Step 3: Revert Workflow Changes
- Change version references back to `packages/MJCore/package.json` (from MJServer)
- Remove core and global validation exceptions
- Change back to `npm run change version` (or keep `version:safe`)
- Revert MJCLI bump command to original behavior

### Step 4: Remove Post-Hook Script (Optional)
- Delete `scripts/post-changeset-version.js` or keep for future use

### Step 5: Resume Normal Operations
All packages version together again as before.

---

## Risks and Limitations

### ⚠️ Version Mismatch
- Core and global at 2.100.3 while others at 2.102.1+ breaks convention
- May confuse developers and users
- **Mitigation:** Document clearly, add warning in README

### ⚠️ Dependency Hell
- If core/global 2.100.3 → 2.102.1+ introduced breaking changes, this won't work
- **Mitigation:** Test thoroughly, monitor for issues

### ⚠️ Git Tags Divergence
- Tags represent server/cli package version, not core/global
- Historical tags (v2.101.0, v2.102.0) don't have matching core/global versions
- **Mitigation:** Document which versions have core/global at 2.100.3

### ⚠️ Manual Maintenance
- Post-hook script needs updates if core version changes
- Workflow modifications need maintenance
- **Mitigation:** Add comments, keep this document updated

### ⚠️ Team Confusion
- Developers need to understand core is pinned
- Must use `npm run version:safe` instead of `npm run change version`
- **Mitigation:** Team communication, update docs

---

## Success Criteria

✅ Core package stays at 2.100.3 in all operations
✅ Global package stays at 2.100.3 in all operations
✅ Core's dependency on global stays at 2.100.3
✅ Other packages continue versioning normally (2.102.1+)
✅ Builds succeed locally and in CI/CD
✅ Users can install latest versions via npm with `npm install @memberjunction/cli@latest`
✅ User experience is IDENTICAL to before (no behavioral changes)
✅ All dependencies resolve correctly from npm registry
✅ GitHub Actions workflows pass
✅ Git tags created successfully

---

## Questions or Issues?

If you encounter problems:

1. **Build failures:** Check that core@2.100.3 is compatible with newer package versions
2. **npm install errors:** Verify core@2.100.3 exists in registry
3. **Workflow failures:** Check that all workflow modifications were applied correctly
4. **Version mismatches:** Run `npm run version:safe` manually to fix
5. **Post-hook errors:** Check script has correct paths and permissions

---

## Summary Checklist

- [x] Phase 1: Core downgraded to 2.100.3 in local repo
- [x] Phase 1: Global downgraded to 2.100.3 in local repo
- [x] Phase 1: Core's global dependency set to 2.100.3
- [x] Phase 1: All 101+ core dependencies updated via VSCode regex replace
- [x] Phase 1: All ~50-60 global dependencies updated via VSCode regex replace
- [x] Phase 1: `npm install` completed successfully
- [x] Phase 1: Build verified working
- [~] Phase 2: **SKIPPED** - Changesets ignore config causes validation errors (see Phase 2 notes)
- [x] Phase 3: Modified `mj bump` command to skip both core and global packages
- [x] Phase 3: Rebuilt MJCLI package (`npm run build`)
- [x] Phase 3: Tested `mj bump -rdv` command locally
- [x] Phase 4: `scripts/post-changeset-version.js` created and executable
- [x] Phase 4: `version:safe` script added to root `package.json`
- [x] Phase 5: Publish workflow modified (6 changes total: 5 for publish.yml + 1 for docker.yml)
- [x] Phase 6: Changes workflow modified (1 change)
- [ ] Phase 7: Local testing completed successfully
- [ ] Phase 8: Changes committed and PR created
- [ ] Phase 8: PR merged and release tested
- [ ] Verified user install experience works: `npm install @memberjunction/cli@latest`

---

**Document Version:** 1.6
**Created:** 2025-09-29
**Last Updated:** 2025-09-30
**Status:** In Progress - Phases 1, 3-6 Complete (Phase 2 Skipped)

**Changelog:**
- v1.6 (2025-09-30):
  - **CRITICAL UPDATE:** Phase 2 abandoned due to changesets validation errors
  - Removed core and global from `.changeset/config.json` ignore list
  - Updated documentation to reflect post-hook as sole protection mechanism
  - Updated commit message and reversion instructions
  - Clarified that packages won't be published due to no version bump (not ignore list)
- v1.5 (2025-09-30):
  - Added Phase 5.6: Fixed docker.yml workflow (discovered during review)
  - Updated Phase 5 count to 6 total changes (5 publish.yml + 1 docker.yml)
- v1.4 (2025-09-30):
  - Marked Phase 6 as complete (changes workflow modified)
- v1.3 (2025-09-30):
  - Marked Phase 5 as complete (publish workflow modified with all 5 changes)
- v1.2 (2025-09-30):
  - Marked Phase 4 as complete (post-changeset-version hook created)
- v1.1 (2025-09-30):
  - Marked Phases 1-3 as complete
  - Corrected Phase 5 and 6 to use MJServer (not MJGlobal) as version reference
  - Updated all mentions to clarify both core AND global are pinned
  - Added clarification that global is also skipped during publishing
  - Updated reversion instructions to handle both packages
- v1.0 (2025-09-29): Initial plan created