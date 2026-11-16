import {
  Component,
  Directive,
  ElementRef,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { MJAfterEvent, MJBeforeEvent, dispatchMJElementEvent } from '../types/events';

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
 * Wave 0 horizontal row primitive for list items, nav items, menu items, and toolbar rows.
 * Maps open `tone` and `visualRole` axes to runtime CSS variables and leaves ARIA roles
 * to the host/container so trailing interactive controls are never nested inside a button.
 */
@Component({
  selector: 'mj-row',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  host: {
    class: 'mj-row',
    '[attr.data-density]': 'density()',
    '[attr.data-interactive]': 'interactive()',
    '[attr.data-selected]': 'selected()',
    '[attr.data-disabled]': 'disabled()',
    '[attr.data-tone]': 'tone()',
    '[attr.data-role]': 'visualRole()',
    '[style.--_mj-tone-text]': 'toneTextVar()',
    '[style.--_mj-tone-border]': 'toneBorderVar()',
    '[style.--_mj-tone-bg]': 'toneBgVar()',
    '[style.--_mj-tone-bg-selected]': 'toneBgSelectedVar()',
    '[style.--_mj-role-bg]': 'roleBgVar()',
    '[style.--_mj-role-border]': 'roleBorderVar()',
    '[style.--_mj-role-radius]': 'roleRadiusVar()',
    '[style.--_mj-role-padding-block]': 'rolePaddingBlockVar()',
    '[style.--_mj-role-padding-inline]': 'rolePaddingInlineVar()',
    '[attr.tabindex]': 'interactive() && !disabled() ? 0 : null',
    '[attr.aria-disabled]': 'disabled() ? true : null',
    '(click)': 'onActivate($event)',
    '(keydown.enter)': 'onActivate($event)',
    '(keydown.space)': 'onActivate($event)',
  },
})
export class MJRowComponent {
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  public readonly density = input<string>('md');
  public readonly interactive = input(false, { transform: booleanAttribute });
  public readonly selected = input(false, { transform: booleanAttribute });
  public readonly disabled = input(false, { transform: booleanAttribute });
  public readonly tone = input<string>('neutral');
  public readonly visualRole = input<string>('row');

  public readonly beforeSelect = output<MJBeforeEvent<'user'>>();
  public readonly afterSelect = output<MJAfterEvent<'user'>>();

  protected readonly toneTextVar = computed(() =>
    this.tone() === 'neutral' ? null : `var(--mj-tone-${this.tone()}-text, var(--mj-row-text, var(--mj-text-primary)))`
  );
  protected readonly toneBorderVar = computed(() =>
    this.tone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.tone()}-border, var(--mj-row-border, transparent))`
  );
  protected readonly toneBgVar = computed(() =>
    this.tone() === 'neutral' ? null : `var(--mj-tone-${this.tone()}-bg, var(--mj-row-bg, transparent))`
  );
  protected readonly toneBgSelectedVar = computed(() =>
    this.tone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.tone()}-bg-selected, var(--mj-row-bg-selected, var(--mj-surface-base-bg-selected)))`
  );

  protected readonly roleBgVar = computed(() =>
    this.visualRole() === 'row'
      ? null
      : `var(--mj-role-${this.visualRole()}-bg, var(--_mj-tone-bg, var(--mj-row-bg, transparent)))`
  );
  protected readonly roleBorderVar = computed(() =>
    this.visualRole() === 'row'
      ? null
      : `var(--mj-role-${this.visualRole()}-border, var(--_mj-tone-border, var(--mj-row-border, transparent)))`
  );
  protected readonly roleRadiusVar = computed(() =>
    this.visualRole() === 'row'
      ? null
      : `var(--mj-role-${this.visualRole()}-radius, var(--mj-row-radius, var(--mj-radius-control)))`
  );
  protected readonly rolePaddingBlockVar = computed(() =>
    this.visualRole() === 'row'
      ? null
      : `var(--mj-role-${this.visualRole()}-padding-block, var(--mj-row-padding-block, var(--mj-space-2)))`
  );
  protected readonly rolePaddingInlineVar = computed(() =>
    this.visualRole() === 'row'
      ? null
      : `var(--mj-role-${this.visualRole()}-padding-inline, var(--mj-row-padding-inline, var(--mj-space-3)))`
  );

  protected onActivate(event?: Event): void {
    if (!this.interactive() || this.disabled()) {
      return;
    }
    // Do not hijack clicks originating from a nested interactive control (e.g. trailing button).
    if (event?.target instanceof Element && event.target !== this.hostEl.nativeElement) {
      const interactiveChild = event.target.closest('button, a[href], input, select, textarea');
      if (interactiveChild && this.hostEl.nativeElement.contains(interactiveChild)) {
        return;
      }
    }
    if (event instanceof KeyboardEvent) {
      event.preventDefault();
    }

    const before: MJBeforeEvent<'user'> = { Cancel: false, Reason: 'user' };
    this.beforeSelect.emit(before);
    dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-before-select', before);
    if (before.Cancel) {
      return;
    }

    const after: MJAfterEvent<'user'> = { Reason: 'user' };
    this.afterSelect.emit(after);
    dispatchMJElementEvent(this.hostEl.nativeElement, 'mj-after-select', after);
  }
}
