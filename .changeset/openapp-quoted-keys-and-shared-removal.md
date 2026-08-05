---
"@memberjunction/open-app-engine": patch
---

fix(open-app): find quoted config keys, and respect a co-owner's exclusion on uninstall.

Two defects found in review of the #3457 work, both verified against the built package.

**Quoted keys were invisible, and the fallback was destructive.** `"excludeSchemas": [...]` is legal in a `.cjs` and is the natural shape when a config is copied out of JSON, but the scanner entered string mode on the opening quote and never matched the key — so the key read as absent. `EnsureExcludeSchemasSection` then appended a SECOND, unquoted `excludeSchemas`, and last-key-wins in an object literal meant the host's real list silently stopped applying:

```
"excludeSchemas": ['sys', 'acme_crm'],   ← host's list, untouched
excludeSchemas: ["newapp"],               ← appended duplicate
→ effective: ["newapp"]                   ← 'sys' exclusion gone
```

Losing `sys` means CodeGen starts adopting system tables on its next run, so this was destructive rather than merely ineffective. A quoted key is now recognised before the scanner treats the quote as a string, for both `excludeSchemas` and `includeSchemas`, single- or double-quoted — while a quoted key inside a comment is still correctly ignored.

**Uninstall stripped a co-owner's exclusion.** `RemoveApp` cleared the schema from `excludeSchemas` unconditionally. With app A (host-managed) and app B (`selfManagedMetadata: true`) sharing a schema, removing A handed B's schema to the host's CodeGen — entity registration plus base views and CRUD procs over a schema whose owner opted out. That is the mirror of the install-order hazard `AnotherInstalledAppSelfManages` closes, and `HandleAngularPrebundleExcludeRemoval` in the same `Promise.all` was already shared-aware.

The share check now runs once above both resumable steps rather than inside `DbCleanupDone`, because on a resume that block is skipped and the config cleanup in `FilesRemoved` would otherwise have no answer.

Also corrects `RemoveIncludeSchema`'s doc comment, which claimed a removal-path call site it does not have. The residue is intentional: a leftover include entry is inert, whereas removing one could narrow a scope a co-owner still depends on.
