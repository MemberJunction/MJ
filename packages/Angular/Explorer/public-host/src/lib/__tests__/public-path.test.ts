import { describe, expect, it } from 'vitest';
import { FindPublicPage, IsPublicPagePath, ReadPublicPageSlug } from '../public-path';
import type { PublicPageEntry } from '../public-page-entry';

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

describe('ReadPublicPageSlug', () => {
  it('reads the first segment after /p/', () => {
    expect(ReadPublicPageSlug('/p/lumen')).toBe('lumen');
    expect(ReadPublicPageSlug('/p/lumen/')).toBe('lumen');
    expect(ReadPublicPageSlug('/p/lumen/plans')).toBe('lumen');
  });

  it('decodes and lower-cases the slug', () => {
    expect(ReadPublicPageSlug('/p/Lumen')).toBe('lumen');
  });

  it('returns null when there is no slug', () => {
    expect(ReadPublicPageSlug('/p/')).toBeNull();
    expect(ReadPublicPageSlug('/app/home')).toBeNull();
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
