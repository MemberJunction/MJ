import type { Type } from '@angular/core';

/** One public page from an installed Open App, as listed in the host's generated `PUBLIC_PAGES`. */
export interface PublicPageEntry {
  /** The URL segment after `/p/`. Lower case letters, digits and hyphens. */
  Slug: string;
  /** The Open App that owns the page. */
  AppName: string;
  /** Loads the page's standalone component from its own chunk. */
  Load: () => Promise<Type<unknown>>;
}

/** The part of the host app's environment that the public host reads. */
export interface PublicHostEnvironment {
  GRAPHQL_URI: string;
  MJAPI_URI?: string;
}
