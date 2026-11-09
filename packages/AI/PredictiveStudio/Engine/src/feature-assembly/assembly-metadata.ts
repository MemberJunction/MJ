/**
 * @module feature-assembly/assembly-metadata
 *
 * The narrow view of entity metadata the unit reader and the as-of assembly need, so both are testable with plain
 * objects. `ProviderAssemblyMetadata` adapts the provider's `EntityInfo`.
 */
import type { EntityFieldTSType, IMetadataProvider } from '@memberjunction/core';

export interface AssemblyFieldInfo {
  readonly Name: string;
  readonly SqlType: string;
  readonly TSType: EntityFieldTSType;
  /** `false` = declared immutable after creation (`MJ: Entity Fields.AllowUpdateAPI`). */
  readonly AllowUpdateAPI: boolean;
  readonly IsPrimaryKey: boolean;
  readonly RelatedEntity: string | null;
  readonly IsVirtual: boolean;
}

export interface AssemblyEntityInfo {
  readonly ID: string;
  readonly Name: string;
  readonly PrimaryKey: string;
  readonly TrackRecordChanges: boolean;
  readonly Fields: readonly AssemblyFieldInfo[];
}

export interface IAssemblyMetadata {
  /** The entity, or null when it is not registered or has a composite primary key (PS units need one key). */
  Entity(name: string): AssemblyEntityInfo | null;
}

export class ProviderAssemblyMetadata implements IAssemblyMetadata {
  constructor(private readonly provider: IMetadataProvider) {}

  public Entity(name: string): AssemblyEntityInfo | null {
    const e = this.provider.EntityByName(name);
    if (!e || e.PrimaryKeys.length !== 1) return null;
    return {
      ID: e.ID,
      Name: e.Name,
      PrimaryKey: e.FirstPrimaryKey.Name, // first-pk-ok: entities with a composite key return null above (PS units need one key)
      TrackRecordChanges: e.TrackRecordChanges === true,
      Fields: e.Fields.map((f) => ({
        Name: f.Name,
        SqlType: f.Type,
        TSType: f.TSType,
        AllowUpdateAPI: f.AllowUpdateAPI !== false,
        IsPrimaryKey: f.IsPrimaryKey === true,
        RelatedEntity: f.RelatedEntity || null,
        IsVirtual: f.IsVirtual === true,
      })),
    };
  }
}
