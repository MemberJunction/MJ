// Load the JIT compiler BEFORE any Angular library evaluates: npm-published Angular
// packages ship partial declarations whose static initializers need the compiler facade.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { ShellComponent } from '@memberjunction/ng-explorer-core';
import { MJExplorerAppComponent } from '../public-api';

/**
 * LXP upstream ask P4: the floating chat overlay must follow the shell's chrome policy, not just the
 * `Shell.ChatOverlay.Enabled` Instance Config key. A host's `BaseShellChromePolicy` already narrows
 * search, notifications and the app switcher per user; a learner portal that owns its own AI surface
 * needs the same hook for the overlay, instead of route-scoped CSS. The shell resolves the policy
 * ONCE (one instance, one `Changed`), so explorer-app reads the overlay bit from the shell's resolved
 * flags through its view query — and falls back to its own Instance Config read while the shell is
 * not rendered yet (the overlay is gated on workspace init anyway, which comes after the shell).
 */
type ShellFlags = Pick<ShellComponent, 'ChromeFlags'>;

function appWith(shell: ShellFlags | undefined, instanceConfigOverlay: boolean): MJExplorerAppComponent {
  // Only the getter under test runs, so the component is built without its ~20 injected services;
  // the `viewChild` query is replaced by a function returning the shell it would resolve to, and the
  // memoized Instance Config read is pre-seeded so no engine is consulted.
  const app: MJExplorerAppComponent = Object.create(MJExplorerAppComponent.prototype);
  return Object.assign(app, {
    shellRef: () => shell,
    _chromeFlags: { chatOverlay: instanceConfigOverlay, updateNotifications: true },
  });
}

const resolved = (chatOverlay: boolean): ShellFlags => ({
  ChromeFlags: {
    searchBar: true, searchPreview: true, notifications: true, appSwitcher: true,
    appSwitcherStyle: 'auto', appNav: true, chatOverlay, recordOpenStyle: 'records',
  },
});

describe('MJExplorerAppComponent.ShowChatOverlay follows the shell chrome policy', () => {
  it('shows the overlay when the shell resolved it on', () => {
    expect(appWith(resolved(true), true).ShowChatOverlay).toBe(true);
  });

  it('hides the overlay when the host policy narrowed it off, even though Instance Config allows it', () => {
    expect(appWith(resolved(false), true).ShowChatOverlay).toBe(false);
  });

  it('before the shell renders, the Instance Config read still decides (fail-open default)', () => {
    expect(appWith(undefined, true).ShowChatOverlay).toBe(true);
    expect(appWith(undefined, false).ShowChatOverlay).toBe(false);
  });

  it('suppresses the floating chat overlay when the active surface publishes SuppressChatOverlay: true', () => {
    const app = appWith(resolved(true), true);
    expect(app.IsChatOverlaySuppressedBySurface).toBe(false);

    app.AppContextSnapshot = {
      App: { Name: 'Workspace', Description: '' },
      ActiveNavItem: { Name: 'Main' },
      OtherNavItems: [],
      User: { Name: 'Admin', Roles: [] },
      AdditionalContext: {
        SuppressChatOverlay: true,
      },
    };
    expect(app.IsChatOverlaySuppressedBySurface).toBe(true);

    app.AppContextSnapshot = {
      App: { Name: 'Workspace', Description: '' },
      ActiveNavItem: { Name: 'Secondary' },
      OtherNavItems: [],
      User: { Name: 'Admin', Roles: [] },
      AdditionalContext: {
        SuppressChatOverlay: false,
      },
    };
    expect(app.IsChatOverlaySuppressedBySurface).toBe(false);
  });
});

