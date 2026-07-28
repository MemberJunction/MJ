---
"@memberjunction/server": patch
"@memberjunction/ng-action-gallery": patch
---

Declare phantom dependencies surfaced by strict installs: MJServer now declares `@types/express` (devDependency — express type imports across `src/`; pinned `^4.17.25` because that is the copy MJServer has always compiled against via its `@types/compression` dependency, and `express-rate-limit`'s handler types bind to it — the v5 types migration is a separate change) and `@memberjunction/integration-engine-base` (dependency — imported by `IntegrationDiscoveryResolver`); ng-action-gallery now declares `@memberjunction/ng-test-utils` (devDependency — imported by its DOM test). npm's hoisting hid these; strict package managers (pnpm) fail on them. No behavior change.
