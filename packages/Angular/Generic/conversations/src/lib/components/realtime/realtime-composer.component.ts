import { ChangeDetectorRef, Component, ElementRef, EventEmitter, Input, Output, ViewChild, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CdkMenuTrigger } from '@angular/cdk/menu';
import type { ConnectedPosition } from '@angular/cdk/overlay';
import {
  MJButtonDirective,
  MJMenuComponent,
  MJMenuItemComponent,
  MJMenuTriggerDirective,
} from '@memberjunction/ng-ui-components';
import { MediaControlsComponent, type MediaSharePanel, type MediaShareRequest } from '@memberjunction/ng-realtime-media';
import type { DisplayCaptureSurface, MediaDevice, MediaDeviceSelection } from '@memberjunction/ai-realtime-client/media';
import { RealtimeSessionService } from '../../services/realtime-session.service';

/** The More menu opens above its button (the bar sits at the bottom of the call), falling back below when cramped. */
const MORE_MENU_POSITIONS: ConnectedPosition[] = [
  { originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -8 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
  { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 8 },
];

/**
 * The call overlay's BOTTOM DOCK. Two shapes, keyed off {@link Open}:
 *
 *  - **The call bar** (not typing) — one bar at every width, left to right: the microphone (with its device chevron,
 *    so a dead mic is one click from the fix), the camera when the call offers it, Share only while sharing (so the
 *    user can stop it), the Captions toggle, a More menu, and End call. More is a popup menu holding "Share your
 *    screen" (with the same choices as `mj-media-controls`' Share menu) and "Type a message"; it is absent when it
 *    would be empty. At full width each control carries a short label beneath it; {@link Compact} drops the labels.
 *  - **The fused dock** (typing) — small circles and the in-call text input in one bottom bar. Submit calls
 *    {@link RealtimeSessionService.SendText}, which injects the text as a user turn into the SAME live voice call.
 *
 * The controls are the design system's: the microphone, the camera and Share are `mj-media-controls`, every other
 * control an `mjButton` circle, and More an `mj-menu`.
 *
 * Mute talks to the session service directly (pure local toggle); captions and End are emitted up so the overlay
 * shell owns that state and lifecycle. Details moved to the call header; the composer no longer renders it.
 */
@Component({
  standalone: true,
  selector: 'mj-realtime-composer',
  imports: [
    CommonModule,
    FormsModule,
    MJButtonDirective,
    MJMenuComponent,
    MJMenuItemComponent,
    MJMenuTriggerDirective,
    MediaControlsComponent,
  ],
  templateUrl: './realtime-composer.component.html',
  styleUrl: './realtime-composer.component.css'
})
export class RealtimeComposerComponent {
  /**
   * Whether the typed-input dock is OPEN. A two-way door owned by the user: the More menu's
   * "Type a message" (or the T hotkey) opens it; the dock's hide control closes it — typing
   * never becomes permanent chrome. Default closed (voice-first), reset per session.
   */
  @Input() Open = false;

  /**
   * COMPACT (Calm Orb · overlay) presentation: the call bar keeps the same controls but drops their text labels.
   * The fused dock (minis + text input) is unchanged. Fed from the overlay's resolved `Ui.compact`. Default `false`.
   */
  @Input() Compact = false;

  /**
   * Whether the More menu offers "Type a message". The overlay binds its resolved `allowTyping`. Only the controls that
   * OPEN the typed-input dock are gated: an already-open dock keeps its hide control and Send.
   * Default `true`.
   */
  @Input() AllowTyping = true;

  /**
   * Whether the End-call button renders in every layout. The overlay binds its resolved
   * end-control switch; a host that ends the call elsewhere turns it off. Default `true`.
   */
  @Input() ShowEnd = true;

  /**
   * Whether the Captions toggle renders in every layout. This hides the control only; the
   * caption state itself (`CaptionsOn`) is unaffected. Default `true`.
   */
  @Input() ShowCaptionsControl = true;

  /** Emitted when the user opens ("Type a message" / typing) or closes (hide control) the dock. */
  @Output() OpenChanged = new EventEmitter<boolean>();

  /** Whether captions are currently shown (drives the captions control's active state). */
  @Input() CaptionsOn = true;

  /** @deprecated Details moved to the call header; the composer no longer renders it. */
  @Input() ShowDetails = false;

  /** @deprecated Details moved to the call header; the composer no longer renders it. */
  @Input() DetailsOn = false;

  /** Emitted when the user toggles captions; the overlay flips its caption state. */
  @Output() CaptionsToggled = new EventEmitter<boolean>();

  /** @deprecated Details moved to the call header; the composer no longer renders it, so this never fires. */
  @Output() DetailsToggled = new EventEmitter<void>();

  /** Emitted when the user ends the call from the End control. */
  @Output() EndRequested = new EventEmitter<void>();

  /** Emitted with the new muted state whenever the user toggles the mic from the dock. */
  @Output() MuteChanged = new EventEmitter<boolean>();

  /** Current draft text in the dock's composer input. */
  public Draft = '';

  /** Show the camera button: the call offers the camera (the runtime's `CaptureOffers$`). */
  @Input() ShowCamera = false;

  /** The call offers a screen share: "Share your screen" in the More menu, and the Share button while sharing. */
  @Input() ShowShare = false;

  /** Whether the camera is on (or starting). */
  @Input() CameraOn = false;

  /** Whether the user is sharing (or choosing what to share). */
  @Input() Sharing = false;

  /**
   * The panels of the page the share choices offer under "This panel" (the overlay's on-screen panels). The typed-input
   * dock, whose Share button has no menu, leaves them out.
   */
  @Input() SharePanels: readonly MediaSharePanel[] = [];

  /**
   * The microphones and cameras the device menu offers: the call's microphones, and its cameras while the camera is
   * open. With none there is no device chevron. The typed-input dock leaves the chevron out.
   */
  @Input() Devices: readonly MediaDevice[] = [];

  /** The microphone the device menu shows as picked. */
  @Input() SelectedMicrophoneID: string | null = null;

  /** The camera the device menu shows as picked. */
  @Input() SelectedCameraID: string | null = null;

  /** The user asked to turn the camera on (`true`) or off (`false`). The overlay starts or stops it. */
  @Output() CameraToggled = new EventEmitter<boolean>();

  /** The user asked to share a screen, window or tab, or one of {@link SharePanels}. */
  @Output() ShareRequested = new EventEmitter<MediaShareRequest>();

  /** The user asked to stop sharing. */
  @Output() StopShareRequested = new EventEmitter<void>();

  /** The user picked a microphone or a camera in the device menu. The overlay switches to it. */
  @Output() DeviceSelected = new EventEmitter<MediaDeviceSelection>();

  /**
   * The mic mute state. A two-way reflection: the overlay may push it down (e.g. its
   * `SetMuted()` / focus-pill toggle) so all mute affordances stay in sync, and this
   * component updates it locally + emits {@link MuteChanged} when its own button is used.
   */
  @Input() IsMuted = false;

  @ViewChild('dockInput') private dockInput?: ElementRef<HTMLInputElement | HTMLTextAreaElement>;

  private realtime = inject(RealtimeSessionService);
  private cdr = inject(ChangeDetectorRef);

  /** The captions control's tooltip: what a click does. */
  public get CaptionsTitle(): string {
    return this.CaptionsOn ? 'Voice-first — back to the orb' : 'Show the conversation as text';
  }

  /** True when there's non-whitespace text to send. */
  public get CanSend(): boolean {
    return this.Draft.trim().length > 0;
  }

  /** @deprecated The call bar renders whenever the dock is not {@link Open}; read `!Open` instead. */
  public get StripMode(): boolean {
    return !this.Open;
  }

  /** The kinds of display surface "Share your screen" offers. */
  /** Whether the More menu is open (drives the More button's pressed look). */
  public MoreOpen = false;

  /** "Share your screen" is in the More menu: the call offers a share and the user is not already sharing. */
  public get ShareInMore(): boolean {
    return this.ShowShare && !this.Sharing;
  }

  /** Whether the More menu has anything to hold; without it the More button goes, so it never opens an empty menu. */
  public get HasMoreItems(): boolean {
    return this.AllowTyping || this.ShareInMore;
  }

  /** Points the More button's menu above it once the button renders. */
  @ViewChild('moreTrigger', { read: CdkMenuTrigger })
  private set moreTrigger(trigger: CdkMenuTrigger | undefined) {
    if (trigger) {
      trigger.menuPosition = MORE_MENU_POSITIONS;
    }
  }

  /** "Type a message" in the More menu: opens the typed-input dock. */
  public OpenTyping(): void {
    this.OpenChanged.emit(true);
  }

  /**
   * "Share your screen": with no surface, the browser's own picker opens and offers every kind (screen, window, tab).
   * @param surface The kind the picker should open on, when a caller wants one.
   */
  public RequestDisplay(surface?: DisplayCaptureSurface): void {
    this.ShareRequested.emit(surface ? { Kind: 'display', PreferredSurface: surface } : { Kind: 'display' });
  }

  /** A panel picked under "Share a panel". */
  public RequestPanel(key: string): void {
    this.ShareRequested.emit({ Kind: 'panel', PanelKey: key });
  }

  /** Toggle the local microphone mute and surface the new state to the overlay. */
  public ToggleMute(): void {
    this.IsMuted = this.realtime.ToggleMute();
    this.MuteChanged.emit(this.IsMuted);
  }

  /** Toggle captions visibility and notify the overlay. */
  public ToggleCaptions(): void {
    this.CaptionsOn = !this.CaptionsOn;
    this.CaptionsToggled.emit(this.CaptionsOn);
  }

  /** Focuses the dock's text input (opening the dock lands here). */
  public FocusInput(): void {
    this.dockInput?.nativeElement.focus();
  }

  /**
   * TYPE-TO-COMPOSE: the overlay captured a printable keystroke while nothing was focused, so seed
   * the draft with that character, focus the input, and put the caret at the end — the user just
   * keeps typing and their first key isn't lost. Appends (rather than replaces) so a leftover draft
   * is preserved. The native value is synced inline so the caret math is correct before Angular's
   * next change-detection pass reconciles ngModel.
   *
   * @param text the character(s) to seed (typically the single key that opened the composer).
   */
  public AppendAndFocus(text: string): void {
    this.Draft = (this.Draft ?? '') + text;
    this.cdr.markForCheck();
    const el = this.dockInput?.nativeElement;
    if (el) {
      el.value = this.Draft;
      el.focus();
      el.setSelectionRange(this.Draft.length, this.Draft.length);
      this.AutoResize();
    }
  }

  /** Auto-resizes the textarea up to 140px height as text grows or contracts. */
  public AutoResize(): void {
    const el = this.dockInput?.nativeElement;
    if (el && el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto';
      const newHeight = Math.max(24, Math.min(el.scrollHeight, 140));
      el.style.height = `${newHeight}px`;
    }
  }

  /** Send the typed text into the live session, then clear the input. */
  public Send(): void {
    if (!this.CanSend) {
      return;
    }
    this.realtime.SendText(this.Draft);
    this.Draft = '';
    const el = this.dockInput?.nativeElement;
    if (el && el instanceof HTMLTextAreaElement) {
      el.style.height = 'auto';
    }
  }

  /** Enter sends (Shift+Enter inserts a newline in textarea). */
  public OnKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.Send();
    }
  }
}
