import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJButtonDirective, MjButtonShape, MjButtonSize, MjButtonVariant } from './button.directive';

/** One icon button whose variant, size, shape and name the test sets. */
@Component({
  standalone: true,
  imports: [MJButtonDirective],
  template: `
    <button type="button" mjButton [Variant]="Variant" [Size]="Size" [Shape]="Shape" [AriaLabel]="Name">
      <i class="fa-solid fa-microphone-slash" aria-hidden="true"></i>
    </button>
  `,
})
class ButtonHostComponent {
  @Input() Variant: MjButtonVariant = 'danger';
  @Input() Size: MjButtonSize = 'md';
  @Input() Shape: MjButtonShape = 'circle';
  @Input() Name: string | null = 'Unmute microphone';
}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * DOM spec for the `circle` shape: the class reaches the element beside the variant and size classes, and an
 * unnamed circle warns. The look itself lives in the global `button.scss`, which jsdom does not load.
 */
describe('MJButtonDirective (DOM)', () => {
  const render = (inputs: Partial<ButtonHostComponent> = {}) => renderComponentFixture(ButtonHostComponent, { inputs: { ...inputs } });
  const button = (f: ReturnType<typeof render>) => query(f, 'button') as HTMLButtonElement;

  it('draws a named circle in its variant', () => {
    const b = button(render());
    expect(Array.from(b.classList)).toEqual(expect.arrayContaining(['mj-btn', 'mj-btn--circle', 'mj-btn--danger']));
    expect(b.getAttribute('aria-label')).toBe('Unmute microphone');
  });

  it('keeps the size class beside the circle, and drops the circle for the default shape', () => {
    const f = render({ Size: 'sm' });
    expect(button(f).classList.contains('mj-btn--sm')).toBe(true);
    expect(button(f).classList.contains('mj-btn--circle')).toBe(true);

    f.componentRef.setInput('Shape', 'default');
    f.detectChanges();
    expect(button(f).classList.contains('mj-btn--circle')).toBe(false);
    expect(button(f).classList.contains('mj-btn--sm')).toBe(true);
  });

  it('warns in dev mode when a circle has no name', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    render({ Name: null });
    expect(warn).toHaveBeenCalledOnce();
  });
});
