import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJButtonDirective, MjIconPickerComponent } from '@memberjunction/ng-ui-components';
import { AvatarGeneratorService } from './avatar-generator.service';
import {
  AvatarAccentColorOption,
  AvatarChangeEvent,
  AvatarIconOption,
  AvatarPromptBuilder,
  AvatarStudioTab,
  CachedAvatarPngSource,
  DEFAULT_AVATAR_ACCENT_COLORS,
  DEFAULT_AVATAR_ICON_OPTIONS,
  DEFAULT_AVATAR_QUICK_REFINEMENTS,
  DEFAULT_AVATAR_STYLE_PRESETS,
  MAX_AVATAR_HISTORY,
} from './avatar-studio.types';

/**
 * Reusable 3-tab Avatar Studio (`ai` | `icon` | `upload`) for AI agents, community spaces,
 * user profiles, or any entity that pairs an image URL/data-URI with a Font Awesome icon
 * and optional accent color.
 *
 * Features:
 * - **AI Generate + Iterative Refine**: Generates `128×128` WebP avatars via MJ's
 *   `Generate Image` action, supports style presets, host-provided contextual prompt builders,
 *   and image-to-image iterative refinement with quick chips.
 * - **Icons**: Curated icon tiles, optional full Font Awesome search via `<mj-icon-picker>`,
 *   and optional accent color swatches.
 * - **Upload / URL**: Local image upload (auto-cropped & compressed to `128×128` WebP @ `0.85`)
 *   and direct image URL input.
 * - **10-step undo history** and live size/format status badge (`128×128 WebP · X.X KB`).
 */
@Component({
  standalone: true,
  selector: 'mj-avatar-studio',
  imports: [FormsModule, MJButtonDirective, MjIconPickerComponent],
  templateUrl: './avatar-studio.component.html',
  styleUrls: ['./avatar-studio.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MjAvatarStudioComponent extends BaseAngularComponent implements OnInit {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly generator = inject(AvatarGeneratorService);

  private _imageUrl = '';
  private _iconClass = 'fa-solid fa-wand-magic-sparkles';
  private _accentColor: string | null = null;
  private _subjectName = '';
  private _subjectSubtitle = '';
  private _promptBuilder: AvatarPromptBuilder | null = null;
  private _isInitialized = false;

  /** Current avatar image URL or `data:image/...` URI. Empty string indicates icon mode. */
  @Input()
  public set ImageUrl(value: string | null | undefined) {
    const normalized = value ?? '';
    if (normalized !== this._imageUrl) {
      this._imageUrl = normalized;
      this.PreviewError = false;
      if (this.lastGeneratedPngSource && this.lastGeneratedPngSource.DataUri !== normalized.trim()) {
        this.lastGeneratedPngSource = null;
      }
      this.cdr.markForCheck();
    }
  }
  public get ImageUrl(): string {
    return this._imageUrl;
  }

  /** Current Font Awesome icon class (used when `ImageUrl` is empty or fails to load). */
  @Input()
  public set IconClass(value: string | null | undefined) {
    const normalized = value?.trim() || 'fa-solid fa-wand-magic-sparkles';
    if (normalized !== this._iconClass) {
      this._iconClass = normalized;
      this.cdr.markForCheck();
    }
  }
  public get IconClass(): string {
    return this._iconClass;
  }

  /** Optional CSS/hex accent color applied to the avatar frame and emitted with changes. */
  @Input()
  public set AccentColor(value: string | null | undefined) {
    const normalized = value?.trim() || null;
    if (normalized !== this._accentColor) {
      this._accentColor = normalized;
      this.cdr.markForCheck();
    }
  }
  public get AccentColor(): string | null {
    return this._accentColor;
  }

  /** Display name of the subject shown in the hero header and used by the default prompt builder. */
  @Input()
  public set SubjectName(value: string | null | undefined) {
    const normalized = value ?? '';
    if (normalized !== this._subjectName) {
      this._subjectName = normalized;
      if (this._isInitialized && !this.promptEditedByUser) {
        this.AvatarPrompt = this.buildPrompt(this.SelectedStyle || '3D Clay Mascot');
      }
      this.cdr.markForCheck();
    }
  }
  public get SubjectName(): string {
    return this._subjectName;
  }

  /** Secondary descriptor shown beneath `SubjectName` in the hero header. */
  @Input()
  public set SubjectSubtitle(value: string | null | undefined) {
    const normalized = value ?? '';
    if (normalized !== this._subjectSubtitle) {
      this._subjectSubtitle = normalized;
      if (this._isInitialized && !this.promptEditedByUser) {
        this.AvatarPrompt = this.buildPrompt(this.SelectedStyle || '3D Clay Mascot');
      }
      this.cdr.markForCheck();
    }
  }
  public get SubjectSubtitle(): string {
    return this._subjectSubtitle;
  }

  /** Optional host callback returning a domain-tailored generation prompt for a style preset. */
  @Input()
  public set PromptBuilder(value: AvatarPromptBuilder | null) {
    if (value !== this._promptBuilder) {
      this._promptBuilder = value;
      if (this._isInitialized && !this.promptEditedByUser) {
        this.AvatarPrompt = this.buildPrompt(this.SelectedStyle || '3D Clay Mascot');
      }
      this.cdr.markForCheck();
    }
  }
  public get PromptBuilder(): AvatarPromptBuilder | null {
    return this._promptBuilder;
  }

  /** Curated Font Awesome icon tiles rendered in the Icons tab. */
  @Input() public IconOptions: readonly AvatarIconOption[] = DEFAULT_AVATAR_ICON_OPTIONS;
  /** Style preset chips rendered in the AI Generate tab. */
  @Input() public StylePresets: readonly string[] = DEFAULT_AVATAR_STYLE_PRESETS;
  /** One-click refinement chips shown beneath the Refine input. */
  @Input() public QuickRefinements: readonly string[] = DEFAULT_AVATAR_QUICK_REFINEMENTS;
  /** Accent color swatches shown when `ShowAccentColorPicker` is true. */
  @Input() public AccentColorOptions: readonly AvatarAccentColorOption[] =
    DEFAULT_AVATAR_ACCENT_COLORS;

  /** Show `<mj-icon-picker>` full Font Awesome search inside the Icons tab. */
  @Input() public ShowFullIconPicker = true;
  /** Show accent color swatches inside the Icons tab. */
  @Input() public ShowAccentColorPicker = false;
  /** Show a top-left back button in the studio topbar. */
  @Input() public ShowBackButton = false;
  /** Label for the top-left back button when `ShowBackButton` is true. */
  @Input() public BackButtonLabel = 'Back';
  /** Label for the "rebuild prompt" action in the AI tab. */
  @Input() public RebuildPromptLabel = 'Rebuild prompt';
  /** Show inline Undo / Use Icon Instead footer inside the studio body. */
  @Input() public ShowInlineFooter = true;
  /** Initial active tab. */
  @Input() public ActiveTab: AvatarStudioTab = 'ai';

  /** Unified change event emitted whenever image URL, icon class, or accent color changes. */
  @Output() public AvatarChange = new EventEmitter<AvatarChangeEvent>();
  /** Two-way binding support for `[(ImageUrl)]`. */
  @Output() public ImageUrlChange = new EventEmitter<string>();
  /** Two-way binding support for `[(IconClass)]`. */
  @Output() public IconClassChange = new EventEmitter<string>();
  /** Two-way binding support for `[(AccentColor)]`. */
  @Output() public AccentColorChange = new EventEmitter<string | null>();
  /** Emitted when the topbar Back button is clicked. */
  @Output() public BackClicked = new EventEmitter<void>();
  /** Emitted whenever AI image generation starts (`true`) or finishes (`false`). */
  @Output() public GeneratingChange = new EventEmitter<boolean>();

  public AvatarPrompt = '';
  public SelectedStyle = '3D Clay Mascot';
  public RefinePrompt = '';
  public IsGenerating = false;
  public ErrorMessage: string | null = null;
  public PreviewError = false;
  public AvatarHistory: string[] = [];

  private promptEditedByUser = false;
  private lastGeneratedPngSource: CachedAvatarPngSource | null = null;

  public ngOnInit(): void {
    this._isInitialized = true;
    if (!this.SelectedStyle) {
      this.SelectedStyle = this.StylePresets[0] ?? '3D Clay Mascot';
    }
    if (!this.AvatarPrompt.trim()) {
      this.AvatarPrompt = this.buildPrompt(this.SelectedStyle);
      this.promptEditedByUser = false;
    }
    this.cdr.markForCheck();
  }

  public get PreviewAvatarUrl(): string | null {
    if (this.PreviewError) {
      return null;
    }
    const trimmed = this._imageUrl.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  public get HasImageAvatar(): boolean {
    return this.PreviewAvatarUrl !== null;
  }

  public get HistoryCount(): number {
    return this.AvatarHistory.length;
  }

  public get HeroDisplayName(): string {
    return this._subjectName.trim() || 'Avatar';
  }

  public get AvatarStatusLabel(): string {
    const url = this.PreviewAvatarUrl;
    if (!url) {
      return 'Icon mode';
    }
    if (url.startsWith('data:image/')) {
      const kb = (Math.round((url.length / 1024) * 10) / 10).toFixed(1);
      const fmt = url.startsWith('data:image/webp') ? 'WebP' : 'Image';
      return `128×128 ${fmt} · ${kb} KB`;
    }
    return 'Custom URL';
  }

  public SetTab(tab: AvatarStudioTab): void {
    this.ActiveTab = tab;
    this.ErrorMessage = null;
    this.cdr.markForCheck();
  }

  public OnBackClick(): void {
    if (this.IsGenerating) {
      return;
    }
    this.BackClicked.emit();
  }

  public OnPromptUserInput(): void {
    this.promptEditedByUser = this.AvatarPrompt.trim().length > 0;
  }

  public RebuildPrompt(): void {
    const style = this.SelectedStyle || this.StylePresets[0] || '3D Clay Mascot';
    this.SelectedStyle = style;
    this.AvatarPrompt = this.buildPrompt(style);
    this.promptEditedByUser = false;
    this.cdr.markForCheck();
  }

  public SelectStylePreset(style: string): void {
    this.SelectedStyle = this.SelectedStyle === style ? '' : style;
    if (!this.promptEditedByUser || !this.AvatarPrompt.trim()) {
      this.AvatarPrompt = this.buildPrompt(this.SelectedStyle || 'Minimal Geometric');
      this.promptEditedByUser = false;
    }
    this.cdr.markForCheck();
  }

  public SelectIcon(iconClass: string): void {
    const normalized = iconClass.trim();
    if (!normalized) {
      return;
    }
    if (this._imageUrl.trim().length > 0) {
      this.pushHistory(this._imageUrl);
      this._imageUrl = '';
      this.PreviewError = false;
      this.lastGeneratedPngSource = null;
    }
    this._iconClass = normalized;
    this.ErrorMessage = null;
    this.emitChanges();
    this.cdr.markForCheck();
  }

  public OnIconPickerChange(iconClass: string): void {
    if (iconClass && iconClass.trim()) {
      this.SelectIcon(iconClass);
    }
  }

  public SelectAccentColor(color: string | null): void {
    const normalized = color?.trim() || null;
    this._accentColor = normalized;
    this.emitChanges();
    this.cdr.markForCheck();
  }

  public ClearAvatarImage(): void {
    if (this._imageUrl.trim().length === 0) {
      return;
    }
    this.pushHistory(this._imageUrl);
    this._imageUrl = '';
    this.PreviewError = false;
    this.lastGeneratedPngSource = null;
    this.ErrorMessage = null;
    this.emitChanges();
    this.cdr.markForCheck();
  }

  public Undo(): void {
    if (this.AvatarHistory.length === 0) {
      return;
    }
    const previous = this.AvatarHistory[this.AvatarHistory.length - 1];
    this.AvatarHistory = this.AvatarHistory.slice(0, -1);
    this._imageUrl = previous;
    this.PreviewError = false;
    this.lastGeneratedPngSource = null;
    this.ErrorMessage = null;
    this.emitChanges();
    this.cdr.markForCheck();
  }

  public OnUrlInputChanged(nextUrl: string): void {
    this._imageUrl = nextUrl ?? '';
    this.PreviewError = false;
    this.lastGeneratedPngSource = null;
    this.ErrorMessage = null;
    this.emitChanges();
    this.cdr.markForCheck();
  }

  public async GenerateAvatar(): Promise<void> {
    if (this.IsGenerating) {
      return;
    }
    const promptToUse = this.composeGenerationPrompt();
    if (!this.AvatarPrompt.trim()) {
      this.AvatarPrompt = promptToUse;
    }

    this.setGenerating(true);
    this.ErrorMessage = null;
    try {
      const result = await this.generator.GenerateAvatar(promptToUse, this.ProviderToUse);
      if (!result.Success || !result.DataUrl) {
        this.notifyFailure(
          result.ErrorMessage ?? 'Image generation model is unavailable or not configured.',
          'warning'
        );
        return;
      }
      this.applyNewImage(result.DataUrl, result.RawPngBase64 ?? null);
    } finally {
      this.setGenerating(false);
    }
  }

  public async RefineAvatar(): Promise<void> {
    const instruction = this.RefinePrompt.trim();
    if (this.IsGenerating || !this.HasImageAvatar || !instruction) {
      return;
    }

    this.setGenerating(true);
    this.ErrorMessage = null;
    try {
      const result = await this.generator.RefineAvatar(
        instruction,
        this._imageUrl,
        this.ProviderToUse,
        this.lastGeneratedPngSource
      );
      if (!result.Success || !result.DataUrl) {
        this.notifyFailure(
          result.ErrorMessage ?? 'Could not refine avatar image.',
          'warning'
        );
        return;
      }
      this.applyNewImage(result.DataUrl, result.RawPngBase64 ?? null);
      this.RefinePrompt = '';
    } finally {
      this.setGenerating(false);
    }
  }

  public ApplyQuickRefinement(instruction: string): void {
    this.RefinePrompt = instruction;
    this.cdr.markForCheck();
    void this.RefineAvatar();
  }

  public async OnFileSelected(event: Event): Promise<void> {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input?.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.notifyFailure('Please select an image file (PNG, JPG, WebP, or GIF).', 'warning');
      if (input) {
        input.value = '';
      }
      return;
    }

    try {
      const downscaled = await this.generator.ProcessUploadedFile(file);
      this.applyNewImage(downscaled, null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.notifyFailure(`Could not process uploaded image: ${msg}`);
    } finally {
      if (input) {
        input.value = '';
      }
    }
  }

  /** Resets undo history, error state, and refreshes the prompt for a fresh editing session. */
  public ResetSession(): void {
    this.ActiveTab = 'ai';
    this.SelectedStyle = this.StylePresets[0] ?? '3D Clay Mascot';
    this.RefinePrompt = '';
    this.ErrorMessage = null;
    this.PreviewError = false;
    this.AvatarHistory = [];
    this.promptEditedByUser = false;
    this.lastGeneratedPngSource = null;
    this.AvatarPrompt = this.buildPrompt(this.SelectedStyle);
    this.cdr.markForCheck();
  }

  private composeGenerationPrompt(): string {
    const manual = this.AvatarPrompt.trim();
    if (!manual) {
      return this.buildPrompt(this.SelectedStyle || '3D Clay Mascot');
    }
    if (
      this.SelectedStyle &&
      !manual.toLowerCase().includes(this.SelectedStyle.toLowerCase())
    ) {
      return `${manual} Visual style: ${this.SelectedStyle}. Square avatar icon, centered, no text.`;
    }
    return manual;
  }

  private buildPrompt(style: string): string {
    const chosenStyle = style.trim() || '3D Clay Mascot';
    if (this._promptBuilder) {
      return this._promptBuilder(chosenStyle);
    }
    const name = this._subjectName.trim();
    const subtitle = this._subjectSubtitle.trim();
    const segments: string[] = [
      name ? `Avatar portrait for "${name}".` : 'Avatar portrait icon.',
    ];
    if (subtitle) {
      segments.push(`Context: ${subtitle}.`);
    }
    segments.push(
      `Visual style: ${chosenStyle}. Centered square avatar icon, clean contrasting background, crisp at 128x128px, no text, no letters, no watermarks.`
    );
    return segments.join(' ');
  }

  private pushHistory(previousUrl: string): void {
    const next = [...this.AvatarHistory, previousUrl];
    this.AvatarHistory =
      next.length > MAX_AVATAR_HISTORY ? next.slice(next.length - MAX_AVATAR_HISTORY) : next;
  }

  private applyNewImage(dataUrl: string, rawPngBase64: string | null): void {
    this.pushHistory(this._imageUrl);
    this._imageUrl = dataUrl;
    this.PreviewError = false;
    this.ErrorMessage = null;
    this.lastGeneratedPngSource = rawPngBase64
      ? { DataUri: dataUrl, PngBase64: rawPngBase64 }
      : null;
    this.emitChanges();
    this.cdr.markForCheck();
  }

  private emitChanges(): void {
    this.ImageUrlChange.emit(this._imageUrl);
    this.IconClassChange.emit(this._iconClass);
    this.AccentColorChange.emit(this._accentColor);
    this.AvatarChange.emit({
      ImageUrl: this._imageUrl,
      IconClass: this._iconClass,
      AccentColor: this._accentColor,
    });
  }

  private setGenerating(generating: boolean): void {
    this.IsGenerating = generating;
    this.GeneratingChange.emit(generating);
    this.cdr.markForCheck();
  }

  private notifyFailure(message: string, severity: 'warning' | 'error' = 'error'): void {
    this.ErrorMessage = message;
    MJNotificationService.Instance?.CreateSimpleNotification(message, severity, 5000);
    this.cdr.markForCheck();
  }
}
