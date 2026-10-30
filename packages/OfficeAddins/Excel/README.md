# @memberjunction/excel-addin

The browser-safe half of MemberJunction's Excel add-in. Its server half is
[`@memberjunction/excel-addin-server`](../ExcelServer/README.md), and the admin guide is
[`guides/EXCEL_ADDIN_GUIDE.md`](../../../guides/EXCEL_ADDIN_GUIDE.md).

## What it does

**Open in Excel**, in MJ Explorer's views grid and query results grid, downloads a connected
workbook. The workbook holds headings and no rows. Opening it in Excel opens the MemberJunction
pane, the person signs in once, and every sheet fills with what *that person* can see. **Refresh**
brings current data.

## What's in this package

| Module | For |
|---|---|
| `contract` | The workbook format the server writes and the pane reads: one data sheet per saved view or query, and a very-hidden `MJ_Sources` sheet recording each source. `ParseWorkbookManifest` validates it, because a workbook is user-editable. |
| `operations` | The typed Remote Operations Explorer calls: `ExcelAddin.GetStatus`, `ExcelAddin.CreateConnection`, `ExcelAddin.BuildWorkbook`. These bases are not registered; the server package registers their bodies. |
| `handoff` | The encrypted sign-in handoff between Explorer's connect page and the pane (RSA-OAEP-wrapped AES-GCM, Web Crypto only). |
| `client` | `ExcelAddinClient`: caches the add-in's status per provider and downloads a workbook. Used by the grids. |
| `src/web` | The pane itself, bundled with esbuild to `dist/web`. Plain TypeScript and Office.js, no framework. |

`contract` and `handoff` import nothing, so the pane bundle carries no MemberJunction runtime.

## How sign-in works

1. The pane makes a one-time RSA key pair and opens an Office dialog on its own host (`connect.html`).
2. That page sends the dialog to Explorer's `office/connect` page with the public key. The person
   signs in to Explorer as they always do and approves the connection.
3. `ExcelAddin.CreateConnection` mints an MJ API key for that person that can only run views and
   queries (`view:run`, `query:run`) and expires. Explorer seals it, with Explorer's own GraphQL
   address, to the pane's public key, and returns to `connected.html` with the sealed text in the
   URL fragment.
4. `connected.html` hands the sealed text to the pane, which opens it with its private key and keeps
   the connection in its own storage.

The key is never in a URL in plain text, can't change data, and is revocable on Explorer's API Keys
page.

## Building

```bash
pnpm run build   # tsc for the library, then tsc -p tsconfig.web.json + esbuild for the pane
pnpm test
```
