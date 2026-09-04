---
"@memberjunction/a2aserver": patch
"@memberjunction/ai-mcp-server": patch
"@memberjunction/ng-bootstrap": patch
"@memberjunction/ng-bootstrap-lite": patch
"@memberjunction/server-bootstrap": patch
"@memberjunction/server-bootstrap-lite": patch
---

Regenerate the class-registration manifests so every one of them is on the chunked format.

The chunked manifest format (`CLASS_REGISTRATIONS_0`, `CLASS_REGISTRATIONS_1`, …) was introduced to keep
TypeScript from hitting TS2590 on a single union that had grown too large. Only `server-bootstrap` and
`server-bootstrap-lite` were regenerated at the time, so the remaining manifests stayed on the old
single-array shape and the `Build` job's manifest gate has been failing on `next` ever since.

This regenerates all of them from a fully-built workspace. Alongside the format change the sweep picks up
registrations that had drifted out: `MJAIUsageTypeEntity` and the `LinearPriceUnitType` /
`PerImagePriceUnitType` / `TimePerHourPriceUnitType` / `TimePerMinutePriceUnitType` pricing unit types in the
Angular bootstraps, and `MJEntityPermissionEntityServer` / `MJTenantFilterMiddleware` / `RateLimitMiddleware`
from `@memberjunction/server` in the server bootstrap.

Generated output only; no hand edits, no runtime behaviour change.

One thing worth knowing for anyone regenerating these in future: **the manifest generator is sensitive to
build state.** `resolveSubpathExportsDetailed()` resolves a package's lazy-loading subpaths by reading the
`.d.ts` each `exports` entry points at, and it `continue`s past any that is missing. Run `mj codegen manifest`
against a workspace whose `dist/` folders are absent and the subpaths silently resolve to nothing — the
package falls through to the whole-package branch and `lazy-feature-config.ts` collapses its twelve
per-dashboard chunks into one eager import, with no warning. Build the workspace first.
