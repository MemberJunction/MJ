/**
 * Compile-time drift check for the JSONType mirrors (PR 4 Task M1.5). `metadata/entities/JSONType-interfaces/` holds
 * the JSONType sources CodeGen emits inline on `MJMLModelEntity` and `MJMLModelPublishRecordEntity`, and
 * `metadata/remote-operations/types/predictive-studio-promote-model.output.ts` the `PredictiveStudio.PromoteModel` output
 * CodeGen emits into `remote_operations.ts` (its `refusal`, Task M3.4), and the `PredictiveStudio.GetModelEvidence` output
 * and `PredictiveStudio.SignOffModel` input (`predictive-studio-get-model-evidence.output.ts`,
 * `predictive-studio-sign-off-model.input.ts`, Task M4.1), and the `MJ: ML Scoring Runs` columns (`IMLScoringRunJsonTypes.ts`,
 * Task M5.9); each mirrored type must equal its Core type exactly. `jsontype-mirrors.compile.test.ts` compiles this file and expects no diagnostics, so
 * a Core change that is not mirrored (or a mirror edit that drifts) fails the Core test run.
 */
import type * as Models from '../../../../../../../metadata/entities/JSONType-interfaces/IMLModelJsonTypes';
import type * as PublishRecords from '../../../../../../../metadata/entities/JSONType-interfaces/IMLModelPublishRecordJsonTypes';
import type * as PromoteModelOutput from '../../../../../../../metadata/remote-operations/types/predictive-studio-promote-model.output';
import type * as GetModelEvidenceOutput from '../../../../../../../metadata/remote-operations/types/predictive-studio-get-model-evidence.output';
import type * as SignOffModelInput from '../../../../../../../metadata/remote-operations/types/predictive-studio-sign-off-model.input';
import type * as ScoringRuns from '../../../../../../../metadata/entities/JSONType-interfaces/IMLScoringRunJsonTypes';
import type * as MonitoringResults from '../../../../../../../metadata/entities/JSONType-interfaces/IMLMonitoringResultJsonTypes';
import type * as RunModelMonitoringOutput from '../../../../../../../metadata/remote-operations/types/predictive-studio-run-model-monitoring.output';
import type { MetricWithInterval, RetrainTrigger } from '../../evaluation-protocol';
import type { CalibrationReport } from '../../trainer-contract';
import type { DriftLookEntry, MonitoringChallengerOutcome, MonitoringChallengerResult, MonitoringParity, MonitoringRollbackCheck, MonitoringTriggerFired, TrackedMetric } from '../../monitoring-contracts';
import type { CodeVersion, LeakageFlag } from '../../trainer-contract';
import type { OutputSemantics, PublishRecord, RegisteredDeliveryView, TransitionRefusal } from '../../registry-contracts';
import type { Actor } from '../../prediction-unit';
import type { ReadPolicy } from '../../assembly-contract';
import type { EntityRef, ScoringRefusal, ScoringRowError, ScoringScope } from '../../scoring-contracts';
import type { GateDecision } from '../../gate';
import type { EvidenceSnapshot, SignOff } from '../../governance-contracts';

/** Compiles only when `T` is `true`. */
type Expect<T extends true> = T;
/** `true` exactly when `A` and `B` are the same type (mutually assignable, including readonly and optionality). */
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

export type MirrorCodeVersion = Expect<Equal<Models.CodeVersion, CodeVersion>>;
export type MirrorOutputSemantics = Expect<Equal<Models.OutputSemantics, OutputSemantics>>;
export type MirrorRegisteredDeliveryView = Expect<Equal<Models.RegisteredDeliveryView, RegisteredDeliveryView>>;
export type MirrorActor = Expect<Equal<PublishRecords.Actor, Actor>>;
export type MirrorGateDecision = Expect<Equal<PublishRecords.GateDecision, GateDecision>>;
export type MirrorEvidenceSnapshot = Expect<Equal<PublishRecords.EvidenceSnapshot, EvidenceSnapshot>>;
export type MirrorTransitionRefusal = Expect<Equal<PublishRecords.TransitionRefusal, TransitionRefusal>>;
export type MirrorPromoteModelRefusal = Expect<Equal<NonNullable<PromoteModelOutput.PredictiveStudioPromoteModelOutput['refusal']>, TransitionRefusal>>;
export type MirrorGetModelEvidence = Expect<Equal<GetModelEvidenceOutput.PredictiveStudioGetModelEvidenceOutput['evidence'], EvidenceSnapshot>>;
export type MirrorLeakageFlagKind = Expect<Equal<SignOffModelInput.PredictiveStudioLeakageFlagKind, LeakageFlag['kind']>>;
/** The Engine's `PublishRequest['purpose']` is this same Core-side union (`'publish' | 'rollback'`); Core cannot import the Engine. */
export type MirrorSignOffPurpose = Expect<Equal<SignOffModelInput.PredictiveStudioSignOffModelInput['purpose'], Exclude<PublishRecord['purpose'], 'evaluate' | 'adopt'>>>;
export type MirrorSignOffDecision = Expect<Equal<SignOffModelInput.PredictiveStudioSignOffModelInput['decision'], SignOff['Decision']>>;
export type MirrorScoringScope = Expect<Equal<ScoringRuns.ScoringScope, ScoringScope>>;
export type MirrorReadPolicy = Expect<Equal<ScoringRuns.ReadPolicy, ReadPolicy>>;
export type MirrorScoringRunActor = Expect<Equal<ScoringRuns.Actor, Actor>>;
export type MirrorEntityRef = Expect<Equal<ScoringRuns.EntityRef, EntityRef>>;
export type MirrorScoringRefusal = Expect<Equal<ScoringRuns.ScoringRefusal, ScoringRefusal>>;
export type MirrorScoringRowError = Expect<Equal<ScoringRuns.ScoringRowError, ScoringRowError>>;
export type MirrorPrimaryScore = Expect<Equal<MonitoringResults.MetricWithInterval, MetricWithInterval>>;
export type MirrorTrackedMetric = Expect<Equal<MonitoringResults.TrackedMetric, TrackedMetric>>;
export type MirrorCalibrationReport = Expect<Equal<MonitoringResults.CalibrationReport, CalibrationReport>>;
export type MirrorDriftLookEntry = Expect<Equal<MonitoringResults.DriftLookEntry, DriftLookEntry>>;
export type MirrorMonitoringParity = Expect<Equal<MonitoringResults.MonitoringParity, MonitoringParity>>;
export type MirrorMonitoringTriggerFired = Expect<Equal<MonitoringResults.MonitoringTriggerFired, MonitoringTriggerFired>>;
export type MirrorMonitoringChallengerResult = Expect<Equal<MonitoringResults.MonitoringChallengerResult, MonitoringChallengerResult>>;
export type MirrorMonitoringRollbackCheck = Expect<Equal<MonitoringResults.MonitoringRollbackCheck, MonitoringRollbackCheck>>;
/** `PredictiveStudio.RunModelMonitoring`'s period output (M6-21): the fired trigger kinds and the challenger outcome. */
export type MirrorRunModelMonitoringTriggers = Expect<Equal<RunModelMonitoringOutput.PredictiveStudioMonitoredPeriod['triggersFired'], RetrainTrigger['kind'][]>>;
export type MirrorRunModelMonitoringChallengerOutcome = Expect<Equal<NonNullable<RunModelMonitoringOutput.PredictiveStudioMonitoredPeriod['challengerOutcome']>, MonitoringChallengerOutcome>>;
