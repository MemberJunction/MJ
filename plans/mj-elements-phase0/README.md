# MJ Elements Phase 0: the collision test page

Phase 0 item 1 of [`plans/mj-elements.md`](../mj-elements.md) (PR #5903), and the wave 0 gate of
[`plans/ui-foundation/README.md`](../ui-foundation/README.md) §7: every embeddable MJ custom element on one plain HTML
page, with a probe that records what collides. It produces measurements only. Decisions D3 (light
or shadow DOM) and D4 (icons) are taken in the Lego plan, not here.

What is in the folder:

| File | What it is |
|---|---|
| `index.html` | The page. No framework. Hostile host styles (from the support widget's `examples/two-widgets.html`), the five element tags, a host probe element, and an inline script that loads the bundles in order and snapshots singletons, zone.js, fonts, computed styles, layout and CSP nonces at every step. |
| `serve.mjs` | A static file server for the folder. Needed because the bundles are ES modules, which Chrome will not load over `file://`. It sends the CSP as a header (nonce-based `script-src` and `style-src`, the production shape both MJ widget READMEs describe) and accepts the page's report at `POST /report`. Not an MJ server; nothing talks to MJAPI. |
| `sync-bundles.mjs` | Copies built bundles from their repos into `bundles/` and writes `bundles/manifest.json`, which the page reads. Also compiles `bundles/tokens.css` from `ng-shared-generic`'s `_tokens.scss` (with the realtime widget package's sass), which styles the page's own chrome: the page uses MJ's semantic tokens and no literal colors, and takes them from the same source every MJ surface does rather than a copy that would drift. |
| `measure.mjs` | Reads each bundle's esbuild metafile and prints sizes, where the bytes come from, and what two elements both carry. Writes `sizes.json`. |
| `summarize-report.mjs` | Prints a saved report (`reports/*.json`) step by step, in the form FINDINGS.md cites. |
| `FINDINGS.md` | One row per check: expected, observed, elements, evidence. Only what was observed with the bundles that were built. |
| `.gitignore` | `bundles/` (including `tokens.css`), `reports/`, `sizes.json` and `serve.log` are generated and never committed. |

## Running it

```bash
cd plans/mj-elements-phase0
MJ_ROOT=../.. node sync-bundles.mjs   # after building the elements below; MJ_ROOT defaults to the repo this folder is in
node measure.mjs                       # sizes and attribution, from the metafiles
node serve.mjs                         # http://localhost:8099/
```

Then open the page in a browser and press the buttons in order, or let the query string drive it:

| URL | What it does |
|---|---|
| `/?auto=1` | Loads every bundle present, starts the realtime call on A (accepting the consent notice), loads the support widget's MJ runtime chunk, toggles `color-scheme` twice, prints the report and saves it to `reports/`. |
| `/?auto=1&csp=none` | Same, without the CSP header. |
| `/?auto=1&support=keepnames` | Uses the support widget bundle built with `--keep-names` (see below) instead of its own `bundle:min` shape. |
| `/?auto=1&order=support-first` | Loads the support widget's MJ runtime before the realtime call, so the realtime bundle is the one that finds singletons already on the page. |
| `/?auto=1&first=b` | Starts the call on instance B (no `csp-nonce` attribute, in a parent with no definite height) instead of A. |

The report is also at `window.__phase0`. `node summarize-report.mjs reports/<file>.json` prints it readably.

The page points every element at `http://localhost:9/`, a port nothing listens on, so each element's first
network call fails fast and the page never needs MJAPI. That is enough for every check here: the realtime call
code loads before it connects, and the support widget's runtime chunk is imported directly.

## Building the two MJ elements (in this repo)

```bash
cd packages/Angular/Generic/realtime-widget && pnpm run build
# emits dist/element/: mj-realtime-widget.js (shell, classic script), mj-realtime-widget-session.js (the call, ES module), chunks/, meta.json, sizes.json
```

```bash
cd packages/Web/RealtimeWidget && pnpm run build
# the browser bundle is NOT part of `build`; this is the package's own `bundle:min` line plus a metafile (quote the chunk-names glob in zsh):
npx esbuild dist/embed.js --bundle --splitting --minify --format=esm --platform=browser --outdir=dist/embed-min --entry-names=mj-widget '--chunk-names=chunks/[name]-[hash]' --metafile=dist/embed-min/meta.json
# the same with --keep-names, so its singleton keys match the realtime bundle's (the package's own `bundle:min` has no keep-names; both are measured):
npx esbuild dist/embed.js --bundle --splitting --minify --keep-names --format=esm --platform=browser --outdir=dist/embed-min-keepnames --entry-names=mj-widget '--chunk-names=chunks/[name]-[hash]' --metafile=dist/embed-min-keepnames/meta.json
```

Both package builds need the workspace's dists in place (ngc output of `ng-shared-generic`, `ng-ui-components`,
`MJCore`, and so on). If a package build fails on a missing dist, run the root build first.

## Adding the three Open App elements

The bizapps repos are not in this checkout. Clone them beside it, build each element with its own script, then
point `sync-bundles.mjs` at the clones. Commands below were read from each repo's `package.json` and build script on
its `next` branch on 2026-10-19, and the measurements in FINDINGS.md came from exactly this sequence that day
(bizapps-forms `d665fce3`, bizapps-orders `514d09bf`, bizapps-caliber `0dbb43a7`).

```bash
# Forms (public). <mj-form>: an IIFE at packages/Angular/dist/widget/mj-form.js, built by ngc + scripts/build-widget.mjs.
gh repo clone MemberJunction/bizapps-forms ../bizapps-forms
cd ../bizapps-forms && pnpm install && pnpm run build        # root turbo build; `pnpm run build:widget` rebuilds just the bundle afterwards
```

```bash
# Orders (public). <mj-orders-checkout>: an ES module at packages/Angular/dist/checkout-element/main.js, built by ngc + scripts/build-checkout-element.mjs.
gh repo clone MemberJunction/bizapps-orders ../bizapps-orders
cd ../bizapps-orders && pnpm install && pnpm run build
```

```bash
# Caliber (internal; needs org access). <caliber-widget>: an IIFE at packages/Angular/dist/widget/caliber-widget.js plus dist/widget/meta.json, built by ngc + scripts/build-widget.mjs.
gh repo clone MemberJunction/bizapps-caliber ../bizapps-caliber
cd ../bizapps-caliber && pnpm install && pnpm run build
```

A root `pnpm run build` runs every package, and a root `setup` expects a database. The measurement needs only the
Angular package and the workspace packages it imports, which turbo's dependency filter builds without a database
(about 10 seconds each after `pnpm install`):

```bash
cd ../bizapps-forms && pnpm exec turbo --log-order=stream build --filter='@mj-biz-apps/forms-ng...'
```

```bash
cd ../bizapps-orders && pnpm exec turbo --log-order=stream build --filter='@mj-biz-apps/orders-ng...'
```

```bash
cd ../bizapps-caliber && pnpm exec turbo --log-order=stream build --filter='@mj-biz-apps/caliber-ng...'
```

```bash
BIZAPPS_FORMS=../bizapps-forms BIZAPPS_ORDERS=../bizapps-orders BIZAPPS_CALIBER=../bizapps-caliber node sync-bundles.mjs
node measure.mjs
```

Metafiles: Caliber writes `dist/widget/meta.json`. Forms keeps the metafile in memory for its own guard
(`assertNoServerOnlyInputs`) and does not write it; Orders does not request one. Without a metafile `measure.mjs`
reports raw and gzip sizes only, no attribution. The manifest expects `dist/widget/mj-form.js.meta.json` (Forms) and
`dist/checkout-element/main.js.meta.json` (Orders). They were produced for FINDINGS.md with a temporary edit to each
build script, run once, then reversed so the clones stayed clean:

- Forms, `packages/Angular/scripts/build-widget.mjs`, after `assertNoServerOnlyInputs(result.metafile);`: write
  `JSON.stringify(result.metafile)` to `outFile + '.meta.json'`, then `node scripts/build-widget.mjs`.
- Orders, `packages/Angular/scripts/build-checkout-element.mjs`: keep the result of `esbuild.build({ metafile: true, ... })`
  and write its `.metafile` to `dist/checkout-element/main.js.meta.json`, then `node scripts/build-checkout-element.mjs`.

The better fix is upstream: both scripts writing the metafile the way Caliber's does.

Attributes, read from each element's source: `<mj-form slug api-url>` (Forms also takes `token` and
`turnstile-site-key`); `<mj-orders-checkout slug api-root csp-nonce>` (its Angular inputs are `slug`, `apiRoot`,
`memberToken`, `renewalToken`; Orders reads the nonce off the first `<mj-orders-checkout>`); `<caliber-widget api-url
protocol-id>` (plus `invite-token` or a `?ct=` magic link). The page points each at `http://localhost:9/` so its first
request fails fast.

## The page's own look

Everything outside the element cards (header, controls, log, report) is styled with the `--mj-*` semantic tokens from
`bundles/tokens.css`, light on `:root` and dark on `[data-theme="dark"]`; the page sets `data-theme` from
`prefers-color-scheme` at load and the color-scheme toggle flips it, the way an MJ host would. The element cards are the
host under test: a serif font, their own text color, `!important` button rules and a class name the realtime shell also
uses, drawn from the same palette so the page stays readable (the support widget's `two-widgets.html` uses hotpink and
yellow for the same purpose; the probe reads computed values, so any distinct value serves).

## What the probe records, and how

- **Singletons.** `window` keys starting with `___SINGLETON__` (`packages/MJGlobal/src/BaseSingleton.ts`), with the
  constructor name, an identity number (so a reused instance is told apart from a replaced one), which copy of
  `BaseSingleton` sits in its prototype chain, and for `MJGlobal` the length of its `ClassFactory` registration array
  and any base class registered under two different class objects. An `instanceof` matrix checks the shared instance
  against every `BaseSingleton` copy on the page.
- **zone.js.** An accessor trap on `window.Zone` records the first assignment with the script that made it.
- **Fonts.** `@font-face` rules in every stylesheet, adopted stylesheet and shadow root, `document.fonts`, and
  families declared more than once.
- **Style bleed.** Computed styles (font, color, background, border, text-transform, letter-spacing, color-scheme) of
  the host probe, the host button, each realtime instance's buttons, the support widget's launcher inside its shadow
  root, and the three Open App tags. The host's own `--mj-brand-primary` is read back to see whose cascade won.
- **Layout.** Bounding heights of every element, including instance B and `<caliber-widget>` in parents with no
  definite height.
- **CSP nonces.** The nonce on every `<style>` the bundles add to `<head>`, on the realtime shell's style element (or
  that it used `adoptedStyleSheets`), on preload links, and on the support widget's shadow `<style>`, plus every
  `securitypolicyviolation` event.
- **color-scheme.** The page's `color-scheme` is toggled `light dark` to `light` to `dark`; each element's computed
  `color-scheme` and the realtime `data-theme` are recorded.
- **Errors.** `window.error`, unhandled rejections and `console.error` since the previous step.

The Claude in Chrome extension injects a `<style id="claude-agent-...">` into pages it drives; the probe ignores
style elements with that id prefix so the head-style counts are the bundles' own.

## The connected run (real MJAPI)

Everything above runs with no server. For the post-connect checks in FINDINGS.md §4 the two MJ elements need a
reachable MJAPI and a widget key; the three Open App elements still fail at their first request, since their APIs are
their own.

1. **A widget instance.** One `MJ: Conversation Widget Instances` row serves both elements when its `Modality` is
   `Both`. It needs an application, a pinned agent and a guest role (the migration seeds a `Widget Guest` role), and
   `AllowedOrigins` must contain the page's origin exactly (`http://localhost:8099`; the mint is fail-closed on the
   `Origin` header). The key is any string in `PublicKey`; the convention is `pk_…`. The row used for the findings:

   ```sql
   INSERT INTO __mj.ConversationWidgetInstance (Name, PublicKey, ApplicationID, PinnedAgentID, GuestRoleID, AllowedOrigins, Modality, AuthStrategy, Status, SessionTTLMinutes, RateLimitPerMinute, VoiceMaxSessionMinutes)
   VALUES (N'MJ Elements Phase 0 test page', N'pk_test_phase0_<random>', '<Chat application ID>', '<Sage agent ID>', '<Widget Guest role ID>', N'http://localhost:8099', N'Both', N'Anonymous', N'Active', 15, 30, 5);
   ```

2. **MJAPI with a public URL the server itself can reach.** The widget reuses the magic-link signing key, and the auth
   provider fetches that key from `${MJAPI_PUBLIC_URL}/magic-link/jwks.json`. If `MJAPI_PUBLIC_URL` points anywhere the
   server cannot fetch from (a tunnel that is down, a different deployment), every guest token fails with
   `JwksError: Not Found` and GraphQL answers `Authentication failed`. `mj.config.cjs` needs `widget.enabled: true`
   (it is, in this repo). Turbo's `start` task does not pass `MJAPI_PUBLIC_URL` through, so set it where the server
   is started directly:

   ```bash
   cd packages/MJAPI && MJAPI_PUBLIC_URL=http://localhost:4000 pnpm start
   ```

3. **Check the mint from the shell** with a browser user agent (the mint rejects anything that looks like a bot with
   the same 403 it uses for a bad origin):

   ```bash
   curl -s -A "Mozilla/5.0 (Macintosh) Chrome/155" -H "Content-Type: application/json" -H "Origin: http://localhost:8099" -d '{"widgetKey":"pk_test_phase0_…"}' http://localhost:4000/widget/session
   ```

   A `token` in the answer, and `{"data":{"__typename":"Query"}}` from `POST /` with `Authorization: Bearer <token>`,
   means the page will connect.

4. **Open the page with the API and key in the URL** (keys stay out of the files; saved reports redact them):

   ```
   http://localhost:8099/?api=http://localhost:4000&rtkey=pk_test_phase0_…&supportkey=pk_test_phase0_…&csp=none&support=keepnames
   ```

   Press "1. Load element bundles", then "2a. Start realtime call on A"; Chrome asks for the microphone. The support
   widget mounts itself after its mint (the page waits up to eight seconds for that before mounting one by hand). Use
   `support=keepnames`: built by its own `bundle:min` script (no keep-names), the support widget's loader fails on a real session (FINDINGS.md §4, first row).
   Run it once more without `csp=none` for the nonce-CSP variant.

The database must be at the branch's migrations; a stale one fails in the session janitor on `RecordingStatus` and
is fixed by `mj migrate` (confirm no other session is using that database first).
