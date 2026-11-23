import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const mocks = vi.hoisted(() => ({
  tryStartPublicPage: vi.fn<(config: object) => Promise<boolean>>(),
  bootstrapModule: vi.fn<(module: object) => Promise<void>>(),
}));

vi.mock('@memberjunction/ng-public-host/bootstrap', () => ({ TryStartPublicPage: mocks.tryStartPublicPage }));
vi.mock('@angular/platform-browser', () => ({ platformBrowser: () => ({ bootstrapModule: mocks.bootstrapModule }) }));
vi.mock('@memberjunction/ng-auth-services/preload', () => ({
  AuthProviderCatalog: { Preload: async (uri: string) => { calls.push(`catalog ${uri}`); } },
  LoginScreenLoader: { Load: async (uri: string) => { calls.push(`login-screen ${uri}`); } },
  PreloadActiveAuthProvider: async () => { calls.push('auth-provider'); },
}));

import { StartExplorer } from '../bootstrap';

class FakeAppModule {}
const environment = { GRAPHQL_URI: 'http://localhost:4000/', AUTH_TYPE: 'msal' };
const pages = [{ Slug: 'pricing', AppName: 'acme', Load: () => Promise.resolve(FakeAppModule) }];

function options() {
  return {
    Environment: environment,
    PublicPages: pages,
    LoadAppModule: async () => { calls.push('app-module'); return FakeAppModule; },
  };
}

describe('StartExplorer', () => {
  beforeEach(() => {
    calls.length = 0;
    mocks.tryStartPublicPage.mockReset();
    mocks.bootstrapModule.mockReset().mockImplementation(async () => { calls.push('bootstrap'); });
  });

  it('starts only the public host on a public page address', async () => {
    mocks.tryStartPublicPage.mockResolvedValue(true);
    await StartExplorer(options());
    expect(mocks.tryStartPublicPage).toHaveBeenCalledWith({ Environment: environment, PublicPages: pages });
    expect(calls).toEqual([]);
    expect(mocks.bootstrapModule).not.toHaveBeenCalled();
  });

  it('loads the sign-in data, then the auth provider, then the app module, then starts Explorer', async () => {
    mocks.tryStartPublicPage.mockResolvedValue(false);
    await StartExplorer(options());
    expect(calls.slice(0, 2).sort()).toEqual(['catalog http://localhost:4000/', 'login-screen http://localhost:4000/']);
    expect(calls.slice(2)).toEqual(['auth-provider', 'app-module', 'bootstrap']);
    expect(mocks.bootstrapModule).toHaveBeenCalledWith(FakeAppModule);
  });

  it('logs a failed start and does not reject', async () => {
    mocks.tryStartPublicPage.mockResolvedValue(false);
    mocks.bootstrapModule.mockRejectedValue(new Error('boom'));
    const logError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(StartExplorer(options())).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalled();
    logError.mockRestore();
  });
});
