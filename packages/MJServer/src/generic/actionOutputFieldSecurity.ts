import { BaseEntity, EntityInfo, RecordChangeMetadataSource, UserInfo } from '@memberjunction/core';
import type { ActionParam } from '@memberjunction/actions-base';
import { ProjectEntityObjectForCaller, ProjectValuesForCaller } from './fieldSecurityTransport.js';

/**
 * The parameters of an entity action that carry a plain copy of the bound record's field values
 * (the `'Entity Object Data'` value type), and the entity those values belong to.
 */
export interface EntityObjectDataBinding {
  EntityInfo: EntityInfo;
  /** Parameter names, lowercased and trimmed. */
  ParamNames: ReadonlySet<string>;
}

/**
 * Action parameters as they may be sent back to `user`, with every value whose entity is KNOWN
 * projected to the fields `user` may read:
 *
 * - an entity object (or an array holding them) becomes its projected field values, as an entity
 *   object is serialized by its internal state otherwise;
 * - a parameter named in `binding` holds the bound record's values, projected for its entity.
 *
 * Any other value is returned as it is: without knowing which entity a plain object belongs to,
 * removing keys from it would be a guess. Returns the original array when nothing changed.
 */
export function ProjectActionParamsForCaller(
  params: ActionParam[] | null | undefined,
  user: UserInfo | null | undefined,
  provider?: RecordChangeMetadataSource,
  binding?: EntityObjectDataBinding
): ActionParam[] | null | undefined {
  if (!params?.length) {
    return params;
  }
  const projected = params.map((p) => projectParam(p, user, provider, binding));
  return projected.some((p, i) => p !== params[i]) ? projected : params;
}

function projectParam(
  param: ActionParam,
  user: UserInfo | null | undefined,
  provider: RecordChangeMetadataSource | undefined,
  binding: EntityObjectDataBinding | undefined
): ActionParam {
  const value: unknown = param?.Value;
  if (value instanceof BaseEntity) {
    return { ...param, Value: ProjectEntityObjectForCaller(value, user, provider) };
  }
  if (Array.isArray(value) && value.some((item) => item instanceof BaseEntity)) {
    const items = value.map((item: unknown) => (item instanceof BaseEntity ? ProjectEntityObjectForCaller(item, user, provider) : item));
    return { ...param, Value: items };
  }
  if (binding && isPlainRecord(value) && binding.ParamNames.has(String(param.Name ?? '').trim().toLowerCase())) {
    return { ...param, Value: ProjectValuesForCaller(binding.EntityInfo, value, user, provider) };
  }
  return param;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}
