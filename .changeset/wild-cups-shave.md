---
'@memberjunction/ng-conversations': patch
---

Repair `tsconfig.spec.json`, which two merge resolutions had left as invalid JSON by appending `include` entries without a preceding comma. `vitest.dom.shared.ts` hands that file to `@analogjs/vite-plugin-angular` as its `tsconfig`; with it unparseable, the plugin's TypeScript program no longer contained the component sources, so the AOT transform never ran for them and 9 DOM test files failed with `Component 'X' is not resolved`. The hand-enumerated file list is replaced with `src/**/*.ts` — the include the other Angular packages use — so it cannot drift out of sync with the files on disk again.
