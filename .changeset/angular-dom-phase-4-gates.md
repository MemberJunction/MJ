---
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-dashboards": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-settings": patch
"@memberjunction/ng-entity-permissions": patch
"@memberjunction/ng-entity-form-dialog": patch
"@memberjunction/ng-list-detail-grid": patch
"@memberjunction/ng-simple-record-list": patch
"@memberjunction/ng-markdown": patch
"@memberjunction/ng-agent-requests": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-scheduling": patch
"@memberjunction/ng-agents": patch
"@memberjunction/ng-record-changes": patch
---

Angular DOM unit-testing — Phase 4 (gates, guardrails & spec hygiene). Dev-only; no runtime change.

- **`test:types` spec type-check gate**: each DOM-testing package gains a
  `"test:types": "tsc --noEmit -p tsconfig.spec.json"` script, run as a cached turbo task in CI
  before the vitest suite (both the affected and full-suite paths). Closes the Phase-3 hole where
  vitest/esbuild's transpile-only path let real spec type errors (broken `import type` paths,
  `Subject`-vs-`EventEmitter`) ride green until the `ngc` build failed.
- **DOM-spec placement guard** (`scripts/check-dom-spec-placement.mjs`, fast pre-build CI step):
  fails when a `*.dom.test.ts` sits inside `__tests__/`, where a dual-preset package silently runs
  it in neither vitest project. Its one real finding — `ng-markdown`'s service DOM spec — was
  relocated next to its source (test-file move only).
- Fixes the pre-existing latent 2-args-of-3 `MCPDashboardComponent` constructor call in the
  dashboards node test (the gate's prerequisite).
- **Anti-pattern lint** (`scripts/check-spec-antipatterns.mjs`, CI): bans vacuous assertions,
  skipped specs, blanket schemas, and `any`/`as never` casts in `*.dom.test.ts`. Enabling it drove
  the spec-hygiene cleanup across `ng-agent-requests` / `ng-query-viewer` / `ng-scheduling` /
  `ng-agents` / `ng-record-changes` (blanket schemas → explicit child stubs; `as never` → typed
  doubles) and the Explorer specs (real DOM clicks instead of handler calls, SVG prototype-patch
  teardown, typed context doubles).
- **Explorer DOM coverage gate**: `classify-explorer-components.mjs --min 85` in CI — a testable
  Explorer component shipped without a DOM spec now fails the PR.
