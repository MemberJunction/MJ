# New Package Setup Checklist

This document provides step-by-step instructions for registering new MemberJunction packages with npm before creating a new build.

## ⚠️ Automated Validation

The publish workflow now **automatically checks** for missing packages and will **fail early** if any `@memberjunction` packages don't exist on npm. This prevents partial publish failures.

**When the workflow fails with missing packages:**
1. Follow Steps 2-3 below to create placeholders and configure OIDC
2. Re-run the workflow after setup is complete

## Prerequisites

- npm account with publish permissions for `@memberjunction` scope
- Logged in with `npm login`
- Access to npm package settings for the `@memberjunction` organization

## Process

### Step 1: Identify New Packages

The publish workflow will automatically identify new packages, but you can check manually:

```bash
# Run the validation script locally
./.github/scripts/validate-npm-packages.sh

# Or check a specific package
npm view @memberjunction/package-name version 2>&1 | grep -q "404" && echo "NEW" || echo "EXISTS"
```

### Step 2: Create Placeholder Packages with OIDC

For each new package, run the setup utility:

```bash
npx setup-npm-trusted-publish @memberjunction/package-name
```

This creates a placeholder package (version 0.0.0-reserved) and prepares it for OIDC trusted publishing.

Example for v2.118.0 packages:
```bash
npx setup-npm-trusted-publish @memberjunction/testing-cli
npx setup-npm-trusted-publish @memberjunction/testing-engine
npx setup-npm-trusted-publish @memberjunction/testing-engine-base
npx setup-npm-trusted-publish @memberjunction/ng-testing
```

### Step 3: Configure OIDC in npm UI

For each new package:

1. Navigate to: `https://www.npmjs.com/package/@memberjunction/[package-name]/access`
2. Go to **Settings** → **Publishing** (or **Automation tokens**)
3. Add a new **Trusted Publisher** with these settings:
   - **Provider**: GitHub Actions
   - **Organization**: `MemberJunction`
   - **Repository**: `MJ` (just the repo name, not the full URL)
   - **Workflow**: `publish.yml`
   - **Environment**: Leave blank/empty (the workflow doesn't use GitHub environments)

### Step 4: Verify OIDC Configuration

Check each package to ensure OIDC is properly configured:

1. Visit the package page on npm
2. Check the **Publishing** settings
3. Verify the "Trusted publishers" section shows:
   - ✅ GitHub Actions provider
   - ✅ Organization: `MemberJunction`
   - ✅ Repository: `MJ`
   - ✅ Workflow: `publish.yml`

### Step 5: Trigger Build Workflow

Push to main branch or manually trigger the `publish.yml` workflow. The GitHub Action will:

1. Run migration tests
2. Build all packages
3. Publish to npm using OIDC (no manual npm token needed)
4. Create distribution zip
5. Merge main into next branch

### Step 6: Verify Publication

After the workflow completes, verify all new packages were published:

```bash
npm view @memberjunction/package-name version
```

Expected output: The version number matching your build (e.g., `2.118.0`)

## Troubleshooting

### Common Issues

**Package already exists error:**
- The package name is already taken on npm
- Check if you have the correct package name

**OIDC authentication failed:**
- Verify OIDC configuration in npm matches exactly
- Check that `id-token: write` permission is set in workflow
- Ensure organization/repository names are correct (case-sensitive)

**Workflow fails to publish:**
- Check GitHub Actions logs for specific error messages
- Verify npm permissions for `@memberjunction` scope
- Ensure package.json has correct package name and version

**npm ci fails with "Missing from lock file":**
- This is usually a case-sensitivity issue (macOS vs Linux)
- Run `./.github/scripts/validate-package-lock-case.sh` to detect mismatches
- See "Case-Sensitivity Issues" section below for details

## Case-Sensitivity Issues (macOS)

### The Problem

macOS filesystems are **case-insensitive** but **case-preserving**, while Linux (GitHub Actions) is **case-sensitive**. This can cause issues when:

1. A developer on macOS creates or renames a package directory
2. The directory name has different casing than what git stores
3. `npm install` generates `package-lock.json` using the filesystem casing
4. GitHub Actions (Linux) checks out the git casing
5. `npm ci` fails because paths don't match

### Example

```bash
# macOS filesystem shows:
packages/Angular/Generic/Shared/

# But git stores:
packages/Angular/Generic/shared/  # lowercase 's'

# package-lock.json references the macOS casing:
"packages/Angular/Generic/Shared": { ... }

# GitHub Actions checks out git's lowercase version
# npm ci looks for 'Shared' but finds 'shared' → FAIL
```

### Prevention

**The workflow now automatically validates** case-sensitivity before running `npm ci`. If it detects a mismatch, it will fail with clear instructions.

### Fixing Case Mismatches

1. **Check git's actual casing:**
   ```bash
   git ls-files packages/ | grep -i <package-name>
   ```

2. **Rename local directory to match git:**
   ```bash
   # macOS requires intermediate rename due to case-insensitive filesystem
   mv packages/Path packages/temp-rename
   mv packages/temp-rename packages/path  # Match git's casing
   ```

3. **Regenerate package-lock.json:**
   ```bash
   rm package-lock.json
   npm install
   ```

4. **Verify the fix:**
   ```bash
   ./.github/scripts/validate-package-lock-case.sh
   ```

### When Renaming Packages

If you need to change the casing of a package directory:

1. **Use two-step rename in git:**
   ```bash
   # Step 1: Rename to temporary name
   git mv packages/OldName packages/temporary-name
   git commit -m "Step 1: Rename to temp"

   # Step 2: Rename to final name
   git mv packages/temporary-name packages/newname
   git commit -m "Step 2: Rename to final casing"
   ```

2. **Regenerate lockfile after merge:**
   ```bash
   rm package-lock.json
   npm install
   ```

## Reference

- GitHub Workflow: `.github/workflows/publish.yml`
- OIDC Setup Utility: https://github.com/azu/setup-npm-trusted-publish
- npm Trusted Publishing Docs: https://docs.npmjs.com/using-oidc-to-publish-from-github-actions

## Example: v2.118.0 New Packages

The following packages were successfully registered and published in v2.118.0:

- `@memberjunction/testing-cli`
- `@memberjunction/testing-engine`
- `@memberjunction/testing-engine-base`
- `@memberjunction/ng-testing`

All four packages were configured with OIDC and published successfully by the GitHub Action.
