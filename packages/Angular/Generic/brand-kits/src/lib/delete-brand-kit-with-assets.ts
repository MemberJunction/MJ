import { IMetadataProvider, Metadata, RunView } from '@memberjunction/core';
import { MJBrandKitAssetEntity, MJBrandKitEntity } from '@memberjunction/core-entities';

export interface DeleteBrandKitWithAssetsResult {
  Success: boolean;
  ErrorMessage?: string;
}

/**
 * Deletes a Brand Kit's attached `MJ: Brand Kit Assets` records sequentially before deleting
 * the `MJ: Brand Kits` record itself (because `BrandKitAsset.BrandKitID` is a non-cascading FK).
 *
 * Stops at the first asset deletion failure and returns its `LatestResult` message without
 * attempting to delete remaining assets or the Brand Kit.
 */
export async function DeleteBrandKitWithAssets(
  kit: MJBrandKitEntity,
  provider?: IMetadataProvider
): Promise<DeleteBrandKitWithAssetsResult> {
  const kitId = kit?.ID?.trim();
  if (!kitId) {
    return {
      Success: false,
      ErrorMessage: 'Cannot delete a Brand Kit without an ID.',
    };
  }

  const providerToUse = provider ?? Metadata.Provider;
  const rv = RunView.FromMetadataProvider(providerToUse);
  const safeId = kitId.replace(/'/g, "''");

  try {
    const assetsRes = await rv.RunView<MJBrandKitAssetEntity>(
      {
        EntityName: 'MJ: Brand Kit Assets',
        ExtraFilter: `BrandKitID='${safeId}'`,
        OrderBy: 'Sequence ASC, Name ASC',
        ResultType: 'entity_object',
      },
      providerToUse.CurrentUser
    );

    if (!assetsRes.Success) {
      return {
        Success: false,
        ErrorMessage: assetsRes.ErrorMessage || 'Failed to load Brand Kit assets before deletion.',
      };
    }

    const assets = assetsRes.Results ?? [];
    for (const asset of assets) {
      const deletedAsset = await asset.Delete();
      if (!deletedAsset) {
        return {
          Success: false,
          ErrorMessage:
            asset.LatestResult?.CompleteMessage ||
            asset.LatestResult?.Message ||
            `Failed to delete asset "${asset.Name || asset.ID}".`,
        };
      }
    }

    const deletedKit = await kit.Delete();
    if (!deletedKit) {
      return {
        Success: false,
        ErrorMessage:
          kit.LatestResult?.CompleteMessage ||
          kit.LatestResult?.Message ||
          `Failed to delete Brand Kit "${kit.Name || kit.ID}".`,
      };
    }

    return { Success: true };
  } catch (err) {
    return {
      Success: false,
      ErrorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}
