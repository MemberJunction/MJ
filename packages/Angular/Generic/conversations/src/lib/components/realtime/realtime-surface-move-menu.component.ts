import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import type { MediaStagePlacement } from '@memberjunction/ng-realtime-media';
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
 * `mj-realtime-surface-move-menu`: the "Move to…" menu for one channel's surface: the stage, its tab, or out of
 * sight, plus "Reset layout". The call overlay shows it beside the active channel tab and in the floating call pill
 * while a surface is on the stage. The surface's current placement is listed but disabled.
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
        <mj-menu-item Icon="fa-solid fa-expand" [Disabled]="Placement === 'stage'" (Triggered)="Move('stage')">Stage</mj-menu-item>
        <mj-menu-item Icon="fa-solid fa-table-columns" [Disabled]="Placement === 'tab'" (Triggered)="Move('tab')">Tab</mj-menu-item>
        <mj-menu-item Icon="fa-solid fa-eye-slash" [Disabled]="Placement === 'hidden'" (Triggered)="Move('hidden')">Hide</mj-menu-item>
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

  /** The user picked a placement. */
  @Output() MoveRequested = new EventEmitter<RealtimeSurfaceMove>();

  /** The user asked to put every surface back on its tab. */
  @Output() ResetLayoutRequested = new EventEmitter<void>();

  public Move(placement: MediaStagePlacement): void {
    this.MoveRequested.emit({ Key: this.Key, Placement: placement });
  }
}
