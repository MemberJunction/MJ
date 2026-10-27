/**
 * Declares which test-schema fields are immutable after creation (`MJ: Entity Fields.AllowUpdateAPI = false`), the
 * metadata the As-of Feature Assembly reads as "may be read directly". Fields not listed stay updatable, so the
 * assembly must replay them from Record Changes (PersonStatusNow on W4 is the planted example).
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, NormalizeUUID } from '@memberjunction/global';
import type { MJEntityFieldEntity } from '@memberjunction/core-entities';

export interface ImmutableFieldDeclaration { readonly BaseTable: string; readonly Fields: readonly string[] }

export const TRUTH_IMMUTABLE_FIELDS: readonly ImmutableFieldDeclaration[] = [
  { BaseTable: 'C1Person', Fields: ['JoinDate', 'Segment', 'Region'] },
  { BaseTable: 'C1OrderHeader', Fields: ['PersonID', 'OrderDate', 'Status', 'OrderType', 'ReversesOrderID', 'ReversedOn'] },
  { BaseTable: 'C1DuesPeriod', Fields: ['PersonID', 'PeriodIndex', 'OrderDate', 'TierSKU', 'OrderID'] },
  { BaseTable: 'C1NonduesLine', Fields: ['PersonID', 'OrderID', 'OrderDate', 'LineTotalNet', 'ReversedOn'] },
  { BaseTable: 'C1EventAttendance', Fields: ['PersonID', 'EventDate'] },
  { BaseTable: 'C1CourseCompletion', Fields: ['PersonID', 'CompletedOn'] },
  { BaseTable: 'C1Certification', Fields: ['PersonID', 'AwardedOn', 'ExpiresOn'] },
  { BaseTable: 'C1CommitteeMembership', Fields: ['PersonID', 'StartDate', 'EndDate'] },
  { BaseTable: 'MembershipYear', Fields: ['PersonID', 'Year', 'StartDate', 'Plan', 'EventsAttended', 'IncomeK', 'AutoRenew', 'Region', 'PostalCode', 'MemberNumber', 'Noise1', 'Noise2', 'Noise3', 'Noise4', 'Noise5', 'Renewed', 'Status', 'WorldID', 'Seed'] },
  { BaseTable: 'Person', Fields: ['MemberNumber', 'Region', 'PostalCode', 'IncomeK', 'AutoRenew', 'WorldID', 'Seed'] },
];

/** Applies `TRUTH_IMMUTABLE_FIELDS` to the provisioned pstruth entities' field metadata. */
export class ImmutableFieldDeclarations {
  /**
   * Set AllowUpdateAPI = false on the declared pstruth fields; returns how many fields changed. MJAPI must restart after.
   * One RunView reads every declared field of every provisioned table (no read per table); the saves run in parallel
   * and each result is checked.
   */
  public static async Apply(provider: IMetadataProvider, user: UserInfo, schema: string = 'pstruth'): Promise<number> {
    const declared = new Map<string, ReadonlySet<string>>();   // entity ID (lower-case) → declared field names
    for (const decl of TRUTH_IMMUTABLE_FIELDS) {
      const entity = provider.Entities.find((e) => e.SchemaName === schema && e.BaseTable === decl.BaseTable);
      if (entity) declared.set(NormalizeUUID(entity.ID), new Set(decl.Fields)); // absent = that dataset is not provisioned here
    }
    if (declared.size === 0) return 0;
    const ids = [...declared.keys()].map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const fields = await RunView.FromMetadataProvider(provider).RunView<MJEntityFieldEntity>(
      { EntityName: 'MJ: Entity Fields', ExtraFilter: `EntityID IN (${ids}) AND AllowUpdateAPI = 1`, ResultType: 'entity_object' }, user);
    if (!fields.Success) throw new Error(`Reading the declared pstruth fields failed: ${fields.ErrorMessage}`);
    const toChange = fields.Results.filter((f) => declared.get(NormalizeUUID(f.EntityID))?.has(f.Name) === true);
    const saved = await Promise.all(toChange.map(async (f) => {
      f.AllowUpdateAPI = false;
      return { f, ok: await f.Save() };
    }));
    const failed = saved.filter((s) => !s.ok);
    if (failed.length > 0) {
      throw new Error(`Saving ${failed.length} field(s) failed: ${failed.map((s) => `${s.f.Entity}.${s.f.Name}: ${s.f.LatestResult?.CompleteMessage || 'unknown error'}`).join('; ')}`);
    }
    return toChange.length;
  }
}
