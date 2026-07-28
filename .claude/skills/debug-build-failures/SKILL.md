---
name: debug-build-failures
description: Systematically diagnose why a MemberJunction package fails to build — TypeScript compilation errors during `npm install`, Turbo not detecting a package, circular dependencies, or wrong build order. Use when a package build fails, `npm install` errors partway through the monorepo, Turbo skips or can't find a package, or a package's `dist/` is missing after a build.
---

# Debugging MemberJunction Build Failures

When packages fail to build during `npm install` or `npm run build`, work through these steps in
order. Each narrows the cause; don't skip ahead.

## 1. Verify dependencies exist

```bash
npm ls @memberjunction/package-name
```

Confirms the dependency is actually installed and resolvable from the workspace.

## 2. Check Turbo detection

```bash
npx turbo build --dry-run --filter="@memberjunction/package-name"
```

Shows whether Turbo can see the package and what it believes the dependency graph is. If the
package doesn't appear, it isn't properly included in the workspaces array — go to step 5.

## 3. Run an isolated build with verbose logging

```bash
npx turbo build --log-order=stream --filter="@memberjunction/package-name"
```

This reveals the exact TypeScript compilation errors, unobscured by parallel build output.

## 4. Check for circular dependencies

Look for packages that depend on each other:

- Package A imports from Package B
- Package B declares Package A in its `package.json`

This creates a cycle that prevents either from building. Dynamic `import()` can hide a cycle and
make it silent rather than loud — see [`.claude/rules/typescript-style.md`](../../rules/typescript-style.md).

## 5. Verify build order

- Turbo uses `"dependsOn": ["^build"]` in `turbo.json`
- Dependencies must build before dependents
- Check that every dependency has a `dist/` folder (indicating a successful build)

## Common causes

| Symptom | Cause |
|---|---|
| Package imports from an unbuilt dependency | Missing/failed upstream build |
| Two packages depend on each other | Circular dependency |
| Turbo can't find the package | Not included in the workspaces array |
| Dependencies build after dependents | Wrong build order in `turbo.json` |

> **Note**: `build.order.json` is only used by legacy PowerShell scripts, **not** by Turbo builds.
> Don't chase it when diagnosing a Turbo failure.

## Related build commands

- Build all packages from repo root: `npm run build`
- Build one package (preferred for testing/compilation): `cd packages/PackageName && npm run build` — **not** Turbo from root
- Watch mode: `npm run watch`

## Native-ESM failures

If the failure is `ERR_MODULE_NOT_FOUND` at runtime rather than compile time in a
`"type": "module"` package, that's a different bug class — run `npm run check:esm`. See
[`.claude/rules/typescript-style.md`](../../rules/typescript-style.md).
