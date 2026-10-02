// Angular components in this package are partial-compiled — load the JIT compiler first
// (same convention as the other component suites in this node test environment).
import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ShellComponent } from './shell.component';

/**
 * Ctrl/Cmd+/ opens the command palette from anywhere, unless an element under focus
 * already handled the chord (CodeMirror binds Mod-/ to toggle comment and calls
 * `preventDefault()` without stopping propagation).
 */

interface ShellHarness {
  shell: ShellComponent;
  paletteOpen: ReturnType<typeof vi.fn>;
  omnibarOpen: ReturnType<typeof vi.fn>;
}

function createShell(useOmnibar: boolean): ShellHarness {
  const shell = Object.create(ShellComponent.prototype) as ShellComponent;
  const paletteOpen = vi.fn();
  const omnibarOpen = vi.fn();
  const open = shell as unknown as Record<string, unknown>;
  open['commandPaletteService'] = { Open: paletteOpen };
  open['OpenOmnibar'] = omnibarOpen;
  Object.defineProperty(shell, 'UseOmnibar', { get: () => useOmnibar });
  return { shell, paletteOpen, omnibarOpen };
}

/** Holds both Ctrl and Cmd so the chord matches on every platform. */
function slashChord(target: Partial<HTMLElement>, defaultPrevented: boolean): KeyboardEvent {
  return {
    key: '/',
    metaKey: true,
    ctrlKey: true,
    target,
    defaultPrevented,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as KeyboardEvent;
}

const codeEditor: Partial<HTMLElement> = { tagName: 'DIV', isContentEditable: true };
const textInput: Partial<HTMLElement> = { tagName: 'INPUT', isContentEditable: false };

describe('ShellComponent — Ctrl/Cmd+/', () => {
  it('leaves the chord to a code editor that already handled it', () => {
    for (const useOmnibar of [false, true]) {
      const { shell, paletteOpen, omnibarOpen } = createShell(useOmnibar);
      const event = slashChord(codeEditor, true);
      shell.OnGlobalKeydown(event);
      expect(paletteOpen).not.toHaveBeenCalled();
      expect(omnibarOpen).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
    }
  });

  it('opens the command palette from a plain text input', () => {
    const { shell, paletteOpen } = createShell(false);
    shell.OnGlobalKeydown(slashChord(textInput, false));
    expect(paletteOpen).toHaveBeenCalledTimes(1);
  });

  it('opens the omnibar in slash mode when the omnibar is on', () => {
    const { shell, omnibarOpen } = createShell(true);
    shell.OnGlobalKeydown(slashChord(textInput, false));
    expect(omnibarOpen).toHaveBeenCalledWith('/');
  });
});
