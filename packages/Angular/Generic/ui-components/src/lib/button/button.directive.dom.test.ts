import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { ExpectNoAxeViolations, renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MJButtonDirective, MjButtonShape, MjButtonSize, MjButtonVariant } from './button.directive';

/** One icon button whose variant, size, shape, full-width and name the test sets. */
@Component({
  standalone: true,
  imports: [MJButtonDirective],
  template: `
    <button
      type="button"
      mjButton
      [Variant]="Variant"
      [Size]="Size"
      [Shape]="Shape"
      [FullWidth]="FullWidth"
      [AriaLabel]="Name">
      <i class="fa-solid fa-microphone-slash" aria-hidden="true"></i>
    </button>
  `,
})
class ButtonHostComponent {
  @Input() Variant: MjButtonVariant = 'danger';
  @Input() Size: MjButtonSize = 'md';
  @Input() Shape: MjButtonShape = 'circle';
  @Input() FullWidth = false;
  @Input() Name: string | null = 'Unmute microphone';
}

/** Anchor link styled with mjButton and controlled via [Disabled] and [FullWidth]. */
@Component({
  standalone: true,
  imports: [MJButtonDirective],
  template: `
    <a
      mjButton
      href="#target"
      [Variant]="Variant"
      [Disabled]="Disabled"
      [FullWidth]="FullWidth"
      (click)="OnAnchorClick()">
      Open report
    </a>
  `,
})
class AnchorButtonHostComponent {
  @Input() Variant: MjButtonVariant = 'primary';
  @Input() Disabled = false;
  @Input() FullWidth = false;
  ClickCount = 0;

  OnAnchorClick(): void {
    this.ClickCount++;
  }
}

/** Anchor with an author-supplied tabindex attribute to verify restoration on re-enable. */
@Component({
  standalone: true,
  imports: [MJButtonDirective],
  template: `
    <a mjButton tabindex="0" [Disabled]="Disabled" (click)="OnClick()">Custom tab stop</a>
  `,
})
class CustomTabIndexAnchorHostComponent {
  @Input() Disabled = false;
  ClickCount = 0;

  OnClick(): void {
    this.ClickCount++;
  }
}

/** Button using native lowercase [disabled] binding to verify [Disabled] never clobbers it. */
@Component({
  standalone: true,
  imports: [MJButtonDirective],
  template: `
    <button
      id="native-disabled-btn"
      type="button"
      mjButton
      Variant="primary"
      [Toggleable]="true"
      [(Selected)]="Selected"
      [disabled]="NativeDisabled">
      Save changes
    </button>
    <button
      id="directive-disabled-btn"
      type="button"
      mjButton
      Variant="secondary"
      [Disabled]="DirectiveDisabled">
      Cancel
    </button>
  `,
})
class NativeAndDirectiveDisabledHostComponent {
  @Input() NativeDisabled = true;
  @Input() DirectiveDisabled = false;
  Selected = false;
}

/** Bare HTML boolean attributes (FullWidth, Disabled) without ="true" bindings. */
@Component({
  standalone: true,
  imports: [MJButtonDirective],
  template: `
    <button id="shorthand-full" type="button" mjButton FullWidth>Continue</button>
    <a id="shorthand-disabled" mjButton href="#skip" Disabled>Unavailable</a>
  `,
})
class ShorthandBooleanAttributesHostComponent {}

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * DOM spec for MJButtonDirective: classes, accessible naming guard, [FullWidth],
 * [Disabled] on <a> and <button>, non-clobbering of native [disabled], and axe checks.
 */
describe('MJButtonDirective (DOM)', () => {
  const render = (inputs: Partial<ButtonHostComponent> = {}) =>
    renderComponentFixture(ButtonHostComponent, { inputs: { ...inputs } });
  const button = (f: ReturnType<typeof render>) => query(f, 'button') as HTMLButtonElement;

  it('draws a named circle in its variant and passes axe', async () => {
    const f = render();
    const b = button(f);
    expect(Array.from(b.classList)).toEqual(expect.arrayContaining(['mj-btn', 'mj-btn--circle', 'mj-btn--danger']));
    expect(b.getAttribute('aria-label')).toBe('Unmute microphone');
    await ExpectNoAxeViolations(f);
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

  it('applies mj-btn--full only when FullWidth is true', () => {
    const f = render({ Shape: 'default', FullWidth: false });
    expect(button(f).classList.contains('mj-btn--full')).toBe(false);

    f.componentRef.setInput('FullWidth', true);
    f.detectChanges();
    expect(button(f).classList.contains('mj-btn--full')).toBe(true);
  });

  it('disables a[mjButton] via aria-disabled, removes it from tab order, stops click and Enter, and passes axe', async () => {
    const f = renderComponentFixture(AnchorButtonHostComponent, { inputs: { Disabled: true, FullWidth: true } });
    const a = query(f, 'a') as HTMLAnchorElement;

    expect(a.classList.contains('mj-btn--full')).toBe(true);
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(a.getAttribute('tabindex')).toBe('-1');
    expect(a.hasAttribute('disabled')).toBe(false);

    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const notCancelled = a.dispatchEvent(clickEvent);
    expect(notCancelled).toBe(false);
    expect(clickEvent.defaultPrevented).toBe(true);
    expect(f.componentInstance.ClickCount).toBe(0);

    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    a.dispatchEvent(enterEvent);
    expect(enterEvent.defaultPrevented).toBe(true);

    await ExpectNoAxeViolations(f);

    f.componentRef.setInput('Disabled', false);
    f.detectChanges();
    expect(a.hasAttribute('aria-disabled')).toBe(false);
    expect(a.hasAttribute('tabindex')).toBe(false);

    a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(f.componentInstance.ClickCount).toBe(1);
    await ExpectNoAxeViolations(f);
  });

  it('restores an author-supplied tabindex on a[mjButton] when re-enabled', () => {
    const f = renderComponentFixture(CustomTabIndexAnchorHostComponent, { inputs: { Disabled: false } });
    const a = query(f, 'a') as HTMLAnchorElement;
    expect(a.getAttribute('tabindex')).toBe('0');

    f.componentRef.setInput('Disabled', true);
    f.detectChanges();
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(a.getAttribute('tabindex')).toBe('-1');

    f.componentRef.setInput('Disabled', false);
    f.detectChanges();
    expect(a.hasAttribute('aria-disabled')).toBe(false);
    expect(a.getAttribute('tabindex')).toBe('0');
  });

  it('never clobbers native [disabled] on <button mjButton> and supports [Disabled] on <button>', async () => {
    const f = renderComponentFixture(NativeAndDirectiveDisabledHostComponent, {
      inputs: { NativeDisabled: true, DirectiveDisabled: true },
    });
    const nativeBtn = f.nativeElement.querySelector('#native-disabled-btn') as HTMLButtonElement;
    const directiveBtn = f.nativeElement.querySelector('#directive-disabled-btn') as HTMLButtonElement;

    expect(nativeBtn.disabled).toBe(true);
    expect(directiveBtn.disabled).toBe(true);

    nativeBtn.click();
    f.detectChanges();
    expect(f.componentInstance.Selected).toBe(false);

    await ExpectNoAxeViolations(f);

    f.componentRef.setInput('NativeDisabled', false);
    f.componentRef.setInput('DirectiveDisabled', false);
    f.detectChanges();
    expect(nativeBtn.disabled).toBe(false);
    expect(directiveBtn.disabled).toBe(false);

    nativeBtn.click();
    f.detectChanges();
    expect(f.componentInstance.Selected).toBe(true);
  });

  it('supports bare boolean attributes FullWidth and Disabled via booleanAttribute transform', () => {
    const f = renderComponentFixture(ShorthandBooleanAttributesHostComponent);
    const fullBtn = f.nativeElement.querySelector('#shorthand-full') as HTMLButtonElement;
    const disabledLink = f.nativeElement.querySelector('#shorthand-disabled') as HTMLAnchorElement;

    expect(fullBtn.classList.contains('mj-btn--full')).toBe(true);
    expect(disabledLink.getAttribute('aria-disabled')).toBe('true');
    expect(disabledLink.getAttribute('tabindex')).toBe('-1');
  });
});
