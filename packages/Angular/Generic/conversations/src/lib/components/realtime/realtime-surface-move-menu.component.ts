import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { MediaMoveMenuComponent, type MediaStagePlacement } from '@memberjunction/ng-realtime-media';
import { MEDIA_PLACEMENTS } from '@memberjunction/ai-realtime-client/media';

/**
 * A request to move a channel's surface.
 *
 * @deprecated Use `MediaMoveRequest` from `@memberjunction/ng-realtime-media`, which has the same shape.
 */
export interface RealtimeSurfaceMove {
  /** The channel key. */
  Key: string;
  Placement: MediaStagePlacement;
}

/**
 * `mj-realtime-surface-move-menu`: the call's "Move to…" menu for one channel's surface, now a wrapper around the shared
 * menu with the same inputs and outputs.
 *
 * @deprecated Use `mj-media-move-menu` (`MediaMoveMenuComponent`) from `@memberjunction/ng-realtime-media`, the menu the
 * call overlay and the meeting room share.
 */
@Component({
  selector: 'mj-realtime-surface-move-menu',
  standalone: true,
  imports: [MediaMoveMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <mj-media-move-menu
      [Key]="Key"
      [Title]="Title"
      [Placement]="Placement"
      [Allowed]="Allowed"
      (MoveRequested)="MoveRequested.emit($event)"
      (ResetLayoutRequested)="ResetLayoutRequested.emit()">
    </mj-media-move-menu>
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
