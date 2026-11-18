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

/** What the public host gets from the host app. */
export interface PublicHostConfig {
  Environment: PublicHostEnvironment;
  PublicPages: PublicPageEntry[];
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

function decodeSlug(segment: string): string | null {
  try {
    return decodeURIComponent(segment).toLowerCase() || null;
  } catch {
    return null;
  }
}

/** The page registered for a slug, or null. */
export function FindPublicPage(pages: PublicPageEntry[], slug: string | null): PublicPageEntry | null {
  if (!slug) {
    return null;
  }
  return pages.find(page => page.Slug === slug) ?? null;
}

/** Loads a page's component. Rejects when the page's package does not export it. */
export async function LoadPublicPageComponent(page: PublicPageEntry): Promise<Type<unknown>> {
  const component: Type<unknown> | undefined = await page.Load();
  if (!component) {
    throw new Error(`The package of public page '${page.Slug}' (app '${page.AppName}') does not export the page's component.`);
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
 * Starts the public host when the address is a public page (`/p/<slug>`). Call it first in the host's
 * `main.ts`: when it returns true, do not start Explorer. It has no static dependency on Angular or
 * MJ packages, so it adds almost nothing to `main.ts`.
 */
export async function TryStartPublicPage(config: PublicHostConfig): Promise<boolean> {
  if (!IsPublicPagePath(window.location.pathname)) {
    return false;
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
