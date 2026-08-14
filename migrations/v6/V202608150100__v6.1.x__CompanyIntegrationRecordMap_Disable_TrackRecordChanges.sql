/*******************************************************************************
 * Turns OFF change tracking for MJ: Company Integration Record Maps.
 *
 * CompanyIntegrationRecordMap is the highest-volume table the integration sync
 * path writes: one row per external record it has ever mapped, re-touched on
 * every sync. Its run-log siblings (Company Integration Runs, Run Details, Run
 * API Logs) already ship with TrackRecordChanges = 0; this one did not, so every
 * mapping upsert also wrote a RecordChange row, doubling the write volume of a
 * sync. (Entity Maps, Field Maps, Sync Watermarks and Company Integrations are
 * also still at 1 -- they are low-volume configuration, edited by operators, and
 * their history IS worth keeping. This migration deliberately touches only the
 * per-external-record table.)
 *
 * Nothing reads that history: the mapping row IS the current state, its prior
 * ExternalSystemRecordID has no diagnostic value, and the durable per-run
 * artifact stream (IntegrationTailRunEvents) is what operators actually use to
 * audit a sync. So the change history is pure write amplification.
 *
 * TrackRecordChanges only gates RecordChange emission (see
 * DatabaseProviderBase.ShouldTrackRecordChanges). The __mj_CreatedAt /
 * __mj_UpdatedAt columns are maintained by trgUpdateCompanyIntegrationRecordMap,
 * a DB trigger that is independent of this flag, so per-row timestamps are
 * unaffected. Existing RecordChange rows are intentionally left in place --
 * this migration stops new ones, it does not delete history.
 *
 * Platform-neutral: this is entity metadata, not per-platform DDL.
 ******************************************************************************/

UPDATE ${flyway:defaultSchema}.Entity
SET TrackRecordChanges = 0
WHERE ID = '16248F34-2837-EF11-86D4-6045BDEE16E6';  -- MJ: Company Integration Record Maps
GO
