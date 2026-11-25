import '@angular/compiler';
import { EventEmitter } from '@angular/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InstanceConfigEngine, UserInfoEngine } from '@memberjunction/core-entities';
import { BaseApplication } from '@memberjunction/ng-base-application';
import {
  CreateDefaultNoAccessBrandingConfig,
  ParseNoAccessBrandingJson,
  ResolveShellNoAccessBranding,
  SHELL_NO_ACCESS_BRANDING_INSTANCE_CONFIG_KEY,
  SHELL_NO_ACCESS_BRANDING_SETTING_KEY,
  ShellNoAccessBrandingConfig,
  ShellNoAccessComponent,
} from './shell-no-access.component';
import { ShellComponent } from '../../shell.component';
import {
  RESTRICTED_SHELL_CHROME_VISIBILITY,
  ShellChromePolicyEvaluateOptions,
  ShellChromeVisibility,
  UNRESTRICTED_SHELL_CHROME_VISIBILITY,
} from '../../services/shell-chrome-policy.service';
import type { ShellChromeFlags } from '../../shell-chrome-policy';

interface StorageSpyBundle {
  localGet: ReturnType<typeof vi.fn>;
  localSet: ReturnType<typeof vi.fn>;
  sessionGet: ReturnType<typeof vi.fn>;
  sessionSet: ReturnType<typeof vi.fn>;
}

function installStorageSpies(): StorageSpyBundle {
  const localGet = vi.fn();
  const localSet = vi.fn();
  const sessionGet = vi.fn();
  const sessionSet = vi.fn();
  vi.stubGlobal('localStorage', {
    getItem: localGet,
    setItem: localSet,
    removeItem: vi.fn(),
    clear: vi.fn(),
  });
  vi.stubGlobal('sessionStorage', {
    getItem: sessionGet,
    setItem: sessionSet,
    removeItem: vi.fn(),
    clear: vi.fn(),
  });
  return { localGet, localSet, sessionGet, sessionSet };
}

function createMockUserInfoEngine(settings: Record<string, string | undefined> = {}): { engine: UserInfoEngine; configSpy: ReturnType<typeof vi.fn> } {
  const configSpy = vi.fn(async (): Promise<void> => {});
  const engine = Object.create(UserInfoEngine.prototype) as UserInfoEngine;
  engine.GetSetting = (key: string) => settings[key];
  engine.Config = configSpy;
  return {
    engine,
    configSpy,
  };
}

function createNoAccessComponentInstance(engineOverride?: UserInfoEngine): { component: ShellNoAccessComponent; markForCheck: ReturnType<typeof vi.fn> } {
  const markForCheck = vi.fn();
  const component = Object.create(ShellNoAccessComponent.prototype) as ShellNoAccessComponent;
  Reflect.set(component, 'cdr', { markForCheck });
  Reflect.set(component, '_brandingConfig', null);
  Reflect.set(component, '_userInfoEngineOverride', engineOverride ?? null);
  Reflect.set(component, '_userName', '');
  Reflect.set(component, '_userEmail', '');
  Reflect.set(component, '_isRefreshing', false);
  Reflect.set(component, '_refreshErrorMessage', '');
  Reflect.set(component, 'logoLoadFailed', false);
  Reflect.set(component, 'ResolvedBranding', CreateDefaultNoAccessBrandingConfig());
  Reflect.set(component, 'RefreshAccess', new EventEmitter<void>());
  Reflect.set(component, 'SignOut', new EventEmitter<void>());
  return { component, markForCheck };
}

interface ShellZeroGrantHarness {
  shell: ShellComponent;
  apps: BaseApplication[];
  activeApp: BaseApplication | null;
  reloadUserApps: ReturnType<typeof vi.fn>;
  policyRefresh: ReturnType<typeof vi.fn>;
  authLogout: ReturnType<typeof vi.fn>;
  detectChanges: ReturnType<typeof vi.fn>;
  markForCheck: ReturnType<typeof vi.fn>;
}

function createShellZeroGrantHarness(initialApps: BaseApplication[]): ShellZeroGrantHarness {
  let currentApps = [...initialApps];
  let currentActiveApp: BaseApplication | null = null;
  const reloadUserApps = vi.fn(async () => {});
  const policyRefresh = vi.fn(
    (): ShellChromeVisibility => (currentApps.length === 0 ? RESTRICTED_SHELL_CHROME_VISIBILITY : UNRESTRICTED_SHELL_CHROME_VISIBILITY),
  );
  const authLogout = vi.fn();
  const detectChanges = vi.fn();
  const markForCheck = vi.fn();

  const shell = Object.create(ShellComponent.prototype) as ShellComponent;
  Reflect.set(shell, '_loading', true);
  Reflect.set(shell, 'HasZeroApplicationGrants', false);
  Reflect.set(shell, 'IsRefreshingAccess', false);
  Reflect.set(shell, 'NoAccessRefreshError', '');
  Reflect.set(shell, '_chromeFlags', null);
  Reflect.set(shell, 'resolvedRecordOpenStyle', 'records');
  Reflect.set(shell, 'chromePolicy', { Resolve: (flags: ShellChromeFlags) => flags });
  Reflect.set(shell, 'cdr', { detectChanges, markForCheck });
  Reflect.set(shell, 'authBase', {
    GetSessionScope: () => undefined,
    logout: authLogout,
  });
  Reflect.set(shell, 'appManager', {
    GetAllApps: () => currentApps,
    GetActiveApp: () => currentActiveApp,
    GetDefaultLandingApp: () => currentApps[0] ?? null,
    SetActiveApp: vi.fn(async (id: string) => {
      currentActiveApp = currentApps.find((a) => a.ID === id) ?? null;
    }),
    ReloadUserApplications: reloadUserApps,
  });
  Reflect.set(shell, 'workspaceManager', {
    GetConfiguration: vi.fn(() => ({ tabs: [] })),
  });
  Reflect.set(shell, 'shellChromePolicyService', {
    GetVisibility: (_opts?: ShellChromePolicyEvaluateOptions) =>
      currentApps.length === 0 ? RESTRICTED_SHELL_CHROME_VISIBILITY : UNRESTRICTED_SHELL_CHROME_VISIBILITY,
    Refresh: policyRefresh,
  });
  Reflect.set(shell, 'loadingMessageInterval', null);
  Reflect.set(shell, 'animationSequenceTimeout', null);
  Reflect.set(shell, 'loadingResetTimeout', null);

  Object.defineProperty(shell, 'ProviderToUse', { get: () => null, configurable: true });

  return {
    shell,
    get apps() {
      return currentApps;
    },
    set apps(next: BaseApplication[]) {
      currentApps = next;
    },
    get activeApp() {
      return currentActiveApp;
    },
    reloadUserApps,
    policyRefresh,
    authLogout,
    detectChanges,
    markForCheck,
  };
}

describe('ShellNoAccessComponent — Branding, Settings & Actions', () => {
  let storageSpies: StorageSpyBundle;

  beforeEach(() => {
    storageSpies = installStorageSpies();
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue(undefined);
    vi.spyOn(UserInfoEngine.Instance, 'GetSetting').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('provides clean domain-neutral defaults with zero vertical-specific copy', () => {
    const defaults = CreateDefaultNoAccessBrandingConfig();
    expect(defaults.BrandTitle).toBe('Workspace Access');
    expect(defaults.Heading).toBe('No Applications Assigned');
    expect(defaults.Message).toContain('no applications');
    expect(defaults.RefreshLabel).toBe('Refresh Access');
    expect(defaults.SignOutLabel).toBe('Sign Out');
    expect(defaults.SupportEmail).toBeNull();
    expect(defaults.SupportUrl).toBeNull();
    expect(defaults.LogoUrl).toBeNull();
  });

  it('parses and sanitizes branding JSON cleanly while rejecting unsafe URLs and emails', () => {
    const parsed = ParseNoAccessBrandingJson(
      JSON.stringify({
        brandTitle: 'Partner Portal',
        heading: 'Access Pending',
        supportEmail: 'help@example.org',
        supportUrl: 'https://support.example.org/portal',
        logoUrl: 'https://cdn.example.org/logo.svg',
      }),
    );
    expect(parsed).toEqual({
      BrandTitle: 'Partner Portal',
      Heading: 'Access Pending',
      SupportEmail: 'help@example.org',
      SupportUrl: 'https://support.example.org/portal',
      LogoUrl: 'https://cdn.example.org/logo.svg',
    });

    const sanitized = ResolveShellNoAccessBranding({
      LogoUrl: 'javascript:alert(1)',
      SupportUrl: 'javascript:void(0)',
      SupportEmail: 'bad email\n@example.org',
      LogoIconClass: 'fa-solid fa-star;color:red',
      BrandTitle: 'Safe Org',
    });

    expect(sanitized.LogoUrl).toBeNull();
    expect(sanitized.SupportUrl).toBeNull();
    expect(sanitized.SupportEmail).toBeNull();
    expect(sanitized.LogoIconClass).toBe('fa-solid fa-shield-halved');
    expect(sanitized.BrandTitle).toBe('Safe Org');
  });

  it('resolves branding from InstanceConfigEngine, UserInfoEngine.GetSetting, and BrandingConfig input without web storage', () => {
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockImplementation((key: string) =>
      key === SHELL_NO_ACCESS_BRANDING_INSTANCE_CONFIG_KEY
        ? JSON.stringify({
            BrandTitle: 'Deployment Workspace',
            Heading: 'Deployment Heading',
            SupportEmail: 'ops@deployment.example',
          })
        : undefined,
    );

    const { engine } = createMockUserInfoEngine({
      [SHELL_NO_ACCESS_BRANDING_SETTING_KEY]: JSON.stringify({
        Heading: 'Tenant Setting Heading',
        SupportLabel: 'Help Desk',
      }),
    });

    const { component } = createNoAccessComponentInstance(engine);
    component.RefreshBranding();

    expect(component.ResolvedBranding.BrandTitle).toBe('Deployment Workspace');
    expect(component.ResolvedBranding.Heading).toBe('Tenant Setting Heading');
    expect(component.ResolvedBranding.SupportEmail).toBe('ops@deployment.example');
    expect(component.ResolvedBranding.SupportLabel).toBe('Help Desk');
    expect(component.SupportHref).toBe('mailto:ops@deployment.example');
    expect(component.HasSupportContact).toBe(true);

    const inputOverride: Partial<ShellNoAccessBrandingConfig> = {
      Heading: 'Explicit Component Heading',
      SupportUrl: 'https://help.example.org',
    };
    component.BrandingConfig = inputOverride;

    expect(component.ResolvedBranding.Heading).toBe('Explicit Component Heading');
    expect(component.SupportHref).toBe('https://help.example.org');
    expect(component.SupportOpensNewTab).toBe(true);

    expect(storageSpies.localGet).not.toHaveBeenCalled();
    expect(storageSpies.localSet).not.toHaveBeenCalled();
    expect(storageSpies.sessionGet).not.toHaveBeenCalled();
    expect(storageSpies.sessionSet).not.toHaveBeenCalled();
  });

  it('handles refreshAccess, signOut, and logo fallback safely', () => {
    const { component } = createNoAccessComponentInstance();
    const refreshSpy = vi.fn();
    const signOutSpy = vi.fn();
    component.RefreshAccess.subscribe(refreshSpy);
    component.SignOut.subscribe(signOutSpy);

    component.BrandingConfig = { LogoUrl: '/assets/custom-logo.svg' };
    expect(component.ShowLogoImage).toBe(true);
    component.OnLogoImageError();
    expect(component.ShowLogoImage).toBe(false);

    component.OnRefreshAccess();
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    component.IsRefreshing = true;
    component.OnRefreshAccess();
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    component.OnSignOut();
    expect(signOutSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ShellComponent — Zero-Grant No-Access Integration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('activates HasZeroApplicationGrants on zero apps, scopes chrome, and suppresses deep-link workspace mounting', async () => {
    vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue(undefined);
    vi.spyOn(InstanceConfigEngine.Instance, 'GetBoolean').mockImplementation((_k, def) => def ?? true);

    const harness = createShellZeroGrantHarness([]);
    const handleNoApps = Reflect.get(harness.shell, 'handleNoAppsAvailable') as () => Promise<void>;
    await handleNoApps.call(harness.shell);

    expect(harness.shell.HasZeroApplicationGrants).toBe(true);
    expect(harness.shell.Loading).toBe(false);
    expect(harness.shell.IsRestrictedParticipant).toBe(true);
    expect(harness.shell.ShowSearchBar).toBe(false);
    expect(harness.shell.ShowAppSwitcher).toBe(false);
    expect(harness.shell.ShowNotifications).toBe(false);
    expect(harness.policyRefresh).toHaveBeenCalledTimes(1);

    const syncUrl = Reflect.get(harness.shell, 'syncWorkspaceWithUrl') as (url: string) => Promise<boolean>;
    expect(await syncUrl.call(harness.shell, '/app/admin/users')).toBe(false);
  });

  it('transitions from zero grants to granted landing app when OnRefreshNoAccessGrants finds new grants', async () => {
    const fakeApp = new BaseApplication({
      ID: 'APP-1111-1111-1111-111111111111',
      Name: 'Workspace',
    });
    vi.spyOn(fakeApp, 'CreateDefaultTab').mockResolvedValue({
      ApplicationId: 'APP-1111-1111-1111-111111111111',
      Title: 'Home',
      Configuration: {},
      IsPinned: false,
    });

    const { engine, configSpy } = createMockUserInfoEngine({});
    vi.spyOn(UserInfoEngine, 'Instance', 'get').mockReturnValue(engine);

    const harness = createShellZeroGrantHarness([]);
    harness.shell.HasZeroApplicationGrants = true;

    await harness.shell.OnRefreshNoAccessGrants();
    expect(configSpy).toHaveBeenCalledWith(true);
    expect(harness.reloadUserApps).toHaveBeenCalledTimes(1);
    expect(harness.shell.HasZeroApplicationGrants).toBe(true);
    expect(harness.shell.NoAccessRefreshError).toContain('No application access');

    harness.apps = [fakeApp];
    await harness.shell.OnRefreshNoAccessGrants();
    expect(harness.shell.HasZeroApplicationGrants).toBe(false);
    expect(harness.shell.NoAccessRefreshError).toBe('');
    expect(harness.activeApp?.ID).toBe('APP-1111-1111-1111-111111111111');
  });

  it('renders mj-shell-no-access inside @if (HasZeroApplicationGrants) in shell.component.html', () => {
    const html = readFileSync(join(__dirname, '..', '..', 'shell.component.html'), 'utf8');
    expect(html).toContain('@if (HasZeroApplicationGrants)');
    expect(html).toContain('<mj-shell-no-access');
    expect(html).toContain('(RefreshAccess)="OnRefreshNoAccessGrants()"');
    expect(html).toContain('(SignOut)="OnLogout()"');
  });
});
