# New Package Setup Checklist

This document provides step-by-step instructions for registering new MemberJunction packages with npm before creating a new build.

## Prerequisites

- npm account with publish permissions for `@memberjunction` scope
- Logged in with `npm login`
- Access to npm package settings for the `@memberjunction` organization

## Process

### Step 1: Identify New Packages

Determine which packages are new and not yet published to npm.

```bash
# Check if a package exists on npm
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
