# @memberjunction/theme-engine

## 6.2.0-edge.6

### Patch Changes

- 3b7c949: Login Studio preview fidelity: the desktop preview draws the page at 1440 x 900 and scales it to fit, the phone preview uses the live page's 50% banner, and the selected block's toolbar sits inside its outline as `mjButton` icon buttons.

## 6.2.0-edge.5

### Minor Changes

- 1cb1d52: Login Studio: design the Explorer sign-in page on the default theme.
  - **Schema:** `MJ: Themes` gains `LoginScreen` (published) and `LoginScreenDraft`. `MJThemeEntityExtended`
    refuses a design the login screen cannot draw safely (`StoredLoginDesignProblems` in
    `@memberjunction/theme-engine`, the same contract the editor checks).
  - **App:** Login Studio (`LoginStudioResource`) edits blocks, layout, background and colors, saves a draft
    and publishes it.
  - **Public route:** `GET /auth/login-screen` serves the default Active theme's published design, logos and
    seeds, sanitized (`SanitizePublicLoginScreen`) on the server and again in the browser. Drafts are never
    served to anonymous visitors; signed-in users who can read themes can read them.
  - **Login screen:** `<mj-explorer-app>` draws a published design through `<mj-login-region>` and wears the
    default theme's brand colors before sign-in. A host's `mjLoginSlot` templates still win;
    `UsePublishedLoginScreen = false` keeps the screen as the host's own inputs and CSS draw it.

### Patch Changes

- 83486cf: fix(tokens): dark-theme `--mj-status-*-text` now carries a status signal (#4564)

  In `[data-theme="dark"]` all four `--mj-status-*-text` tokens resolved to the **100** step of their ramp, a near-white tint within 1.00 to 1.12:1 of `--mj-text-primary`. Anything whose only status affordance was `color: var(--mj-status-*-text)` was legible but indistinguishable from body text in dark theme.
  - **Dark `-text` tokens move to the 300 step.** 300 reads as its hue and clears WCAG AA on every resting dark surface (page, surface, card, elevated), including on the matching 15% `-bg` tint (lowest measured: info at 4.92:1 over elevated). The 400 step separates further from body text but fails AA for error and info on elevated surfaces, so 300 is the deepest step that holds across the resting surfaces. See the known limitation below for the hover and active surfaces. Light theme is unchanged.
  - **The info ramp gains its missing `200`, `300` and `400` steps.** `--mj-color-info-*` only defined 50, 100, 500, 600 and 700, so `var(--mj-color-info-300)` would have been invalid and fallen back to the inherited body color. The Integration overview's refresh and sync button hover borders, which referenced the undefined `--mj-color-info-200`, now use the theme-aware `--mj-status-info-border` instead of a primitive.
  - **Visible side effect:** the `mjButton` danger, success and warning variants (and about 17 bespoke buttons) use `--mj-status-*-text` as their hover background. In dark theme their hover now lifts to a lighter tint of the button's own hue instead of flashing to near-white. The label is `--mj-text-inverse` (neutral-900 in dark), so it stays well above AA either way.
  - **`ThemeEngine` follows.** `derive.ts` held a hardcoded parallel copy of the dark `-text` values at the old 100 step. The runtime overlay never emits semantic tokens, so branded orgs already got the fix from the stylesheet, but ThemeStudio reads `derived.tokens.dark` for its previews and would have shown the old near-white values next to an app rendering the 300 step.
  - **Known limitation:** on a hovered row (`--mj-bg-surface-hover`, neutral-600) status text on its own tint drops below AA for warning (4.37), error (3.81) and info (3.78), where the 100 step passed. Plain status text with no tint, for example a red "Deny" cell or a blue status word in a hovered grid row, also drops below AA there for error (3.99) and info (4.20). On `--mj-bg-surface-active` (neutral-500) both steps fail. The tint and border still carry the status where there is one, and the root cause is how light those two dark surfaces are, which is a separate change.

## 6.2.0-edge.4

## 6.2.0-edge.3

## 6.2.0-edge.2

## 6.2.0-edge.1

### Patch Changes

- 80905a1: Rename public class members and exported functions to PascalCase, per MJ's naming convention,
  **without breaking a single consumer**.

  Every renamed symbol keeps its old name beside the new one as a `@deprecated` stub that forwards to
  it — a delegating method or function, a getter/setter pair for a property, and for Angular a
  readable accessor pair for an `@Input` and a second `@Output` sharing the same `EventEmitter`, so a
  template still binding the old name keeps receiving events. Old names still compile, still resolve,
  and still behave identically; the deprecation tag rides through to the published `.d.ts`, so editors
  point callers at the replacement. Where a package re-exports through an explicit `export { … }`
  list, the new name is added alongside the old, so the correct name is actually on the public surface
  rather than merely declared.

  The rename is deliberately refused wherever a mechanical stub would not be equivalent, because
  several of those shapes change a type contract while still compiling in the package that declares
  them:
  - an **optional** property or parameter property — TypeScript has no optional accessor, so a stub
    would promote `foo?` to a required member and break every object literal that omits it;
  - a class that is a **data shape** (no methods, or `@ObjectType`/`@InputType`) — object literals are
    assigned to it, and an accessor stub changes what they must supply;
  - a property whose **subclass redeclares it**, since TypeScript forbids a property overriding an
    accessor (TS2610);
  - a name whose PascalCase form is **already bound** in that file or class;
  - decorated members, `get`/`set` pairs behind a decorator, generators, destructured parameters,
    overload sets and abstract members.

  **One wire-visible consequence, for version skew only.** `BaseInfo.toJSON` walks `_`-prefixed
  backing fields and emits them through their public getter, preferring the PascalCase one. Renaming
  the 23 field aliases in `MJCore/src/generic` therefore changes what `AllMetadata` carries:
  `EntityInfo.spCreate` and friends now serialize as `SpCreate`. A same-version client is unaffected —
  `copyInitData` accepts a value through a settable accessor, so either spelling lands on the right
  field. An OLDER client against a newer server has no such path in its `copyInitData` and drops those
  fields silently. Same-version deployments, which is the supported configuration, see no change.

  Each package was verified against its own pre-change baseline rather than against zero, because
  several packages in this repo do not typecheck cleanly to begin with. Angular packages were verified
  with `ngc`, not `tsc`: a plain typecheck does not compile templates, and an earlier write-only
  `@Input` alias passed `tsc` while breaking six template reads.

## 6.2.0-edge.0

## 6.1.0

## 6.1.0-edge.7

## 6.1.0-edge.6

## 6.1.0-edge.5

## 6.1.0-edge.4

## 6.1.0-edge.3

## 6.1.0-edge.2

## 6.1.0-edge.1

## 6.1.0-edge.0

## 6.0.0

## 5.51.0

## 5.50.0

## 5.49.0
