/**
 * The flow editor's run check: the runtime's own compiler and validator, with each refusal placed on
 * the step or path it is about.
 *
 * Every case here is one a flow could be saved with and then have the dispatcher refuse — the review's
 * examples of a path reading a question that no longer exists, or a field its kind does not have.
 */
import { describe, it, expect } from 'vitest';
import type { MJAIAgentStepEntity } from '@memberjunction/core-entities';
import { AgentFlowTransformerService } from '../lib/agent-editor/agent-flow-transformer.service';
import { AgentPropertiesPanelComponent } from '../lib/agent-editor/agent-properties-panel.component';
import { CheckFlowRun, PathRunProblems, StepRunProblems } from '../lib/agent-editor/flow-run-check';
import { MakeDecisionStep, MakePath, MakeStep } from './agent-step-entities';

const TRIAGE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

const intent = {
  kind: 'Choice',
  instructions: 'Which team handles this ticket?',
  options: [
    { value: 'billing', description: 'Invoices' },
    { value: 'refund', description: 'Money back' },
    { value: 'other', description: 'Anything else' }
  ]
};
const urgent = { kind: 'Likelihood', instructions: 'Is the customer blocked?' };

/** A starting Decision step keyed `triage`, and one handler step per name. */
const flow = (questions: object, handlers: string[]): MJAIAgentStepEntity[] => [
  MakeDecisionStep(TRIAGE_ID, { key: 'triage', questions }, { Name: 'Triage', StartingStep: true }),
  ...handlers.map(h => MakeStep(`h-${h}`, { Name: `Handle ${h}`, StepType: 'Sub-Agent', SubAgentID: `agent-${h}` }))
];

describe('CheckFlowRun', () => {
  it('finds nothing in a flow the dispatcher would run', () => {
    const steps = flow({ intent }, ['billing', 'refund', 'other']);
    const paths = ['billing', 'refund', 'other'].map(v =>
      MakePath(`p-${v}`, TRIAGE_ID, { DestinationStepID: `h-${v}`, Condition: `decisions.triage.intent.value === '${v}'` }));
    expect(CheckFlowRun(steps, paths)).toEqual([]);
  });

  it('flags a path that reads a question the step does not ask, on the path, quoting it as written', () => {
    const steps = flow({ urgent }, ['billing']);
    const path = MakePath('p1', TRIAGE_ID, { DestinationStepID: 'h-billing', Condition: "decisions.triage.intent.value === 'billing'" });

    const [problem, ...rest] = CheckFlowRun(steps, [path]);
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({ Code: 'InvalidCondition', PathID: 'p1', StepID: TRIAGE_ID });
    expect(problem.Message).toContain('reads the question "intent" of Decision step "Triage", which asks only "urgent"');
    expect(problem.Message).toContain("The condition was: decisions.triage.intent.value === 'billing'");
    expect(problem.Message).not.toContain(TRIAGE_ID);
  });

  it('flags a path that reads a field the question\'s kind does not have', () => {
    const steps = flow({ urgent }, ['billing']);
    const path = MakePath('p1', TRIAGE_ID, { DestinationStepID: 'h-billing', Condition: "decisions.triage.urgent.value === 'yes'" });

    const problems = CheckFlowRun(steps, [path]);
    expect(problems).toEqual([expect.objectContaining({ Code: 'InvalidCondition', PathID: 'p1' })]);
    expect(problems[0].Message).toContain('reads "value" from the Likelihood question "urgent"');
    expect(problems[0].Message).toContain('"probability"');
  });

  it('flags a path that reads a Decision step key no step has', () => {
    const steps = flow({ urgent }, ['billing']);
    const path = MakePath('p1', TRIAGE_ID, { DestinationStepID: 'h-billing', Condition: 'decisions.ghost.urgent.probability > 0.5' });

    expect(CheckFlowRun(steps, [path])).toEqual([
      expect.objectContaining({ Code: 'UnknownDecisionKey', StepID: TRIAGE_ID, PathID: 'p1' })
    ]);
  });

  it('flags a fork that leaves an option without a path on the Decision step, by name', () => {
    const steps = flow({ intent }, ['billing', 'refund']);
    const paths = ['billing', 'refund'].map(v =>
      MakePath(`p-${v}`, TRIAGE_ID, { DestinationStepID: `h-${v}`, Condition: `decisions.triage.intent.value === '${v}'` }));

    const problems = CheckFlowRun(steps, paths);
    expect(problems).toEqual([expect.objectContaining({ Code: 'IncompleteFork', StepID: TRIAGE_ID })]);
    expect(problems[0].PathID).toBeUndefined();
    expect(problems[0].Message).toContain('Exclusive group "Triage"');
    expect(problems[0].Message).toContain('no path for "other"');
  });

  it('flags a path testing a value the Choice does not offer, once, as the runtime refuses it', () => {
    const steps = flow({ intent }, ['billing']);
    const path = MakePath('p1', TRIAGE_ID, { DestinationStepID: 'h-billing', Condition: "decisions.triage.intent.value === 'invoice'" });

    const problems = CheckFlowRun(steps, [path]);
    expect(problems).toEqual([expect.objectContaining({ Code: 'InvalidCondition', StepID: TRIAGE_ID, PathID: 'p1' })]);
    expect(problems[0].Message).toContain(
      'compares the Choice question "intent" of Decision step "Triage" with "invoice", which is not one of its options'
    );
    expect(problems[0].Message).toContain("The condition was: decisions.triage.intent.value === 'invoice'");
  });

  it('flags two Decision steps sharing a key on the second', () => {
    const steps = [
      ...flow({ urgent }, []),
      MakeDecisionStep('second', { key: 'triage', questions: { urgent } }, { Name: 'Triage again' })
    ];
    const path = MakePath('p1', TRIAGE_ID, { DestinationStepID: 'second' });
    expect(CheckFlowRun(steps, [path])).toEqual([expect.objectContaining({ Code: 'DuplicateDecisionKey', StepID: 'second' })]);
  });

  it('does not ask whether a referenced agent still exists — only whether one is set', () => {
    const steps = [
      ...flow({ urgent }, ['known']),
      MakeStep('unset', { Name: 'Unset', StepType: 'Sub-Agent', SubAgentID: null })
    ];
    const paths = [MakePath('p1', TRIAGE_ID, { DestinationStepID: 'h-known' }), MakePath('p2', 'h-known', { DestinationStepID: 'unset' })];
    expect(CheckFlowRun(steps, paths)).toEqual([expect.objectContaining({ Code: 'UnresolvedReference', StepID: 'unset' })]);
  });
});

describe('placing run-check problems on the canvas and in the panel', () => {
  const steps = flow({ urgent }, ['billing']);
  const broken = MakePath('p1', TRIAGE_ID, { DestinationStepID: 'h-billing', Condition: "decisions.triage.urgent.value === 'yes'" });
  const problems = CheckFlowRun(steps, [broken]);

  it('selects a path\'s problems for the path, and none for the step it leaves', () => {
    expect(PathRunProblems(problems, 'p1')).toHaveLength(1);
    expect(StepRunProblems(problems, TRIAGE_ID)).toEqual([]);
  });

  it('marks the edge red with the reason first in its detail', () => {
    const [connection] = new AgentFlowTransformerService().PathsToConnections([broken], problems);
    expect(connection.LabelIcon).toBe('fa-triangle-exclamation');
    expect(connection.Color).toBe('#ef4444');
    expect(connection.LabelDetail?.startsWith(problems[0].Message)).toBe(true);
  });

  it('warns on a node with the step\'s own problems, without repeating its configuration warning', () => {
    const transformer = new AgentFlowTransformerService();
    const unfinished = MakeDecisionStep('dec', { key: 'triage', questions: {} }, { StartingStep: true });
    const own = CheckFlowRun([unfinished], []);
    expect(own).toEqual([expect.objectContaining({ Code: 'InvalidDecisionStep', StepID: 'dec' })]);
    expect(transformer.BuildNodeWarning(unfinished, own)).toBe('it asks no questions');

    const fork = flow({ intent }, ['billing', 'refund']);
    const forkPaths = ['billing', 'refund'].map(v =>
      MakePath(`p-${v}`, TRIAGE_ID, { DestinationStepID: `h-${v}`, Condition: `decisions.triage.intent.value === '${v}'` }));
    const node = transformer.StepToNode(fork[0], [], [], CheckFlowRun(fork, forkPaths));
    expect(node.Status).toBe('warning');
    expect(node.StatusMessage).toContain('no path for "other"');
  });

  it('shows the selected path\'s problems in the properties panel', () => {
    const panel = new AgentPropertiesPanelComponent();
    panel.RunProblems = problems;
    panel.PathEntity = broken;
    expect(panel.PathRunProblemMessages).toEqual([problems[0].Message]);
    panel.Step = steps[0];
    expect(panel.StepRunProblemMessages).toEqual([]);
  });

  it('R5 Follow-up #3: accepts valid Custom flows and refuses Custom combined with Human steps up front', () => {
    const customStart = {
      ID: 'custom-1',
      Name: 'Compliance Gate',
      StepType: 'Custom' as const,
      StartingStep: true,
      Status: 'Active' as const,
      Configuration: JSON.stringify({ stepType: 'ApprovalGate' }),
    };
    const customEnd = {
      ID: 'custom-2',
      Name: 'Audit Log',
      StepType: 'Custom' as const,
      StartingStep: false,
      Status: 'Active' as const,
      Configuration: JSON.stringify({ stepType: 'AuditStep' }),
    };
    expect(CheckFlowRun([customStart, customEnd], [MakePath('pc1', 'custom-1', { DestinationStepID: 'custom-2' })])).toEqual([]);

    const humanStep = {
      ID: 'human-1',
      Name: 'Manager Signoff',
      StepType: 'Human' as const,
      StartingStep: false,
      Status: 'Active' as const,
      Configuration: null,
    };
    const mixed = CheckFlowRun([customStart, humanStep], [MakePath('pc2', 'custom-1', { DestinationStepID: 'human-1' })]);
    expect(mixed).toHaveLength(1);
    expect(mixed[0].StepID).toBe('human-1');
    expect(mixed[0].Message).toMatch(/cannot be combined/i);

    // R6 Follow-up #1: Custom mixed with Wait or External is also refused up front
    const waitStep = MakeStep('wait-1', { Name: 'Wait 1h', StepType: 'Wait', Configuration: JSON.stringify({ durationSeconds: 3600 }) });
    const extStep = MakeStep('ext-1', { Name: 'Webhook', StepType: 'External', Configuration: JSON.stringify({ domain: 'hook' }) });
    expect(CheckFlowRun([customStart, waitStep], [MakePath('pw', 'custom-1', { DestinationStepID: 'wait-1' })])).toEqual([
      expect.objectContaining({ Code: 'UnsupportedStepType', StepID: 'wait-1' }),
    ]);
    expect(CheckFlowRun([customStart, extStep], [MakePath('pe', 'custom-1', { DestinationStepID: 'ext-1' })])).toEqual([
      expect.objectContaining({ Code: 'UnsupportedStepType', StepID: 'ext-1' }),
    ]);
  });

  it('R6-1: preserves all fields on prototype-getter-backed BaseEntity Custom steps (never spreads entities)', () => {
    const makeGetterEntityStep = (fields: Record<string, unknown>): MJAIAgentStepEntity => {
      const proto: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(fields)) {
        Object.defineProperty(proto, k, { get: () => v, enumerable: false, configurable: true });
      }
      const instance = Object.create(proto) as MJAIAgentStepEntity;
      expect(Object.keys(instance)).toEqual([]); // proves spread `{ ...instance }` would lose every field!
      return instance;
    };

    // 1. Valid flow starting with a getter-backed Custom step -> no problems (no false NoStartingStep)
    const cStart = makeGetterEntityStep({
      ID: 'gc-1',
      Name: 'Custom Gate',
      StepType: 'Custom',
      StartingStep: true,
      Status: 'Active',
      Configuration: JSON.stringify({ stepType: 'Gate' }),
    });
    const actNext = makeGetterEntityStep({
      ID: 'ga-1',
      Name: 'Do Work',
      StepType: 'Action',
      StartingStep: false,
      Status: 'Active',
      ActionID: 'act-1',
    });
    expect(CheckFlowRun([cStart, actNext], [MakePath('gp1', 'gc-1', { DestinationStepID: 'ga-1' })])).toEqual([]);

    // 2. Action -> Custom -> Action loop -> LoopDetected
    const actLoopStart = makeGetterEntityStep({
      ID: 'gl-1',
      Name: 'Start Action',
      StepType: 'Action',
      StartingStep: true,
      Status: 'Active',
      ActionID: 'act-1',
    });
    const cMid = makeGetterEntityStep({
      ID: 'gl-2',
      Name: 'Mid Custom',
      StepType: 'Custom',
      StartingStep: false,
      Status: 'Active',
      Configuration: JSON.stringify({ stepType: 'Gate' }),
    });
    const loopProblems = CheckFlowRun(
      [actLoopStart, cMid],
      [
        MakePath('glp1', 'gl-1', { DestinationStepID: 'gl-2' }),
        MakePath('glp2', 'gl-2', { DestinationStepID: 'gl-1' }),
      ]
    );
    expect(loopProblems.some((p) => p.Code === 'LoopDetected')).toBe(true);

    // 3. Unknown decision key on path out of getter-backed Custom step -> UnknownDecisionKey
    const badKeyProblems = CheckFlowRun(
      [cStart, actNext],
      [MakePath('gp-bad', 'gc-1', { DestinationStepID: 'ga-1', Condition: "decisions.ghost.intent.value === 'billing'" })]
    );
    expect(badKeyProblems.some((p) => p.Code === 'UnknownDecisionKey')).toBe(true);

    // 4. Choice value not offered on a fork targeting a getter-backed Custom step -> IncompleteFork + InvalidCondition
    const decisionStep = MakeDecisionStep(TRIAGE_ID, { key: 'triage', questions: { intent } }, { Name: 'Triage', StartingStep: true });
    const hBilling = MakeStep('h-billing', { Name: 'Handle billing', StepType: 'Sub-Agent', SubAgentID: 'agent-billing' });
    const cTarget = makeGetterEntityStep({
      ID: 'gc-target',
      Name: 'Custom Target',
      StepType: 'Custom',
      StartingStep: false,
      Status: 'Active',
      Configuration: JSON.stringify({ stepType: 'Gate' }),
    });
    const badChoiceProblems = CheckFlowRun(
      [decisionStep, hBilling, cTarget],
      [
        MakePath('gp-billing', TRIAGE_ID, { DestinationStepID: 'h-billing', Condition: "decisions.triage.intent.value === 'billing'" }),
        MakePath('gp-choice', TRIAGE_ID, { DestinationStepID: 'gc-target', Condition: "decisions.triage.intent.value === 'invoice'" }),
      ]
    );
    const codes = new Set(badChoiceProblems.map((p) => p.Code));
    expect(codes.has('IncompleteFork')).toBe(true);
    expect(codes.has('InvalidCondition')).toBe(true);
  });
});
