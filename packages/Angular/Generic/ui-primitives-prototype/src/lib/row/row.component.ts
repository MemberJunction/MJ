import {
  Component,
  Directive,
  ElementRef,
  ViewEncapsulation,
  afterNextRender,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { MJAfterEvent, MJBeforeEvent, dispatchMJElementEvent } from '../types/events';

export type MJRowItemRole = 'option' | 'menuitem' | 'menuitemradio' | 'button';

@Directive({
  selector: '[mjRowLeading]',
  standalone: true,
  host: { class: 'mj-row-leading' },
})
export class MJRowLeadingDirective {}

@Directive({
  selector: '[mjRowContent]',
  standalone: true,
  host: { class: 'mj-row-content' },
})
export class MJRowContentDirective {}

@Directive({
  selector: '[mjRowTrailing]',
  standalone: true,
  host: { class: 'mj-row-trailing' },
})
export class MJRowTrailingDirective {}

/**
 * Wave 0 horizontal row primitive.
 * - Non-interactive (`Interactive = false`, default): pure layout container for rows that hold
 *   independent sibling controls (e.g. primary link/button + trailing action button).
 * - Interactive (`Interactive = true`): composite item exposing an explicit ARIA `ItemRole`
 *   (`option`, `menuitem`, `menuitemradio`, or `button`) and matching selection state (WCAG 4.1.2).
 *   Interactive rows must never contain nested focusable controls.
 */
@Component({
  selector: 'mj-row',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  host: {
    class: 'mj-row',
    '[attr.data-density]': 'Density()',
    '[attr.data-interactive]': 'Interactive()',
    '[attr.data-selected]': 'Selected()',
    '[attr.data-disabled]': 'Disabled()',
    '[attr.data-tone]': 'Tone()',
    '[attr.data-role]': 'VisualRole()',
    '[style.--_mj-tone-text]': 'toneTextVar()',
    '[style.--_mj-tone-border]': 'toneBorderVar()',
    '[style.--_mj-tone-bg]': 'toneBgVar()',
    '[style.--_mj-tone-bg-selected]': 'toneBgSelectedVar()',
    '[style.--_mj-role-bg]': 'roleBgVar()',
    '[style.--_mj-role-border]': 'roleBorderVar()',
    '[style.--_mj-role-radius]': 'roleRadiusVar()',
    '[style.--_mj-role-padding-block]': 'rolePaddingBlockVar()',
    '[style.--_mj-role-padding-inline]': 'rolePaddingInlineVar()',
    '[attr.role]': 'ariaRole()',
    '[attr.tabindex]': 'Interactive() && !Disabled() ? 0 : null',
    '[attr.aria-selected]': 'ariaSelected()',
    '[attr.aria-checked]': 'ariaChecked()',
    '[attr.aria-pressed]': 'ariaPressed()',
    '[attr.aria-disabled]': 'Interactive() && Disabled() ? true : null',
    '(click)': 'onActivate($event)',
    '(keydown.enter)': 'onActivate($event)',
    '(keydown.space)': 'onActivate($event)',
  },
})
export class MJRowComponent {
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  public readonly Density = input<string>('md', { alias: 'density' });
  public readonly Interactive = input(false, { alias: 'interactive', transform: booleanAttribute });
  public readonly Selected = input(false, { alias: 'selected', transform: booleanAttribute });
  public readonly Disabled = input(false, { alias: 'disabled', transform: booleanAttribute });
  public readonly Tone = input<string>('neutral', { alias: 'tone' });
  public readonly VisualRole = input<string>('row', { alias: 'visual-role' });
  public readonly ItemRole = input<MJRowItemRole>('option', { alias: 'item-role' });

  public readonly BeforeSelect = output<MJBeforeEvent<'user'>>();
  public readonly AfterSelect = output<MJAfterEvent<'user'>>();

  protected readonly ariaRole = computed(() =>
    this.Interactive() ? this.ItemRole() : null
  );

  protected readonly ariaSelected = computed(() =>
    this.Interactive() && this.ItemRole() === 'option' ? String(this.Selected()) : null
  );

  protected readonly ariaChecked = computed(() =>
    this.Interactive() && this.ItemRole() === 'menuitemradio' ? String(this.Selected()) : null
  );

  protected readonly ariaPressed = computed(() =>
    this.Interactive() && this.ItemRole() === 'button' ? String(this.Selected()) : null
  );

  protected readonly toneTextVar = computed(() =>
    this.Tone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.Tone()}-text, var(--mj-row-text, var(--mj-text-primary)))`
  );
  protected readonly toneBorderVar = computed(() =>
    this.Tone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.Tone()}-border, var(--mj-row-border, transparent))`
  );
  protected readonly toneBgVar = computed(() =>
    this.Tone() === 'neutral' ? null : `var(--mj-tone-${this.Tone()}-bg, var(--mj-row-bg, transparent))`
  );
  protected readonly toneBgSelectedVar = computed(() =>
    this.Tone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.Tone()}-bg-selected, var(--mj-row-bg-selected, var(--mj-surface-base-bg-selected)))`
  );

  protected readonly roleBgVar = computed(() =>
    this.VisualRole() === 'row'
      ? null
      : `var(--mj-role-${this.VisualRole()}-bg, var(--_mj-tone-bg, var(--mj-row-bg, transparent)))`
  );
  protected readonly roleBorderVar = computed(() =>
    this.VisualRole() === 'row'
      ? null
      : `var(--mj-role-${this.VisualRole()}-border, var(--_mj-tone-border, var(--mj-row-border, transparent)))`
  );
  protected readonly roleRadiusVar = computed(() =>
    this.VisualRole() === 'row'
      ? null
      : `var(--mj-role-${this.VisualRole()}-radius, var(--mj-row-radius, var(--mj-radius-control)))`
  );
  protected readonly rolePaddingBlockVar = computed(() =>
    this.VisualRole() === 'row'
      ? null
      : `var(--mj-role-${this.VisualRole()}-padding-block, var(--mj-row-padding-block, var(--mj-space-2-5)))`
  );
  protected readonly rolePaddingInlineVar = computed(() =>
    this.VisualRole() === 'row'
      ? null
      : `var(--mj-role-${this.VisualRole()}-padding-inline, var(--mj-row-padding-inline, var(--mj-space-3)))`
  );

  constructor() {
    afterNextRender(() => {
      if (!this.Interactive()) {
        return;
      }
      const nestedControl = this.hostEl.nativeElement.querySelector(
        'button, a[href], input, select, textarea'
      );
      if (nestedControl) {
        console.error(
          '[mj-row] WCAG 4.1.2 violation: interactive="true" mj-row must not contain nested interactive controls. Keep mj-row non-interactive and place sibling buttons/links inside mj-row-content and mj-row-trailing.'
        );
      }
    });
  }

  protected onActivate(event?: Event): void {
    if (!this.Interactive() || this.Disabled()) {
      return;
    }
    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }

    const before: MJBeforeEvent<'user'> = { Cancel: false, Reason: 'user' };
    this.BeforeSelect.emit(before);
    dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-before-select', before);
    if (before.Cancel) {
      return;
    }

    const after: MJAfterEvent<'user'> = { Reason: 'user' };
    this.AfterSelect.emit(after);
    dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-select', after);
  }
}
