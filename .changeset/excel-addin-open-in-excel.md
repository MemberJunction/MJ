---
"@memberjunction/excel-addin": patch
"@memberjunction/excel-addin-server": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/server-bootstrap": patch
---

Add the Excel add-in's first release: **Open in Excel** in the views grid and the query results grid downloads a connected workbook that holds no rows and fills, in Excel, with what the person who opens it can see. New packages `@memberjunction/excel-addin` (workbook contract, typed `ExcelAddin.*` Remote Operations, encrypted sign-in handoff, the add-in pane) and `@memberjunction/excel-addin-server` (a Server Extension that serves the add-in and a per-host manifest, plus the operations' server bodies). Excel signs in through Explorer's new `office/connect` page, which Explorer renders on its own like the OAuth callback, and holds a per-user API key scoped to `view:run` and `query:run`. Off until a host configures the `ExcelAddinServerExtension`; see `guides/EXCEL_ADDIN_GUIDE.md`.
