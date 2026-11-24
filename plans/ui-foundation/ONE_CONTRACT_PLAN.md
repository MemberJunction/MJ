# One Contract Plan: Lego, ComponentSpec and widgets on every surface

Proposed 2026-11-21 (Amith). Revised 2026-11-24 after review by Matt and Colin on #6818. Status: direction agreed; details open.

**PR #6818 is the master tracker for this work.** Section 2 links every document, RFC and PR that spins out of it.

This plan extends [UNIFIED_PLAN.md](UNIFIED_PLAN.md) and proposes amendments to the Lego plan ([README.md](README.md)). Section 11 lists each amendment. This PR does not edit those files; Matt and Colin own them.

## 1. Summary

MJ has two component worlds that do not share parts. Compiled Angular components are typed and build-checked, and render only in Explorer. Runtime React components (`ComponentSpec`, built for Skip) change without a build and already render on mobile, but they are untyped JavaScript loaded against React 18.2 from public CDNs. Lego is about to add a third vocabulary that only Angular can use.

This plan makes them one system:

1. **One shared core** describes every Lego primitive. It is a small framework-free TypeScript package: prop types, defaults, part and token descriptors, and a pure function per primitive that returns its classes, style variables and aria. Angular, React and React Native all call it, so they cannot drift. `components.json` is generated from it.
2. **Lego's styling ships as plain CSS** (already Lego decision D1). Any host that can load a stylesheet gets the same look.
3. **AI-generated components become typed TSX.** A real TypeScript check runs on the server against types generated from the spec and the contract. JSX stays supported with no end date and no conversion. We stop generating new JSX.
4. **The ComponentSpec runtime moves to current React** and stops depending on other people's UMD files and on public CDNs. MJ builds the script files itself. This is not a move to ES modules.
5. **Widgets get a contract.** `componentRole: 'widget'` is already reserved in the spec. A widget can be a runtime TSX spec or a compiled Angular class, and a dashboard shows either the same way. TSX widgets also run on mobile.
6. **Metadata dashboards become the default surface.** Home becomes one, with layered layouts. This has its own design document, [HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md), and ships in the same release.
7. **Every primitive is proven on every surface before it counts as done**: Angular, plain React, inside a ComponentSpec, and React Native. Everything lands before one edge release (section 9).

Every claim the system makes about itself is enforced by a deterministic gate (section 6), in line with principle 9 of the unified plan.

### What each person is asked for

| Who | Why you | The ask |
|---|---|---|
| Matt | You own the Lego contract, catalog and names (D11) | Agree that the contract is authored first and Angular is its first binding, before wave 1 starts. Review sections 4 to 6 and 11. |
| Colin | You own Home and build the catalog generator | Review the generator direction (section 5, P1), the Home widget board (workstream D) and Home as a metadata dashboard (workstream G). |
| Jordan | You moved Skip's stage-audit fixes into the linter and harness (#6362) | Review workstream C. The type-check replaces the rule families that produced those false positives. |
| Caeleb | You built first-class dashboards (#4982) and the run-consent gate (#6786) | Review workstreams D and G: the widget host, trust at render, and layered dashboard layouts. |
| Robert | You asked for dashboards on Home and review the when-to-use guidance | Review the widget vocabulary (section 10) and workstream G, which schedules your ask. |
| Madhav | Skip is the largest ComponentSpec consumer | Review workstream C for what changes in Skip's generation pipeline. |

## 2. Tracker

Matt and Colin implement this with Lego. Work merges to `next` in order. Nothing is considered shipped until the release bar in section 9 is met.

| Item | Where | Owner | State |
|---|---|---|---|
| This plan | #6818 | Amith | In review |
| Unified UI plan | [UNIFIED_PLAN.md](UNIFIED_PLAN.md), #6503 | Matt, Colin | Merged; amendments in section 11 |
| Lego wave 0 prototype | #6673 | Matt | Open |
| Home and layered dashboards (workstream G) | [HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md) | Colin; Matt drives user research | Stub; design and research to start |
| Tracer bullet: shared core with `surface` and `row` on all four surfaces | PR to be opened | Matt | Not started |
| Sandboxed component host | #5257 | Open | Open; needed for P10 and P11 on web |
| Mobile v1 and its render-mode decision | #6179 | Open | Open; decides how widgets render on mobile |
| MJ Elements | #5903, #5916 | Matt | Open |

Add a row here for each PR or document as it is opened.

## 3. What is wrong today

| # | Problem | Evidence on `next` |
|---|---|---|
| 1 | Two component worlds with no shared parts. A spec can only compose other specs. An Angular part cannot be drawn on mobile. | `ComponentSpec.dependencies` in `packages/InteractiveComponents/src/component-spec.ts`; mobile maps a Component dashboard part to `unknown` (`packages/MobileApp/src/data/services/explorer.ts`, `kindFromTypeName`) |
| 2 | Lego's catalog is planned as an output of the Angular primitives, and its behaviour rule names Angular CDK. Nothing but Angular can consume it. | UNIFIED_PLAN phase 3: "`components.json` generated from the primitives themselves"; README §4: "The boring half ... comes from Angular CDK" |
| 3 | The spec runtime loads React 18.2 as a script-tag (UMD) build from unpkg. React 19 no longer ships one. All 28 active component libraries load the same way from public CDNs. | `packages/React/runtime/src/utilities/core-libraries.ts`; `metadata/component-libraries/.component-libraries.json` |
| 4 | Hand-kept CDN URLs drift. | The emotion rows declare 11.11.x and load 11.14.x; `geo-maps` loads a floating `^5` |
| 5 | AI-generated components are unchecked JavaScript. The linter approximates a type checker by hand. | 78 rule files, about 20 of them type-shaped, on a 1,492-line `type-inference-engine.ts`. #6362: false positives "flagged correct code, and the fixer then changed working code to satisfy it"; Skip carried the fixes as patches |
| 6 | Widgets have no contract. Home's sections are hard-coded. | `componentRole` lists `'widget'` as "reserved for future role contracts"; `packages/Angular/Explorer/dashboards/src/Home/home-dashboard.component.html` |
| 7 | Approval is recorded but not enforced at render. | `ApprovalStatus` and `ApprovedFingerprint` exist on `MJ: Components`; `ComponentMetadataEngine.FindComponent` filters on neither status nor version; the consent gate in #6786 covers artifacts only |
| 8 | Layouts are mostly code. A metadata dashboard has one shared layout owned by its creator, with no organization or role default and no personal arrangement. Home can show a pinned dashboard, but the choice lives only in the URL. | `MJ: Dashboard User States` serves Code dashboards only; `MJ: Dashboard User Preferences` picks which dashboard a user or the system defaults to, not how it is laid out; `packages/Angular/Explorer/dashboards/src/Home/home-pinned-dashboards.ts` |

## 4. The design

```
Hosts        Explorer Home · Config dashboards · mobile · conversations and artifacts
             (each host mounts a role contract: form, form-panel, widget)

Components   Compiled Angular widgets and compositions
             Typed TSX ComponentSpecs (runtime, AI-authorable)

Bindings     Angular (ng-ui-components) · React (web, mobile WebView, sandbox frame) · React Native
             Thin. Each is checked against the contract.

Foundation   Tokens · primitives CSS · the shared core (TypeScript; components.json is generated from it)
             Framework-neutral. The single source.

Logic        Engines and Remote Operations. Typed TypeScript, shared by every host. Unchanged.
```

Four rules hold it together.

1. **The shared core is the source.** A primitive's inputs, defaults, parts, classes, exposed values and aria are computed in one framework-free TypeScript package. Each binding calls it and renders the result. A hand-written JSON contract with checks was the first proposal; review showed checks alone let a binding ignore inputs (section 7).
2. **Styling is CSS, written once.** Lego D1 already puts every primitive's CSS in a named `@layer` with an `.mj-` prefix and encapsulation off. In the wave 0 prototype (#6673), `mj-surface` is an empty shell that maps inputs to classes and CSS variables. A binding never restyles; it only applies classes.
3. **Behaviour is per host; its contract is shared.** Angular keeps CDK for overlay, focus trap and announcements. React uses the browser's native dialog and popover. React Native uses native modals. All three implement the same named kinds, dismiss rules and events. A shared vanilla-JS behaviour core is not proposed now; revisit it only if the bindings drift.
4. **Logic stays in engines and Remote Operations.** Widgets are thin views. This is where strong typing already lives, and it is what lets one widget's data and actions work on every host.
5. **Layouts are data.** A dashboard is a set of widget placements stored as metadata and resolved through layers: an organization default, a role layer, then the user's own changes. Code-based layouts remain for surfaces that need them.

**What runs where.**

| Widget kind | Explorer Home and dashboards | Mobile |
|---|---|---|
| Runtime TSX spec | Yes | Yes, after workstream F. In a WebView if #6179's lean holds; natively when the spec uses only primitives that have React Native bindings |
| Compiled Angular class | Yes | No. Angular does not run in the mobile app |
| Existing JSX spec | Yes, unchanged | As today |

**Naming.** No new layer number. The UI Layering Guide's L0 to L3 govern data access and navigation and are enforced by name (`widgets`, `surface`, `shell`) across 99 packages. Lego has its own stack: foundation, primitives, compositions, app. This plan widens Lego's foundation to include the primitives CSS and the contract, and adds bindings beside the Angular one.

## 5. Proposed decisions

| # | Proposal | Why |
|---|---|---|
| P1 | The source of truth is a small framework-free TypeScript package. Angular calls it in `computed()`, React in render, React Native for props and tokens. The catalog generator emits `components.json`, the NAMING.md arrays and the gallery from it. No hand-edited JSON. | Shared code cannot drift; a checked JSON contract can. Agreed with Matt and Colin on #6818. |
| P2 | The primitives CSS and the token CSS are published as plain files any host can load. | Already implied by D1 and the wave 0 spec §9. Makes it a stated contract. |
| P3 | Behaviour stays per host on a shared contract. Angular keeps CDK. Interactive React bindings use React Aria hooks, keep the same `.mj-*` markup, and pass the same keyboard and axe suite as Angular. Dialogs and popovers stay out of wave 1 widgets until Angular and React overlays share one stack. | Native popover gives no roving focus or menu semantics. Two overlay stacks would not share Escape or focus return. |
| P4 | The React binding is plain typed components that render the same markup and classes. It does not use custom elements. | Inside Explorer, element tags equal the Angular selectors and would double-render; each Elements bundle carries its own Angular; React 18 passes only strings to custom elements; React Native renders an unknown tag as a bare view. |
| P5 | React Native bindings cover the widget vocabulary (about ten primitives) and are built with each primitive, not deferred. | React Native on every surface is part of the goal. #6179's render mode decides whether widgets use them or the WebView. |
| P6 | New specs are generated as TSX only; Skip and other generators stop emitting JSX. JSX specs stay supported with no end date and are not converted. A spec declares its language. The type-check runs on the server; the browser only strips types. No build step is needed to render. | Measured: all 117 shipped components compile to identical output with the TypeScript preset on (section 7). |
| P7 | Each host supplies its own React 19. MJ builds one script-loadable file per approved library version from npm and serves it from its own origin. The loader still loads script-tag globals. This is not a move to ES modules. | Removes the dependency on other people's UMD files and on public CDNs without changing the loader or any spec. #5257 already recommends mirroring libraries (its D2). |
| P8 | `componentRole: 'widget'` gets a typed host contract, following `form-panel`: size class, placement ID, host context, standard events and methods, and an optional settings schema. A widget may be a TSX spec or a compiled class. | `FormPanelHostProps` and `InteractiveFormsEngine` already run this compiled-or-runtime hybrid. |
| P9 | On the web, the widget host is the existing Component dashboard part. Home gets a personal widget board. Mobile gains a `component` part kind and accepts props and events. | The Component part already maps spec properties to typed inputs and events. |
| P10 | Trust is decided at approval time. An Approved spec renders with no prompt; an unapproved one renders only for its author. Approval covers resolved child specs. A backfill approves the shipped components first. | Review found no shipped component has an approval recorded, and the fingerprint covers only the parent spec. Prompting end users causes warning fatigue. |
| P11 | Specs gain `utilities.ops`, limited to operations the spec declares. The transport (`RouteOperation`) already exists; what is missing is the allowlist on the data requirements, generated types and the mobile bridge call. | Quick actions today need `GetEntityObject` and `Save`, which the mobile bridge cannot proxy. On web the allowlist only holds inside #5257's sandbox. |
| P12 | The runtime hands the Lego React components to every spec on a dedicated prop, separate from `props.components`. Skip generates against them. TSX widgets style through Lego CSS variables, not `props.styles`. | A spec can only compose other specs today. `props.styles` carries only colour tokens. This task is pulled forward so primitives can be tested inside a ComponentSpec from the start. |
| P13 | The widget host mounts either implementation of the role: a spec, or a compiled Angular class resolved through ClassFactory. Compiled Angular widgets are web-only. | `InteractiveFormsEngine` already does this for form panels. Existing Angular widgets, such as the Tasks approval inbox, can ship on the web at once. |
| P15 | A primitive is done only when it passes the same gate on four surfaces: Angular, plain React, inside a ComponentSpec, and React Native. The tracer bullet is `surface` and `row`. | A core with one consumer takes that consumer's shape. `row` has interaction, parts and keyboard behaviour, so it tests the core where it could break. |
| P16 | Contracts are provisional until the release bar is met, then frozen under Lego's additive rule. Explorer conversions stay few until then. | A flaw found by the second or third surface can still be fixed. |
| P14 | Metadata dashboards are the default surface for new work, and Home becomes one. Design is in the [RFC](HOME_AND_LAYERED_DASHBOARDS_RFC.md). | The value of this plan reaches users through widgets and dashboards. |

## 6. Deterministic gates

Each gate is a pure check with no model and no network. The same inputs always give the same result.

| Gate | What it proves | How | Run in the spike |
|---|---|---|---|
| G1 | The generated catalog is well formed | JSON Schema validation of `components.json` | No |
| G2 | Generated files match the core | Regenerate in CI; any diff fails. Output is a pure function of the core: sorted keys, no clock | Yes, against a JSON contract |
| G3 | Every binding uses the shared core | Each binding's rendered classes, style variables and aria equal the core's output for every fixture, including defaults and every input | Partly: the spike compared against a JSON contract |
| G4 | No input is ignored | Fixtures vary every input one at a time; output must change where the core says it does | No. The spike's version only required destructuring, which review showed is not enough |
| G5 | The CSS matches the core | Parse the stylesheet; every class and public custom property must be one the core declares, and every declared class must exist | Yes, on #6673's stylesheet |
| G6 | Every surface passes the same suite | The same fixtures, keyboard tests and axe checks run against Angular, plain React and a ComponentSpec. React Native is reviewed on a device | React only, class lists only |
| G7 | The catalog only grows once frozen | Diff against the last released catalog; removals, renames and narrowed types fail | No |
| G8 | A TSX spec is type-correct | TypeScript check against declarations generated from the spec and the contract. The contract hash is stamped on the checked spec | Yes |
| G9 | Existing JSX specs are unaffected | Compile every shipped component with and without the TypeScript preset; output must be identical | Yes |
| G10 | A library file is what was approved | Built from a pinned npm version; integrity hash stored on the library row and checked on load | No |
| G11 | A layout is valid | Every placement names a widget that exists, and its configured values satisfy that widget's declared properties. Checked on save, and in CI for shipped layouts | No |

**What the gates cannot prove.**

- React Native visual parity. There is no DOM to compare. Prop types and token use are checked; appearance is reviewed from screenshots.
- Behaviour parity (focus order, dismiss rules). This needs interaction tests per host.
- Filter strings. SQL inside a string is still a string.

## 7. What the spike proved, and what review found

The spike scripts were throwaway and are not in the repo. They are at commit `3e4dc4aece` under `plans/ui-foundation/one-contract-spike/`. Everything below was run on 2026-11-21.

**Typed TSX.**

- A sample "My Open Tasks" widget spec produced about 25 lines of generated declarations.
- The TypeScript checker caught eight planted mistakes of the kind AI makes: a wrong field name (with "Did you mean `DueAt`?"), a nullable date compared without a null check, a status value that does not exist, a wrong prop type and an invalid variant on a child component, an optional event called unguarded, a field the spec never declared, and a style token that does not exist.
- The first check in a process took about 500 ms; later checks took 20 to 60 ms (TypeScript 5.9.3).
- Babel 7.24.4, the line the web host loads today, stripped the types in 24 ms. The output ran through the runtime's injected-React factory shape and rendered on React 19.3.

**Backward compatibility.** All 117 shipped components were compiled with and without the TypeScript preset. 114 gave identical output. The other 3 fail the same way without the preset, so the preset is not the cause.

**The contract gates, on Matt's real prototype.** A hand-written contract for `surface` was checked against #6673's component and stylesheet.

- The Angular binding matched on all eight inputs, three parts and four built-in levels.
- The CSS check flagged `--mj-surface-gap`: the hand-written contract had left `gap` out. That is the gate doing its job.
- A drift test added an input and flipped a default in the contract. The Angular check named both differences, and the React binding stopped compiling.

**What review found (Matt and Colin, #6818).**

- The gates passed a React `surface` that ignored five of its eight inputs. Hence the shared core (P1) and gate G4.
- Dates: the spike typed them as `Date`. Simple RunView rows in Explorer do arrive as `Date`, but query rows and the mobile WebView bridge deliver text. Generated types must be right per path, or the bridge must convert as Explorer does.
- The shipped specs have gaps the type generator must handle: missing field metadata, dependency properties that must be looked up from the registry, property types that are not valid TypeScript, and names used as both a property and an event.
- No shipped component has an approval recorded (P10).

Not proven: antd on React 19, the library build, the mobile native renderer with the TypeScript preset, and any of this wired into MJ.

## 8. Workstreams

Matt and Colin implement this with Lego. Named reviewers stay as in section 1.

### A. Shared core and gates (Matt for the core; Colin for the generator)

- [ ] The shared core package: prop types, defaults, descriptors and one pure host function per primitive
- [ ] Generator: core to `components.json`, the NAMING.md arrays, the gallery and the AI declaration file
- [ ] Gates G1 to G7 in CI, replacing the planned unknown-component check
- [ ] Tracer bullet: `surface` and `row` on the core, passing on all four surfaces (P15)
- [ ] axe in the React test harness, so AI-generated layouts are checked

### B. Lego (Matt)

- [ ] Wave 1 (badge, metric, card, stat tile, icon): core, CSS, Angular, React and React Native binding in the same PR, each passing the four-surface gate
- [ ] Wave 0 step 7 (`@layer reset` in explorer-app) lands before React renders `.mj-*` classes in Explorer
- [ ] Publish `tokens.css` and `primitives.css` as loadable files (wave 0 spec §9)
- [ ] One token source feeding CSS, a TypeScript map and the mobile theme, replacing the hand-kept copies in `packages/MobileApp/src/theme/tokens.ts` and `packages/Web/RealtimeWidget/src/ui/tokens.ts`

### C. ComponentSpec runtime (Matt and Colin; Jordan and Madhav for Skip)

- [ ] Spec `language` field; TypeScript preset in the web, WebView and mobile native compile paths
- [ ] Generators emit TSX only. JSX specs stay supported with no end date and are not converted (P6)
- [ ] First: the runtime hands the Lego React components to specs on a dedicated prop (P12). Grids and charts stay on their current libraries for now
- [ ] Declaration generator: handles the gaps in shipped specs (section 7), models wire types per path, and turns on `erasableSyntaxOnly`
- [ ] `ComponentTypeToValueType` accepts real TypeScript types, so dashboard input mapping does not reject TSX specs
- [ ] Freeze the JavaScript inference engine for legacy JSX
- [ ] Type-check service beside the linter, in the server action path and the test harness; diagnostics returned to the authoring agent
- [ ] Retire the type-shaped lint rules for TSX specs; keep the policy rules
- [ ] Host-provided React 19. Spike first: antd on React 19, and the four libraries that ship CSS, assets or workers (ApexCharts, ag-grid, leaflet, mapbox-gl). Prune unused libraries and drop axios
- [ ] Mobile: the Hermes Babel config overwrites the compiler's presets; fix before adding the TypeScript preset
- [ ] Library build: one file per approved version from npm, served from MJ's origin, with an integrity hash (G10); React is the first one
- [ ] `utilities.ops` (P11)
- [ ] `FindComponent` resolves by version and filters on status

### D. Widget role and hosts (Colin)

- [ ] `WidgetHostProps`, event and method names, and `settingsSchema` in `@memberjunction/interactive-component-types`
- [ ] One part renderer mounts both a spec and a compiled Angular class (P13), with no part-type row per compiled widget
- [ ] Card grid layout mode built once in `dashboard-viewer`; Home uses it
- [ ] Spec loads cached in memory and invalidated on save, instead of one query per widget
- [ ] Per-placement settings: the host passes `UserStateScope` as namespace, name and placement ID. Author configuration stays on the panel; user preferences stay in user settings
- [ ] Approval backfill for shipped components, then the approval rule in the host, covering child specs (P10)
- [ ] Card Grid support in the agent layout tools, which assume Golden Layout today
- [ ] Widget metadata for discovery: owning app, category, sizes, required permission
- [ ] Add Component to the agent studio tools' part-type list

### E. First widgets (Tasks and Planning owners)

- [ ] `Tasks.GetMyDay` Remote Operation, lifting `Get My Tasks Briefing`, shared with the Chief of Staff briefing
- [ ] `Planning.GetMyPlanning` Remote Operation, lifting `Get My Planning Briefing`
- [ ] Tasks: Approvals waiting on me, My day, Urgency strip, Quick add
- [ ] Planning: My priorities, Check-ins due, Plan pulse
- [ ] Fix `OpenStuckCount`, hard-coded to 0 in `GetPlanDashboardData` (bizapps-planning)

### F. Mobile (with the owners of #6179)

- [ ] Renderer accepts host props and delivers events on both the native and WebView paths
- [ ] `component` dashboard part kind
- [ ] WebView bundles React 19 and the current runtime locally (#6179 already plans the local bundle)
- [ ] React Native bindings for the widget vocabulary; the native renderer swaps them in for specs built only from primitives

### G. Home and layered dashboards (Colin; Matt drives user research)

Designed in [HOME_AND_LAYERED_DASHBOARDS_RFC.md](HOME_AND_LAYERED_DASHBOARDS_RFC.md). It runs in parallel from now, includes a short round of user research, and ships in the same release as the rest.

## 9. Order of work and release bar

| Step | Work | Depends on |
|---|---|---|
| 1 | A (contract for wave 0 primitives, gates) and C (TSX, React 19, library build). These are independent of each other. | Matt's agreement on P1 |
| 2 | B wave 1 contract-first, with the React binding | Step 1 gates; the wave 0 prototype gate |
| 3 | D widget role and hosts; E Remote Operations | Step 1 (TSX) |
| 4 | E first widgets on Home and in dashboards | Steps 2 and 3 |
| 5 | G Home and layered dashboards. Design and user research start now, in parallel | Steps 3 and 4 for the build |
| 6 | F mobile, with React Native bindings built alongside each primitive | Step 3; #6179's render-mode decision |

**Release bar.** Work merges to `next` in this order. All of it, including G and mobile, lands before one edge release, to be named. Until then primitive contracts are provisional (P16). There is no rush: a couple of weeks for user research is expected.

## 10. Widget vocabulary

The first widgets need little: card, stat tile, metric, badge, icon, list row, progress ring or sparkline, empty state and button. Card, stat tile, metric, badge and icon are Lego wave 1. Row is wave 0. This is the set that gets React and React Native bindings first.

## 11. Proposed amendments to existing plans

| Document | Today | Proposed |
|---|---|---|
| UNIFIED_PLAN phase 3 | "`tokens.json` and `components.json` generated from the primitives themselves" | Generated from the shared core, which every binding calls. The core lands ahead of wave 1 |
| UNIFIED_PLAN phase 2 | Wave 1 lands as Angular primitives with first conversions | Each wave 1 primitive lands on the shared core with Angular, React and React Native bindings, passing the four-surface gate |
| UNIFIED_PLAN "Later, or study first" | "Homepage as information, not navigation: Metadata dashboards on Home; Robert's ask" is unscheduled | Scheduled here as workstream G. The phase 1 Home chips ship as planned and become a widget on the Home dashboard |
| Lego README §4 | "The boring half ... comes from Angular CDK" | True for the Angular binding. Other bindings use their host's equivalent on the same behaviour contract |
| Lego README §4, "The four layers" | Foundation is tokens, scales and the layer service on CDK | Foundation is tokens, primitives CSS and the contract. The layer service is part of the Angular binding |
| Lego README §8 and §10 | "No sandbox tier, on purpose" | Unchanged for Open Apps. The frame proposed in #5257 for agent-written components loads the same CSS and React binding, so what runs inside it still inherits the kit |
| #5257 | Precompile on publish in its last phase | Precompiled output is an optional cache; in-browser compile stays the baseline. Trust rules (its D5 and D7) are needed by P10 |
| #6179 | WebView bundles the runtime with React 18.2 | Bundle React 19; add the `component` part kind and host props |
| #5903 (MJ Elements) | Base layer is "Angular once, the tokens and base component styles" | No change. The published CSS files are that base layer |

## 12. Risks and open questions

1. **Three bindings can drift.** G3 to G6 exist for this. React Native is the weakest (section 6).
2. **Contract-first adds work to wave 1.** Each primitive lands more files per PR. The contract entries for wave 0 should be written first to size it.
3. **antd.** The shared DataGrid depends on antd 5.20.2, which officially supports React 16 to 18. Whether antd 6 still ships a script-loadable build is unconfirmed.
4. **Library build location.** At MJ release for the core set, in the component registry as a service, or a CLI step for libraries a customer adds. Undecided.
5. **Libraries that do not flatten to one file.** ApexCharts, ag-grid, leaflet and mapbox-gl ship paired CSS, assets or workers.
6. **Mobile render mode.** #6179 leans to WebView-only in production. If that holds, widgets on mobile use the web React bindings and the native ones serve native screens only. Rendering widgets natively needs dual mode. Decide in #6179.
12. **React Native parity has no automated check.** Each primitive needs a review on a device.
13. **React Aria is a new dependency** for interactive React bindings. It goes through the same library build and approval as any other.
7. **`properties[].type` is a free string today.** For TSX specs it must be a valid type expression.
8. **Skip's generation prompts** live outside this repo and were not checked for React or JavaScript assumptions.
9. **Department.** MJ core has no department concept. The Role layer is the nearest thing. If department must be its own layer, something has to define what a department is.
10. **Many widgets mean many reads.** Each widget loads its own data. A Home with a dozen widgets needs shared engines or one summary operation per app, as workstream E does for Tasks and Planning.
11. **Converting code dashboards is large.** This plan sets the default for new work and converts Home. Everything else converts when it is next touched.

## 13. References

- Unified UI plan: [UNIFIED_PLAN.md](UNIFIED_PLAN.md) (#6503). Lego: [README.md](README.md) (#5911), [WAVE_0_SPEC.md](WAVE_0_SPEC.md) (#6674), prototype #6673
- Spec and roles: `packages/InteractiveComponents/src/component-spec.ts`, `packages/InteractiveComponents/src/runtime-types.ts`
- Runtime: `packages/React/runtime/src/compiler/component-compiler.ts`, `packages/React/runtime/src/utilities/core-libraries.ts`, `packages/React/runtime/src/utilities/user-state.ts`
- Angular host: `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts`; dashboard part: `packages/Angular/Generic/dashboard-viewer/src/lib/parts/component-part.component.ts`
- Mobile: `packages/MobileApp/src/interactive/`
- Dashboards and layering: `packages/Angular/Generic/dashboard-viewer/`, `packages/MJCoreEntities/src/engines/dashboards.ts`, `packages/MJCoreEntities/src/engines/interactive-forms.ts` (Global, Role and User scopes)
- Linter and harness: `packages/React/linter`, `packages/React/test-harness`; #6362
- Related open PRs: #5257 (sandboxed component host), #6179 (mobile v1), #5903 and #5916 (MJ Elements), #6786 (run consent), #6181 (signals and compositions)
