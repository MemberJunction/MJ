/**
 * @module agent-eval/types
 *
 * Self-contained contracts for the Predictive Studio Agent evaluation suite (§3.3 / D5-34).
 * Declares all suite, manifest, summary, and calibration types locally inside `agent-eval/` so
 * this module imports nothing PR 5 adds outside `agent-eval/` and compiles cleanly on baseline.
 */

export type AgentEvalTrap =
  | 'pure-noise'
  | 'leaky-field'
  | 'small-n'
  | 'unresolved-reference'
  | 'negated-build-request'
  | 'none';

export type AgentEvalWorldId =
  | 'C1'
  | 'C4'
  | 'N1c'
  | 'W1-signal'
  | 'W2-noise'
  | 'W3-leak-row'
  | 'W7-small-imbalanced';

export type AgentEvalRefusalKind =
  | 'decline-no-signal'
  | 'decline-small-data'
  | 'decline-unresolved-reference'
  | 'none';

export type AgentEvalRubricCriterionKey =
  | 'censoring-named'
  | 'asks-what-to-improve'
  | 'failure-reported';

export interface AgentEvalScenario {
  readonly testId: string;
  readonly suiteTestId: string;
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly trap: AgentEvalTrap;
  readonly world: AgentEvalWorldId;
  readonly repeatCount: number;
  readonly input: {
    readonly userMessage?: string;
    readonly turns?: readonly { readonly userMessage: string }[];
  };
  readonly expected: {
    readonly gateOutcome: 'model' | 'keep-simple-baseline' | 'no-model' | 'no-build';
    readonly mustExcludeFields: readonly string[];
    readonly buildsExpected?: number;
    readonly modelsPublishedExpected?: number;
    readonly refusalKind?: AgentEvalRefusalKind;
    readonly rubricCriteria?: readonly AgentEvalRubricCriterionKey[];
  };
  readonly tags?: readonly string[];
}

export interface AgentEvalComparisonSpec {
  readonly baselineAgentVersion: string;
  readonly candidateAgentVersion: string;
  readonly pairedOn: 'same-scenarios';
  readonly interval: { readonly level: number; readonly method: 'wilson' };
  readonly nonInferiorityMargin: number;
}

export interface AgentEvalSuiteSpec {
  readonly testSuiteId: string;
  readonly scenarios: readonly AgentEvalScenario[];
  readonly scenarioCount: number;
  readonly repeats: number;
  readonly passK: number;
  readonly comparison: AgentEvalComparisonSpec;
}

export interface AgentEvalWorldSuiteDescriptor {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly worldKind: 'corpus' | 'scenario' | 'world';
  readonly seed?: number;
}

export interface AgentEvalManifest {
  readonly version: 1;
  readonly parentSuiteId: string;
  readonly parentSuiteName: string;
  readonly testTypeId: string;
  readonly testTypeName: string;
  readonly rubricId: string;
  readonly rubricVersionId: string;
  readonly agentId: string;
  readonly childSuites: Readonly<Record<AgentEvalWorldId, AgentEvalWorldSuiteDescriptor>>;
  readonly rubricCriteriaIds: {
    readonly scaleId: string;
    readonly metScaleLevelId: string;
    readonly notMetScaleLevelId: string;
    readonly versionCriteria: Readonly<Record<AgentEvalRubricCriterionKey, {
      readonly id: string;
      readonly metLevelId: string;
      readonly notMetLevelId: string;
      readonly name: string;
      readonly guidance: string;
      readonly metDescriptor: string;
      readonly notMetDescriptor: string;
    }>>;
  };
  readonly scenarios: readonly AgentEvalScenario[];
}

export interface ConfidenceInterval {
  readonly Lower: number;
  readonly Upper: number;
}

export interface MetricWithInterval {
  readonly Value: number;
  readonly Count: number;
  readonly Successes: number;
  readonly Interval: ConfidenceInterval;
}

export interface PairedComparison {
  readonly Difference: number;
  readonly Interval: ConfidenceInterval;
  readonly Margin: number;
  readonly Passed: boolean;
  readonly ScenariosCompared: number;
  readonly CandidateOnlyPasses: number;
  readonly BaselineOnlyPasses: number;
}

export interface TestRunOutcome {
  readonly TestId: string;
  readonly RepeatIndex?: number;
  readonly Passed: boolean;
  readonly RunId?: string;
  readonly Status?: string;
  readonly UsedFallbackModel?: boolean;
}

export interface AgentEvalSuiteResult {
  readonly testSuiteRunId: string;
  readonly passKRate: MetricWithInterval;
  readonly perTrap: readonly { readonly trap: AgentEvalTrap; readonly passKRate: MetricWithInterval }[];
  readonly pairedDifference: PairedComparison;
  readonly safetyAllPassed: boolean;
  readonly failingSafetyTestIds: readonly string[];
  readonly accepted: boolean;
}

export type CalibrationOperation =
  | 'baseline-positive'
  | 'delete-carrying-span'
  | 'insert-template-span'
  | 'insert-off-topic-question';

export interface CalibrationItem {
  readonly id: string;
  readonly criterionKey: AgentEvalRubricCriterionKey;
  readonly baseTranscriptId: string;
  readonly operation: CalibrationOperation;
  readonly carryingSpan: string;
  readonly transcript: string;
  readonly expectedLabel: boolean;
}

export interface CalibrationMetricWithAcceptance extends MetricWithInterval {
  readonly accepted: boolean;
}

export interface CalibrationFixtureFile {
  readonly seed: number;
  readonly rubricId: string;
  readonly rubricVersionId: string;
  readonly criteriaCount: number;
  readonly itemsPerCriterion: number;
  readonly storedAgreement: {
    readonly overall: CalibrationMetricWithAcceptance;
    readonly byCriterion: Readonly<Record<AgentEvalRubricCriterionKey, CalibrationMetricWithAcceptance>>;
  };
  readonly items: readonly CalibrationItem[];
}
