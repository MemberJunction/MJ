/**
 * The DriverClass keys the Predictive Studio Actions register under. They live apart from the action classes so a
 * module that only needs a key (the per-model scoring-action generator, metadata lookups) does not import an action
 * module and form an import cycle with it.
 */
export const RUN_EXPERIMENT_DRIVER_CLASS = 'PredictiveStudioRunExperimentAction';
export const PROMOTE_MODEL_DRIVER_CLASS = 'PredictiveStudioPromoteModelAction';
export const TRAIN_MODEL_DRIVER_CLASS = 'PredictiveStudioTrainModelAction';
export const SCHEDULE_MODEL_SCORING_DRIVER_CLASS = 'PredictiveStudioScheduleModelScoringAction';
export const SCORE_RECORD_SET_DRIVER_CLASS = 'PredictiveStudioScoreRecordSetAction';
