# Acme Lumen (demo Open App)

A demo Open App for a fictional analytics product, Lumen. It ships one public landing page that visitors can open at `/p/lumen` before they sign in. "Create account" sends them to Explorer's sign-up flow; "Sign in" sends them to Explorer's sign-in screen.

| Path | What it is |
|---|---|
| `mj-app.json` | The manifest. `publicPages` declares the landing page. |
| `packages/lumen-public` | The page: `LumenLandingPageComponent`, a standalone component that extends `BasePublicPage` from `@memberjunction/ng-public-host`. |

## Run it in this repo

The demo is not part of the pnpm workspace, so these steps are local changes. Do not commit them.

1. Add `Demos/OpenApps/*/packages/*` to `pnpm-workspace.yaml` and to the `workspaces` list in the root `package.json`.
2. Add the package to Explorer, as `mj app install` would: `"@acme/lumen-public": "workspace:*"` in `packages/MJExplorer/package.json`, then `pnpm install` at the repo root.
3. Add the page to the root `mj.config.cjs`, as `mj app install` would:
   ```js
   publicPages: [
     { AppName: 'acme-lumen', Slug: 'lumen', PackageName: '@acme/lumen-public', ExportName: 'LumenLandingPageComponent', Enabled: true },
   ],
   ```
4. Build the page: `cd Demos/OpenApps/AcmeLumen/packages/lumen-public && pnpm run build`.
5. Start Explorer: `pnpm run start:explorer`. Its `prestart` writes `src/app/generated/public-pages.generated.ts`.
6. Open `http://localhost:4201/p/lumen`.

The landing page needs no MJAPI. With MJAPI running, it also shows the logo from the sign-in design published in Login Studio.

All names, prices and text are invented for the demo.
