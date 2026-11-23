---
"@memberjunction/ng-auth-services": patch
---

Relocate `@memberjunction/ng-auth-services` from `packages/Angular/Explorer/auth-services` to `packages/Angular/Generic/auth-services` and set `mjUILayer` to `widgets` so non-Explorer Angular applications can reuse authentication services and login UI without Explorer coupling.
