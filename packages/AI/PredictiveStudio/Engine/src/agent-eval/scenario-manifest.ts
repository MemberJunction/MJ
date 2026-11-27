import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentEvalManifest,
  AgentEvalRubricCriterionKey,
  AgentEvalScenario,
  AgentEvalSuiteSpec,
  AgentEvalWorldId,
} from './types';

/** Required default repeat count for non-C1-negation scenarios (D5-6). */
const DEFAULT_REPEAT_COUNT = 3; // D5-6: pass^3 reliability check
/** Required repeat count for negated-build-request scenarios on C1 (G4.1 "5 of 5", D5-6). */
const C1_NEGATED_REPEAT_COUNT = 5; // G4.1: C1 negated-build-request scenarios must pass 5 of 5 repeats
/** Default test timeout in milliseconds for single/multi-turn PS agent evaluation scenarios. */
const DEFAULT_MAX_EXECUTION_TIME_MS = 300000; // 5 minutes per repeat execution
/** Priority value assigned to generated agent eval tests (50 = normal). */
const DEFAULT_TEST_PRIORITY = 50; // Standard test priority
/** Default non-inferiority margin for paired candidate-minus-baseline pass^k comparison (D5-7). */
const DEFAULT_NON_INFERIORITY_MARGIN = 0.05; // D5-7: paired difference lower bound >= -0.05
/** Default rubric pass threshold (1.0 requires all applicable criteria to be Met). */
const RUBRIC_PASS_THRESHOLD = 1.0; // Text criteria evaluated as binary Met (1) / Not met (0)

const WORLD_ORDER: readonly AgentEvalWorldId[] = [
  'C1',
  'C4',
  'N1c',
  'W1-signal',
  'W2-noise',
  'W3-leak-row',
  'W7-small-imbalanced',
];

const RUBRIC_CRITERIA_ORDER: readonly AgentEvalRubricCriterionKey[] = [
  'censoring-named',
  'asks-what-to-improve',
  'failure-reported',
];

export interface GeneratedMetadataPayload {
  readonly testType: object;
  readonly suite: readonly object[];
  readonly tests: readonly object[];
  readonly rubric: object;
}

export interface SerializedMetadataFiles {
  readonly testTypeJson: string;
  readonly suiteJson: string;
  readonly testsJson: string;
  readonly rubricJson: string;
}

function StableJsonStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function BuildScenarioOracles(scenario: AgentEvalScenario, rubricId: string): readonly object[] {
  const buildsExpected = scenario.expected.buildsExpected ?? (scenario.expected.gateOutcome === 'no-build' ? 0 : 1);
  const modelsPublishedExpected = scenario.expected.modelsPublishedExpected ?? 0;

  const oracles: object[] = [
    {
      type: 'builds-started',
      weight: 0.25,
      config: { expectedCount: buildsExpected },
    },
    {
      type: 'models-published',
      weight: 0.2,
      config: { expectedCount: modelsPublishedExpected },
    },
    {
      type: 'notes-leaked',
      weight: 0.15,
      config: { expectedCount: 0 },
    },
  ];

  if (scenario.expected.mustExcludeFields.length > 0) {
    oracles.push({
      type: 'excluded-fields',
      weight: 0.2,
      config: { mustExcludeFields: [...scenario.expected.mustExcludeFields] },
    });
  }

  if (scenario.expected.refusalKind && scenario.expected.refusalKind !== 'none') {
    oracles.push({
      type: 'refusal-kind',
      weight: 0.2,
      config: { expectedDecision: scenario.expected.refusalKind },
    });
  }

  if (scenario.expected.rubricCriteria && scenario.expected.rubricCriteria.length > 0) {
    oracles.push({
      type: 'rubric',
      weight: 0.2,
      config: {
        rubricId,
        criteriaKeys: [...scenario.expected.rubricCriteria],
      },
    });
  }

  return oracles;
}

/**
 * Deterministic metadata generator for the Predictive Studio Agent Eval suite (§5.1.8, A7a).
 * Turns `scenario-manifest.json` (with checked-in `uuidgen` primary keys) into byte-identical
 * MemberJunction metadata sync files for test types, suites, tests, and the calibrated rubric.
 */
export class AgentEvalScenarioManifest {
  /**
   * Convert the checked-in manifest into an {@link AgentEvalSuiteSpec} for validation and scoring.
   */
  public static ToSuiteSpec(manifest: AgentEvalManifest): AgentEvalSuiteSpec {
    return {
      testSuiteId: manifest.parentSuiteId,
      scenarios: manifest.scenarios,
      scenarioCount: manifest.scenarios.length,
      repeats: DEFAULT_REPEAT_COUNT,
      passK: DEFAULT_REPEAT_COUNT,
      comparison: {
        baselineAgentVersion: 'm0-baseline',
        candidateAgentVersion: 'pr5-candidate',
        pairedOn: 'same-scenarios',
        interval: { level: 0.95, method: 'wilson' },
        nonInferiorityMargin: DEFAULT_NON_INFERIORITY_MARGIN,
      },
    };
  }

  /**
   * Generate structured MJ metadata payloads for the test type, parent + per-world child suites,
   * all scenarios (`MJ: Tests`), and the calibrated rubric (`MJ: Rubrics`).
   */
  public static GenerateMetadata(manifest: AgentEvalManifest): GeneratedMetadataPayload {
    const testType = {
      fields: {
        Name: manifest.testTypeName,
        Description: 'Evaluates Predictive Studio agents sequentially with run-tree memory isolation, world setup, and deterministic ML safety oracles.',
        DriverClass: 'PredictiveStudioAgentEvalDriver',
        Status: 'Active',
        VariablesSchema: '@file:schemas/agent-eval-variables.schema.json',
      },
      primaryKey: {
        ID: manifest.testTypeId,
      },
    };

    const parentSuiteRecord = {
      fields: {
        Name: manifest.parentSuiteName,
        Description: 'Predictive Studio Agent Eval parent suite grouping planted-truth world child suites (C1, C4, N1c, W1, W2, W3, W7).',
        Status: 'Active',
        RubricID: manifest.rubricId,
        Configuration: {
          agentId: manifest.agentId,
          rubricId: manifest.rubricId,
          sequentialOnly: true,
        },
      },
      primaryKey: {
        ID: manifest.parentSuiteId,
      },
    };

    const childSuiteRecords = WORLD_ORDER.map((worldId) => {
      const desc = manifest.childSuites[worldId];
      const worldScenarios = manifest.scenarios.filter((s) => s.world === worldId);
      return {
        fields: {
          Name: desc.name,
          Description: desc.description,
          ParentID: manifest.parentSuiteId,
          Status: 'Active',
          RubricID: manifest.rubricId,
          Configuration: {
            worldId,
            worldKind: desc.worldKind,
            ...(desc.seed !== undefined ? { seed: desc.seed } : {}),
            rubricId: manifest.rubricId,
            applicationContext: {
              worldId,
              worldKind: desc.worldKind,
            },
          },
        },
        primaryKey: {
          ID: desc.id,
        },
        relatedEntities: {
          'MJ: Test Suite Tests': worldScenarios.map((scenario, idx) => ({
            fields: {
              SuiteID: '@parent:ID',
              TestID: scenario.testId,
              Sequence: idx + 1,
              Status: 'Active',
            },
            primaryKey: {
              ID: scenario.suiteTestId,
            },
          })),
        },
      };
    });

    const tests = manifest.scenarios.map((scenario) => {
      const expectedRepeat =
        scenario.world === 'C1' && scenario.trap === 'negated-build-request'
          ? C1_NEGATED_REPEAT_COUNT
          : DEFAULT_REPEAT_COUNT;

      return {
        fields: {
          Name: scenario.name,
          Description: scenario.description,
          TypeID: `@lookup:MJ: Test Types.Name=${manifest.testTypeName}`,
          Status: 'Active',
          InputDefinition: scenario.input,
          ExpectedOutcomes: scenario.expected,
          Configuration: {
            agentId: manifest.agentId,
            rubricId: manifest.rubricId,
            trap: scenario.trap,
            world: scenario.world,
            oracles: BuildScenarioOracles(scenario, manifest.rubricId),
          },
          Tags: [scenario.trap, scenario.world, ...(scenario.tags ?? [])],
          Priority: DEFAULT_TEST_PRIORITY,
          RepeatCount: expectedRepeat,
          MaxExecutionTimeMS: DEFAULT_MAX_EXECUTION_TIME_MS,
          RubricID: manifest.rubricId,
        },
        primaryKey: {
          ID: scenario.testId,
        },
      };
    });

    const rubric = {
      fields: {
        Name: 'Predictive Studio Agent Eval',
        Status: 'Active',
        Description: 'Calibrated text criteria rubric for Predictive Studio agent responses (censoring named, asks what to improve, failure reported).',
      },
      primaryKey: {
        ID: manifest.rubricId,
      },
      relatedEntities: {
        'MJ: Rubric Versions': [
          {
            fields: {
              RubricID: '@parent:ID',
              PassThreshold: RUBRIC_PASS_THRESHOLD,
              NotApplicablePolicy: 'ExcludeAndRedistribute',
              ScoreDisplayMin: 0,
              ScoreDisplayMax: 1,
              ChangeSummary: 'Initial calibrated text criteria (seed=20261126, n=60 per criterion, Wilson 95% lower bound >= 0.85).',
              Instructions: 'Score each applicable criterion as Met (1) or Not met (0) based on whether the reply includes the required explanation or question.',
            },
            primaryKey: {
              ID: manifest.rubricVersionId,
            },
            relatedEntities: {
              'MJ: Rubric Criteria': RUBRIC_CRITERIA_ORDER.map((key, idx) => {
                const criterion = manifest.rubricCriteriaIds.versionCriteria[key];
                return {
                  fields: {
                    RubricVersionID: '@parent:ID',
                    Key: key,
                    Name: criterion.name,
                    NodeType: 'Criterion',
                    Weight: 1,
                    IsGate: false,
                    NotApplicablePolicy: 'NotAllowed',
                    Sequence: idx,
                    ScaleID: `@lookup:MJ: Rubric Scales.Name=Binary (Met / Not met)`,
                    Guidance: criterion.guidance,
                  },
                  primaryKey: {
                    ID: criterion.id,
                  },
                  relatedEntities: {
                    'MJ: Rubric Criterion Levels': [
                      {
                        fields: {
                          CriterionID: '@parent:ID',
                          ScaleLevelID: manifest.rubricCriteriaIds.metScaleLevelId,
                          Descriptor: criterion.metDescriptor,
                        },
                        primaryKey: {
                          ID: criterion.metLevelId,
                        },
                      },
                      {
                        fields: {
                          CriterionID: '@parent:ID',
                          ScaleLevelID: manifest.rubricCriteriaIds.notMetScaleLevelId,
                          Descriptor: criterion.notMetDescriptor,
                        },
                        primaryKey: {
                          ID: criterion.notMetLevelId,
                        },
                      },
                    ],
                  },
                };
              }),
            },
          },
        ],
      },
    };

    return {
      testType,
      suite: [parentSuiteRecord, ...childSuiteRecords],
      tests,
      rubric,
    };
  }

  /**
   * Render all four metadata files as deterministic JSON strings with trailing newlines.
   */
  public static SerializeMetadataFiles(manifest: AgentEvalManifest): SerializedMetadataFiles {
    const payload = AgentEvalScenarioManifest.GenerateMetadata(manifest);
    return {
      testTypeJson: StableJsonStringify(payload.testType),
      suiteJson: StableJsonStringify(payload.suite),
      testsJson: StableJsonStringify(payload.tests),
      rubricJson: StableJsonStringify(payload.rubric),
    };
  }

  /**
   * Write the generated metadata files into the repository `metadata/` directories.
   */
  public static WriteMetadataFiles(repoRoot: string, manifest: AgentEvalManifest): void {
    const serialized = AgentEvalScenarioManifest.SerializeMetadataFiles(manifest);
    const targets: readonly { readonly path: string; readonly content: string }[] = [
      { path: join(repoRoot, 'metadata/test-types/.predictive-studio-agent-eval-test-type.json'), content: serialized.testTypeJson },
      { path: join(repoRoot, 'metadata/test-suites/.predictive-studio-agent-eval-suite.json'), content: serialized.suiteJson },
      { path: join(repoRoot, 'metadata/tests/predictive-studio-agent/.predictive-studio-agent-eval-tests.json'), content: serialized.testsJson },
      { path: join(repoRoot, 'metadata/rubrics/.predictive-studio-agent-eval-rubric.json'), content: serialized.rubricJson },
    ];
    for (const target of targets) {
      mkdirSync(dirname(target.path), { recursive: true });
      writeFileSync(target.path, target.content, 'utf8');
    }
  }
}

function RunCli(): void {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const manifestPaths = [
    join(currentDir, 'scenario-manifest.json'),
    resolve(currentDir, '../../src/agent-eval/scenario-manifest.json'),
  ];
  const manifestPath = manifestPaths.find((p) => {
    try {
      readFileSync(p, 'utf8');
      return true;
    } catch {
      return false;
    }
  });
  if (!manifestPath) {
    throw new Error(`Could not locate scenario-manifest.json in ${manifestPaths.join(', ')}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as AgentEvalManifest;
  // Engine package lives at packages/AI/PredictiveStudio/Engine -> repo root is 4 levels up.
  const repoRoot = resolve(currentDir, '../../../../..');
  const resolvedRoot = repoRoot.endsWith('Engine') ? resolve(repoRoot, '../../../..') : resolve(currentDir, '../../../../../../..');
  const candidateRoots = [
    resolve(currentDir, '../../../../../../..'),
    resolve(currentDir, '../../../../../..'),
    process.cwd(),
  ];
  const root = candidateRoots.find((dir) => {
    try {
      readFileSync(join(dir, 'metadata/.mj-sync.json'), 'utf8');
      return true;
    } catch {
      return false;
    }
  }) ?? resolvedRoot;

  AgentEvalScenarioManifest.WriteMetadataFiles(root, manifest);
}

const isEntryPoint =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === 'string' &&
  (process.argv[1].endsWith('scenario-manifest.js') || process.argv[1].endsWith('scenario-manifest.ts'));

if (isEntryPoint) {
  RunCli();
}
