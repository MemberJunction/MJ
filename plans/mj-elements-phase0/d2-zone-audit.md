# D2 zone audit: does the realtime widget or the Orders checkout need zone.js?

Phase 0 item 4 of [`plans/mj-elements.md`](../mj-elements.md) (PR #5903), decision D2 (should the shared
runtime be zoneless). Read-only audit, 2026-10-19. No source was changed.

Sources read:

- MJ, `packages/Angular/Generic/realtime-widget` (`src/session-entry.ts`, `src/lib/**`, `src/shell/**`),
  plus the overlay it renders from `packages/Angular/Generic/conversations/src/lib/components/realtime/`
  and the helper packages `realtime-media`, `realtime-channels`, `media-player`.
- Orders, bizapps-orders `packages/Angular` at `514d09bf`:
  `scripts/checkout-element-entry.ts` and `src/lib/checkout-widget/`.

Paths below are relative to those two roots. "Not verified" marks anything inferred rather than seen in code
or run.

## Verdicts

| Element | Depends on zone.js? | One-line reason |
|---|---|---|
| Realtime widget (call code) | **Partly, in a weak sense. Nothing seen needs it; nothing proves it works without it.** | The widget's own components are signal-driven and `OnPush`. The overlay it hosts is `Default` change detection but calls `markForCheck()` on essentially every state change, and its `NgZone.run` / `runOutsideAngular` calls are no-ops when zoneless. zone.js is loaded as a default, not because a path was found that breaks without it. The overlay has never been run zoneless in this widget's tests (they stub it). |
| Orders checkout | **Yes, one confirmed path, plus two soft spots.** | The Stripe card `change` handler sets `isPaymentReady` and nothing triggers a render afterwards. Zone is the only thing that does. Everything else is already written zoneless style (`detectChanges()` at the end of every async flow). |

Short version for D2: both can go zoneless. Realtime is a "flip it and smoke-test the overlay" job, since Explorer
already runs the same overlay zoneless (section 1.1). Orders is about a day, and the one real bug is a one-line fix.

## 1. Realtime widget

### 1.1 How change detection is provided

There are two bootstraps, and both pick zone.

| Path | Citation | What it does |
|---|---|---|
| One-script embed, call chunk | `src/session-entry.ts:13` `import 'zone.js'`; `:40` `providers: [provideZoneChangeDetection(), ...]` | zone.js is imported in the call chunk, not the shell, so a page that never starts a call never sees it (comment at `:10-12`; the shell bundle is gated against zone.js by `scripts/build-element.mjs:57`). |
| Angular host / standalone element | `src/lib/realtime-widget.element.ts:12`, `:91` `provideZoneChangeDetection()` | Same provider, no `import 'zone.js'` here (the host app supplies it). |

`provideZoneChangeDetection()` with no options is an explicit opt in to zone-based CD. Nothing in either path
needs a zone for any reason except change detection.

The tests already run part of the widget zoneless: `src/lib/realtime-widget.element.dom.test.ts:10,82` bootstraps
with `provideZonelessChangeDetection()`. But `src/lib/components/realtime-widget.component.dom.test.ts:30-40`
replaces the real overlay with `StubRealtimeSessionOverlayComponent` (`src/__tests__/stub-overlay.component.ts`,
`OnPush`, three bindings). So the widget shell and its status/consent components are exercised zoneless; the
~2,500-line overlay and its children are not.

The Explorer app also hosts this overlay (ng-conversations is the Explorer chat UI), and Explorer runs it zoneless.
Verified 2026-10-19: `packages/MJExplorer/src/main.ts:26` calls `platformBrowserDynamic().bootstrapModule(AppModule)`;
in Angular 21.2.22 that reaches `bootstrapModuleFactory`, which prepends `provideZonelessChangeDetectionInternal()` to
the application providers (`node_modules/@angular/core/fesm2022/core.mjs:722-723`, via `:735`); and nothing in
`packages/MJExplorer/src`, `packages/Angular/Explorer` or `packages/Angular/Bootstrap/src` declares
`provideZoneChangeDetection` or `provideZonelessChangeDetection`, so that default stands. The zone.js polyfill at
`MJExplorer/angular.json:17` is loaded but does not drive change detection. So the ~2,500-line overlay and its children
already run zoneless in Explorer every day, which is the evidence the stub-based tests cannot give; what Explorer does
not exercise is the overlay inside the widget's own host element and shell.

### 1.2 Places that rely on zone patching to trigger a view update

Searched `src/**` (non-test) for timers, promises, rAF, event handlers, subscribes, `markForCheck`, `detectChanges`.

**The widget's own code: no zone dependence found.**

- `src/lib/components/realtime-widget.component.ts:107` is `OnPush`. State is `signal`s (`:128-129`, `configSignal`),
  and the RxJS bridge sets signals (`:156-162`: `Phase$` sets `errorMessage` and `phase`, `SurfaceChannelOpen$` sets
  `surfaceOpen`). Signal writes schedule CD with or without a zone.
- `src/lib/components/widget-status.component.ts:22` and `widget-consent-gate.component.ts:19`: `OnPush`,
  plain inputs and outputs. `widget-status.component.ts:39` has a `setTimeout(..., 0)` that only moves focus
  (`focusPrimaryAction`), so it needs no re-render.
- `src/lib/components/widget-global-styles.component.ts:29`: `OnPush`, empty template.
- `src/lib/session/widget-controller.ts` is framework-free TypeScript (RxJS subjects, promises). Its only timer is
  the session-deadline `setTimeout` (`:155`, `:775`), which feeds the controller's own state and subjects, not a view.
  Everything it emits reaches the view through `Phase$` / `SurfaceChannelOpen$` (signals above) or into the overlay
  (below).
- `src/session-entry.ts` pushes inputs into the overlay with `setInput` inside `NgZone.run` (`:156-159`). The
  overlay is created with `createComponent` and attached by `app.attachView(ref.hostView)` followed by an explicit
  `ref.changeDetectorRef.detectChanges()` (`:129-130`). `setInput` marks the view dirty, so zoneless picks it up.
- Fetch and auth (`src/lib/auth/widget-auth.browser.ts:18`, `widget-key-client.ts:76`) feed the controller, not a view.
- `src/shell/shell-element.ts:72,106,387` timers belong to the plain-DOM shell, which has no Angular at all.

**The overlay and its children (`conversations/.../realtime/`, hosted by the widget): this is where the risk is.**

- `realtime-session-overlay.component.ts` has no `changeDetection` in its decorator (`:162-190`), so it is **Default**.
  Same for its children: of the 13 component files in that folder, none mentions `ChangeDetectionStrategy`
  (`grep -L` over `conversations/src/lib/components/realtime`), so the channel strip, composer, thread, banner,
  surface tabs, whiteboard viewer and the rest are Default too. Default means "checked on every CD pass". Under zone,
  every task end gives a pass. Zoneless, a pass happens only after something marks a view dirty (signal write,
  `markForCheck`, template event listener, `async` pipe, `ComponentRef.setInput`).
- The overlay compensates heavily: roughly 60 `this.cdr.markForCheck()` calls, including in every stream subscription it
  owns (`:775-804` and the handlers `:850`, `:857`, `:976`, `:1032-1051`, `:1207` in `recomputeUi`, `:1323`,
  `:1357-1375`, `:1422`, `:1452`, `:1632`, `:2224-2411`). `recomputeUi()` ends in `markForCheck()` (`:1198-1207`) and
  most session/channel/connection handlers funnel into it (`onSessionStateChanged :1564`,
  `onChannelActivity :1577`, `onConnectionStateChanged :1211`). `markForCheck` schedules a tick when zoneless, so
  these paths work as written.
- Zone re-entry that is a no-op zoneless: `:848` (`setTimeout(() => this.ngZone.run(...finishAvatarNotice))`), `:1248`
  (ResizeObserver callback wrapped in `ngZone.run`), `:1386`, `:1407`, `:2138`.
- The one comment that says zone is mandatory (`:2134-2138`): review opens through a deep-link stream "outside Angular's
  zone", so without `ngZone.run` the `markForCheck` inside the registration "never gets a change-detection pass".
  That is a statement about zone.js. Zoneless, `markForCheck` itself requests the pass, so the `run` wrapper is
  unnecessary. Not verified by running it.
- Microtask and timer deferrals added to dodge `ExpressionChangedAfterItHasBeenChecked` (`:628` `setTimeout`, `:1243`
  and `:1348` `Promise.resolve().then`, `:1819-1822`, `:1861`, `:1908`, `:2454`). Zoneless these still run, and the
  ones that mutate view state do call `markForCheck` (`:1352`, `:1908`). The `setTimeout`s that only focus an element
  (`:1719`, `:1822`, `:1861`, `:2454-2461`) need no render. `:628` calls `ref.RevealChannel(...)` on a child; whether
  that child marks itself dirty is **not verified** (child bodies not read).
- **Not audited exhaustively:** I read the subscription handlers and the timer sites; I did not read every one of the
  overlay's ~2,490 lines, and I did not open the thread, composer, strip or whiteboard components. A plain field
  mutated in a handler that neither marks dirty nor sits behind a template event would be invisible to this audit.
  Zoneless Default components fail silently (stale view), so this needs a run, not a read.

**Helper packages (`realtime-media`, `media-player`, `realtime-channels`).**

- `realtime-media`: `audio-meter.component.ts:33,79`, `media-stage.component.ts:197-198,392,440,481,514`,
  `media-tile.component.ts:146,324,327` use `runOutsideAngular` for rAF and a frame-stall watch, then `zone.run(...)` plus
  `markForCheck()` to re-enter (`media-stage :451,:520`). Zoneless, `run` just invokes the callback and
  `markForCheck` does the work. The rAF loops were already outside Angular; they never depended on zone.
  `media-tile.component.ts:324` `this.zone.run(() => this.onFramesFlowing(...))`: whether `onFramesFlowing` marks
  dirty is **not verified**.
- `media-player`: `OnPush`, `markForCheck()` after state changes (about 25 sites). Fine zoneless.
- `realtime-channels` (`angular-component-channel.ts:312,475`): two timeout timers that resolve promises. No view work.
- `RealtimeRuntime/src` has no `NgZone` or zone.js reference (searched).

### 1.3 `NgZone.run` / `runOutsideAngular`

All uses, none required by zone-free CD:

| File:line | Use | Zoneless effect |
|---|---|---|
| `src/session-entry.ts:117`, `:156` | `NgZone.run` around `createComponent` and `setInput` | Runs the callback directly. `setInput` still marks dirty. |
| `overlay :848, :1248, :1386, :1407, :2138` | `ngZone.run(...)` | No-op wrapper. |
| `overlay :1371` | `runOutsideAngular` for document `mousemove` / `mouseup` | Plain listener, no CD per move. Same as today. |
| `overlay :1658` | `runOutsideAngular` for the audio rAF loop | Same. Loop writes CSS vars straight to the DOM (`:1637-1643`). |
| `media-stage :392, :440, :481, :514`, `audio-meter :79`, `media-tile :324, :327` | same pattern | Same. |

### 1.4 OnPush vs Default

- OnPush: `RealtimeWidgetComponent`, `WidgetStatusComponent`, `WidgetConsentGateComponent`, `WidgetGlobalStylesComponent`,
  `media-player` and most `realtime-media` leaf components.
- Default: `RealtimeSessionOverlayComponent` and its 12 sibling realtime components in `conversations`.

### 1.5 Libraries in the bundle that require zone.js

None found. `package.json` (`:30-71`) lists zone.js as a `devDependency` only (`:47`); the production dependency list has
no zone-bound library. The call chunk's other imports (RxJS, `@memberjunction/*`, CDK) do not need it. Not verified by
loading a bundle without it.

### 1.6 Conversion list (realtime)

| # | Change | Hours |
|---|---|---|
| 1 | `session-entry.ts`: drop `import 'zone.js'`, swap `provideZoneChangeDetection()` for `provideZonelessChangeDetection()`; same in `realtime-widget.element.ts:91`. Remove `NgZone.run` wrappers at `:117`, `:156` (optional, harmless). | 1 |
| 2 | Run the real overlay zoneless end to end (a live or fake-driver call: connect, speak, channel open, whiteboard, end, review mode, resize, composer) and compare against today. This is the actual cost; it is where silent stale-view bugs would appear. Use the `provideZonelessChangeDetection()` test app from `realtime-widget.element.dom.test.ts:82` with the real overlay in place of the stub. | 6 to 10 |
| 3 | Fix whatever step 2 finds: add `markForCheck()` (or convert the field to a signal) in each handler that mutates a Default component's state without one. Candidates to read first: `RevealChannel` target (`overlay :628`), `onFramesFlowing` (`media-tile :324`), thread and composer children. Estimate for a handful; not verified. | 2 to 6 |
| 4 | Delete the zone-era comment and `NgZone` plumbing in the overlay once step 3 passes (`:848`, `:1248`, `:2134-2138`). Low value, skip if the overlay is still shared with a zoned host. | 1 |
| 5 | Drop the zone.js lazy-load bookkeeping: shell tests (`element-bundle.test.ts:123-147`) and `scripts/boot-bundle.mjs:114,136` assert `zoneLoaded`; update them to assert it stays `false` after a call. README line 490 and FINDINGS' "who installs `window.Zone`" row change accordingly. | 1 to 2 |
| 6 | Keep zone.js as a `devDependency` only if other tests need it; otherwise remove. | 0.5 |

Total: about 4 to 7 hours. Steps 1, 4, 5 and 6 are the code, about three hours. Step 2 shrinks to a smoke call or two
(connect, speak, open a channel, end) because the overlay already runs zoneless in Explorer (section 1.1); step 3 covers
whatever that smoke run shows, likely little. Before the Explorer evidence was verified this list read 12 to 20 hours.

Two cross-element effects worth keeping in view for D2:

- The widget's call chunk is the only thing keeping `window.Zone` off pages where the visitor never starts a call.
  Going zoneless removes the 38.8 KB (unminified) zone.js from that chunk (FINDINGS, zone.js table).
- zone.js patches page-global timers and promises. Today, once the call chunk loads, it also patches them for the other
  elements and the host page. That is the contamination D2 is about.

## 2. Orders checkout

### 2.1 How change detection is provided

`scripts/checkout-element-entry.ts:6` `import 'zone.js'` and `:24` `provideZoneChangeDetection()`, unconditionally at
bundle load (this is why FINDINGS measures `window.Zone` set the moment the Orders bundle loads). The element is
built with `createCustomElement(CheckoutPublicHostComponent, { injector: app.injector })` (`:30`). zone.js is both a
`peerDependency` and `devDependency` in `package.json:36,66`.

### 2.2 Places that rely on zone patching to trigger a view update

`CheckoutPublicHostComponent` (`checkout-public-host.component.ts:106-112`) is **Default**, has no `changeDetection`
key, injects `ChangeDetectorRef` (`:114`), and is already written to render by hand: `this.cdr.detectChanges()` appears at
`:265, :321, :370, :538, :609, :666, :677, :702, :716, :731, :769, :803` and ends every async flow in a `finally`
(`ngOnInit :264-265`, `onPromotionApplied :320-321`, submit `:536-538`, renewal `:608-609`). So the pattern "await
something, mutate fields, `detectChanges()`" is already zone-free.

Zone-dependent paths:

1. **Confirmed: the Stripe card `change` handler.** `checkout-public-host.component.ts:865-867`
   `this.card.on('change', (ev) => { this.isPaymentReady = !!ev.complete; })` writes a plain field that the template reads
   (`checkout-public-host.component.html:103` for the renewal Pay button, `:114` as `[isPaymentReady]` into the child).
   Nothing marks the host dirty. It works today only because Stripe.js messages arrive through zone-patched `message`
   listeners (`mountStripe` runs inside the zone via `ngAfterViewChecked :270-280`, and Stripe.js loads from a zone-wrapped
   `script.onload`, `:896-905`; that wrapping is inferred from how zone patches, not observed). Zoneless, typing a valid card
   would leave Pay disabled until something else triggered CD. This is the one genuine break.
2. **Soft spot: host reset.** `resetRequested` (`:385-404`) is a native `addEventListener` handler added at `:921`. It
   clears `config`, `account`, form state, then calls `void this.ngOnInit()` (`:403`). The next render comes from
   `ngOnInit`'s `finally { detectChanges() }` (`:264-265`), after the `/initialize` fetch. Zoneless, the cleared form stays
   on screen for the duration of that request (no immediate repaint), and the early `return`s in `ngOnInit`
   (`:218, :223, :227` set `loadError` and return without `detectChanges`) would leave an error unrendered. Effect: a stale
   or missing message, not a hang. Not run.
3. **Soft spot: late work in `finish()` after `await access` / `leaveIfDone()`** (`:660-677`). Each step already has a
   `detectChanges()`; I found no gap but did not trace every branch of the account and password flow (`:710-805`). Not verified
   beyond the sites listed.
4. **Customer-supplied JS.** `checkout-widget.component.ts:466-468, 489, 553-560` runs `config`-supplied `CustomJS` via
   `new Function('widgetContext', ...)` with `{ component: this }` and fires lifecycle hooks. If a customer script mutates
   widget state from a timer or event, only zone would have rendered it. The child widget is signal-based so writes to its
   signals are safe; writes to its plain inputs are not. Unknown in practice; not verified.

Paths that look zone-bound but are not:

- Turnstile (`checkout-turnstile.ts:75-93, 105-143`): the script `onload` and the `callback` / `error-callback` resolve or
  reject a promise; the awaiting code (`postGated`, `:1011-1030`) ends in `detectChanges()`. Safe.
- Access polling (`:685-711`): a `setTimeout` inside an async loop; renders via `detectChanges()` when the state changes
  (`:702`). Safe.
- Redirects use `window.location.href` (`leaveIfDone`, `:832`). No view.
- Template events (`(click)`, `(input)`, `(submit)`, `(ngModelChange)`) and `@Output`s from the child mark views dirty
  without a zone. `HTML:30-55` examples.

### 2.3 `NgZone.run` / `runOutsideAngular`

None. Searched `src/lib/checkout-widget/` and `scripts/` for `NgZone`, `.run(`, `runOutsideAngular`: no hits.

### 2.4 OnPush vs Default

- Host `CheckoutPublicHostComponent`: Default (hand-driven by `detectChanges()`).
- Child `MJCheckoutWidgetComponent` (`checkout-widget.component.ts:175-179`): `OnPush`, with `signal` / `computed` for nearly
  all of its form state (`:184-250`, `:275-426`). Plain `@Input` fields (`isProcessing :204`, `isPaymentReady :215`,
  `promotionError :230`) update only when the host re-renders, which is the same dependency as item 1 above.

### 2.5 Libraries in the bundle that require zone.js

None. The bundle uses Angular core, common, forms and elements (`package.json:29-36`), plus Stripe.js and Cloudflare
Turnstile loaded from their CDNs at runtime (`checkout-public-host.component.ts:896-905`, `checkout-turnstile.ts:12`).
Neither external script depends on zone.js; both behave as plain browser scripts. `@angular/cdk` is a peer (`:30`) but no CDK
import was found in the checkout-widget folder. FINDINGS reports 90.7 KB of zone.js in this bundle (unminified), none of it
needed by a library.

### 2.6 Conversion list (Orders)

| # | Change | Hours |
|---|---|---|
| 1 | `checkout-element-entry.ts`: drop `import 'zone.js'`, use `provideZonelessChangeDetection()`. Move `zone.js` out of `peerDependencies` (`package.json:36`). | 0.5 |
| 2 | Fix the Stripe handler: in the `change` callback call `this.cdr.detectChanges()` (or `markForCheck()`), or make `isPaymentReady` a signal. One line. | 0.5 |
| 3 | `resetRequested` and `ngOnInit` early returns: add a `detectChanges()` after clearing state (`:403`) and on the three early `return`s (`:218, :223, :227`). | 1 |
| 4 | Test: run the checkout (Stripe test mode, Turnstile test keys) zoneless through free order, paid order, renewal, promo code, account/password step, host reset, cancel. Compare to today. Look for any stale-view moment. | 3 to 4 |
| 5 | Decide the CustomJS contract: document that customer scripts get no automatic change detection, or hand them a `markForCheck`-equivalent in `widgetContext`. Check the shipped CustomJS (if any) for timer-driven state writes. | 1 to 2 |
| 6 | Update tests and FINDINGS' zone rows. | 1 |

Total: about 7 to 9 hours. The risk is concentrated in item 4 (a payment flow is not where you want a silent stale view),
and item 2 is the only change I would call mandatory.

## 3. What this means for D2

- Neither element has a hard architectural dependence on zone.js. Orders has one defect-level dependence (Stripe `change`);
  realtime has none that I could find, but it also has no zoneless run of the real overlay.
- The Default-CD overlay was written zone-defensively (`markForCheck` everywhere, `ngZone.run` re-entry,
  `runOutsideAngular` for hot loops) and runs zoneless in Explorer today (section 1.1), so it is proven in a zoneless host;
  the remaining unknown is only the overlay inside the widget's own element, which a smoke call settles.
- If D2 says "zoneless runtime", the combined effort is roughly 11 to 16 hours across the two: about five hours of code, the
  rest the Orders payment-flow pass (the one place a silent stale view cannot be waved through) and a realtime smoke call. Savings: zone.js leaves the page entirely (38.8 KB in the realtime call chunk, 90.7 KB in Orders, unminified,
  per FINDINGS), and neither element patches page timers or promises for the others.
