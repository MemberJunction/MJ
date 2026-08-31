---
"@memberjunction/ng-explorer-core": patch
---

Regenerate the lazy-feature manifest for the archiving dashboards subpath (#3988 follow-up)

#3988 added the `./archiving-dashboards.module` subpath export to `@memberjunction/ng-dashboards` —
that was the fix, the module had been unreachable. Making it reachable moves its two registered
classes into their own lazy chunk, so `lazy-feature-config.ts` had to be regenerated and was not.

`ArchiveConfigResource` and `ArchiveRunsResource` now resolve through
`archiving-dashboards.module` instead of the catch-all `./module`; the total entry count is
unchanged at 118 because this is a relocation, not an addition. Without it the committed manifest
points those two at a chunk that no longer declares them, which is precisely the shape that lets
tree-shaking drop a registered class from a bundled app.

The PR-scoped CI path does not regenerate manifests (`npx turbo run build` skips the root
postbuild), so this class of staleness is caught by the post-merge full run on `next` by design.
