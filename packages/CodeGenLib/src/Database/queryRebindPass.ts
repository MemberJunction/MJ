import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { NormalizeUUID } from '@memberjunction/global';
import { UserCache } from '@memberjunction/generic-database-provider';
import {
   FormatQueryRefreshRun,
   IsQueryRefreshProvider,
   RebindQueriesForChangedEntities,
} from '@memberjunction/core-entities-server';
import type { QueryRebindResult } from '@memberjunction/core-entities-server';
import { ManageMetadataBase } from './manage-metadata';
import { logError, LogWarning, StartSpinner, SucceedSpinner, WarnSpinner } from '../Misc/status_logging';

/**
 * CodeGen's query re-bind pass, run after the field sync: the saved queries that read an entity
 * whose fields were added, dropped or changed in type or nullability during this run are
 * refreshed (no description pass), so their fields follow the schema. The SQL is never edited:
 * a query the change broke is recorded with status `Error` and the database server's message.
 * Runs as the System user (the run's user when there is none). Prints a summary (a warning when a
 * query broke or drifted), and never fails the run.
 *
 * @returns What the pass did; `null` when no entity's fields changed shape or the pass could not run.
 */
export async function RunQueryRebindPass(provider: IMetadataProvider, currentUser: UserInfo): Promise<QueryRebindResult | null> {
   const entityIDs = ChangedEntityIDs(provider);
   if (entityIDs.length === 0) return null;
   if (!IsQueryRefreshProvider(provider)) {
      LogWarning('Query re-bind skipped: the CodeGen provider cannot run views.');
      return null;
   }
   StartSpinner('Re-binding saved queries that read changed entities...');
   try {
      const user = UserCache.Instance?.GetSystemUser?.() ?? currentUser;
      const result = await RebindQueriesForChangedEntities({ Provider: provider, User: user }, entityIDs);
      const summary = QueryRebindSummaryLines(result).join('\n');
      if (QueryRebindNeedsAttention(result)) WarnSpinner(summary);
      else SucceedSpinner(summary);
      return result;
   } catch (e) {
      WarnSpinner('Query re-bind did not complete');
      logError(`Query re-bind failed: ${e instanceof Error ? e.message : String(e)}`);
      return null;
   }
}

/** The IDs of the entities this run changed the fields of, from the IDs and names CodeGen recorded. */
export function ChangedEntityIDs(provider: IMetadataProvider): string[] {
   const changed = ManageMetadataBase.FieldShapeChangedEntities;
   const ids = new Set(changed.IDs.map(NormalizeUUID));
   const names = new Set(changed.Names.map(n => n.toLowerCase()));
   for (const entity of provider.Entities) {
      if (names.has(entity.Name.toLowerCase())) ids.add(NormalizeUUID(entity.ID));
   }
   return [...ids];
}

/** Whether a re-bind left a query broken, failed, or warned about definer's-rights drift. */
export function QueryRebindNeedsAttention(result: QueryRebindResult): boolean {
   return result.Drift.length > 0 || result.Run.Reports.some(r => r.Outcome === 'Failed' || r.ExtractionStatus === 'Error');
}

/** The summary the pass prints: the queries that changed or have diagnostics, the drift warnings, one total line. */
export function QueryRebindSummaryLines(result: QueryRebindResult): string[] {
   const lines = [`Query re-bind: ${result.EntityCount} entities changed shape; ${result.Run.Reports.length} saved queries read them.`];
   if (result.Run.Reports.length === 0) return lines;
   lines.push(...FormatQueryRefreshRun(result.Run, true).map(l => `   ${l}`));
   for (const drift of result.Drift) {
      lines.push(`   WARNING "${drift.QueryName}" (${drift.QueryID}) runs with definer's rights and gained field-restricted columns: ${drift.Fields.join(', ')}`);
   }
   return lines;
}
