/**
 * @fileoverview Normalizing what a component passes to `OpenEntityRecord` into a usable record key.
 * @module @memberjunction/react-runtime/utilities
 *
 * ## Why this is not the host's job
 *
 * `callbacks.OpenEntityRecord(entityName, key)` is part of the component contract, and components
 * are loose about the second argument in two ways that every host then has to absorb identically:
 *
 * 1. **Shape.** It may already be a `CompositeKey`, or an array of `KeyValuePair`, or a bare
 *    `{ FieldName, Value }` object.
 * 2. **Which fields.** A component frequently knows a record by something that is *not* its primary
 *    key — an email, a code, an external id — because that is what its query returned.
 *
 * Getting (2) right means looking up the entity, checking each supplied field against
 * `IsPrimaryKey`, and running a view to translate when it is not. A host that skips it opens the
 * wrong record or nothing at all; a host that reimplements it gets a subtly different answer. Both
 * happened: the Angular bridge did the full resolution inline, and the React Native app read
 * `key.GetValueByIndex(0)` and hoped.
 *
 * So the resolution lives here, next to the contract it serves, and hosts keep only the part that is
 * genuinely theirs — what "open" means on their surface.
 */

import {
  CompositeKey,
  IMetadataProvider,
  KeyValuePair,
  RunView,
  UserInfo,
} from '@memberjunction/core';

/**
 * The shapes a component may pass as the `key` argument to `OpenEntityRecord`.
 *
 * Deliberately wide: this is an input boundary, and narrowing it would only move the problem into
 * every caller.
 */
export type EntityRecordKeyInput =
  | CompositeKey
  | KeyValuePair[]
  | { FieldName: string; Value: unknown }
  | null
  | undefined;

/**
 * Coerces the accepted input shapes into a `CompositeKey`, without resolving anything.
 *
 * @param key Whatever the component passed.
 */
function coerceToCompositeKey(key: EntityRecordKeyInput): CompositeKey | null {
  if (!key) {
    return null;
  }
  if (Array.isArray(key)) {
    return key.length > 0 ? CompositeKey.FromKeyValuePairs(key) : null;
  }
  // A real CompositeKey identifies itself by behaviour rather than by `instanceof`, which fails
  // across the module duplication bundlers routinely produce.
  if (typeof (key as CompositeKey).GetValueByFieldName === 'function') {
    return key as CompositeKey;
  }
  const pair = key as { FieldName?: string; Value?: unknown };
  if (pair.FieldName !== undefined && pair.Value !== undefined) {
    return CompositeKey.FromKeyValuePairs([pair as KeyValuePair]);
  }
  return null;
}

/**
 * Resolves whatever a component passed into the record's actual primary key.
 *
 * When every supplied field is already part of the primary key the input is returned as-is. When
 * one is not — the component knew the record by an email or a code — a view runs to translate it
 * into the primary key, because the caller's "open this record" cannot be honoured with a key that
 * does not address it.
 *
 * Returns `null` rather than throwing when the request cannot be honoured: an unknown entity, an
 * unparseable key, a field the entity does not have, or a lookup that matched nothing. Opening a
 * record is a navigation, and a navigation that cannot be resolved should decline, not crash the
 * component that asked.
 *
 * @param entityName The entity the component wants opened.
 * @param key The key it supplied, in any accepted shape.
 * @param provider The provider to read metadata and run the lookup through — the caller's, never
 *   the global default, so a host on a non-default provider resolves against its own server.
 * @param contextUser The acting user, for server-side callers.
 */
export async function resolveEntityRecordKey(
  entityName: string,
  key: EntityRecordKeyInput,
  provider: IMetadataProvider,
  contextUser?: UserInfo
): Promise<CompositeKey | null> {
  const supplied = coerceToCompositeKey(key);
  if (!supplied) {
    return null;
  }

  const entity = provider.EntityByName(entityName);
  if (!entity) {
    console.warn(`OpenEntityRecord: entity not found: ${entityName}`);
    return null;
  }

  let needsLookup = false;
  for (const single of supplied.KeyValuePairs) {
    const field = entity.Fields.find(
      (f) => f.Name.trim().toLowerCase() === single.FieldName.trim().toLowerCase()
    );
    if (!field) {
      // The component named a field this entity does not have — nothing can be opened from it.
      console.warn(`OpenEntityRecord: non-matching field for key ${JSON.stringify(supplied)}`);
      return null;
    }
    if (!field.IsPrimaryKey) {
      needsLookup = true;
      break;
    }
  }

  if (!needsLookup) {
    return supplied;
  }

  const rv = RunView.FromMetadataProvider(provider);
  const result = await rv.RunView(
    {
      EntityName: entityName,
      ExtraFilter: supplied.ToWhereClause(),
    },
    contextUser
  );
  if (!result?.Success || result.Results.length === 0) {
    return null;
  }

  const row = result.Results[0] as Record<string, unknown>;
  return CompositeKey.FromKeyValuePairs(
    entity.PrimaryKeys.map((pk) => ({ FieldName: pk.Name, Value: row[pk.Name] }) as KeyValuePair)
  );
}
