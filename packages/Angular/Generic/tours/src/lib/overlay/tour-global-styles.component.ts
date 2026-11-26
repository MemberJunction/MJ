import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Carries `@memberjunction/ng-tours`'s Light DOM global style layer (`@layer mj-tours-defaults`)
 * into the document. Because unlayered CSS declarations always beat `@layer` rules, an MJ
 * host app's `:root` / `[data-theme="dark"]` tokens win automatically while bare external web
 * pages receive complete `--mj-*` tokens, `.mj-btn*` styles, Font Awesome icons, and `:where()`
 * `mjt-` component defaults.
 */
@Component({
  selector: 'mj-tour-global-styles',
  standalone: true,
  template: '',
  encapsulation: ViewEncapsulation.None,
  styles: ['mj-tour-global-styles { display: none; }'],
  styleUrls: ['../theme/tour-global-styles.generated.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TourGlobalStylesComponent {}
