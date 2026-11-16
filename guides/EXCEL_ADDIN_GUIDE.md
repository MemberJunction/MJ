# Excel Add-in Guide

**What it does.** MJ Explorer's views grid and query results grid get an **Open in Excel** button. It
downloads a *connected* workbook: headings, no rows. Opening the file in Excel opens the
MemberJunction pane. The person signs in once with their usual MemberJunction account, and every sheet
fills with what **that person** can see. **Refresh** brings current data.

| | Export | Open in Excel |
|---|---|---|
| What you get | A copy of the rows as they are now | A workbook that fills itself from MJ |
| Whose data | The exporter's, frozen in the file | Whoever opens it, at refresh time |
| Forwarding the file | Shares the rows | Shares nothing; the recipient signs in and sees their own rows |

## Contents

1. [Turning it on](#1-turning-it-on)
2. [Deploying the add-in to Excel](#2-deploying-the-add-in-to-excel)
3. [How people use it](#3-how-people-use-it)
4. [How sign-in works](#4-how-sign-in-works)
5. [Security model](#5-security-model)
6. [Limits](#6-limits)
7. [Troubleshooting](#7-troubleshooting)
8. [Packages](#8-packages)

## 1. Turning it on

The add-in is **off** until a host configures its Server Extension. Add an entry to `serverExtensions` in
MJAPI's `mj.config.cjs`:

```javascript
module.exports = {
  serverExtensions: [
    {
      Name: 'ExcelAddin',
      DriverClass: 'ExcelAddinServerExtension',
      PackagePath: '@memberjunction/excel-addin-server',
      RootPath: '/office/excel',        // under MJAPI_BASE_PATH, like every MJAPI route
      Phase: 'pre-auth',                // Excel loads the pane before anyone is signed in
      Enabled: true,
      Settings: {
        ExplorerUrl: 'https://explorer.example.org',  // required: where people sign in
        ServerName: 'Example Association',            // shown in the pane
        KeyLifetimeDays: 90,                          // how long a connection lasts (1-365)
        MaxRows: 100000,                              // most rows loaded per sheet
      },
    },
  ],
};
```

Restart MJAPI. The extension serves, under `RootPath`:

| Path | What |
|---|---|
| `manifest.xml` | The add-in manifest, already pointing at this host |
| `config.json` | The pane's settings |
| `taskpane.html`, `connect.html`, `connected.html` | The pane and its sign-in pages |

It must be `pre-auth`: Excel loads these files without an MJ session. They hold no data; every data call
the pane makes carries its own key and goes through MJ's normal GraphQL authorization.

Until the extension is configured, the Open in Excel button doesn't appear and the add-in's operations
refuse.

## 2. Deploying the add-in to Excel

The manifest is generated per host, so there is no address for anyone to type.

1. Download `https://<your MJAPI public URL>/office/excel/manifest.xml`.
2. In the **Microsoft 365 admin center**, go to **Settings → Integrated apps → Upload custom apps**, choose
   **Office Add-in**, and upload the manifest. Assign it to the people or groups who should have it.
3. Deployment can take a few hours to reach everyone's Excel.

Generated workbooks name the add-in by the manifest's ID and expect it to arrive through centralized
deployment (`StoreType` `EXCatalog`). If you distribute it another way, set the `Store` and `StoreType`
settings to match, or the pane won't open by itself with the file; people can still open it from the
ribbon's **MemberJunction** button.

The add-in needs Excel API 1.4 and Dialog API 1.1: current Excel for Windows, Mac and the web.

## 3. How people use it

### From MemberJunction Explorer ("Open in Excel")

1. In Explorer, open a **saved** view or a **saved** query and choose **Open in Excel**. For a query,
   the parameters of its last run go into the workbook.
2. Open the downloaded file in Excel. The MemberJunction pane opens beside it.
3. The first time on each computer, choose **Sign in**. A window opens on Explorer's sign-in page; sign
   in as usual and approve the connection.
4. The sheets fill. **Refresh** reloads one sheet, **Refresh all** reloads them all, and the pane
   refreshes by itself when the workbook opens.

A view opens as it was last **saved**: unsaved filter or column changes in the grid aren't included.

### Directly inside Excel ("Browse Data" & Multi-Server Switcher)

1. Open any workbook in Excel and click **MemberJunction** on the **Data** ribbon tab.
2. *(Optional)* Click **Server** in the pane header to connect to a different MemberJunction server URL
   (each server's connection key is stored separately so you can switch environments cleanly).
3. Sign in once, then use the **Browse Data** tab:
   - **Entities & Views**: Filter by **Application** (or *All Applications*), search for any readable
     entity, and choose either **All Records (Default Columns)** (`RunDynamicView`) or any accessible
     **Saved View** (`RunViewByID`).
   - **Queries**: Filter by **Category** folder, search for any runnable **Saved Query**, fill in any
     caller-settable parameters, and choose **Run & Load into Excel**.
4. Choose **New worksheet** or **Current worksheet**. Every sheet loaded from the picker is recorded in
   the workbook's hidden `MJ_Sources` manifest, so **Refresh**, **Refresh all**, **Open sheet**,
   **Unlink**, and sharing the `.xlsx` with colleagues work identically to **Open in Excel**.

## 4. How sign-in works

1. The pane makes a one-time key pair and opens an Office dialog on the host's own `connect.html`.
2. That page sends the dialog to Explorer's `office/connect` page, with the public key.
3. The person signs in to Explorer as they always do, sees what Excel will be able to do, and chooses
   **Connect Excel**.
4. `ExcelAddin.CreateConnection` creates an MJ API key for that person, limited to the `view:run` and
   `query:run` scopes, bound to MJAPI, and expiring after `KeyLifetimeDays`.
5. Explorer encrypts the key, with the GraphQL address Explorer itself uses, to the pane's public key,
   and returns to `connected.html` with the result in the URL fragment.
6. `connected.html` hands it to the pane, which decrypts it and keeps it in its own storage.

The key is created **as the signed-in person**, so MJ's own permissions decide whether they may: a role
that can't create `MJ: API Keys` can't connect Excel, and the connect page says so.

## 5. Security model

- **Every refresh runs as the person who signed in.** Rows, columns, row-level and field-level security
  are exactly what that person gets in Explorer.
- **The key can only read.** API-key scopes deny everything not granted (`defaultBehaviorNoScopes:
  'deny'`), and this key holds only `view:run` and `query:run`. Saving, deleting, running actions or
  agents, and creating more keys are all refused.
- **The pane uses GraphQL, not REST.** GraphQL's `RunViewByID` and `GetQueryData` enforce API-key
  scopes; MJAPI's REST routes don't check them.
- **Revocable.** The key appears as **Excel add-in** on Explorer's API Keys page. Revoking it, letting
  it expire, or deactivating the user stops the next refresh. **Sign out** in the pane only forgets
  the key on that computer.
- **Never in plain sight.** The key is never in a URL in plain text or in a workbook. The handoff is
  RSA-OAEP-wrapped AES-GCM, only the pane holds the private key, and the answer is bound to the
  pane's one-time state.
- **Workbooks hold no data and no credentials.** They record which saved view or query fills each sheet
  and the query parameter values chosen. The pane treats that record as untrusted: it validates every
  field, refuses a workbook from a different host, and the server re-checks every source on every
  refresh. Server-set query parameters are never accepted from a workbook.

## 6. Limits

- Up to 10 connected MemberJunction sheets per workbook (`Entity`, saved `View`, or saved `Query`).
- `MaxRows` rows per sheet (default 100,000). The pane says when a sheet holds fewer rows than exist.
- Date and date-time columns are written as Excel dates in the computer's local time.
- When connecting to an external MemberJunction server URL not listed in the deployed XML manifest's
  `<AppDomains>`, sign-in opens in the system browser and completes via a one-time RSA-OAEP-encrypted
  connection code copied from `connected.html`.
- Not yet: `=MJ.QUERY()` custom worksheet functions and a Microsoft AppSource listing.

## 7. Troubleshooting

| Symptom | Likely cause |
|---|---|
| No Open in Excel button | The Server Extension isn't configured, or the view isn't saved |
| The pane doesn't open with the file | The add-in isn't deployed to that person yet, or `Store`/`StoreType` don't match how it was deployed. Use the ribbon button |
| "This workbook came from ..." | The file was made on a different MJ host |
| "MemberJunction refused this connection" | The key was revoked or expired, or the user was deactivated. Sign in again |
| "Your role isn't allowed to create API keys" | Grant the role create permission on `MJ: API Keys`, or have someone who has it connect |
| The sign-in window shows Explorer's home page instead of the connect page | Some identity providers return to the app root after sign-in. Close the window and choose **Sign in** again |

## 8. Packages & Custom Angular Hosts

| Package | Holds |
|---|---|
| [`@memberjunction/excel-addin`](../packages/OfficeAddins/Excel/README.md) | The workbook contract, typed Remote Operations, RSA-OAEP sign-in handoff, pure `/office/connect` helpers (`OFFICE_CONNECT_ROUTE_PATH`, `ReadOfficeConnectRequest`, `BuildOfficeHandoffUrl`, `BuildOfficeSignInOptions`), client helper, and esbuild pane |
| [`@memberjunction/excel-addin-server`](../packages/OfficeAddins/ExcelServer/README.md) | The Server Extension, manifest and workbook builders, catalog & source resolution, and the operations' server bodies |
| `@memberjunction/ng-export-service` | Generic, router-free `<mj-office-connect-panel>` consent & key-handoff component (`packages/Angular/Generic/export-service`, `"mjUILayer": "widgets"`) |

The unified **Export ▾** (`Open in Excel` + `Export Snapshot...`) toolbar menus live in `@memberjunction/ng-entity-viewer` and `@memberjunction/ng-query-viewer`.

In **MJ Explorer**, `@memberjunction/ng-explorer-core` mounts a thin `OfficeConnectComponent` route wrapper at `office/connect` (`OFFICE_CONNECT_ROUTE_PATH`), and `@memberjunction/ng-explorer-app` renders it standalone (no shell, no login screen) like `/oauth/callback`.

**Serving `/office/connect` in a custom (non-Explorer) Angular app:**
Any Angular application using `packages/Angular/Generic/` components can serve `/office/connect` without importing `@memberjunction/ng-explorer-core`:
1. Mount a public (un-guarded, shell-free) route at `OFFICE_CONNECT_ROUTE_PATH` (`'office/connect'`) that renders `<mj-office-connect-panel [QueryParams]="queryParams" (SignInRequested)="onSignIn()">` from `@memberjunction/ng-export-service`.
2. Set `ExcelAddinServerExtension` `Settings.ExplorerUrl` in `mj.config.cjs` to that application's origin.
