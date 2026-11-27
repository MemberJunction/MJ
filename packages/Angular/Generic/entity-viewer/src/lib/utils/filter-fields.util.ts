import {
  EntityFieldInfo,
  EntityInfo,
  IsCompositeFilter,
  IsSimpleFilter,
  type CompositeFilterDescriptor
} from '@memberjunction/core';
import { FilterFieldInfo, FilterFieldType } from '@memberjunction/ng-filter-builder';

/**
 * The lower-cased field names a filter references anywhere in its tree.
 */
export function CollectFilterFieldNames(
  filter: CompositeFilterDescriptor | null | undefined,
  acc: Set<string> = new Set()
): Set<string> {
  if (!filter?.filters) return acc;
  for (const item of filter.filters) {
    if (IsCompositeFilter(item)) {
      CollectFilterFieldNames(item, acc);
    } else if (IsSimpleFilter(item) && item.field) {
      acc.add(item.field.toLowerCase());
    }
  }
  return acc;
}

/**
 * The filter-builder type for an entity field: lookups first, then by SQL type.
 */
export function MapFilterFieldType(field: EntityFieldInfo): FilterFieldType {
  if (field.RelatedEntity) {
    return 'lookup';
  }
  const sqlType = field.Type.toLowerCase();
  if (sqlType.includes('bit') || sqlType === 'boolean') {
    return 'boolean';
  }
  if (sqlType.includes('date') || sqlType.includes('time')) {
    return 'date';
  }
  if (sqlType.includes('int') || sqlType.includes('decimal') ||
      sqlType.includes('numeric') || sqlType.includes('float') ||
      sqlType.includes('real') || sqlType.includes('money')) {
    return 'number';
  }
  return 'string';
}

/**
 * The fields a filter builder offers for an entity, shared by the view config panel and the
 * entity data grid so both offer the same fields. Binary fields are left out. System `__mj_`
 * fields and raw SQL type badges show only in advanced mode, or when the filter already uses the
 * field. `ValueListType='List'` fields become pick-lists.
 *
 * @param activeFieldNames Lower-cased names the current filter already references
 *   (see {@link CollectFilterFieldNames}).
 */
export function BuildFilterFields(
  entity: EntityInfo,
  activeFieldNames: Set<string>,
  advancedMode: boolean = false
): FilterFieldInfo[] {
  return entity.Fields
    .filter(f => !f.IsBinaryFieldType)
    .filter(f => advancedMode || !f.Name.startsWith('__mj_') || activeFieldNames.has(f.Name.toLowerCase()))
    .map(field => ({
      name: field.Name,
      displayName: field.DisplayNameOrName,
      type: MapFilterFieldType(field),
      description: field.Description || undefined,
      sqlType: advancedMode ? (field.Type || undefined) : undefined,
      lookupEntityName: field.RelatedEntity || undefined,
      valueList: field.ValueListType === 'List' && field.EntityFieldValues?.length > 0
        ? field.EntityFieldValues.map(v => ({ value: v.Value, label: v.Value }))
        : undefined
    }));
}
