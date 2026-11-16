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
 * Wave 0 surface primitive. Public inputs stay PascalCase for Angular/MJ standards
 * while exposing lowercase/kebab-case aliases for HTML templates and Angular Elements.
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
  public readonly Level = input<string>('base', { alias: 'level' });
  public readonly Elevation = input<string>('none', { alias: 'elevation' });
  public readonly Interactive = input(false, { alias: 'interactive', transform: booleanAttribute });
  public readonly Selected = input(false, { alias: 'selected', transform: booleanAttribute });
  public readonly Padding = input<string>('md', { alias: 'padding' });
  public readonly Tone = input<string>('neutral', { alias: 'tone' });
  public readonly VisualRole = input<string>('surface', { alias: 'visual-role' });

  protected readonly hostClasses = computed(
    () => `mj-surface mj-surface-${this.Level()}`
  );

  protected readonly toneTextVar = computed(() =>
    this.Tone() === 'neutral' ? null : `var(--mj-tone-${this.Tone()}-text, var(--mj-text-primary))`
  );
  protected readonly toneBorderVar = computed(() =>
    this.Tone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.Tone()}-border, var(--mj-surface-border, var(--mj-border-default)))`
  );
  protected readonly toneBgVar = computed(() =>
    this.Tone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.Tone()}-bg, var(--mj-surface-bg, var(--mj-bg-surface)))`
  );

  protected readonly roleBgVar = computed(() =>
    this.VisualRole() === 'surface'
      ? null
      : `var(--mj-role-${this.VisualRole()}-bg, var(--_mj-tone-bg, var(--mj-surface-bg, var(--mj-bg-surface))))`
  );
  protected readonly roleBorderVar = computed(() =>
    this.VisualRole() === 'surface'
      ? null
      : `var(--mj-role-${this.VisualRole()}-border, var(--_mj-tone-border, var(--mj-surface-border, var(--mj-border-default))))`
  );
  protected readonly roleRadiusVar = computed(() =>
    this.VisualRole() === 'surface'
      ? null
      : `var(--mj-role-${this.VisualRole()}-radius, var(--mj-surface-radius, var(--mj-radius-surface)))`
  );
  protected readonly rolePaddingVar = computed(() =>
    this.VisualRole() === 'surface'
      ? null
      : `var(--mj-role-${this.VisualRole()}-padding, var(--mj-surface-padding, var(--mj-space-5)))`
  );
}
