// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MJGlobal, RegisterClass } from '@memberjunction/global';
import { ApplyShellChromePolicy, BaseShellChromePolicy, ShellChromeFlags } from './shell-chrome-policy';
import { ShellComponent } from './shell.component';

/**
 * The shell's chrome policy: Instance Config is the ceiling, a host may narrow it per user.
 * Also pins the user-menu sizing rule, since a menu with no height limit was the reason the
 * bottom items were unreachable in a short window.
 */

const allOn: ShellChromeFlags = {
  searchBar: true, searchPreview: true, notifications: true, appSwitcher: true,
  appSwitcherStyle: 'auto', appNav: true, recordOpenStyle: 'records'
};

class NoSearchPolicy extends BaseShellChromePolicy {
  public override Resolve(flags: ShellChromeFlags): ShellChromeFlags {
    return { ...flags, searchBar: false, searchPreview: false };
  }
}

describe('BaseShellChromePolicy', () => {
  it('the default policy changes nothing', () => {
    expect(ApplyShellChromePolicy(allOn, new BaseShellChromePolicy())).toEqual(allOn);
  });

  it('a host policy can narrow the chrome — the knowledge-base search hidden for one tenant', () => {
    const flags = ApplyShellChromePolicy(allOn, new NoSearchPolicy());
    expect(flags.searchBar).toBe(false);
    expect(flags.searchPreview).toBe(false);
    expect(flags.notifications).toBe(true);
    expect(flags.appNav).toBe(true);
  });

  it('a policy cannot widen past Instance Config — true from the policy never re-enables', () => {
    class WidenPolicy extends BaseShellChromePolicy {
      public override Resolve(flags: ShellChromeFlags): ShellChromeFlags {
        return { ...flags, searchBar: true, notifications: true, appSwitcher: true, appNav: true };
      }
    }
    const ceiling: ShellChromeFlags = { ...allOn, searchBar: false, notifications: false };
    const flags = ApplyShellChromePolicy(ceiling, new WidenPolicy());
    expect(flags.searchBar).toBe(false);
    expect(flags.notifications).toBe(false);
    expect(flags.appSwitcher).toBe(true);
  });

  it('recordOpenStyle is not the policy\'s to change; appSwitcherStyle is', () => {
    class StylePolicy extends BaseShellChromePolicy {
      public override Resolve(flags: ShellChromeFlags): ShellChromeFlags {
        return { ...flags, recordOpenStyle: 'classic', appSwitcherStyle: 'compact' };
      }
    }
    const flags = ApplyShellChromePolicy(allOn, new StylePolicy());
    expect(flags.recordOpenStyle).toBe('records');
    expect(flags.appSwitcherStyle).toBe('compact');
  });

  it('a throwing host policy leaves the Instance Config chrome unchanged instead of taking the shell down', () => {
    class BrokenPolicy extends BaseShellChromePolicy {
      public override Resolve(): ShellChromeFlags {
        throw new Error('plan lookup failed');
      }
    }
    const ceiling: ShellChromeFlags = { ...allOn, notifications: false };
    expect(() => ApplyShellChromePolicy(ceiling, new BrokenPolicy())).not.toThrow();
    expect(ApplyShellChromePolicy(ceiling, new BrokenPolicy())).toEqual(ceiling);
  });

  it('the policy receives a copy — mutating its argument does not leak into the baseline', () => {
    class MutatingPolicy extends BaseShellChromePolicy {
      public override Resolve(flags: ShellChromeFlags): ShellChromeFlags {
        flags.searchBar = false;
        return flags;
      }
    }
    const baseline = { ...allOn };
    ApplyShellChromePolicy(baseline, new MutatingPolicy());
    expect(baseline.searchBar).toBe(true);
  });
});

describe('resolution through the ClassFactory (same pattern as BaseUserMenu)', () => {
  it('with nothing registered the shell gets the identity policy', () => {
    const policy = MJGlobal.Instance.ClassFactory.CreateInstance<BaseShellChromePolicy>(BaseShellChromePolicy);
    expect(policy).toBeInstanceOf(BaseShellChromePolicy);
    expect(ApplyShellChromePolicy(allOn, policy!)).toEqual(allOn);
  });

  it('a registered subclass is what the shell gets', () => {
    @RegisterClass(BaseShellChromePolicy)
    class HostPolicy extends BaseShellChromePolicy {
      public override Resolve(flags: ShellChromeFlags): ShellChromeFlags {
        return { ...flags, appNav: false };
      }
    }
    const policy = MJGlobal.Instance.ClassFactory.CreateInstance<BaseShellChromePolicy>(BaseShellChromePolicy);
    expect(policy).toBeInstanceOf(HostPolicy);
    expect(ApplyShellChromePolicy(allOn, policy!).appNav).toBe(false);
  });
});

describe('ShellComponent — the cached flags follow the policy', () => {
  function createShell(): ShellComponent {
    const shell = Object.create(ShellComponent.prototype) as ShellComponent;
    const open = shell as unknown as Record<string, unknown>;
    open['_chromeFlags'] = { ...allOn };
    open['cdr'] = { markForCheck: vi.fn() };
    return shell;
  }

  it('Changed drops the cache and asks for a repaint', () => {
    const shell = createShell();
    const open = shell as unknown as Record<string, unknown>;
    (shell as unknown as { onChromePolicyChanged(): void }).onChromePolicyChanged();
    expect(open['_chromeFlags']).toBeNull();
    expect((open['cdr'] as { markForCheck: ReturnType<typeof vi.fn> }).markForCheck).toHaveBeenCalled();
  });
});

describe('ShellComponent — a hidden search bar has no keyboard back door', () => {
  function createShell(searchBar: boolean): ShellComponent {
    const shell = Object.create(ShellComponent.prototype) as ShellComponent;
    const open = shell as unknown as Record<string, unknown>;
    open['_chromeFlags'] = { ...allOn, searchBar };
    open['omnibarPalette'] = { Open: vi.fn() };
    return shell;
  }

  it('OpenOmnibar does nothing while search is hidden — Ctrl/Cmd+K and Cmd+/ route here', () => {
    const shell = createShell(false);
    shell.OpenOmnibar('');
    expect(((shell as unknown as Record<string, unknown>)['omnibarPalette'] as { Open: ReturnType<typeof vi.fn> }).Open).not.toHaveBeenCalled();
  });

  it('OpenOmnibar still opens the palette when search is shown', () => {
    const shell = createShell(true);
    shell.OpenOmnibar('q');
    expect(((shell as unknown as Record<string, unknown>)['omnibarPalette'] as { Open: ReturnType<typeof vi.fn> }).Open).toHaveBeenCalledWith('q');
  });

  it('the palette itself is only rendered with the search bar', () => {
    const html = readFileSync(join(__dirname, 'shell.component.html'), 'utf8');
    const at = html.indexOf('<mj-omnibar-palette');
    const guard = html.lastIndexOf('@if (ShowSearchBar)', at);
    expect(guard).toBeGreaterThan(-1);
    expect(html.slice(guard, at)).not.toMatch(/\n\}\n/); // no closing brace between the guard and the palette
  });
});

describe('the user menu fits the viewport', () => {
  const css = readFileSync(join(__dirname, 'shell.component.css'), 'utf8');
  const block = css.slice(css.indexOf('.user-context-menu {'), css.indexOf('}', css.indexOf('.user-context-menu {')));

  it('is capped to what is left below the header and scrolls instead of clipping', () => {
    expect(block).toMatch(/max-height:\s*calc\(100dvh - 60px/);
    expect(block).toMatch(/max-height:\s*calc\(100vh - 60px/);   // fallback for browsers without dvh
    expect(block).toMatch(/overflow-y:\s*auto/);
    expect(block).not.toMatch(/overflow:\s*hidden/);
  });

  it('never runs wider than the viewport', () => {
    expect(block).toMatch(/max-width:\s*min\(360px, calc\(100vw/);
  });
});
