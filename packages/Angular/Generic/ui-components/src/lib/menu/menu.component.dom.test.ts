import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query, overlayQuery, overlayQueryAll, clearOverlayContainers } from '@memberjunction/ng-test-utils';
import { MJMenuComponent, MJMenuDividerComponent, MJMenuItemComponent, MJMenuTriggerDirective } from './menu.component';

/** A trigger and a three-item menu; every triggered item and every open and close is recorded. */
@Component({
  standalone: true,
  imports: [MJMenuTriggerDirective, MJMenuComponent, MJMenuItemComponent, MJMenuDividerComponent],
  template: `
    <button type="button" class="trigger" [mjMenuTriggerFor]="menu" (MenuOpened)="Events.push('opened')" (MenuClosed)="Events.push('closed')">
      Move to
    </button>
    <ng-template #menu>
      <mj-menu [AriaLabel]="MenuName">
        <mj-menu-item Icon="fa-solid fa-expand" (Triggered)="Events.push('stage')">Stage</mj-menu-item>
        <mj-menu-item (Triggered)="Events.push('pip')" [Disabled]="PipDisabled">Picture-in-picture</mj-menu-item>
        <mj-menu-divider></mj-menu-divider>
        <mj-menu-item (Triggered)="Events.push('hide')">Hide</mj-menu-item>
      </mj-menu>
    </ng-template>
  `,
})
class MenuHostComponent {
  @Input() MenuName: string | null = 'Move to';
  @Input() PipDisabled = false;
  public readonly Events: string[] = [];
}

const KEY_CODES = { Enter: 13, Escape: 27, ArrowDown: 40 } as const;

afterEach(() => {
  clearOverlayContainers();
  vi.restoreAllMocks();
});

describe('MJMenuComponent (DOM)', () => {
  const render = (inputs: Partial<MenuHostComponent> = {}) => renderComponentFixture(MenuHostComponent, { inputs: { ...inputs } });
  const trigger = (f: ReturnType<typeof render>) => query(f, '.trigger') as HTMLButtonElement;
  const items = () => overlayQueryAll('mj-menu-item') as HTMLElement[];
  /** A keydown as a browser sends it: the CDK menu reads the legacy `keyCode`. */
  const key = (target: HTMLElement, name: keyof typeof KEY_CODES) => {
    const event = new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true });
    Object.defineProperty(event, 'keyCode', { value: KEY_CODES[name] });
    target.dispatchEvent(event);
  };

  const open = (f: ReturnType<typeof render>) => {
    trigger(f).click();
    f.detectChanges();
  };

  it('opens a named menu from the trigger and marks the trigger expanded', () => {
    const f = render();
    expect(trigger(f).getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger(f).getAttribute('aria-expanded')).toBe('false');
    open(f);
    const menu = overlayQuery('mj-menu') as HTMLElement;
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.getAttribute('aria-label')).toBe('Move to');
    expect(trigger(f).getAttribute('aria-expanded')).toBe('true');
    expect(f.componentInstance.Events).toEqual(['opened']);
  });

  it('gives items the menuitem role and the divider the separator role, with icons hidden from assistive tech', () => {
    const f = render();
    open(f);
    expect(items().map((item) => item.getAttribute('role'))).toEqual(['menuitem', 'menuitem', 'menuitem']);
    expect(overlayQuery('mj-menu-divider')?.getAttribute('role')).toBe('separator');
    expect(overlayQuery('.mj-menu-item-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect(items()[1].querySelector('.mj-menu-item-icon')).toBeNull();
  });

  it("runs an item's action on click and closes the menu", () => {
    const f = render();
    open(f);
    items()[0].click();
    f.detectChanges();
    expect(f.componentInstance.Events).toEqual(['opened', 'stage', 'closed']);
    expect(overlayQuery('mj-menu')).toBeNull();
    expect(trigger(f).getAttribute('aria-expanded')).toBe('false');
  });

  it('runs an item on Enter', () => {
    const f = render();
    open(f);
    key(items()[2], 'Enter');
    f.detectChanges();
    expect(f.componentInstance.Events).toEqual(['opened', 'hide', 'closed']);
  });

  it('keeps a disabled item announced but does nothing when it is clicked', () => {
    const f = render({ PipDisabled: true });
    open(f);
    expect(items()[1].getAttribute('aria-disabled')).toBe('true');
    items()[1].click();
    f.detectChanges();
    expect(f.componentInstance.Events).toEqual(['opened']);
    expect(overlayQuery('mj-menu')).not.toBeNull();
  });

  it('moves between items with the arrow keys, and Escape closes the menu and returns focus to the trigger', () => {
    const f = render();
    trigger(f).focus();
    key(trigger(f), 'ArrowDown');
    f.detectChanges();
    expect(document.activeElement).toBe(items()[0]);
    key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], 'Escape');
    f.detectChanges();
    expect(overlayQuery('mj-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger(f));
  });

  it('warns in dev mode when the menu has no name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const f = render({ MenuName: null });
    open(f);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[mj-menu] has no accessible name'), expect.anything());
  });
});
