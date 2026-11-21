# One Contract Plan: Lego, ComponentSpec and widgets on every surface

Proposed 2026-11-21 (Amith). Status: proposal for review. Nothing here is decided.

This plan extends [UNIFIED_PLAN.md](UNIFIED_PLAN.md) and proposes amendments to the Lego plan ([README.md](README.md)). Section 10 lists each amendment. This PR does not edit those files; Matt and Colin own them.

## 1. Summary

MJ has two component worlds that do not share parts. Compiled Angular components are typed and build-checked, and render only in Explorer. Runtime React components (`ComponentSpec`, built for Skip) change without a build and already render on mobile, but they are untyped JavaScript loaded against React 18.2 from public CDNs. Lego is about to add a third vocabulary that only Angular can use.

This plan makes them one system:

1. **One contract** describes every Lego primitive: its inputs, parts, exposed values and events. The contract is the source. Angular, React and React Native bindings are checked against it, and so is the CSS.
2. **Lego's styling ships as plain CSS** (already Lego decision D1). Any host that can load a stylesheet gets the same look.
3. **AI-generated components become typed TSX.** A real TypeScript check runs on the server against types generated from the spec and the contract. JSX stays supported with no end date and no conversion. We stop generating new JSX.
4. **The ComponentSpec runtime moves to current React** and stops depending on other people's UMD files and on public CDNs. MJ builds the script files itself. This is not a move to ES modules.
5. **Widgets get a contract.** `componentRole: 'widget'` is already reserved in the spec. A widget can be a runtime TSX spec or a compiled Angular class, and a dashboard shows either the same way. TSX widgets also run on mobile.
6. **Metadata dashboards become the default surface.** A layout is data, layered as an organization default, a role layer and the user's own changes. Home becomes one. Code-based layouts stay only where they earn it.

Every claim the system makes about itself is enforced by a deterministic gate (section 5), in line with principle 9 of the unified plan.

### What each person is asked for

| Who | Why you | The ask |
|---|---|---|
| Matt | You own the Lego contract, catalog and names (D11) | Agree that the contract is authored first and Angular is its first binding, before wave 1 starts. Review sections 3 to 5 and 10. |
| Colin | You own Home and build the catalog generator | Review the generator direction (section 4, P1), the Home widget board (workstream D) and Home as a metadata dashboard (workstream G). |
| Jordan | You moved Skip's stage-audit fixes into the linter and harness (#6362) | Review workstream C. The type-check replaces the rule families that produced those false positives. |
| Caeleb | You built first-class dashboards (#4982) and the run-consent gate (#6786) | Review workstreams D and G: the widget host, trust at render, and layered dashboard layouts. |
| Robert | You asked for dashboards on Home and review the when-to-use guidance | Review the widget vocabulary (section 9) and workstream G, which schedules your ask. |
| Madhav | Skip is the largest ComponentSpec consumer | Review workstream C for what changes in Skip's generation pipeline. |

## 2. What is wrong today

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

## 3. The design

```
Hosts        Explorer Home · Config dashboards · mobile · conversations and artifacts
             (each host mounts a role contract: form, form-panel, widget)

Components   Compiled Angular widgets and compositions
             Typed TSX ComponentSpecs (runtime, AI-authorable)

Bindings     Angular (ng-ui-components) · React (web, mobile WebView, sandbox frame) · React Native
             Thin. Each is checked against the contract.

Foundation   Tokens · primitives CSS · the contract (components.json)
             Framework-neutral. The single source.

Logic        Engines and Remote Operations. Typed TypeScript, shared by every host. Unchanged.
```

Four rules hold it together.

1. **The contract is the source.** A primitive's inputs, defaults, parts, classes, exposed values and events are written once, as data. Bindings and types follow from it. Today's plan generates the catalog from the Angular code, which makes Angular the source and every other host a guess.
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

## 4. Proposed decisions

| # | Proposal | Why |
|---|---|---|
| P1 | The contract (`components.json`) is authored, and Angular is checked against it. The generator's direction reverses, and the catalog moves from phase 3 to before wave 1. | One source for three bindings and for the AI's types. |
| P2 | The primitives CSS and the token CSS are published as plain files any host can load. | Already implied by D1 and the wave 0 spec §9. Makes it a stated contract. |
| P3 | Behaviour stays per host, on a shared contract (rule 3 above). | Rewriting CDK behaviour in vanilla JS is a large cost for little widget value. |
| P4 | The React binding is plain typed components that render the same markup and classes. It does not use custom elements. | Inside Explorer, element tags equal the Angular selectors and would double-render; each Elements bundle carries its own Angular; React 18 passes only strings to custom elements; React Native renders an unknown tag as a bare view. |
| P5 | React Native bindings cover the widget vocabulary only (about ten primitives). | React Native cannot consume CSS, so each primitive needs a native version. Keep the set small. |
| P6 | New specs are generated as TSX only; Skip and other generators stop emitting JSX. JSX specs stay supported with no end date and are not converted. A spec declares its language. The type-check runs on the server; the browser only strips types. No build step is needed to render. | Measured: all 117 shipped components compile to identical output with the TypeScript preset on (section 6). |
| P7 | Each host supplies its own React 19. MJ builds one script-loadable file per approved library version from npm and serves it from its own origin. The loader still loads script-tag globals. This is not a move to ES modules. | Removes the dependency on other people's UMD files and on public CDNs without changing the loader or any spec. #5257 already recommends mirroring libraries (its D2). |
| P8 | `componentRole: 'widget'` gets a typed host contract, following `form-panel`: size class, placement ID, host context, standard events and methods, and an optional settings schema. A widget may be a TSX spec or a compiled class. | `FormPanelHostProps` and `InteractiveFormsEngine` already run this compiled-or-runtime hybrid. |
| P9 | On the web, the widget host is the existing Component dashboard part. Home gets a personal widget board. Mobile gains a `component` part kind and accepts props and events. | The Component part already maps spec properties to typed inputs and events. |
| P10 | A widget host renders only Published and Approved specs whose fingerprint matches. Specs written by another user or by an agent need consent. | The fields exist; nothing reads them at render. |
| P11 | Specs gain `utilities.ops`: a typed Remote Operation invoker, limited to operations the spec declares. | Quick actions today need `GetEntityObject` and `Save`, which the mobile WebView bridge cannot proxy. |
| P12 | The runtime hands the React Lego binding to every spec as typed building blocks. Skip generates against them. | A spec can only compose other specs today, and the registry is keyed by spec content hash, so a host cannot inject a component by name. |
| P13 | The widget host mounts either implementation of the role: a spec, or a compiled Angular class resolved through ClassFactory. Compiled Angular widgets are web-only. | `InteractiveFormsEngine` already does this for form panels. Existing Angular widgets, such as the Tasks approval inbox, can ship on the web at once. |
| P14 | Metadata dashboards are the default surface for new work. A layout resolves through three layers, User over Role over Global. Home becomes a metadata dashboard whose default layout reproduces today's Home. | Home and app landing pages become configurable per organization, role and user without code. `MJ: Entity Form Overrides` already scopes by Global, Role and User, so the model is not new. |

## 5. Deterministic gates

Each gate is a pure check with no model and no network. The same inputs always give the same result.

| Gate | What it proves | How | Run in the spike |
|---|---|---|---|
| G1 | The contract is well formed | JSON Schema validation of the contract file | No |
| G2 | Generated files match the contract | Regenerate in CI; any diff fails. Output is a pure function of the contract: sorted keys, no clock | Yes |
| G3 | The Angular binding matches the contract | Read the component with the TypeScript parser; compare input names, types, defaults, part classes and built-in axis values | Yes, on #6673's `mj-surface` |
| G4 | The React and React Native bindings match the contract | The compiler. Each binding is typed against the generated props and must destructure every one, so a new contract input fails to compile until the binding handles it | Yes (React) |
| G5 | The CSS matches the contract | Parse the stylesheet; every class and every public custom property must be one the contract declares, and every declared class must exist | Yes, on #6673's stylesheet |
| G6 | Bindings render the same DOM | Fixtures derived from the contract (each axis value by each state) rendered through each web binding; class lists and ARIA must equal the contract's expected output | Yes (React); Angular runs in Matt's Playwright gate |
| G7 | The contract only grows within an era | Diff against the last released contract; removals, renames and narrowed types fail | No |
| G8 | A TSX spec is type-correct | TypeScript check against declarations generated from the spec and the contract. The contract hash is stamped on the checked spec | Yes |
| G9 | Existing JSX specs are unaffected | Compile every shipped component with and without the TypeScript preset; output must be identical | Yes |
| G10 | A library file is what was approved | Built from a pinned npm version; integrity hash stored on the library row and checked on load | No |
| G11 | A layout is valid | Every placement names a widget that exists, and its configured values satisfy that widget's declared properties. Checked on save, and in CI for shipped layouts | No |

**What the gates cannot prove.**

- React Native visual parity. There is no DOM to compare. Prop types and token use are checked; appearance is reviewed from screenshots.
- Behaviour parity (focus order, dismiss rules). This needs interaction tests per host.
- Filter strings. SQL inside a string is still a string.

## 6. What the spike proved

The scripts are in [`one-contract-spike/`](one-contract-spike/README.md). Everything below was run on 2026-11-21.

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

Not proven: antd on React 19, the library build, the mobile native renderer with the TypeScript preset, and any of this wired into MJ.

## 7. Workstreams

Owners are proposals for Amith, Matt and Colin to confirm.

### A. Contract and gates

- [ ] Contract shape and its JSON Schema (Matt owns the shape; Colin builds the generator, as in phase 3 today)
- [ ] Generator: contract to Angular checks, React and React Native prop types, and the AI declaration file
- [ ] Gates G1 to G7 in CI, replacing the planned unknown-component check
- [ ] Contract entries for `surface`, `layer` and `row`, checked against the wave 0 prototype

### B. Lego (Matt)

- [ ] Wave 1 (badge, metric, card, stat tile, icon) authored contract-first: contract entry, CSS, Angular binding and React binding in the same PR
- [ ] Publish `tokens.css` and `primitives.css` as loadable files (wave 0 spec §9)
- [ ] One token source feeding CSS, a TypeScript map and the mobile theme, replacing the hand-kept copies in `packages/MobileApp/src/theme/tokens.ts` and `packages/Web/RealtimeWidget/src/ui/tokens.ts`

### C. ComponentSpec runtime (owner needed; Jordan and Madhav for Skip)

- [ ] Spec `language` field; TypeScript preset in the web, WebView and mobile native compile paths
- [ ] Generators emit TSX only. JSX specs stay supported with no end date and are not converted (P6)
- [ ] The runtime hands the React Lego binding to every spec (P12). Grids and charts stay on their current libraries for now; Lego wave 1 has neither
- [ ] Declaration generator: props and events from `properties` and `events`, row types from `dataRequirements`, child props from dependencies, primitives from the contract
- [ ] Type-check service beside the linter, in the server action path and the test harness; diagnostics returned to the authoring agent
- [ ] Retire the type-shaped lint rules for TSX specs; keep the policy rules
- [ ] Host-provided React 19 in `ng-react`; spike antd 5 with its React 19 shim against antd 6
- [ ] Library build: one file per approved version from npm, served from MJ's origin, with an integrity hash (G10); React is the first one
- [ ] `utilities.ops` (P11)
- [ ] `FindComponent` resolves by version and filters on status

### D. Widget role and hosts (Colin for Home; Caeleb for dashboards)

- [ ] `WidgetHostProps`, event and method names, and `settingsSchema` in `@memberjunction/interactive-component-types`
- [ ] The host mounts either implementation of the role: a spec through the Component part, or a compiled Angular class through ClassFactory (P13)
- [ ] Per-placement settings: the host passes `UserStateScope` as namespace, name and placement ID. Author configuration stays on the panel; user preferences stay in user settings
- [ ] Approval and consent gate in the widget host (P10)
- [ ] Home widget board: a grid with size presets, saved per user
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

### G. Metadata dashboards as the default surface (Colin for Home; Caeleb for dashboards)

This schedules the unified plan's unscheduled item "Homepage as information, not navigation" (Robert's ask). It needs a design pass before it is sized.

- [ ] Layered layouts: a layout is scoped Global, Role or User and resolves User over Role over Global, following `MJ: Entity Form Overrides` and `InteractiveFormsEngine`. A user's changes are stored as their own layer, with reset to default
- [ ] Personal arrangement of a shared dashboard. Today a metadata dashboard has one layout, owned by its creator
- [ ] A card-grid layout mode with size presets, beside Golden Layout, for Home and widget-dense dashboards
- [ ] Parts receive host context: application, dashboard, placement and size. Hosts set the viewer's `Properties` input, which nothing sets today
- [ ] Home becomes a metadata dashboard. Its default layout reproduces today's Home (greeting, pins, applications, quick access) as widgets, so nothing changes until someone edits it. The Home chips from phase 1 become one of those widgets
- [ ] Code dashboards: wrap existing sections as compiled widgets first; convert them when they are next touched. Write down what stays code
- [ ] Who may edit the Global and Role layers, and whether a layer can lock a widget in place
- [ ] The agent studio tools and the Dashboards Expert assistant can place widgets
- [ ] Gate G11

## 8. Order of work

| Step | Work | Depends on |
|---|---|---|
| 1 | A (contract for wave 0 primitives, gates) and C (TSX, React 19, library build). These are independent of each other. | Matt's agreement on P1 |
| 2 | B wave 1 contract-first, with the React binding | Step 1 gates; the wave 0 prototype gate |
| 3 | D widget role and hosts; E Remote Operations | Step 1 (TSX) |
| 4 | E first widgets on Home and in dashboards | Steps 2 and 3 |
| 5 | G metadata dashboards as the default; Home converts | Steps 3 and 4 |
| 6 | F mobile | Step 3; #6179's render-mode decision |

Steps 1 and 3 can start before Lego wave 1. Only the widgets' final look waits on it. Steps 5 and 6 do not depend on each other.

## 9. Widget vocabulary

The first widgets need little: card, stat tile, metric, badge, icon, list row, progress ring or sparkline, empty state and button. Card, stat tile, metric, badge and icon are Lego wave 1. Row is wave 0. This is the set that gets React and React Native bindings first.

## 10. Proposed amendments to existing plans

| Document | Today | Proposed |
|---|---|---|
| UNIFIED_PLAN phase 3 | "`tokens.json` and `components.json` generated from the primitives themselves" | The contract is authored; primitives are checked against it. Moves ahead of wave 1 |
| UNIFIED_PLAN phase 2 | Wave 1 lands as Angular primitives with first conversions | Each wave 1 primitive also lands its contract entry and React binding |
| UNIFIED_PLAN "Later, or study first" | "Homepage as information, not navigation: Metadata dashboards on Home; Robert's ask" is unscheduled | Scheduled here as workstream G. The phase 1 Home chips ship as planned and become a widget on the Home dashboard |
| Lego README §4 | "The boring half ... comes from Angular CDK" | True for the Angular binding. Other bindings use their host's equivalent on the same behaviour contract |
| Lego README §4, "The four layers" | Foundation is tokens, scales and the layer service on CDK | Foundation is tokens, primitives CSS and the contract. The layer service is part of the Angular binding |
| Lego README §8 and §10 | "No sandbox tier, on purpose" | Unchanged for Open Apps. The frame proposed in #5257 for agent-written components loads the same CSS and React binding, so what runs inside it still inherits the kit |
| #5257 | Precompile on publish in its last phase | Precompiled output is an optional cache; in-browser compile stays the baseline. Trust rules (its D5 and D7) are needed by P10 |
| #6179 | WebView bundles the runtime with React 18.2 | Bundle React 19; add the `component` part kind and host props |
| #5903 (MJ Elements) | Base layer is "Angular once, the tokens and base component styles" | No change. The published CSS files are that base layer |

## 11. Risks and open questions

1. **Three bindings can drift.** G3 to G6 exist for this. React Native is the weakest (section 5).
2. **Contract-first adds work to wave 1.** Each primitive lands more files per PR. The contract entries for wave 0 should be written first to size it.
3. **antd.** The shared DataGrid depends on antd 5.20.2, which officially supports React 16 to 18. Whether antd 6 still ships a script-loadable build is unconfirmed.
4. **Library build location.** At MJ release for the core set, in the component registry as a service, or a CLI step for libraries a customer adds. Undecided.
5. **Libraries that do not flatten to one file.** Mapbox's workers are the likely hard case.
6. **Mobile render mode.** #6179 leans to WebView-only in production. If that holds, React Native bindings pay off only for native screens and dual mode.
7. **`properties[].type` is a free string today.** For TSX specs it must be a valid type expression.
8. **Skip's generation prompts** live outside this repo and were not checked for React or JavaScript assumptions.
9. **Department.** MJ core has no department concept. The Role layer is the nearest thing. If department must be its own layer, something has to define what a department is.
10. **Many widgets mean many reads.** Each widget loads its own data. A Home with a dozen widgets needs shared engines or one summary operation per app, as workstream E does for Tasks and Planning.
11. **Converting code dashboards is large.** This plan sets the default for new work and converts Home. Everything else converts when it is next touched.

## 12. References

- Unified UI plan: [UNIFIED_PLAN.md](UNIFIED_PLAN.md) (#6503). Lego: [README.md](README.md) (#5911), [WAVE_0_SPEC.md](WAVE_0_SPEC.md) (#6674), prototype #6673
- Spec and roles: `packages/InteractiveComponents/src/component-spec.ts`, `packages/InteractiveComponents/src/runtime-types.ts`
- Runtime: `packages/React/runtime/src/compiler/component-compiler.ts`, `packages/React/runtime/src/utilities/core-libraries.ts`, `packages/React/runtime/src/utilities/user-state.ts`
- Angular host: `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts`; dashboard part: `packages/Angular/Generic/dashboard-viewer/src/lib/parts/component-part.component.ts`
- Mobile: `packages/MobileApp/src/interactive/`
- Dashboards and layering: `packages/Angular/Generic/dashboard-viewer/`, `packages/MJCoreEntities/src/engines/dashboards.ts`, `packages/MJCoreEntities/src/engines/interactive-forms.ts` (Global, Role and User scopes)
- Linter and harness: `packages/React/linter`, `packages/React/test-harness`; #6362
- Related open PRs: #5257 (sandboxed component host), #6179 (mobile v1), #5903 and #5916 (MJ Elements), #6786 (run consent), #6181 (signals and compositions)
