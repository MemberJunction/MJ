import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import {
  MJButtonDirective,
  MJMenuComponent,
  MJMenuDividerComponent,
  MJMenuItemComponent,
  MJMenuTriggerDirective,
} from '@memberjunction/ng-ui-components';
import { MEDIA_PLACEMENTS, type MediaPlacement } from '@memberjunction/ai-realtime-client/media';

/** A request to move a surface. */
export interface MediaMoveRequest {
  /** The surface's key. */
  Key: string;
  /** Where to move it. */
  Placement: MediaPlacement;
}

/** What `mj-media-move-menu` calls each placement unless the host names it: the realtime call's words. */
export const MEDIA_MOVE_LABELS: Readonly<Record<MediaPlacement, string>> = {
  stage: 'Stage',
  pip: 'Picture-in-picture',
  tab: 'Tab',
  hidden: 'Hide',
};

/** Each placement's icon in the menu, whatever the host calls it. */
const MEDIA_MOVE_ICONS: Readonly<Record<MediaPlacement, string>> = {
  stage: 'fa-solid fa-expand',
  pip: 'fa-regular fa-window-restore',
  tab: 'fa-solid fa-table-columns',
  hidden: 'fa-solid fa-eye-slash',
};

/**
 * `mj-media-move-menu`: the "Move to…" menu for one surface. It lists the places the surface may go, in the order
 * stage, picture-in-picture, tab, hidden, with the current one listed but disabled, then "Reset layout". The realtime
 * call shows it for its channels' surfaces and the meeting room for its participants' tiles; each host names its
 * places ({@link Labels}), as the room calls the stage the spotlight. Over a picture, such as in a tile's corner, its
 * button takes the dark round scrim of the tile's pin ({@link OverVideo}).
 */
@Component({
  selector: 'mj-media-move-menu',
  standalone: true,
  imports: [MJButtonDirective, MJMenuTriggerDirective, MJMenuComponent, MJMenuItemComponent, MJMenuDividerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.media-move--over-video]': 'OverVideo' },
  template: `
    <button type="button" mjButton Variant="icon" Size="sm" [AriaLabel]="'Move ' + Title" [mjMenuTriggerFor]="moveMenu">
      <i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>
    </button>
    <ng-template #moveMenu>
      <mj-menu [AriaLabel]="'Move ' + Title + ' to'">
        @for (placement of Offered; track placement) {
          <mj-menu-item [Icon]="IconFor(placement)" [Disabled]="placement === Placement" (Triggered)="Move(placement)">{{ LabelFor(placement) }}</mj-menu-item>
        }
        <mj-menu-divider></mj-menu-divider>
        <mj-menu-item Icon="fa-solid fa-rotate-left" (Triggered)="ResetLayoutRequested.emit()">Reset layout</mj-menu-item>
      </mj-menu>
    </ng-template>
  `,
  styleUrls: ['./media-move-menu.component.css'],
})
export class MediaMoveMenuComponent {
  /** The surface the menu moves. */
  @Input({ required: true }) public Key!: string;

  /** The surface's name, for the button's and the menu's labels. */
  @Input() public Title = '';

  /** Where the surface is now: listed, but disabled. */
  @Input() public Placement: MediaPlacement = 'tab';

  /** Where the surface may go. Defaults to anywhere. */
  @Input() public Allowed: readonly MediaPlacement[] = MEDIA_PLACEMENTS;

  /**
   * The host's names for its places, such as `{ stage: 'Spotlight' }`. A placement it leaves out keeps its name from
   * {@link MEDIA_MOVE_LABELS}.
   */
  @Input() public Labels: Partial<Readonly<Record<MediaPlacement, string>>> = {};

  /** Whether the button sits over a picture: it then takes the dark round scrim of a tile's pin, so it shows on any frame. */
  @Input() public OverVideo = false;

  /** The user picked a place. */
  @Output() public MoveRequested = new EventEmitter<MediaMoveRequest>();

  /** The user asked to put everything back where the host places it. */
  @Output() public ResetLayoutRequested = new EventEmitter<void>();

  /** The places the menu lists, in its order. */
  public get Offered(): readonly MediaPlacement[] {
    return MEDIA_PLACEMENTS.filter((placement) => this.Allowed.includes(placement));
  }

  /** A place's name in the menu. */
  public LabelFor(placement: MediaPlacement): string {
    return this.Labels[placement] ?? MEDIA_MOVE_LABELS[placement];
  }

  /** A place's icon in the menu. */
  public IconFor(placement: MediaPlacement): string {
    return MEDIA_MOVE_ICONS[placement];
  }

  /** Asks the host to move the surface. */
  public Move(placement: MediaPlacement): void {
    this.MoveRequested.emit({ Key: this.Key, Placement: placement });
  }
}
