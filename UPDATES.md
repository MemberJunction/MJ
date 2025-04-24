# Upgrading MemberJunction Environments

MemberJunction (MJ) is the foundational platform used internally and for deployments across environments such as `dev`, `stage`, and `prod`. The platform follows [Semantic Versioning (SemVer)](https://semver.org/) principles:

- **Major versions** introduce breaking changes to public APIs.
- **Minor versions** include backward-compatible changes that require database migrations.
- **Patch versions** are backward-compatible and do **not** require database migrations.

## Prerequisites

In addition to a complete MJ installation, this guide requies that the installation's root `package.json` includes scripts to run migrations and codegen for each environment. A robust approach for this is to store environment-specific values in the shell environment, then set up `mj.config.cjs` to load that configuration from `process.env`.

For example, these scripts use [dotenvx](https://dotenvx.com/) to load configuration (including encrypted secrets) into the execution environment so it can be used by `mj.config.cjs`. Using dotenvx allows the `.env` files to include encrypted secrets and be checked-in along with other code.

```json
    "env:dev": "dotenvx run -f .env.dev --",
    "codegen:dev": "npm run env:dev -- mj codegen",
    "migrate:dev": "npm run env:dev -- mj migrate --tag=main",
```

Similar scripts should be set up for each supported environment (`dev`/`stage`/`prod`). 

## Patch versions

Upgrading to a new **patch version** does not require database migrations, but running CodeGen is still recommended to ensure any metadata updates are applied.

To upgrade to a patch version:

1. Follow the same steps as for a minor version (see below), **but skip the migration step**.
2. If migration commands are run anyway, they will detect the absence of new migrations and exit safely without making changes.

## Minor versions

A new **minor version** requires a database migration. After migrating, run CodeGen to complete two key tasks:

1. **Generate executable code** based on the database schema.
2. **Perform metadata maintenance** operations on the MJ schema (`__mj`) within the database.

> **Note:** Executable code depends only on table structure (not data), so it should be generated once (typically in the `stage` environment) and then committed to the repo. The metadata maintenance task must be run in **each** environment (`dev`, `stage`, `prod`) separately.

### General strategy:
- **`stage`**: Run migration and CodeGen, commit and keep the generated code.
- **`dev` / `prod`**: After merging updated code, run CodeGen to perform metadata updates, then **discard** the generated code.

---

## Upgrade Procedure

> [!IMPORTANT]
> These instructions assume that the MJ CLI is already installed globally and has been updated to the desired version.

### Step 1: Update dependencies

Create a new branch and update MJ dependencies using the CLI:

```bash
git checkout -b mj-update
mj bump -r
npm install
```

Commit and push the changes:

```bash
git add .
git commit -m "Update MemberJunction version"
git push --set-upstream origin mj-update
```

---

## Updating the `dev` environment

Merge the update branch into `dev`, then run migrations and CodeGen:

```bash
git checkout dev
git pull
git merge mj-update
npm run migrate:dev   # Skip if this is a patch version
```

Run CodeGen in `dev` to apply metadata maintenance tasks. **Discard** the generated code:

```bash
npm run codegen:dev
git reset --hard HEAD
```

Push the merged `dev` branch:

```bash
git push
```

---

## Updating the `stage` environment

Migrate the `stage` database and run CodeGen, **keeping** the generated code:

> [!WARNING]
> This step will modify the `stage` database. Ensure testing and backups are in place before proceeding.

```bash
git checkout mj-update
npm run migrate:stage   # Skip if this is a patch version
npm run codegen:stage
git add .
git commit -m "Run CodeGen for new MJ version"
git push
```

Open a Pull Request to merge `mj-update` into `stage` and deploy the updated system.

> [!TIP]
> Once deployed, verify the functionality in the `stage` environment to confirm that the upgrade completed successfully.

---

## Updating the `prod` environment

After confirming the `stage` deployment, merge into `prod` and repeat the migration and metadata maintenance:

```bash
npm run migrate:prod   # Skip if this is a patch version
npm run codegen:prod
git reset --hard HEAD
```

> [!NOTE]
> This process ensures that metadata maintenance is performed while avoiding redundant code generation steps.
