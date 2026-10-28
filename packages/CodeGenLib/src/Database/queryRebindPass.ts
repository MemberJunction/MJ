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
import { LogWarning, StartSpinner, SucceedSpinner, WarnSpinner } from '../Misc/status_logging';

/** What the re-bind pass did, and the warnings CodeGen repeats in its final summary. */
export interface QueryRebindPassOutcome {
   /** The re-bind's result; `null` when no entity's fields changed shape or the pass did not complete. */
   readonly Result: QueryRebindResult | null;
   /** The lines naming each query the pass could not refresh, why, and how to retry; empty when none. */
   readonly Warnings: readonly string[];
}

/**
 * CodeGen's query re-bind pass, run after the field sync: the saved queries that read an entity
 * whose fields were added, dropped or changed in type or nullability during this run are
 * refreshed (no description pass), so their fields follow the schema. The SQL is never edited:
 * a query the change broke is recorded with status `Error` and the database server's message.
 * Runs as the System user (the run's user when there is none). Prints a summary (a warning when a
 * query broke or drifted).
 *
 * It never fails the run and never throws: a pass that cannot complete, and every query it could
 * not refresh, become {@link QueryRebindPassOutcome.Warnings}, which name the queries (or the
 * changed entities), the reason, and the `mj query refresh` command that retries them.
 *
 * @param prepare Work the pass needs first (CodeGen's metadata refresh); its failure is the pass's.
 */
export async function RunQueryRebindPass(
   provider: IMetadataProvider,
   currentUser: UserInfo,
   prepare?: () => Promise<void>,
): Promise<QueryRebindPassOutcome> {
   try {
      await prepare?.();
   } catch (e) {
      return passNotCompleted(provider, e);
   }
   const entityIDs = ChangedEntityIDs(provider);
   if (entityIDs.length === 0) return { Result: null, Warnings: [] };
   if (!IsQueryRefreshProvider(provider)) {
      LogWarning('Query re-bind skipped: the CodeGen provider cannot run views.');
      return { Result: null, Warnings: [] };
   }
   StartSpinner('Re-binding saved queries that read changed entities...');
   try {
      const user = UserCache.Instance?.GetSystemUser?.() ?? currentUser;
      const result = await RebindQueriesForChangedEntities({ Provider: provider, User: user }, entityIDs);
      const summary = QueryRebindSummaryLines(result).join('\n');
      if (QueryRebindNeedsAttention(result)) WarnSpinner(summary);
      else SucceedSpinner(summary);
      const warnings = QueryRebindFailureLines(result);
      if (warnings.length > 0) LogWarning(warnings.join('\n'));
      return { Result: result, Warnings: warnings };
   } catch (e) {
      return passNotCompleted(provider, e);
   }
}

/** The outcome of a pass that could not complete: a warning with the reason and the retry command. */
function passNotCompleted(provider: IMetadataProvider, error: unknown): QueryRebindPassOutcome {
   const warnings = QueryRebindNotCompletedLines(provider, error instanceof Error ? error.message : String(error));
   WarnSpinner(warnings.join('\n'));
   return { Result: null, Warnings: warnings };
}

/** The warning for a pass that did not complete: why, and how to refresh the changed entities' queries. */
export function QueryRebindNotCompletedLines(provider: IMetadataProvider, reason: string): string[] {
   const ids = new Set(ChangedEntityIDs(provider));
   const names = provider.Entities.filter(e => ids.has(NormalizeUUID(e.ID))).map(e => e.Name);
   const retry = names.length > 0 ? names.map(n => `--entity "${n}"`).join(' ') : '--all';
   return [
      `WARNING Query re-bind did not complete (CodeGen continues): ${reason}`,
      `   The saved queries that read the changed entities were not refreshed. Retry with: mj query refresh ${retry}`,
   ];
}

/** The queries a re-bind could not refresh: the refresh failed, or it recorded an extraction error. */
export function QueryRebindFailures(result: QueryRebindResult): QueryRebindResult['Run']['Reports'] {
   return result.Run.Reports.filter(r => r.Outcome === 'Failed' || r.ExtractionStatus === 'Error');
}

/** The warning naming each query a re-bind could not refresh, why (the server's message), and how to retry. */
export function QueryRebindFailureLines(result: QueryRebindResult): string[] {
   const failed = QueryRebindFailures(result);
   if (failed.length === 0) return [];
   const noun = failed.length === 1 ? 'query' : 'queries';
   return [
      `WARNING Query re-bind: ${failed.length} saved ${noun} could not be refreshed (CodeGen continues):`,
      ...failed.map(r => `   "${r.QueryName}" (${r.QueryID}): ${r.Diagnostics.join(' ') || 'no reason was reported'}`),
      `   Retry once the cause is fixed: mj query refresh ${failed.map(r => `--id ${r.QueryID}`).join(' ')} (or --name "<query name>")`,
   ];
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
   return result.Drift.length > 0 || QueryRebindFailures(result).length > 0;
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
