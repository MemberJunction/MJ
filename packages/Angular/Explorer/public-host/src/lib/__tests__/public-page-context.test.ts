import { describe, expect, it, vi } from 'vitest';
import { PublicPageContext } from '../public-page-context';

function makeContext(navigate: (url: string) => void = () => undefined): PublicPageContext {
  return new PublicPageContext({
    Slug: 'lumen',
    SubPath: 'plans',
    Search: '?plan=team&ref=ad',
    Pathname: '/p/lumen/plans',
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

  it('starts sign-in in Explorer', () => {
    const navigate = vi.fn<(url: string) => void>();
    makeContext(navigate).StartSignIn();
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('has no brand until one is set', () => {
    const context = makeContext();
    expect(context.Brand()).toBeNull();
    context.SetBrand({ ThemeName: 'Acme', Design: null, Seeds: null, Logos: { wordmarkURL: 'https://cdn/acme.svg' } });
    expect(context.Brand()?.ThemeName).toBe('Acme');
  });

  it('has no error until the page or the host reports one', () => {
    const context = makeContext();
    expect(context.Error()).toBeNull();
    context.ShowNotFound();
    expect(context.Error()).toEqual({ Reason: 'not-found', RequestedPath: '/p/lumen/plans' });
  });

  it('keeps the first error', () => {
    const context = makeContext();
    context.SetError('load-failed');
    context.ShowNotFound();
    expect(context.Error()?.Reason).toBe('load-failed');
  });
});
