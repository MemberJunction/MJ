import { EntityFieldInfo, EntityFieldTSType, EntityInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import { MJUserViewEntityExtended } from '@memberjunction/core-entities';
import type { AppliedFilter } from '@memberjunction/ng-ui-components';
import {
  CompositeFilterDescriptor,
  FilterDescriptor,
  FilterFieldInfo,
  GetOperatorInfo,
  IsCompositeFilter,
  IsSimpleFilter,
  OperatorRequiresValue
} from '@memberjunction/ng-filter-builder';


/**
 * A copy of a user filter that is safe to compile: conditions on fields the entity does not have,
 * and conditions still missing a value, are dropped; string values are SQL-escaped; values for
 * unquoted (numeric) fields must be finite numbers. Returns `null` when nothing is left.
 *
 * The saved-view compiler (`GenerateWhereClauseFromFilterState`) wraps values in quotes without
 * escaping them, so the escaping happens here, before it.
 */
export function SanitizeUserFilter(
  filter: CompositeFilterDescriptor | null | undefined,
  entity: EntityInfo
): CompositeFilterDescriptor | null {
  if (!filter?.filters?.length) return null;
  const filters: (FilterDescriptor | CompositeFilterDescriptor)[] = [];
  for (const item of filter.filters) {
    if (IsCompositeFilter(item)) {
      const group = SanitizeUserFilter(item, entity);
      if (group) filters.push(group);
    } else if (IsSimpleFilter(item)) {
      const rule = sanitizeRule(item, entity);
      if (rule) filters.push(rule);
    }
  }
  return filters.length > 0 ? { logic: filter.logic === 'or' ? 'or' : 'and', filters } : null;
}

function sanitizeRule(rule: FilterDescriptor, entity: EntityInfo): FilterDescriptor | null {
  const field = findField(entity, rule.field);
  if (!field) return null;
  if (!OperatorRequiresValue(rule.operator)) {
    return { field: field.Name, operator: rule.operator, value: null };
  }
  const value = sanitizeValue(rule.value, field);
  return value === null ? null : { field: field.Name, operator: rule.operator, value };
}

function sanitizeValue(value: unknown, field: EntityFieldInfo): string | number | boolean | null {
  if (value === null || value === undefined || value === '') return null;
  if (field.TSType === EntityFieldTSType.Boolean) {
    return value === true || String(value).trim().toLowerCase() === 'true';
  }
  if (!field.NeedsQuotes) {
    const num = typeof value === 'number' ? value : Number(String(value).trim());
    return Number.isFinite(num) ? num : null;
  }
  const text = value instanceof Date ? value.toISOString() : String(value);
  return EscapeSQLString(text);
}

function findField(entity: EntityInfo, name: string | undefined): EntityFieldInfo | undefined {
  if (!name) return undefined;
  const lower = name.trim().toLowerCase();
  return entity.Fields.find(f => f.Name.toLowerCase() === lower);
}

/**
 * Compiles a user filter to a WHERE fragment with the compiler saved views use. Returns `''` when
 * the filter has no usable condition.
 */
export function BuildUserFilterWhereClause(
  filter: CompositeFilterDescriptor | null | undefined,
  entity: EntityInfo
): string {
  const safe = SanitizeUserFilter(filter, entity);
  if (!safe) return '';
  return MJUserViewEntityExtended.GenerateWhereClauseFromFilterState(
    safe as unknown as Record<string, unknown>,
    entity
  ).trim();
}

/**
 * Combines the host's filter with the user's, never replacing the host's: `(host) AND (user)`.
 */
export function ComposeExtraFilter(hostFilter: string | null | undefined, userFilter: string | null | undefined): string | undefined {
  const host = hostFilter?.trim();
  const user = userFilter?.trim();
  if (host && user) return `(${host}) AND (${user})`;
  return host || user || undefined;
}

/**
 * One `mj-applied-filters` chip per top-level condition of a user filter. A nested group shows as one chip.
 * The chip key is the condition's index, for {@link RemoveTopLevelCondition}.
 */
export function UserFilterChips(
  filter: CompositeFilterDescriptor | null | undefined,
  fields: FilterFieldInfo[]
): AppliedFilter[] {
  if (!filter?.filters?.length) return [];
  return filter.filters.map((item, index) => {
    if (IsCompositeFilter(item)) {
      return { key: String(index), label: 'Group', value: `${item.filters.length} conditions (${item.logic.toUpperCase()})` };
    }
    const info = fields.find(f => f.name.toLowerCase() === item.field?.toLowerCase());
    const operator = info ? (GetOperatorInfo(item.operator, info.type)?.label ?? item.operator) : item.operator;
    const value = OperatorRequiresValue(item.operator) ? ` ${String(item.value ?? '')}` : '';
    return { key: String(index), label: info?.displayName ?? item.field, value: `${operator}${value}` };
  });
}

/**
 * The filter without its top-level condition at `index`; `null` when nothing is left.
 */
export function RemoveTopLevelCondition(
  filter: CompositeFilterDescriptor | null | undefined,
  index: number
): CompositeFilterDescriptor | null {
  if (!filter?.filters?.length) return null;
  const filters = filter.filters.filter((_, i) => i !== index);
  return filters.length > 0 ? { logic: filter.logic, filters } : null;
}
