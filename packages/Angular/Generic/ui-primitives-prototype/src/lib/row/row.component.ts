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
  signal,
} from '@angular/core';
import {
  DispatchMJElementEvent,
  MJAfterEvent,
  MJBeforeEvent,
  SanitizeAxisSlug,
} from '../types/events';

export type MJRowItemRole = 'button' | 'option' | 'menuitem' | 'menuitemradio';

function optionalBooleanAttribute(value: unknown): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  return booleanAttribute(value);
}

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
 * - State styling uses `.is-selected` and `.is-hover` compounded with `.mj-row` (never `data-*`).
 */
@Component({
  selector: 'mj-row',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  host: {
    class: 'mj-row',
    '[class.mj-row-interactive]': 'Interactive()',
    '[class.mj-row-disabled]': 'Disabled()',
    '[class.is-selected]': 'isHighlighted()',
    '[style.--_mj-row-explicit-min-height]': 'densityMinHeightVar()',
    '[style.--_mj-row-explicit-padding-block]': 'densityPaddingBlockVar()',
    '[style.--_mj-row-explicit-padding-inline]': 'densityPaddingInlineVar()',
    '[style.--_mj-tone-text]': 'toneTextVar()',
    '[style.--_mj-tone-border]': 'toneBorderVar()',
    '[style.--_mj-tone-bg]': 'toneBgVar()',
    '[style.--_mj-tone-bg-selected]': 'toneBgSelectedVar()',
    '[style.--_mj-visual-role-bg]': 'visualRoleBgVar()',
    '[style.--_mj-visual-role-border]': 'visualRoleBorderVar()',
    '[style.--_mj-visual-role-radius]': 'visualRoleRadiusVar()',
    '[style.--_mj-visual-role-padding-block]': 'visualRolePaddingBlockVar()',
    '[style.--_mj-visual-role-padding-inline]': 'visualRolePaddingInlineVar()',
    '[attr.role]': 'ariaRole()',
    '[attr.tabindex]': 'rovingTabIndex()',
    '[attr.aria-selected]': 'ariaSelected()',
    '[attr.aria-checked]': 'ariaChecked()',
    '[attr.aria-pressed]': 'ariaPressed()',
    '[attr.aria-disabled]': 'Interactive() && Disabled() ? true : null',
    '(click)': 'onActivate($event)',
    '(keydown)': 'onKeyDown($event)',
    '(focusout)': 'onFocusOut()',
  },
})
export class MJRowComponent {
  private readonly hostEl = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly fallbackTabStop = signal(false);

  public readonly Density = input<string>('md');
  public readonly Interactive = input(false, { transform: booleanAttribute });
  public readonly Selected = input(false, { transform: booleanAttribute });
  public readonly Pressed = input<boolean | null, unknown>(null, {
    transform: optionalBooleanAttribute,
  });
  public readonly Disabled = input(false, { transform: booleanAttribute });
  public readonly Tone = input<string>('neutral');
  public readonly VisualRole = input<string>('row');
  public readonly ItemRole = input<MJRowItemRole>('button');

  public readonly BeforeSelect = output<MJBeforeEvent<'user'>>();
  public readonly AfterSelect = output<MJAfterEvent<'user'>>();

  protected readonly safeDensity = computed(() => SanitizeAxisSlug(this.Density(), 'md'));
  protected readonly safeTone = computed(() => SanitizeAxisSlug(this.Tone(), 'neutral'));
  protected readonly safeRole = computed(() => SanitizeAxisSlug(this.VisualRole(), 'row'));
  protected readonly isHighlighted = computed(
    () => this.Selected() || this.Pressed() === true
  );

  protected readonly densityMinHeightVar = computed(() => {
    const density = this.safeDensity();
    if (density === 'md') {
      return null;
    }
    return `var(--mj-control-height-${density})`;
  });

  protected readonly densityPaddingBlockVar = computed(() => {
    const density = this.safeDensity();
    if (density === 'sm') {
      return 'var(--mj-space-1-5)';
    }
    if (density === 'lg') {
      return 'var(--mj-space-3)';
    }
    return null;
  });

  protected readonly densityPaddingInlineVar = computed(() => {
    const density = this.safeDensity();
    if (density === 'sm') {
      return 'var(--mj-space-2-5)';
    }
    if (density === 'lg') {
      return 'var(--mj-space-4)';
    }
    return null;
  });

  protected readonly ariaRole = computed(() =>
    this.Interactive() ? this.ItemRole() : null
  );

  protected readonly rovingTabIndex = computed(() => {
    if (!this.Interactive() || this.Disabled()) {
      return null;
    }
    const role = this.ItemRole();
    if (role === 'option' || role === 'menuitemradio' || role === 'menuitem') {
      return this.Selected() || this.fallbackTabStop() ? 0 : -1;
    }
    return 0;
  });

  protected readonly ariaSelected = computed(() =>
    this.Interactive() && this.ItemRole() === 'option' ? String(this.Selected()) : null
  );

  protected readonly ariaChecked = computed(() =>
    this.Interactive() && this.ItemRole() === 'menuitemradio' ? String(this.Selected()) : null
  );

  protected readonly ariaPressed = computed(() => {
    if (!this.Interactive() || this.ItemRole() !== 'button') {
      return null;
    }
    const pressed = this.Pressed();
    return pressed === null ? null : String(pressed);
  });

  protected readonly toneTextVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-text, var(--mj-row-text, var(--mj-text-primary)))`
  );
  protected readonly toneBorderVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-border, var(--mj-row-border, transparent))`
  );
  protected readonly toneBgVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-bg, var(--mj-row-bg, transparent))`
  );
  protected readonly toneBgSelectedVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-bg-selected, var(--mj-row-bg-selected, var(--mj-surface-base-bg-selected)))`
  );

  protected readonly visualRoleBgVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-bg, var(--_mj-tone-bg, var(--mj-row-bg, transparent)))`
  );
  protected readonly visualRoleBorderVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-border, var(--_mj-tone-border, var(--mj-row-border, transparent)))`
  );
  protected readonly visualRoleRadiusVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-radius, var(--mj-row-radius, var(--mj-radius-control)))`
  );
  protected readonly visualRolePaddingBlockVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-padding-block, var(--_mj-row-explicit-padding-block, var(--mj-row-padding-block, var(--mj-space-2-5))))`
  );
  protected readonly visualRolePaddingInlineVar = computed(() =>
    this.safeRole() === 'row'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-padding-inline, var(--_mj-row-explicit-padding-inline, var(--mj-row-padding-inline, var(--mj-space-3))))`
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
      const role = this.ItemRole();
      if (role === 'option') {
        const listbox = el.closest<HTMLElement>('[role="listbox"]');
        if (!listbox) {
          console.error(
            '[mj-row] WCAG 4.1.2 violation: ItemRole="option" requires an ancestor [role="listbox"].'
          );
        } else if (!listbox.querySelector('[role="option"].is-selected, [role="option"][aria-selected="true"]')) {
          const firstOption = listbox.querySelector<HTMLElement>(
            '[role="option"]:not([aria-disabled="true"])'
          );
          if (firstOption === el) {
            this.fallbackTabStop.set(true);
          }
        }
      } else if (role === 'menuitem' || role === 'menuitemradio') {
        const menu = el.closest<HTMLElement>('[role="menu"], [role="menubar"]');
        if (menu && !menu.querySelector('.mj-row.is-selected, [aria-checked="true"]')) {
          const firstItem = menu.querySelector<HTMLElement>(
            '[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"])'
          );
          if (firstItem === el) {
            this.fallbackTabStop.set(true);
          }
        }
      }
    });
  }

  protected onFocusOut(): void {
    if (!this.fallbackTabStop()) {
      return;
    }
    const el = this.hostEl.nativeElement;
    const container = el.closest<HTMLElement>('[role="listbox"], [role="menu"], [role="menubar"]');
    const selectedSibling = container?.querySelector<HTMLElement>(
      '.mj-row.is-selected, [aria-selected="true"], [aria-checked="true"]'
    );
    if (selectedSibling && selectedSibling !== el) {
      this.fallbackTabStop.set(false);
    }
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
    DispatchMJElementEvent(this.hostEl.nativeElement, 'mj-before-select', before);
    if (before.Cancel) {
      return;
    }

    const after: MJAfterEvent<'user'> = { Reason: 'user' };
    this.AfterSelect.emit(after);
    DispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-select', after);
  }
}
