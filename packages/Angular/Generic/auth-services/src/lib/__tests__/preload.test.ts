import { describe, it, expect } from 'vitest';
import * as PreloadExports from '../../preload';

describe('ng-auth-services/preload entry point', () => {
  it('exports AuthProviderCatalog and LoginScreenLoader', () => {
    expect(PreloadExports.AuthProviderCatalog).toBeDefined();
    expect(typeof PreloadExports.AuthProviderCatalog.Preload).toBe('function');
    expect(typeof PreloadExports.AuthProviderCatalog.GetPreloaded).toBe('function');
    expect(typeof PreloadExports.AuthProviderCatalog.BuildCatalogUrl).toBe('function');

    expect(PreloadExports.LoginScreenLoader).toBeDefined();
    expect(typeof PreloadExports.LoginScreenLoader.Load).toBe('function');
    expect(typeof PreloadExports.LoginScreenLoader.BuildURL).toBe('function');
  });

  it('exports catalog environment helpers', () => {
    expect(PreloadExports.BuildGenericEnvironmentOverlay).toBeDefined();
    expect(typeof PreloadExports.BuildGenericEnvironmentOverlay).toBe('function');
    expect(PreloadExports.buildGenericEnvironmentOverlay).toBeDefined();
  });

  it('does NOT export heavyweight Angular components or auth providers', () => {
    const keys = Object.keys(PreloadExports);
    expect(keys).not.toContain('AuthServicesModule');
    expect(keys).not.toContain('RedirectComponent');
    expect(keys).not.toContain('LoginPickerComponent');
    expect(keys).not.toContain('LoginRegionComponent');
    expect(keys).not.toContain('MJMSALProvider');
    expect(keys).not.toContain('MJAuth0Provider');
    expect(keys).not.toContain('MJOktaProvider');
    expect(keys).not.toContain('MJCognitoProvider');
    expect(keys).not.toContain('MJWorkOSProvider');
  });
});
