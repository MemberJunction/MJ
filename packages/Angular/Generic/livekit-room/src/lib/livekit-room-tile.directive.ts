import { Directive } from '@angular/core';
import type { LiveKitParticipantView } from '@memberjunction/livekit-room-core';

/** Where the room shows a participant. The place decides a tile's extras: the screen-share pane is plain. */
export type LiveKitTilePlace = 'grid' | 'filmstrip' | 'spotlight' | 'split-share' | 'split-speaker';

/** What the room's participant template receives. */
export interface LiveKitTileContext {
  /** The participant to show. */
  $implicit: LiveKitParticipantView;
  /** Where the room shows them. */
  Place: LiveKitTilePlace;
}

/**
 * Types the room's one participant template, `<ng-template mjLiveKitRoomTile let-p let-place="Place">`, which every
 * layout renders through: the user's own tile is a self-view or a share preview, anyone else's an `mj-media-tile`.
 */
@Directive({
  selector: 'ng-template[mjLiveKitRoomTile]',
  standalone: true,
})
export class LiveKitRoomTileDirective {
  public static ngTemplateContextGuard(_directive: LiveKitRoomTileDirective, context: unknown): context is LiveKitTileContext {
    return true;
  }
}
