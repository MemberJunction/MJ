import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaStagePlacement } from '@memberjunction/ng-realtime-media';
import { MEDIA_PLACEMENTS } from '@memberjunction/ai-realtime-client/media';
import {
  MJButtonDirective,
  MJMenuComponent,
  MJMenuDividerComponent,
  MJMenuItemComponent,
  MJMenuTriggerDirective,
} from '@memberjunction/ng-ui-components';

/** A request to move a channel's surface. */
export interface RealtimeSurfaceMove {
  /** The channel key. */
  Key: string;
  Placement: MediaStagePlacement;
}

/**
 * `mj-realtime-surface-move-menu`: the "Move to…" menu for one channel's surface: the stage, a picture-in-picture
 * box, its tab, or out of sight, plus "Reset layout". The call overlay shows it beside the active channel tab, in the
 * floating call pill while a surface is on the stage, and on each picture-in-picture box's bar. It lists only the
 * placements the channel allows; the surface's current placement is listed but disabled.
 */
@Component({
  selector: 'mj-realtime-surface-move-menu',
  standalone: true,
  imports: [MJButtonDirective, MJMenuTriggerDirective, MJMenuComponent, MJMenuItemComponent, MJMenuDividerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button type="button" mjButton Variant="icon" Size="sm" [AriaLabel]="'Move ' + Title" [mjMenuTriggerFor]="moveMenu">
      <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
    </button>
    <ng-template #moveMenu>
      <mj-menu [AriaLabel]="'Move ' + Title + ' to'">
        @if (Offers('stage')) {
          <mj-menu-item Icon="fa-solid fa-expand" [Disabled]="Placement === 'stage'" (Triggered)="Move('stage')">Stage</mj-menu-item>
        }
        @if (Offers('pip')) {
          <mj-menu-item Icon="fa-regular fa-window-restore" [Disabled]="Placement === 'pip'" (Triggered)="Move('pip')">Picture-in-picture</mj-menu-item>
        }
        @if (Offers('tab')) {
          <mj-menu-item Icon="fa-solid fa-table-columns" [Disabled]="Placement === 'tab'" (Triggered)="Move('tab')">Tab</mj-menu-item>
        }
        @if (Offers('hidden')) {
          <mj-menu-item Icon="fa-solid fa-eye-slash" [Disabled]="Placement === 'hidden'" (Triggered)="Move('hidden')">Hide</mj-menu-item>
        }
        <mj-menu-divider></mj-menu-divider>
        <mj-menu-item Icon="fa-solid fa-rotate-left" (Triggered)="ResetLayoutRequested.emit()">Reset layout</mj-menu-item>
      </mj-menu>
    </ng-template>
  `,
  styles: [':host { display: inline-flex; align-items: center; }'],
})
export class RealtimeSurfaceMoveMenuComponent {
  /** The channel whose surface the menu moves. */
  @Input({ required: true }) Key!: string;

  /** The channel's name, as its tab shows it. */
  @Input() Title = '';

  /** Where the surface is now. */
  @Input() Placement: MediaStagePlacement = 'tab';

  /** Where the channel lets the user move its surface (its `SurfacePlacement.Allowed`). Defaults to anywhere. */
  @Input() Allowed: readonly MediaStagePlacement[] = MEDIA_PLACEMENTS;

  /** The user picked a placement. */
  @Output() MoveRequested = new EventEmitter<RealtimeSurfaceMove>();

  /** The user asked to put every surface back where its channel places it. */
  @Output() ResetLayoutRequested = new EventEmitter<void>();

  /** Whether the menu lists a placement. */
  public Offers(placement: MediaStagePlacement): boolean {
    return this.Allowed.includes(placement);
  }

  public Move(placement: MediaStagePlacement): void {
    this.MoveRequested.emit({ Key: this.Key, Placement: placement });
  }
}
