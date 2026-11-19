import { afterEach, describe, expect, it, vi } from 'vitest';

const { startPublicHost } = vi.hoisted(() => ({ startPublicHost: vi.fn() }));
vi.mock('../public-host.component', () => ({ StartPublicHost: startPublicHost }));

import {
  BuildLoginScreenURL, BuildLowercaseSlugPath, BuildSignInURL, FindPublicErrorPage, FindPublicPage, IsPublicPagePath,
  LoadPublicPageComponent, ParsePublicPagePath, ResolvePublicMJAPIURL, ResolvePublicPage, TryStartPublicPage, type PublicPageEntry,
} from '../public-pages';

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

  it('sends an address with capital letters in the slug to its lowercase form', async () => {
    const replace = vi.fn<(url: string) => void>();
    vi.stubGlobal('window', { location: { pathname: '/p/Pricing/Plans', search: '?ref=Ad', hash: '#Top', replace } });
    await expect(TryStartPublicPage(options)).resolves.toBe(true);
    expect(replace).toHaveBeenCalledWith('/p/pricing/Plans?ref=Ad#Top');
    expect(startPublicHost).not.toHaveBeenCalled();
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

class FakePage {}
const LoadFake = (): Promise<typeof FakePage> => Promise.resolve(FakePage);

describe('IsPublicPagePath', () => {
  it('matches paths under /p/', () => {
    expect(IsPublicPagePath('/p/lumen')).toBe(true);
    expect(IsPublicPagePath('/p/lumen/')).toBe(true);
    expect(IsPublicPagePath('/p/')).toBe(true);
  });

  it('does not match Explorer paths', () => {
    expect(IsPublicPagePath('/')).toBe(false);
    expect(IsPublicPagePath('/p')).toBe(false);
    expect(IsPublicPagePath('/pricing')).toBe(false);
    expect(IsPublicPagePath('/app/home')).toBe(false);
    expect(IsPublicPagePath('/oauth/callback')).toBe(false);
  });
});

describe('ParsePublicPagePath', () => {
  it('reads the first segment after /p/', () => {
    expect(ParsePublicPagePath('/p/lumen').Slug).toBe('lumen');
    expect(ParsePublicPagePath('/p/lumen/').Slug).toBe('lumen');
    expect(ParsePublicPagePath('/p/lumen/plans').Slug).toBe('lumen');
  });

  it('reads the path after the slug', () => {
    expect(ParsePublicPagePath('/p/lumen').SubPath).toBe('');
    expect(ParsePublicPagePath('/p/lumen/plans/').SubPath).toBe('plans');
    expect(ParsePublicPagePath('/p/lumen/plans/team').SubPath).toBe('plans/team');
  });

  it('decodes and lower-cases the slug', () => {
    expect(ParsePublicPagePath('/p/Lumen').Slug).toBe('lumen');
  });

  it('returns null when there is no slug', () => {
    expect(ParsePublicPagePath('/p/').Slug).toBeNull();
    expect(ParsePublicPagePath('/app/home').Slug).toBeNull();
  });

  it('returns null for a slug with a bad percent code', () => {
    expect(ParsePublicPagePath('/p/%E0%A4%A').Slug).toBeNull();
  });
});

describe('FindPublicPage', () => {
  const pages: PublicPageEntry[] = [
    { Slug: 'lumen', AppName: 'acme-lumen', Load: LoadFake },
    { Slug: 'lumen-pricing', AppName: 'acme-lumen', Load: LoadFake },
  ];

  it('finds a page by slug', () => {
    expect(FindPublicPage(pages, 'lumen-pricing')?.Slug).toBe('lumen-pricing');
  });

  it('returns null for an unknown or missing slug', () => {
    expect(FindPublicPage(pages, 'other')).toBeNull();
    expect(FindPublicPage(pages, null)).toBeNull();
  });
});

describe('LoadPublicPageComponent', () => {
  it('rejects when the package has no export with the page\'s name', async () => {
    const page = { Slug: 'lumen', AppName: 'acme-lumen', Load: () => Promise.resolve(undefined) } as unknown as PublicPageEntry;
    await expect(LoadPublicPageComponent(page)).rejects.toThrow(/lumen/);
  });
});

describe('ResolvePublicMJAPIURL', () => {
  it('uses MJAPI_URI without a trailing slash', () => {
    expect(ResolvePublicMJAPIURL({ GRAPHQL_URI: 'http://localhost:4000/', MJAPI_URI: 'https://host/api/' })).toBe('https://host/api');
  });

  it('uses the GraphQL origin when MJAPI_URI is blank or missing', () => {
    expect(ResolvePublicMJAPIURL({ GRAPHQL_URI: 'http://localhost:4000/graphql' })).toBe('http://localhost:4000');
    expect(ResolvePublicMJAPIURL({ GRAPHQL_URI: 'http://localhost:4000/', MJAPI_URI: '  ' })).toBe('http://localhost:4000');
  });
});

describe('BuildLoginScreenURL', () => {
  it('is the MJAPI login-screen route', () => {
    expect(BuildLoginScreenURL({ GRAPHQL_URI: 'http://localhost:4000/', MJAPI_URI: 'https://host/api' })).toBe('https://host/api/auth/login-screen');
  });
});

describe('BuildSignInURL', () => {
  it('is Explorer\'s root', () => {
    expect(BuildSignInURL()).toBe('/');
  });
});

describe('BuildLowercaseSlugPath', () => {
  it('lower-cases the slug only', () => {
    expect(BuildLowercaseSlugPath('/p/Docs/Guides/Setup')).toBe('/p/docs/Guides/Setup');
  });

  it('returns null when the slug is lowercase, missing or cannot be decoded', () => {
    expect(BuildLowercaseSlugPath('/p/docs/Guides')).toBeNull();
    expect(BuildLowercaseSlugPath('/p/')).toBeNull();
    expect(BuildLowercaseSlugPath('/p/%E0%A4%A')).toBeNull();
    expect(BuildLowercaseSlugPath('/App/Home')).toBeNull();
  });

  it('returns null when the lower case text is not a slug, so the browser never goes to the same address again', () => {
    expect(BuildLowercaseSlugPath('/p/a%3Cb')).toBeNull();
    expect(BuildLowercaseSlugPath('/p/Requested-%3Cimg%20src=x%3E')).toBeNull();
    expect(BuildLowercaseSlugPath('/p/caf%C3%A9')).toBeNull();
    expect(BuildLowercaseSlugPath('/p/My_Page')).toBeNull();
  });
});

const sitePages: PublicPageEntry[] = [
  { Slug: 'pricing', AppName: 'acme', Load: LoadFake },
  { Slug: 'docs', AppName: 'acme', SubPaths: true, Load: LoadFake },
  { Role: 'error', Scope: 'docs', AppName: 'acme', Load: LoadFake },
  { Role: 'error', Scope: 'docs/guides/deep', AppName: 'acme', Load: LoadFake },
  { Role: 'error', Scope: '', AppName: 'acme', Load: LoadFake },
  { Role: 'error', Scope: '', AppName: 'other', Load: LoadFake },
];

describe('ResolvePublicPage', () => {
  it('gives the page at its own address', () => {
    expect(ResolvePublicPage(sitePages, ParsePublicPagePath('/p/pricing'))?.Slug).toBe('pricing');
    expect(ResolvePublicPage(sitePages, ParsePublicPagePath('/p/pricing/'))?.Slug).toBe('pricing');
  });

  it('gives no page for an address under a page that did not opt in to sub-paths', () => {
    expect(ResolvePublicPage(sitePages, ParsePublicPagePath('/p/pricing/anything'))).toBeNull();
  });

  it('gives the page for an address under a page with SubPaths', () => {
    expect(ResolvePublicPage(sitePages, ParsePublicPagePath('/p/docs/guides/setup'))?.Slug).toBe('docs');
  });

  it('gives no page for an unknown slug or no slug', () => {
    expect(ResolvePublicPage(sitePages, ParsePublicPagePath('/p/no-such-slug'))).toBeNull();
    expect(ResolvePublicPage(sitePages, ParsePublicPagePath('/p/'))).toBeNull();
  });

  it('never gives an error entry as a page', () => {
    const pages: PublicPageEntry[] = [{ Role: 'error', Scope: 'docs', AppName: 'acme', Load: LoadFake }];
    expect(ResolvePublicPage(pages, ParsePublicPagePath('/p/docs'))).toBeNull();
    expect(FindPublicPage(pages, 'docs')).toBeNull();
  });
});

describe('FindPublicErrorPage', () => {
  const scopeFor = (pathname: string): string | undefined => FindPublicErrorPage(sitePages, ParsePublicPagePath(pathname))?.Scope;

  it('uses the error page of the requested folder first', () => {
    expect(scopeFor('/p/docs/guides/deep')).toBe('docs/guides/deep');
    expect(scopeFor('/p/docs/guides/deep/more')).toBe('docs/guides/deep');
  });

  it('walks up to the nearest parent folder with an error page', () => {
    expect(scopeFor('/p/docs/guides/no-such-thing')).toBe('docs');
    expect(scopeFor('/p/docs')).toBe('docs');
  });

  it('uses the root error page when no folder has one', () => {
    expect(scopeFor('/p/pricing/anything')).toBe('');
    expect(scopeFor('/p/no-such-slug')).toBe('');
    expect(scopeFor('/p/')).toBe('');
  });

  it('uses the first root error page when two apps have one', () => {
    expect(FindPublicErrorPage(sitePages, ParsePublicPagePath('/p/x'))?.AppName).toBe('acme');
  });

  it('gives null when there is no error page', () => {
    expect(FindPublicErrorPage([{ Slug: 'pricing', AppName: 'acme', Load: LoadFake }], ParsePublicPagePath('/p/x'))).toBeNull();
  });

  it('does not match a folder by a part of its name', () => {
    expect(scopeFor('/p/docs-old/page')).toBe('');
  });
});
