import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MjSlidePanelComponent, MJButtonDirective } from '@memberjunction/ng-ui-components';
import { UserInfoEngine } from '@memberjunction/core-entities';

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
export class MjFormSlideInComponent extends BaseFormOverlay implements OnInit {
  /** Initial panel width in px (resizable by the user; persisted per-entity). */
  @Input() WidthPx = 720;
  /** Whether the panel is user-resizable. */
  @Input() Resizable = true;

  /** Form config. Defaults to the slide-in preset; consumers can override. */
  @Input() override Config = SLIDEIN_FORM_CONFIG;

  /** Entity used to scope the persisted width (resolved on init). */
  private widthEntity: string | null = null;

  ngOnInit(): void {
    // Resolve the entity up-front so we can restore the user's saved width
    // before the panel animates in (avoids a mid-render resize).
    this.widthEntity = this.EntityName ?? this.Record?.EntityInfo?.Name ?? null;
    if (this.widthEntity) {
      const saved = UserInfoEngine.Instance.GetSetting(this.widthKey(this.widthEntity));
      const px = saved ? parseInt(saved, 10) : 0;
      if (px > 0) this.WidthPx = px;
    }
  }

  /** Persist the user's resize, scoped per-entity (cross-device via User Settings). */
  onWidthChanged(width: number): void {
    this.WidthPx = width;
    if (this.widthEntity) {
      UserInfoEngine.Instance.SetSettingDebounced(this.widthKey(this.widthEntity), String(width));
    }
  }

  private widthKey(entity: string): string {
    return `mj.formSlideIn.width.${entity.toLowerCase()}`;
  }
}
