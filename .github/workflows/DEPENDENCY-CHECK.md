# Dependency Check Workflow

This workflow uses [Knip](https://knip.dev) to automatically detect missing and unused dependencies in the MemberJunction monorepo.

## What It Does

The `dependency-check.yml` workflow runs on every pull request and checks for:

1. **Missing Dependencies** - Packages imported in code but not declared in `package.json`
2. **Unused Dependencies** - Packages declared in `package.json` but never imported
3. **Transitive Dependency Issues** - Code relying on packages installed by other packages

## When It Runs

- Automatically on every PR to the `next` branch
- Only when TypeScript files or package.json files are modified
- Can be manually triggered via workflow_dispatch

## What Happens

1. Knip analyzes all packages in the monorepo
2. Generates a report of dependency issues
3. Posts a comment on the PR with the results
4. Uploads the full report as an artifact

## How to Fix Issues

### Missing Dependencies

If Knip reports missing dependencies:

```bash
# Add the missing dependency to the package's package.json
cd packages/path/to/package
npm install @memberjunction/missing-package@2.122.0

# Or add it manually to package.json and run from repo root:
npm install
```

### Unused Dependencies

If Knip reports unused dependencies:

```bash
# Remove from package.json and run from repo root:
npm install

# Or use Knip's auto-fix:
npm run deps:unused -- --fix
```

## Local Testing

Test dependency issues locally before pushing:

```bash
# Check for missing dependencies only
npm run deps:missing

# Check for unused dependencies
npm run deps:unused

# Full check (includes unused files, exports, etc.)
npm run deps:full
```

## Configuration

The Knip configuration is in `/knip.json`:

- Ignores: test files, dist folders, generated code
- Plugins: Angular and Turbo support enabled
- Entry points: Automatically detects Angular packages

## Why This Matters

### The Problem We Solve

In npm workspaces, packages can import from other packages via workspace linking. This means:

- ✅ **Local development works** - workspace links provide dependencies
- ❌ **Published packages fail** - consumers don't have those dependencies

**Example:**

```typescript
// packages/ng-dashboards/src/component.ts
import { BaseDashboard } from '@memberjunction/ng-shared';
```

If `ng-shared` is NOT in `ng-dashboards/package.json`:
- ✅ Works locally (workspace linking)
- ❌ Fails in consuming projects (missing dependency)

### The Solution

This workflow catches missing dependencies **before** they break consuming projects:

1. PR is created with new code
2. Workflow detects missing imports
3. Developer adds dependencies
4. Packages publish correctly

## Best Practices

1. **Always declare direct dependencies** - Don't rely on transitive dependencies
2. **Remove unused dependencies** - Keeps packages lean and fast
3. **Run locally before PR** - Use `npm run deps:missing` to catch issues early
4. **Review Knip comments** - Don't ignore the bot's feedback

## Comparison with Other Tools

| Tool | Missing Deps | Unused Deps | Monorepo | Angular | Active |
|------|--------------|-------------|----------|---------|--------|
| **Knip** | ✅ | ✅ | ✅ | ✅ | ✅ 2024 |
| depcheck | ✅ | ✅ | ⚠️ | ⚠️ | Last updated 2022 |
| ESLint import | ✅ | ❌ | ⚠️ | ✅ | Requires config |

## Troubleshooting

### False Positives

If Knip incorrectly reports an issue:

1. Check if it's a type-only import - these may not be detected
2. Add to `ignoreDependencies` in `knip.json`
3. Verify the package is actually used (not dead code)

### Performance

If Knip is too slow:

1. Check the `paths` filter in `dependency-check.yml`
2. Limit to specific workspaces in `knip.json`
3. Increase the workflow timeout (currently 15 minutes)

## References

- [Knip Documentation](https://knip.dev)
- [Knip GitHub](https://github.com/webpro-nl/knip)
- [Monorepo Best Practices](https://knip.dev/guides/monorepos)
