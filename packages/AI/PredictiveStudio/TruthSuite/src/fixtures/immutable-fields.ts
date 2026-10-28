/**
 * Declares which test-schema fields are immutable after creation (`MJ: Entity Fields.AllowUpdateAPI = false`), the
 * metadata the As-of Feature Assembly reads as "may be read directly". Fields not listed stay updatable, so the
 * assembly must replay them from Record Changes (PersonStatusNow on W4 is the planted example).
 *
 * A declaration whose table carries no dataset prefix (`MembershipYear`, `Person`) describes the synthetic worlds'
 * tables: it applies to every `W<n>_<table>` table as well as to the bare name. A prefixed declaration (`C1…`,
 * `Scn_…`, `W<n>_…`) applies to its own table only.
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
  // The planted scenarios the unit gates train on are loaded once and never edited: every column except the key.
  { BaseTable: 'Scn_T3', Fields: ['EntityKey', 'T', 'LagTarget', 'SamePeriodTarget', 'Target', 'TruthScore'] },
  { BaseTable: 'Scn_R3', Fields: ['EntityKey', 'T', 'PastEventsZ', 'Member', 'DistanceZ', 'Target', 'TruthScore'] },
];

/** The dataset prefixes a test-schema table name can carry. */
const DATASET_PREFIX = /^(W\d+_|C1|Scn_)/;

/** Applies `TRUTH_IMMUTABLE_FIELDS` to the provisioned pstruth entities' field metadata. */
export class ImmutableFieldDeclarations {
  /** True when `decl` covers the table `baseTable`: the same name, or (for an unprefixed declaration) `W<n>_` + its name. */
  public static AppliesTo(decl: ImmutableFieldDeclaration, baseTable: string): boolean {
    if (baseTable === decl.BaseTable) return true;
    if (DATASET_PREFIX.test(decl.BaseTable)) return false;
    const world = /^W\d+_(.+)$/.exec(baseTable);
    return world !== null && world[1] === decl.BaseTable;
  }

  /**
   * Set AllowUpdateAPI = false on the declared pstruth fields; returns how many fields changed. MJAPI must restart after.
   * One RunView reads every declared field of every provisioned table (no read per table); the saves run in parallel
   * and each result is checked.
   */
  public static async Apply(provider: IMetadataProvider, user: UserInfo, schema: string = 'pstruth'): Promise<number> {
    const declared = new Map<string, ReadonlySet<string>>();   // entity ID (lower-case) → declared field names
    // A table no declaration covers is not provisioned here, or keeps every field updatable.
    for (const entity of provider.Entities.filter((e) => e.SchemaName === schema)) {
      const fields = TRUTH_IMMUTABLE_FIELDS.filter((d) => ImmutableFieldDeclarations.AppliesTo(d, entity.BaseTable)).flatMap((d) => d.Fields);
      if (fields.length > 0) declared.set(NormalizeUUID(entity.ID), new Set(fields));
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
