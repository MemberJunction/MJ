# @memberjunction/excel-addin-server

The server half of the MemberJunction Excel add-in. Each MJ host serves the add-in to Excel itself, so people get **Open in Excel** on saved views and saved queries: a workbook that holds headings and no rows, and fills from MJ as whoever opens it.

The browser-safe half — the workbook contract, the typed Remote Operations Explorer calls, and the add-in pane — is [`@memberjunction/excel-addin`](../Excel).

## What it provides

| Piece | What it does |
|---|---|
| `ExcelAddinServerExtension` | A Server Extension (pre-auth) that serves the add-in's manifest, its `config.json`, and the pane's pages and icons from this host |
| `ExcelAddin.GetStatus` | Tells Explorer whether this host serves the add-in, and where |
| `ExcelAddin.CreateConnection` | Mints the signed-in user's Excel connection key |
| `ExcelAddin.BuildWorkbook` | Builds the connected workbook for saved views and queries the caller can see |
| `BuildExcelAddinManifest`, `BuildConnectedWorkbook` | The builders those use |

The operations are registered whenever this package is loaded. Until the Server Extension is configured, `GetStatus` reports the add-in as off, the other two refuse, and Explorer hides the Open in Excel button.

## Turning it on

Add the extension to the host's `mj.config.cjs`:

```js
module.exports = {
    serverExtensions: [
        {
            Name: 'ExcelAddin',
            DriverClass: 'ExcelAddinServerExtension',
            PackagePath: '@memberjunction/excel-addin-server',
            RootPath: '/office/excel',
            Phase: 'pre-auth',
            Enabled: true,
            Settings: {
                ExplorerUrl: 'https://explorer.example.org', // required: where MJ Explorer runs
                ServerName: 'Example Association',          // shown in Excel and on the connect page
            },
        },
    ],
};
```

MJAPI also needs a public URL (`MJAPI_PUBLIC_URL`), because Excel loads the add-in from outside the server. The extension refuses to start without one and logs why.

### Settings

| Setting | Default | Meaning |
|---|---|---|
| `ExplorerUrl` | required | Where MJ Explorer runs. The add-in's sign-in window opens its `/office/connect` page |
| `ServerName` | `MemberJunction` | The add-in's name in Excel and on the connect page |
| `KeyLifetimeDays` | `90` | How long a connection key lasts (1–365) |
| `MaxRows` | `100000` | The most rows the pane writes for one source |
| `AddinId` | `AAEB4761-75CC-4DB1-99BD-7790FAD307C6` | The add-in's GUID. Change it only to deploy a second, differently configured copy to the same Microsoft 365 tenant |
| `Version` | `1.0.0.0` | The add-in version in the manifest and in every workbook |
| `StoreType`, `Store` | `EXCatalog` | How a workbook names where the add-in is deployed. `EXCatalog` is Microsoft 365 centralized deployment |

## Deploying the add-in to people

Once MJAPI is running with the extension, its manifest is at:

```
https://<MJAPI public URL>/office/excel/manifest.xml
```

A Microsoft 365 administrator deploys it once:

1. Open the **Microsoft 365 admin center** → **Settings** → **Integrated apps** → **Upload custom apps**.
2. Choose **Office Add-in**, then **Provide link to manifest file**, and paste the manifest URL.
3. Choose who gets it (everyone, or specific users or groups) and finish.

The add-in then appears on the **Data** tab of Excel for Windows, Mac and the web, and a workbook made by Open in Excel opens its pane automatically. Deployment can take up to a day to reach everyone.

For development, sideload the same manifest (Excel → **Insert** → **Add-ins** → **Upload My Add-in**). A workbook names its add-in's deployment through `StoreType`; a sideloaded add-in may not open automatically with a workbook made for centralized deployment, but it opens from the ribbon button.

## How it works

1. **Open in Excel.** A person picks Open in Excel on a saved view or saved query. `ExcelAddin.BuildWorkbook` reads the view or query **as that person** (refusing one they can't see), and writes a workbook with:
   - one sheet per source, holding only its headings;
   - a very-hidden `MJ_Sources` sheet recording each source (the view, or the query and its chosen parameter values);
   - the Office web-extension parts that open this add-in with the file.

   No rows, no credential, and no server-set query parameter are ever written into the file.
2. **Sign in.** The pane opens Explorer's `/office/connect` page in an Office sign-in window. The person signs in the way they always do and approves. `ExcelAddin.CreateConnection` mints their connection key, and Explorer hands it back encrypted to a key pair the pane made for that sign-in.
3. **Refresh.** The pane fetches each source's rows through MJ's GraphQL `RunViewByID` and `GetQueryData`, sending the key as `X-API-Key`, and writes them into the sheet.

## Security model

- **Nothing here returns data.** The pre-auth routes serve only static pages, the manifest and a config file with public URLs. Data comes only from GraphQL, with the person's key.
- **The connection key is narrow.** It belongs to the person, holds only the `view:run` and `query:run` scopes, and MJ denies an API key every scope-checked operation outside its scopes. It can't save, delete or mint more keys. It is bound to the `MJAPI` application when one is defined, so it can't be used against MJ's MCP or A2A servers.
- **It is created as the person.** MJ's own permissions decide whether they may create an API key. If their role can't, Open in Excel's sign-in says so and asks them to contact an administrator.
- **It is revocable.** It is labelled `Excel add-in` on the API Keys page, expires (90 days by default), and stops working the moment it is revoked or its user is deactivated.
- **No half-made keys.** If any step after the key is created fails, the key is revoked before the error is reported.
- **Every refresh is checked again.** Rows come from the same operations Explorer uses, with the person's row- and field-level security. A forwarded workbook shows each person only their own rows.
- **The file is untrusted.** The pane validates the recorded sources before using them, and the server re-checks each one on every refresh.

## Development

```bash
pnpm run build   # tsc
pnpm test        # vitest
```

The pane is built by `@memberjunction/excel-addin` (`dist/web`); this package serves it from there and refuses to start if it isn't built.
