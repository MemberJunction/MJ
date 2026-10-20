# Phase 0 findings: what collides when MJ elements share a page

Measurements from `index.html` (see README.md) with the two MJ-resident elements built from `next`-based branch
`docs/lego-ui-foundation` at `d3903777ba` on 2026-10-19, in Chrome 155 on macOS (prefers-color-scheme: dark, so the
page's shared tokens resolved to their dark values). Every "observed" cell below was read from a saved report or from
`measure.mjs`; nothing is estimated. The three Open App elements are not in this repo, so their rows say what is
needed to fill them.

The host under test is the page's element stage: Georgia, its own text color (`--mj-status-info-text`, computed
`rgb(219, 234, 254)` in dark), `button { color; background; border: 2px dashed }` all `!important` (computed
background `rgba(59, 130, 246, 0.15)`), `.mjw-btn { letter-spacing: .3em }`, and `--mj-brand-primary: #00aa00` as a
sentinel. Earlier runs used the hotpink and yellow of `examples/two-widgets.html`; the readings were the same shape
with those values (background `rgb(255, 105, 180)`, border dashed), and the palette was changed for legibility only.

Runs cited (query string on `http://localhost:8099/`):

| Run | Query | What it varies |
|---|---|---|
| R1 | `?auto=1` | Strict nonce CSP header, support widget as published (minified names), realtime call first |
| R2 | `?auto=1&support=keepnames` | Same, support widget rebuilt with `--keep-names` |
| R3 | `?auto=1&csp=none` | No CSP header, support widget as published |
| R4 | `?auto=1&csp=none&support=keepnames` | No CSP, keep-names, realtime call first |
| R5 | `?auto=1&csp=none&support=keepnames&order=support-first` | No CSP, keep-names, support runtime loaded before the realtime call |

Step numbers are the probe's: 1 before any bundle, 2 after the realtime shell, 3 after the support entry, 4 after
mounting `<mj-support-widget>` by hand, 5 and 6 the realtime call and the support runtime chunk (swapped in R5), 7
and 8 the color-scheme toggles, 9 final.

## 1. Sizes (Phase 0 item 2)

From `node measure.mjs` (esbuild metafiles; shares are of raw minified bytes, Font Awesome includes the inlined woff2).

| Element | Files | Entry, raw / gzip | On demand, raw / gzip | Total, raw / gzip | @angular/* | @memberjunction/* | zone.js | Font Awesome | own code | other third party |
|---|---|---|---|---|---|---|---|---|---|---|
| `<mj-realtime-widget>` | 219 | 25.8 KB / 8.4 KB | 16713.2 KB / 4547.7 KB | 16739.1 KB / 4556.1 KB | 3.1% (510.8 KB) | 42.7% (7150.9 KB) | 0.2% (38.8 KB) | 1.2% (206.0 KB) | 2.0% (340.7 KB) | 51.5% (8616.1 KB) |
| `<mj-support-widget>` | 14 | 21.4 KB / 6.3 KB | 4365.7 KB / 808.1 KB | 4387.1 KB / 814.4 KB | 0 | 82.4% (3615.5 KB) | 0 | 0 | 0.8% (35.8 KB) | 16.6% (729.0 KB) |
| `<mj-support-widget>` (keep-names) | 14 | 22.0 KB / 6.5 KB | 4448.5 KB / 831.7 KB | 4470.5 KB / 838.2 KB | 0 | 81.7% (3654.4 KB) | 0 | 0 | 0.8% (36.9 KB) | 17.3% (772.2 KB) |
| `<mj-form>` | needs bundle from bizapps-forms | | | | | | | | | |
| `<mj-orders-checkout>` | needs bundle from bizapps-orders | | | | | | | | | |
| `<caliber-widget>` | needs bundle from bizapps-caliber | | | | | | | | | |

What a page actually downloads (R1, from `performance` resource entries; serve.mjs sends files uncompressed, gzip
computed from the same files):

| Point | Files | Raw | Gzip |
|---|---|---|---|
| Realtime shell alone | 1 | 26 KB | 8 KB |
| Realtime shell plus the session module that instance B's `preload="eager"` fetched at upgrade | 2 | 4561 KB | 1233 KB |
| Support entry plus its two immediate chunks | 3 | 23 KB | 7 KB |
| Everything the realtime call fetched to reach its error view (consent accepted, connect failed) | 17 | 11221 KB | 2749 KB |
| Everything the support widget fetched once its runtime chunk was imported | 9 | 3900 KB | 717 KB |
| Whole page at the end | 26 | 15120 KB | 3465 KB |

The plan's §2 numbers were "call 2.5 MB gz" and "about 2.9 MB minified" for the support widget. Measured: the realtime
call is 2.7 MB gzip to the first screen, out of 4.5 MB gzip in the folder; the support widget is 4.4 MB minified in the
folder, 3.9 MB of it fetched for a text session.

Where the largest realtime bytes go (raw): MJCoreEntities 2646 KB, ag-grid-community 1096 KB, mermaid 1027 KB,
exceljs 934 KB, ng-conversations 806 KB, ng-base-forms 626 KB, @codemirror/legacy-modes 475 KB, cytoscape 457 KB.
Support: MJCoreEntities 2616 KB, MJCore 414 KB, @google/genai 355 KB, GraphQLDataProvider 227 KB.

Packages both MJ elements carry (bytes the page downloads twice, raw):

| Package | In realtime | In support | Duplicated |
|---|---|---|---|
| MJCoreEntities | 2645.6 KB | 2616.2 KB | 2616.2 KB |
| MJCore | 455.8 KB | 413.6 KB | 413.6 KB |
| @google/genai | 377.5 KB | 355.3 KB | 355.3 KB |
| GraphQLDataProvider | 227.5 KB | 226.5 KB | 226.5 KB |
| acorn | 118.2 KB | 116.8 KB | 116.8 KB |
| AI/RealtimeClient | 133.1 KB | 114.7 KB | 114.7 KB |
| lodash | 80.5 KB | 71.5 KB | 71.5 KB |
| zod | 60.4 KB | 58.3 KB | 58.3 KB |
| MJGlobal | 62.8 KB | 51.2 KB | 51.2 KB |
| AI/BaseAIEngine | 50.7 KB | 48.9 KB | 48.9 KB |
| graphql, SQLDialect, AI/CorePlus, AI/Core, rxjs and 12 more | | | 207.3 KB |
| **Total duplicated across the two** | | | **4306.1 KB raw** (`sizes.json`, `overlap`) |

MJCoreEntities alone is 60% of the support bundle and 16% of the realtime bundle. It is the single largest thing a
shared runtime would dedupe.

## 2. Checks

Columns: what the plan expected, what was observed, which elements, where to see it.

### Singletons (`BaseSingleton` stores every instance on `window` as `___SINGLETON__<class name>`)

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Entry scripts touch MJ core | Unknown | No. After both entries load there are 0 `___SINGLETON__` keys. Keys appear only when the realtime call code runs (after the consent notice is accepted) or the support widget's `runtime-widget-transport` chunk is imported. | both | R1 to R5, steps 2 to 4 |
| Keys the realtime call creates | MJ core singletons | `MJGlobal`, `StartupManager`, `UserInfoEngine`. `MJGlobal.ClassFactory` holds 505 registrations. | realtime | R1 step 5; R4 step 5 |
| Keys the published support bundle creates | §2.1: minified names collide | Two keys with minified names: `zi` and `a` (the keep-names build shows these are `MJGlobal` and `StartupManager`). So as published, the two MJ bundles never share a key: two `MJGlobal` objects, two `ClassFactory` registries, two copies of `BaseSingleton` on the page. `window.___SINGLETON__MJGlobal instanceof <support's BaseSingleton>` is false. No collision inside the support bundle itself: the keep-names build creates the same two keys, so nothing was renamed onto another. | support, realtime | R1 step 6 (`instanceof` matrix `[true, false]`, `baseSingletonCopies: 2`); R5 step 5 for the names |
| Keep-names support bundle loaded after the realtime call | §2.1: the second bundle's `getInstance()` returns the first bundle's object | Confirmed. No new key, `MJGlobal` identity unchanged, and the support bundle's 472 `@RegisterClass` registrations landed in the realtime bundle's `ClassFactory`: 505 before, 977 after. Four base classes are now registered under two different class objects in one registry: `BaseEntity`, `BaseRemotableOperation`, `PermissionProviderBase`, `BasePriceUnitType`. | both | R2 step 6; R4 step 6 (registry counts) |
| Keep-names, support runtime first | Same, the other way round | Confirmed. The support bundle creates `MJGlobal` (472 registrations) and `StartupManager`; the realtime call then reuses that `MJGlobal` (977 registrations, the same four doubled base classes) but creates `UserInfoEngine` from its own copy of `BaseSingleton`, so two copies coexist and the shared `MJGlobal` is `instanceof` the support copy only (`[true, false]`). | both | R5 steps 5 and 6 |
| Consequence of the doubled registry | | Not observed as a failure here, because neither element got past its first network call. Inferred from `ClassFactory`'s rule that the last registration auto-wins: once both bundles share a registry, the first bundle's `GetEntityObject` returns the second bundle's entity class, whose `BaseEntity` is the other copy. The Caliber incident in §2.1 (`Oo.Instance.Initialize is not a function`) is the single-bundle form of this. | both | inferred, not verified |

### zone.js

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Who installs `window.Zone`, and when | Realtime defers it to the call; support has none | `window.Zone` is absent after both entries. It is set once, by `loadZone` in `mj-realtime-widget-session.js`, after the consent notice is accepted (step 5 in R1 to R4, step 6 in R5). The support bundle contains no zone.js (0 bytes in its metafile); the realtime bundle carries 38.8 KB of it. | realtime | all runs, `zoneFirstSeen` |
| zone.js next to a zoneless app | Phase 0 item: record it | Needs a zoneless element on the page: `<mj-form>` (bizapps-forms) or `<caliber-widget>` (bizapps-caliber). | needs bundle from bizapps-forms, bizapps-caliber | |

### Fonts

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| `@font-face` rules on the page | Realtime registers Font Awesome at document level; support none | 0 until the call code loads, then exactly one: `"Font Awesome 6 Free"` weight 900, at document level (hoisted out of the `@layer`, `src` is an inlined woff2 data URL; 206 KB of the bundle). `document.fonts` lists it as `unloaded` through the error view, which draws its icons as inline SVG. The support widget declares no `@font-face` (system-ui stack inside its shadow root). | realtime | R1 step 5 onward |
| Duplicate families | Phase 0 item: record it | None between the two MJ elements. Caliber inlines the same Font Awesome woff2 (plan D4), so one duplicate is expected once its bundle is added. | needs bundle from bizapps-caliber (and Forms for `<mjf-icon>`) | |

### Style bleed

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Host CSS into the realtime widget (light DOM, `mjw-` prefix, `@layer`) | Host wins against a layered declaration | The host's `!important` button rules apply to every realtime button the run rendered: the shell's start, consent and error views ("Try again" is the shell's own DOM; the Angular overlay never mounts before a session is prepared, see §3): computed background `rgba(59, 130, 246, 0.15)`, border `dashed`, color the host's. Host `.mjw-btn { letter-spacing: .3em }` also applies (computed 4.2px), because the shell's class name matched the host's. The shell's font follows the host's `--mj-font-family` token (Inter, from the page's token layer; `system-ui` on a page without that token), which is the layered-defaults contract working as designed. Same with and without CSP. | realtime | R1 and R3 steps 2 and 5, `realtimeA_anyButton`, `realtimeB_anyButton` |
| Host CSS into the support widget (shadow DOM, `all: initial` on `:host`) | Nothing leaks in | With no CSP: isolated. Launcher background `rgb(38, 79, 175)` (its own brand token), border none, the host element's computed font `system-ui` and color `rgb(31, 41, 51)` from its own `:host` block; the host's Georgia, text color, button background and dashed border do not reach it. With the nonce CSP: its shadow `<style>` is blocked (next section), `all: initial` never applies, and inherited host styles do reach it: host element font Georgia and the host's text color; launcher at UA defaults (`rgb(107, 107, 107)`, outset). | support | R3 step 4 vs R1 step 4 |
| Element CSS into the host | Layered defaults lose to the host's unlayered rules | No change. The host probe and host button computed styles are identical before any bundle and after everything loaded (empty diffs in all five runs), and the host's own `:root { --mj-brand-primary: #00aa00 }` still reads `#00aa00` after the realtime bundle's token layer is on the page. | both | all runs, `summary.hostProbeDiff`, `hostButtonDiff`, `hostTokenBrandPrimary` |
| Realtime `data-theme` with `theme="auto"` | Follows the page if it declares a theme, else the OS | On a page with no `data-theme`, the element set its own `data-theme="dark"` at upgrade from `prefers-color-scheme` (dark on this machine) and kept it through the page's `color-scheme` toggles. On the page as it now is, which sets `data-theme` on `<html>` like an MJ host, the element sets none and renders light or dark with the page's attribute (`ResolveDataTheme` returns null when the page declares a theme). Not measured against a light OS. | realtime | earlier runs step 2 and 7 (`dataTheme: "dark"`); final run (`dataTheme: null`); `src/lib/theme/widget-theme.ts` |

### Layout

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Parent with no definite height (Caliber's recorded `height: 100%` collapse) | The element should still have height | Realtime instance B, in an auto-height parent: 320 px tall (parent 477 to 488 px depending on the card's caption), same as instance A. The shell sizes itself. | realtime | all runs, `layout.rtB_inNoHeightParent` |
| Support widget height | | 0 px with its styles (the launcher is taken out of flow); one line box (16 to 19 px, the host's line height) when its stylesheet is blocked. | support | R3 vs R1 step 4 |
| `<caliber-widget>` in the same parent | Its smoke host gives `html, body` and the element `height: 100%`; the plan records a collapse without that | Needs bundle from bizapps-caliber. | caliber | |

### color-scheme

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Page toggles `color-scheme` on `<html>`: `light dark`, then `light`, then `dark` (Caliber's recorded repaint failure) | Record it | Each element's computed `color-scheme` follows the page (inherited). The realtime widget's palette does not follow `color-scheme` itself: it follows the page's `data-theme` when there is one (the page now toggles both together, and the widget repaints light and dark with it), and otherwise the OS preference fixed at upgrade. The support widget (unstyled, under the CSP) flips its UA button colors with the page; with its styles on, nothing visible changes. No repaint failure or error was observed in Chrome 155. | both | all runs, steps 7 and 8 |
| Caliber's failure | | Needs bundle from bizapps-caliber. | caliber | |

### CSP nonces

The server sends `script-src 'self' 'nonce-phase0page' 'wasm-unsafe-eval'; style-src 'self' 'nonce-phase0page'` (no
`'unsafe-inline'`, which a browser ignores once a nonce is listed). Instance A carries `csp-nonce="phase0page"`;
instance B carries no nonce attribute and `preload="eager"`.

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Realtime shell styles | A `<style>` carrying the nonce | No `<style>` at all: the shell used `document.adoptedStyleSheets` (1 sheet), which needs no CSP allowance. | realtime | all runs, `realtimeShellStyleElement` |
| Realtime call styles | Angular `<style>` elements with the nonce | Two `<style>` elements added to `<head>`, both with nonce `phase0page` (Angular `CSP_NONCE`). Zero CSP violations from the realtime bundle in any run. | realtime | R1 step 5 |
| Where instance B's nonce came from (`ReadCspNonce` reads the first `<mj-realtime-widget>` on the page, then any `script[nonce]`) | Phase 0 item: "the realtime widget reads it off the first widget" | B's `<link rel="modulepreload">` for the session module carries `phase0page`, which B never declared: it was read off instance A. Since one Angular application serves every realtime instance and "the first call's nonce styles it" (`session-entry.ts`), an A that declared a nonce the page's CSP does not list would take B's preload and the shared Angular styles down with it. That clash is read from the code, not provoked here. | realtime | R1 step 2 `preloadLinks`; `packages/Angular/Generic/realtime-widget/src/lib/csp-nonce.ts`, `src/session-entry.ts` |
| Support widget styles | README: `style-src 'unsafe-inline'` required | Its shadow `<style>` carries no nonce and is blocked: `style-src-elem` violation from `mj-widget.js` line 120, the sheet has no rules, the widget renders unstyled and loses its isolation (see style bleed). A host with a nonce-based `style-src` cannot style it at all, because listing a nonce disables `'unsafe-inline'`. | support | R1 and R2 step 4, `newCspViolations`, `supportShadow_styleElements` |
| Orders reads its nonce off the first `<mj-orders-checkout>` | Phase 0 item | Needs bundle from bizapps-orders. | orders | |

### Errors on a bare page

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Element whose API is unreachable | Fails inside the element | Realtime: phases `consent > booting > error`, its own error view with "Try again", an `mj-error` event, no uncaught error. Support: the loader's `BootstrapFromDocument` awaits the session mint before mounting, so the mount `<div>` stays empty and the page gets an uncaught `unhandledrejection: Failed to fetch`. | both | all runs, steps 3 and 5 |

## 3. Not measured, and why

- **The realtime call stops before the Angular overlay renders.** With `api-url` pointing at a closed port, the call
  module loads, the Angular application is created and its global-styles component mounts (that is what puts the
  token layer, the `@font-face` and the two nonce-carrying `<style>` elements on the page), then `prepareSession()`
  fails on the widget-key POST and the shell draws its own error view. So every row above is a load-time
  observation: module evaluation, singletons, zone.js, the style layer, nonces, bleed into the shell's views. Bleed
  into the overlay's templates, icon glyph rendering (the font stayed `unloaded`), the media stack and the channels
  need a reachable MJAPI with a realtime widget key; the page takes `api-url` and `widget-key` for that run. The
  support widget likewise never gets past its session mint, so its chat panel and transport initialization are
  unmeasured.

- `<mj-form>`, `<mj-orders-checkout>`, `<caliber-widget>`: no bundle in this repo. README.md has the clone and build
  commands and the `sync-bundles.mjs` env vars. The page already carries their tags.
- Two Angular runtimes of different versions on one page (§2.1, "several runtimes already happen"): needs any Open
  App bundle next to the realtime call.
- The doubled-registry consequence (an entity object of the wrong copy) was inferred from `ClassFactory`'s priority
  rule, not provoked; provoking it needs a working MJAPI or a stub that lets one element reach `GetEntityObject`.
- Light OS theme: Matt's machine prefers dark, so `theme="auto"` was only observed resolving to dark.
- The realtime bundle was built with `keepNames: true` (its script requires it); the support widget was measured
  both as published (no keep-names) and with keep-names, since the plan's cross-bundle question only arises with
  names kept.
