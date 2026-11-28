/**
 * @fileoverview Start-up for an Explorer host. The host's `main.ts` calls {@link StartExplorer}
 * and holds no start-up logic of its own, so start-up changes reach a host with a package update.
 *
 * This entry has no static dependency on MJ's data packages: a public page (`/p/<slug>`) must
 * not download them.
 *
 * @module @memberjunction/ng-explorer-app/bootstrap
 */

import type { Type } from '@angular/core';
import { platformBrowser } from '@angular/platform-browser';
import { TryStartPublicPage, type PublicPageEntry } from '@memberjunction/ng-public-host/bootstrap';

/** The part of the host's environment that start-up reads. The auth preload reads more keys, such as `AUTH_TYPE`. */
export interface ExplorerStartEnvironment {
  GRAPHQL_URI: string;
  MJAPI_URI?: string;
}

/** What a host's `main.ts` gives to {@link StartExplorer}. */
export interface StartExplorerOptions {
  /** The host's `environment` object. */
  Environment: ExplorerStartEnvironment;
  /** The host's generated `PUBLIC_PAGES` list. */
  PublicPages: readonly PublicPageEntry[];
  /** Imports the host's root module. A function, so the module is evaluated only after the auth preload. */
  LoadAppModule: () => Promise<Type<unknown>>;
}

/**
 * Starts the app for the current address: the public host for a public page (`/p/<slug>`),
 * Explorer for every other address. It does not reject; a failed start is logged.
 */
export async function StartExplorer(options: StartExplorerOptions): Promise<void> {
  try {
    if (await TryStartPublicPage({ Environment: options.Environment, PublicPages: options.PublicPages })) {
      return;
    }
    await preloadSignIn(options.Environment);
    // The root module is imported only now. `AuthServicesModule.forRoot()` runs when the module
    // is evaluated, and it needs the preloaded catalog and auth provider.
    const appModule = await options.LoadAppModule();
    await platformBrowser().bootstrapModule(appModule);
  } catch (error: unknown) {
    console.error('Explorer could not start.', error);
  }
}

/**
 * Loads what the sign-in screen needs before the root module is evaluated: the server's auth
 * provider catalog, the sign-in page design from Login Studio, and the active provider's driver.
 * None of the three rejects; on failure Explorer uses the compiled `AUTH_TYPE` and the stock design.
 */
async function preloadSignIn(environment: ExplorerStartEnvironment): Promise<void> {
  // Dynamic import, bundle-size category: the preload helpers import all of @memberjunction/core
  // (about 550 KB compressed), which a public page must not download.
  const { AuthProviderCatalog, LoginScreenLoader, PreloadActiveAuthProvider } = await import('@memberjunction/ng-auth-services/preload');
  await Promise.all([
    AuthProviderCatalog.Preload(environment.GRAPHQL_URI),
    LoginScreenLoader.Load(environment.GRAPHQL_URI),
  ]);
  // Only the active provider's SDK is imported; the others stay in lazy chunks.
  await PreloadActiveAuthProvider(environment);
}
