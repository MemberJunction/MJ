import type { RunViewParams, RunViewResult } from '@memberjunction/core';

/** The columns of an `MJ: Feature Values` row a drift read selects on; the rest pass through. */
export interface FeatureValueDoubleRow {
  readonly RecordProcessID?: string | null;
  readonly MLModelID?: string | null;
  readonly Source?: string | null;
  readonly Role?: string | null;
  readonly FeatureName?: string | null;
  readonly RecordID?: string | null;
  readonly ComputedAt: Date | string;
  readonly [column: string]: unknown;
}

/**
 * Answers one drift read of `MJ: Feature Values` the way the database would: applies the `RecordProcessID` /
 * `MLModelID` target, `Source = 'Pipeline'`, `Role = '…'`, `FeatureName = '…'`, `RecordID IN (…)`, and the
 * `ComputedAt >=` / `ComputedAt <` bounds of `ExtraFilter`, then the `ComputedAt` order and `MaxRows`.
 */
export function RunFeatureValueView(rows: readonly FeatureValueDoubleRow[], view: RunViewParams): RunViewResult {
  const filter = String(view.ExtraFilter ?? '');
  const recordProcessID = /RecordProcessID = '([^']+)'/.exec(filter)?.[1];
  const mlModelID = /MLModelID = '([^']+)'/.exec(filter)?.[1];
  const from = /ComputedAt >= '([^']+)'/.exec(filter)?.[1];
  const before = /ComputedAt < '([^']+)'/.exec(filter)?.[1];
  const pipelineOnly = filter.includes("Source = 'Pipeline'");
  const role = /Role = '([^']+)'/.exec(filter)?.[1];
  const featureName = /FeatureName = '([^']+)'/.exec(filter)?.[1];
  const idList = /RecordID IN \(([^)]*)\)/.exec(filter)?.[1];
  const recordIDs = idList === undefined ? undefined : new Set([...idList.matchAll(/'([^']*)'/g)].map((m) => m[1]));
  const at = (r: FeatureValueDoubleRow): number => new Date(r.ComputedAt).getTime();
  const newestFirst = typeof view.OrderBy === 'string' && view.OrderBy.includes('ComputedAt DESC');

  const results = rows
    .filter(
      (r) =>
        (!recordProcessID || r.RecordProcessID === recordProcessID) &&
        (!mlModelID || r.MLModelID === mlModelID) &&
        (!pipelineOnly || (r.Source ?? 'Pipeline') === 'Pipeline') &&
        (!role || (r.Role ?? 'Champion') === role) &&
        (!featureName || r.FeatureName === featureName) &&
        (!recordIDs || recordIDs.has(String(r.RecordID))) &&
        (!from || at(r) >= Date.parse(from)) &&
        (!before || at(r) < Date.parse(before)),
    )
    .sort((a, b) => (newestFirst ? at(b) - at(a) : at(a) - at(b)))
    .slice(0, typeof view.MaxRows === 'number' && view.MaxRows > 0 ? view.MaxRows : undefined);
  return { Success: true, Results: results, RowCount: results.length, TotalRowCount: results.length, ExecutionTime: 1, ErrorMessage: '' };
}
