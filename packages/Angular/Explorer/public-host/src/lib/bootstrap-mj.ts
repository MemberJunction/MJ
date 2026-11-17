import type { Type } from '@angular/core';
import type { MJBootstrapEnvironment, PublicPageEntry } from './public-page-entry';
import { IsPublicPagePath } from './public-path';

export interface MJBootstrapOptions {
  /** The host app's environment. */
  Environment: MJBootstrapEnvironment;
  /** Public pages from installed Open Apps: the host's generated `PUBLIC_PAGES`. */
  PublicPages: PublicPageEntry[];
  /** Loads the host app's root module, e.g. `() => import('./app/app.module').then(m => m.AppModule)`. */
  LoadExplorerModule: () => Promise<Type<unknown>>;
}

/**
 * Starts the browser app. A path under `/p/` starts the public host, which loads only the public
 * page. Every other path starts Explorer.
 */
export async function BootstrapMJ(options: MJBootstrapOptions): Promise<void> {
  if (IsPublicPagePath(window.location.pathname)) {
    await startPublicHost(options);
  } else {
    await startExplorer(options);
  }
}

async function startPublicHost(options: MJBootstrapOptions): Promise<void> {
  // Dynamic import, lazy-route category: the public host is its own chunk, so Explorer never downloads it.
  const { StartPublicHost } = await import('./start-public-host');
  await StartPublicHost({ Environment: options.Environment, PublicPages: options.PublicPages });
}

async function startExplorer(options: MJBootstrapOptions): Promise<void> {
  // Dynamic import, bundle-size category: the preload helpers import all of @memberjunction/core
  // (about 550 KB compressed), which a public page must not download.
  const { AuthProviderCatalog, LoginScreenLoader } = await import('@memberjunction/ng-auth-services/preload');

  // The provider catalog must be loaded before the root module is evaluated, because
  // AuthServicesModule.forRoot reads it when the module is defined. Neither call rejects.
  await Promise.all([
    AuthProviderCatalog.Preload(options.Environment.GRAPHQL_URI),
    LoginScreenLoader.Load(options.Environment.GRAPHQL_URI),
  ]);

  // Dynamic import, bundle-size category: the JIT-capable platform is only needed by Explorer.
  const [rootModule, { platformBrowserDynamic }] = await Promise.all([
    options.LoadExplorerModule(),
    import('@angular/platform-browser-dynamic'),
  ]);
  await platformBrowserDynamic().bootstrapModule(rootModule).catch((error: unknown) => console.error(error));
}
