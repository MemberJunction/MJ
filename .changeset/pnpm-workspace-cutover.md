---
"@memberjunction/ai-cli": patch
"@memberjunction/cli": patch
"@memberjunction/codegen-lib": patch
"@memberjunction/messaging-adapters": patch
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/react-linter": patch
"@memberjunction/react-test-harness": patch
"@memberjunction/scheduled-actions-server": patch
"@memberjunction/server": patch
"@memberjunction/server-extensions-core": patch
"@memberjunction/sqlserver-dataprovider": patch
"@memberjunction/testing-cli": patch
"@memberjunction/testing-integration": patch
---

build: declare dependencies that npm's hoisting was silently supplying, as part of the monorepo's cutover to pnpm.

Under npm, a package could import a module it never declared and still resolve it, because npm flattens everything into the workspace-root `node_modules`. pnpm's strict, isolated linking gives a package only what it declares — so each of these was a latent bug that happened to work. They are fixed here independently of the package manager; nothing about the published API changes.

Added declarations: `@types/mssql` (codegen-lib, sqlserver-dataprovider, testing-cli, testing-integration, react-test-harness), `@types/pg` (codegen-lib), `@types/express` (messaging-adapters, server-extensions-core), `@types/fs-extra` (codegen-lib), `@types/babel__traverse` (react-linter), `ora` (ai-cli), `glob` (react-test-harness), `tslib` (ng-bootstrap, which compiles with `importHelpers`), `@auth0/auth0-spa-js` (ng-auth-services), `@memberjunction/core-entities` + `@memberjunction/global` + `@memberjunction/aiengine` (cli), and `@memberjunction/ng-react` (ng-explorer-core, reached from a generated file).

Two changes are more than a declaration:

- **`@memberjunction/server`**: `@types/express` moves `^4.17.25` → `^5.0.6`. The package declares `express@^5.2.1` at runtime, so it was only compiling because hoisting supplied the v5 types that six sibling packages declare. The types now match the express it actually runs.
- **`@memberjunction/ng-auth-services`**: `angularProviderFactory` gains an explicit `Provider[]` return type. Declaring `@auth0/auth0-spa-js` alone does not resolve TS2742 — the emitted declaration file still needed a nameable type rather than one inferred through a transitive package path.

- **`@memberjunction/scheduled-actions-server`**: drops `@types/axios`, a deprecated stub package that carries no type definitions; its presence made TypeScript auto-include it and then fail to find any types. axios ships its own.
