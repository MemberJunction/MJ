import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { ComponentStudioDashboardComponent } from '../ComponentStudio/component-studio-dashboard.component';

/**
 * Ctrl/Cmd+/ belongs to the shell's command palette. Component Studio's shortcuts panel
 * opens with `?`, the only key its UI shows for it.
 */

function createStudio(): ComponentStudioDashboardComponent {
  const studio = Object.create(ComponentStudioDashboardComponent.prototype) as ComponentStudioDashboardComponent;
  studio.ShowKeyboardShortcuts = false;
  (studio as unknown as Record<string, unknown>)['cdr'] = { detectChanges: vi.fn() };
  return studio;
}

function keydown(key: string, modifier: boolean): KeyboardEvent {
  return {
    key,
    metaKey: modifier,
    ctrlKey: modifier,
    target: { tagName: 'DIV', isContentEditable: false },
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
}

describe('ComponentStudioDashboardComponent — keyboard shortcuts', () => {
  it('leaves Ctrl/Cmd+/ to the command palette', () => {
    const studio = createStudio();
    const event = keydown('/', true);
    studio.OnKeyDown(event);
    expect(studio.ShowKeyboardShortcuts).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('toggles the shortcuts panel with ?', () => {
    const studio = createStudio();
    studio.OnKeyDown(keydown('?', false));
    expect(studio.ShowKeyboardShortcuts).toBe(true);
  });
});
