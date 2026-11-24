import { RunView } from '@memberjunction/core';
import type { MJvwLatestFeatureValuesEntityType } from '@memberjunction/core-entities';
import { EscapeSQLString } from '@memberjunction/global';
import type { IntegrationBootstrapContext } from '@memberjunction/testing-integration';

/** A column of `MJ: Latest Feature Values`, as the generated entity type names it. */
export type LatestFeatureValueField = keyof MJvwLatestFeatureValuesEntityType & string;

/**
 * The latest-value view's rows for one record and feature, read through the entity like any reader, with only `fields`
 * loaded. The view returns one row per `(EntityID, RecordID, FeatureName)`, so a case expects zero or one row.
 */
export async function LatestRows<K extends LatestFeatureValueField>(
  ctx: IntegrationBootstrapContext,
  entityId: string,
  recordId: string,
  featureName: string,
  fields: readonly K[],
): Promise<Pick<MJvwLatestFeatureValuesEntityType, K>[]> {
  const result = await RunView.FromMetadataProvider(ctx.Provider).RunView<Pick<MJvwLatestFeatureValuesEntityType, K>>(
    {
      EntityName: 'MJ: Latest Feature Values',
      ExtraFilter: `EntityID = '${EscapeSQLString(entityId)}' AND RecordID = '${EscapeSQLString(recordId)}' AND FeatureName = '${EscapeSQLString(featureName)}'`,
      Fields: [...fields],
      ResultType: 'simple',
    },
    ctx.User,
  );
  if (!result.Success) throw new Error(`MJ: Latest Feature Values did not load: ${result.ErrorMessage}`);
  return result.Results;
}
