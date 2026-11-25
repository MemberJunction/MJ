/**
 * @module migration
 *
 * The legacy-pipeline data migration (version-1 Prediction Units and Evaluation Protocols for pipelines that predate
 * them, or an archive or hold with the reason), and the pre-change model migration the Registry Check job runs
 * (§5.6: models registered before the lifecycle gate re-verified, their artifacts checked, their schedules handled and
 * their pipelines re-evaluated).
 */
export * from './legacy-pipeline-migration';
export * from './pre-change-artifacts';
export * from './pre-gate-model-migration';
