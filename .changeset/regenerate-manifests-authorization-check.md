---
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
---

Regenerate the class-registration manifests for `AuthorizationCheckServerOperation`.

#4185 added `AuthorizationCheckServerOperation` in `@memberjunction/core-entities`, decorated `@RegisterClass(BaseRemotableOperation, 'Authorization.Check')`, without regenerating the committed class-registration manifests. Every push to `next` since has failed the Build job's manifest freshness gate. The four bootstrap manifests now import and register the class (one more registration each), which is what `pnpm run mj:manifest` produces. Without the entry, tree-shaking can drop the operation from bundled apps and the remotable `Authorization.Check` operation silently never registers.
