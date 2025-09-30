# Pin @memberjunction/core and @memberjunction/global to 2.100.3

## 🎯 Executive Summary

This PR implements a temporary pinning strategy to resolve npm registry 403 errors for `@memberjunction/core@2.101.0` and `@memberjunction/core@2.102.0`. We pin both `@memberjunction/core` and `@memberjunction/global` at version **2.100.3** (last working versions) while allowing all other packages to continue versioning normally (2.102.1+).

**User Impact:** ✅ None - users can install and update MJ exactly as before
**Reversibility:** ✅ Fully reversible when npm resolves the registry issue

---

## 🔴 Problem Statement

### The Issue
- `@memberjunction/core@2.101.0` returns **403 Forbidden** from npm registry
- `@memberjunction/core@2.102.0` returns **403 Forbidden** from npm registry
- All other @memberjunction packages publish successfully
- This blocks users from installing any MJ version ≥ 2.101.0

### Impact
```bash
# Current state (BROKEN)
$ npm install @memberjunction/cli@2.102.0
npm ERR! 403 Forbidden - @memberjunction/core@2.102.0
❌ Installation fails
```

### Root Cause
- npm registry issue (not a code problem)
- Core package specifically affected
- Timeline unknown for npm resolution

---

## ✅ Solution: Strategic Package Pinning

### What We're Doing
1. **Pin core@2.100.3** (last working version)
2. **Pin global@2.100.3** (core depends on global)
3. **Let everything else version normally** (2.102.1+)

### Why This Works
- Both 2.100.3 versions exist in npm registry ✅
- No breaking changes between 2.100.3 → 2.102.1 ✅
- Users get working installations ✅
- We can continue MJ development ✅

### Result
```bash
# After this PR (WORKING)
$ npm install @memberjunction/cli@2.102.1
+ @memberjunction/cli@2.102.1
+ @memberjunction/core@2.100.3      ← Pinned version
+ @memberjunction/global@2.100.3    ← Pinned version
+ @memberjunction/server@2.102.1    ← Latest version
✅ Installation succeeds
```

---

## 📋 Changes Made

### 1. Package Versions & Dependencies
**Modified 100+ package.json files:**
- Downgraded core and global to 2.100.3
- Updated all core/global dependencies to 2.100.3
- Regenerated package-lock.json

### 2. Post-Changeset Hook (Primary Protection)
**File:** `scripts/post-changeset-version.js` (NEW)
- Runs after every `changeset version` operation
- Verifies core and global remain at 2.100.3
- Fixes any accidental changes automatically
- Updates lockfile if changes detected
- **This is our sole protection mechanism** (changesets ignore not used due to validation errors)

**File:** `package.json`
```json
{
  "scripts": {
    "version:safe": "changeset version && node scripts/post-changeset-version.js"
  }
}
```

### 3. MJ CLI Bump Command
**File:** `packages/MJCLI/src/commands/bump/index.ts`
- Modified to skip core and global when bumping versions
- Local developers protected from accidentally updating pins
- Continues to work exactly as before for other packages

### 4. GitHub Actions Workflows

#### Modified Files:
| File | Lines Changed | Description |
|------|--------------|-------------|
| `.github/workflows/publish.yml` | 98, 113, 114, 121-152, 174 | Use MJServer as version reference; use `version:safe`; validate pins |
| `.github/workflows/changes.yml` | 33 | Use MJServer for migration version checks |
| `.github/workflows/docker.yml` | 28-29 | Use MJServer for Docker image tagging |

**Key Changes:**
- **Version Reference:** Changed from MJCore → MJServer (since MJCore is pinned)
- **Version Script:** Changed from `npm run change version` → `npm run version:safe`
- **Validation:** Added explicit checks that core/global remain at 2.100.3
- **Package Counting:** Exclude core/global from version count validation

---

## 🔄 New Versioning & Publishing Flow

### Developer Workflow (Local)

**Creating changes:**
```bash
npm run change          # Same as before
# Choose package, bump type, write message
```

**Bumping dependencies:**
```bash
mj bump -r -t 2.102.1   # Bumps all packages
# Core and global automatically stay at 2.100.3
# Everything else updates to 2.102.1
```

### Release Workflow (GitHub Actions)

```
1. PR merges to main
2. GitHub Actions triggers publish.yml
3. Runs npm run version:safe
   ├─ changesets version (bumps non-core/global packages)
   └─ post-changeset-version.js (ensures pins stay)
4. Validates core@2.100.3 and global@2.100.3
5. Validates all other packages at 2.102.1
6. Builds packages
7. Publishes to npm
   ├─ Core: SKIPPED (no version bump, stays at 2.100.3)
   ├─ Global: SKIPPED (no version bump, stays at 2.100.3)
   └─ All others: Published at 2.102.1
8. Creates git tag v2.102.1
9. Builds Docker images (tagged with v2.102.1)
```

### User Installation (Unchanged!)

```bash
# Users experience NO DIFFERENCE
npm install @memberjunction/cli@latest

# What npm does:
# 1. Fetches CLI@2.102.1
# 2. Reads dependencies: core@2.100.3, global@2.100.3, server@2.102.1
# 3. Fetches all packages (all versions exist in registry)
# 4. Installs successfully ✅
```

---

## 🧪 Testing Performed

### ✅ Post-Hook Script Testing
1. **Normal state:** Script detects no issues, exits cleanly
2. **Core version changed:** Script detects and resets to 2.100.3
3. **Dependencies changed:** Script scans all packages and fixes dependencies

### ✅ CLI Bump Command Testing
```bash
node packages/MJCLI/bin/run.js bump -dv -r -t 2.102.1
# Verified:
# - Core stays at 2.100.3 ✅
# - Global stays at 2.100.3 ✅
# - All other packages bump to 2.102.1 ✅
```

### ✅ Build Testing
```bash
npm run build
# Verified:
# - All packages compile successfully ✅
# - Core@2.100.3 compatible with packages@2.102.1 ✅
```

### ✅ Workflow Review
- Reviewed all 9 GitHub Actions workflows
- Verified version references are correct
- Confirmed no breaking changes

---

## 📊 Impact Analysis

### User Experience: ✅ IDENTICAL
- **Install:** Works exactly as before
- **Update:** Works exactly as before
- **Functionality:** No behavioral changes
- **Breaking changes:** None

### Developer Experience: ✅ MINIMAL IMPACT
- Use `npm run version:safe` instead of `npm run change version` (or workflows handle automatically)
- `mj bump` continues working (automatically skips core/global)
- Build and test workflows unchanged
- Can continue MJ development normally

### Operations: ✅ CONTROLLED
- GitHub Actions updated to handle pinned packages
- Multiple safety mechanisms ensure pins stay in place
- Fully documented and reversible

---

## 🔙 Reversion Plan (When npm Fixes the Issue)

### When to Revert
✅ When npm resolves 403 errors for core@2.101.0+

### Step 1: Manually Publish Missing Versions
```bash
# Publish the versions that failed
git checkout v2.101.0
cd packages/MJCore && npm publish

git checkout v2.102.0
cd packages/MJCore && npm publish

# Same for any other missing versions
```

### Step 2: Bump Core and Global to Latest
```bash
git checkout next

# Update both packages to match current release version
npm pkg set version=2.102.1 --workspace=packages/MJCore
npm pkg set version=2.102.1 --workspace=packages/MJGlobal

# Update all dependencies (VSCode Find & Replace)
# Find:    "@memberjunction/core": "2\.100\.3"
# Replace: "@memberjunction/core": "2.102.1"

# Find:    "@memberjunction/global": "2\.100\.3"
# Replace: "@memberjunction/global": "2.102.1"

npm install
npm run build
```

### Step 3: Revert Workflow Changes
**Files to update:**
- `.github/workflows/publish.yml` - Change version references back to MJCore
- `.github/workflows/changes.yml` - Change version reference back to MJCore
- `.github/workflows/docker.yml` - Change version reference back to MJCore

**Specifically:**
```yaml
# Change back from:
CURRENT_VERSION=$(jq -r .version packages/MJServer/package.json)

# To:
CURRENT_VERSION=$(jq -r .version packages/MJCore/package.json)
```

### Step 4: Revert CLI Bump Command
**File:** `packages/MJCLI/src/commands/bump/index.ts`
- Remove the PINNED_VERSION and PINNED_PACKAGES constants
- Restore original replaceAll logic
- Rebuild: `npm run build --workspace=@memberjunction/cli`

### Step 5: Optional Cleanup
- Remove `scripts/post-changeset-version.js` (or keep for future use)
- Remove `version:safe` script from root package.json (or keep as alias)
- Update documentation

### Step 6: Test and Release
```bash
npm run build                    # Verify everything compiles
npm run version:safe             # Test version bump
git checkout packages/*/package.json  # Revert test changes
```

Create PR with reversion changes and release normally.

---

## 📁 Files Modified/Added

### Added Files
- `scripts/post-changeset-version.js` - Post-version hook script
- `CORE_PIN_PLAN.md` - Detailed implementation plan
- `CORE_PIN_SUMMARY.md` - Quick reference summary
- `PR_SUMMARY.md` - This file

### Modified Configuration Files
- `package.json` - Added version:safe script

### Modified Package Files (100+ files)
- `packages/MJCore/package.json` - Version and global dependency
- `packages/MJGlobal/package.json` - Version
- All other `packages/*/package.json` - Core and global dependencies
- `package-lock.json` - Regenerated with pinned versions

### Modified Source Code
- `packages/MJCLI/src/commands/bump/index.ts` - Skip core and global
- `packages/MJCLI/dist/**` - Rebuilt CLI

### Modified Workflows
- `.github/workflows/publish.yml` - 5 changes (version refs, validation, version:safe)
- `.github/workflows/changes.yml` - 1 change (version ref)
- `.github/workflows/docker.yml` - 1 change (version ref)

---

## 👀 Review Checklist

### For Reviewers:
- [ ] Verify core and global are at 2.100.3 in all package.json files
- [ ] Check post-hook script logic makes sense
- [ ] Review workflow changes (especially validation logic)
- [ ] Confirm CLI bump command skips core and global
- [ ] Verify no breaking changes to user-facing functionality

### Critical Files to Review:
1. `scripts/post-changeset-version.js` - Safety net logic
2. `.github/workflows/publish.yml` - Publishing workflow changes
3. `packages/MJCLI/src/commands/bump/index.ts` - CLI bump logic
4. `CORE_PIN_PLAN.md` - Complete implementation details

---

## 📚 Documentation

**Comprehensive guides included:**
- `CORE_PIN_PLAN.md` - Detailed 8-phase implementation plan with rationale
- `CORE_PIN_SUMMARY.md` - Answers to key questions (why pin global, why post-hook, user experience)

---

## ✨ Summary

This PR implements a temporary but robust solution to npm registry issues affecting the core package. The implementation includes multiple safety mechanisms (post-hook script, CLI modifications, workflow validations) to ensure core and global remain pinned at 2.100.3 while allowing normal development and releases to continue.

**Key Benefits:**
- ✅ Unblocks user installations
- ✅ Allows continued MJ development and releases
- ✅ Zero user-facing changes
- ✅ Multiple safety mechanisms
- ✅ Fully reversible
- ✅ Well documented

**Risk:** Low - thoroughly tested, multiple safeguards, no user impact

**Timeline:** Temporary until npm resolves 403 errors for core@2.101.0+
