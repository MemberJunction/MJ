# @memberjunction/excel-addin-server

## 6.2.0-edge.7

### Patch Changes

- 555a3f3: Add the Excel add-in's first release: a unified **Export ▾** toolbar menu across entity grids (both `(Default)` entity views and saved views) and query results grids offers **Open in Excel** alongside snapshot export, downloading a connected workbook that holds no rows and fills, in Excel, with what the person who opens it can see. Inside Excel, the MemberJunction task pane supports connecting to any MemberJunction server (via Office Dialog sign-in or external-browser encrypted connection-code handoff), browsing Applications, Entities, Saved Views, and Query Categories/Saved Queries with parameters directly from any workbook, and managing/refreshing all connected worksheets. New packages `@memberjunction/excel-addin` (workbook contract, typed `ExcelAddin.*` Remote Operations, encrypted sign-in handoff, the add-in pane) and `@memberjunction/excel-addin-server` (a Server Extension that serves the add-in and a per-host manifest, plus the operations' server bodies). Excel signs in through Explorer's new `office/connect` page, which Explorer renders on its own like the OAuth callback, and holds a per-user API key scoped to `view:run` and `query:run`. Off until a host configures the `ExcelAddinServerExtension`; see `guides/EXCEL_ADDIN_GUIDE.md`.
- Updated dependencies [1419ba7]
- Updated dependencies [c93c0f8]
- Updated dependencies [ecf36eb]
- Updated dependencies [91cba84]
- Updated dependencies [29b16ee]
- Updated dependencies [a6a4656]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [555a3f3]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [6779eed]
- Updated dependencies [397ae9a]
- Updated dependencies [89a5b59]
- Updated dependencies [4ef13d6]
- Updated dependencies [8b90b41]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
- Updated dependencies [b0b2cc9]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core-entities@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7
  - @memberjunction/excel-addin@6.2.0-edge.7
  - @memberjunction/server-extensions-core@6.2.0-edge.7
  - @memberjunction/api-keys@6.2.0-edge.7
  - @memberjunction/api-keys-base@6.2.0-edge.7
