---
"@memberjunction/auth-providers": patch
"@memberjunction/core-actions": patch
"@memberjunction/db-auto-doc": patch
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-react": patch
"@memberjunction/react-linter": patch
---

Export `@RegisterClass`-decorated classes from their packages' public APIs.

`@RegisterClass` plugs a class into MJ's ClassFactory resolution chain, so a
registered-but-unexported class is incoherent: it declares itself resolvable from
anywhere while being importable from nowhere. It also breaks the pre-built class
manifests, which emit a **named import** per registered class — an unexported one
makes the manifest unloadable outside a bundler.

Purely additive: each package gains exports for classes that were already
registered. No existing export was renamed or removed.

- `auth-providers` — Auth0, Cognito, Google, MSAL, Okta, WorkOS providers
- `react-linter` — 60 runtime rules + 3 semantic validators (the rules barrel used
  side-effect imports, which registered the classes but never exported them)
- `db-auto-doc` — MySQL, PostgreSQL, SQL Server drivers
- `ng-core-entity-forms` — custom `*Extended` form components
- `ng-dashboards` — BulkOperations and KnowledgeHub resource components
- `ng-explorer-core` — resource wrapper components
- `core-actions` — Betty, GetRecords
- `ng-react` — RuntimeUtilities

A CI gate (`npm run check:registerclass`) now enforces the invariant.
