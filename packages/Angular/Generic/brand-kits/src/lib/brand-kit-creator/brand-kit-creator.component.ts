import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnInit,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RunView } from '@memberjunction/core';
import {
  DEFAULT_BRAND_GENERATION_POLICY,
  MJBrandKitEntity,
  MJBrandKitEntity_IBrandColor,
  MJBrandKitEntity_IBrandGenerationPolicy,
  MJBrandKitEntity_IBrandStyle,
  MJBrandKitEntity_IBrandTypeface,
} from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FileStorageModule, FileUploadEvent } from '@memberjunction/ng-file-storage';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import {
  CreateBrandKitAssetFromUpload,
  MintBrandKitFilePreviewUrl,
} from '../brand-kit-asset-upload';
import { SYNTHETIC_PEOPLE_POLICY_WARNING } from '../brand-kit-generation-policy-editor/brand-kit-generation-policy-editor.component';
import {
  SampleLogoColorsFromImageUrl,
  SuggestColorsFromRgbaPixels,
} from '../logo-color-suggestions';

export interface BrandKitCompanyOption {
  ID: string;
  Name: string;
}

export const COMMON_BRAND_FONT_FAMILIES: ReadonlyArray<string> = [
  'Inter',
  'Plus Jakarta Sans',
  'Space Grotesk',
  'DM Sans',
  'IBM Plex Sans',
  'Source Sans 3',
  'Merriweather',
];

export const MAX_BRAND_KIT_SWATCHES = 6;

const DEFAULT_CREATOR_PALETTE: ReadonlyArray<MJBrandKitEntity_IBrandColor> = [
  { Name: 'Primary', Value: '#1e3a8a' },
  { Name: 'Secondary', Value: '#0ea5e9' },
  { Name: 'Accent', Value: '#f59e0b' },
  { Name: 'Surface', Value: '#f8fafc' },
];

/**
 * Single-screen Brand Kit creator (`mj-brand-kit-creator`).
 *
 * L2 reusable component in `@memberjunction/ng-brand-kits` with form on the left and a live
 * preview (gallery card + 16:9 title frame) on the right. Reads and writes via `ProviderToUse`,
 * attaches an uploaded logo as the primary `Logo` asset via `CreateBrandKitAssetFromUpload`,
 * samples logo colors via `SuggestColorsFromRgbaPixels`, and emits `Saved` with the new kit ID.
 */
@Component({
  standalone: true,
  selector: 'mj-brand-kit-creator',
  imports: [CommonModule, FormsModule, FileStorageModule, MJButtonDirective],
  templateUrl: './brand-kit-creator.component.html',
  styleUrls: ['./brand-kit-creator.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandKitCreatorComponent extends BaseAngularComponent implements OnInit {
  @Input() Companies: BrandKitCompanyOption[] | null = null;
  @Input() InitialCompanyId: string | null = null;
  @Input() LogoPreviewUrl: string | null = null;

  @Output() Saved = new EventEmitter<string>();
  @Output() Cancelled = new EventEmitter<void>();
  @Output() OpenMoreSettings = new EventEmitter<string>();

  public Name = '';
  public SelectedCompanyId = '';
  public IsDefault = false;

  public Palette: MJBrandKitEntity_IBrandColor[] = DEFAULT_CREATOR_PALETTE.map((c) => ({ ...c }));
  public HeadingFontFamily = 'Inter';
  public BodyFontFamily = 'Inter';

  public ImageryStyle = '';
  public KeepItemsText = '';
  public AvoidItemsText = '';
  public NeverInventItems: string[] = [];
  public NewNeverInventInput = '';

  public AllowGeneratedImages = DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedImages;
  public AllowGeneratedVideo = DEFAULT_BRAND_GENERATION_POLICY.AllowGeneratedVideo;
  public AllowSyntheticPeople = false;

  public AvailableCompanies: BrandKitCompanyOption[] = [];
  public PendingLogoUpload: FileUploadEvent | null = null;
  public PendingLogoFileName: string | null = null;
  public SuggestingColors = false;
  public Saving = false;
  public SaveError: string | null = null;
  public SavedKitId: string | null = null;

  public readonly FontSuggestions = COMMON_BRAND_FONT_FAMILIES;
  public readonly MaxSwatches = MAX_BRAND_KIT_SWATCHES;
  public readonly SyntheticPeopleWarning = SYNTHETIC_PEOPLE_POLICY_WARNING;

  private readonly cdr = inject(ChangeDetectorRef);

  async ngOnInit(): Promise<void> {
    this.AllowSyntheticPeople = false;
    if (this.InitialCompanyId && this.InitialCompanyId !== 'all') {
      this.SelectedCompanyId = this.InitialCompanyId;
    }
    if (Array.isArray(this.Companies) && this.Companies.length > 0) {
      this.AvailableCompanies = [...this.Companies];
      this.cdr.markForCheck();
    } else {
      await this.LoadCompanies();
    }
  }

  public async LoadCompanies(): Promise<void> {
    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const res = await rv.RunView<{ ID: string; Name: string }>(
        {
          EntityName: 'MJ: Companies',
          OrderBy: 'Name ASC',
          Fields: ['ID', 'Name'],
          ResultType: 'simple',
        },
        this.ProviderToUse?.CurrentUser,
      );
      if (res.Success && Array.isArray(res.Results)) {
        this.AvailableCompanies = res.Results.map((r) => ({
          ID: r.ID,
          Name: r.Name,
        }));
      }
    } catch {
      // Non-fatal: "All companies" remains available ifMJ: Companies cannot be queried.
    } finally {
      this.cdr.markForCheck();
    }
  }

  public get SelectedCompanyName(): string {
    if (!this.SelectedCompanyId) {
      return 'All companies';
    }
    const found = this.AvailableCompanies.find((c) =>
      UUIDsEqual(c.ID, this.SelectedCompanyId),
    );
    return found?.Name ?? 'Company';
  }

  public get PreviewDisplayName(): string {
    return this.Name.trim() || 'Untitled brand kit';
  }

  public get PrimarySwatchColor(): string {
    return this.NormalizeColorInputValue(this.Palette[0]?.Value, '#1e3a8a');
  }

  public get SecondarySwatchColor(): string {
    return this.NormalizeColorInputValue(
      this.Palette[1]?.Value ?? this.Palette[0]?.Value,
      '#0ea5e9',
    );
  }

  public get AccentSwatchColor(): string {
    return this.NormalizeColorInputValue(
      this.Palette[2]?.Value ?? this.Palette[1]?.Value ?? this.Palette[0]?.Value,
      '#f59e0b',
    );
  }

  public get CanAddSwatch(): boolean {
    return this.Palette.length < MAX_BRAND_KIT_SWATCHES;
  }

  public NormalizeColorInputValue(raw: string | undefined, fallback = '#1e3a8a'): string {
    const trimmed = (raw ?? '').trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) {
      return trimmed.toLowerCase();
    }
    if (/^#[0-9a-fA-F]{3}$/.test(trimmed)) {
      const r = trimmed[1];
      const g = trimmed[2];
      const b = trimmed[3];
      return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
    }
    return fallback;
  }

  public AddSwatch(): void {
    if (!this.CanAddSwatch) {
      return;
    }
    const nextIndex = this.Palette.length + 1;
    this.Palette = [
      ...this.Palette,
      {
        Name: `Color ${nextIndex}`,
        Value: '#64748b',
      },
    ];
    this.cdr.markForCheck();
  }

  public RemoveSwatch(index: number): void {
    if (this.Palette.length <= 1) {
      return;
    }
    this.Palette = this.Palette.filter((_, idx) => idx !== index);
    this.cdr.markForCheck();
  }

  public OnSwatchColorPickerChange(index: number, hexValue: string): void {
    if (!this.Palette[index]) {
      return;
    }
    this.Palette[index].Value = hexValue.toLowerCase();
    this.Palette = [...this.Palette];
    this.cdr.markForCheck();
  }

  public OnSwatchHexTextChange(index: number, rawText: string): void {
    if (!this.Palette[index]) {
      return;
    }
    this.Palette[index].Value = rawText;
    this.Palette = [...this.Palette];
    this.cdr.markForCheck();
  }

  public async OnLogoFileUploaded(event: FileUploadEvent): Promise<void> {
    this.SaveError = null;
    if (!event.success || !event.file?.ID) {
      this.SaveError = 'Logo upload failed.';
      this.cdr.markForCheck();
      return;
    }

    this.PendingLogoUpload = event;
    this.PendingLogoFileName = event.file.Name || 'Logo';
    const previewUrl = await MintBrandKitFilePreviewUrl(
      this.ProviderToUse,
      event.file.ID,
    );
    if (previewUrl) {
      this.LogoPreviewUrl = previewUrl;
    }
    this.cdr.markForCheck();
  }

  public ApplySuggestedColorsFromPixels(pixels: ArrayLike<number>): MJBrandKitEntity_IBrandColor[] {
    const suggested = SuggestColorsFromRgbaPixels(pixels, 5);
    if (suggested.length > 0) {
      this.Palette = suggested.map((c) => ({ ...c }));
      this.cdr.markForCheck();
    }
    return suggested;
  }

  public async SuggestColorsFromLogo(): Promise<void> {
    if (!this.LogoPreviewUrl) {
      return;
    }
    this.SuggestingColors = true;
    this.cdr.markForCheck();
    try {
      const suggested = await SampleLogoColorsFromImageUrl(this.LogoPreviewUrl, 5);
      if (suggested.length > 0) {
        this.Palette = suggested.map((c) => ({ ...c }));
      }
    } finally {
      this.SuggestingColors = false;
      this.cdr.markForCheck();
    }
  }

  public AddNeverInventItem(): void {
    const trimmed = this.NewNeverInventInput.trim();
    if (!trimmed) {
      return;
    }
    if (!this.NeverInventItems.includes(trimmed)) {
      this.NeverInventItems = [...this.NeverInventItems, trimmed];
    }
    this.NewNeverInventInput = '';
    this.cdr.markForCheck();
  }

  public RemoveNeverInventItem(item: string): void {
    this.NeverInventItems = this.NeverInventItems.filter((existing) => existing !== item);
    this.cdr.markForCheck();
  }

  public OnNeverInventKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.AddNeverInventItem();
    }
  }

  public BuildStyleObject(): MJBrandKitEntity_IBrandStyle {
    const palette: MJBrandKitEntity_IBrandColor[] = this.Palette.filter((s) =>
      Boolean(s.Value && s.Value.trim()),
    )
      .slice(0, MAX_BRAND_KIT_SWATCHES)
      .map((s, idx) => ({
        Name: s.Name?.trim() || `Color ${idx + 1}`,
        Value: s.Value.trim(),
      }));

    const typography: MJBrandKitEntity_IBrandTypeface[] = [];
    const heading = this.HeadingFontFamily.trim();
    if (heading) {
      typography.push({
        Role: 'Headline',
        FontFamily: heading,
        Weight: 700,
      });
    }
    const body = this.BodyFontFamily.trim();
    if (body) {
      typography.push({
        Role: 'Body',
        FontFamily: body,
        Weight: 400,
      });
    }

    const style: MJBrandKitEntity_IBrandStyle = {
      Palette: palette,
      Typography: typography,
    };

    const imagery = this.ImageryStyle.trim();
    if (imagery) {
      style.ImageryStyle = imagery;
    }

    const keepList = this.parseCommaOrLineList(this.KeepItemsText);
    if (keepList.length > 0) {
      style.Keep = keepList;
    }

    const avoidList = this.parseCommaOrLineList(this.AvoidItemsText);
    if (avoidList.length > 0) {
      style.Avoid = avoidList;
    }

    return style;
  }

  public BuildGenerationPolicyObject(): MJBrandKitEntity_IBrandGenerationPolicy {
    return {
      AllowGeneratedImages: Boolean(this.AllowGeneratedImages),
      AllowGeneratedVideo: Boolean(this.AllowGeneratedVideo),
      AllowSyntheticPeople: Boolean(this.AllowSyntheticPeople),
    };
  }

  public async Save(): Promise<boolean> {
    this.SaveError = null;
    const trimmedName = this.Name.trim();
    if (!trimmedName) {
      this.SaveError = 'Enter a name for the brand kit.';
      this.cdr.markForCheck();
      return false;
    }

    this.Saving = true;
    this.cdr.markForCheck();

    try {
      const kit = await this.ProviderToUse.GetEntityObject<MJBrandKitEntity>(
        'MJ: Brand Kits',
        this.ProviderToUse.CurrentUser,
      );
      kit.NewRecord();
      kit.Name = trimmedName;
      kit.CompanyID = this.SelectedCompanyId.trim() ? this.SelectedCompanyId.trim() : null;
      kit.IsDefault = Boolean(this.IsDefault);
      kit.Status = 'Active';
      kit.StyleObject = this.BuildStyleObject();
      kit.GenerationPolicyObject = this.BuildGenerationPolicyObject();
      if (this.NeverInventItems.length > 0) {
        kit.NeverInventObject = [...this.NeverInventItems];
      }

      const saved = await kit.Save();
      if (!saved) {
        this.SaveError =
          kit.LatestResult?.CompleteMessage ||
          kit.LatestResult?.Message ||
          'Failed to save brand kit.';
        return false;
      }

      if (this.PendingLogoUpload) {
        const assetResult = await CreateBrandKitAssetFromUpload({
          Provider: this.ProviderToUse,
          BrandKitID: kit.ID,
          UploadEvent: this.PendingLogoUpload,
          AssetType: 'Logo',
          Name: this.PendingLogoFileName,
          IsPrimary: true,
          Sequence: 1,
          IsGenerationReference: true,
        });
        if (!assetResult.Success) {
          this.SaveError =
            assetResult.ErrorMessage || 'Brand kit saved, but failed to attach the logo asset.';
          return false;
        }
        this.PendingLogoUpload = null;
      }

      this.SavedKitId = kit.ID;
      this.Saved.emit(kit.ID);
      return true;
    } catch (err: unknown) {
      this.SaveError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.Saving = false;
      this.cdr.markForCheck();
    }
  }

  public OnCancel(): void {
    this.Cancelled.emit();
  }

  public OnOpenMoreSettings(): void {
    if (this.SavedKitId) {
      this.OpenMoreSettings.emit(this.SavedKitId);
    }
  }

  private parseCommaOrLineList(raw: string): string[] {
    return raw
      .split(/[\n,]+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
}
