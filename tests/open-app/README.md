# MJ Open App System - Test Suite

Tests for the MJ Open App install/upgrade/remove system.

## Directory Structure

```
tests/open-app/
├── README.md                           # This file
├── sample-app-repo/                    # Sample app to push to GitHub for E2E testing
│   ├── mj-app.json                    # App manifest
│   ├── package.json                   # Repo root package.json
│   ├── migrations/                    # SQL migrations
│   │   ├── V202602120001__v1.0.0_Initial_Schema.sql
│   │   └── V202602120002__v1.0.1_Seed_Data.sql
│   └── packages/
│       └── sample-app-server/         # Server bootstrap package
│           ├── package.json
│           ├── tsconfig.json
│           └── src/index.ts
├── test-manifest-validation.ts         # Zod schema validation tests
├── test-dependency-resolver.ts         # Topological sort + circular detection
├── test-version-checker.ts             # Semver range compatibility tests
├── test-cli-smoke.sh                   # CLI --help smoke tests
└── test-e2e-install.sh                 # Full lifecycle E2E test
```

## Running Tests

### Prerequisites

- Node.js 18+
- The `@memberjunction/mj-open-app-engine` package must be built:
  ```bash
  cd packages/MJOpenApp/Engine && npm run build
  ```

### Unit Tests (no database required)

```bash
# Manifest schema validation
npx tsx tests/open-app/test-manifest-validation.ts

# Dependency resolver (topological sort, circular detection)
npx tsx tests/open-app/test-dependency-resolver.ts

# Version checker (semver compatibility)
npx tsx tests/open-app/test-version-checker.ts
```

### CLI Smoke Test

Requires the CLI to be built:
```bash
cd packages/MJOpenApp/CLI && npm run build
bash tests/open-app/test-cli-smoke.sh
```

### E2E Install Test

Full lifecycle test against a real database. Requires:
1. Push the `sample-app-repo/` folder to a GitHub repository
2. Configure `mj.config.cjs` with valid DB credentials
3. Have a fresh MJ database with v4 migration applied

```bash
bash tests/open-app/test-e2e-install.sh https://github.com/<your-org>/mj-sample-open-app
```

## Sample App

The `sample-app-repo/` directory is a complete, minimal MJ Open App. To use it for E2E testing:

1. Create a new GitHub repository (e.g., `mj-sample-open-app`)
2. Copy the contents of `sample-app-repo/` to the new repo
3. Push to GitHub
4. Run the E2E test with the repo URL

The sample app creates a `sample_app` schema with a single `SampleRecord` table.
