# @memberjunction/communication-expo-push

## 5.49.0

### Patch Changes

- 88d707b: Communication **DryRun** send mode + a real HTML-body fallback fix.
  - **DryRun seam (new capability)** — `Message.DryRun` and `MessageResult.DryRun` on the base contract (`communication-types`), threaded through the engine and honored by all five shipping providers (SendGrid, Gmail, Twilio, MS Graph, Expo Push). When `DryRun` is true a provider runs its **full** preflight + payload construction and reports success **without** contacting its external service, stamping `MessageResult.DryRun = true`. Lets scheduled jobs and tests exercise the entire send pipeline with zero real messages sent. `scheduling-engine` passes the flag through on scheduled communication sends.
  - **B64 fix (`communication-engine`)** — `ProcessedMessageServer.Process` derives the HTML body from the BodyTemplate (its HTML content render, or the documented rendered-text fallback), then the trailing `else` branch unconditionally overwrote it with `HTMLBody || ''` — so any message without an explicit HTMLBody/HTMLBodyTemplate shipped an **empty** HTML body, making the fallback dead code. The derived value is now preserved (`HTMLBody || ProcessedHTMLBody || ''`).

- Updated dependencies [463aa51]
- Updated dependencies [c5e4b9e]
- Updated dependencies [4c441dd]
- Updated dependencies [1e5b9b2]
- Updated dependencies [a8cb2b6]
- Updated dependencies [13d9b8e]
- Updated dependencies [88d707b]
- Updated dependencies [505c8b5]
- Updated dependencies [1a15bd2]
- Updated dependencies [85575cf]
- Updated dependencies [9c07270]
- Updated dependencies [e945700]
- Updated dependencies [1475e6c]
- Updated dependencies [6d0ec83]
- Updated dependencies [70c658c]
  - @memberjunction/core@5.49.0
  - @memberjunction/global@5.49.0
  - @memberjunction/communication-types@5.49.0

## 5.48.0

### Patch Changes

- Updated dependencies [09e1b4b]
  - @memberjunction/core@5.48.0
  - @memberjunction/communication-types@5.48.0
  - @memberjunction/global@5.48.0

## 5.47.0

### Patch Changes

- Updated dependencies [b216f2b]
  - @memberjunction/core@5.47.0
  - @memberjunction/communication-types@5.47.0
  - @memberjunction/global@5.47.0

## 5.46.0

### Patch Changes

- Updated dependencies [d526470]
- Updated dependencies [84fa44c]
  - @memberjunction/core@5.46.0
  - @memberjunction/communication-types@5.46.0
  - @memberjunction/global@5.46.0

## 5.45.1

### Patch Changes

- @memberjunction/communication-types@5.45.1
- @memberjunction/core@5.45.1
- @memberjunction/global@5.45.1

## 5.45.0

### Minor Changes

- 6db5dc5: Add a new Expo push notification channel provider (`@memberjunction/communication-expo-push`). It registers via `@RegisterClass(BaseCommunicationProvider, 'Expo Push')` and sends push notifications through the Expo Push API using the same `CommunicationEngine` as the email/SMS providers, mapping the framework message model (To → device token, Subject → title, Body → body, ContextData → data) to the Expo push payload and handling ok/error tickets. Used by the MemberJunction mobile app for agent-completion / approval notifications.

### Patch Changes

- Updated dependencies [45d121b]
- Updated dependencies [21e33fe]
- Updated dependencies [b7cf50f]
- Updated dependencies [f4f11fa]
- Updated dependencies [e370816]
- Updated dependencies [fbee64c]
- Updated dependencies [b2927f1]
- Updated dependencies [c1f2d3d]
- Updated dependencies [0b1e009]
  - @memberjunction/core@5.45.0
  - @memberjunction/global@5.45.0
  - @memberjunction/communication-types@5.45.0
