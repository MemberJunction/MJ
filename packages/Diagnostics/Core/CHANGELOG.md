# @memberjunction/diagnostics

## 6.3.0-edge.0

### Patch Changes

- Updated dependencies [03bb8b6]
- Updated dependencies [31cc053]
- Updated dependencies [6fd9fb7]
- Updated dependencies [5c4fa7c]
- Updated dependencies [7ace3ee]
- Updated dependencies [c889b72]
  - @memberjunction/global@6.3.0-edge.0

## 6.2.0

### Minor Changes

- 59e32e0: Add Diagnostic Bundles: scoped diagnostic sessions that capture server logs, SQL and traces and client logs, network, telemetry and breadcrumbs; a two-stage scrubber; the `.mjdiag` archive format with structural verification; X25519 + AES-256-GCM envelope encryption; an MJAPI intake endpoint with quarantine-then-promote storage; automated findings; and CLI and Explorer surfaces. Adds the diagnostic session, chunk and bundle tables and their metadata. Adds the `MJ: Diagnostic Sender Registrations` table: a sender enrols once with a one-time registration code, then signs every intake request with `MJDiag-Ed25519`, so the intake endpoint reads no API key. Adds the `Diagnostics.IssueSenderRegistrationCode` and `Diagnostics.EnrolSender` remote operations and the `Diagnostics Sender Key` and `Diagnostics Intake Key` credential types. Adds `SanitizeForLog` to `@memberjunction/global`. `BaseServerMiddleware.Initialize` and `ConfigureExpressApp` now receive an optional `ServerMiddlewareContext` that carries the server's `ApiRoute` builder. The Slack messaging extension and the component-registry auth example log request values on one line. `Diagnostics.RevokeSender` and `Diagnostics.ReactivateSender` revoke and reactivate a sender; a direct save of a sender registration needs `Diagnostics: Manage Intake` and cannot change its status, key, code or timestamp fields. The `MJ: Diagnostic Sender Registrations` form has **Revoke** and **Reactivate** toolbar buttons that call these operations. `FormToolbarActionLifecycleContext` in `@memberjunction/ng-base-forms` gains an optional `Injector` (the form container's injector), so a toolbar action can resolve Angular services such as `MJConfirmService`. `BaseFormComponent.RefreshRecord` accepts an optional `{ ShowSuccessNotification: false }` that skips the "Record refreshed" notification. The intake routes and `POST /enroll` answer 503 when the registration lookup fails. Adds the `Diagnostics.External.AllowUnscrubbedSend` setting: a bundle sent to an external collector must be built with literal scrubbing unless it is `true`. `Diagnostics.GetMySessionStatus` returns `CaptureEnabled` and `RequireLiteralScrubbing`. Diagnostics access comes only from the `Diagnostics: *` authorizations (directly or through a parent authorization) or the Owner user type. The `GetServerTelemetry*` queries in MJServer's `TelemetryResolver` now need Owner privileges or the `Diagnostics: Run Sessions` authorization. `WithoutDiagnosticCapture` in `@memberjunction/core` suppresses capture only in the current async context when a context provider is registered. `GraphQLDataProvider.ClearClientCache` also deletes the `MJ_Diagnostics` IndexedDB database. `mj diag` reads the private key from `--private-key-file` or `MJ_DIAG_PRIVATE_KEY`. MJServer logs only the user ID for a verified token.

### Patch Changes

- 5ba2565: Tests: the four linear-time (ReDoS) guards in `review-scrubber.test.ts` use a 2500 ms ceiling instead of 500 ms. The 1.6 MB case ran 100 ms locally and 765 ms on the v6.2.0-edge.8 publish-gate runner.
- Updated dependencies [1419ba7]
- Updated dependencies [709de1a]
- Updated dependencies [dfe40a4]
- Updated dependencies [29b16ee]
- Updated dependencies [81aea34]
- Updated dependencies [59e32e0]
- Updated dependencies [4283a82]
- Updated dependencies [914e6ff]
- Updated dependencies [2274f42]
- Updated dependencies [80905a1]
- Updated dependencies [4ef13d6]
- Updated dependencies [25f7b82]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [4d647e6]
- Updated dependencies [17a4137]
- Updated dependencies [36a3f9e]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/global@6.2.0

## 6.2.0-edge.8

### Minor Changes

- 59e32e0: Add Diagnostic Bundles: scoped diagnostic sessions that capture server logs, SQL and traces and client logs, network, telemetry and breadcrumbs; a two-stage scrubber; the `.mjdiag` archive format with structural verification; X25519 + AES-256-GCM envelope encryption; an MJAPI intake endpoint with quarantine-then-promote storage; automated findings; and CLI and Explorer surfaces. Adds the diagnostic session, chunk and bundle tables and their metadata. Adds the `MJ: Diagnostic Sender Registrations` table: a sender enrols once with a one-time registration code, then signs every intake request with `MJDiag-Ed25519`, so the intake endpoint reads no API key. Adds the `Diagnostics.IssueSenderRegistrationCode` and `Diagnostics.EnrolSender` remote operations and the `Diagnostics Sender Key` and `Diagnostics Intake Key` credential types. Adds `SanitizeForLog` to `@memberjunction/global`. `BaseServerMiddleware.Initialize` and `ConfigureExpressApp` now receive an optional `ServerMiddlewareContext` that carries the server's `ApiRoute` builder. The Slack messaging extension and the component-registry auth example log request values on one line. `Diagnostics.RevokeSender` and `Diagnostics.ReactivateSender` revoke and reactivate a sender; a direct save of a sender registration needs `Diagnostics: Manage Intake` and cannot change its status, key, code or timestamp fields. The `MJ: Diagnostic Sender Registrations` form has **Revoke** and **Reactivate** toolbar buttons that call these operations. `FormToolbarActionLifecycleContext` in `@memberjunction/ng-base-forms` gains an optional `Injector` (the form container's injector), so a toolbar action can resolve Angular services such as `MJConfirmService`. `BaseFormComponent.RefreshRecord` accepts an optional `{ ShowSuccessNotification: false }` that skips the "Record refreshed" notification. The intake routes and `POST /enroll` answer 503 when the registration lookup fails. Adds the `Diagnostics.External.AllowUnscrubbedSend` setting: a bundle sent to an external collector must be built with literal scrubbing unless it is `true`. `Diagnostics.GetMySessionStatus` returns `CaptureEnabled` and `RequireLiteralScrubbing`. Diagnostics access comes only from the `Diagnostics: *` authorizations (directly or through a parent authorization) or the Owner user type. The `GetServerTelemetry*` queries in MJServer's `TelemetryResolver` now need Owner privileges or the `Diagnostics: Run Sessions` authorization. `WithoutDiagnosticCapture` in `@memberjunction/core` suppresses capture only in the current async context when a context provider is registered. `GraphQLDataProvider.ClearClientCache` also deletes the `MJ_Diagnostics` IndexedDB database. `mj diag` reads the private key from `--private-key-file` or `MJ_DIAG_PRIVATE_KEY`. MJServer logs only the user ID for a verified token.

### Patch Changes

- 5ba2565: Tests: the four linear-time (ReDoS) guards in `review-scrubber.test.ts` use a 2500 ms ceiling instead of 500 ms. The 1.6 MB case ran 100 ms locally and 765 ms on the v6.2.0-edge.8 publish-gate runner.
- Updated dependencies [59e32e0]
  - @memberjunction/global@6.2.0-edge.8
