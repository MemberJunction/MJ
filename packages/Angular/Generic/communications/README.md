# @memberjunction/ng-communications

The public preference center for [Communications V2](../../../../guides/COMMUNICATIONS_V2_GUIDE.md): the page a
recipient reaches from the unsubscribe link in a message. It ships in two forms from one source:

- `CommsPreferenceCenterComponent`, a standalone Angular component (`mj-comms-preference-center`) for use inside
  an Angular application;
- a self-contained custom element bundle (`dist/element/main.js`) that any HTML page can load with one
  `<script>` tag. MJAPI serves this bundle on its own preference page.

The component talks only to MJAPI's public `/comms` routes with `fetch`. It needs no MemberJunction provider, no
GraphQL client and no signed-in user: the token in the link is the recipient's capability.

## Installation

```bash
pnpm add @memberjunction/ng-communications
```

Peer dependencies: `@angular/core`, `@angular/common`, `@angular/forms`, `@angular/platform-browser` and
`@angular/elements` (21.x).

## What the recipient can do

- See the sender's active, user-visible preferences, with the recipient's current state for each
- Opt in to or out of individual preferences and save
- Unsubscribe from all of the sender's non-transactional messages
- See the sender's branding (`BrandName`, `LogoURL`, `PrimaryColor`, `FooterText` from the sender's
  `TemplateContext`)

Per-preference choices are saved against the recipient's record. When the address in the link belongs to more
than one record, the server refuses per-preference saves and the page reports that only "unsubscribe from all"
is available.

## Using the component in an Angular app

```typescript
import { Component } from '@angular/core';
import { CommsPreferenceCenterComponent } from '@memberjunction/ng-communications';

@Component({
    selector: 'app-preferences-page',
    standalone: true,
    imports: [CommsPreferenceCenterComponent],
    template: `
        <mj-comms-preference-center
            [token]="Token"
            api-root="https://api.example.org/comms">
        </mj-comms-preference-center>
    `,
})
export class PreferencesPageComponent {
    public Token = new URLSearchParams(window.location.search).get('token') ?? '';
}
```

| Input | Attribute | Default | Description |
|-------|-----------|---------|-------------|
| `Token` | `token` | (required) | The unsubscribe token from the link (`/comms/unsubscribe/<token>` or `?token=<token>`) |
| `ApiRoot` | `api-root` | `/comms` | URL of MJAPI's `/comms` routes. A relative value works only when the page is served by MJAPI itself. |
| `CspNonce` | `csp-nonce` | none | The page's CSP nonce, for hosts with a nonce-based style policy |

| Public member | Description |
|---------------|-------------|
| `LoadPreferences()` | Fetch the preferences for the current token. Called on init and when `token` or `api-root` changes. |
| `TogglePreference(pref)` | Flip one preference locally |
| `SavePreferences()` | `POST` the current state of every preference |
| `UnsubscribeAll()` | `POST { UnsubscribeAll: true }` |
| `Preferences`, `IsLoading`, `IsSaving`, `ErrorMessage`, `StatusMessage`, `BrandName`, `LogoUrl`, `PrimaryColor`, `FooterText` | View state |

The exported interfaces `PreferenceCenterResponse`, `PreferenceCenterItem` and `PreferenceCenterTemplateContext`
describe the JSON the routes return.

## Using the custom element

```html
<script type="module" src="https://api.example.org/comms/preferences-element.js"></script>

<mj-comms-preference-center
    token="6f1c2b1e-8a57-4c0a-9d53-2f7a3a2f9e10"
    api-root="https://api.example.org/comms">
</mj-comms-preference-center>
```

The bundle is an ES module containing Angular, `zone.js` and the component, compiled ahead of time with the
Angular linker, so the host page needs no `unsafe-eval`. It registers `mj-comms-preference-center` once. For a
page with a nonce-based Content Security Policy, put the nonce on the script tag and pass it as `csp-nonce`;
Angular then applies it to the styles it injects.

To send recipients to your own page instead of MJAPI's, set the sender's `PreferenceCenterURL`. MJAPI redirects
`GET /comms/unsubscribe/<token>` to that URL with `?token=<token>` appended.

## Routes the component calls

| Request | Response |
|---------|----------|
| `GET <api-root>/preferences/<token>` with `Accept: application/json` | `PreferenceCenterResponse`, or `{ error }` with `400` / `404` |
| `POST <api-root>/preferences/<token>` with `{ Preferences: [{ PreferenceID, State }] }` or `{ UnsubscribeAll: true }` | `{ Found, Success, UnsubscribedAll, Preferences, ErrorMessage? }` |

Both are implemented by `CreateCommsWebhookHandler` in
[`@memberjunction/server`](../../../MJServer/README.md#communications-v2).

## Building

```bash
cd packages/Angular/Generic/communications
pnpm run build
```

`build` runs two steps:

1. `ngc` compiles the library to `dist/` (`dist/public-api.js`, `dist/lib/...`).
2. `build:element` (`scripts/build-element.mjs`) bundles `src/element-entry.ts` with esbuild and the Angular
   linker into `dist/element/main.js`. It requires step 1's output and fails if it is missing.

| Environment variable | Default | Purpose |
|----------------------|---------|---------|
| `COMMS_ELEMENT_SOURCEMAP` | off | Set to `1` to emit a source map next to `dist/element/main.js`. Build-time only, for debugging the bundle; leave it unset for published builds. |

```bash
COMMS_ELEMENT_SOURCEMAP=1 pnpm run build:element
```

## How MJAPI hosts it

`GET /comms/preferences/:token` in `@memberjunction/server` chooses, in order:

1. the URL in `MJ_COMMS_PREFERENCE_ELEMENT_SRC` (or the `PreferenceElementSrc` option of
   `CreateCommsWebhookHandler`), for a bundle hosted elsewhere, such as a CDN;
2. `GET /comms/preferences-element.js`, which serves `dist/element/main.js` from this package when it is
   installed and built;
3. a built-in page with the same functions and no Angular, so the unsubscribe link in a message always works.

| Setting | Read by | Purpose |
|---------|---------|---------|
| `MJ_COMMS_PREFERENCE_ELEMENT_SRC` | `@memberjunction/server` | URL of the element bundle to load. Unset, MJAPI serves its own copy. Point it only at a URL you control: the script runs on the preference page. |

## Testing

```bash
pnpm test          # vitest
pnpm run test:types
```

## Layering

This is an L1 widget package (`"mjUILayer": "widgets"`): it imports no router and no Explorer package. See the
[UI Layering Guide](../../../../guides/UI_LAYERING_GUIDE.md).
