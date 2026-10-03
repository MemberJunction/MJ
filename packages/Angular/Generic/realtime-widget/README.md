# @memberjunction/ng-realtime-widget

`<mj-realtime-widget>`: a realtime voice agent you can drop into any web page.

It ships two ways from one codebase:

- **A one-script custom element.** `dist/element/mj-realtime-widget.js` is a small (about 8 KB gzipped) script. Load it, write the tag, done. It draws the start button and the consent notice by itself, and downloads the call code only when a visitor starts a call (or when you ask it to prefetch). No framework on your page, no host application, no `unsafe-eval`.
- **An Angular component.** `RealtimeWidgetComponent` (selector `mj-realtime-widget`) for an Angular application that wants the same widget in a template.

The call itself is MemberJunction's own realtime overlay (voice orb, live thread, channel surfaces, mute, end). The widget adds what a public page needs around it: authentication, a consent gate, resuming, tab-close cleanup, theming, and a small DOM contract of attributes, properties, methods and events.

> Not to be confused with `@memberjunction/realtime-widget` (`packages/Web/RealtimeWidget`), the shadow-DOM customer-support chat widget. This package is the realtime **voice** widget built on MemberJunction's Angular realtime overlay and channels; it has a different element (`<mj-realtime-widget>`), a different bundle and a different API.

- [Quick start](#quick-start)
- [Authentication modes](#authentication-modes)
- [Reference](#reference): attributes, properties, methods, events
- [Channels](#channels) and the [anonymous to verified flow](#anonymous-to-verified-flow-end-to-end)
- [Theming](#theming), [Install and loading](#install-and-loading) and [Content-Security-Policy](#content-security-policy)
- [Examples](#examples): plain HTML, vanilla JS, Angular, React, CMS snippet
- [Try it](#try-it) and [Building](#building)
- [Things worth knowing](#things-worth-knowing)

## Quick start

```html
<script src="https://your-cdn.example.com/mj-realtime-widget.js"></script>

<mj-realtime-widget
  api-url="https://api.example.com"
  widget-key="pk_live_xxxxxxxx"
  agent-name="Sage"></mj-realtime-widget>
```

That is the whole integration for an anonymous visitor. The widget shows a "Talk to Sage" button; pressing it shows a consent notice; accepting it mints a guest session from your widget key and starts the call.

Host the **whole `dist/element/` folder** yourself (it is built by `pnpm run build` in this package) or copy it into your site's assets, and point the `<script>` at `mj-realtime-widget.js`. The call code (`mj-realtime-widget-session.js` and `chunks/`) must sit beside it: the widget finds it by its own URL, so a CDN path needs no configuration. Nothing in it is tied to a MemberJunction domain. See [Install and loading](#install-and-loading) for what loads when.

## Authentication modes

The widget decides how to authenticate from the attributes you give it. Exactly one applies, in this order of precedence: `launcher`, `widget-key`, `invite-token`, `token`, and finally none (see `host`).

| Mode | You provide | What happens | Use it when |
| --- | --- | --- | --- |
| **widget-key** | `api-url`, `widget-key` | The widget calls `POST {api-url}/widget/session` with your public key and receives a short-lived anonymous guest JWT. It renews the JWT through `/widget/session/refresh`. The **server** pins the agent and application; `agent-id` is ignored. | A public page, anonymous visitors. This is the common case. |
| **invite-token** | `api-url`, `invite-token` (`mj_ml_…`), `agent-id` | The invite is redeemed once (`POST /magic-link/redeem?format=json`) for a session JWT. The redeemed session is remembered for the tab, so a reload does not try to spend the single-use invite again. | You emailed someone a link that opens a conversation with an agent. |
| **token** | `token`, `agent-id`, `api-url` | The widget holds a session JWT your page already has, as is. It cannot renew it. | Your backend minted a session for a signed-in person. |
| **launcher** | the `launcher` property | You mint the session yourself (any transport, any server) and return the result. The widget runs the call on it. No `agent-id` needed. | You have your own minting endpoint or a proxy in front of MemberJunction. |
| **host** | nothing | The page is itself a MemberJunction application whose GraphQL provider is already authenticated. | The Angular component inside an MJ application. |

### widget-key

```html
<mj-realtime-widget api-url="https://api.example.com" widget-key="pk_live_xxxxxxxx"></mj-realtime-widget>
```

The key identifies a `ConversationWidgetInstance` on your server. The instance decides the agent, the application, whether voice is enabled, the longest call, and which channels the visitor's session may use. If voice is not enabled for the instance the widget says so instead of failing silently. A rejected key gets the same answer whether it never existed or was revoked, so keys cannot be probed.

### invite-token

```html
<mj-realtime-widget
  api-url="https://api.example.com"
  invite-token="mj_ml_xxxxxxxx"
  agent-id="8F0B1C2E-0000-0000-0000-000000000000"></mj-realtime-widget>
```

A spent or expired invite is reported in words ("this link has already been used", "this link has expired") with a way forward, never as a bare error.

### token

```html
<mj-realtime-widget
  api-url="https://api.example.com"
  token="eyJhbGciOi…"
  agent-id="8F0B1C2E-0000-0000-0000-000000000000"></mj-realtime-widget>
```

Set `token` as a property rather than an attribute if you would rather not put a credential in the markup (`el.token = jwt`). Because the widget cannot renew a token it was handed, a call that outlives it ends with a clear message. Mint tokens that live at least as long as a call.

### launcher

A launcher is any object with one method, `Launch(request, context)`, that returns the same record MemberJunction's `StartRealtimeClientSession` mutation returns. `request` carries the agent, application, conversation, the channel candidates and the client policy, so a launcher that forwards them to a server matches the default behaviour exactly.

```js
const widget = document.querySelector('mj-realtime-widget');
widget.launcher = {
  async Launch(request, context) {
    const response = await fetch('/api/realtime/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error('Could not start the call');
    return response.json(); // the StartRealtimeClientSession result
  }
};
```

If the launcher throws, the widget reports `mj-error` with the code `launcher-failed` and the error's message.

## Reference

HTML attributes are kebab-case; the matching element properties are camelCase. Set either: they stay in sync. Attribute values are strings and are coerced; properties accept real types. Attributes and properties may be set before or after the element is attached.

### Attributes and properties

| Attribute | Property | Type | Default | Meaning |
| --- | --- | --- | --- | --- |
| `api-url` | `apiUrl` | string | none | Root URL of your MemberJunction API. Required for every mode except `launcher` and `host`. |
| `widget-key` | `widgetKey` | string | none | Public widget key. Selects widget-key mode. |
| `invite-token` | `inviteToken` | string | none | Magic-link invite (`mj_ml_…`). Selects invite-token mode. |
| `token` | `token` | string | none | A session JWT you already hold. Selects token mode. |
| `agent-id` | `agentId` | string (UUID) | none | The agent to talk to. Required for invite-token and token. Ignored with a widget key (the server pins the agent). |
| `application-id` | `applicationId` | string (UUID) | none | The application the session runs in. With a widget key the server supplies it. |
| `conversation-id` | `conversationId` | string (UUID) | none | Continue an existing conversation. |
| `channels` | `channels` | comma list or JSON array; as a property an array | none | Channels your page brings to the session, by name. See [Channels](#channels). |
| `channel-inputs` | `channelInputs` | JSON object; as a property an object | `{}` | Seed inputs per channel name. Each named channel is opened with them as soon as the call is live. |
| `chrome` | `chrome` | `orb` \| `console` \| `auto` | `auto` | `orb` is the ambient voice orb. `console` is the structured layout with channel surfaces beside the thread. `auto` starts as the orb and switches to the console while a channel that has a surface (such as identity verification) is open. |
| `auto-start` | `autoStart` | boolean | `false` | Begin by itself once configured instead of waiting for `start()` or the start button. The consent gate still shows first when required. |
| `require-consent` | `requireConsent` | boolean | `true` | Show the consent notice before the microphone is touched. Declining starts nothing. |
| `theme` | `theme` | `light` \| `dark` \| `auto` | `auto` | The colour scheme. `auto` follows the page (an ancestor's `data-theme`), then the visitor's OS setting. As an attribute it may instead hold a JSON object of token overrides. |
| `theme-tokens` | `themeTokens` | JSON object; as a property an object | `{}` | `--mj-*` token overrides. See [Theming](#theming). |
| `locale` | `locale` | BCP-47 tag | none | The language of the widget's own copy, and the `lang` of the element. The built-in table is English; add another with `RegisterWidgetLocale` when using the component. |
| `agent-name` | `agentName` | string | `Assistant` | The name shown on the button and in the consent notice. Cosmetic. |
| `csp-nonce` | `cspNonce` | string | none | Your page's CSP nonce, used for the styles the widget injects. See [Content-Security-Policy](#content-security-policy). |
| `perception` | `perception` | `on` \| `off` \| `ask` | `ask` | Whether the agent may *see* what the person shares (a whiteboard, a shared screen, a rendered component). `ask` pre-fills nothing: the server's policy decides what is possible and the "agent can see" control lets the person choose. `on` pre-sets the person's choice to "may see". `off` pre-sets it to "may not see pixels" (the agent still learns what is on screen as text). The person's own choice in the control always wins over the pre-set, and `on` can never exceed what the server's policy allows. Changing it mid-call re-applies it. Every change to what the agent can see is reported as `mj-perception-changed`. |
| `frame-capture` | `frameCapture` | boolean | `false` | The page's statement that a rendered component may be captured as an image for the agent. **The rasterizer that honours it ships with Channels v2 Phase 2; until then this records your intent**, and the widget logs one notice if it is on and no rasterizer is registered. |
| `preload` | `preload` | `none` \| `hover` \| `idle` \| `eager` | `hover` | When to start downloading the call code (see [Install and loading](#install-and-loading)). The code is only *downloaded*, never run, until a call starts. |
| `session-url` | `sessionUrl` | URL | beside the script | Where the call code is, when it is not next to `mj-realtime-widget.js`. Absolute, or relative to the script. |
| none | `launcher` | `IRealtimeSessionLauncher` | `null` | A JS-only way to mint the session yourself. Selects launcher mode. |

Boolean attributes accept `true`, `1`, `yes`, `on` and the empty attribute (`<mj-realtime-widget auto-start>`) as true; `false`, `0`, `no` and `off` as false.

The current phase is always on the element as `data-phase` (`idle`, `consent`, `booting`, `connecting`, `live`, `ended`, `error`), so CSS and scripts can react to it without listening.

### Methods

All are on the element. Methods that return a promise never reject for an operational failure; they resolve to a structured result, and failures are also reported as `mj-error`.

| Method | Returns | Does |
| --- | --- | --- |
| `start()` | `Promise<void>` | Starts the call. With `require-consent` the consent notice shows first (the promise resolves once it is showing) and neither the microphone nor the call code is touched until the visitor chooses Begin. Otherwise it downloads the call code, connects, and resolves when the call is live or has failed. Ignored while a call is starting or live. Rejects only when the element has never been attached to a document. |
| `end()` | `Promise<void>` | Ends the call. Safe when none is live. Called while a start is still in progress (the code is downloading, or the consent notice is showing), it **abandons that start**: nothing loads further, nothing connects, and the widget returns to `idle`. It never hangs up a call that another widget or your page started. |
| `openChannel(key, inputs?)` | `Promise<{ success, result?, error?, errorCode? }>` | Opens (and seeds) a channel in the call, exactly as the agent's own `open` action would. **Before the call is live** it is queued if a start is pending (the consent notice is showing, the code is loading, or `auto-start` has not fired yet) and runs, in order, the moment the call goes live; it resolves to a failure (`errorCode: 'no_session'`) if the call never gets there (declined, failed to load, ended). With no start pending it resolves to `no_session` at once; it never starts a call by itself. Once live it resolves with the channel's answer, or a structured error for a channel that is not in the session or inputs the channel rejects. |
| `sendContextNote(text)` | `void` | Tells the agent something in the background: it learns it but does not speak. **Before the call is live** (even before `start()`) the note is queued, up to 20 (the oldest are dropped), and delivered in order when the next call goes live. Notes still queued when a call ends are dropped, so one call's context is never replayed into the next. |
| `requestSpokenResponse(text)` | `boolean` | Asks the agent to speak, now, about `text`. Returns whether the request was delivered. It is about *now*, so it is **never queued**: `false` unless the call is live. |
| `registerChannel(classRef)` | `void` | Registers a channel class your page brings (a subclass of `BaseRealtimeChannelClient`). Allowed at any time, including before the element is attached or before the call code has loaded; it is declared to every call the widget starts. |

### Events

Every event is a `CustomEvent` that **bubbles and is composed**, so you can listen on the element, on a wrapper, or on `document`. The payload is in `event.detail`.

| Event | `detail` | Fires |
| --- | --- | --- |
| `mj-ready` | `{ mode, autoStart }` | Once, after the first render. `mode` is the resolved auth mode. |
| `mj-phase-changed` | `{ phase, previous }` | On every phase change. |
| `mj-session-started` | `{ sessionId, agentId, conversationId, channels }` | When the call is accepted. `channels` lists those mounted with it. |
| `mj-session-ended` | `{ sessionId, reason }` | When the call ends. `reason` is `user`, `error`, `deadline`, `page-close` or `remote`. |
| `mj-verified` | `{ sessionId, email, name, verifiedAt, method, maxSessionDeadline?, recovered }` | When the **server** confirms the person controls an email address. `method` is `code` or `link`. `recovered` is true when the widget learned of it by reading the status after a dropped connection. |
| `mj-session-event` | `{ type, sessionId, occurredAt, payload }` | For every server-published session event, including `identity.verified`. Unknown types pass through unchanged. |
| `mj-channel-opened` | `{ channel, instance, inputs }` | A channel opened. |
| `mj-channel-event` | `{ channel, instance, name, payload, changeId?, occurredAt }` | A channel emitted a typed event (a value filled, a code sent, …). |
| `mj-channel-output` | `{ channel, instance, output, occurredAt }` | A channel completed with a result. |
| `mj-perception-changed` | `{ sourceId, label, channel, enabled, active, sources[] }` | The agent's view of a video source (a whiteboard, a shared screen, a rendered component) was switched on or off, by the person in the "agent can see" control, by your `perception` setting, or by the server's policy. `channel` is the channel the source belongs to, or `null`. `sources` lists every source with its state after the change. Appearing or disappearing sources are not toggles and are not reported. |
| `mj-error` | `{ code, message, phase }` | Something failed. `message` is written for a visitor and always includes a way forward. Never a dead end: the widget offers "Try again". |

`mj-error` codes: `load-failed` (the call code could not be downloaded; the widget offers Try again), `no-credential`, `no-agent`, `auth-failed`, `session-expired`, `voice-not-enabled`, `launcher-failed`, `start-failed`, `start-dropped`, `connection-lost`, `channel-failed`.

**Attach your listeners early.** Listeners attach to the element itself, so they work before the element is upgraded, and `mj-ready` fires only once. Put your script above the widget bundle (as the sample page does), or read `data-phase` instead of waiting for `mj-ready`.

## Channels

Channels are small interactive surfaces that live beside the conversation: a form, a whiteboard, a media player. The agent can open and drive them; some can be driven by the visitor too. A page brings channels with the `channels` attribute and seeds them with `channel-inputs`:

```html
<mj-realtime-widget
  api-url="https://api.example.com"
  widget-key="pk_live_xxxxxxxx"
  channels="IdentityVerification"
  channel-inputs='{"IdentityVerification":{"name":"Ada"}}'></mj-realtime-widget>
```

**Built in** (nothing to register; name them in `channels`):

| Channel | Where it lives | Notes |
| --- | --- | --- |
| `IdentityVerification` | the call code | Name, email and a one-time code, verified by the server. See below. |
| `Whiteboard` | the call code | A shared board the agent can read and draw on. |
| `Media` | the call code | Plays audio, video and images for the visitor. |
| `InteractiveComponent` | **its own lazily loaded file** | Shows an interactive component (a chart, a report, a form) the agent can operate. It downloads only when a call could use it: it is named in `channels` (or by the widget instance), or a registry lists it. A call that never names it never downloads it. It loads the visitor's artifacts through the visitor's own signed-in access, so it is for authenticated sessions. |

With a widget key, the instance's own channel list is added to yours. Any other key (`RemoteBrowser`, `ClientContext`, your own) is resolved through the MemberJunction class factory, so it works in the Angular component inside an application that already loads it, and in the bundle when your page registers a class under that key with `registerChannel`.

A channel with a surface shows it beside the thread when the widget is wide enough (about 560px) or when `chrome="console"`. With `chrome="auto"` the widget promotes itself to the console while such a channel is open, so a narrow embed never hides a form the agent just opened.

### The IdentityVerification channel

A person proves they control an email address without leaving the conversation.

- **Nouns** (what the agent can see): `name`, `email`, `status`, `confirmed`, `problem`.
- **Verbs**: `fill` (the agent or the user), `confirm` (**the user only**), `submit`, `resend`, `enter_code`.
- A value the agent fills is shown as "Suggested by Sage" until the visitor confirms it. The agent cannot confirm on the visitor's behalf; that is enforced in the channel, not just the surface. Typing a value yourself counts as confirming it.
- The six-digit code is typed by the visitor into the surface. It is never stored by the channel and is never shown to the agent.
- The server sends the email, enforces its policy (business-domain rules, rate limits, attempts, expiry) and is the only thing that decides the person is verified.

## Anonymous to verified flow, end to end

1. The page loads with a widget key. The visitor is **anonymous**: a guest session with a short ceiling on call length.
2. The visitor presses the button, accepts the consent notice, and the call starts. `mj-session-started` fires.
3. During the conversation the agent decides it needs a verified identity (to book something, send an order summary, continue later) and opens the **IdentityVerification** channel. The widget switches to the console layout and shows the small form. `mj-channel-opened` fires.
4. The agent fills the name and email it heard. The form shows them marked as the agent's suggestions. The visitor corrects them if needed and confirms. `mj-channel-event` fires for each step (`field_filled`, `confirmed`).
5. The visitor presses **Send code**. The server emails a six-digit code (and a link). `mj-channel-event` reports `code_sent`.
6. The visitor types the code (or opens the link). The server checks it. On success it marks the session verified, **extends the call's deadline**, and publishes `identity.verified`.
7. The widget receives that event: it tells the agent, quietly, that the person is now verified (a background context note, so the agent does not repeat itself), moves its own deadline to the server's new one, and dispatches `mj-verified` and `mj-session-event`. The channel's output fires `mj-channel-output` with `{ verified, email, name }`.
8. Your page hears `mj-verified` and can respond: show the visitor's name, unlock a section, post to your backend, or ask the agent to say something.

```js
widget.addEventListener('mj-verified', (event) => {
  const { email, name, sessionId, recovered } = event.detail;
  document.querySelector('#greeting').textContent = `Thanks, ${name || email}.`;
  // Optional: have the agent say something now. Skip when `recovered` is true
  // (the widget learned of the verification after a reconnect; the agent was told already).
  if (!recovered) widget.requestSpokenResponse('Thank the person briefly and ask how you can help next.');
});
```

What the server guarantees, and the widget never overrides: the verification is single-use, expires, and compares codes in constant time; a verified identity is never forged by the visitor's own session; and verification never creates an MJ user or changes who the session belongs to. If the connection drops mid-flow the widget re-subscribes and reads the verification status once, so a verification that completed while it was offline is still announced (with `recovered: true`).

## Theming

The widget carries no colours of its own. Every surface, including the hosted overlay, reads only `var(--mj-*)` design tokens, so a page repaints everything by overriding tokens on the element.

```html
<mj-realtime-widget
  theme="dark"
  theme-tokens='{"brand-primary":"#0a7a55","brand-primary-hover":"#08603f","radius-md":"12px"}'></mj-realtime-widget>
```

```js
widget.themeTokens = { 'brand-primary': '#0a7a55', '--mj-text-primary': '#10201a' };
```

Keys may be written with or without the `--mj-` prefix. Anything that is not an MJ token (any other `--custom-property`) is ignored, and values are passed through verbatim, so light/dark parity is yours to keep. Overrides land inline on the element and outrank everything.

The common tokens: `brand-primary`, `brand-primary-hover`, `text-primary`, `text-secondary`, `text-muted`, `bg-surface`, `bg-surface-card`, `bg-page`, `border-default`, `status-success`, `status-error`.

**How the defaults arrive.** A one-script embed lands on a page that never loaded MJ's stylesheets, so the widget brings the token set, the button styles and the Font Awesome icon font itself, in a CSS cascade layer named `mj-realtime-widget-defaults`. Layered styles lose to any unlayered ones, so if the page is itself a MemberJunction application (or defines the same tokens), the page's values win and the widget only fills gaps.

**Light and dark.** `theme="light"` and `theme="dark"` are explicit. `theme="auto"` defers to the page (an ancestor with `data-theme`), then to the visitor's operating-system setting. The dark token set is keyed on `[data-theme="dark"]`.

**Shadow DOM.** The widget uses the light DOM on purpose. A web font's `@font-face` does not register from inside a shadow root, so a shadow boundary would unstyle the very icons and buttons the widget is made of. Isolation is by a `mjw-` class prefix and the cascade layer.

## Install and loading

The embed is several files, loaded in stages, so a page that never starts a call pays almost nothing:

| File | What it is | When it loads | Size (raw / gzip) |
| --- | --- | --- | --- |
| `mj-realtime-widget.js` | The **shell**: a classic `<script>` that defines `<mj-realtime-widget>`, parses attributes, exposes the whole property/method/event contract, and draws the start button, the consent notice and the status screens | With your page | 25.7 KB / **8.3 KB** |
| `mj-realtime-widget-session.js` and the 13 chunks it imports | The **call**: Angular, MemberJunction's realtime overlay, runtime, drivers, the GraphQL client, and the built-in channels (identity, whiteboard, media) | On `start()` (after consent), on `auto-start`, or prefetched by `preload` | 10.1 MB / 2.5 MB together |
| `chunks/interactive-chunk-entry-*.js` | The Interactive Component channel | Only when that channel is in the call's scope | 51 KB / 15 KB |
| `chunks/*.js` (the rest) | Libraries the call loads only if a feature needs them (spreadsheet export, maths rendering, diagram types) | On demand | 4.9 MB / 1.5 MB in total |

These are measured from the build (`dist/element/sizes.json`); the build fails if the shell ever exceeds 40 KB gzipped or a heavy dependency leaks into it.

- **Where the files go.** Keep `dist/element/` together. The shell finds the call code **relative to its own URL**, so a CDN path works with no configuration. If you must put them apart, set `session-url`.
- **Cache.** The shell's name never changes, so give it a short cache lifetime and version the folder (`/widget/6.2.0/`); the chunks have content-hashed names and can be cached for a year.
- **`preload`** decides when the call code starts *downloading* (it is never run until a call starts, because running it patches the page's timers and promises):
  - `hover` (default): when the pointer or keyboard focus reaches the start button, or on touch. Because the notice takes the visitor a few seconds to read, the download is usually finished by the time they accept.
  - `idle`: once the browser is idle after the page settles.
  - `eager`: as soon as the element is attached. Use it when most visitors will talk.
  - `none`: only when the call starts.
  The prefetch is a `<link rel="modulepreload">`, so it also warms the call code's imports.
- **Declining consent costs nothing.** With `require-consent` (the default) the consent notice is drawn by the shell; the call code is not fetched and the microphone is not touched until the visitor accepts.
- **CORS.** The shell is a classic script and needs no CORS headers. The call code is loaded as ES modules, which browsers fetch in CORS mode, so when the files are on a different origin than your page the host must send `Access-Control-Allow-Origin`.

## Content-Security-Policy

The call code is compiled ahead of time with the Angular linker, so it needs no JIT compiler and runs under a policy **without** `unsafe-eval`:

```
script-src 'self' https://your-cdn.example.com;
style-src  'self' 'nonce-RANDOM';
font-src   'self' data:;
img-src    'self' data:;
connect-src https://api.example.com;
media-src  blob:;
```

- **`script-src`** must allow the origin the widget files are served from. That one entry covers the shell **and** the call code and its chunks, because they are loaded from the same folder (the chunks are ES modules fetched with `import()`, which `script-src` governs by URL). With a nonce-based policy and `'strict-dynamic'`, the nonced shell is trusted to load them; with a nonce but without `strict-dynamic`, allow the CDN origin by host as well. The `preload` link carries your nonce too.
- **`connect-src`** must allow your MemberJunction API origin (HTTPS and the WebSocket origin used for live events).
- **Styles.** The shell's own styles use a constructed stylesheet where the browser has one, which needs no CSP allowance. The call code's Angular components write `<style>` elements: give the widget your page's nonce and it applies it to them, with `csp-nonce="RANDOM"` on the element or any `<script nonce>` / `<style nonce>` already on the page (the first one found is used). Without a nonce, the policy needs `style-src 'unsafe-inline'`.
- **Fonts and icons** are inlined (`data:` URIs), so no extra font host is needed.
- **Microphone.** Browsers require HTTPS (or `localhost`) for microphone access, and any `Permissions-Policy` on your page must allow `microphone` for the embedding frame.

## Examples

### Plain HTML

```html
<!doctype html>
<html lang="en">
  <body>
    <h1>Talk to us</h1>

    <mj-realtime-widget
      api-url="https://api.example.com"
      widget-key="pk_live_xxxxxxxx"
      agent-name="Sage"
      theme="auto"></mj-realtime-widget>

    <script src="/assets/mj-realtime-widget.js"></script>
  </body>
</html>
```

### Vanilla JS

```html
<mj-realtime-widget id="widget" api-url="https://api.example.com" widget-key="pk_live_xxxxxxxx"
                    channels="IdentityVerification"></mj-realtime-widget>

<script src="app.js"></script>              <!-- listeners first -->
<script src="/assets/mj-realtime-widget.js"></script>
```

```js
// app.js
const widget = document.getElementById('widget');

widget.addEventListener('mj-session-started', (e) => console.log('call started', e.detail.sessionId));
widget.addEventListener('mj-session-ended', (e) => console.log('call ended', e.detail.reason));
widget.addEventListener('mj-error', (e) => console.warn(e.detail.code, e.detail.message));
widget.addEventListener('mj-verified', (e) => saveVerifiedLead(e.detail));

document.getElementById('talk').addEventListener('click', () => widget.start());
document.getElementById('verify').addEventListener('click', async () => {
  const result = await widget.openChannel('IdentityVerification', { name: 'Ada' });
  if (!result.success) console.warn(result.error);
});

// Tell the agent what the visitor is looking at, without making it speak.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) widget.sendContextNote(`The visitor is on ${location.pathname}.`);
});
```

### Angular

As a component (inside an application that already provides MemberJunction's services):

```ts
import { Component } from '@angular/core';
import { RealtimeWidgetComponent } from '@memberjunction/ng-realtime-widget';

@Component({
  selector: 'app-help',
  standalone: true,
  imports: [RealtimeWidgetComponent],
  template: `
    <mj-realtime-widget
      apiUrl="https://api.example.com"
      widgetKey="pk_live_xxxxxxxx"
      agentName="Sage"
      [channels]="['IdentityVerification']"
      (mj-verified)="onVerified($any($event).detail)"></mj-realtime-widget>
  `
})
export class HelpComponent {
  onVerified(detail: { email: string; name: string }): void {
    console.log('verified', detail.email);
  }
}
```

Inputs are the camelCase property names from the reference table. Events are DOM `CustomEvent`s on the host element, so `(mj-verified)="…"` works.

Or use the custom element in any Angular application by registering it once and adding `CUSTOM_ELEMENTS_SCHEMA`:

```ts
import { RegisterRealtimeWidgetElement } from '@memberjunction/ng-realtime-widget';
RegisterRealtimeWidgetElement(inject(Injector));
```

### React

React passes attributes to custom elements and supports refs; use a ref for properties, methods and events (React 19 also forwards `on…` props and properties, but a ref works in every version).

```tsx
import { useEffect, useRef } from 'react';
import type { RealtimeWidgetElement } from '@memberjunction/ng-realtime-widget';

export function VoiceHelp({ apiUrl, widgetKey }: { apiUrl: string; widgetKey: string }) {
  const ref = useRef<RealtimeWidgetElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onVerified = (e: Event) => console.log('verified', (e as CustomEvent).detail);
    const onError = (e: Event) => console.warn((e as CustomEvent).detail);
    el.addEventListener('mj-verified', onVerified);
    el.addEventListener('mj-error', onError);
    el.channels = ['IdentityVerification'];
    el.themeTokens = { 'brand-primary': '#0a7a55' };
    return () => {
      el.removeEventListener('mj-verified', onVerified);
      el.removeEventListener('mj-error', onError);
    };
  }, []);

  return (
    // @ts-expect-error: the tag is declared by the package's HTMLElementTagNameMap augmentation for refs only
    <mj-realtime-widget ref={ref} api-url={apiUrl} widget-key={widgetKey} agent-name="Sage" />
  );
}
```

Load the bundle once at the app's root (`<script src="/mj-realtime-widget.js">` in `index.html`). Calling `ref.current?.end()` from an effect cleanup is a good way to hang up when the component unmounts; removing the element also ends a call it started.

### CMS snippet

Most CMSs let an editor paste an HTML block. Paste this, replace the two values, and add your site's origin to the widget key's allowed origins on the server:

```html
<mj-realtime-widget
  api-url="https://api.example.com"
  widget-key="pk_live_xxxxxxxx"
  agent-name="Ask us"
  chrome="orb"></mj-realtime-widget>
<script async src="https://your-cdn.example.com/mj-realtime-widget.js"></script>
```

`async` is safe: the element upgrades when the script arrives, and the page works without it. A visitor whose browser blocks the script simply sees nothing, never a broken layout.

## Try it

`sample/index.html` is a static page that loads the built shell under a strict Content-Security-Policy (the call code loads from the same folder when you press the button), lets you type an API URL and widget key, exposes the methods as buttons, and logs every event.

```bash
pnpm run build
npx http-server . -p 8080     # any static server, from this package's directory
# open http://localhost:8080/sample/
```

It is also what the package's bundle test loads. `scripts/boot-bundle.mjs` boots the built shell and call code from the sample page in a window whose `eval` and `Function` constructor throw, calls `start()`, and proves that nothing but the shell is fetched until then, that the call code loads and the element upgrades into a running call, and that the Interactive Component chunk loads only when that channel is in scope. (jsdom cannot run a real module `import()`, so the call code runs in Node with jsdom's globals: it exercises the real built files but not a browser's network or CSP enforcement.) You can run it by hand: `node scripts/boot-bundle.mjs`.

## Building

```bash
pnpm run build   # ngc (the Angular library) then the element bundle
pnpm test        # node + DOM suites, including the bundle test (build first)
```

The build has three outputs:

- `dist/` is the compiled Angular library (`RealtimeWidgetComponent` and friends).
- `dist/element/` is the embed: `mj-realtime-widget.js` (the shell, a classic script), `mj-realtime-widget-session.js` and `chunks/` (the call, as split ES modules), source maps, `sizes.json` (every file's raw and gzip size) and `meta.json` (the build report).
- `src/lib/theme/widget-global-styles.generated.css` is generated at `prebuild` and `pretest` from MemberJunction's own token and button sources plus Font Awesome, and is gitignored.

The embed is two esbuild builds: the shell as a classic IIFE (so it works in a CMS snippet and needs no CORS), and the call as an ES-module graph with code splitting (which needs ES-module output). The call build runs after the Angular linker has converted the partially compiled Angular libraries to full ahead-of-time code (the content of each file decides, not its package name: `angular-split` and others ship partial code too). `keepNames` is on because MemberJunction resolves classes by string at runtime (`@RegisterClass`); minifying those names away breaks screens with no error.

## Things worth knowing

- **Size.** Before this split the embed was one 15.0 MB (4.0 MB gzipped) script every page paid for up front. Now the page pays 8.3 KB gzipped; a call downloads 2.5 MB gzipped (the 1.5 MB of libraries that only some features need now load on demand, and the Interactive Component channel only when used). That call weight is still large, and most of it is not the widget's own: the overlay's imports bring in MemberJunction's generated entity classes (about 2.5 MB raw), the data grid (1.1 MB), spreadsheet export (0.9 MB), forms, and the artifact viewers. Trimming those means making the overlay lazier, which is work in `ng-conversations` and `ng-artifacts`, not here. In particular the React runtime is in the call chunk, not the Interactive Component chunk, because the overlay's activity rail imports the artifact viewers (which include React) statically; the Interactive Component chunk therefore holds only the channel, its component host and its surface. Serve everything with gzip or brotli.
- **`new Function` in the bundle.** A handful of bundled third-party libraries contain `new Function(...)` call sites. They are not on the widget's call path, and the boot test runs the bundle with the constructor blocked to prove it. If your policy scanner flags the file for them, that is why.
- **One call per page.** The widget drives a single shared realtime runtime. Two widgets on one page can both be idle, but only one can be in a call at a time, and a widget will never hang up a call it did not start.
- **Recording.** The widget does not offer recording consent and always starts sessions with recording off.
- **Resuming.** The widget remembers, per tab (`sessionStorage`), the last session and its conversation so a reload can continue it. It stores identifiers and the redeemed session token only, never names, emails or codes. It sends a best-effort close for a live call when the tab closes (`pagehide`, using a keep-alive request), and does nothing on a back/forward-cache hide.
- **Deadlines.** The server's call ceiling is enforced on the server. The widget also ends the call a little early with reason `deadline`, so the visitor sees why instead of a dead line. Verification extends that deadline.
- **Agent pinning.** With a widget key the server decides the agent and application. Setting `agent-id` has no effect and the widget says so in the console.
- **zone.js is loaded with the call code**, not with the shell, because it patches the page's timers and promises. A page that never starts a call never sees it.
- **Generated registration manifests.** The channel classes the bundle needs are referenced directly (the package declares `sideEffects: false`, and a bare `Load…()` call would be removed by the bundler), so you do not need to regenerate MemberJunction's class-registration manifests to use the element.
