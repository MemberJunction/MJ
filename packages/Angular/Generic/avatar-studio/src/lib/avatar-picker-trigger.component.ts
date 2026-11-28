import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';

/**
 * Clickable avatar preview button with an "Edit" sparkle pill badge that opens an
 * Avatar Studio panel or modal.
 */
@Component({
  standalone: true,
  selector: 'mj-avatar-picker-trigger',
  templateUrl: './avatar-picker-trigger.component.html',
  styleUrls: ['./avatar-picker-trigger.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MjAvatarPickerTriggerComponent {
  private readonly cdr = inject(ChangeDetectorRef);

  private _imageUrl = '';
  public PreviewError = false;

  /** Avatar image URL or data URI. When blank or broken, `IconClass` renders instead. */
  @Input()
  public set ImageUrl(value: string | null | undefined) {
    const normalized = value ?? '';
    if (normalized !== this._imageUrl) {
      this._imageUrl = normalized;
      this.PreviewError = false;
      this.cdr.markForCheck();
    }
  }
  public get ImageUrl(): string {
    return this._imageUrl;
  }

  /** Font Awesome icon class rendered when no image is available. */
  @Input() public IconClass = 'fa-solid fa-wand-magic-sparkles';
  /** Optional accent color overriding the default brand border and icon color. */
  @Input() public AccentColor: string | null = null;
  /** Accessible alt text for the preview image. */
  @Input() public AltText = 'Avatar';
  /** Small pill text shown along the bottom edge of the trigger. */
  @Input() public BadgeLabel = 'Edit';
  /** Icon inside the bottom badge pill. */
  @Input() public BadgeIconClass = 'fa-solid fa-wand-magic-sparkles';
  /** Diameter / square side length in pixels. */
  @Input() public Size = 68;
  /** Avatar frame silhouette. */
  @Input() public Shape: 'circle' | 'rounded' = 'circle';
  /** Visual highlight when the associated studio popover/overlay is open. */
  @Input() public IsOpen = false;
  /** Disables clicking the trigger. */
  @Input() public Disabled = false;
  /** Tooltip text for the trigger button. */
  @Input() public Title = 'Click to pick an icon, upload an image, or generate an AI avatar';

  @Output() public TriggerClick = new EventEmitter<void>();

  public get PreviewUrl(): string | null {
    if (this.PreviewError) {
      return null;
    }
    const trimmed = this._imageUrl.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  public get IconFontSize(): number {
    return Math.max(16, Math.round(this.Size * 0.38));
  }

  public OnClick(): void {
    if (this.Disabled) {
      return;
    }
    this.TriggerClick.emit();
  }
}
