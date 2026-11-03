---
"@memberjunction/ai-mcp-server": minor
"@memberjunction/cli": minor
"@memberjunction/component-registry-server": minor
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/diagnostics": minor
"@memberjunction/diagnostics-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/global": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/integration-test-suite": minor
"@memberjunction/messaging-adapters": minor
"@memberjunction/ng-bootstrap": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-bootstrap-lite": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-dashboards": minor
"@memberjunction/ng-diagnostics": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/postgresql-dataprovider": minor
"@memberjunction/server": minor
"@memberjunction/server-bootstrap": minor
"@memberjunction/server-bootstrap-lite": minor
"@memberjunction/sqlserver-dataprovider": minor
---

Add Diagnostic Bundles: scoped diagnostic sessions that capture server logs, SQL and traces and client logs, network, telemetry and breadcrumbs; a two-stage scrubber; the `.mjdiag` archive format with structural verification; X25519 + AES-256-GCM envelope encryption; an MJAPI intake endpoint with quarantine-then-promote storage; automated findings; and CLI and Explorer surfaces. Adds the diagnostic session, chunk and bundle tables and their metadata. Adds the `MJ: Diagnostic Sender Registrations` table: a sender enrols once with a one-time registration code, then signs every intake request with `MJDiag-Ed25519`, so the intake endpoint reads no API key. Adds the `Diagnostics.IssueSenderRegistrationCode` and `Diagnostics.EnrolSender` remote operations and the `Diagnostics Sender Key` and `Diagnostics Intake Key` credential types. Adds `SanitizeForLog` to `@memberjunction/global`. `BaseServerMiddleware.Initialize` and `ConfigureExpressApp` now receive an optional `ServerMiddlewareContext` that carries the server's `ApiRoute` builder. The Slack messaging extension and the component-registry auth example log request values on one line. `Diagnostics.RevokeSender` and `Diagnostics.ReactivateSender` revoke and reactivate a sender; a direct save of a sender registration needs `Diagnostics: Manage Intake` and cannot change its status, key, code or timestamp fields. The `MJ: Diagnostic Sender Registrations` form has **Revoke** and **Reactivate** toolbar buttons that call these operations. `FormToolbarActionLifecycleContext` in `@memberjunction/ng-base-forms` gains an optional `Injector` (the form container's injector), so a toolbar action can resolve Angular services such as `MJConfirmService`. `BaseFormComponent.RefreshRecord` accepts an optional `{ ShowSuccessNotification: false }` that skips the "Record refreshed" notification. The intake routes and `POST /enroll` answer 503 when the registration lookup fails. Adds the `Diagnostics.External.AllowUnscrubbedSend` setting: a bundle sent to an external collector must be built with literal scrubbing unless it is `true`. `Diagnostics.GetMySessionStatus` returns `CaptureEnabled` and `RequireLiteralScrubbing`. Diagnostics access comes only from the `Diagnostics: *` authorizations (directly or through a parent authorization) or the Owner user type. The `GetServerTelemetry*` queries in MJServer's `TelemetryResolver` now need Owner privileges or the `Diagnostics: Run Sessions` authorization. `WithoutDiagnosticCapture` in `@memberjunction/core` suppresses capture only in the current async context when a context provider is registered. `GraphQLDataProvider.ClearClientCache` also deletes the `MJ_Diagnostics` IndexedDB database. `mj diag` reads the private key from `--private-key-file` or `MJ_DIAG_PRIVATE_KEY`. MJServer logs only the user ID for a verified token.
