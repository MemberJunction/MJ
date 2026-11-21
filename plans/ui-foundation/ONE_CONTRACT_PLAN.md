# One Contract Plan: Lego, ComponentSpec and widgets on every surface

Proposed 2026-11-21 (Amith). Status: proposal for review. Nothing here is decided.

This plan extends [UNIFIED_PLAN.md](UNIFIED_PLAN.md) and proposes amendments to the Lego plan ([README.md](README.md)). Section 10 lists each amendment. This PR does not edit those files; Matt and Colin own them.

## 1. Summary

MJ has two component worlds that do not share parts. Compiled Angular components are typed and build-checked, and render only in Explorer. Runtime React components (`ComponentSpec`, built for Skip) change without a build and already render on mobile, but they are untyped JavaScript loaded against React 18.2 from public CDNs. Lego is about to add a third vocabulary that only Angular can use.

This plan makes them one system:

1. **One contract** describes every Lego primitive: its inputs, parts, exposed values and events. The contract is the source. Angular, React and React Native bindings are checked against it, and so is the CSS.
2. **Lego's styling ships as plain CSS** (already Lego decision D1). Any host that can load a stylesheet gets the same look.
3. **AI-generated components become typed TSX.** A real TypeScript check runs on the server against types generated from the spec and the contract. Existing JSX components keep working unchanged.
4. **The ComponentSpec runtime moves to current React** and stops depending on libraries publishing UMD files.
5. **Widgets get a contract.** `componentRole: 'widget'` is already reserved in the spec. One widget definition runs on Home, in any dashboard and on mobile.

Every claim the system makes about itself is enforced by a deterministic gate (section 5), in line with principle 9 of the unified plan.

### What each person is asked for

| Who | Why you | The ask |
|---|---|---|
| Matt | You own the Lego contract, catalog and names (D11) | Agree that the contract is authored first and Angular is its first binding, before wave 1 starts. Review sections 3 to 5 and 10. |
| Colin | You own Home and build the catalog generator | Review the generator direction (section 4, P1) and the Home widget board (workstream D). |
| Jordan | You moved Skip's stage-audit fixes into the linter and harness (#6362) | Review workstream C. The type-check replaces the rule families that produced those false positives. |
| Caeleb | You built first-class dashboards (#4982) and the run-consent gate (#6786) | Review workstream D: the Component part as widget host, and trust at render. |
| Robert | You asked for dashboards on Home and review the when-to-use guidance | Review the widget vocabulary and section 9. |
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

**Naming.** No new layer number. The UI Layering Guide's L0 to L3 govern data access and navigation and are enforced by name (`widgets`, `surface`, `shell`) across 99 packages. Lego has its own stack: foundation, primitives, compositions, app. This plan widens Lego's foundation to include the primitives CSS and the contract, and adds bindings beside the Angular one.

## 4. Proposed decisions

| # | Proposal | Why |
|---|---|---|
| P1 | The contract (`components.json`) is authored, and Angular is checked against it. The generator's direction reverses, and the catalog moves from phase 3 to before wave 1. | One source for three bindings and for the AI's types. |
| P2 | The primitives CSS and the token CSS are published as plain files any host can load. | Already implied by D1 and the wave 0 spec §9. Makes it a stated contract. |
| P3 | Behaviour stays per host, on a shared contract (rule 3 above). | Rewriting CDK behaviour in vanilla JS is a large cost for little widget value. |
| P4 | The React binding is plain typed components that render the same markup and classes. It does not use custom elements. | Inside Explorer, element tags equal the Angular selectors and would double-render; each Elements bundle carries its own Angular; React 18 passes only strings to custom elements; React Native renders an unknown tag as a bare view. |
| P5 | React Native bindings cover the widget vocabulary only (about ten primitives). | React Native cannot consume CSS, so each primitive needs a native version. Keep the set small. |
| P6 | A spec declares its language. New specs are TSX. Existing JSX specs are untouched. The type-check runs on the server; the browser only strips types. No build step is needed to render. | Measured: all 117 shipped components compile to identical output with the TypeScript preset on (section 6). |
| P7 | Each host supplies its own React 19. MJ builds one script-loadable file per approved library version from npm and serves it from its own origin. The global-variable shape stays. | Removes the dependency on upstream UMD files and public CDNs without changing the loader or any spec. #5257 already recommends mirroring libraries (its D2). |
| P8 | `componentRole: 'widget'` gets a typed host contract, following `form-panel`: size class, placement ID, host context, standard events and methods, and an optional settings schema. A widget may be a TSX spec or a compiled class. | `FormPanelHostProps` and `InteractiveFormsEngine` already run this compiled-or-runtime hybrid. |
| P9 | On the web, the widget host is the existing Component dashboard part. Home gets a personal widget board. Mobile gains a `component` part kind and accepts props and events. | The Component part already maps spec properties to typed inputs and events. |
| P10 | A widget host renders only Published and Approved specs whose fingerprint matches. Specs written by another user or by an agent need consent. | The fields exist; nothing reads them at render. |
| P11 | Specs gain `utilities.ops`: a typed Remote Operation invoker, limited to operations the spec declares. | Quick actions today need `GetEntityObject` and `Save`, which the mobile WebView bridge cannot proxy. |

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
- [ ] Declaration generator: props and events from `properties` and `events`, row types from `dataRequirements`, child props from dependencies, primitives from the contract
- [ ] Type-check service beside the linter, in the server action path and the test harness; diagnostics returned to the authoring agent
- [ ] Retire the type-shaped lint rules for TSX specs; keep the policy rules
- [ ] Host-provided React 19 in `ng-react`; spike antd 5 with its React 19 shim against antd 6
- [ ] Library build: one file per approved version from npm, served from MJ's origin, with an integrity hash (G10); React is the first one
- [ ] `utilities.ops` (P11)
- [ ] `FindComponent` resolves by version and filters on status

### D. Widget role and hosts (Colin for Home; Caeleb for dashboards)

- [ ] `WidgetHostProps`, event and method names, and `settingsSchema` in `@memberjunction/interactive-component-types`
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

## 8. Order of work

| Step | Work | Depends on |
|---|---|---|
| 1 | A (contract for wave 0 primitives, gates) and C (TSX, React 19, library build). These are independent of each other. | Matt's agreement on P1 |
| 2 | B wave 1 contract-first, with the React binding | Step 1 gates; the wave 0 prototype gate |
| 3 | D widget role and hosts; E Remote Operations | Step 1 (TSX) |
| 4 | E first widgets on Home and in dashboards | Steps 2 and 3 |
| 5 | F mobile | Step 3; #6179's render-mode decision |

Steps 1 and 3 can start before Lego wave 1. Only the widgets' final look waits on it.

## 9. Widget vocabulary

The first widgets need little: card, stat tile, metric, badge, icon, list row, progress ring or sparkline, empty state and button. Card, stat tile, metric, badge and icon are Lego wave 1. Row is wave 0. This is the set that gets React and React Native bindings first.

## 10. Proposed amendments to existing plans

| Document | Today | Proposed |
|---|---|---|
| UNIFIED_PLAN phase 3 | "`tokens.json` and `components.json` generated from the primitives themselves" | The contract is authored; primitives are checked against it. Moves ahead of wave 1 |
| UNIFIED_PLAN phase 2 | Wave 1 lands as Angular primitives with first conversions | Each wave 1 primitive also lands its contract entry and React binding |
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

## 12. References

- Unified UI plan: [UNIFIED_PLAN.md](UNIFIED_PLAN.md) (#6503). Lego: [README.md](README.md) (#5911), [WAVE_0_SPEC.md](WAVE_0_SPEC.md) (#6674), prototype #6673
- Spec and roles: `packages/InteractiveComponents/src/component-spec.ts`, `packages/InteractiveComponents/src/runtime-types.ts`
- Runtime: `packages/React/runtime/src/compiler/component-compiler.ts`, `packages/React/runtime/src/utilities/core-libraries.ts`, `packages/React/runtime/src/utilities/user-state.ts`
- Angular host: `packages/Angular/Generic/react/src/lib/components/mj-react-component.component.ts`; dashboard part: `packages/Angular/Generic/dashboard-viewer/src/lib/parts/component-part.component.ts`
- Mobile: `packages/MobileApp/src/interactive/`
- Linter and harness: `packages/React/linter`, `packages/React/test-harness`; #6362
- Related open PRs: #5257 (sandboxed component host), #6179 (mobile v1), #5903 and #5916 (MJ Elements), #6786 (run consent), #6181 (signals and compositions)
