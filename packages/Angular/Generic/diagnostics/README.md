# @memberjunction/ng-diagnostics

Reusable Angular diagnostics components and client capture service for MemberJunction applications.

## Features

- **`MJDiagnosticsService`**:
  - Runs `RegisterLoggerSink` and `TelemetryManager` listeners inside `NgZone.runOutsideAngular()` to eliminate change-detection overhead.
  - Maintains bounded in-memory circular buffers (`DiagnosticRingBuffer`) for client logs, telemetry spans, and network entries.
  - Captures into memory only, from `Initialize()` on. Nothing is stored in IndexedDB, so a page reload loses entries that were not uploaded.
  - `LoadServerStatus()` reads `Diagnostics.GetMySessionStatus`. Call it after sign-in. When `CaptureEnabled` is `true`, capture continues. When it is `false` or missing, the listeners stop and the buffers are cleared (a running recording keeps its entries). When the status cannot be read, capture continues in memory for a local download.
  - Builds scrubbed `.mjdiag` bundles (`BuildClientBundle`) with automated findings evaluation. The default scrubber profile is `Standard`. When the server reports `RequireLiteralScrubbing`, every bundle uses `Standard` and the dialog disables `FullRaw`. A build waits at most 3 seconds for a pending status read.
  - Click breadcrumbs name the control as `tag#id[role=..][type=..][name=..][data-testid=..][data-test-id=..]`, with no text, labels or classes. An identifier is kept only when it is a plain identifier of 60 characters or fewer that does not contain the element's text. Do not put record data in element IDs or test IDs.
  - A server trigger header (`X-MJ-Diagnostic-Trigger`) uploads only entries captured after the first trigger, keeps an active user recording on its own session, and uploads again at most once every 30 seconds.
- **`MJDiagnosticRecordingBannerComponent`** (`<mj-diagnostic-recording-banner>`): Top status banner indicating an active recording session with a "Stop & Package" action that stops the recording, builds the snapshot and reopens the report-problem dialog with the result.
- **`MJDiagnosticReportProblemDialogComponent`** (`<mj-diagnostic-report-problem-dialog>`): End-user dialog for building a `.mjdiag` snapshot or starting a live recording session.
- **`MJDiagnosticBundleViewerComponent`** (`<mj-diagnostic-bundle-viewer>`): Interactive `.mjdiag` archive verifier and findings/manifest viewer. An archive that cannot be read shows an error alert.

## Layer Compliance

This package sits in the `widgets` UI layer (`"mjUILayer": "widgets"`) and has zero dependency on `@angular/router` or `@memberjunction/ng-shared`.
