# Phase 0 findings: what collides when MJ elements share a page

Measurements from `index.html` (see README.md) on 2026-10-19, in Chrome 155 on macOS (prefers-color-scheme: dark,
so the page's shared tokens resolved to their dark values). The two MJ-resident elements were built from this repo
at `d3903777ba` (MJ 6.2.0-edge.4); the three Open App elements from fresh clones of bizapps-forms `d665fce3`,
bizapps-orders `514d09bf` and bizapps-caliber `0dbb43a7`, which take `@memberjunction/*` from npm at 6.1.x. Every
"observed" cell below was read from a saved report or from `measure.mjs`; nothing is estimated.

The host under test is the page's element stage: Georgia, its own text color (`--mj-status-info-text`, computed
`rgb(219, 234, 254)` in dark), `button { color; background; border: 2px dashed }` all `!important` (computed
background `rgba(59, 130, 246, 0.15)`), `.mjw-btn { letter-spacing: .3em }`, and `--mj-brand-primary: #00aa00` as a
sentinel. Earlier runs used the hotpink and yellow of `examples/two-widgets.html`; the readings were the same shape
with those values (background `rgb(255, 105, 180)`, border dashed), and the palette was changed for legibility only.

Runs cited (query string on `http://localhost:8099/`):

| Run | Elements | Query | What it varies |
|---|---|---|---|
| R1 | 2 MJ | `?auto=1` | Strict nonce CSP header, support widget as published (minified names), realtime call first |
| R2 | 2 MJ | `?auto=1&support=keepnames` | Same, support widget rebuilt with `--keep-names` |
| R3 | 2 MJ | `?auto=1&csp=none` | No CSP header, support widget as published |
| R4 | 2 MJ | `?auto=1&csp=none&support=keepnames` | No CSP, keep-names, realtime call first |
| R5 | 2 MJ | `?auto=1&csp=none&support=keepnames&order=support-first` | No CSP, keep-names, support runtime loaded before the realtime call |
| R6 | all 5 | `?auto=1` | Strict nonce CSP, support as published, Open App bundles present |
| R7 | all 5 | `?auto=1&csp=none` | No CSP, all five |

Step numbers are the probe's. Two-element runs: 1 before any bundle, 2 after the realtime shell, 3 after the support
entry, 4 after mounting `<mj-support-widget>` by hand, 5 and 6 the realtime call and the support runtime chunk
(swapped in R5), 7 and 8 the color-scheme toggles, 9 final. Five-element runs insert the Open App entries: 4 Forms,
5 Orders, 6 Caliber, 7 the support mount, 8 the call, 9 the support runtime, 10 and 11 the toggles, 12 final.

## 1. Sizes (Phase 0 item 2)

From `node measure.mjs` (esbuild metafiles; shares are of raw minified bytes, Font Awesome includes the inlined woff2;
Orders is not minified, so its raw number is not comparable with the others).

| Element | Files | Entry, raw / gzip | On demand, raw / gzip | Total, raw / gzip | @angular/* | @memberjunction/* | zone.js | Font Awesome | own code | other third party |
|---|---|---|---|---|---|---|---|---|---|---|
| `<mj-realtime-widget>` | 219 | 25.8 KB / 8.4 KB | 16713.2 KB / 4547.7 KB | 16739.1 KB / 4556.1 KB | 3.1% (510.8 KB) | 42.7% (7150.9 KB) | 0.2% (38.8 KB) | 1.2% (206.0 KB) | 2.0% (340.7 KB) | 51.5% (8616.1 KB) |
| `<mj-support-widget>` | 14 | 21.4 KB / 6.3 KB | 4365.7 KB / 808.1 KB | 4387.1 KB / 814.4 KB | 0 | 82.4% (3615.5 KB) | 0 | 0 | 0.8% (35.8 KB) | 16.6% (729.0 KB) |
| `<mj-support-widget>` (keep-names) | 14 | 22.0 KB / 6.5 KB | 4448.5 KB / 831.7 KB | 4470.5 KB / 838.2 KB | 0 | 81.7% (3654.4 KB) | 0 | 0 | 0.8% (36.9 KB) | 17.3% (772.2 KB) |
| `<mj-form>` | 1 | 621.5 KB / 180.9 KB | 0 | 621.5 KB / 180.9 KB | 55.3% (343.5 KB) | 5.3% (33.0 KB) | 0 | 0 | 25.5% (158.3 KB) | 13.9% (86.5 KB) |
| `<mj-orders-checkout>` (not minified) | 1 | 1497.8 KB / 296.9 KB | 0 | 1497.8 KB / 296.9 KB | 75.0% (1124.0 KB) | 1.6% (24.0 KB) | 6.1% (90.7 KB) | 0 | 13.4% (200.4 KB) | 3.3% (49.2 KB) |
| `<caliber-widget>` | 1 | 16318.3 KB / 4286.9 KB | 0 | 16318.3 KB / 4286.9 KB | 2.9% (474.7 KB) | 34.9% (5697.0 KB) | 0 | 1.3% (206.0 KB) | 2.6% (429.5 KB) | 59.5% (9716.1 KB) |

The plan's §2 numbers were "call 2.5 MB gz" (realtime), "about 2.9 MB minified" (support), "about 175 KB gz" (Forms),
"not measured; not minified" (Orders) and "about 15.9 MB raw, 3.7 MB brotli" (Caliber). Measured: realtime 2.7 MB
gzip to its first screen out of 4.5 MB in the folder; support 4.4 MB minified, 3.9 MB of it fetched for a text
session; Forms 181 KB gzip; Orders 297 KB gzip unminified; Caliber 4.3 MB gzip in one file with nothing on demand.

What a page actually downloads (from `performance` resource entries; serve.mjs sends files uncompressed, gzip computed
from the same files):

| Point | Run | Files | Raw | Gzip |
|---|---|---|---|---|
| Realtime shell alone | R1 | 1 | 26 KB | 8 KB |
| Realtime shell plus the session module that instance B's `preload="eager"` fetched at upgrade | R1 | 2 | 4561 KB | 1233 KB |
| Support entry plus its two immediate chunks | R1 | 3 | 23 KB | 7 KB |
| Everything the realtime call fetched to reach its error view (consent accepted, connect failed) | R1 | 17 | 11221 KB | 2749 KB |
| Everything the support widget fetched once its runtime chunk was imported | R1 | 9 | 3900 KB | 717 KB |
| Whole page, two MJ elements | R1 | 26 | 15120 KB | 3465 KB |
| **All five entries loaded, before any user action** (Caliber 16318 KB, realtime 4561 KB with B's preload, Orders 1498 KB, Forms 621 KB, support 23 KB) | R6 | 8 | 23021 KB | 6005 KB |
| After the realtime call | R6 | 23 | 29681 KB | 7521 KB |
| Whole page, all five | R6 | 29 | 33558 KB | 8230 KB |

Where the largest bytes go (raw): realtime: `@memberjunction/core-entities` 2646 KB, ag-grid-community 1096 KB,
mermaid 1027 KB, exceljs 934 KB, ng-conversations 806 KB, ng-base-forms 626 KB. Support: core-entities 2616 KB,
core 414 KB, @google/genai 355 KB, graphql-dataprovider 227 KB. Caliber: core-entities 2357 KB, mermaid 1471 KB,
ag-grid-community 1146 KB, exceljs 938 KB. Orders: @angular/core 770 KB (unminified). Forms: @angular/core 231 KB.

Packages more than one element carries (bytes the page downloads more than once, raw; workspace packages named by
their package.json name so an in-repo build and an npm build of the same package count as one):

| Package | Elements | Bytes in each | Duplicated |
|---|---|---|---|
| `@memberjunction/core-entities` | 3 | realtime 2645.6 KB; support 2616.2 KB; Caliber 2357.2 KB | 4973.4 KB |
| `ag-grid-community` | 2 | realtime 1096.2 KB; Caliber 1145.9 KB | 1096.2 KB |
| `mermaid` | 2 | realtime 1027.1 KB; Caliber 1470.6 KB | 1027.1 KB |
| `exceljs` | 2 | realtime 934.4 KB; Caliber 938.2 KB | 934.4 KB |
| `@memberjunction/core` | 3 | realtime 455.8 KB; support 413.6 KB; Caliber 374.2 KB | 787.8 KB |
| `@angular/core` | 4 | realtime 273.4 KB; Forms 230.8 KB; Orders 770.4 KB; Caliber 275.4 KB | 779.7 KB |
| `@google/genai` | 3 | realtime 377.5 KB; support 355.3 KB; Caliber 381.2 KB | 732.9 KB |
| `@codemirror/legacy-modes` | 2 | realtime 475.3 KB; Caliber 492.9 KB | 475.3 KB |
| `cytoscape` | 2 | realtime 456.9 KB; Caliber 463.8 KB | 456.9 KB |
| `xlsx` | 2 | realtime 445.3 KB; Caliber 452.1 KB | 445.3 KB |
| `@memberjunction/graphql-dataprovider` | 3 | realtime 227.5 KB; support 226.5 KB; Caliber 201.2 KB | 427.6 KB |
| `@memberjunction/ng-base-forms` | 2 | realtime 625.9 KB; Caliber 376.7 KB | 376.7 KB |
| `@memberjunction/ng-artifacts` | 2 | realtime 363.1 KB; Caliber 334.5 KB | 334.5 KB |
| `pdfjs-dist` | 2 | realtime 331.5 KB; Caliber 334.6 KB | 331.5 KB |
| `@memberjunction/ng-conversations` | 2 | realtime 805.8 KB; Caliber 312.0 KB | 312.0 KB |
| **Total duplicated across the five** | | | **19438.0 KB raw** (`sizes.json`, `overlap`) |

`@memberjunction/core-entities` alone is on the page three times. The realtime widget and Caliber are near-copies of
each other below their own code: the same MJ packages, the same grid, diagram, spreadsheet, editor and PDF libraries.

## 2. Checks

Columns: what the plan expected, what was observed, which elements, where to see it.

### Singletons (`BaseSingleton` stores every instance on `window` as `___SINGLETON__<class name>`)

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Entry scripts touch MJ core | Unknown | The realtime shell, the support entry, Forms and Orders do not: 0 `___SINGLETON__` keys after each of them. Caliber does: loading `caliber-widget.js` creates `MJGlobal`, `StartupManager` and `UserInfoEngine` at page load, with 498 `ClassFactory` registrations, before any visitor action. | all | R6 and R7 steps 2 to 6 |
| Keys the realtime call creates | MJ core singletons | On a page without Caliber: `MJGlobal`, `StartupManager`, `UserInfoEngine`, 505 registrations. On a page with Caliber: none; see the cross-version row. | realtime | R1 step 5; R4 step 5 |
| Keys the published support bundle creates | §2.1: minified names collide | Two keys with minified names: `zi` and `a` (the keep-names build shows these are `MJGlobal` and `StartupManager`; `zi` holds 472 registrations). So as published, the support bundle never shares with anyone: its own `MJGlobal`, its own `ClassFactory`, its own copy of `BaseSingleton`. `window.___SINGLETON__MJGlobal instanceof <support's BaseSingleton>` is false. No collision inside the support bundle itself: the keep-names build creates the same two keys. | support | R1 step 6, R6 step 9 (`instanceof` matrix `[true, false]`, `baseSingletonCopies: 2`); R5 step 5 for the names |
| Keep-names support bundle loaded after the realtime call | §2.1: the second bundle's `getInstance()` returns the first bundle's object | Confirmed. No new key, `MJGlobal` identity unchanged, and the support bundle's 472 registrations landed in the realtime bundle's `ClassFactory`: 505 before, 977 after. Four base classes registered under two different class objects in one registry: `BaseEntity`, `BaseRemotableOperation`, `PermissionProviderBase`, `BasePriceUnitType`. | realtime, support | R2 step 6; R4 step 6 |
| Keep-names, support runtime first | Same, the other way round | Confirmed. The support bundle creates `MJGlobal` (472 registrations) and `StartupManager`; the realtime call then reuses that `MJGlobal` (977 registrations, the same four doubled base classes) but creates `UserInfoEngine` from its own copy of `BaseSingleton`, so two copies coexist and the shared `MJGlobal` is `instanceof` the support copy only (`[true, false]`). | realtime, support | R5 steps 5 and 6 |
| **Two MJ versions in one registry** (Caliber from npm 6.1.x with keep-names, the realtime call from this repo at 6.2.0-edge) | §2.1: "with names kept, the second bundle's `getInstance()` returns the first bundle's object. That object was built from another copy of the code, possibly another MJ version" | Confirmed, with the versions mixed. Caliber creates `MJGlobal` at load (498 registrations). The realtime call creates no key and reuses Caliber's 6.1.x `MJGlobal`: 1003 registrations afterwards, ten base classes registered under two class objects: `BaseEntity`, `BaseRemotableOperation`, `PermissionProviderBase`, `BasePriceUnitType`, `BaseRealtimeClient`, `BaseRealtimeChannelClient`, `VectorDBBase`, `RuntimeUtilities`, `BaseEntityActionRuntimeUX`, `BaseArtifactViewerPluginComponent`. The realtime element's channel and driver lookups now run against a registry Caliber owns. | Caliber, realtime | R6 and R7 steps 6 and 8 |
| Forms and Orders | Forms bans MJ by a build gate; Orders talks to a REST edge | Neither creates a singleton. Forms still carries 33 KB of `@memberjunction/*` and Orders 24 KB (the metafile), but nothing that registers on `window`. | Forms, Orders | R6 steps 4 and 5 |
| Consequence of the doubled registry | | Not observed as a failure here, because no element got past its first network call. Inferred from `ClassFactory`'s rule that the last registration auto-wins: once bundles share a registry, the earlier bundle's `GetEntityObject` returns the later bundle's entity class, whose `BaseEntity` is the other copy (and, with Caliber, the other MJ version). The Caliber incident in §2.1 (`Oo.Instance.Initialize is not a function`) is the single-bundle form of this. | all MJ-carrying | inferred, not verified |

### zone.js

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Who installs `window.Zone`, and when | Realtime defers it to the call; Orders ships it; Forms and Caliber are zoneless; support has none | On the two-element page `window.Zone` is set once, by `loadZone` in `mj-realtime-widget-session.js`, after the consent notice is accepted. On the five-element page it is set by `loadZone` in `mj-orders-checkout/main.js` the moment the Orders bundle loads (step 5), before any visitor action; the realtime call later finds it present. The support bundle contains no zone.js; the realtime bundle carries 38.8 KB of it, Orders 90.7 KB (unminified). | Orders, realtime | R1 `zoneFirstSeen`; R6 and R7 step 5 |
| zone.js next to zoneless apps | Phase 0 item: record it | Forms (loaded before Orders) and Caliber (loaded after, into a page zone.js had already patched) both booted and rendered their error states with no uncaught errors and no `console.error`. The only error on the page in R6 and R7 is the support loader's rejection. Whether zone.js changes their change-detection timing was not measured. | Forms, Caliber, Orders | R6 and R7 steps 4 to 6, `newErrors` |

### Fonts

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| `@font-face` rules on the page | Realtime and Caliber each inline Font Awesome; Forms uses inline SVG; support none | Two-element page: 0 until the realtime call code loads, then exactly one, `"Font Awesome 6 Free"` 900 at document level (hoisted out of the `@layer`, `src` an inlined woff2 data URL; 206 KB of the bundle). Five-element page without CSP: Caliber registers the same family and weight at load (its own inlined woff2, 206 KB of its bundle), and the realtime call adds a second identical declaration: `duplicates: ["Font Awesome 6 Free" 900, 2 declarations]`, both `loaded`. Forms, Orders and support declare no `@font-face`. | realtime, Caliber | R1 step 5; R7 steps 6 and 8 |
| Under the nonce CSP | | Caliber's declaration never appears, because the `<style>` carrying it is blocked (next sections); only the realtime one registers. | Caliber | R6 steps 6 and 8 |

### Style bleed

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Host CSS into the realtime widget (light DOM, `mjw-` prefix, `@layer`) | Host wins against a layered declaration | The host's `!important` button rules apply to every realtime button the run rendered: the shell's start, consent and error views ("Try again" is the shell's own DOM; the Angular overlay never mounts before a session is prepared, see §3): computed background `rgba(59, 130, 246, 0.15)`, border `dashed`, color the host's. Host `.mjw-btn { letter-spacing: .3em }` also applies (computed 4.2px), because the shell's class name matched the host's. The shell's font follows the host's `--mj-font-family` token (Inter, from the page's token layer; `system-ui` on a page without that token), which is the layered-defaults contract working as designed. Same with and without CSP. | realtime | R1 and R3 steps 2 and 5, `realtimeA_anyButton`, `realtimeB_anyButton` |
| Host CSS into `<mj-form>` (light DOM) | Phase 0 item | Forms sets its own root: font Inter, text `rgb(26, 29, 33)`, background white, in both page themes. Its button still takes the host's `!important` background and dashed border. | Forms | R7 step 4, `form`, `form_anyButton` |
| Host CSS into `<caliber-widget>` (light DOM, `@layer`) | Phase 0 item | Caliber sets its own root background and text color (`rgb(15, 23, 42)` on `rgb(241, 245, 249)` in dark) and its own font (Inter) on its content, but its first text node and its button compute to the host's text color `rgb(219, 234, 254)`, and the button takes the host's `!important` background and dashed border. | Caliber | R7 step 6, `caliber`, `caliber_anyButton`, `caliber_firstText` |
| Host CSS into `<mj-orders-checkout>` | Phase 0 item | The element rendered a one-line notice ("Checkout is temporarily unavailable") and no button; the element itself keeps the host's Georgia and text color (it sets neither). | Orders | R7 step 5, `orders` |
| Host CSS into the support widget (shadow DOM, `all: initial` on `:host`) | Nothing leaks in | With no CSP: isolated. Launcher background `rgb(38, 79, 175)` (its own brand token), border none, the host element's computed font `system-ui` and color `rgb(31, 41, 51)` from its own `:host` block; the host's Georgia, text color, button background and dashed border do not reach it. With the nonce CSP: its shadow `<style>` is blocked (next section), `all: initial` never applies, and inherited host styles do reach it: host element font Georgia and the host's text color; launcher at UA defaults (`rgb(107, 107, 107)`, outset). | support | R3 step 4 vs R1 step 4 |
| Element CSS into the host | Layered defaults lose to the host's unlayered rules | No change from any of the five. The host probe and host button computed styles are identical before any bundle and after everything loaded (empty diffs in all seven runs), with Caliber's seven document-level stylesheets and Orders' one on the page, and the host's own `--mj-brand-primary: #00aa00` still reads `#00aa00` under the realtime and Caliber token layers. | all | all runs, `summary.hostProbeDiff`, `hostButtonDiff`, `hostTokenBrandPrimary` |
| Element CSS into another element | | One case, under the nonce CSP only: with Caliber's own stylesheets blocked, its first text computed to Arial until the realtime call put its global style layer on the page, after which it computed to Inter (the realtime layer's font). With Caliber's stylesheets allowed, its own Inter wins and the effect is invisible. | realtime into Caliber | R6 steps 6 and 8, `caliber_firstText` |
| Realtime `data-theme` with `theme="auto"` | Follows the page if it declares a theme, else the OS | On a page with no `data-theme`, the element set its own `data-theme="dark"` at upgrade from `prefers-color-scheme` (dark on this machine) and kept it through the page's `color-scheme` toggles. On the page as it now is, which sets `data-theme` on `<html>` like an MJ host, the element sets none and renders light or dark with the page's attribute (`ResolveDataTheme` returns null when the page declares a theme). Not measured against a light OS. | realtime | earlier runs step 2 and 7 (`dataTheme: "dark"`); later runs (`dataTheme: null`); `src/lib/theme/widget-theme.ts` |

### Layout

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Parent with no definite height (Caliber's recorded `height: 100%` collapse) | The element should still have height | Realtime instance B, in an auto-height parent: 320 px tall (parent 477 to 488 px depending on the card's caption), same as instance A. Caliber, in the same kind of parent: 497 px with its styles (R7), 119 to 164 px when they are blocked (R6); no collapse to 0 in either. Caliber's smoke host gives `html, body` and the element `height: 100%`; this page gives none of that and the element still sized itself. | realtime, Caliber | all runs, `layout.rtB_inNoHeightParent`, `layout.caliber_inNoHeightParent` |
| Other heights | | Forms 245 px (its error card), Orders 76 px (its notice line), support 0 px with its styles (the launcher is fixed-position) or one line box when blocked. In the R7 screenshot Caliber's scrollable content area shows its own vertical scrollbar extending past the bottom of its card. | Forms, Orders, support, Caliber | R7 steps 4 to 7; the screenshot taken after R7 |

### color-scheme

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Page toggles `color-scheme` and `data-theme` on `<html>`: `light dark`, then `light`, then `dark` (Caliber's recorded repaint failure) | Record it | Each element's computed `color-scheme` follows the page (inherited). Caliber repaints with the page: background `rgb(15, 23, 42)` in dark, `rgb(248, 250, 252)` in light, text color likewise; no failure in Chrome 155. Forms keeps its own white card and dark text in both. Orders inherits the host's colors. The realtime widget follows the page's `data-theme` when there is one (and otherwise the OS preference fixed at upgrade); its palette does not follow `color-scheme` itself. The support widget (unstyled, under the CSP) flips its UA button colors with the page; with its styles on, nothing visible changes. | all | R7 steps 10 and 11; two-element runs steps 7 and 8 |

### CSP nonces

The server sends `script-src 'self' 'nonce-phase0page' 'wasm-unsafe-eval'; style-src 'self' 'nonce-phase0page'` (no
`'unsafe-inline'`, which a browser ignores once a nonce is listed). Realtime instance A and `<mj-orders-checkout>`
carry `csp-nonce="phase0page"`; realtime instance B carries no nonce attribute and `preload="eager"`; Forms and
Caliber carry none.

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Realtime shell styles | A `<style>` carrying the nonce | No `<style>` at all: the shell used `document.adoptedStyleSheets` (1 sheet), which needs no CSP allowance. | realtime | all runs, `realtimeShellStyleElement` |
| Realtime call styles | Angular `<style>` elements with the nonce | Two `<style>` elements added to `<head>`, both with nonce `phase0page` (Angular `CSP_NONCE`). Zero CSP violations from the realtime bundle in any run. | realtime | R1 step 5; R6 step 8 |
| Where instance B's nonce came from (`ReadCspNonce` reads the first `<mj-realtime-widget>` on the page, then any `script[nonce]`) | Phase 0 item: "the realtime widget reads it off the first widget" | B's `<link rel="modulepreload">` for the session module carries `phase0page`, which B never declared: it was read off instance A. Since one Angular application serves every realtime instance and "the first call's nonce styles it" (`session-entry.ts`), an A that declared a nonce the page's CSP does not list would take B's preload and the shared Angular styles down with it. That clash is read from the code, not provoked here. | realtime | R1 step 2 `preloadLinks`; `src/lib/csp-nonce.ts`, `src/session-entry.ts` |
| `<mj-orders-checkout>` (reads its nonce off the first `<mj-orders-checkout>`, else any `script[nonce]`, the same discovery as the realtime widget) | Phase 0 item: clashing discovery | Its one `<style>` in `<head>` carries `phase0page` from its own `csp-nonce` attribute; zero violations. On this page both discoveries resolved to the same nonce, so no clash was provoked; two elements with different `csp-nonce` attributes on one page would be the case to run. | Orders | R6 step 5, `headStylesWithNonce` |
| `<mj-form>` | | One `<style>` in `<head>` without a nonce (its host-scoped component styles, `[_nghost-ng-...]`): one `style-src-elem` violation, and the element renders with its styles blocked. | Forms | R6 step 4 |
| `<caliber-widget>` | | Seven `<style>` elements in `<head>` without a nonce (its generated global style layer, the WCAG correction sheet, `caliber-golden-split`, `caliber-widget-global-styles`, three component sheets): eight `style-src-elem` violations, and the element renders unstyled. Its Font Awesome `@font-face` never registers because it lives in a blocked sheet. | Caliber | R6 step 6, `headStylesWithoutNonce`, `newCspViolations` |
| Support widget styles | README: `style-src 'unsafe-inline'` required | Its shadow `<style>` carries no nonce and is blocked: `style-src-elem` violation from `mj-widget.js` line 120, the sheet has no rules, the widget renders unstyled and loses its isolation (see style bleed). A host with a nonce-based `style-src` cannot style it at all, because listing a nonce disables `'unsafe-inline'`. | support | R1 and R2 step 4, R6 step 7 |
| Totals under the nonce CSP | | 10 violations on the five-element page: Caliber 8, Forms 1, support 1, realtime 0, Orders 0. Only the two elements that read a `csp-nonce` attribute survive a nonce CSP. | all | R6, `cspViolations` |

### Errors on a bare page

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| Element whose API is unreachable | Fails inside the element | Realtime: phases `consent > booting > error`, its own error view with "Try again", an `mj-error` event, no uncaught error. Forms: its own "Failed to fetch" card. Orders: its own "Checkout is temporarily unavailable" notice. Caliber: its own "Something went wrong, this assessment link has expired" panel with "Try again" (no invite token was given). Support: the loader's `BootstrapFromDocument` awaits the session mint before mounting, so the mount `<div>` stays empty and the page gets an uncaught `unhandledrejection: Failed to fetch`; the only uncaught error from the five. | all | R6 and R7, `newErrors`; the R7 screenshot |

## 3. Not measured, and why

- **The realtime call stops before the Angular overlay renders.** With `api-url` pointing at a closed port, the call
  module loads, the Angular application is created and its global-styles component mounts (that is what puts the
  token layer, the `@font-face` and the two nonce-carrying `<style>` elements on the page), then `prepareSession()`
  fails on the widget-key POST and the shell draws its own error view. So every realtime row above is a load-time
  observation: module evaluation, singletons, zone.js, the style layer, nonces, bleed into the shell's views. Bleed
  into the overlay's templates, the media stack and the channels need a reachable MJAPI with a realtime widget key;
  the page takes `api-url` and `widget-key` for that run. The support widget likewise never gets past its session
  mint, so its chat panel and transport initialization are unmeasured. Forms, Orders and Caliber each stop at their
  own first-request error state, which is one real Angular-rendered view per element, so their bleed and layout rows
  cover that view only.
- Two Angular runtimes of different versions on one page (§2.1): all four Angular elements booted side by side
  (MJ and Forms at 21.2.22, Orders and Caliber at 21.1.3 per the plan; versions not re-read from the clones) with no
  uncaught error, but nothing here exercises them past their first view.
- The doubled-registry consequence (an entity object of the wrong copy or version) was inferred from `ClassFactory`'s
  priority rule, not provoked; provoking it needs a working MJAPI or a stub that lets one element reach `GetEntityObject`.
- A nonce clash between two elements declaring different `csp-nonce` values was not provoked; both discoveries resolved
  to the page's one nonce.
- Light OS theme: Matt's machine prefers dark, so `theme="auto"` was only observed resolving to dark on a page without
  `data-theme`.
- The realtime bundle was built with `keepNames: true` (its script requires it); the support widget was measured both
  as published (no keep-names) and with keep-names, since the plan's cross-bundle question only arises with names kept.
  Caliber's script requires keep-names (the §2.1 incident); Forms and Orders were measured as their scripts build them.

## 4. Connected run: the two MJ elements against a real MJAPI

Same page, same five bundles, with `?api=http://localhost:4000&rtkey=<key>&supportkey=<key>` pointing the two MJ
elements at this checkout's MJAPI (started from `packages/MJAPI` with `MJAPI_PUBLIC_URL=http://localhost:4000`,
database `MJ_6_2_LOGIN_pr5527` after `mj migrate`). One `MJ: Conversation Widget Instances` row served both elements:
pinned agent Sage, application Chat, role Widget Guest, Modality Both, `AllowedOrigins` `http://localhost:8099`.
README.md has the recipe and the three things that had to be fixed before a token would verify.

| Run | Query | Report |
|---|---|---|
| C1 | `?api=…&csp=none` with the support widget as published | not saved: the support loader failed before mounting (first row below) |
| C2 | `?api=…&csp=none&support=keepnames` | `report-2026-10-20T02-03-11-106Z.json` |
| C3 | `?api=…&support=keepnames` (strict nonce CSP) | `report-2026-10-20T02-05-07-395Z.json` |

Load order in C2 and C3: realtime shell, support entry (which mints and initializes its runtime at once), Forms,
Orders, Caliber, then the realtime call on instance A.

| Check | Expected | Observed | Element(s) | Evidence |
|---|---|---|---|---|
| **Published support widget on a real session** | Works (it is the shipped shape) | Fails. The mint succeeds, then the loader's `transport.Initialize(session)` throws `C.Instance.Initialize is not a function` as an uncaught rejection and the element never mounts. That is the same failure as the Caliber incident in §2.1 (`Oo.Instance.Initialize is not a function`): the published bundle is minified without `keepNames`, so two classes share a minified name and `BaseSingleton`'s `___SINGLETON__<name>` key, and `getInstance()` hands back the wrong object. The keep-names build of the same source initializes and mounts. Offline (§2) this never showed, because the loader never got past the mint. | support | C1 (log line `unhandledrejection: C.Instance.Initialize is not a function`); C2 and C3 mount by the loader |
| Singletons the support runtime creates (keep-names) | A few | 21 keys once its transport initializes: `MJGlobal`, `StartupManager`, `GraphQLDataProvider`, `LocalCacheManager`, `PermissionEngine`, `TelemetryManager`, `BaseEngineRegistry`, `ResourcePermissionEngine`, `DashboardEngine`, `QueryEngine`, `EncryptionEngineBase`, `RemoteOperationEngineBase`, `UserInfoEngine`, `ApplicationSettingEngine`, `SearchEngineBase`, `IdentityClaimEngine`, `AIEngineBase`, `TemplateEngineBase`, `ArtifactMetadataEngine`, `ConversationEngine` and one more. Each engine logs a `[Cache] … Skipping N entity config(s)` warning because the guest user cannot read its entities (19 to 28 `console.error` lines per load). Even the published build creates a readable `GraphQLDataProvider` key, so that one singleton is shared across bundles with or without keep-names. | support | C2, C3 final `singletons.entries`; C1 keys `zi`, `a`, `GraphQLDataProvider` |
| **Three MJ copies in one registry** | §2.1 | With the support runtime (this repo, 6.2.0-edge) first, Caliber (npm 6.1.x) and then the realtime call (6.2.0-edge) both reuse its `MJGlobal`: 1485 registrations at the end, and `BaseEntity`, `BaseRemotableOperation`, `PermissionProviderBase`, `BasePriceUnitType` and `BaseRealtimeClient` each registered under three different class objects (five more under two). The second `BaseSingleton` copy on the page is Caliber's. | support, Caliber, realtime | C2, C3 final `MJGlobal.classRegistrations`, `baseClassesWithTwoCopies` |
| Realtime call end to end | The Angular overlay renders | Yes. Consent accepted, `[RealtimeCoAgent] mint model=gpt-realtime-2 driver=OpenAIRealtime` on the server, the overlay mounts inside instance A (`mj-realtime-agent-banner`, `mj-realtime-agent-orb`, `mj-realtime-perception-chip`, `mj-realtime-composer`, `mj-media-controls`, `mj-media-stage`), status "Listening", and `end()` closes it to "That's a wrap". Instance A stays 320 px tall; the media stage is `position: absolute` inside it. | realtime | C2, C3 step 7; the two screenshots taken during C2 |
| Icons in the live overlay (Forms built `<mjf-icon>` because Font Awesome measured 0 by 0 on a host page, D4) | Measure | Every `<i class="fa-…">` in the overlay renders a glyph: `::before` content set, font `"Font Awesome 6 Free"`, boxes 11 to 18 px wide, both inlined faces `loaded`. The 0 by 0 case did not reproduce on this host. | realtime | C2 live measurement (`icons`) |
| Host CSS into the live overlay | Phase 0 item | The host's `!important` button rules reach every overlay control: minimize, show conversation, details, type, more controls all compute to the host background `rgba(59, 130, 246, 0.15)`, border `dashed`, color `rgb(219, 234, 254)` (the dashed rings in the screenshot). Overlay text keeps its own Inter and its own colors; icon buttons fall back to the UA's Arial because they have no text and the overlay sets no button font. | realtime | C2 live measurement (`buttons`, `bannerText`) |
| Live overlay under the nonce CSP | Angular styles carry the nonce | The call goes live with zero violations from the realtime bundle; 11 of 19 head `<style>` elements carry the nonce (realtime's and Orders'), the 8 without are Caliber's and Forms'. The libopus WebAssembly chunk needs `'wasm-unsafe-eval'` in `script-src`, which the page's CSP grants. | realtime | C3, `cspViolations` by source: Caliber 8, Forms 1, support 1, realtime 0 |
| Support widget text turn | Sage answers | The message is sent and the widget renders it, then shows "The agent could not respond" with the runtime's error: "Could not resolve a default conversation manager agent: ApplicationSettingEngine data is not available, user lacks read permission on MJ: Application Settings". The client runtime looks up a default conversation manager instead of the instance's pinned agent, and the Widget Guest role cannot read the setting it needs. The server logs the matching `does not have read permissions on MJ: Applications`. A guest-permission gap in the support widget, not a page effect. | support | C2 (widget transcript, server log) |
| Caliber against an MJ API that is not its own | | Caliber's element calls the API it is given with its own schema and shows "Something went wrong: Unknown type CaliberPrepareWidgetInputType", retrying periodically (the same `console.error` repeats). An element from one app pointed at another app's API fails at the first query, as the plan's shared-runtime model would need to handle. | Caliber | C2, C3 `errors` |
| Three things that blocked the connected run before any element ran | | (1) `curl` is rejected by the mint's bot gate (`LooksLikeBot` on the user agent) with the same 403 as a bad origin; test with a browser user agent. (2) The auth provider fetches the widget signing keys from `MJAPI_PUBLIC_URL`; with the `.env` value (a tunnel URL that answered 404) every guest token failed with `JwksError: Not Found`, and turbo's `passThroughEnv` for the start task does not include that variable, so an override only works when MJAPI is started directly from its package. (3) The database was four migrations behind the branch; the janitor failed on `RecordingStatus` until `mj migrate` ran. | server | the server log; README.md |
