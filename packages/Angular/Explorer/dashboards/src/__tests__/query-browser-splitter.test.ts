import '@angular/compiler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { QueryBrowserResourceComponent } from '../QueryBrowser/query-browser-resource.component';

/**
 * Keyboard operation of the query-list splitter. The arrow keys move it by 8px (40px with
 * Shift), Home and End jump to the 200px and 600px bounds, and each handled key saves the
 * new width. All other keys pass through.
 */

function createBrowser(panelWidth: number): QueryBrowserResourceComponent {
  const browser = Object.create(QueryBrowserResourceComponent.prototype) as QueryBrowserResourceComponent;
  browser.PanelWidth = panelWidth;
  (browser as unknown as Record<string, unknown>)['cdr'] = { markForCheck: vi.fn() };
  return browser;
}

function keydown(key: string, shiftKey = false): KeyboardEvent {
  return { key, shiftKey, preventDefault: vi.fn() } as unknown as KeyboardEvent;
}

describe('QueryBrowserResourceComponent — splitter keyboard', () => {
  let saveSetting: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    saveSetting = vi.spyOn(UserInfoEngine.Instance, 'SetSettingDebounced').mockImplementation(() => undefined);
  });

  afterEach(() => {
    saveSetting.mockRestore();
  });

  it.each([
    { name: 'ArrowLeft moves 8px left', key: 'ArrowLeft', shift: false, from: 400, want: 392 },
    { name: 'ArrowRight moves 8px right', key: 'ArrowRight', shift: false, from: 400, want: 408 },
    { name: 'Shift+ArrowLeft moves 40px left', key: 'ArrowLeft', shift: true, from: 400, want: 360 },
    { name: 'Shift+ArrowRight moves 40px right', key: 'ArrowRight', shift: true, from: 400, want: 440 },
    { name: 'ArrowLeft stops at the 200px minimum', key: 'ArrowLeft', shift: false, from: 204, want: 200 },
    { name: 'Shift+ArrowRight stops at the 600px maximum', key: 'ArrowRight', shift: true, from: 580, want: 600 },
    { name: 'Home jumps to the minimum', key: 'Home', shift: false, from: 400, want: 200 },
    { name: 'End jumps to the maximum', key: 'End', shift: false, from: 400, want: 600 },
  ])('$name', ({ key, shift, from, want }) => {
    const browser = createBrowser(from);
    const event = keydown(key, shift);
    browser.OnResizeKeydown(event);
    expect(browser.PanelWidth).toBe(want);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('saves the new width to the user setting', () => {
    const browser = createBrowser(600);
    for (let i = 0; i < 5; i++) {
      browser.OnResizeKeydown(keydown('ArrowLeft'));
    }
    expect(browser.PanelWidth).toBe(560);
    expect(saveSetting).toHaveBeenLastCalledWith('QueryBrowser/panelWidth', '560');
  });

  it.each(['Tab', 'Enter', ' ', 'ArrowUp'])('lets %j pass through unchanged', (key) => {
    const browser = createBrowser(400);
    const event = keydown(key);
    browser.OnResizeKeydown(event);
    expect(browser.PanelWidth).toBe(400);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(saveSetting).not.toHaveBeenCalled();
  });
});
