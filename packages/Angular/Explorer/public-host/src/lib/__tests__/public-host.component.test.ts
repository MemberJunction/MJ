import '@angular/compiler';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PublicPageContext } from '../public-page-context';
import type { PublicHostConfig } from '../public-pages';

const angular = vi.hoisted(() => ({ tokens: new Map<unknown, unknown>(), effects: [] as (() => void)[] }));

vi.mock('@angular/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@angular/core')>()),
  inject: (token: unknown) => angular.tokens.get(token),
  effect: (run: () => void) => { angular.effects.push(run); },
}));

import { PUBLIC_HOST_CONFIG, PublicHostComponent } from '../public-host.component';

/** A document that holds only the tags added to its head. */
function fakeDocument(): { Document: Document; Tags: { name: string; content: string }[] } {
  const tags: { name: string; content: string }[] = [];
  const doc = {
    head: { querySelector: () => null, appendChild: (tag: { name: string; content: string }) => tags.push(tag) },
    createElement: () => ({ name: '', content: '' }),
  };
  return { Document: doc as unknown as Document, Tags: tags };
}

describe('PublicHostComponent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    angular.tokens.clear();
    angular.effects.length = 0;
  });

  it('tells search engines not to index an address with no page', () => {
    const { Document: doc, Tags: tags } = fakeDocument();
    vi.stubGlobal('window', { location: { pathname: '/p/no-such-page' } });
    vi.stubGlobal('document', doc);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const config: PublicHostConfig = { Environment: { MJAPI_URI: 'https://api.example.com' } as PublicHostConfig['Environment'], PublicPages: [] };
    const context = new PublicPageContext({ Slug: 'no-such-page', SubPath: '', Search: '', Pathname: '/p/no-such-page', MJAPIURL: 'https://api.example.com', Navigate: vi.fn() });
    angular.tokens.set(PUBLIC_HOST_CONFIG, config);
    angular.tokens.set(PublicPageContext, context);

    const host = new PublicHostComponent();
    host.ngOnInit();
    angular.effects.forEach((run) => run());

    expect(host.State()).toBe('missing');
    expect(tags).toEqual([{ name: 'robots', content: 'noindex' }]);
  });
});
