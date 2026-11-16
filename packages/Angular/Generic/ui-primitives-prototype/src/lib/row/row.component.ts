import {
  Component,
  Directive,
  ElementRef,
  ViewEncapsulation,
  booleanAttribute,
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
 * Supports optional, order-free leading/content/trailing parts and cancelable selection.
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
    '[attr.role]': 'Interactive() ? "button" : null',
    '[attr.tabindex]': 'Interactive() && !Disabled() ? 0 : null',
    '[attr.aria-pressed]': 'Interactive() ? Selected() : null',
    '[attr.aria-disabled]': 'Disabled() ? true : null',
    '(click)': 'OnActivate()',
    '(keydown.enter)': 'OnActivate($event)',
    '(keydown.space)': 'OnActivate($event)',
  },
})
export class MJRowComponent {
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  public readonly Density = input<string>('md');
  public readonly Interactive = input(false, { transform: booleanAttribute });
  public readonly Selected = input(false, { transform: booleanAttribute });
  public readonly Disabled = input(false, { transform: booleanAttribute });
  public readonly Tone = input<string>('neutral');
  public readonly VisualRole = input<string>('row');

  public readonly BeforeSelect = output<MJBeforeEvent<'user'>>();
  public readonly AfterSelect = output<MJAfterEvent<'user'>>();

  protected OnActivate(event?: Event): void {
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
