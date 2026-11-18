/**
 * @fileoverview The hook for a host's `main.ts`. It has no static dependency on Angular or MJ
 * packages, so `main.ts` stays small for every path.
 *
 * @module @memberjunction/ng-public-host/bootstrap
 */

export { TryStartPublicPage } from './lib/public-pages';
export type { PublicHostConfig, PublicHostEnvironment, PublicPageEntry } from './lib/public-pages';
