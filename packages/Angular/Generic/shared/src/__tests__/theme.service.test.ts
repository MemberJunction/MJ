import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * ThemeService.Initialize() — which preference it applies when nothing (valid) is saved
 * (LXP P2: `ThemeDefinition.IsDefault`). A single-brand host used to force `SetTheme('brand')`
 * on every login, fighting Initialize()'s own resolution and writing a preference the user
 * never chose; now it flags its theme as the default and Initialize() lands on it.
 *
 * The user-settings engine is stubbed (no database in unit tests); the theme engine is stubbed
 * because brand derivation is not under test. jsdom has no matchMedia, so a non-matching one is
 * installed: 'system' resolves to 'light' here.
 */
const settings = { saved: undefined as string | undefined, throwOnRead: false };
vi.mock('@memberjunction/core-entities', () => ({
  UserInfoEngine: {
    Instance: {
      GetSetting: () => {
        if (settings.throwOnRead) {
          throw new Error('settings unavailable');
        }
        return settings.saved;
      },
      SetSetting: vi.fn(async () => true),
    },
  },
}));
vi.mock('@memberjunction/theme-engine', () => ({
  derive: vi.fn(),
  emitOverlayCss: vi.fn(() => ''),
  emitLogoOverlayCss: vi.fn(() => ''),
}));

import { UserInfoEngine } from '@memberjunction/core-entities';
import { ThemeDefinition, ThemeService } from '../lib/theme.service';

const BRAND: ThemeDefinition = { Id: 'brand', Name: 'Brand', BaseTheme: 'light', IsBuiltIn: true, IsDefault: true };
const BRAND_DARK: ThemeDefinition = { Id: 'brand-dark', Name: 'Brand Dark', BaseTheme: 'dark', IsBuiltIn: true };

describe('ThemeService — IsDefault', () => {
  beforeEach(() => {
    settings.saved = undefined;
    settings.throwOnRead = false;
    vi.mocked(UserInfoEngine.Instance.SetSetting).mockClear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }),
    });
    document.documentElement.removeAttribute('data-theme');
  });

  it('with nothing saved and no default registered, the preference is system (today\'s behaviour)', async () => {
    const service = new ThemeService();
    await service.Initialize();
    expect(service.DefaultPreference).toBe('system');
    expect(service.Preference).toBe('system');
    expect(service.AppliedTheme).toBe('light');
  });

  it('with nothing saved, the registered default theme is applied', async () => {
    const service = new ThemeService();
    service.RegisterThemes([BRAND, BRAND_DARK]);
    await service.Initialize();
    expect(service.DefaultPreference).toBe('brand');
    expect(service.Preference).toBe('brand');
    expect(service.AppliedTheme).toBe('brand');
  });

  it('a saved preference still wins over the default', async () => {
    settings.saved = 'brand-dark';
    const service = new ThemeService();
    service.RegisterThemes([BRAND, BRAND_DARK]);
    await service.Initialize();
    expect(service.Preference).toBe('brand-dark');
    expect(service.AppliedTheme).toBe('brand-dark');
  });

  it('a saved "system" is honored even when a default is registered', async () => {
    settings.saved = 'system';
    const service = new ThemeService();
    service.RegisterThemes([BRAND]);
    await service.Initialize();
    expect(service.Preference).toBe('system');
  });

  it('a saved theme that is no longer registered falls back to the default, not to system', async () => {
    settings.saved = 'retired-theme';
    const service = new ThemeService();
    service.RegisterThemes([BRAND]);
    await service.Initialize();
    expect(service.Preference).toBe('brand');
  });

  it('the first registered default wins when two are flagged', async () => {
    const service = new ThemeService();
    service.RegisterThemes([BRAND, { ...BRAND_DARK, IsDefault: true }]);
    expect(service.DefaultPreference).toBe('brand');
  });

  it('a default theme does not write a preference the user never chose', async () => {
    const service = new ThemeService();
    service.RegisterThemes([BRAND]);
    await service.Initialize();
    expect(UserInfoEngine.Instance.SetSetting).not.toHaveBeenCalled();
  });

  it('a built-in slot flagged default LATER does not beat a custom theme flagged first (registration order, not registry slot)', async () => {
    const service = new ThemeService();
    service.RegisterThemes([
      { Id: 'acme', Name: 'Acme', BaseTheme: 'light', IsBuiltIn: true, IsDefault: true },
      { Id: 'dark', Name: 'Dark', BaseTheme: 'dark', IsBuiltIn: true, IsDefault: true },
    ]);
    expect(service.DefaultPreference).toBe('acme');
  });

  it('re-registering the default without the flag drops it from the running', async () => {
    const service = new ThemeService();
    service.RegisterThemes([BRAND, { ...BRAND_DARK, IsDefault: true }]);
    service.RegisterTheme({ ...BRAND, IsDefault: false });
    expect(service.DefaultPreference).toBe('brand-dark');
  });

  it('a failed settings read falls back to the default, and to system without one', async () => {
    settings.throwOnRead = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const withDefault = new ThemeService();
      withDefault.RegisterThemes([BRAND]);
      await withDefault.Initialize();
      expect(withDefault.Preference).toBe('brand');

      const without = new ThemeService();
      await without.Initialize();
      expect(without.Preference).toBe('system');
      expect(without.AppliedTheme).toBe('light');
    } finally {
      warn.mockRestore();
    }
  });

  it('an unregistered saved theme with no default registered lands on system', async () => {
    settings.saved = 'retired-theme';
    const service = new ThemeService();
    await service.Initialize();
    expect(service.Preference).toBe('system');
    expect(service.AppliedTheme).toBe('light');
  });

  it('Reset() parks the preference on the default, not on system', async () => {
    settings.saved = 'brand-dark';
    const service = new ThemeService();
    service.RegisterThemes([BRAND, BRAND_DARK]);
    await service.Initialize();
    expect(service.Preference).toBe('brand-dark');
    service.Reset();
    expect(service.Preference).toBe('brand');
    expect(service.IsInitialized).toBe(false);
  });
});
