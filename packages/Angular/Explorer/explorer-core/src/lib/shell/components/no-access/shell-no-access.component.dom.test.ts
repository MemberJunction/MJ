import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { InstanceConfigEngine, UserInfoEngine } from '@memberjunction/core-entities';
import { Capture, Query, RenderComponentFixture, Text } from '@memberjunction/ng-test-utils';
import { SHELL_NO_ACCESS_BRANDING_SETTING_KEY, ShellNoAccessBrandingConfig, ShellNoAccessComponent } from './shell-no-access.component';

interface RenderNoAccessOptions {
  brandingConfig?: Partial<ShellNoAccessBrandingConfig> | null;
  userInfoEngineOverride?: UserInfoEngine | null;
  userName?: string;
  userEmail?: string;
  isRefreshing?: boolean;
  refreshErrorMessage?: string;
}

function createMockEngine(settings: Record<string, string>): UserInfoEngine {
  const engineStub: Partial<UserInfoEngine> & {
    GetSetting: (key: string) => string | undefined;
  } = {
    GetSetting: (key: string) => settings[key],
  };
  return engineStub as UserInfoEngine;
}

const renderNoAccess = (options: RenderNoAccessOptions = {}) =>
  RenderComponentFixture(ShellNoAccessComponent, {
    imports: [CommonModule, MJButtonDirective],
    declarations: [ShellNoAccessComponent],
    inputs: {
      BrandingConfig: options.brandingConfig ?? null,
      UserInfoEngineOverride: options.userInfoEngineOverride ?? null,
      UserName: options.userName ?? '',
      UserEmail: options.userEmail ?? '',
      IsRefreshing: options.isRefreshing ?? false,
      RefreshErrorMessage: options.refreshErrorMessage ?? '',
    },
  });

describe('ShellNoAccessComponent (DOM)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('renders clean domain-neutral defaults and hides optional support and identity blocks when omitted', () => {
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);

    const fixture = renderNoAccess();

    expect(Text(fixture, '.no-access-brand-title')).toBe('Workspace Access');
    expect(Text(fixture, '.no-access-heading')).toBe('No Applications Assigned');
    expect(Text(fixture, '.no-access-message')).toContain('no applications or workspace spaces');
    expect(Query(fixture, '.no-access-identity')).toBeNull();
    expect(Query(fixture, '.no-access-support')).toBeNull();
    expect(Query(fixture, '.no-access-logo-img')).toBeNull();
    expect(Query(fixture, '.no-access-logo-badge')).not.toBeNull();
  });

  it('renders custom BrandingConfig inputs, UserInfoEngine setting overrides, identity pill, and support link', () => {
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue(undefined);
    const engine = createMockEngine({
      [SHELL_NO_ACCESS_BRANDING_SETTING_KEY]: JSON.stringify({
        BrandTitle: 'External Portal',
        SupportEmail: 'support@example.org',
      }),
    });

    const fixture = renderNoAccess({
      userInfoEngineOverride: engine,
      brandingConfig: {
        LogoUrl: '/assets/brand-mark.svg',
        Heading: 'Workspace Provisioning Required',
        Message: 'Ask your coordinator to assign an application space.',
        SupportLabel: 'Contact Coordinator',
        RefreshLabel: 'Check Again',
        SignOutLabel: 'Leave Session',
      },
      userName: 'Jordan Participant',
      userEmail: 'jordan@external.example',
    });

    expect(Text(fixture, '.no-access-brand-title')).toBe('External Portal');
    expect(Text(fixture, '.no-access-heading')).toBe('Workspace Provisioning Required');
    expect(Text(fixture, '.no-access-message')).toBe('Ask your coordinator to assign an application space.');

    const logo = Query(fixture, '.no-access-logo-img') as HTMLImageElement | null;
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('src')).toBe('/assets/brand-mark.svg');

    expect(Text(fixture, '.no-access-identity-name')).toBe('Jordan Participant');
    expect(Text(fixture, '.no-access-identity-email')).toBe('jordan@external.example');

    const supportLink = Query(fixture, '.no-access-support-link') as HTMLAnchorElement | null;
    expect(supportLink).not.toBeNull();
    expect(supportLink?.getAttribute('href')).toBe('mailto:support@example.org');
    expect(supportLink?.textContent).toContain('Contact Coordinator');
    expect(supportLink?.textContent).toContain('support@example.org');
  });

  it('emits RefreshAccess and SignOut events when action buttons are clicked', () => {
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);

    const fixture = renderNoAccess();
    const refreshEvents = Capture(fixture.componentInstance.RefreshAccess);
    const signOutEvents = Capture(fixture.componentInstance.SignOut);

    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.no-access-actions button')) as HTMLButtonElement[];
    expect(buttons.length).toBe(2);
    buttons[0].click();
    buttons[1].click();

    expect(refreshEvents.length).toBe(1);
    expect(signOutEvents.length).toBe(1);
  });

  it('disables action buttons and renders feedback banner while refreshing', () => {
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);

    const busyFixture = renderNoAccess({
      isRefreshing: true,
      refreshErrorMessage: 'Still waiting on role assignment.',
    });
    const busyButtons = Array.from(busyFixture.nativeElement.querySelectorAll('.no-access-actions button')) as HTMLButtonElement[];
    expect(busyButtons[0].disabled).toBe(true);
    expect(busyButtons[1].disabled).toBe(true);
    expect(Text(busyFixture, '.no-access-feedback')).toContain('Still waiting on role assignment.');
  });
});
