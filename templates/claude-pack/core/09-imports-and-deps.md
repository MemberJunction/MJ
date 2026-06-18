# Imports & dependencies — static imports, no re-exports

Two MJ-specific rules about how your packages talk to each other:

1. Use static `import ... from '...'` at the top of every file. **Dynamic
   `import()` is forbidden** except in a narrow allowlist.
2. **Never re-export** types or classes from another package. Consumers
   import directly from the original source package.

Both rules exist because of real shipping bugs that the easier alternative
caused.

## Rule 1 — Static imports only

```typescript
// ✅ CORRECT — static import at the top of the file
import { AIPromptRunner } from '@memberjunction/ai-prompts';

class MyService {
    async run() {
        return await new AIPromptRunner().ExecutePrompt(...);
    }
}
```

```typescript
// ❌ WRONG — dynamic import as a "convenience"
class MyService {
    async run() {
        const { AIPromptRunner } = await import('@memberjunction/ai-prompts');
        return await new AIPromptRunner().ExecutePrompt(...);
    }
}
```

The dynamic version looks clever. It doesn't show the dependency in npm,
doesn't show up in bundle analysis, and survives a missing entry in
`package.json` until runtime. The day it ships and the dep IS missing,
your command crashes with `ERR_MODULE_NOT_FOUND` for users — TypeScript
never warned you.

Static imports are checked at compile time. If the dep isn't declared,
the build fails. Always.

### The 5 narrow exceptions

Dynamic `import()` is acceptable when:

1. **Angular lazy-loaded routes / `loadComponent()`** — framework-required
   for code splitting.

2. **Optional peer dependencies** — cloud SDKs (`@aws-sdk/client-kms`,
   `@azure/keyvault-keys`) loaded only when that provider is configured.
   Must be declared in `optionalDependencies` or `peerDependenciesMeta`.

3. **Genuine bundle-size deferral** — a single heavy module (e.g. `xlsx`
   loaded only on Excel export). Must be measured: "this is too slow to
   load up-front" is not a guess.

4. **Breaking a hard circular dependency** — last resort. Add a comment
   explaining the cycle.

5. **Runtime plugin discovery** — loading user-supplied resolver/middleware
   modules whose paths aren't known at build time.

**If your reason isn't on this list, use a static import.** "It's only
used in one method" is not a reason. "The package is big" is not a reason
unless you've measured the startup cost.

### When you must use dynamic import

Add a comment explaining *which* category above it falls under. **Still
declare the package in `dependencies`** (or `optionalDependencies` /
`peerDependencies`) — dynamic import doesn't exempt you from the dep graph.
Prefer a single top-of-module dynamic load behind a memoized promise over
repeated `await import()` inside every method.

## Rule 2 — No re-exports between packages

```typescript
// ❌ WRONG — re-exporting from another package
// In @memberjunction/ng-export-service/src/public-api.ts:
export { ExportFormat, ExportOptions } from '@memberjunction/export-engine';

// ✅ CORRECT — only export what this package defines
export * from './lib/module';
export * from './lib/export.service';
export * from './lib/export-dialog.component';
// NOTE: For ExportFormat / ExportOptions, import directly from @memberjunction/export-engine
```

Why no re-exports:

- **Obscures the source of types.** A reader sees `import { ExportFormat }
  from '@memberjunction/ng-export-service'` and has no idea the type lives
  in `export-engine`. Going to definition is now indirect.

- **Confuses the dependency graph.** If `ng-export-service` re-exports
  types from `export-engine`, any consumer that uses those types thinks
  `ng-export-service` is the dependency. Eventually someone removes the
  re-export, breaking every transitive consumer.

- **Breaks tree-shaking.** The bundler can't tell that you only used the
  re-exported symbol, not the rest of the re-exporting package.

Each package's `public-api.ts` should only export **code defined within
that package**. Consumers import types from their original source.

If you find yourself reaching for a re-export to "make the import shorter"
or "hide an implementation detail" — those benefits come at the cost of a
much harder-to-debug dependency tangle later. Don't.

## Why these rules exist (a real shipping bug)

The dynamic-import rule was written after a shipping bug: MJCLI's `mj app *`
commands used `await import('@memberjunction/open-app-engine')` inside the
command body, without declaring the dep in `package.json`. The TypeScript
build passed. `npm install -g @memberjunction/cli` succeeded. Every
production `mj app` invocation crashed with `ERR_MODULE_NOT_FOUND`. Static
imports would have failed the build immediately.

The re-export rule comes from years of refactoring pain — every removed
re-export broke a transitive consumer who didn't know they had a dependency
they had to update.

## The day-1 checklist

- [ ] Every `import` at the top of the file, not inside a method?
- [ ] If you used dynamic `import()`, can you point to one of the 5
      categories above and write the one-line "why"?
- [ ] Your `public-api.ts` / `index.ts` only exports things defined in
      this package (no `export { … } from 'other-package'`)?
- [ ] Every package you import from is declared in `package.json`
      (dependencies / peerDependencies / optionalDependencies)?
