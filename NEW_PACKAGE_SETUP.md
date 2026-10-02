# New Package Setup Checklist

How to register a new `@memberjunction/*` package on npm so that `publish.yml` can release it.

## When this runs

At **PR time**, not release time. The **Check new packages exist on npm** gate (`new-package-gate.yml`) blocks any PR that adds a publishable package until the package exists on npm, has a trusted-publisher (OIDC) config for `publish.yml`, and has a seed version whose public provenance attestation names `publish.yml`. The gate's failure message lists the packages and the exact commands. Packages marked `"private": true` are skipped. Don't set that flag just to silence the gate, or the package never ships.

The setup needs publishing rights on the `@memberjunction` org and an interactive 2FA prompt, so CI can't do it. Authors without access comment on the PR and tag the escalation handle named in the gate message.

## Prerequisites

- npm **11.15.0 or newer**, since `npm trust` doesn't exist before then: `npm install -g npm@^11.15.0`. Under nvm, each Node version has its own npm, so check `npm --version` in the shell you'll use.
- `npm login` on an account with 2FA and publish rights on `@memberjunction`
- `gh auth login` with access to `MemberJunction/MJ`

## Quick path: the script

From a checkout of this repo:

```bash
.github/scripts/seed-new-npm-package.sh @memberjunction/new-thing [@memberjunction/other-thing ...]
```

For each package it creates the placeholder if one is missing, attaches the trusted publisher if it isn't attached yet, dispatches the seed, and waits up to 10 minutes for the attestation. It checks live npm state before every step, so it is safe to re-run and skips anything already done. Then re-run the failed gate job on the PR.

## Manual steps (what the script does)

### Step 1: Create the placeholder

npm won't attach a trusted publisher to a package that doesn't exist yet.

```bash
npx setup-npm-trusted-publish @memberjunction/new-thing
```

This publishes a `0.0.0` placeholder.

### Step 2: Attach the trusted publisher

```bash
npm trust github @memberjunction/new-thing \
  --file publish.yml --repo MemberJunction/MJ --allow-publish -y
npm trust list @memberjunction/new-thing   # should show file: publish.yml
```

This step prompts for 2FA. If you're setting up several packages, tick "skip 2FA for the next 5 minutes" on the first prompt. No GitHub environment is used. If you get `Unknown flag: --allow-publish`, your npm is too old.

### Step 3: Seed the package over OIDC

The gate doesn't take a screenshot of npm settings as proof. It reads the public provenance attestation of a version that was actually published through the trusted publisher.

```bash
gh workflow run publish.yml --repo MemberJunction/MJ --ref next \
  -f seed_package=@memberjunction/new-thing \
  -f confirm_seed_package=@memberjunction/new-thing
```

Or, in the Actions tab, open **Build and publish new package versions** and click **Run workflow**. Fill in only `seed_package` and `confirm_seed_package` and leave everything else empty. Only the `seed-package` job runs, so nothing is built and no changeset is consumed. It publishes `0.0.1-seed.1` under the `seed` dist-tag (never `latest`), then waits for the attestation to show up. npm takes a few minutes to expose it.

The seed has to run through `publish.yml` itself. npm matches the trusted publisher on the exact workflow filename, so a seed from any other workflow is refused at the OIDC exchange (npm reports it as a 404 on PUT). The gate would also reject its attestation.

### Step 4: Re-run the gate

Re-run the failed **Check new packages exist on npm** job on the PR and it turns green. Its last result reflects npm as it was at that point, so it won't update by itself.

## At release time

### Step 5: Trigger Build Workflow

Push to main branch or manually trigger the `publish.yml` workflow. The GitHub Action will:

1. Run migration tests
2. Build all packages
3. Publish to npm using OIDC (no manual npm token needed)
4. Merge main into next branch

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
