import { IMetadataProvider, LogError } from '@memberjunction/core';
import { MJBrandKitAssetEntity } from '@memberjunction/core-entities';
import { GraphQLDataProvider, GraphQLFileStorageClient } from '@memberjunction/graphql-dataprovider';
import { FileUploadEvent } from '@memberjunction/ng-file-storage';

export type BrandKitAssetType = MJBrandKitAssetEntity['AssetType'];

export const VISUAL_GENERATION_REFERENCE_ASSET_TYPES: ReadonlySet<BrandKitAssetType> =
  new Set<BrandKitAssetType>(['Image', 'Screenshot', 'Logo', 'LogoMark', 'Video']);

export const IMAGE_THUMBNAIL_ASSET_TYPES: ReadonlySet<BrandKitAssetType> =
  new Set<BrandKitAssetType>(['Logo', 'LogoMark', 'Image', 'Screenshot']);

export interface CreateBrandKitAssetFromUploadOptions {
  Provider: IMetadataProvider;
  BrandKitID: string;
  UploadEvent: FileUploadEvent;
  AssetType: BrandKitAssetType;
  Name?: string | null;
  Usage?: string | null;
  IsPrimary?: boolean;
  Sequence?: number;
  IsGenerationReference?: boolean;
}

export interface CreateBrandKitAssetFromUploadResult {
  Success: boolean;
  Asset: MJBrandKitAssetEntity | null;
  ErrorMessage: string | null;
}

/**
 * Shared helper for `mj-brand-kit-assets-editor` and `mj-brand-kit-creator` that
 * validates a `FileUploadEvent` from `<mj-files-file-upload>` and creates + saves
 * the corresponding `MJ: Brand Kit Assets` entity row via `Provider`.
 */
export async function CreateBrandKitAssetFromUpload(
  options: CreateBrandKitAssetFromUploadOptions,
): Promise<CreateBrandKitAssetFromUploadResult> {
  const { UploadEvent, BrandKitID, Provider } = options;
  if (!UploadEvent.success || !UploadEvent.file?.ID) {
    return {
      Success: false,
      Asset: null,
      ErrorMessage: 'File upload failed.',
    };
  }
  const trimmedKitId = BrandKitID?.trim();
  if (!trimmedKitId) {
    return {
      Success: false,
      Asset: null,
      ErrorMessage: 'Brand Kit ID is required to attach an asset.',
    };
  }

  try {
    const entity = await Provider.GetEntityObject<MJBrandKitAssetEntity>(
      'MJ: Brand Kit Assets',
      Provider.CurrentUser,
    );
    entity.NewRecord();
    entity.BrandKitID = trimmedKitId;
    entity.FileID = UploadEvent.file.ID;
    entity.Name =
      options.Name?.trim() || UploadEvent.file.Name || 'Untitled Asset';
    entity.AssetType = options.AssetType;
    entity.Usage = options.Usage?.trim() || null;
    entity.IsPrimary = Boolean(options.IsPrimary);
    entity.Sequence = options.Sequence ?? 1;
    entity.IsGenerationReference = VISUAL_GENERATION_REFERENCE_ASSET_TYPES.has(
      options.AssetType,
    )
      ? Boolean(options.IsGenerationReference)
      : false;

    const saved = await entity.Save();
    if (!saved) {
      return {
        Success: false,
        Asset: null,
        ErrorMessage:
          entity.LatestResult?.CompleteMessage ||
          entity.LatestResult?.Message ||
          'Failed to create Brand Kit Asset record.',
      };
    }

    return {
      Success: true,
      Asset: entity,
      ErrorMessage: null,
    };
  } catch (err: unknown) {
    return {
      Success: false,
      Asset: null,
      ErrorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Mints a signed preview URL for a stored file ID when `provider` is a `GraphQLDataProvider`.
 */
export async function MintBrandKitFilePreviewUrl(
  provider: IMetadataProvider,
  fileId: string,
): Promise<string | null> {
  if (!fileId || !(provider instanceof GraphQLDataProvider)) {
    return null;
  }
  try {
    const storageClient = new GraphQLFileStorageClient(provider);
    const res = await storageClient.CreateMediaAccessToken(fileId);
    if (res.Success && res.Url) {
      return res.Url;
    }
    return null;
  } catch (err: unknown) {
    LogError(err instanceof Error ? err.message : String(err));
    return null;
  }
}
