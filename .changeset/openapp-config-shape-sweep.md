---
"@memberjunction/open-app-engine": patch
---

fix(open-app): route every config insertion through the comment-aware anchor, and sweep the shape space.

Adds a property sweep over realistic `mj.config.cjs` shapes — key quoting × position × header comment × nested same-name keys × export form × array state × positive-scope state, 1,296 combinations — driving each through the real `HandleServerConfig` sequence three times and asserting invariants that must hold for any shape: the file still evaluates, the host's own entries survive (neither deleted nor shadowed), unrelated and nested same-name keys are untouched, intent is reflected in the EVALUATED config rather than merely written somewhere, and three runs are indistinguishable from one.

It found a live defect on its first run. `InsertBeforeModuleExportsClose` still anchored on `content.match(/module\.exports\s*=\s*\{/)`, which returns the FIRST textual hit — and MJ's own default MJAPI scaffold documents an example `module.exports = {…}` inside its header comment. On a stock host every section that helper creates therefore landed inside that comment, inert, while the operation reported success. All three of its callers shared the failure: `dynamicPackages`, `excludeSchemas` and `entityPackageName`.

That helper now resolves its anchor through the comment- and string-aware `FindExportedObjectBrace`. This also closes the `dynamicPackages` case tracked as issue #3301 — an app's server packages silently never loading because their config entry was written into a comment.

The sweep is the point rather than the individual fix. Every config-editor defect found in this area — an unanchored regex that ate `entityPackageName`, an anchor selecting a commented `module.exports`, a nested key winning because it appeared first, a quoted `"excludeSchemas"` reading as absent and being shadowed — was the same failure: correct for the shapes someone thought to test, silently wrong for a shape a real host used. Enumerating the shape space closes that gap by construction.
