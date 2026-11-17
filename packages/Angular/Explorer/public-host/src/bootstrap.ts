/**
 * @fileoverview The hook for a host's `main.ts`. It has no static dependency on Angular or MJ
 * packages, so `main.ts` stays small for every path.
 *
 * @module @memberjunction/ng-public-host/bootstrap
 */

export * from './lib/try-start-public-page';
export * from './lib/public-page-entry';
export { IsPublicPagePath, PUBLIC_PAGE_PATH_PREFIX } from './lib/public-path';
