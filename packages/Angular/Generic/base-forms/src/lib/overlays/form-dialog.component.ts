import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  MJDialogComponent, MJDialogActionsComponent, MJButtonDirective
} from '@memberjunction/ng-ui-components';

import { BaseFormsModule } from '../../module';
import { BaseFormOverlay } from './base-form-overlay';
import { DIALOG_FORM_CONFIG } from '../types/entity-form-config';

/**
 * Opens any MemberJunction entity form inside a modal dialog.
 *
 * Wraps {@link MjEntityFormHostComponent} in `<mj-dialog>` chrome with a
 * Save/Cancel footer. Defaults to {@link DIALOG_FORM_CONFIG} (no in-form
 * toolbar, related grids hidden, in-form links inert) — override via `Config`.
 *
 * Standalone — import it directly:
 * ```typescript
 * import { MjFormDialogComponent } from '@memberjunction/ng-base-forms';
 * ```
 *
 * @example Declarative
 * ```html
 * <mj-form-dialog [EntityName]="'Users'" [RecordID]="id"
 *   [(Visible)]="show" (Saved)="onSaved($event)"></mj-form-dialog>
 * ```
 */
@Component({
  standalone: true,
  selector: 'mj-form-dialog',
  imports: [CommonModule, BaseFormsModule, MJDialogComponent, MJDialogActionsComponent, MJButtonDirective],
  templateUrl: './form-dialog.component.html',
})
export class MjFormDialogComponent extends BaseFormOverlay {
  /** Dialog width (px or CSS string). */
  @Input() Width: number | string | null = 760;
  /** Dialog height (px or CSS string). Default auto. */
  @Input() Height: number | string | null = null;

  /**
   * Form config. Defaults to the dialog preset; consumers can override.
   * (Declared here so the dialog gets the dialog-appropriate default while the
   * shared base stays presentation-neutral.)
   */
  protected override get PresetConfig() { return DIALOG_FORM_CONFIG; }
}
