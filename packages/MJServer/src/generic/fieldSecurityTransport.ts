import {
  EntityInfo,
  Metadata,
  ProjectEntityValueRowsForUser,
  ProjectEntityValuesForUser,
  RecordChangeMetadataSource,
  UserInfo,
} from '@memberjunction/core';

/**
 * The members of an entity object the output projection reads. `BaseEntity` satisfies it; so does
 * any test double that carries an `EntityInfo` and a `GetAll()`.
 */
export interface ProjectableEntityObject {
  readonly EntityInfo?: EntityInfo | null;
  GetAll(): Record<string, unknown>;
}

/**
 * Field values of `entity`, reduced to what `user` may READ, for a transport that sends them to
 * that user.
 *
 * An entity object built for a restricted user already holds no denied value, so for those this
 * is a no-op returning the `GetAll()` copy unchanged. It is the backstop for objects that were not
 * built for the recipient: a system-identity load, an object a long-running process shares across
 * callers, or one built before its user was known.
 *
 * @param provider Metadata source for the Record Changes payload projection. Defaults to the
 *   global provider, which is only consulted when the entity is `MJ: Record Changes`.
 */
export function ProjectEntityObjectForCaller(
  entity: ProjectableEntityObject,
  user: UserInfo | null | undefined,
  provider?: RecordChangeMetadataSource
): Record<string, unknown> {
  const values = entity.GetAll(); // fls-guard: projected on the next line
  return ProjectEntityValuesForUser(provider ?? new Metadata(), entity.EntityInfo, values, user) ?? values;
}

/**
 * Plain field values of `entityInfo`, reduced to what `user` may READ. See
 * {@link ProjectEntityObjectForCaller}; this is the form for values that are already plain objects.
 */
export function ProjectValuesForCaller<T extends object>(
  entityInfo: EntityInfo | null | undefined,
  values: T,
  user: UserInfo | null | undefined,
  provider?: RecordChangeMetadataSource
): T {
  return ProjectEntityValuesForUser(provider ?? new Metadata(), entityInfo, values, user) ?? values;
}

/** Array form of {@link ProjectValuesForCaller}: the denied set is computed once for the whole set. */
export function ProjectRowsForCaller<T extends object>(
  entityInfo: EntityInfo | null | undefined,
  rows: T[],
  user: UserInfo | null | undefined,
  provider?: RecordChangeMetadataSource
): T[] {
  return ProjectEntityValueRowsForUser(provider ?? new Metadata(), entityInfo, rows, user) ?? rows;
}
