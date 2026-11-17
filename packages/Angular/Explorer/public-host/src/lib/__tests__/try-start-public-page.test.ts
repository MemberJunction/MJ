import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PublicPageEntry } from '../public-page-entry';

const { startPublicHost } = vi.hoisted(() => ({ startPublicHost: vi.fn() }));
vi.mock('../start-public-host', () => ({ StartPublicHost: startPublicHost }));

import { TryStartPublicPage } from '../try-start-public-page';

const pages: PublicPageEntry[] = [{ Slug: 'pricing', AppName: 'Acme', Load: () => Promise.reject(new Error('not loaded')) }];
const options = { Environment: { GRAPHQL_URI: 'http://localhost:4000/' }, PublicPages: pages };

function visit(pathname: string): void {
  vi.stubGlobal('window', { location: { pathname } });
}

describe('TryStartPublicPage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    startPublicHost.mockReset();
  });

  it('does nothing on an Explorer path, so main.ts starts Explorer', async () => {
    visit('/app/home');
    await expect(TryStartPublicPage(options)).resolves.toBe(false);
    expect(startPublicHost).not.toHaveBeenCalled();
  });

  it('starts the public host on a /p/ path', async () => {
    visit('/p/pricing');
    startPublicHost.mockResolvedValue(undefined);
    await expect(TryStartPublicPage(options)).resolves.toBe(true);
    expect(startPublicHost).toHaveBeenCalledWith(options);
  });

  it('does not let Explorer start when the public host fails', async () => {
    visit('/p/pricing');
    startPublicHost.mockRejectedValue(new Error('chunk failed'));
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(TryStartPublicPage(options)).resolves.toBe(true);
    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });
});
