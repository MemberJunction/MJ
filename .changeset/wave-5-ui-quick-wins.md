---
"@memberjunction/export-engine": patch
"@memberjunction/ng-auth-services": patch
"@memberjunction/ng-artifacts": patch
---

Wave 5.3 UI & bundle quick wins: keep `ExcelExporter`/`exceljs` out of the eager package entry point, lazy-load `@memberjunction/realtime-runtime` on logout in `MJAuthBase`, and switch `SpreadsheetArtifactViewerComponent` to `OnPush` with microtask-memoized `HasUnsavedChanges` and delegated out-of-zone cell hover handling.
