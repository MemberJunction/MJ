# Contributing to MemberJunction

Thanks for your interest in contributing to MemberJunction! This guide covers how to get set up, the standards we follow, and how to propose changes.

## Ways to contribute

- **Report bugs** and **request features** via [GitHub Issues](https://github.com/MemberJunction/MJ/issues).
- **Ask questions** and **share ideas** in [GitHub Discussions](https://github.com/MemberJunction/MJ/discussions).
- **Improve documentation** — fixes to READMEs and guides are always welcome.
- **Submit code** via pull requests (see below).

## Getting set up

MemberJunction is a **pnpm**-workspace monorepo built with [Turborepo](https://turbo.build/).

> ⚠️ **Never run `npm install` here.** It would write a `package-lock.json` this repo no longer
> uses and resolve a different dependency tree. The package manager is pinned by
> `packageManager` in the root `package.json`; `corepack enable` will honour it automatically.

```bash
# Clone and install (always install from the repo root)
git clone https://github.com/MemberJunction/MJ.git && cd MJ
pnpm install

# Build everything
pnpm run build

# Build a single package (run inside that package's directory)
cd packages/<PackageName> && pnpm run build
```

> **Prerequisites:** Node.js 22+ (24 recommended — see [`.nvmrc`](./.nvmrc)), pnpm 10.33+,
> SQL Server 2019+ (or Azure SQL). The Angular CLI is a workspace dependency — you do not need
> it installed globally.

Adding a dependency? Put it in the individual package's `package.json`, then run `pnpm install`
**at the repository root** — never inside a package directory. pnpm enforces declared
dependencies strictly, so a package that imports something it does not declare fails to resolve
rather than falling through to a hoisted copy.

See the root [`README.md`](./README.md) for install and architecture, and
[`DEPLOYMENT.md`](./DEPLOYMENT.md) for deployment details.

## Coding standards

**Before writing code, read [`CLAUDE.md`](./CLAUDE.md).** It is the authoritative guide to MemberJunction's conventions and contains rules that PRs are expected to follow, including:

- **Strong typing** — no `any`; always use MJ's generated `BaseEntity` subclasses, `Metadata`, and `RunView` with generics.
- **Class member naming** — PascalCase for public members, camelCase for private/protected.
- **Functional decomposition** — small, focused functions (~30–40 lines max).
- **Angular conventions** — modern `@if`/`@for` template syntax, `inject()` DI, design tokens (no hardcoded colors).
- **No re-exports between packages**, **`BaseSingleton` for singletons**, and the other critical rules called out in `CLAUDE.md`.

Topic-specific guides live in [`guides/`](./guides/README.md) and in per-area `CLAUDE.md` files (e.g. [`migrations/CLAUDE.md`](./migrations/CLAUDE.md), [`packages/Angular/CLAUDE.md`](./packages/Angular/CLAUDE.md)). New to building on the platform? Start with [Building Applications on MemberJunction](./guides/BUILDING_APPS_ON_MJ.md).

## Tests

MemberJunction uses [Vitest](https://vitest.dev/) across all packages.

```bash
# Unit tests — all packages, from repo root (Turborepo-cached, so unchanged packages skip)
pnpm test

# Unit tests — one package
cd packages/<PackageName> && pnpm test

# Deterministic integration tier (run after migrations + CodeGen have been applied)
pnpm run test:integration
```

Before opening a PR, the local CI mirrors are worth a minute — each one mirrors a gate that
would otherwise fail your PR:

```bash
pnpm run check:ui               # design-token + button gates on changed CSS/SCSS
pnpm run check:standards        # every adopted MJ standard (see .mj-standards.json)
pnpm run check:esm              # native-ESM import guard for "type": "module" packages
pnpm run check:browser-manifest # server-only packages leaking into the browser bundle
pnpm run check:codegen-tail     # new-table migrations ship their generated entity
```

- **When you change a package's source, run that package's tests** and update them to match new behavior.
- New PRs must pass the unit-test gate in CI.

See [`TESTING_GUIDELINES.md`](./TESTING_GUIDELINES.md) and [`UNIT_TESTING_STRATEGY.md`](./UNIT_TESTING_STRATEGY.md) for details.

## Database migrations

Schema changes go through Flyway migrations. Read [`migrations/CLAUDE.md`](./migrations/CLAUDE.md) before authoring one — it covers naming, hardcoded UUIDs, the columns and indexes CodeGen manages for you, and the CodeGen handoff.

## Pull request process

1. **Branch** from `next` (the default branch) using a descriptive feature-branch name, and
   push with `git push -u origin <branch-name>` so it tracks a **same-named** remote branch.
   A feature branch left tracking `origin/next` sends your commits straight to `next` on the
   next bare `git push`, bypassing review entirely. Verify with `git branch -vv` before pushing.
2. **Make focused changes** that follow the standards above.
3. **Build and test** the affected packages locally (`pnpm run build` + `pnpm test`), then run
   the deterministic integration tier (`pnpm run test:integration`).
4. **Add a changeset** (`pnpm run change`) describing the user-visible change. `minor` is
   reserved for branches that add or modify a migration or anything under `metadata/`;
   everything else is `patch`. Check it with `pnpm run check:changeset`.
5. **Open a PR** with a clear description of what changed and why. Link any related issues.
6. **Respond to review feedback** — CI must be green before merge.

## License

By contributing, you agree that your contributions will be licensed under the repository's [Business Source License 1.1](./LICENSE).
