export {
    MaterializationRefresher,
    MATERIALIZATION_SURROGATE_COLUMN,
    FULL_REBUILD_EVERY_N_INCREMENTAL_REFRESHES,
    WATERMARK_SAFETY_OVERLAP_MS,
    type ISQLExecutor,
    type MaterializationRefreshResult,
} from './MaterializationRefresher';
export {
    MaterializationFreshness,
    analyzeMixedFreshness,
    type EntityFreshness,
    type MixedFreshnessReport,
    type PlannedEntityRead,
} from './MaterializationFreshness';
