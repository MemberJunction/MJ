import {
  Component,
  Directive,
  ViewEncapsulation,
  booleanAttribute,
  computed,
  input,
} from '@angular/core';
import { SanitizeAxisSlug } from '../types/events';

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
 * State styling uses `.is-selected` and `.is-hover` compounded with `.mj-surface` (never `data-*`).
 */
@Component({
  selector: 'mj-surface',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  template: `<ng-content />`,
  host: {
    '[class]': 'hostClasses()',
    '[class.mj-surface-interactive]': 'Interactive() && safeLevel() !== "sunken"',
    '[class.is-selected]': 'Selected() && safeLevel() !== "sunken"',
    '[style.--_mj-surface-elevation-shadow]': 'elevationShadowVar()',
    '[style.--_mj-surface-explicit-padding]': 'explicitPaddingVar()',
    '[style.--_mj-surface-explicit-radius]': 'explicitRadiusVar()',
    '[style.--_mj-tone-text]': 'toneTextVar()',
    '[style.--_mj-tone-border]': 'toneBorderVar()',
    '[style.--_mj-tone-bg]': 'toneBgVar()',
    '[style.--_mj-visual-role-bg]': 'visualRoleBgVar()',
    '[style.--_mj-visual-role-border]': 'visualRoleBorderVar()',
    '[style.--_mj-visual-role-radius]': 'visualRoleRadiusVar()',
    '[style.--_mj-visual-role-padding]': 'visualRolePaddingVar()',
  },
})
export class MJSurfaceComponent {
  public readonly Level = input<string>('base');
  public readonly Elevation = input<string>('none');
  public readonly Interactive = input(false, { transform: booleanAttribute });
  public readonly Selected = input(false, { transform: booleanAttribute });
  public readonly Padding = input<string>('md');
  public readonly Radius = input<string>('surface');
  public readonly Tone = input<string>('neutral');
  public readonly VisualRole = input<string>('surface');

  protected readonly safeLevel = computed(() => SanitizeAxisSlug(this.Level(), 'base'));
  protected readonly safeTone = computed(() => SanitizeAxisSlug(this.Tone(), 'neutral'));
  protected readonly safeRole = computed(() => SanitizeAxisSlug(this.VisualRole(), 'surface'));

  protected readonly hostClasses = computed(
    () => `mj-surface mj-surface-${this.safeLevel()}`
  );

  protected readonly elevationShadowVar = computed(() => {
    const elevation = SanitizeAxisSlug(this.Elevation(), 'none');
    if (elevation === 'none') {
      return null;
    }
    return `var(--mj-shadow-${elevation})`;
  });

  protected readonly explicitPaddingVar = computed(() => {
    const padding = SanitizeAxisSlug(this.Padding(), 'md');
    if (padding === 'md') {
      return null;
    }
    if (padding === 'none') {
      return 'var(--mj-space-0)';
    }
    if (padding === 'sm') {
      return 'var(--mj-space-3)';
    }
    if (padding === 'lg') {
      return 'var(--mj-space-6)';
    }
    return `var(--mj-space-${padding})`;
  });

  protected readonly explicitRadiusVar = computed(() => {
    const radius = SanitizeAxisSlug(this.Radius(), 'surface');
    if (radius === 'surface') {
      return null;
    }
    return `var(--mj-radius-${radius})`;
  });

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

  protected readonly visualRoleBgVar = computed(() =>
    this.safeRole() === 'surface'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-bg, var(--_mj-tone-bg, var(--mj-surface-bg, var(--_mj-surface-level-bg, var(--mj-bg-surface)))))`
  );
  protected readonly visualRoleBorderVar = computed(() =>
    this.safeRole() === 'surface'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-border, var(--_mj-tone-border, var(--mj-surface-border, var(--_mj-surface-level-border, var(--mj-border-default)))))`
  );
  protected readonly visualRoleRadiusVar = computed(() =>
    this.safeRole() === 'surface'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-radius, var(--_mj-surface-explicit-radius, var(--mj-surface-radius, var(--mj-radius-surface))))`
  );
  protected readonly visualRolePaddingVar = computed(() =>
    this.safeRole() === 'surface'
      ? null
      : `var(--mj-visual-role-${this.safeRole()}-padding, var(--_mj-surface-explicit-padding, var(--mj-surface-padding, var(--mj-space-5))))`
  );
}
