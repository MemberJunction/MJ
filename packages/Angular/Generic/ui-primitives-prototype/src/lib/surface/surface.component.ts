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
 * and maps open `tone` and `visualRole` axes to runtime CSS custom properties.
 */
@Component({
  selector: 'mj-surface',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  host: {
    '[class]': 'hostClasses()',
    '[attr.data-level]': 'level()',
    '[attr.data-elevation]': 'elevation()',
    '[attr.data-interactive]': 'interactive()',
    '[attr.data-selected]': 'selected()',
    '[attr.data-padding]': 'padding()',
    '[attr.data-tone]': 'tone()',
    '[attr.data-role]': 'visualRole()',
    '[style.--_mj-tone-text]': 'toneTextVar()',
    '[style.--_mj-tone-border]': 'toneBorderVar()',
    '[style.--_mj-tone-bg]': 'toneBgVar()',
    '[style.--_mj-role-bg]': 'roleBgVar()',
    '[style.--_mj-role-border]': 'roleBorderVar()',
    '[style.--_mj-role-radius]': 'roleRadiusVar()',
    '[style.--_mj-role-padding]': 'rolePaddingVar()',
  },
})
export class MJSurfaceComponent {
  public readonly level = input<string>('base');
  public readonly elevation = input<string>('none');
  public readonly interactive = input(false, { transform: booleanAttribute });
  public readonly selected = input(false, { transform: booleanAttribute });
  public readonly padding = input<string>('md');
  public readonly tone = input<string>('neutral');
  public readonly visualRole = input<string>('surface');

  protected readonly hostClasses = computed(
    () => `mj-surface mj-surface-${this.level()}`
  );

  protected readonly toneTextVar = computed(() =>
    this.tone() === 'neutral' ? null : `var(--mj-tone-${this.tone()}-text, var(--mj-text-primary))`
  );
  protected readonly toneBorderVar = computed(() =>
    this.tone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.tone()}-border, var(--mj-surface-border, var(--mj-border-default)))`
  );
  protected readonly toneBgVar = computed(() =>
    this.tone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.tone()}-bg, var(--mj-surface-bg, var(--mj-bg-surface)))`
  );

  protected readonly roleBgVar = computed(() =>
    this.visualRole() === 'surface'
      ? null
      : `var(--mj-role-${this.visualRole()}-bg, var(--_mj-tone-bg, var(--mj-surface-bg, var(--mj-bg-surface))))`
  );
  protected readonly roleBorderVar = computed(() =>
    this.visualRole() === 'surface'
      ? null
      : `var(--mj-role-${this.visualRole()}-border, var(--_mj-tone-border, var(--mj-surface-border, var(--mj-border-default))))`
  );
  protected readonly roleRadiusVar = computed(() =>
    this.visualRole() === 'surface'
      ? null
      : `var(--mj-role-${this.visualRole()}-radius, var(--mj-surface-radius, var(--mj-radius-surface)))`
  );
  protected readonly rolePaddingVar = computed(() =>
    this.visualRole() === 'surface'
      ? null
      : `var(--mj-role-${this.visualRole()}-padding, var(--mj-surface-padding, var(--mj-space-4)))`
  );
}
