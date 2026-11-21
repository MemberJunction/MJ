# @memberjunction/ng-communications

Standalone Angular components and custom elements for the MemberJunction Communications V2 public preference center.

## Components

- `CommsPreferenceCenterComponent` (`mj-comms-preference-center`): Token-scoped preference management UI supporting category subscriptions, channel preferences, opt-out-all, and sender branding.

## Building

```bash
pnpm run build
```

This runs `ngc` to compile the Angular library to `dist/` and `build:element` (`scripts/build-element.mjs`) to bundle the standalone `<mj-comms-preference-center>` custom element into `dist/element/main.js`.

## Hosting

`CommsWebhookHandler` in `@memberjunction/server` serves `dist/element/main.js` at `GET /comms/preferences-element.js` when available (or via `MJ_COMMS_PREFERENCE_ELEMENT_SRC` / `PreferenceElementSrc`), and falls back to the built-in host page if the element bundle is not present.
