/**
 * @module registry/stored-row-reads
 *
 * Every read of a stored row that a registry decision rests on — the lifecycle gate's reads under its locks, the
 * publish ledger's idempotency reads, the monitoring jobs it changes, the evidence it freezes, and the PreSave guards'
 * reads of the persisted row — goes past the RunView cache (`BypassCache`). The server trusts its cache completely and
 * keeps it fresh from entity events, so a row changed by anything that is not an entity save on this server (a direct
 * SQL write, a data migration, another server's write before its invalidation arrives) would otherwise be decided on
 * from a stale copy; under the gate's row locks that would make the locks pointless, because the decision would not
 * be about the rows they lock. Measured by the M3.6 adversarial harness: after a run row's `EvaluationProtocolID` was
 * changed by SQL, a cached read still returned the old value and the publish went through on it.
 */
import { RunView, type RunViewParams, type RunViewResult } from '@memberjunction/core';

import type { RegistryContext } from './registry-context';

/** The registry's reads of stored rows, always from the database. */
export class StoredRowReads {
  /**
   * `RunView` on `ctx.Provider` as `ctx.ContextUser` with `BypassCache` set, whatever `params` says.
   *
   * @returns the provider's result (a failed read is `Success: false`, never thrown, as `RunView`)
   */
  public static async Run<T>(params: RunViewParams, ctx: RegistryContext): Promise<RunViewResult<T>> {
    return RunView.FromMetadataProvider(ctx.Provider).RunView<T>({ ...params, BypassCache: true }, ctx.ContextUser);
  }
}
