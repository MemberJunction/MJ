import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import {
  MJButtonDirective,
  MJMenuComponent,
  MJMenuDividerComponent,
  MJMenuItemComponent,
  MJMenuTriggerDirective,
  type MjButtonSize,
} from '@memberjunction/ng-ui-components';
import type { DisplayCaptureSurface } from '@memberjunction/ai-realtime-client/media';

/** What the user asked to share from `mj-media-controls`. */
export type MediaShareRequest =
  /**
   * A screen, window or browser tab, through the browser's picker. `PreferredSurface` is the kind the picker offers
   * first; without it the browser chooses.
   */
  | { Kind: 'display'; PreferredSurface?: DisplayCaptureSurface }
  /** One panel of this page, by the key the host gave it in `SharePanels`. */
  | { Kind: 'panel'; PanelKey: string };

/** A panel of the page that the user can share on its own, listed under "This panel" in the Share menu. */
export interface MediaSharePanel {
  /** The host's key for the panel, sent back in the request. */
  Key: string;
  /** The panel's name in the menu, such as "Whiteboard". */
  Label: string;
  /** A Font Awesome class list for its menu item, such as `fa-solid fa-chalkboard`. */
  Icon?: string;
}

/** One kind of display surface the Share menu asks for. */
interface ShareSurfaceOption {
  Surface: DisplayCaptureSurface;
  Label: string;
  Icon: string;
}

const SHARE_SURFACES: readonly ShareSurfaceOption[] = [
  { Surface: 'screen', Label: 'Entire screen', Icon: 'fa-solid fa-display' },
  { Surface: 'window', Label: 'Window', Icon: 'fa-regular fa-window-maximize' },
  { Surface: 'tab', Label: 'Browser tab', Icon: 'fa-solid fa-globe' },
];

/**
 * `mj-media-controls`: a call's microphone, camera and Share buttons. Presentational: it shows what is on and emits
 * what the user asks for, and the host starts or stops the media.
 *
 * Share is a split button. Its main part asks the browser's picker with no preference, or stops sharing while the
 * user shares. Its arrow opens a menu that asks for an entire screen, a window or a browser tab first and, when the
 * host lists {@link SharePanels}, offers "This panel" with one of them. The arrow hides while the user shares.
 *
 * The buttons are circles of one {@link Size}. With {@link ShowLabels}, each carries a short label beneath it, for a
 * call bar that names its controls.
 */
@Component({
  selector: 'mj-media-controls',
  standalone: true,
  imports: [MJButtonDirective, MJMenuTriggerDirective, MJMenuComponent, MJMenuItemComponent, MJMenuDividerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ShowMicrophone) {
      <span class="control">
        <button
          type="button"
          mjButton
          Shape="circle"
          [Size]="Size"
          [Variant]="MicrophoneOn ? 'secondary' : 'danger'"
          [AriaLabel]="MicrophoneLabel"
          [title]="MicrophoneLabel"
          (click)="MicrophoneToggled.emit(!MicrophoneOn)"
        >
          <i class="fa-solid" [class.fa-microphone]="MicrophoneOn" [class.fa-microphone-slash]="!MicrophoneOn" aria-hidden="true"></i>
        </button>
        @if (ShowLabels) {
          <span class="control__label" aria-hidden="true">{{ MicrophoneOn ? 'Mute' : 'Unmute' }}</span>
        }
      </span>
    }
    @if (ShowCamera) {
      <span class="control">
        <button
          type="button"
          mjButton
          Shape="circle"
          [Size]="Size"
          [Variant]="CameraOn ? 'secondary' : 'danger'"
          [AriaLabel]="CameraLabel"
          [title]="CameraLabel"
          (click)="CameraToggled.emit(!CameraOn)"
        >
          <i class="fa-solid" [class.fa-video]="CameraOn" [class.fa-video-slash]="!CameraOn" aria-hidden="true"></i>
        </button>
        @if (ShowLabels) {
          <span class="control__label" aria-hidden="true">{{ CameraOn ? 'Stop video' : 'Video' }}</span>
        }
      </span>
    }
    @if (ShowShare) {
      <span class="control">
        <span class="share">
          <button
            type="button"
            mjButton
            Shape="circle"
            [Size]="Size"
            class="share__main"
            [Variant]="Sharing ? 'primary' : 'secondary'"
            [AriaLabel]="ShareLabel"
            [title]="ShareLabel"
            (click)="OnShareClick()"
          >
            <i class="fa-solid fa-display" aria-hidden="true"></i>
          </button>
          @if (ShowShareMenu && !Sharing) {
            <button
              type="button"
              mjButton
              Shape="circle"
              Size="sm"
              class="share__more"
              AriaLabel="Choose what to share"
              title="Choose what to share"
              [mjMenuTriggerFor]="shareMenu"
            >
              <i class="fa-solid fa-chevron-up" aria-hidden="true"></i>
            </button>
          }
        </span>
        @if (ShowLabels) {
          <span class="control__label" aria-hidden="true">{{ Sharing ? 'Stop sharing' : 'Share' }}</span>
        }
      </span>
    }

    <ng-template #shareMenu>
      <mj-menu AriaLabel="Share">
        @for (option of ShareSurfaces; track option.Surface) {
          <mj-menu-item [Icon]="option.Icon" (Triggered)="RequestDisplay(option.Surface)">{{ option.Label }}</mj-menu-item>
        }
        @if (SharePanels.length > 0) {
          <mj-menu-divider></mj-menu-divider>
          <mj-menu-item Icon="fa-solid fa-crop-simple" [mjMenuTriggerFor]="panelMenu">This panel</mj-menu-item>
        }
      </mj-menu>
    </ng-template>

    <ng-template #panelMenu>
      <mj-menu AriaLabel="This panel">
        @for (panel of SharePanels; track panel.Key) {
          <mj-menu-item [Icon]="panel.Icon ?? null" (Triggered)="RequestPanel(panel.Key)">{{ panel.Label }}</mj-menu-item>
        }
      </mj-menu>
    </ng-template>
  `,
  styleUrls: ['./media-controls.component.css'],
})
export class MediaControlsComponent {
  /** The kinds of display surface the Share menu asks for. */
  public readonly ShareSurfaces = SHARE_SURFACES;

  /** Whether the microphone is on. */
  @Input() public MicrophoneOn = false;
  /** Whether the camera is on. */
  @Input() public CameraOn = false;
  /** Whether the user is sharing. */
  @Input() public Sharing = false;
  /** Show the microphone button. */
  @Input() public ShowMicrophone = true;
  /** Show the camera button. */
  @Input() public ShowCamera = true;
  /** Show the Share button. */
  @Input() public ShowShare = true;
  /** Show the Share button's arrow and its menu. */
  @Input() public ShowShareMenu = true;
  /** Panels of the page the user can share on their own, offered under "This panel". With none it is left out. */
  @Input() public SharePanels: readonly MediaSharePanel[] = [];
  /** The circles' size: 32, 44 or 52 px. The Share arrow stays small. */
  @Input() public Size: MjButtonSize = 'md';
  /** Show a short label under each button ("Mute", "Video", "Share"), for a call bar that names its controls. */
  @Input() public ShowLabels = false;

  /** The user asked to turn the microphone on (`true`) or off (`false`). */
  @Output() public MicrophoneToggled = new EventEmitter<boolean>();
  /** The user asked to turn the camera on (`true`) or off (`false`). */
  @Output() public CameraToggled = new EventEmitter<boolean>();
  /** The user asked to share something. */
  @Output() public ShareRequested = new EventEmitter<MediaShareRequest>();
  /** The user asked to stop sharing. */
  @Output() public StopShareRequested = new EventEmitter<void>();

  /** The microphone button's name. */
  public get MicrophoneLabel(): string {
    return this.MicrophoneOn ? 'Mute microphone' : 'Unmute microphone';
  }

  /** The camera button's name. */
  public get CameraLabel(): string {
    return this.CameraOn ? 'Turn off camera' : 'Turn on camera';
  }

  /** The Share button's name. */
  public get ShareLabel(): string {
    return this.Sharing ? 'Stop sharing' : 'Share screen';
  }

  /** The Share button's main part: asks with no preference, or stops sharing. */
  public OnShareClick(): void {
    if (this.Sharing) {
      this.StopShareRequested.emit();
    } else {
      this.ShareRequested.emit({ Kind: 'display' });
    }
  }

  /** A kind of display surface picked from the Share menu. */
  public RequestDisplay(surface: DisplayCaptureSurface): void {
    this.ShareRequested.emit({ Kind: 'display', PreferredSurface: surface });
  }

  /** A panel picked under "This panel". */
  public RequestPanel(key: string): void {
    this.ShareRequested.emit({ Kind: 'panel', PanelKey: key });
  }
}
