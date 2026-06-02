# Contributing to MemberJunction

Thanks for your interest in contributing to MemberJunction! This guide covers how to get set up, the standards we follow, and how to propose changes.

## Ways to contribute

- **Report bugs** and **request features** via [GitHub Issues](https://github.com/MemberJunction/MJ/issues).
- **Ask questions** and **share ideas** in [GitHub Discussions](https://github.com/MemberJunction/MJ/discussions).
- **Improve documentation** — fixes to READMEs and guides are always welcome.
- **Submit code** via pull requests (see below).

## Getting set up

MemberJunction is an npm-workspace monorepo built with [Turborepo](https://turbo.build/).

```bash
# Clone and install (always install from the repo root)
git clone https://github.com/MemberJunction/MJ.git && cd MJ
npm install

# Build everything
npm run build

# Build a single package (run inside that package's directory)
cd packages/<PackageName> && npm run build
```

> **Prerequisites:** Node.js 20+, npm 9+, SQL Server 2019+ (or Azure SQL), Angular CLI 21+.

See the root [`README.md`](./README.md) for a full Quick Start, and [`DEPLOYMENT.md`](./DEPLOYMENT.md) for deployment details.

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
# Run all tests (from repo root)
npm test

# Run tests for one package
cd packages/<PackageName> && npm run test
```

- **When you change a package's source, run that package's tests** and update them to match new behavior.
- New PRs must pass the unit-test gate in CI.

See [`TESTING_GUIDELINES.md`](./TESTING_GUIDELINES.md) and [`UNIT_TESTING_STRATEGY.md`](./UNIT_TESTING_STRATEGY.md) for details.

## Database migrations

Schema changes go through Flyway migrations. Read [`migrations/CLAUDE.md`](./migrations/CLAUDE.md) before authoring one — it covers naming, hardcoded UUIDs, the columns and indexes CodeGen manages for you, and the CodeGen handoff.

## Pull request process

1. **Branch** from the appropriate base branch using a descriptive feature-branch name.
2. **Make focused changes** that follow the standards above.
3. **Build and test** the affected packages locally (`npm run build` + `npm run test`).
4. **Open a PR** with a clear description of what changed and why. Link any related issues.
5. **Respond to review feedback** — CI must be green before merge.

## License

By contributing, you agree that your contributions will be licensed under the repository's [ISC License](./LICENSE).
