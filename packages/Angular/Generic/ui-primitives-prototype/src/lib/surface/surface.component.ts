import {
  Component,
  Directive,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { sanitizeAxisSlug } from '../types/events';

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
 * Wave 0 surface primitive. Uses standard MJ PascalCase inputs (`[Level]`, `[Tone]`, `[VisualRole]`);
 * the Angular Elements entry maps kebab-case HTML attributes onto these properties automatically.
 */
@Component({
  selector: 'mj-surface',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  host: {
    '[class]': 'hostClasses()',
    '[attr.data-level]': 'safeLevel()',
    '[attr.data-elevation]': 'Elevation()',
    '[attr.data-interactive]': 'Interactive()',
    '[attr.data-selected]': 'Selected()',
    '[attr.data-padding]': 'Padding()',
    '[attr.data-tone]': 'safeTone()',
    '[attr.data-role]': 'safeRole()',
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
  public readonly Level = input<string>('base');
  public readonly Elevation = input<string>('none');
  public readonly Interactive = input(false, { transform: booleanAttribute });
  public readonly Selected = input(false, { transform: booleanAttribute });
  public readonly Padding = input<string>('md');
  public readonly Tone = input<string>('neutral');
  public readonly VisualRole = input<string>('surface');

  protected readonly safeLevel = computed(() => sanitizeAxisSlug(this.Level(), 'base'));
  protected readonly safeTone = computed(() => sanitizeAxisSlug(this.Tone(), 'neutral'));
  protected readonly safeRole = computed(() => sanitizeAxisSlug(this.VisualRole(), 'surface'));

  protected readonly hostClasses = computed(
    () => `mj-surface mj-surface-${this.safeLevel()}`
  );

  protected readonly toneTextVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-text, var(--mj-text-primary))`
  );
  protected readonly toneBorderVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-border, var(--mj-surface-border, var(--_mj-surface-level-border, var(--mj-border-default))))`
  );
  protected readonly toneBgVar = computed(() =>
    this.safeTone() === 'neutral'
      ? null
      : `var(--mj-tone-${this.safeTone()}-bg, var(--mj-surface-bg, var(--_mj-surface-level-bg, var(--mj-bg-surface))))`
  );

  protected readonly roleBgVar = computed(() =>
    this.safeRole() === 'surface'
      ? null
      : `var(--mj-role-${this.safeRole()}-bg, var(--_mj-tone-bg, var(--mj-surface-bg, var(--_mj-surface-level-bg, var(--mj-bg-surface)))))`
  );
  protected readonly roleBorderVar = computed(() =>
    this.safeRole() === 'surface'
      ? null
      : `var(--mj-role-${this.safeRole()}-border, var(--_mj-tone-border, var(--mj-surface-border, var(--_mj-surface-level-border, var(--mj-border-default)))))`
  );
  protected readonly roleRadiusVar = computed(() =>
    this.safeRole() === 'surface'
      ? null
      : `var(--mj-role-${this.safeRole()}-radius, var(--mj-surface-radius, var(--mj-radius-surface)))`
  );
  protected readonly rolePaddingVar = computed(() =>
    this.safeRole() === 'surface'
      ? null
      : `var(--mj-role-${this.safeRole()}-padding, var(--mj-surface-padding, var(--mj-space-5)))`
  );
}
