/**
 * @fileoverview The browser app's start-up for MJ hosts. It has no static dependency on Angular
 * or MJ packages, so `main.ts` stays small for every path.
 *
 * @module @memberjunction/ng-public-host/bootstrap
 */

export * from './lib/bootstrap-mj';
export * from './lib/public-page-entry';
export { IsPublicPagePath, PUBLIC_PAGE_PATH_PREFIX } from './lib/public-path';
