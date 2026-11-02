# @memberjunction/ng-diagnostics

Reusable Angular diagnostics components and client capture service for MemberJunction applications.

## Features

- **`MJDiagnosticsService`**:
  - Runs `RegisterLoggerSink` and `TelemetryManager` listeners inside `NgZone.runOutsideAngular()` to eliminate change-detection overhead.
  - Maintains bounded in-memory circular buffers (`DiagnosticRingBuffer`) for client logs, telemetry spans, and network entries.
  - Flushes active `Record` sessions to the `MJ_Diagnostics` IndexedDB database on a 1-second debounce so client evidence survives page reloads.
  - Builds scrubbed `.mjdiag` bundles (`BuildClientBundle`) with automated findings evaluation.
- **`MJDiagnosticRecordingBannerComponent`** (`<mj-diagnostic-recording-banner>`): Top status banner indicating an active recording session with a "Stop & Package" action.
- **`MJDiagnosticReportProblemDialogComponent`** (`<mj-diagnostic-report-problem-dialog>`): End-user dialog for building a `.mjdiag` snapshot or starting a live recording session.
- **`MJDiagnosticBundleViewerComponent`** (`<mj-diagnostic-bundle-viewer>`): Interactive `.mjdiag` archive verifier and findings/manifest viewer.

## Layer Compliance

This package sits in the `widgets` UI layer (`"mjUILayer": "widgets"`) and has zero dependency on `@angular/router` or `@memberjunction/ng-shared`.
