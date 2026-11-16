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

export type MJRowItemRole = 'button' | 'option' | 'menuitem' | 'menuitemradio';

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
 * - Non-interactive (`Interactive = false`, default): pure layout container for rows holding sibling controls.
 * - Interactive (`Interactive = true`): defaults `ItemRole` to `'button'` so standalone rows are valid ARIA
 *   without a listbox parent. When `ItemRole === 'option'` inside `[role="listbox"]`, uses roving `tabindex`
 *   (one Tab stop per listbox) and ArrowDown/ArrowUp/Home/End navigation.
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
    '[attr.tabindex]': 'rovingTabIndex()',
    '[attr.aria-selected]': 'ariaSelected()',
    '[attr.aria-checked]': 'ariaChecked()',
    '[attr.aria-pressed]': 'ariaPressed()',
    '[attr.aria-disabled]': 'Interactive() && Disabled() ? true : null',
    '(click)': 'onActivate($event)',
    '(keydown)': 'onKeyDown($event)',
  },
})
export class MJRowComponent {
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);

  public readonly Density = input<string>('md');
  public readonly Interactive = input(false, { transform: booleanAttribute });
  public readonly Selected = input(false, { transform: booleanAttribute });
  public readonly Disabled = input(false, { transform: booleanAttribute });
  public readonly Tone = input<string>('neutral');
  public readonly VisualRole = input<string>('row');
  public readonly ItemRole = input<MJRowItemRole>('button');

  public readonly BeforeSelect = output<MJBeforeEvent<'user'>>();
  public readonly AfterSelect = output<MJAfterEvent<'user'>>();

  protected readonly ariaRole = computed(() =>
    this.Interactive() ? this.ItemRole() : null
  );

  protected readonly rovingTabIndex = computed(() => {
    if (!this.Interactive() || this.Disabled()) {
      return null;
    }
    const role = this.ItemRole();
    if (role === 'option' || role === 'menuitemradio' || role === 'menuitem') {
      return this.Selected() ? 0 : -1;
    }
    return 0;
  });

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
      const el = this.hostEl.nativeElement;
      const nestedControl = el.querySelector('button, a[href], input, select, textarea');
      if (nestedControl) {
        console.error(
          '[mj-row] WCAG 4.1.2 violation: interactive mj-row must not contain nested interactive controls.'
        );
      }
      if (this.ItemRole() === 'option') {
        const listbox = el.closest<HTMLElement>('[role="listbox"]');
        if (!listbox) {
          console.error(
            '[mj-row] WCAG 4.1.2 violation: ItemRole="option" requires an ancestor [role="listbox"].'
          );
        } else if (!listbox.querySelector('[role="option"][tabindex="0"]')) {
          // Ensure at least the first enabled option is a Tab stop when none starts selected.
          const firstOption = listbox.querySelector<HTMLElement>(
            '[role="option"]:not([aria-disabled="true"])'
          );
          if (firstOption === el) {
            el.setAttribute('tabindex', '0');
          }
        }
      }
    });
  }

  protected onKeyDown(event: KeyboardEvent): void {
    if (!this.Interactive() || this.Disabled()) {
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.onActivate(event);
      return;
    }
    if (
      this.ItemRole() === 'option' &&
      ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)
    ) {
      const listbox = this.hostEl.nativeElement.closest<HTMLElement>('[role="listbox"]');
      if (!listbox) {
        return;
      }
      const options = Array.from(
        listbox.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])')
      );
      if (options.length === 0) {
        return;
      }
      event.preventDefault();
      const currentIndex = options.indexOf(this.hostEl.nativeElement);
      let nextIndex = 0;
      if (event.key === 'ArrowDown') {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % options.length;
      } else if (event.key === 'ArrowUp') {
        nextIndex = currentIndex <= 0 ? options.length - 1 : currentIndex - 1;
      } else if (event.key === 'End') {
        nextIndex = options.length - 1;
      }
      const target = options[nextIndex];
      if (target) {
        target.focus();
        target.click();
      }
    }
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
