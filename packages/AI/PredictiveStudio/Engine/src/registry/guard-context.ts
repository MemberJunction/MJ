/**
 * @module registry/guard-context
 *
 * What the registry's `PreSave` guards read with: the entity's own provider (so a save inside the gate's transaction is
 * checked against the rows that transaction sees) narrowed to a metadata provider, and the saving user. Reads go
 * through {@link StoredRowReads} (past the RunView cache: the guards check the database's state, never a cached copy)
 * and fail loudly, so a failed read is never mistaken for an absent row; the guards turn both into a closed refusal.
 */
import type { IEntityDataProvider, IMetadataProvider, UserInfo } from '@memberjunction/core';
import { EscapeSQLString, IsValidUUID, UUIDsEqual } from '@memberjunction/global';

import type { RegistryContext } from './registry-context';
import { StoredRowReads } from './stored-row-reads';

/** The MJ core entities the guards read by ID; each has the single-column key `ID`. */
export type GuardedEntityName =
  | 'MJ: ML Models'
  | 'MJ: ML Training Runs'
  | 'MJ: Files'
  | 'MJ: Scheduled Job Runs'
  | 'MJ: Scheduled Jobs'
  | 'MJ: Scheduled Job Types';

/** The guards' read context and their reads of one stored row. */
export class GuardContexts {
  /**
   * True when `p` is also a metadata provider. Every MJ data provider is; a test double may not be. The same narrowing
   * as `VersionedRowGuard.IsMetadataProvider` (`MJMLPredictionUnitEntityServer.server.ts:91`), written here because
   * `@memberjunction/core-entities-server` is not an Engine dependency.
   */
  public static IsMetadataProvider(p: IEntityDataProvider | null | undefined): p is IEntityDataProvider & IMetadataProvider {
    return !!p && 'EntityByName' in p && typeof p.EntityByName === 'function' && 'Entities' in p;
  }

  /**
   * The context a guard reads under for a save of an entity on `provider` by `contextUser`; null when the provider is
   * not a metadata provider or there is no user (the guard then fails closed).
   */
  public static ForSave(provider: IEntityDataProvider | null | undefined, contextUser: UserInfo | undefined): RegistryContext | null {
    if (!GuardContexts.IsMetadataProvider(provider) || contextUser === undefined) return null;
    return { ContextUser: contextUser, Provider: provider };
  }

  /**
   * The stored row of `entityName` with this ID, reading only `fields`; null when there is none or the ID is not a UUID.
   *
   * @throws Error when the read fails (a failed read is not an absent row)
   */
  public static async ReadById<T extends { readonly ID: string }>(entityName: GuardedEntityName, id: string, fields: readonly (keyof T & string)[], ctx: RegistryContext): Promise<T | null> {
    if (!IsValidUUID(id)) return null;
    const r = await StoredRowReads.Run<T>(
      { EntityName: entityName, ExtraFilter: `ID='${EscapeSQLString(id)}'`, Fields: [...fields], MaxRows: 1, ResultType: 'simple' }, // pk-filter-ok: GuardedEntityName admits only MJ core entities keyed by ID
      ctx,
    );
    if (!r.Success) throw new Error(`Reading ${entityName} ${id} failed: ${r.ErrorMessage || 'unknown error'}`);
    const row = r.Results[0];
    return row !== undefined && UUIDsEqual(row.ID, id) ? row : null;
  }
}
