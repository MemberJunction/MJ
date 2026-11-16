import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  Output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RunView } from '@memberjunction/core';
import { MJBrandKitAssetEntity, MJBrandKitEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FileStorageModule, FileUploadEvent } from '@memberjunction/ng-file-storage';
import { MJStorageMediaPlayerComponent } from '@memberjunction/ng-media-player';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import {
  BrandKitAssetType,
  CreateBrandKitAssetFromUpload,
  IMAGE_THUMBNAIL_ASSET_TYPES,
  MintBrandKitFilePreviewUrl,
  VISUAL_GENERATION_REFERENCE_ASSET_TYPES,
} from '../brand-kit-asset-upload';

export {
  BrandKitAssetType,
  IMAGE_THUMBNAIL_ASSET_TYPES,
  VISUAL_GENERATION_REFERENCE_ASSET_TYPES,
};

export interface BrandKitAssetGroup {
  AssetType: BrandKitAssetType;
  Label: string;
  Icon: string;
  Assets: MJBrandKitAssetEntity[];
}

export const ALL_BRAND_KIT_ASSET_TYPES: ReadonlyArray<{
  Type: BrandKitAssetType;
  Label: string;
  Icon: string;
}> = [
  { Type: 'Logo', Label: 'Logos', Icon: 'fa-solid fa-gem' },
  { Type: 'LogoMark', Label: 'Logo marks', Icon: 'fa-solid fa-stamp' },
  { Type: 'Image', Label: 'Images', Icon: 'fa-solid fa-image' },
  { Type: 'Screenshot', Label: 'Screenshots', Icon: 'fa-solid fa-desktop' },
  { Type: 'Video', Label: 'Videos', Icon: 'fa-solid fa-video' },
  { Type: 'Music', Label: 'Music tracks', Icon: 'fa-solid fa-music' },
  { Type: 'SoundEffect', Label: 'Sound effects', Icon: 'fa-solid fa-volume-high' },
  { Type: 'Font', Label: 'Fonts', Icon: 'fa-solid fa-font' },
  { Type: 'Other', Label: 'Other assets', Icon: 'fa-solid fa-file' },
];

export const AUDIO_ASSET_TYPES: ReadonlySet<BrandKitAssetType> = new Set<BrandKitAssetType>([
  'Music',
  'SoundEffect',
]);

/**
 * Reusable editor for `MJ: Brand Kit Assets` belonging to a given `MJBrandKitEntity`.
 *
 * Groups assets by `AssetType`, renders type-appropriate previews (minted image URLs via
 * `GraphQLFileStorageClient.CreateMediaAccessToken`, `<mj-storage-media-player>` for audio/video,
 * font display for fonts), edits metadata (`Usage`, `IsPrimary`, `Sequence`, `LicenseNotes`,
 * and `IsGenerationReference` for visual asset types only), adds new assets via `<mj-files-file-upload>`,
 * and deletes existing assets via `asset.Delete()` after confirmation.
 */
@Component({
  standalone: true,
  selector: 'mj-brand-kit-assets-editor',
  imports: [CommonModule, FormsModule, FileStorageModule, MJStorageMediaPlayerComponent, MJButtonDirective, SharedGenericModule],
  templateUrl: './brand-kit-assets-editor.component.html',
  styleUrls: ['./brand-kit-assets-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandKitAssetsEditorComponent extends BaseAngularComponent {
  private _brandKit: MJBrandKitEntity | null = null;

  @Input()
  get BrandKit(): MJBrandKitEntity | null {
    return this._brandKit;
  }
  set BrandKit(value: MJBrandKitEntity | null) {
    this._brandKit = value;
    void this.LoadAssets();
  }

  @Input() Readonly = false;

  @Output() AssetsChanged = new EventEmitter<MJBrandKitAssetEntity[]>();

  public Assets: MJBrandKitAssetEntity[] = [];
  public Groups: BrandKitAssetGroup[] = [];
  public ThumbnailUrls = new Map<string, string>();
  public Loading = false;
  public LoadError: string | null = null;
  public SaveError: string | null = null;
  public SavingAssetIds = new Set<string>();
  public DeletingAssetIds = new Set<string>();

  public NewAssetType: BrandKitAssetType = 'Logo';
  public NewAssetName = '';
  public NewAssetUsage = '';
  public NewAssetIsPrimary = false;
  public NewAssetIsGenerationReference = false;
  public readonly AssetTypeCatalog = ALL_BRAND_KIT_ASSET_TYPES;

  private readonly cdr = inject(ChangeDetectorRef);
  private readonly confirmService = inject(MJConfirmService);
  private loadSequence = 0;

  public async LoadAssets(): Promise<void> {
    const seq = ++this.loadSequence;
    this.LoadError = null;
    this.SaveError = null;

    const kitId = this._brandKit?.ID?.trim();
    if (!kitId) {
      this.Assets = [];
      this.Groups = [];
      this.ThumbnailUrls.clear();
      this.Loading = false;
      this.cdr.markForCheck();
      return;
    }

    this.Loading = true;
    this.cdr.markForCheck();

    try {
      const rv = RunView.FromMetadataProvider(this.ProviderToUse);
      const safeId = kitId.replace(/'/g, "''");
      const result = await rv.RunView<MJBrandKitAssetEntity>(
        {
          EntityName: 'MJ: Brand Kit Assets',
          ExtraFilter: `BrandKitID='${safeId}'`,
          OrderBy: 'Sequence ASC, Name ASC',
          ResultType: 'entity_object',
        },
        this.ProviderToUse.CurrentUser
      );
      if (seq !== this.loadSequence) {
        return;
      }

      if (!result.Success) {
        this.LoadError = result.ErrorMessage || 'Failed to load Brand Kit assets.';
        this.Assets = [];
        this.Groups = [];
      } else {
        this.Assets = result.Results ?? [];
        this.rebuildGroups();
        await this.mintThumbnails(seq);
      }
    } catch (err) {
      if (seq !== this.loadSequence) {
        return;
      }
      this.LoadError = err instanceof Error ? err.message : String(err);
      this.Assets = [];
      this.Groups = [];
    } finally {
      if (seq === this.loadSequence) {
        this.Loading = false;
        this.cdr.markForCheck();
      }
    }
  }

  public IsVisualGenerationReferenceEligible(assetType: BrandKitAssetType): boolean {
    return VISUAL_GENERATION_REFERENCE_ASSET_TYPES.has(assetType);
  }

  public IsImagePreviewType(assetType: BrandKitAssetType): boolean {
    return IMAGE_THUMBNAIL_ASSET_TYPES.has(assetType);
  }

  public IsAudioPreviewType(assetType: BrandKitAssetType): boolean {
    return AUDIO_ASSET_TYPES.has(assetType);
  }

  public IsVideoPreviewType(assetType: BrandKitAssetType): boolean {
    return assetType === 'Video';
  }

  public IsFontPreviewType(assetType: BrandKitAssetType): boolean {
    return assetType === 'Font';
  }

  public GetThumbnailUrl(asset: MJBrandKitAssetEntity): string | null {
    return this.ThumbnailUrls.get(asset.FileID) ?? null;
  }

  public IsSavingAsset(asset: MJBrandKitAssetEntity): boolean {
    return this.SavingAssetIds.has(asset.ID);
  }

  public IsDeletingAsset(asset: MJBrandKitAssetEntity): boolean {
    return this.DeletingAssetIds.has(asset.ID);
  }

  public async SaveAsset(asset: MJBrandKitAssetEntity): Promise<boolean> {
    if (this.Readonly) {
      return false;
    }
    this.SaveError = null;
    this.SavingAssetIds.add(asset.ID);
    this.cdr.markForCheck();

    try {
      if (!this.IsVisualGenerationReferenceEligible(asset.AssetType)) {
        asset.IsGenerationReference = false;
      }
      const saved = await asset.Save();
      if (!saved) {
        this.SaveError =
          asset.LatestResult?.CompleteMessage ||
          asset.LatestResult?.Message ||
          `Failed to save asset "${asset.Name}".`;
        return false;
      }
      this.rebuildGroups();
      this.AssetsChanged.emit(this.Assets);
      return true;
    } catch (err) {
      this.SaveError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.SavingAssetIds.delete(asset.ID);
      this.cdr.markForCheck();
    }
  }

  public async DeleteAsset(asset: MJBrandKitAssetEntity): Promise<boolean> {
    if (this.Readonly) {
      return false;
    }
    const confirmed = await this.confirmService.ConfirmDelete({
      title: 'Delete Asset',
      message: `Delete asset "${asset.Name || 'Untitled'}"?`,
      detail: 'This removes the Brand Kit Asset link. The underlying file remains in storage.',
    });
    if (!confirmed) {
      return false;
    }

    this.SaveError = null;
    this.DeletingAssetIds.add(asset.ID);
    this.cdr.markForCheck();

    try {
      const deleted = await asset.Delete();
      if (!deleted) {
        this.SaveError =
          asset.LatestResult?.CompleteMessage ||
          asset.LatestResult?.Message ||
          `Failed to delete asset "${asset.Name}".`;
        return false;
      }
      this.Assets = this.Assets.filter((a) => !UUIDsEqual(a.ID, asset.ID));
      this.rebuildGroups();
      this.AssetsChanged.emit(this.Assets);
      return true;
    } catch (err) {
      this.SaveError = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      this.DeletingAssetIds.delete(asset.ID);
      this.cdr.markForCheck();
    }
  }

  public async OnFileUploaded(event: FileUploadEvent): Promise<void> {
    if (!event.success || !event.file.ID || !this._brandKit?.ID) {
      if (!event.success) {
        this.SaveError = 'File upload failed.';
        this.cdr.markForCheck();
      }
      return;
    }

    this.SaveError = null;
    try {
      const result = await CreateBrandKitAssetFromUpload({
        Provider: this.ProviderToUse,
        BrandKitID: this._brandKit.ID,
        UploadEvent: event,
        AssetType: this.NewAssetType,
        Name: this.NewAssetName,
        Usage: this.NewAssetUsage,
        IsPrimary: this.NewAssetIsPrimary,
        Sequence: this.Assets.length + 1,
        IsGenerationReference: this.NewAssetIsGenerationReference,
      });

      if (!result.Success || !result.Asset) {
        this.SaveError = result.ErrorMessage || 'Failed to create Brand Kit Asset record.';
        this.cdr.markForCheck();
        return;
      }

      this.NewAssetName = '';
      this.NewAssetUsage = '';
      this.NewAssetIsPrimary = false;
      this.NewAssetIsGenerationReference = false;
      this.Assets = [...this.Assets, result.Asset];
      this.rebuildGroups();
      await this.mintThumbnails(this.loadSequence);
      this.AssetsChanged.emit(this.Assets);
    } finally {
      this.cdr.markForCheck();
    }
  }

  private rebuildGroups(): void {
    const byType = new Map<BrandKitAssetType, MJBrandKitAssetEntity[]>();
    for (const asset of this.Assets) {
      const bucket = byType.get(asset.AssetType) ?? [];
      bucket.push(asset);
      byType.set(asset.AssetType, bucket);
    }

    this.Groups = ALL_BRAND_KIT_ASSET_TYPES.map((meta) => ({
      AssetType: meta.Type,
      Label: meta.Label,
      Icon: meta.Icon,
      Assets: (byType.get(meta.Type) ?? []).sort(
        (a, b) => (a.Sequence ?? 0) - (b.Sequence ?? 0) || a.Name.localeCompare(b.Name)
      ),
    })).filter((group) => group.Assets.length > 0);
  }

  private async mintThumbnails(expectedSequence: number): Promise<void> {
    const visualAssets = this.Assets.filter(
      (a) => this.IsImagePreviewType(a.AssetType) && a.FileID && !this.ThumbnailUrls.has(a.FileID)
    );

    await Promise.all(
      visualAssets.map(async (asset) => {
        const url = await MintBrandKitFilePreviewUrl(this.ProviderToUse, asset.FileID);
        if (expectedSequence === this.loadSequence && url) {
          this.ThumbnailUrls.set(asset.FileID, url);
        }
      })
    );
  }
}
