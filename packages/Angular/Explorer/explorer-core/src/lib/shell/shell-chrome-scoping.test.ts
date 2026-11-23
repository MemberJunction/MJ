import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShellComponent } from './shell.component';
import { BaseUserMenu } from '../user-menu/base-user-menu';
import { UserMenuContext, UserMenuItem, isUserMenuDivider } from '../user-menu/user-menu.types';
import {
    RESTRICTED_SHELL_CHROME_VISIBILITY,
    ShellChromePolicyEvaluateOptions,
    ShellChromeVisibility,
    UNRESTRICTED_SHELL_CHROME_VISIBILITY,
} from './services/shell-chrome-policy.service';
import type { ShellChromeFlags } from './shell-chrome-policy';
import { InstanceConfigEngine } from '@memberjunction/core-entities';

interface ShellTestHarness {
    shell: ShellComponent;
    paletteOpen: ReturnType<typeof vi.fn>;
    omnibarOpen: ReturnType<typeof vi.fn>;
    searchFocus: ReturnType<typeof vi.fn>;
    markForCheck: ReturnType<typeof vi.fn>;
}

interface PolicyStub {
    GetVisibility: (options?: ShellChromePolicyEvaluateOptions) => ShellChromeVisibility;
}

function createShellHarness(visibility: ShellChromeVisibility, useOmnibar = false): ShellTestHarness {
    const paletteOpen = vi.fn();
    const omnibarOpen = vi.fn();
    const searchFocus = vi.fn();
    const markForCheck = vi.fn();

    const shell = Object.create(ShellComponent.prototype) as ShellComponent;
    const policyStub: PolicyStub = {
        GetVisibility: () => visibility,
    };

    Reflect.set(shell, '_chromeFlags', null);
    Reflect.set(shell, 'resolvedRecordOpenStyle', 'records');
    Reflect.set(shell, 'chromePolicy', { Resolve: (flags: ShellChromeFlags) => flags });
    Reflect.set(shell, 'authBase', { GetSessionScope: () => undefined });
    Reflect.set(shell, 'cdr', { markForCheck });
    Reflect.set(shell, 'commandPaletteService', { Open: paletteOpen });
    Reflect.set(shell, 'omnibarPalette', { Open: omnibarOpen });
    Reflect.set(shell, 'ShellSearchComposite', { Focus: searchFocus });
    Reflect.set(shell, 'shellChromePolicyService', policyStub);

    Object.defineProperty(shell, 'ProviderToUse', { get: () => null, configurable: true });
    Object.defineProperty(shell, 'UseOmnibar', { get: () => useOmnibar, configurable: true });

    return { shell, paletteOpen, omnibarOpen, searchFocus, markForCheck };
}

function makeKeyboardEvent(key: string): KeyboardEvent {
    const targetStub = { tagName: 'DIV', isContentEditable: false };
    const eventPrototype: object = typeof KeyboardEvent !== 'undefined' ? KeyboardEvent.prototype : Object.prototype;
    const event = Object.create(eventPrototype) as KeyboardEvent;
    Object.defineProperties(event, {
        key: { value: key, configurable: true },
        metaKey: { value: true, configurable: true },
        ctrlKey: { value: true, configurable: true },
        defaultPrevented: { value: false, configurable: true },
        target: { value: targetStub, configurable: true },
        preventDefault: { value: vi.fn(), configurable: true },
        stopPropagation: { value: vi.fn(), configurable: true },
    });
    return event;
}

describe('ShellComponent — Restricted Participant Chrome Policy Integration', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it('preserves full chrome and keyboard triggers for unrestricted users', () => {
        vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue(undefined);
        vi.spyOn(InstanceConfigEngine.Instance, 'GetBoolean').mockImplementation((_k, def) => def ?? true);
        vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });

        const { shell, paletteOpen, searchFocus } = createShellHarness(UNRESTRICTED_SHELL_CHROME_VISIBILITY, false);

        expect(shell.ShowSearchBar).toBe(true);
        expect(shell.ShowAppSwitcher).toBe(true);
        expect(shell.ShowNotifications).toBe(true);
        expect(shell.ShowAdminMenuItems).toBe(true);
        expect(shell.ShowCommandPalette).toBe(true);
        expect(shell.IsRestrictedParticipant).toBe(false);
        expect(shell.ChromeFlags.chatOverlay).toBe(true);

        shell.OnGlobalKeydown(makeKeyboardEvent('/'));
        expect(paletteOpen).toHaveBeenCalledTimes(1);

        shell.OnGlobalKeydown(makeKeyboardEvent('k'));
        expect(searchFocus).toHaveBeenCalledTimes(1);
    });

    it('unmounts search, floating chat, app switcher, notifications, admin items, and hotkeys for restricted participants', () => {
        vi.spyOn(InstanceConfigEngine.Instance, 'Get').mockReturnValue(undefined);
        vi.spyOn(InstanceConfigEngine.Instance, 'GetBoolean').mockImplementation((_k, def) => def ?? true);
        vi.stubGlobal('window', { matchMedia: () => ({ matches: false }) });

        const { shell, paletteOpen, omnibarOpen, searchFocus } = createShellHarness(
            RESTRICTED_SHELL_CHROME_VISIBILITY,
            false,
        );

        expect(shell.ShowSearchBar).toBe(false);
        expect(shell.ShowAppSwitcher).toBe(false);
        expect(shell.ShowNotifications).toBe(false);
        expect(shell.ShowAdminMenuItems).toBe(false);
        expect(shell.ShowCommandPalette).toBe(false);
        expect(shell.IsRestrictedParticipant).toBe(true);
        expect(shell.ChromeFlags.chatOverlay).toBe(false);
        expect(shell.ChromeFlags.searchBar).toBe(false);
        expect(shell.ChromeFlags.appSwitcher).toBe(false);
        expect(shell.ChromeFlags.notifications).toBe(false);

        shell.OnGlobalKeydown(makeKeyboardEvent('/'));
        shell.OnGlobalKeydown(makeKeyboardEvent('k'));
        shell.ToggleSearch();
        shell.OpenOmnibar('query');
        expect(paletteOpen).not.toHaveBeenCalled();
        expect(omnibarOpen).not.toHaveBeenCalled();
        expect(searchFocus).not.toHaveBeenCalled();
    });

    it('gates user menu item visibility cleanly via IsUserMenuItemVisible', () => {
        const { shell: unrestrictedShell } = createShellHarness(UNRESTRICTED_SHELL_CHROME_VISIBILITY);
        const { shell: restrictedShell } = createShellHarness(RESTRICTED_SHELL_CHROME_VISIBILITY);

        const profileItem: UserMenuItem = {
            id: 'profile',
            label: 'My Profile',
            icon: 'fa-solid fa-user',
            group: 'primary',
            order: 10,
            developerOnly: false,
            adminOnly: false,
            visible: true,
            enabled: true,
        };
        const adminItem: UserMenuItem = {
            id: 'diagnostic-bundle',
            label: 'Diagnostic Bundle',
            icon: 'fa-solid fa-stethoscope',
            group: 'system',
            order: 15,
            developerOnly: false,
            adminOnly: true,
            visible: true,
            enabled: true,
        };

        expect(unrestrictedShell.IsUserMenuItemVisible(profileItem)).toBe(true);
        expect(unrestrictedShell.IsUserMenuItemVisible(adminItem)).toBe(true);

        expect(restrictedShell.IsUserMenuItemVisible(profileItem)).toBe(true);
        expect(restrictedShell.IsUserMenuItemVisible(adminItem)).toBe(false);
    });
});

describe('BaseUserMenu — Admin Menu Item Scoping', () => {
    it('hides administrative and workspace-management items while keeping My Profile and Sign Out when showAdminMenuItems is false', async () => {
        const menu = new BaseUserMenu();
        const context = {
            showAdminMenuItems: false,
            isDeveloper: false,
            developerModeEnabled: false,
            feedbackEnabled: false,
        } as UserMenuContext;
        await menu.Initialize(context);

        const elements = menu.GetMenuElements();
        const visibleIds = elements
            .filter((el): el is UserMenuItem => !isUserMenuDivider(el))
            .map((item) => item.id);

        expect(visibleIds).toContain('profile');
        expect(visibleIds).toContain('select-theme-system');
        expect(visibleIds).toContain('logout');

        expect(visibleIds).not.toContain('pin-to-home');
        expect(visibleIds).not.toContain('sharing-center');
        expect(visibleIds).not.toContain('reset-layout');
        expect(visibleIds).not.toContain('diagnostic-bundle');
        expect(visibleIds).not.toContain('about');

        const blockedClick = await menu.HandleItemClick('diagnostic-bundle');
        expect(blockedClick.success).toBe(false);
    });

    it('retains all standard items when showAdminMenuItems is true', async () => {
        const menu = new BaseUserMenu();
        const context = {
            showAdminMenuItems: true,
            isDeveloper: false,
            developerModeEnabled: false,
            feedbackEnabled: true,
        } as UserMenuContext;
        await menu.Initialize(context);

        const visibleIds = menu
            .GetMenuElements()
            .filter((el): el is UserMenuItem => !isUserMenuDivider(el))
            .map((item) => item.id);

        expect(visibleIds).toContain('profile');
        expect(visibleIds).toContain('pin-to-home');
        expect(visibleIds).toContain('sharing-center');
        expect(visibleIds).toContain('reset-layout');
        expect(visibleIds).toContain('diagnostic-bundle');
        expect(visibleIds).toContain('about');
        expect(visibleIds).toContain('logout');
    });
});

describe('ShellComponent Template — Angular 21 @if/@for Scoping Hygiene', () => {
    it('uses @if/@for control flow (no *ngIf/*ngFor) and gates all scoped header/menu/overlay surfaces', () => {
        const html = readFileSync(join(__dirname, 'shell.component.html'), 'utf8');
        expect(html).not.toContain('*ngIf');
        expect(html).not.toContain('*ngFor');
        expect(html).toContain('@if (leftOfSwitcherApps.length > 0 && !appSwitchingLocked && ShowAppSwitcher)');
        expect(html).toContain('@if (!appSwitchingLocked && ShowAppSwitcher)');
        expect(html).toContain('@if (leftOfUserMenuApps.length > 0 && !appSwitchingLocked && ShowAppSwitcher)');
        expect(html).toContain('@if (ShowSearchBar)');
        expect(html).toContain('@if (ShowNotifications)');
        expect(html).toContain('@if (ShowCommandPalette)');
        expect(html).toContain('@if (IsUserMenuItemVisible(item))');
    });
});
