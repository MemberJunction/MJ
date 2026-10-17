import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  inject,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RunView } from '@memberjunction/core';
import { MJBrandKitAssetEntity, MJBrandKitEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { FileStorageModule } from '@memberjunction/ng-file-storage';
import { MJStorageMediaPlayerComponent } from '@memberjunction/ng-media-player';

export type BrandKitFileUploadEvent =
  | {
      success: true;
      file: {
        ID: string;
        Name?: string;
      };
    }
  | {
      success: false;
      file?: unknown;
    };

export type BrandKitAssetType = MJBrandKitAssetEntity['AssetType'];

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
  { Type: 'LogoMark', Label: 'Logo Marks', Icon: 'fa-solid fa-stamp' },
  { Type: 'Image', Label: 'Images', Icon: 'fa-solid fa-image' },
  { Type: 'Screenshot', Label: 'Screenshots', Icon: 'fa-solid fa-desktop' },
  { Type: 'Video', Label: 'Videos', Icon: 'fa-solid fa-video' },
  { Type: 'Music', Label: 'Music Tracks', Icon: 'fa-solid fa-music' },
  { Type: 'SoundEffect', Label: 'Sound Effects', Icon: 'fa-solid fa-volume-high' },
  { Type: 'Font', Label: 'Fonts', Icon: 'fa-solid fa-font' },
  { Type: 'Other', Label: 'Other Assets', Icon: 'fa-solid fa-file' },
];

export const VISUAL_GENERATION_REFERENCE_ASSET_TYPES: ReadonlySet<BrandKitAssetType> = new Set<BrandKitAssetType>([
  'Image',
  'Screenshot',
  'Logo',
  'LogoMark',
  'Video',
]);

export const IMAGE_THUMBNAIL_ASSET_TYPES: ReadonlySet<BrandKitAssetType> = new Set<BrandKitAssetType>([
  'Logo',
  'LogoMark',
  'Image',
  'Screenshot',
]);

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
 * and `IsGenerationReference` for visual asset types only), and adds new assets via `<mj-files-file-upload>`.
 */
@Component({
  standalone: true,
  selector: 'mj-brand-kit-assets-editor',
  imports: [CommonModule, FormsModule, FileStorageModule, MJStorageMediaPlayerComponent],
  templateUrl: './brand-kit-assets-editor.component.html',
  styleUrls: ['./brand-kit-assets-editor.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrandKitAssetsEditorComponent extends BaseAngularComponent implements OnChanges {
  private _brandKit: MJBrandKitEntity | null = null;

  @Input()
  get BrandKit(): MJBrandKitEntity | null {
    return this._brandKit;
  }
  set BrandKit(value: MJBrandKitEntity | null) {
    this._brandKit = value;
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

  public NewAssetType: BrandKitAssetType = 'Logo';
  public NewAssetName = '';
  public NewAssetUsage = '';
  public NewAssetIsPrimary = false;
  public NewAssetIsGenerationReference = false;
  public readonly AssetTypeCatalog = ALL_BRAND_KIT_ASSET_TYPES;

  private readonly cdr = inject(ChangeDetectorRef);
  private loadSequence = 0;

  async ngOnChanges(changes: SimpleChanges): Promise<void> {
    if ('BrandKit' in changes) {
      await this.LoadAssets();
    }
  }

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

  public async OnFileUploaded(event: BrandKitFileUploadEvent): Promise<void> {
    if (!event.success || !event.file.ID || !this._brandKit?.ID) {
      if (!event.success) {
        this.SaveError = 'File upload failed.';
        this.cdr.markForCheck();
      }
      return;
    }

    const uploadedFileId = event.file.ID;
    this.SaveError = null;
    try {
      const entity = await this.ProviderToUse.GetEntityObject<MJBrandKitAssetEntity>(
        'MJ: Brand Kit Assets',
        this.ProviderToUse.CurrentUser
      );
      entity.NewRecord();
      entity.BrandKitID = this._brandKit.ID;
      entity.FileID = uploadedFileId;
      entity.Name = this.NewAssetName.trim() || event.file.Name || 'Untitled Asset';
      entity.AssetType = this.NewAssetType;
      entity.Usage = this.NewAssetUsage.trim() || null;
      entity.IsPrimary = this.NewAssetIsPrimary;
      entity.Sequence = this.Assets.length + 1;
      entity.IsGenerationReference = this.IsVisualGenerationReferenceEligible(this.NewAssetType)
        ? this.NewAssetIsGenerationReference
        : false;

      const saved = await entity.Save();
      if (!saved) {
        this.SaveError =
          entity.LatestResult?.CompleteMessage ||
          entity.LatestResult?.Message ||
          'Failed to create Brand Kit Asset record.';
        this.cdr.markForCheck();
        return;
      }

      this.NewAssetName = '';
      this.NewAssetUsage = '';
      this.NewAssetIsPrimary = false;
      this.NewAssetIsGenerationReference = false;
      this.Assets = [...this.Assets, entity];
      this.rebuildGroups();
      await this.mintThumbnails(this.loadSequence);
      this.AssetsChanged.emit(this.Assets);
    } catch (err) {
      this.SaveError = err instanceof Error ? err.message : String(err);
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
    const provider = this.ProviderToUse as unknown as GraphQLDataProvider | null;
    if (!provider || typeof provider.ExecuteGQL !== 'function') {
      return;
    }

    const storageClient = new GraphQLFileStorageClient(provider);
    const visualAssets = this.Assets.filter(
      (a) => this.IsImagePreviewType(a.AssetType) && a.FileID && !this.ThumbnailUrls.has(a.FileID)
    );

    await Promise.all(
      visualAssets.map(async (asset) => {
        try {
          const res = await storageClient.CreateMediaAccessToken(asset.FileID);
          if (expectedSequence === this.loadSequence && res.Success && res.Url) {
            this.ThumbnailUrls.set(asset.FileID, res.Url);
          }
        } catch {
          // Non-fatal: placeholder icon stays visible if token minting fails
        }
      })
    );
  }
}
