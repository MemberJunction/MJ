# MJ Elements: one loader, one runtime, every embeddable MJ widget

**Status:** PROPOSED 2026-10-19. Discovery (Phase 0) not started.
**Ask:** Amith, 2026-10-19. Public sites (WordPress, HubSpot, static pages) will carry more and more interactive MJ widgets: voice and chat agents, forms, checkout, assessments. MJ will not try to turn those sites into single-page apps. Instead every MJ widget ships as an HTML custom element that works on any page, and they all share one loader and one runtime.
**Discovery owner:** @MattC-BC.
**Scope:** a new loader and runtime package (names are D7); `packages/Angular/Generic/realtime-widget`; `packages/Web/RealtimeWidget`; `packages/MJServer` (asset route, page session); the element packaging in `bizapps-forms`, `bizapps-orders` and `bizapps-caliber`; `guides/BUILDING_UI_ON_MJ.md` §7.3.
**Related:**
- [`guides/BUILDING_UI_ON_MJ.md`](../guides/BUILDING_UI_ON_MJ.md) §7.3: why Angular Elements are the "anywhere on the web" path, and the trust table this plan keeps.
- [`plans/realtime/channels-v2/README.md`](realtime/channels-v2/README.md): WS8 and decision D11.
- [`plans/realtime/bridges-and-widget/public-web-widget.md`](realtime/bridges-and-widget/public-web-widget.md)
- [`plans/conversations-runtime-extraction.md`](conversations-runtime-extraction.md)
- bizapps-caliber `docs/embedding-widget-guide.md` and `docs/widget-live-validation-findings.md`
- bizapps-orders `docs/checkout-widget-and-session-architecture.md`
- bizapps-forms `plans/FORMS_BUILD_PLAN.md` (DG-5)
- CDP `docs/voice/adr/0019-conversation-completion-is-a-hosted-page-reached-by-a-widget-event.md`

---

## 1. Where this came from

The starting question was whether WordPress or HubSpot can switch page changes to client-side navigation, so an AI widget survives a page change. Neither can, short of a headless rebuild or a page-swap library that breaks plugins. Two conclusions came out of it:

- **Member sites and portals** are, or will be, Angular apps that we build or guide. They use the full MJ stack and MJ's Angular components directly. Nothing here changes that, except one rule: every element must also ship as a plain Angular component, so those apps never need the loader.
- **Public sites** stay whatever they are. MJ's job is to make its widgets drop onto any HTML page and behave well there. The page's framework, rendering and SEO are the host's business.

Elements already work this way, one at a time. This plan is about what happens when there are several, which already happens in production.

## 2. What exists today

| Element | Repo, package | What the bundle carries | Size | Served from | Visitor auth | Events |
|---|---|---|---|---|---|---|
| `<mj-realtime-widget>` (voice agent) | MJ, `@memberjunction/ng-realtime-widget` | A shell with no framework. The call code adds Angular, zone.js and MJ core, loaded when the call starts. | shell 8.3 KB gz, call 2.5 MB gz | npm only; the README says to self-host `dist/element/` | widget key, invite token, token, launcher, host | `mj-*` |
| `<mj-support-widget>` (text chat) | MJ, `@memberjunction/realtime-widget` | no Angular; MJ conversations runtime and GraphQL provider | about 2.9 MB minified (README) | npm only; the browser-bundle step is in neither `build` nor the publish workflow | widget key | none found |
| `<mj-form>` | bizapps-forms, `@mj-biz-apps/forms-ng` | Angular, zoneless, one Angular app per instance; MJ is banned by a build gate | about 175 KB gz | `/forms/widget/mj-form.js`, unversioned, `no-cache`. The product's default embed is an iframe of `/f/:slug` (#203). | magic link redeemed on the server, Turnstile | `mjf-*` |
| `<mj-orders-checkout>` | bizapps-orders, `@mj-biz-apps/orders-ng` | Angular with zone.js; no MJ (it talks to a REST edge) | not measured; not minified | `/checkout/element/main.js`, unversioned, `Access-Control-Allow-Origin: *` | slug plus session key, Turnstile; host-signed `member-token` for members | `checkout-*`; `checkout-reset` in |
| `<caliber-widget>` (assessment) | bizapps-caliber, `@mj-biz-apps/caliber-ng` | Angular, zoneless; MJ core, GraphQL provider, ng-conversations | about 15.9 MB raw, 3.7 MB brotli | `/caliber/widget/caliber-widget.js?v=<hash>`, `immutable` when the hash matches | magic link redeemed in the browser, three-tier resume store | none (`data-phase` only) |
| `<voice-agent>`, `<sidecar-checkout>` | CDP, not MJ | Angular with zone.js each; no MJ | about 3.5 MB (README, probably stale) | CDP Public API, unversioned, `must-revalidate` | CDP REST, an allowlist per deployment | `dismissed`, `checkout-*`, `voice-tool:*` on `document` |

The bundles are built against three different Angular versions: 21.2.22 (MJ, Forms), 21.1.3 (Orders, Caliber) and 21.2.23 (CDP).

### 2.1 What that adds up to

- **Several runtimes on one page already happen.** CDP's `<voice-agent>` loads CDP's checkout bundle and `<mj-orders-checkout>` into the page at run time (CDP `packages/VoiceWidget/src/lib/services/voice-session.service.ts`). That is two or three Angular runtimes, of two versions, at least two of them with their own zone.js.
- **MJ core singletons collide.** `BaseSingleton` stores every instance on `window` under `'___SINGLETON__' + constructor.name` (`packages/MJGlobal/src/BaseSingleton.ts`).
  - **Inside one minified bundle, this has already happened.** Caliber's first live embed failed with `Oo.Instance.Initialize is not a function`, because minified class names collided. `keepNames: true` is now required in every build (bizapps-caliber `docs/widget-live-validation-findings.md` §2).
  - **Across two bundles nobody has tested it.** With names kept, the second bundle's `getInstance()` returns the first bundle's object. That object was built from another copy of the code, possibly another MJ version, and `instanceof` fails across copies. Phase 0 tests this.
- **Independently versioned bundles drift.** Caliber's `/session` page wraps `fetch` to detect a Forms submission, because the Forms bundle it pins predates the `mjf-submitted` event (bizapps-caliber `packages/Server/src/session-host/host-page.ts`). Every pair of elements that talk to each other will hit this.
- **Five build scripts repeat the same traps.** MJ's two, Forms', Orders' and Caliber's each solve the Angular linker, the JIT ban and the size check separately. Caliber shipped a dead bundle in 6.1.0 because its linker only looked at `@angular/*` paths and missed a third-party library (#325). Forms' and Orders' linkers are still scoped that way. Forms 0.2.0 through 0.4.0 shipped without the bundle at all. MJ's support widget build doesn't produce its browser bundle as part of `build` today.
- **Three serving routes, three caching rules.** `no-cache` (Forms), Express defaults (Orders), and a hash-versioned `immutable` URL with its own brotli and gzip (Caliber). CDP lists a versioned URL as its better end state but deferred it.
- **Five event conventions.** `mj-*`, `mjf-*`, `checkout-*`, none, and `voice-tool:*` on `document`. A host that wants to react to all of them learns each one.
- **No shared visitor.** A visitor who verifies an email in one element is unknown to the element next to it. There are four resume stores with four lifetimes.
- **zone.js patches the host page,** once per zone-based bundle. The realtime widget defers it until a call starts for that reason. Forms and Caliber already run without it.
- **Page changes are handled by one element only.** The realtime widget resumes its conversation after a reload, closes a live call on a terminal `pagehide`, and leaves it on a back/forward-cache hide. Nothing tells an agent which page the visitor moved to. Nothing lets an agent move the visitor without ending its own call.

## 3. What MJ Elements is

Four parts. The realtime widget's shell and call-code split already is a small version of the first two, so most of the design generalizes it.

### 3.1 The loader

One classic script tag, no framework, with a size budget (strawman: 15 KB gzipped).

```html
<script src="https://api.example.org/elements/6.3.0/mj-elements.js"
        data-api-url="https://api.example.org" data-site-key="pk_live_…" defer></script>

<mj-realtime-widget agent-name="Ada"></mj-realtime-widget>
<mj-form slug="member-survey-2027"></mj-form>
<mj-orders-checkout slug="summit-2027"></mj-orders-checkout>
```

What it does:

- **Reads page-level configuration once.** API URL, key, theme, locale and CSP nonce come from its own `data-*` attributes or from `MJElements.configure({...})`. Elements inherit them, and an attribute on an element overrides them.
- **Holds the element catalog.** A manifest generated at build time maps each tag to its chunk, attributes, methods, events and load policy.
- **Defines a lightweight shell for every tag in the catalog.** The shell parses attributes and queues method calls made before the code arrives. It draws whatever it can without a framework; the realtime widget's start button and consent notice are the model. It loads the real implementation by the tag's policy: on interaction, when visible, when idle, or at once. A form loads when it scrolls into view. A voice agent loads when someone presses it.
- **Loads each runtime layer exactly once,** whichever element asks first. It checks the contract version, which generalizes the realtime widget's `SESSION_CONTRACT_VERSION`.
- **Owns the page session** (§3.3) **and page context** (§3.4), because both must exist before any Angular code runs.

### 3.2 The shared runtime, in layers

Everything in the runtime is paid by every element that loads it. Forms stays at about 175 KB gzipped because a build gate keeps MJ core out of it. Orders talks to a REST edge and needs no MJ client either. Joining the runtime must not make them heavier. So the runtime is layered, and an element loads only the layers it declares:

- **Base layer,** for every element:
  - Angular, once, in one `createApplication` per page. The realtime widget, Orders and Caliber each already share one app between their own instances; Forms creates one per instance.
  - The `--mj-*` token layer and base component styles.
  - The page session client.
- **Data layer,** for elements that use MJ's client (the realtime widget, Caliber, the support widget):
  - `@memberjunction/global`, `@memberjunction/core`, and the GraphQL provider configured from the page session.
  - One class factory and one set of singletons. Loading these once is what removes the cross-bundle collision.
  - Metadata loads only when an element first needs it. Caliber measured MJ metadata at 43.2 MB and 16.3 s on Slow 4G, and defers it with `DeferredBootGraphQLProvider` until the live call. That becomes the runtime's behaviour.
- **Feature chunks,** loaded only by the elements that need them: the realtime overlay, the data grid, spreadsheet export, the artifact viewers. Most of today's call weight is these, not the widgets' own code. The realtime widget README lists generated entity classes at about 2.5 MB raw, the grid at 1.1 MB and export at 0.9 MB. Caliber's own numbers are core-entities 2.09 MB, mermaid 1.41, ag-grid 1.07 and exceljs 0.90.

Each element's chunk exports a framework-neutral mount contract that the loader calls, roughly:

```ts
export function Mount(host: HTMLElement, ctx: ElementContext): ElementHandle;
// ElementHandle: Update(attributes), Call(method, args), Dispose()
```

The loader owns `customElements.define`. Angular renders into the shell's host node with `createComponent({ hostElement })`, which is what Forms already does. Each tag has one definition, so every bundle no longer needs its own guard against a double define.

### 3.3 One page session

The trust line in `guides/BUILDING_UI_ON_MJ.md` §7.3 stays. An unauthenticated element keeps its narrow edge: the Orders checkout edge, Forms' Remote Operations under a scoped respondent session. An authenticated element keeps using the visitor's MJ permissions. The runtime does not push everything through one GraphQL session. What it shares is **the visitor.**

- **One visitor per page and tab, with one resume store.** Today there are four:
  - the realtime widget's `sessionStorage` bundle;
  - Caliber's cookie, `localStorage` and `sessionStorage` tiers;
  - Orders' per-slug `sessionStorage` key;
  - Forms' host-page cookie.

  Picking the lifetime is part of D5.
- **Upgrades reach every element.** When an email is verified in one element, or the host vouches for its signed-in member, the loader fires `mj-identity-changed`. Each element decides what that means for it: the form pre-fills or skips its own verification, the checkout pre-fills the email.
- **The host vouches once, at page level.** Two mechanisms exist today:
  - `MJ: Conversation Widget Instances` has `AuthStrategy = 'HostIdentity'` and `HostPublicKey`. `WidgetSessionService` verifies the host's signed assertion (`packages/MJServer/src/realtimeWidget/WidgetSessionService.ts`).
  - Orders accepts a host-signed `member-token` through a registered resolver (#324).

  Both become one: the host's backend signs one assertion for its logged-in member, and the page passes it once to `MJElements.configure`. That answers "the member is signed in to the WordPress site" for every element at once.
- **Invites redeemed server-side where possible.** Forms redeems its magic link on the server, so the raw invite never reaches the browser. Caliber and the realtime widget redeem it in the browser. The page session should prefer Forms' way.
- **What a key covers** is D5.

### 3.4 One host contract

The same rules for every element:

- **Attributes in.** The shared ones (`api-url`, key, `theme`, `locale`, `csp-nonce`) come from page configuration unless set on the element. Element-specific ones are listed in the catalog.
- **Events out.**
  - Every event is a `CustomEvent` prefixed `mj-`, that bubbles and is `composed`.
  - Lifecycle events are the same on every element: `mj-ready`, `mj-error`, `mj-phase-changed`. `data-phase` is reflected on the host for CSS.
  - Domain events are namespaced, for example `mj-checkout-complete` and `mj-form-submitted`.
  - No event carries personal data, because every script on the page can hear it (the §7.3 rule, which Orders and CDP already follow).
  - Today's event names are external contracts: Google Tag Manager tags and CDP's hosted pages listen for them. Keep emitting them alongside the new ones through a deprecation window.
- **Page context in, automatically.** The loader watches URL changes through the Navigation API, with a `pushState`/`popstate` fallback. It passes URL, title, language and description to the elements. An agent element turns that into context for the model. `MJElements.setPageContext({...})` lets a host add structure, such as a post ID or the product on the page. For agents, this is the public-site version of `ClientContextChannel`, whose `AppContext` is shaped around MJ Explorer today.
- **Navigation out, through the host.** When an agent wants to move the visitor, the element fires a cancelable `mj-navigate-request` with the URL. A host with a router handles it and calls `preventDefault()`. Otherwise the loader applies a default policy: if any element holds a live session (a call), it opens the URL in a new tab or a popout; otherwise it navigates. Allowed origins come from configuration; CDP's `navigable-origins` attribute is the precedent.
- **Surviving the page.**
  - On hosts that don't reload (SPAs, Turbo, Astro's persisted elements), an element survives being moved in the DOM. The realtime widget waits 10 ms before tearing down for that reason, and Forms re-inserts a host element that Angular detached.
  - On hosts that reload, an element resumes, and a live session follows the navigation policy instead of dying on the next click.
  - The guide gives the "keep this element outside the swapped area" recipe for each common page-swap library.
- **Layout on a page we don't own.** Ship the `:not(:defined)` and sizing rules every element needs. Caliber's lessons: a `height: 100%` widget in a page with no definite height collapsed to 0 px, and a page's `color-scheme: light dark` painted a form black on black (bizapps-caliber `plans/LESSONS.md`).
- **Types.** Publish `HTMLElementTagNameMap` and event-map declarations, so a TypeScript host on any framework gets typed attributes and events.

### 3.5 Delivery

- **Versioned, immutable URLs.**
  - Assets live under `/elements/<version>/…` and are served `immutable` with a long max-age. Caliber already does this with `?v=<hash>`.
  - A short-cache alias (`/elements/mj-elements.js`, or one per major line) serves people who want "latest".
  - Versioned loader URLs can carry SRI hashes.
- **MJAPI serves them** through `ApiRoute('/elements')`, never `app.use('/x')`.
  - Each host serves the element code matching its own API version, so the contract version matches by construction.
  - The route goes through MJ's compression, or pre-compresses brotli and gzip as Caliber does. Two precedents to follow: Forms moved its route behind compression (#121), and Caliber found that `ConfigureExpressApp` routes skip it (#491).
  - Copying the folder to a CDN, or self-hosting it, stays possible.
- **CORS on module chunks.**
  - Dynamic `import()` fetches in CORS mode, so chunks served to other origins need `Access-Control-Allow-Origin`. Orders already sends it, with `Cross-Origin-Resource-Policy: cross-origin`.
  - A classic `<script src>` loader doesn't need CORS.
  - Rate limiting must never blank an element. Forms found that a 429 on its bundle shows the visitor an empty form.
- **One CSP recipe for all elements.**
  - `script-src` for the element origin, with a nonce and `strict-dynamic`.
  - `connect-src` for the API and realtime endpoints.
  - Media permissions for voice.
  - `frame-src` only for elements that frame things.
  - The third-party origins: Stripe, Cloudflare Turnstile.
  - It absorbs what CDP learned the hard way: an AudioWorklet fetched from jsDelivr on Firefox, `frame-src` silently blocking a panel, and a host CSP blocking Stripe.

### 3.6 Build and authoring

- **One build tool,** generalized from `scripts/build-element.mjs` and the four others, keeping every lesson they paid for:
  - The Angular linker gated on file *content* (`ngDeclare`), not on `@angular/*` paths (Caliber #325).
  - `keepNames: true`.
  - Bundle the `ngc` output, never TypeScript source; esbuild doesn't compile templates.
  - `ngDevMode` and `ngJitMode` defined false, so there's no JIT and no `unsafe-eval`.
  - `@RegisterClass` classes pinned by value, because `sideEffects: false` lets the bundler drop them.
  - A shell guard: forbidden imports, plus a gzip budget.
  - A jsdom boot test with `eval` and `Function` blocked.
  - A server-side check that refuses a bundle in which `ngDeclare` survived (Caliber's readiness check).
  - A CI check that the published package actually contains the bundle.
  - Per-element size budgets in CI.
- **One authoring contract.** An element is a catalog entry (tag, attributes, methods, events, load policy, runtime layers, optional shell view) plus a chunk that exports `Mount`. The same component is also exported for Angular apps to use directly.
- **Open App elements** (Forms, Orders, Caliber, and whatever comes next) are the hard part. That is D1.

## 4. Decisions for Phase 0

| # | Question | Options | Lean |
|---|---|---|---|
| **D1** | How do elements from separately released repos share one runtime? A bundler only dedupes inside one build. | (a) **Externals.** Build each element with Angular and MJ marked external, resolved at run time to the runtime's modules (an import map, or relative URLs inside one versioned folder). (b) **Host-side build.** `mj app install` or a deploy step builds one bundle from MJ plus the installed apps' element entries, the way `mj codegen manifest` composes class registrations today. (c) **Native Federation** (`@angular-architects/native-federation`). (d) MJ builds every element centrally. | **(b)**, with (a) as the fallback to prototype. (b) dedupes everything, gives every element the same Angular and MJ versions (today there are three Angular versions), ends the event drift in §2.1, and ships only installed apps' elements. It costs a build on the host. (a) needs every app's chunk to match the runtime's Angular version exactly, and an import map registered before the first module loads. (d) ties every app's release to MJ's. |
| **D2** | zone.js or zoneless? | Load zone.js once, when the first zone-based element boots; or run the runtime zoneless. | **Zoneless.** Forms and Caliber already run zoneless, and Caliber does so with the ng-conversations realtime overlay inside it. The realtime widget and Orders use zone.js. On a page we don't own, zoneless means nothing patches the host's timers and promises. Phase 0 audits the realtime widget and the Orders checkout. |
| **D3** | Light DOM or shadow DOM? | The family mostly uses light DOM with a class prefix and an `@layer …-defaults` cascade layer (realtime, Caliber, Forms, Orders). The support widget and CDP use shadow DOM. The realtime widget avoided shadow DOM because `@font-face` doesn't register inside a shadow root. | Decide on the Phase 0 test page. The case for shadow DOM is the host-page breakage in §3.4. The case against is fonts and third-party scripts that expect the document. The runtime could register fonts once at document level either way. |
| **D4** | Icons | Font Awesome brought in by the runtime (realtime: as a layer; Caliber: woff2 inlined as base64 so no third-party fetch); or inline SVG (Forms' `<mjf-icon>`, adopted because Font Awesome measured 0 × 0 on a host page, #115). | Measure both on the test page. |
| **D5** | What a key and a visitor cover | A site-level key that lists allowed origins and enabled elements, with one visitor session for the page; or each element keeps its own keys and records, and only the visitor and its upgrades are shared. Also: the visitor's lifetime (tab, browser, opt-in "remember me"). | Open. The answer depends on how far `MJ: Conversation Widget Instances` generalizes past conversations, and how Forms' `FormDistribution` and Orders' distributions relate to it. |
| **D6** | The text support widget | Fold `<mj-support-widget>` onto the runtime; or keep it outside and have it adopt the loader and host contract. | Revisit D11 of the channels-v2 plan. D11 kept the support widget separate as "lightweight", but its README puts it at about 2.9 MB minified. |
| **D7** | Names and packages | For example `@memberjunction/elements` (loader, catalog, build tool, types) and `@memberjunction/elements-runtime`. | Open. |
| **D8** | Caliber and the realtime widget | `<mj-realtime-widget>` was lifted from `<caliber-widget>`. Caliber could become `<mj-realtime-widget>` plus Caliber channels, or stay its own element on the runtime. | Open; Caliber's call, informed by Phase 0. |

## 5. Phases

**Phase 0: discovery (@MattC-BC).** Output: this plan, updated with D1–D8 decided and the measured numbers filled in.

1. **A test page that shows what collides today.** Put `<mj-realtime-widget>`, `<mj-form>`, `<mj-orders-checkout>` and `<caliber-widget>` on one plain HTML page. Record what breaks:
   - singletons shared across bundles (§2.1);
   - zone.js loaded alongside zoneless apps;
   - style bleed between elements, and from the host page;
   - duplicate fonts;
   - clashing CSP-nonce discovery (Orders reads the nonce off the first `mj-orders-checkout`; the realtime widget reads it off the first widget).

   Keep the page as the regression test. Caliber's `smoke/widget/host/index.html` with its Playwright gates, and the support widget's `examples/two-widgets.html`, are starting points.
2. **Measure.** Each bundle's size and contents (esbuild metafiles), and how much is shared.
3. **Spike D1.** Build the realtime widget plus the Orders checkout (the smallest Open App element with Angular) on one runtime, once with option (b) and once with option (a).
4. **Audit for D2.** Check the realtime widget's call code and the Orders checkout for zone dependence.
5. **Decide D3–D8.**

**Phase 1: loader and layered runtime, with the realtime widget moved onto them.** It is already closest to the target shape. Its tag, attributes, methods and events keep working.

**Phase 2: page session and host contract v1.**
- Shared visitor and identity upgrades.
- One page-level host assertion.
- Automatic page context.
- `mj-navigate-request` with the default policy.
- Layout rules.
- Type declarations.

**Phase 3: Open App elements onto the runtime** (Forms, Orders checkout, Caliber), by the D1 mechanism. Each keeps its existing tag and events through the deprecation window.

**Phase 4: delivery and documentation.**
- The `ApiRoute('/elements')` route, with versioned immutable URLs, compression and CORS.
- The CSP recipe.
- A new `guides/MJ_ELEMENTS_GUIDE.md`, with §7.3 of `BUILDING_UI_ON_MJ.md` pointed at it.

**Phase 5: follow-ons.**
- The D6 outcome for the support widget.
- A conversation with CDP about moving `<voice-agent>` and `<sidecar-checkout>` onto the loader. That is CDP's call.

## 6. Rules every element follows

- It also ships as an Angular component, so an Angular app uses it without the loader.
- It patches nothing on the host page before the visitor engages with it.
- It carries no personal data in DOM events.
- It fails closed on origin, with uniform errors that don't reveal whether a key exists. That is the widget router's existing posture.
- It has a size budget enforced in CI, and the published package is checked to contain it.
- Every visitor-facing error offers a way forward, the realtime widget's existing rule.

## 7. Out of scope

- Turning WordPress, HubSpot or any other host into a single-page app, and anything about how host pages are rendered or indexed.
- Member portals built as Angular apps on the full MJ stack. They use the components directly. The only requirement on them is the first rule in §6.
- Iframe embeds, such as Forms' default `/f/:slug` (#203). An iframe is its own document, so it can't share the page session without a `postMessage` bridge. A bridge can come later; v1 covers elements on the page.
- Changing what any widget does.
- CDP's widgets, which are CDP's to move or not (Phase 5).
