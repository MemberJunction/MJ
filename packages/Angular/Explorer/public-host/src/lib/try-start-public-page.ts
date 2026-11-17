import type { StartPublicHostOptions } from './start-public-host';
import { IsPublicPagePath } from './public-path';

/**
 * Starts the public host when the address is a public page (`/p/<slug>`). Call it first in the host's
 * `main.ts`: when it returns true, do not start Explorer. It has no static dependency on Angular or
 * MJ packages, so it adds almost nothing to `main.ts`.
 */
export async function TryStartPublicPage(options: StartPublicHostOptions): Promise<boolean> {
  if (!IsPublicPagePath(window.location.pathname)) {
    return false;
  }
  try {
    // Dynamic import, lazy-route category: the public host is its own chunk, so Explorer never downloads it.
    const { StartPublicHost } = await import('./start-public-host');
    await StartPublicHost(options);
  } catch (error: unknown) {
    console.error('The public page could not start.', error);
  }
  return true;
}
