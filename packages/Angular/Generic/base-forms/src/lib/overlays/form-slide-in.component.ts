import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MjSlidePanelComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';

import { BaseFormsModule } from '../../module';
import { BaseFormOverlay } from './base-form-overlay';
import { SLIDEIN_FORM_CONFIG } from '../types/entity-form-config';

/**
 * Opens any MemberJunction entity form inside a right-edge slide-in panel.
 *
 * Wraps {@link MjEntityFormHostComponent} in `<mj-slide-panel>` (resizable) with
 * a sticky Save/Cancel footer. Defaults to {@link SLIDEIN_FORM_CONFIG} (no in-form
 * toolbar, related grids hidden, full-width body, in-form links inert).
 *
 * Standalone — import it directly:
 * ```typescript
 * import { MjFormSlideInComponent } from '@memberjunction/ng-base-forms';
 * ```
 *
 * @example Declarative
 * ```html
 * <mj-form-slide-in [EntityName]="'MJ: Credentials'" [Record]="cred"
 *   [(Visible)]="open" (Saved)="refresh()"></mj-form-slide-in>
 * ```
 */
@Component({
  standalone: true,
  selector: 'mj-form-slide-in',
  imports: [CommonModule, BaseFormsModule, MjSlidePanelComponent, MJButtonDirective],
  templateUrl: './form-slide-in.component.html',
  styleUrls: ['./form-slide-in.component.css'],
})
export class MjFormSlideInComponent extends BaseFormOverlay {
  /** Initial panel width in px (resizable by the user). */
  @Input() WidthPx = 720;
  /** Whether the panel is user-resizable. */
  @Input() Resizable = true;

  /** Form config. Defaults to the slide-in preset; consumers can override. */
  @Input() override Config = SLIDEIN_FORM_CONFIG;
}
