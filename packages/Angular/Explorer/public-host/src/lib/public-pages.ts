import type { Type } from '@angular/core';

/** One public page from an installed Open App, as listed in the host's generated `PUBLIC_PAGES`. */
export interface PublicPage {
  /** The URL segment after `/p/`. Lower case letters, digits and hyphens. */
  Slug: string;
  /** The Open App that owns the page. */
  AppName: string;
  /** True when the page also answers addresses under its slug (`/p/<slug>/...`). */
  SubPaths?: boolean;
  Role?: undefined;
  /** Loads the page's standalone component from its own chunk. */
  Load: () => Promise<Type<unknown>>;
}

/** An error page from an installed Open App. The host shows it for a wrong address in its folder. */
export interface PublicErrorPage {
  Role: 'error';
  /** The folder under `/p/` that the error page covers, such as `docs` or `docs/guides`. Empty for all of `/p/`. */
  Scope: string;
  /** The Open App that owns the error page. */
  AppName: string;
  /** Loads the error page's standalone component from its own chunk. */
  Load: () => Promise<Type<unknown>>;
}

/** An element of the host's generated `PUBLIC_PAGES`. */
export type PublicPageEntry = PublicPage | PublicErrorPage;

/** The part of the host app's environment that the public host reads. */
export interface PublicHostEnvironment {
  GRAPHQL_URI: string;
  MJAPI_URI?: string;
}

/** What the public host gets from the host app. */
export interface PublicHostConfig {
  Environment: PublicHostEnvironment;
  PublicPages: readonly PublicPageEntry[];
}

/** Every public page lives under this path. Explorer never uses it. */
export const PUBLIC_PAGE_PATH_PREFIX = '/p/';

/** The parts of a public page address (`/p/<slug>/<sub-path>`). */
export interface PublicPagePath {
  /** The page slug in lower case, or null when the address has none or it cannot be decoded. */
  Slug: string | null;
  /** The path after the slug, without leading or trailing slashes. */
  SubPath: string;
}

/** True when the path belongs to a public page and not to Explorer. */
export function IsPublicPagePath(pathname: string): boolean {
  return pathname.startsWith(PUBLIC_PAGE_PATH_PREFIX);
}

/** Reads the slug and the sub-path from a public page address. */
export function ParsePublicPagePath(pathname: string): PublicPagePath {
  if (!IsPublicPagePath(pathname)) {
    return { Slug: null, SubPath: '' };
  }
  const [first = '', ...rest] = pathname.slice(PUBLIC_PAGE_PATH_PREFIX.length).split('/');
  return { Slug: decodeSlug(first), SubPath: rest.filter(Boolean).join('/') };
}

/** The form of a slug: lower case letters and digits, words joined by single hyphens. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function decodeSlug(segment: string): string | null {
  try {
    return decodeURIComponent(segment).toLowerCase() || null;
  } catch {
    return null;
  }
}

/** True for an error page entry. */
export function IsPublicErrorPage(entry: PublicPageEntry): entry is PublicErrorPage {
  return entry.Role === 'error';
}

/** The page registered for a slug, or null. */
export function FindPublicPage(pages: readonly PublicPageEntry[], slug: string | null): PublicPage | null {
  if (!slug) {
    return null;
  }
  return pages.find((page): page is PublicPage => !IsPublicErrorPage(page) && page.Slug === slug) ?? null;
}

/**
 * The page that answers an address, or null. A page answers its own address, and the addresses
 * under it only when it has `SubPaths`.
 */
export function ResolvePublicPage(pages: readonly PublicPageEntry[], path: PublicPagePath): PublicPage | null {
  const page = FindPublicPage(pages, path.Slug);
  if (!page || (path.SubPath !== '' && !page.SubPaths)) {
    return null;
  }
  return page;
}

/**
 * The error page for an address: the one of the requested folder, then of each parent folder,
 * then of the root. Null when no installed app has one, so the host shows its own.
 */
export function FindPublicErrorPage(pages: readonly PublicPageEntry[], path: PublicPagePath): PublicErrorPage | null {
  const errorPages = pages.filter(IsPublicErrorPage);
  const segments = [path.Slug ?? '', ...path.SubPath.split('/')].filter(Boolean);
  for (let depth = segments.length; depth >= 0; depth--) {
    const scope = segments.slice(0, depth).join('/');
    const errorPage = errorPages.find(page => page.Scope === scope);
    if (errorPage) {
      return errorPage;
    }
  }
  return null;
}

/**
 * The same address with its slug in lower case. Null when the slug is already lower case, or
 * when its lower case text is not a slug (no page can match it).
 * The web host's rules match lower case slugs only.
 */
export function BuildLowercaseSlugPath(pathname: string): string | null {
  if (!IsPublicPagePath(pathname)) {
    return null;
  }
  const [first = '', ...rest] = pathname.slice(PUBLIC_PAGE_PATH_PREFIX.length).split('/');
  const slug = decodeSlug(first);
  if (!slug || slug === first || !SLUG_PATTERN.test(slug)) {
    return null;
  }
  return PUBLIC_PAGE_PATH_PREFIX + [slug, ...rest].join('/');
}

/** Loads the component of a page or an error page. Rejects when its package does not export it. */
export async function LoadPublicPageComponent(page: PublicPageEntry): Promise<Type<unknown>> {
  const component: Type<unknown> | undefined = await page.Load();
  if (!component) {
    const name = IsPublicErrorPage(page) ? `error page '${page.Scope}'` : `page '${page.Slug}'`;
    throw new Error(`The package of public ${name} (app '${page.AppName}') does not export its component.`);
  }
  return component;
}

/**
 * The MJAPI base URL, without a trailing slash: `MJAPI_URI` when set, otherwise the GraphQL server's origin.
 * Matches how Explorer's login-screen loader finds MJAPI before sign-in.
 */
export function ResolvePublicMJAPIURL(environment: PublicHostEnvironment): string {
  let configured = environment.MJAPI_URI?.trim() ?? '';
  while (configured.endsWith('/')) {
    configured = configured.slice(0, -1);
  }
  if (configured) {
    return configured;
  }
  return new URL(environment.GRAPHQL_URI).origin;
}

/** The public route that returns the default theme's published sign-in page design. */
export function BuildLoginScreenURL(environment: PublicHostEnvironment): string {
  return `${ResolvePublicMJAPIURL(environment)}/auth/login-screen`;
}

/** Explorer's root. A visitor with no session sees the sign-in screen there. */
export function BuildSignInURL(): string {
  return '/';
}

/**
 * Starts the public host when the address is a public page (`/p/<slug>`). When it returns true,
 * the caller must not start Explorer. An address with capital letters in its slug is sent to its
 * lowercase form. It has no static dependency on Angular or MJ packages.
 */
export async function TryStartPublicPage(config: PublicHostConfig): Promise<boolean> {
  if (!IsPublicPagePath(window.location.pathname)) {
    return false;
  }
  const lowercasePath = BuildLowercaseSlugPath(window.location.pathname);
  if (lowercasePath) {
    window.location.replace(lowercasePath + window.location.search + window.location.hash);
    return true;
  }
  try {
    // Dynamic import, lazy-route category: the public host is its own chunk, so Explorer never downloads it.
    const { StartPublicHost } = await import('./public-host.component');
    await StartPublicHost(config);
  } catch (error: unknown) {
    console.error('The public page could not start.', error);
  }
  return true;
}
