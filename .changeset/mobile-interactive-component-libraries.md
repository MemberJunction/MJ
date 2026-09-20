---
"@memberjunction/react-runtime": patch
"@memberjunction/mobile-app": patch
---

Interactive components get their declared libraries **and their child components** on mobile, the same way the Angular react bridge supplies them.

**The gap.** An agent-authored component declares its libraries in the spec, and the compiler turns
each declaration into a binding — `const _ = libraries['_']`. The mobile runtime context carried no
libraries at all, so every component that used one (which is most of them) was refused up front with
"this component uses external libraries that only run on desktop". A component asking for `lodash`
was being sent to the desktop over a dependency that could have been sitting in the bundle.

**The seam is the one the web already uses.** `RuntimeContext.libraries`, keyed by
`globalVariable` — the same field `AngularReactAdapterService` fills from `LibraryLoader`'s CDN
loads, merged by the compiler as `{ ...context.libraries }`. Mobile fills it from ordinary npm
dependencies, pinned to the exact versions `__mj.ComponentLibrary` declares. Imports are lazy, so a
component that declares nothing evaluates nothing.

**Filling the map is not sufficient, and the reason is a scoping detail.** The compiler emits the
`const _ = …` bindings *inside* `DestructureWrapperUserComponent` but splices the component's source
one scope out, so a component body referencing `_` reads a free variable. On the web that resolves
because the UMD `<script>` already defined `window._` — the component is reading the global, not the
runtime's map. Mobile therefore also publishes each library onto `globalThis` under its declared
global name, which is the same act a UMD bundle performs, in the module system Hermes has. Existing
globals are never overwritten, mirroring `LibraryLoader`'s own guard.

**react-runtime: the browser check now tests for a DOM.** `loadRequiredLibraries` gated CDN loading
on `typeof window === 'undefined'`. React Native defines `window` but has no `document`, so Hermes
went down the script-loading path and threw
`Failed to resolve dependencies: Library 'lodash' not found` for every component that declared one.
It now tests for `document.createElement`, which is the capability it actually needs; browsers are
unaffected, and DOM-less hosts fall through to the runtime context as intended.

**Thirteen libraries, and honesty about the rest.** Provided: lodash, dayjs, moment, luxon, mathjs,
simple-statistics, chroma-js, uuid, axios, marked, d3, topojson-client, xlsx. Declined: everything
DOM- or canvas-bound (Chart.js, ApexCharts, AG Grid, Ant Design, Leaflet, Mapbox GL, GSAP,
SortableJS, Popper, Emotion, DOMPurify, html2canvas, jsPDF, geo-maps) — shimming those renders
nothing and reports no error, which is worse than declining. The fallback card now names the library
and why, instead of the blanket "uses external libraries", and a spec is refused only for the
libraries it actually cannot get rather than for having any.

---

## Child components

**Mobile called `loadComponent`; the Angular bridge calls `loadHierarchy`.** That one-word
difference was the whole gap. `loadComponent` compiles a single spec, so a component built out of
sub-components — the shape `metadata/components/CLAUDE.md` prescribes for anything non-trivial — had
nothing to render its children with, and `AssessSpec` refused any spec declaring `dependencies`
rather than producing a component with holes in it.

Mobile now makes the same call `MJReactComponent.loadComponentWithManager()` makes, with the same
options (`defaultNamespace: 'Global'`, `defaultVersion`, `returnType: 'both'`), and passes
`result.components` — the flat, unwrapped map of every loaded descendant — as the `components` prop,
which is where the compiler's generated child bindings read them from. The `libraries` map is passed
as a prop alongside it, as the bridge does, for components that read `libraries.d3` rather than the
bare global.

**Libraries are resolved for the whole tree, not the root.** `loadHierarchy` compiles each component
against *its own* `spec.libraries`, so a parent using lodash whose child uses d3 needs both loaded
before any of it compiles. `CollectHierarchyLibraries` walks the tree once up front.

**`generateComponentHierarchyHash` moved into the runtime.** It derives the registry version key for
a spec with no explicit `version`, and it lived as a private method on the Angular component — so a
second host had to reimplement it, and two implementations of a registry key is how two surfaces
silently compile two copies of the same component. `MJReactComponent` now delegates to the runtime's
copy.

**What mobile still declines, and why it is not "dependencies".** A child whose code the spec does
not carry: `location: 'registry'` without inline `code` needs a component-registry fetch this app
cannot perform, and a child with no code at all cannot compile. The fallback names the missing part.
