---
"@memberjunction/interactive-component-types": minor
"@memberjunction/react-runtime": minor
"@memberjunction/ng-react": patch
"@memberjunction/react-test-harness": patch
---

feat(components): theme-aware registry components — viz ramps, spec-level StyleOverrides, hardcoded-color migration.

`ComponentStyles` gains `sequentialScale`/`divergingScale` visualization ramps (backed by new `--mj-viz-seq-*`/`--mj-viz-div-*` theme tokens with dark-mode re-anchors), plus status text/border and overlay color slots bridged from `--mj-status-*`/`--mj-bg-overlay`, and `secondary`/`secondaryHover` bridged from `--mj-brand-secondary(-hover)`. `ComponentSpec` gains an optional `styleOverrides` field (`chartPalette`, `sequentialScale`, `divergingScale`, `fontScale`, with provenance) so user-requested styling is carried as spec data instead of color literals in generated code; the new `ApplyStyleOverrides` utility in `@memberjunction/react-runtime` layers it above theme-resolved styles. `MJReactComponent` applies overrides over both explicit styles and the bridged live theme (memoized so styles identity stays stable), and restyles in place when a spec change touches only `styleOverrides`. The test harness applies overrides to generation-time screenshots. All 10 generic registry components now read `styles.colors.*`/palette slots with their previous literals kept as no-theme fallbacks.
