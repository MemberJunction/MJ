import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MJWindowComponent, MJWindowActionsComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';

import { BaseFormsModule } from '../../module';
import { BaseFormOverlay } from './base-form-overlay';
import { DIALOG_FORM_CONFIG } from '../types/entity-form-config';

/**
 * Opens any MemberJunction entity form inside a floating, **non-modal** window
 * (draggable + resizable, no backdrop). Good for "keep this open while I work
 * elsewhere" scenarios — comparing records, reference-while-editing, etc.
 *
 * Same host + event surface as {@link MjFormDialogComponent}; only the chrome
 * differs (`mj-window` instead of `mj-dialog`). Defaults to
 * {@link DIALOG_FORM_CONFIG} (no in-form toolbar; the window footer owns
 * Save/Cancel).
 *
 * Standalone — import it directly:
 * ```typescript
 * import { MjFormWindowComponent } from '@memberjunction/ng-base-forms';
 * ```
 */
@Component({
  standalone: true,
  selector: 'mj-form-window',
  imports: [CommonModule, BaseFormsModule, MJWindowComponent, MJWindowActionsComponent, MJButtonDirective],
  templateUrl: './form-window.component.html',
})
export class MjFormWindowComponent extends BaseFormOverlay {
  /** Window width (px or CSS string). */
  @Input() Width: number | string | null = 760;
  /** Window height (px or CSS string). */
  @Input() Height: number | string | null = 560;
  /** Whether the window can be dragged by its titlebar. */
  @Input() Draggable = true;
  /** Whether the window can be resized. */
  @Input() Resizable = true;

  /** Form config. Defaults to the dialog preset (no in-form toolbar). */
  @Input() override Config = DIALOG_FORM_CONFIG;
}
