/**
 * Tests for the pre-authentication sign-in page loader:
 * - degradation (an older or unreachable server must never block the login screen)
 * - the client re-normalizes what the server sends before anything is drawn
 * - one request per page load, shared by the bootstrap preload and the login screen
 */
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn()
}));

import { DefaultLoginDesign } from '@memberjunction/theme-engine';
import { LoginScreenLoader } from '../login-screen-loader';

const URI = 'http://localhost:4000/';

function respond(status: number, body: unknown) {
  return vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
}

describe('LoginScreenLoader', () => {
  afterEach(() => {
    LoginScreenLoader.Reset();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds the route next to the GraphQL endpoint', () => {
    expect(LoginScreenLoader.BuildURL('https://api.example.org/graphql')).toBe('https://api.example.org/auth/login-screen');
  });

  it('sanitizes what the server sent before anything is drawn', async () => {
    const design = DefaultLoginDesign();
    vi.stubGlobal('fetch', respond(200, { ThemeName: 'Acme', Design: design, Seeds: { primary: '#0076b6', fontFamily: 'x;}' }, Logos: { lightMarkURL: 'https://x.org/m.svg', darkMarkURL: 'javascript:x' } }));
    expect(await LoginScreenLoader.Fetch(URI)).toEqual({ ThemeName: 'Acme', Design: design, Seeds: { primary: '#0076b6' }, Logos: { lightMarkURL: 'https://x.org/m.svg' } });

    const unsafe = DefaultLoginDesign();
    unsafe.Regions.PanelBottom = [{ ID: 'b-x', Type: 'image', URL: 'javascript:alert(1)', Alt: 'x', Size: 'md', Width: 'full', HideWhenStacked: false }];
    vi.stubGlobal('fetch', respond(200, { ThemeName: null, Design: unsafe, Seeds: null, Logos: {} }));
    expect((await LoginScreenLoader.Fetch(URI))?.Design).toBeNull();
  });

  it('resolves null on 404, on another HTTP error, on a bad body and on a network failure', async () => {
    vi.stubGlobal('fetch', respond(404, {}));
    await expect(LoginScreenLoader.Fetch(URI)).resolves.toBeNull();
    vi.stubGlobal('fetch', respond(500, {}));
    await expect(LoginScreenLoader.Fetch(URI)).resolves.toBeNull();
    vi.stubGlobal('fetch', respond(200, 'nope'));
    await expect(LoginScreenLoader.Fetch(URI)).resolves.toBeNull();
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(LoginScreenLoader.Fetch(URI)).resolves.toBeNull();
  });

  it('makes one request per page load however many callers ask', async () => {
    const fetchMock = respond(200, { ThemeName: null, Design: null, Seeds: null, Logos: {} });
    vi.stubGlobal('fetch', fetchMock);
    await Promise.all([LoginScreenLoader.Load(URI), LoginScreenLoader.Load(URI)]);
    await LoginScreenLoader.Load(URI);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
