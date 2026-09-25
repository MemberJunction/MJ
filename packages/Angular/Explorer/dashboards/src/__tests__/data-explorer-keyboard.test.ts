import '@angular/compiler';
import { describe, it, expect, vi } from 'vitest';
import { DataExplorerDashboardComponent } from '../DataExplorer/data-explorer-dashboard.component';

/**
 * A bare `/` focuses the Data Explorer filter. Ctrl/Cmd+/ belongs to the shell's command
 * palette, so the dashboard leaves it alone.
 */

interface ExplorerHarness {
  explorer: DataExplorerDashboardComponent;
  focusFilter: ReturnType<typeof vi.fn>;
}

function createExplorer(): ExplorerHarness {
  const explorer = Object.create(DataExplorerDashboardComponent.prototype) as DataExplorerDashboardComponent;
  const focusFilter = vi.fn();
  (explorer as unknown as Record<string, unknown>)['focusFilterInput'] = focusFilter;
  return { explorer, focusFilter };
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

describe('DataExplorerDashboardComponent — keyboard shortcuts', () => {
  it('leaves Ctrl/Cmd+/ to the command palette', () => {
    const { explorer, focusFilter } = createExplorer();
    const event = keydown('/', true);
    explorer.handleKeyboardShortcut(event);
    expect(focusFilter).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('focuses the filter on a bare /', () => {
    const { explorer, focusFilter } = createExplorer();
    explorer.handleKeyboardShortcut(keydown('/', false));
    expect(focusFilter).toHaveBeenCalledTimes(1);
  });
});
