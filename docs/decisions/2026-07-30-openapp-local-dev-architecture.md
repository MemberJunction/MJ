# ADR: pnpm internal standard + generated-workspace linking for Open App local development

- **Status:** Accepted
- **Date:** 2026-07-30
- **Scope:** First-party repositories — the MemberJunction core monorepo, the bizapps (Open App) family, and MJ Central — plus the Open App development tooling in the `mj` CLI.

> No existing decision-record convention was found in the repo (`docs/` holds generated TypeDoc output; there is no `docs/decisions/` tree). This record follows MADR-style: a shared context, then one decision per section — each opening with a one-sentence statement of the whole decision, followed by its context and consequences.

## Context

MemberJunction publishes its core packages to npm and distributes Open Apps (accounting, orders, tasks, …) as separate git repositories that depend on MJ packages and on one another. Installation into a deployment via `mj app install` works for *published* apps. It has no answer for the case that dominates active development: two apps built at the same time, where one depends on a sibling that is not yet published anywhere. A registry cannot serve unpublished code, so there is no supported way to wire a local app to a local sibling.

The prior proposal for this gap (issue #3273, `mj app link`) placed raw symlinks into `node_modules`. Node resolves modules from a symlink's real path, so a symlinked sibling loads its shared dependencies from *its own* tree — producing two physical copies of singletons such as `@angular/core`, which the browser rejects as two distinct class identities (Angular DI failure `NG0203`). The gap is real; that mechanism is not.

The decisions below record the accepted approach. They are documented, not proposed — each was made before this record was written.

## Decision 1 — pnpm is the internal package-manager standard

**Strict pnpm is the standard package manager for every first-party repository (core monorepo, bizapps family, MJ Central); npm remains the fully supported default for external consumers and third-party apps, and pnpm's hoisted mode is rejected outright.**

**Context.** Hoisting is the mechanism behind phantom dependencies — a package importing something it never declared, resolved only because a hoisted layout happened to place the dependency at a reachable root. Strict pnpm turns an undeclared import into a loud, immediate error instead of a latent one. MJ Central already runs pnpm in production against registry MJ packages, so a pnpm-consuming MJ deployment is an existing fact rather than a bet.

**Consequences.**
- First-party repos adopt strict pnpm. npm stays fully supported for consumers: the installer shells npm, and the scaffold stamps `packageManager: npm@...` into generated consumer repos. That is a product surface, not an internal maintenance burden.
- Hoisted mode is never used internally. Any `public-hoist-pattern` entry that appears in a generated workspace `.npmrc` (currently needed for Angular dev-server externalization) is a transitional, enumerated exception **owned by the generator**, carrying an agreed sunset: at conversion, each app declares those dependencies explicitly and the hoist patterns are removed.
- Strict resolution surfaces pre-existing undeclared imports at conversion time. These are dependency-declaration fixes owed regardless of package manager.

## Decision 2 — Cross-repo dev linking uses a generated, ephemeral workspace

**Cross-repo development links siblings through a generated, ephemeral pnpm workspace written at the repos' common parent directory (`mj dev workspace`) — `linkWorkspacePackages` for members, the registry for everything else — while committed repos use `workspace:*` for intra-repo references only, and nothing is ever committed to any repo to make linking work.**

**Context.** A workspace at the common parent lets pnpm own one install tree with exactly one physical copy of every shared dependency — the single-copy property the symlink approach could not provide. Because the workspace files live *outside* every repo, no committed file ever references a machine-local path, and teardown returns every repo to exactly its git state.

**Consequences.**
- The generator writes the parent-level files (`pnpm-workspace.yaml`, `.npmrc`, a union root `package.json`, the ephemeral lockfile); the member repos remain untouched.
- Partial linking is the normal case: `linkWorkspacePackages` links only the members present, while unlinked dependencies resolve from the registry. A member can be developed locally while its siblings come from npm in the same install.
- Committed manifests keep registry semver for *cross*-repo dependencies; only *intra*-repo dependencies use `workspace:*` (which changesets rewrites at publish). Committed files never encode workspace membership.
- pnpm 10 defaults `link-workspace-packages` to false, so the generator must set it explicitly — otherwise internal exact-version deps silently resolve from the registry instead of local source.

## Decision 3 — Open App registration state is a row with a status value

**A dev-linked Open App keeps its `OpenApp` registration row and carries a development status value, rather than being represented by the absence of a row.**

**Context.** `ResolveDependencyChain` (`packages/OpenApp/Engine/src/install/install-orchestrator.ts:1324`) builds its satisfied-dependency map by reading `OpenApp` rows and their `Status`, treating `Active` and `Disabled` as settled (`install-orchestrator.ts:1340`; `SETTLED_STATUSES` at `:94`). A row-less app therefore satisfies no dependency, and install would re-fetch it from its repo instead of seeing the local copy. Absence is also indistinguishable from a failed or never-run registration. The current status set is the `AppStatus` union (`packages/OpenApp/Engine/src/types/open-app-types.ts:13`).

**Consequences.**
- Dev mode uses the existing row + status model — the same code path shipped in production — giving dev/prod parity. A development-tier status value is added to `AppStatus` in phase 2.
- Developer intent lives in version-controlled config; the row's status is *derived* state written by tooling; `mj doctor` asserts the two agree.
- This raises the importance of install/uninstall symmetry: teardown must clear the app's `__mj` rows, not merely drop schema.

## Decision 4 — CodeGen generates for what is yours

**A CodeGen run generates only for the schemas belonging to the thing being built; installed Open Apps are consumed dependencies, auto-excluded via their `OpenApp` rows and never regenerated (third-party schemas are opt-in).**

**Context.** An installed Open App is consumed like installed MJ core — you do not regenerate a dependency. Framing the boundary as "generate for what's mine" is repo-standpoint-independent and avoids O(N²) per-app exclusion lists; the exclusion is derived from the registration rows Decision 3 keeps. The type-availability gating merged in PR #3350 remains as defense-in-depth.

**Consequences.**
- Installed apps are excluded from CodeGen automatically from their rows; no hand-maintained exclusion lists.
- Third-party schemas are generated for only by explicit opt-in.
- Both layers — row-derived exclusion and the #3350 type gating — are kept.

## Decision 5 — Dev-mode registration is git-free via environment variables

**Phase-2 dev registration keeps `dynamicPackages` entries in the tracked `mj.config.cjs` as environment-variable references, supplies them from a generated per-workspace `.env` at the parent, and runs commands through dotenvx so the active registration is explicit at the call site.**

**Context.** `mj.config.cjs` already reads configuration from `process.env` throughout (e.g. `mj.config.cjs:43-48`), so env-ref expressions for `dynamicPackages` fit the file's existing idiom. A generated `.env` at the parent is already gitignored by the `.env.*` rule (`.gitignore:93`), so dev wiring never dirties a tracked file. dotenvx makes the loaded environment explicit per invocation, and installed (tracked) plus dev-linked (env-supplied) registrations compose naturally for mixed instances. This path also reaches consumers that load `mj.config.cjs` directly, which an rc-file overlay cannot (see Rejected alternatives).

**Consequences.**
- Mandatory companions ship with it: generated run-wrapper scripts, and an `mj doctor` sentinel for the "workspace present, env absent" state plus a provenance printout (tracked vs. env) of the resolved registration. Without the wrapper, a bare command run outside the environment silently sees no dev registration — a per-process footgun the sentinel exists to catch.
- Open sub-questions, recorded honestly:
  - Two `package.json` wirings (MJAPI and MJExplorer) are consumed by pnpm directly and are **not** reachable through environment variables; the env-var mechanism does not solve them.
  - `angular.json`'s `prebundle.exclude` may be unnecessary in linked mode (Vite does not pre-bundle linked packages) — **unverified**; needs a spike.

## Decision 6 — Publishability is proven by a canary-install certification gate

**Every release candidate must install clean from an ephemeral registry into a bare directory, and the built Explorer bundle must contain each app's `@RegisterClass` key strings.**

**Context.** Workspace linking is deliberately more forgiving than a real install: it resolves from source, so *publish-shape* defects — tarball `files`/`exports` fields, `workspace:`/`catalog:` rewrite correctness — stay hidden until a stranger installs. That class is real (e.g. the `types`-field packaging bug tracked as #3113). Grepping the built bundle for registration key strings (which survive minification) catches bundler tree-shaking of side-effect `@RegisterClass` registrations, which linked mode structurally cannot observe.

**Consequences.**
- One CI job per app repo: publish to an ephemeral Verdaccio registry, install into a clean directory as an outsider would, then grep the built Explorer bundle for each app's registration keys.
- CI-only for v1 — no daemon on developer machines. The daily dev loop never runs it.

## Rejected alternatives

- **Graph-aware symlinks (`mj app link`, issue #3273).** Node resolves from a symlink's real path, so shared deps duplicate and DI singletons split (`NG0203`). This is module-resolution physics, not a tuning problem, and a dedupe pass cannot repair duplicates of already-*published* packages.
- **`.mjrc.cjs` overlay for dev registration.** Config loading is not centralized: the canonical loader orders `mj.config.cjs` first (`packages/Config/src/config-loader.ts:95-102`), while at least three raw cosmiconfig call sites use *default* ordering where `.mjrc.cjs` wins (`packages/ServerBootstrap/src/index.ts:235`, `packages/MJCLI/src/config.ts:40`, `packages/TestingFramework/testing-integration/src/config.ts:73`). An overlay therefore works for some consumers and not others, requires a separate overlay file in every directory that holds a config (a directory-level `mj.config.cjs` stops the ascent), and silently stops working for any consumer later migrated onto the canonical loader. Building git protection on a precedence rule that differs per call site is fragile; the environment-variable mechanism (Decision 5) is ordering-independent — the refs evaluate inside whichever file any consumer resolves. The fragmented ordering itself is a defect worth an issue.
- **`.pnpmfile.cjs` `readPackage` injection for the package.json wirings.** Invisible manifest mutation is a sanctioned phantom dependency — it directly contradicts the explicitness that motivated choosing strict pnpm (Decision 1).
- **Hoisted pnpm mode.** See Decision 1: hoisting is the phantom-dependency mechanism this program exists to eliminate.
- **Copy-based linking (yalc-style) as the daily loop, and a local canary registry as the *primary* dev loop.** Both were rejected as the inner loop; the canary registry survives as the certification gate (Decision 6), not the daily loop.

## References

- Config loader search order: `packages/Config/src/config-loader.ts:95-102`
- `mj.config.cjs` env idiom: `mj.config.cjs:43-48`; gitignore rules: `.gitignore:93` (`.env.*`), `.gitignore:149` (`.mjrc.cjs`)
- A second cosmiconfig call site (default search order): `packages/TestingFramework/testing-integration/src/config.ts:73`
- Registration model: `packages/OpenApp/Engine/src/types/open-app-types.ts:13` (`AppStatus`); `packages/OpenApp/Engine/src/install/install-orchestrator.ts:94,1324,1340`
- Public issues / PRs: #3273 (symlink linking proposal), #3350 (type-availability gating), #3113 (`types`-field packaging bug)
