---
"@memberjunction/excel-addin": patch
"@memberjunction/excel-addin-server": patch
"@memberjunction/ng-entity-viewer": patch
"@memberjunction/ng-query-viewer": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-explorer-app": patch
"@memberjunction/server-bootstrap": patch
---

Add the Excel add-in's first release: a unified **Export ▾** toolbar menu across entity grids (both `(Default)` entity views and saved views) and query results grids offers **Open in Excel** alongside snapshot export, downloading a connected workbook that holds no rows and fills, in Excel, with what the person who opens it can see. Inside Excel, the MemberJunction task pane supports connecting to any MemberJunction server (via Office Dialog sign-in or external-browser encrypted connection-code handoff), browsing Applications, Entities, Saved Views, and Query Categories/Saved Queries with parameters directly from any workbook, and managing/refreshing all connected worksheets. New packages `@memberjunction/excel-addin` (workbook contract, typed `ExcelAddin.*` Remote Operations, encrypted sign-in handoff, the add-in pane) and `@memberjunction/excel-addin-server` (a Server Extension that serves the add-in and a per-host manifest, plus the operations' server bodies). Excel signs in through Explorer's new `office/connect` page, which Explorer renders on its own like the OAuth callback, and holds a per-user API key scoped to `view:run` and `query:run`. Off until a host configures the `ExcelAddinServerExtension`; see `guides/EXCEL_ADDIN_GUIDE.md`.
