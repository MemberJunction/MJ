import { describe, expect, it, vi } from 'vitest';
import { PublicPageContext } from '../public-page-context';

function makeContext(navigate: (url: string) => void = () => undefined): PublicPageContext {
  return new PublicPageContext({
    Slug: 'lumen',
    Path: '/p/lumen/plans',
    Search: '?plan=team&ref=ad',
    MJAPIURL: 'https://host/api',
    Navigate: navigate,
  });
}

describe('PublicPageContext', () => {
  it('exposes the slug, the path after the slug and the query', () => {
    const context = makeContext();
    expect(context.Slug).toBe('lumen');
    expect(context.SubPath).toBe('plans');
    expect(context.QueryParams.get('plan')).toBe('team');
  });

  it('builds MJAPI URLs for the app\'s public endpoints', () => {
    expect(makeContext().BuildMJAPIURL('/lumen/plans')).toBe('https://host/api/lumen/plans');
    expect(makeContext().BuildMJAPIURL('lumen/plans')).toBe('https://host/api/lumen/plans');
  });

  it('starts sign-up and sign-in in Explorer', () => {
    const navigate = vi.fn<(url: string) => void>();
    const context = makeContext(navigate);
    context.StartSignUp();
    context.StartSignIn();
    expect(navigate).toHaveBeenNthCalledWith(1, '/?signup=1');
    expect(navigate).toHaveBeenNthCalledWith(2, '/');
  });

  it('has no brand until one is set', () => {
    const context = makeContext();
    expect(context.Brand()).toBeNull();
    context.SetBrand({ ThemeName: 'Acme', Design: null, Seeds: null, Logos: { wordmarkURL: 'https://cdn/acme.svg' } });
    expect(context.Brand()?.ThemeName).toBe('Acme');
  });
});
