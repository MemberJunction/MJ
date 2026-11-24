import { describe, it, expect } from 'vitest';
import {
  RenderComponentFixture,
  Query,
  QueryAll,
  Text,
  Attr,
  HasClass,
  Click,
  Capture,
} from '@memberjunction/ng-test-utils';
import type { PublicAuthProviderInfo } from '@memberjunction/core';
import { MJLoginPickerComponent } from './login-picker.component';

function makeProvider(overrides: Partial<PublicAuthProviderInfo> & { name: string }): PublicAuthProviderInfo {
  return {
    driverClass: overrides.name,
    displayName: overrides.name,
    sequence: 0,
    isDefault: false,
    ...overrides,
  };
}

const MSAL_PROVIDER = makeProvider({
  name: 'msal',
  driverClass: 'msal',
  displayName: 'Microsoft',
  sequence: 1,
  isDefault: true,
});

const CUSTOM_PROVIDER = makeProvider({
  name: 'acme-sso',
  driverClass: 'acme-sso',
  displayName: 'Acme SSO',
  sequence: 2,
  isDefault: false,
});

describe('MJLoginPickerComponent (DOM)', () => {
  it('renders multiple providers with brand icons, initial fallbacks, default badge/class, and accessible group label', () => {
    const fixture = RenderComponentFixture(MJLoginPickerComponent, {
      inputs: {
        Providers: [MSAL_PROVIDER, CUSTOM_PROVIDER],
        Heading: 'Sign in',
        Subheading: 'Select your identity provider',
      },
    });

    expect(Text(fixture, '.mj-login-picker__heading')).toBe('Sign in');
    expect(Text(fixture, '.mj-login-picker__subheading')).toBe('Select your identity provider');
    expect(Attr(fixture, '.mj-login-picker__list', 'aria-label')).toBe('Sign in');

    const rows = QueryAll(fixture, '.mj-login-picker__row');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('mj-login-picker__row--default')).toBe(true);
    expect(rows[1].classList.contains('mj-login-picker__row--default')).toBe(false);
    expect(Text(fixture, '.mj-login-picker__pill')).toBe('Default');
    expect(Query(fixture, 'i.fa-microsoft')).not.toBeNull();
    expect(rows[1].querySelector('.mj-login-picker__chip')?.textContent?.trim()).toBe('A');
    expect(Text(fixture, '.mj-login-picker__attribution')).toBe('Powered by MemberJunction');
  });

  it('renders a single provider as a primary CTA without the Default pill or default border class', () => {
    const fixture = RenderComponentFixture(MJLoginPickerComponent, {
      inputs: {
        Providers: [MSAL_PROVIDER],
        Heading: null,
      },
    });

    expect(Query(fixture, '.mj-login-picker__heading')).toBeNull();
    expect(Attr(fixture, '.mj-login-picker__list', 'aria-label')).toBe('Sign-in options');
    expect(HasClass(fixture, '.mj-login-picker__row', 'mj-login-picker__row--default')).toBe(false);
    expect(Query(fixture, '.mj-login-picker__pill')).toBeNull();
  });

  it('emits ProviderSelected when clicked and disables rows when Busy is true', () => {
    const activeFixture = RenderComponentFixture(MJLoginPickerComponent, {
      inputs: { Providers: [MSAL_PROVIDER, CUSTOM_PROVIDER], Busy: false },
    });
    const selected = Capture(activeFixture.componentInstance.ProviderSelected);
    Click(activeFixture, '.mj-login-picker__row');
    expect(selected).toEqual([MSAL_PROVIDER]);

    const busyFixture = RenderComponentFixture(MJLoginPickerComponent, {
      inputs: { Providers: [MSAL_PROVIDER], Busy: true },
    });
    const busySelected = Capture(busyFixture.componentInstance.ProviderSelected);
    const button = Query(busyFixture, '.mj-login-picker__row') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    button.click();
    expect(busySelected).toEqual([]);
  });

  it('renders FallbackCtaLabel when Providers is empty, emits FallbackSelected, and honors ShowPoweredBy', () => {
    const fixture = RenderComponentFixture(MJLoginPickerComponent, {
      inputs: {
        Providers: [],
        FallbackCtaLabel: 'Continue with SSO',
        ShowPoweredBy: false,
      },
    });

    const fallbackClicks = Capture(fixture.componentInstance.FallbackSelected);
    expect(Text(fixture, '.mj-login-picker__row--fallback')).toBe('Continue with SSO');
    expect(Query(fixture, '.mj-login-picker__attribution')).toBeNull();

    Click(fixture, '.mj-login-picker__row--fallback');
    expect(fallbackClicks).toHaveLength(1);
  });
});
