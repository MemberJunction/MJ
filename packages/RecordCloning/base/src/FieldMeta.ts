/**
 * @file FieldMeta.ts
 * Builds the field metadata the field mapper and the config validator read, from an entity's
 * `EntityInfo`. The planner and the Entities-form cloning panel both use it, so a field the engine
 * treats as automatic (key, __mj timestamps, read-only view columns) is treated the same way by
 * validation in the UI.
 */

import type { EntityInfo } from '@memberjunction/core';
import type { FieldMappingFieldMeta } from './CloneFieldMapper';

/** Field metadata for every field of `entity`, in the shape `MapFieldsForClone` and `CloneConfigValidator` expect. */
export function FieldMetaFromEntity(entity: EntityInfo): FieldMappingFieldMeta[] {
    return entity.Fields.map((f) => ({
        Name: f.Name,
        IsPrimaryKey: f.IsPrimaryKey,
        IsIdentity: f.AutoIncrement === true,
        IsNameField: entity.NameField?.Name.toLowerCase() === f.Name.toLowerCase() || f.Name.toLowerCase() === 'name',
        IsUnique: f.IsUnique,
        RelatedEntityID: f.RelatedEntityID,
        RelatedEntity: f.RelatedEntity,
        RelatedEntityJoinField: f.RelatedEntityFieldName,
        EntityIDFieldName: f.EntityIDFieldName,
        Type: f.Type,
        IsSPParameter: (upd: boolean) => (f.IsSPParameter ? f.IsSPParameter(upd) : true),
        DefaultValue: f.DefaultValue,
        AllowsNull: f.AllowsNull,
        IsCreatedAtField: f.Name === '__mj_CreatedAt',
        IsUpdatedAtField: f.Name === '__mj_UpdatedAt',
        IsSoftDeleteField: false,
    }));
}
