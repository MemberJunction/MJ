/**
 * @fileoverview The check that starts the public host for a `/p/` address. Explorer's start-up
 * (`StartExplorer()` in `@memberjunction/ng-explorer-app/bootstrap`) calls it first. It has no
 * static dependency on Angular or MJ packages, so it adds almost nothing to the first download.
 *
 * @module @memberjunction/ng-public-host/bootstrap
 */

export { TryStartPublicPage } from './lib/public-pages';
export type { PublicErrorPage, PublicHostConfig, PublicHostEnvironment, PublicPage, PublicPageEntry } from './lib/public-pages';
