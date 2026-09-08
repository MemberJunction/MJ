# Dev Workspace Quickstart — `mj dev workspace`

**One sentence:** `mj dev workspace` turns a plain folder of sibling repo clones (MJ + any Open App repos) into one pnpm workspace, so an edit in any repo is live in every other repo in about a second — with nothing committed to any repo.

This is the practical setup guide. The normative spec (what the generator MUST do and why) is
[`OPEN_APP_WORKSPACE_LINKING_SPEC.md`](OPEN_APP_WORKSPACE_LINKING_SPEC.md).

## Availability

The command lives in `@memberjunction/cli` on `next` (merged 2026-08-14). Until the next edge
release ships it, run it **from an MJ source checkout** — that works today and is the flow below.
Once the edge release is out, a global `npm i -g @memberjunction/cli@edge` gives you the same
commands as plain `mj dev workspace ...`.

## Prerequisites

- Node 20+ with corepack enabled (`corepack enable`) — pnpm versions are pinned per repo and the
  generated workspace pins its own; corepack fetches them automatically.
- `gh auth login` (the app repos are private).

## Setup (one time, ~10 minutes)

1. **Make a plain parent folder.** Not a git repo — the generator refuses a git-repo-root parent
   on purpose. Sibling clones go inside it:

   ```bash
   mkdir ~/dev/mj-workspace && cd ~/dev/mj-workspace
   git clone -b next https://github.com/MemberJunction/MJ.git
   gh repo clone MemberJunction/bizapps-common     # default branch is main — that's correct
   gh repo clone MemberJunction/bizapps-tasks -- -b next
   # ...any other member repos you want linked
   ```

2. **Bootstrap-build MJ once** (you need the CLI before the workspace exists):

   ```bash
   cd MJ && pnpm install && pnpm run build && cd ..
   ```

3. **Generate the workspace.** From the parent folder:

   ```bash
   node MJ/packages/MJCLI/bin/run.js dev workspace
   ```

   It detects members (anything with `mj-app.json`, `@mj-biz-apps/*` packages, or the MJ monorepo
   itself), writes four files at the parent (`pnpm-workspace.yaml`, `package.json`, `.npmrc`,
   `turbo.json`) plus a `.mj-dev-workspace.json` sentinel, then runs the install.

   When it offers to **remove members' own standalone installs, say yes** — the MJ clone's
   `node_modules` from step 2 must be replaced by the workspace install, or MJ's code resolves
   against a second package store (split singletons, baffling type errors). This is the most
   common first-run mistake; the prompt (and `--clean-members`) exists because of it.

4. **Build everything from the parent** and check health:

   ```bash
   pnpm run build          # turbo across all members
   node MJ/packages/MJCLI/bin/run.js dev workspace status
   ```

## Daily loop

- Edit code in any member repo. Build just that package from the parent:
  `pnpm --filter <package-name> run build`. Consumers see it immediately via workspace links.
- `... dev workspace status` any time you're unsure of workspace health — it names problems and fixes.
- Set `MJ_DEV_WORKSPACE_DIR=/path/to/parent` in your shell profile to run the commands from
  anywhere without `--dir`.

## What the generator handles for you (v2)

- **Member globs** come from each repo's own `pnpm-workspace.yaml` — nested package layouts work.
- **MJ's `overrides` and `patchedDependencies` are hoisted** to the parent (patch paths re-rooted),
  so pnpm doesn't silently re-resolve hundreds of packages away from MJ's committed lockfile.
- **Versions are pinned from each member's committed lockfile** (exact, per-major) — the workspace
  reproduces what each repo's own CI installs instead of re-floating to latest.
- Genuine version conflicts between members are **reported, not hidden** (highest committed
  version wins; the report names every declaring package).

## Recovery

Someone (or an IDE) ran `npm install` / `pnpm install` **inside** a member repo? `status` will flag
it loudly (`STANDALONE INSTALL: <member> ...`). Fix:

```bash
node MJ/packages/MJCLI/bin/run.js dev workspace --force --clean-members
```

## Teardown

```bash
node MJ/packages/MJCLI/bin/run.js dev workspace clean
```

Removes only the generated parent files (sentinel-verified — it refuses to delete a workspace it
didn't generate unless you `--force`). Member repos are untouched and stay git-clean throughout;
the workspace never commits anything to any repo.

## Gotchas

| Symptom | Cause / fix |
|---|---|
| Generator refuses to run | The parent is a git repo root. Use a plain folder of sibling clones. |
| A member won't build from its own directory | The repo is still npm-pinned (`packageManager: npm@...`) — corepack refuses pnpm there. Build it from the parent with `pnpm --filter <pkg> run build`. The pnpm migration (in progress across the app repos) removes this. |
| Split singletons / two copies of `@angular/core` / weird type mismatches | A member has its own standalone install — see Recovery above. |
| Peer-dependency warnings at install | Expected while app repos' `^5.x` MJ peers meet a `6.x` source checkout; era-based comparison is the planned fix. Warnings, not errors. |
| Existing parent files in the way | The generator never overwrites without `--force`, and `--force` writes `.bak` copies first. |
