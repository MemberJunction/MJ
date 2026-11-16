import {
  Component,
  Directive,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';

@Directive({
  selector: '[mjSurfaceHeader]',
  standalone: true,
  host: { class: 'mj-surface-header' },
})
export class MJSurfaceHeaderDirective {}

@Directive({
  selector: '[mjSurfaceBody]',
  standalone: true,
  host: { class: 'mj-surface-body' },
})
export class MJSurfaceBodyDirective {}

@Directive({
  selector: '[mjSurfaceFooter]',
  standalone: true,
  host: { class: 'mj-surface-footer' },
})
export class MJSurfaceFooterDirective {}

/**
 * Wave 0 surface primitive. Applies `.mj-surface` and `.mj-surface-<level>` to its host
 * so nested content inherits level-scoped text and border role tokens.
 */
@Component({
  selector: 'mj-surface',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  host: {
    '[class]': 'hostClasses()',
    '[attr.data-level]': 'Level()',
    '[attr.data-elevation]': 'Elevation()',
    '[attr.data-interactive]': 'Interactive()',
    '[attr.data-selected]': 'Selected()',
    '[attr.data-padding]': 'Padding()',
    '[attr.data-tone]': 'Tone()',
    '[attr.data-role]': 'VisualRole()',
  },
})
export class MJSurfaceComponent {
  public readonly Level = input<string>('base');
  public readonly Elevation = input<string>('none');
  public readonly Interactive = input(false, { transform: booleanAttribute });
  public readonly Selected = input(false, { transform: booleanAttribute });
  public readonly Padding = input<string>('md');
  public readonly Tone = input<string>('neutral');
  public readonly VisualRole = input<string>('surface');

  protected readonly hostClasses = computed(
    () => `mj-surface mj-surface-${this.Level()}`
  );
}
