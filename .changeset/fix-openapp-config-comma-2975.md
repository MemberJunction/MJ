---
"@memberjunction/open-app-engine": patch
---

Fix `mj app install` corrupting `mj.config.cjs` (#2975). When inserting a new top-level section (`dynamicPackages` / `entityPackageName`) before the closing brace of `module.exports = { ... }`, the preceding property is now comma-terminated, so a config whose last property is a brace-terminated block (e.g. `openApps: { ... }` with no trailing comma) stays valid JavaScript instead of breaking the next `require('mj.config.cjs')` (the `mj migrate` / `mj codegen` / build steps an install runs). The comma logic is string- and comment-aware so a `//` inside a value like `'http://x'` or braces inside strings are never miscounted. Additionally, every config write (all six add/remove/toggle functions) now passes through a post-write parse guard that compiles the result first and, on any malformed output, fails loudly with the file left untouched — so a bad edit can never silently ship a broken config.
