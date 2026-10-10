import { ChangeDetectionStrategy, Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, ViewChild, inject } from '@angular/core';
import {
  MJButtonDirective,
  MJMenuComponent,
  MJMenuDividerComponent,
  MJMenuItemComponent,
  MJMenuTriggerDirective,
  type MjButtonSize,
} from '@memberjunction/ng-ui-components';
import type { DisplayCaptureSurface, MediaDevice, MediaDeviceSelection } from '@memberjunction/ai-realtime-client/media';
import { MediaDeviceMenuComponent } from './media-device-menu.component';

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
 * `mj-media-controls`: a call's microphone, camera and Share buttons, and, when the host shows it, the button that lets
 * an agent see the user's camera and shared screen. Presentational: it shows what is on and emits what the user asks
 * for, and the host starts or stops the media.
 *
 * Share is a split button. Its main part asks the browser's picker with no preference, or stops sharing while the
 * user shares. Its arrow opens a menu that asks for an entire screen, a window or a browser tab first and, when the
 * host lists {@link SharePanels}, offers "This panel" with one of them. The arrow hides while the user shares.
 *
 * With {@link ShowDeviceMenu}, the microphone is a split button too: its chevron opens `mj-media-device-menu` above the
 * controls, to pick the microphone and the camera from the host's {@link Devices}. The menu stays open while the user
 * picks, and closes from its close button, the chevron, Escape or a click outside.
 *
 * The buttons are circles of one {@link Size}. With {@link ShowLabels}, each carries a short label beneath it, for a
 * call bar that names its controls.
 */
@Component({
  selector: 'mj-media-controls',
  standalone: true,
  imports: [MJButtonDirective, MJMenuTriggerDirective, MJMenuComponent, MJMenuItemComponent, MJMenuDividerComponent, MediaDeviceMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (ShowMicrophone) {
      <span class="control">
        <span class="microphone">
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
          @if (DeviceChevronShown) {
            <button
              #deviceChevron
              type="button"
              mjButton
              Shape="circle"
              Size="sm"
              class="microphone__devices"
              [Variant]="DeviceMenuOpen ? 'primary' : 'secondary'"
              [AriaLabel]="DeviceMenuLabel"
              [title]="DeviceMenuLabel"
              [attr.aria-expanded]="DeviceMenuOpen"
              [attr.aria-controls]="DeviceMenuOpen ? DeviceMenuID : null"
              (click)="ToggleDeviceMenu()"
            >
              <i class="fa-solid fa-chevron-up" aria-hidden="true"></i>
            </button>
          }
        </span>
        @if (ShowLabels) {
          <span class="control__label" aria-hidden="true">{{ MicrophoneOn ? 'Mute' : 'Unmute' }}</span>
        }
        @if (DeviceMenuOpen && DeviceChevronShown) {
          <div class="devices" [id]="DeviceMenuID" role="group" aria-label="Devices">
            <mj-media-device-menu
              [Devices]="Devices"
              [SelectedMicrophoneID]="SelectedMicrophoneID"
              [SelectedCameraID]="SelectedCameraID"
              (DeviceSelected)="DeviceSelected.emit($event)"
              (Close)="CloseDeviceMenu(true)"
            ></mj-media-device-menu>
          </div>
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
          [Variant]="CameraVariant"
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
              (MenuOpened)="CloseDeviceMenu()"
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

    @if (ShowAgentVision) {
      <span class="control">
        <button
          type="button"
          mjButton
          Shape="circle"
          [Size]="Size"
          [Variant]="AgentVisionOn ? 'primary' : 'secondary'"
          [AriaLabel]="AgentVisionLabel"
          [title]="AgentVisionLabel"
          (click)="AgentVisionToggled.emit(!AgentVisionOn)"
        >
          <i class="fa-solid" [class.fa-eye]="AgentVisionOn" [class.fa-eye-slash]="!AgentVisionOn" aria-hidden="true"></i>
        </button>
        @if (ShowLabels) {
          <span class="control__label" aria-hidden="true">{{ AgentVisionOn ? 'Hide from agent' : 'Show agent' }}</span>
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
export class MediaControlsComponent implements OnChanges {
  /** Numbers each instance's device menu, so its chevron can name the menu it controls. */
  private static nextDeviceMenu = 0;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private devices: readonly MediaDevice[] = [];

  @ViewChild('deviceChevron') private deviceChevron?: ElementRef<HTMLButtonElement>;

  /** The kinds of display surface the Share menu asks for. */
  public readonly ShareSurfaces = SHARE_SURFACES;

  /** The device menu's element id, for the chevron's `aria-controls`. */
  public readonly DeviceMenuID = `mj-media-devices-${++MediaControlsComponent.nextDeviceMenu}`;

  /** Whether the device menu is open. */
  public DeviceMenuOpen = false;

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
  /**
   * The camera is optional in this call, as in a call with an agent, where it starts off and usually stays off. Off is then
   * the normal state: the camera button is neutral while off and filled while on, like a toggle, instead of red while off.
   */
  @Input() public CameraOptional = false;
  /**
   * Show the button that lets an agent see the user's camera and shared screen. Off by default: a host shows it while an
   * agent is there to watch, and does what the user asks (the button only reports it).
   */
  @Input() public ShowAgentVision = false;
  /** Whether the user lets an agent see their camera and shared screen. */
  @Input() public AgentVisionOn = false;
  /**
   * Show the device chevron beside the microphone, which opens the device menu. Off by default. It shows only while
   * {@link Devices} lists something to pick.
   */
  @Input() public ShowDeviceMenu = false;
  /**
   * The microphones and cameras the device menu offers. Speakers are left out: these controls pick what the user sends,
   * and a host that plays sound through a chosen output offers that in its own menu.
   */
  @Input()
  public set Devices(value: readonly MediaDevice[]) {
    this.devices = (value ?? []).filter((d) => d.Kind === 'microphone' || d.Kind === 'camera');
  }
  public get Devices(): readonly MediaDevice[] {
    return this.devices;
  }
  /** The microphone the device menu shows as picked. */
  @Input() public SelectedMicrophoneID: string | null = null;
  /** The camera the device menu shows as picked. */
  @Input() public SelectedCameraID: string | null = null;

  /** The user asked to turn the microphone on (`true`) or off (`false`). */
  @Output() public MicrophoneToggled = new EventEmitter<boolean>();
  /** The user asked to turn the camera on (`true`) or off (`false`). */
  @Output() public CameraToggled = new EventEmitter<boolean>();
  /** The user asked to share something. */
  @Output() public ShareRequested = new EventEmitter<MediaShareRequest>();
  /** The user asked to stop sharing. */
  @Output() public StopShareRequested = new EventEmitter<void>();
  /** The user turned the agent's view of their camera and shared screen on (`true`) or off (`false`). */
  @Output() public AgentVisionToggled = new EventEmitter<boolean>();
  /** The user picked a microphone or a camera in the device menu. The host switches to it. */
  @Output() public DeviceSelected = new EventEmitter<MediaDeviceSelection>();

  /** Whether the device chevron shows: the host asked for it, and there is a device to pick. */
  public get DeviceChevronShown(): boolean {
    return this.ShowDeviceMenu && this.devices.length > 0;
  }

  /** The device chevron's name: what its menu lets the user pick. */
  public get DeviceMenuLabel(): string {
    const microphones = this.devices.some((d) => d.Kind === 'microphone');
    const cameras = this.devices.some((d) => d.Kind === 'camera');
    if (microphones && cameras) {
      return 'Choose microphone and camera';
    }
    return cameras ? 'Choose camera' : 'Choose microphone';
  }

  /** A menu left with nothing to pick, or one the host stops offering, closes, so it does not come back by itself. */
  public ngOnChanges(): void {
    if (!this.DeviceChevronShown) {
      this.DeviceMenuOpen = false;
    }
  }

  /** The device chevron: opens the device menu, or closes it. */
  public ToggleDeviceMenu(): void {
    this.DeviceMenuOpen = !this.DeviceMenuOpen && this.DeviceChevronShown;
  }

  /**
   * Closes the device menu.
   *
   * @param refocus Put focus back on the chevron, as after the menu's close button or Escape, so it is not lost with the
   *   menu.
   */
  public CloseDeviceMenu(refocus = false): void {
    if (!this.DeviceMenuOpen) {
      return;
    }
    this.DeviceMenuOpen = false;
    if (refocus) {
      this.deviceChevron?.nativeElement.focus();
    }
  }

  /** Escape inside the controls closes an open device menu, and goes no further. */
  @HostListener('keydown.escape', ['$event'])
  public OnEscape(event: Event): void {
    if (this.DeviceMenuOpen) {
      event.stopPropagation();
      this.CloseDeviceMenu(true);
    }
  }

  /** A click outside the controls closes an open device menu. */
  @HostListener('document:click', ['$event'])
  public OnDocumentClick(event: MouseEvent): void {
    if (this.DeviceMenuOpen && !this.host.nativeElement.contains(event.target as Node | null)) {
      this.CloseDeviceMenu();
    }
  }

  /** The microphone button's name. */
  public get MicrophoneLabel(): string {
    return this.MicrophoneOn ? 'Mute microphone' : 'Unmute microphone';
  }

  /** How the camera button looks: red while off, unless the camera is optional; filled while an optional camera is on. */
  public get CameraVariant(): 'primary' | 'secondary' | 'danger' {
    if (this.CameraOptional) {
      return this.CameraOn ? 'primary' : 'secondary';
    }
    return this.CameraOn ? 'secondary' : 'danger';
  }

  /** The camera button's name. */
  public get CameraLabel(): string {
    return this.CameraOn ? 'Turn off camera' : 'Turn on camera';
  }

  /** The agent-vision button's name. */
  public get AgentVisionLabel(): string {
    return this.AgentVisionOn ? 'Stop letting the agent see your camera and screen' : 'Let the agent see your camera and screen';
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
