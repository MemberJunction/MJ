import type { PublicPageEntry } from './public-page-entry';

/** Every public page lives under this path. Explorer never uses it. */
export const PUBLIC_PAGE_PATH_PREFIX = '/p/';

/** True when the path belongs to a public page and not to Explorer. */
export function IsPublicPagePath(pathname: string): boolean {
  return pathname.startsWith(PUBLIC_PAGE_PATH_PREFIX);
}

/** The page slug from a public path (`/p/<slug>/...`), or null when there is none. */
export function ReadPublicPageSlug(pathname: string): string | null {
  if (!IsPublicPagePath(pathname)) {
    return null;
  }
  const segment = pathname.slice(PUBLIC_PAGE_PATH_PREFIX.length).split('/')[0];
  return segment ? decodeURIComponent(segment).toLowerCase() : null;
}

/** The path after the slug (`/p/<slug>/<sub-path>`), without leading or trailing slashes. */
export function ReadPublicPageSubPath(pathname: string): string {
  if (!IsPublicPagePath(pathname)) {
    return '';
  }
  return pathname.slice(PUBLIC_PAGE_PATH_PREFIX.length).split('/').slice(1).filter(Boolean).join('/');
}

/** The page registered for a slug, or null. */
export function FindPublicPage(pages: PublicPageEntry[], slug: string | null): PublicPageEntry | null {
  if (!slug) {
    return null;
  }
  return pages.find(page => page.Slug === slug) ?? null;
}
