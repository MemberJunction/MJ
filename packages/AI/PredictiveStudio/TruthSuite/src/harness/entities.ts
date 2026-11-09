import type { EntityInfo, IMetadataProvider } from '@memberjunction/core';

/** Test-schema entities, resolved by table. */
export class TruthEntities {
  /** The registered entity of `pstruth.<table>`; throws naming the fix when CodeGen has not registered it. */
  public static ForTable(provider: IMetadataProvider, table: string): EntityInfo {
    const entity = provider.Entities.find((e) => e.SchemaName === 'pstruth' && e.BaseTable === table);
    if (!entity) throw new Error(`No MJ entity for pstruth.${table}: run truth:provision, then restart MJAPI`);
    return entity;
  }
}
