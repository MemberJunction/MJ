import { describe, it, expect, vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJViewToggleComponent, ViewToggleOption } from './view-toggle.component';

/**
 * DOM-level spec for `<mj-view-toggle>`. Covers the `@for` rendering path (one
 * button per option), the active-class / `aria-pressed` reflection of
 * `ActiveKey`, the icon-vs-label `@if` gating inside each button, and the
 * `(click)` → `KeyChange.emit(key)` wiring — all template-only behavior.
 */
describe('MJViewToggleComponent (DOM)', () => {
  const OPTIONS: ViewToggleOption[] = [
    { key: 'grid', icon: 'fa-solid fa-grip', title: 'Grid View' },
    { key: 'list', icon: 'fa-solid fa-list', title: 'List View' },
    { key: 'tree', label: 'Tree', title: 'Tree View' },
  ];

  function render(activeKey = 'grid'): {
    fixture: ComponentFixture<MJViewToggleComponent>;
    buttons: HTMLButtonElement[];
  } {
    const fixture = TestBed.createComponent(MJViewToggleComponent);
    fixture.componentRef.setInput('Options', OPTIONS);
    fixture.componentRef.setInput('ActiveKey', activeKey);
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button.mj-view-toggle-btn'),
    ) as HTMLButtonElement[];
    return { fixture, buttons };
  }

  it('renders one button per option (@for)', () => {
    const { buttons } = render();
    expect(buttons.length).toBe(3);
    expect(buttons.map((b) => b.getAttribute('title'))).toEqual([
      'Grid View',
      'List View',
      'Tree View',
    ]);
  });

  it('marks only the active option with the active class and aria-pressed', () => {
    const { buttons } = render('list');
    expect(buttons[0].classList.contains('mj-view-toggle-btn--active')).toBe(false);
    expect(buttons[1].classList.contains('mj-view-toggle-btn--active')).toBe(true);
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true');
    expect(buttons[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('renders an icon for icon options and a label span for label options', () => {
    const { buttons } = render();
    // grid is icon-only
    expect(buttons[0].querySelector('i')?.className).toContain('fa-grip');
    expect(buttons[0].querySelector('.mj-view-toggle-label')).toBeNull();
    // tree is label-only
    expect(buttons[2].querySelector('i')).toBeNull();
    expect(buttons[2].querySelector('.mj-view-toggle-label')?.textContent?.trim()).toBe('Tree');
  });

  it('emits KeyChange with the option key when a button is clicked', () => {
    const { fixture, buttons } = render('grid');
    const spy = vi.fn();
    fixture.componentInstance.KeyChange.subscribe(spy);

    buttons[2].click();

    expect(spy).toHaveBeenCalledWith('tree');
  });
});
