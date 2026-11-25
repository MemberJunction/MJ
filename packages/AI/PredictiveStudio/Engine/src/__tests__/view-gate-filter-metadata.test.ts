/**
 * The Model Predictions View Gate's row-level security filter (D-058) as MJ reads it from its metadata: SQL Server uses
 * `FilterText`, PostgreSQL uses the filter's `PlatformVariants` entry (D4-292), which quotes every identifier — the
 * unquoted T-SQL text would fold `Source`, `MLModelScoringBindingID` and `__mj.MLModelScoringBinding` to lower case
 * and fail every non-system read of `MJ: Feature Values` and `MJ: Latest Feature Values` on PostgreSQL.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { RowLevelSecurityFilterInfo } from '@memberjunction/core';

/** The filter record's fields as `metadata/row-level-security-filters/.model-predictions-view-gate.json` holds them. */
interface ViewGateFilterFields {
  Name: string;
  FilterText: string;
  PlatformVariants: string;
}

function viewGateFilter(): RowLevelSecurityFilterInfo {
  const path = new URL('../../../../../../metadata/row-level-security-filters/.model-predictions-view-gate.json', import.meta.url);
  const records: Array<{ fields: ViewGateFilterFields }> = JSON.parse(readFileSync(path, 'utf8'));
  return new RowLevelSecurityFilterInfo(records[0].fields);
}

describe('Model Predictions View Gate — the filter text each platform reads', () => {
  it('SQL Server reads the T-SQL FilterText', () => {
    const filter = viewGateFilter();
    expect(filter.GetPlatformFilterText('sqlserver')).toBe(filter.FilterText);
  });

  it('PostgreSQL reads a variant with every identifier quoted and the same predicate', () => {
    const pg = viewGateFilter().GetPlatformFilterText('postgresql');
    expect(pg).toBe(
      `"Source" <> 'Model' OR "MLModelScoringBindingID" IN (SELECT b."ID" FROM "__mj"."MLModelScoringBinding" b ` +
        `JOIN "__mj"."vwUserHeldAuthorizations" a ON a."AuthorizationID" = b."ViewAuthorizationID" WHERE a."UserID" = '{{UserID}}')`,
    );
  });
});
