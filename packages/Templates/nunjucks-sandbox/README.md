# @memberjunction/nunjucks-sandbox

Guards [nunjucks](https://mozilla.github.io/nunjucks/) so a template cannot run JavaScript or reach
server objects. nunjucks has no sandbox mode: unguarded, `{{ ''.constructor.constructor('…')() }}`
runs arbitrary code in the server process.

Every MemberJunction package that builds a nunjucks environment builds it through this package, so
no package relies on another one (such as `@memberjunction/templates`) having been loaded first.

## Use

```typescript
import { CreateSandboxedEnvironment } from '@memberjunction/nunjucks-sandbox';

// instead of: new nunjucks.Environment(loader, options)
const env = CreateSandboxedEnvironment(null, { autoescape: false });
env.renderString(template, data);
```

`CreateSandboxedEnvironment(loader?, options?)`:

1. installs the guard (`HardenNunjucksRuntime()`, safe to call any number of times);
2. builds the environment from the nunjucks module **this package** loads, which is the one the guard
   covers, even if the caller's own `import nunjucks` resolved to another copy;
3. checks the new environment with `AssertNunjucksSandboxIsEffective(env)` and throws a
   `TemplateSandboxError` if a template can still reach the `Function` constructor.

Do not write `new nunjucks.Environment(...)` in MemberJunction code.

## Exports

| Export | Purpose |
|---|---|
| `CreateSandboxedEnvironment(loader?, options?)` | The one way to build an environment. |
| `HardenNunjucksRuntime()` | Installs the parse-time and render-time guards on the shared nunjucks module. Runs the canary whenever it installs a guard. |
| `AssertNunjucksSandboxIsEffective(env?)` | The canary: renders harmless escape probes and throws if one succeeds. Call it on an environment you did not build yourself. |
| `AssertTemplateTreeIsSafe(tree)` | The parse-time check on a nunjucks parse tree. |
| `TemplateSandboxError` | Thrown when a template breaks a sandbox rule, or when the sandbox is not in effect. |

What the guard refuses, rule by rule, is described in the
[`@memberjunction/templates` README](../engine/README.md#template-sandbox).

## One version of nunjucks

The guard replaces functions on the nunjucks module instance this package loads. A second copy of
nunjucks in the process has its own, unguarded functions. Two things keep that from mattering:

- every `package.json` in this repository that declares `nunjucks` pins it to exactly `3.2.4`, the same
  version this package pins (the compile guard is written against that version's code generator);
- environments come from `CreateSandboxedEnvironment`, which never uses the caller's copy, and the
  canary fails loudly for an environment that is not guarded.

When upgrading nunjucks, change every pin in one commit and run this package's tests: they compile every
loop form and compare the identifiers the generated code uses against the guard's list.

## Dependencies

`nunjucks` (pinned to 3.2.4) and `@types/nunjucks`, which the exported signatures use.
