import { describe, it, expect, beforeEach } from 'vitest';
import type { MJAIAgentStepPathEntity } from '@memberjunction/core-entities';
import { AgentFlowTransformerService, AGENT_STEP_TYPE_CONFIGS } from '../lib/agent-editor/agent-flow-transformer.service';
import { AgentPropertiesPanelComponent } from '../lib/agent-editor/agent-properties-panel.component';
import { GenerateUniqueDecisionKey } from '../lib/agent-editor/flow-agent-editor.component';
import { MakeDecisionStep, MakePath, MakeStep } from './agent-step-entities';

/** A configuration with one Choice question, `intent`, keyed `key`. */
const intentConfig = (key: string): object => ({
  key,
  questions: {
    intent: {
      kind: 'Choice',
      instructions: 'Which team handles this?',
      options: [{ value: 'a', description: 'Team A' }, { value: 'b', description: 'Team B' }]
    }
  }
});

/** The key a panel's current step stores. */
const storedKey = (panel: AgentPropertiesPanelComponent): string => panel.DecisionConfig.key;

/** Types `keystrokes` into the key field one `input` event at a time, as a browser would. */
const typeKey = (panel: AgentPropertiesPanelComponent, keystrokes: string[]): void => {
  for (const value of keystrokes) panel.OnDecisionKeyChange(value);
};

describe('Decision Step — Node configuration & transformer service', () => {
  const transformer = new AgentFlowTransformerService();

  it('includes Decision in AGENT_STEP_TYPE_CONFIGS with expected attributes', () => {
    const decisionConfig = AGENT_STEP_TYPE_CONFIGS.find(c => c.Type === 'Decision');
    expect(decisionConfig).toBeDefined();
    expect(decisionConfig?.Label).toBe('Decision');
    expect(decisionConfig?.Icon).toBe('fa-scale-balanced');
    expect(decisionConfig?.Color).toBe('#0891b2');
    expect(decisionConfig?.Category).toBe('Steps');
  });

  it('BuildStepSubtitle formats subtitle from key and question count', () => {
    const step = MakeDecisionStep('s1', {
      key: 'triage',
      state: 'payload.ticket',
      questions: {
        q1: { kind: 'Likelihood', instructions: 'Is urgent?' },
        q2: { kind: 'Choice', instructions: 'Pick route', options: [{ value: 'a', description: 'A' }, { value: 'b', description: 'B' }] }
      }
    });
    expect(transformer.BuildStepSubtitle(step)).toBe('triage · 2 questions');
  });

  it('BuildStepSubtitle returns Unconfigured when configuration is missing or invalid', () => {
    expect(transformer.BuildStepSubtitle(MakeStep('s1', { Configuration: null }))).toBe('Unconfigured');
    expect(transformer.BuildStepSubtitle(MakeStep('s1', { Configuration: '{ invalid json' }))).toBe('Unconfigured');
  });

  it('BuildConfigWarningMessage reports validation errors from ReadFlowDecisionStepConfiguration', () => {
    const step = MakeDecisionStep('s1', { key: '123-invalid-key', state: 'payload', questions: {} });
    const warning = transformer.BuildConfigWarningMessage(step);
    expect(warning).not.toBeNull();
    expect(warning).toContain('cannot be named in a path condition');
  });

  it('BuildConfigWarningMessage returns null for valid Decision configuration', () => {
    const step = MakeDecisionStep('s1', { key: 'triage', state: 'payload', questions: { urgent: { kind: 'Likelihood', instructions: 'Is it urgent?' } } });
    expect(transformer.BuildConfigWarningMessage(step)).toBeNull();
  });

  it('IsStepMissingConfiguration returns true for missing or invalid configuration', () => {
    expect(transformer.IsStepMissingConfiguration(MakeStep('s1', { Configuration: null }))).toBe(true);
    const valid = MakeDecisionStep('s1', { key: 'triage', state: 'payload', questions: { q1: { kind: 'Likelihood', instructions: 'Test' } } });
    expect(transformer.IsStepMissingConfiguration(valid)).toBe(false);
  });
});

describe('GenerateUniqueDecisionKey', () => {
  const withKey = (id: string, key: string) => MakeDecisionStep(id, { key, state: 'payload', questions: {} });

  it('returns "decision" when no steps exist', () => {
    expect(GenerateUniqueDecisionKey([])).toBe('decision');
  });

  it('returns "decision" when other step types exist without Decision steps', () => {
    expect(GenerateUniqueDecisionKey([MakeStep('s1', { StepType: 'Action' }), MakeStep('s2', { StepType: 'Prompt' })])).toBe('decision');
  });

  it('returns "decision_2" when "decision" already exists', () => {
    expect(GenerateUniqueDecisionKey([withKey('s1', 'decision')])).toBe('decision_2');
  });

  it('returns "decision_3" when "decision" and "decision_2" exist', () => {
    expect(GenerateUniqueDecisionKey([withKey('s1', 'decision'), withKey('s2', 'decision_2')])).toBe('decision_3');
  });

  it('fills gaps when numbering is sparse', () => {
    expect(GenerateUniqueDecisionKey([withKey('s1', 'decision'), withKey('s2', 'decision_3')])).toBe('decision_2');
  });

  it('ignores a configuration that is not JSON', () => {
    expect(GenerateUniqueDecisionKey([MakeStep('s1', { Configuration: '{ not json' })])).toBe('decision');
  });
});

describe('AgentPropertiesPanelComponent — Decision step properties', () => {
  let panel: AgentPropertiesPanelComponent;

  beforeEach(() => {
    panel = new AgentPropertiesPanelComponent();
  });

  it('correctly reports ShowDecisionConfig and StepTypeLabel', () => {
    panel.Step = MakeStep('s1', { StepType: 'Decision' });
    expect(panel.ShowDecisionConfig).toBe(true);
    expect(panel.StepTypeLabel).toBe('Decision');

    panel.Step = MakeStep('s2', { StepType: 'Action' });
    expect(panel.ShowDecisionConfig).toBe(false);
    expect(panel.StepTypeLabel).toBe('Action');
  });

  it('filters DecisionPrompts to only prompts bound to Decision model type', () => {
    panel.DecisionModelTypeID = 'decision-uuid';
    panel.Prompts = [
      { ID: 'p1', Name: 'General Prompt', AIModelType: 'LLM', AIModelTypeID: null },
      { ID: 'p2', Name: 'Classifier', AIModelType: 'Decision', AIModelTypeID: null },
      { ID: 'p3', Name: 'Router', AIModelType: null, AIModelTypeID: 'decision-uuid' },
      { ID: 'p4', Name: 'Chat Prompt', AIModelType: 'Chat', AIModelTypeID: null },
      { ID: 'p5', Name: 'Mismatched Prompt', AIModelType: 'Decision', AIModelTypeID: 'other-uuid' }
    ];
    expect(panel.DecisionPrompts.map(p => p.ID)).toEqual(['p2', 'p3']);
  });

  it('SelectedDecisionPromptName returns "Default Decision (system default)" when PromptID is null', () => {
    panel.Step = MakeStep('s1', { PromptID: null });
    expect(panel.SelectedDecisionPromptName).toBe('Default Decision (system default)');

    panel.Prompts = [{ ID: 'p1', Name: 'My Classifier', AIModelType: 'Decision', AIModelTypeID: null }];
    panel.Step = MakeStep('s1', { PromptID: 'p1' });
    expect(panel.SelectedDecisionPromptName).toBe('My Classifier');
  });

  it('shows an unfinished configuration\'s key and questions, without inventing a key it does not store', () => {
    panel.Step = MakeDecisionStep('s1', { key: 'triage', questions: {} });
    expect(panel.DecisionConfig).toEqual({ key: 'triage', questions: {} });
    expect(panel.DecisionValidationError).toBe('it asks no questions');

    panel.Step = MakeDecisionStep('s2', { questions: {} });
    expect(panel.DecisionConfig.key).toBe('');
  });

  it('DecisionStateError validates state format', () => {
    panel.Step = MakeDecisionStep('s1', { key: 'triage', state: 'payload', questions: {} });
    expect(panel.DecisionStateError).toBeNull();

    panel.Step.Configuration = JSON.stringify({ key: 'triage', state: 'payload.ticket.details', questions: {} });
    expect(panel.DecisionStateError).toBeNull();

    panel.Step.Configuration = JSON.stringify({ key: 'triage', state: 'other_root.data', questions: {} });
    expect(panel.DecisionStateError).toContain('State must be "payload" or start with "payload."');
  });

  it('manages question lifecycle (add, rename, remove, kind change)', () => {
    panel.Step = MakeDecisionStep('s1', { key: 'triage', state: 'payload', questions: {} });

    panel.OnAddDecisionQuestion();
    expect(panel.DecisionQuestionsList.length).toBe(1);
    expect(panel.DecisionQuestionsList[0].key).toBe('question_1');
    expect(panel.DecisionQuestionsList[0].question.kind).toBe('Likelihood');

    panel.OnDecisionQuestionKindChange('question_1', 'Choice');
    const choiceQ = panel.AsChoiceQuestion(panel.DecisionQuestionsList[0].question);
    expect(choiceQ.kind).toBe('Choice');
    expect(choiceQ.options.length).toBe(2);

    panel.OnDecisionQuestionKeyChange('question_1', 'route');
    expect(panel.DecisionQuestionsList[0].key).toBe('route');

    panel.OnRemoveDecisionQuestion('route');
    expect(panel.DecisionQuestionsList.length).toBe(0);
  });

  it('manages choice options and score levels with reordering', () => {
    panel.Step = MakeDecisionStep('s1', {
      key: 'triage',
      state: 'payload',
      questions: {
        intent: {
          kind: 'Choice',
          instructions: 'Select intent',
          options: [{ value: 'support', description: 'Tech help' }, { value: 'billing', description: 'Billing' }]
        },
        urgency: { kind: 'Score', instructions: 'Rate urgency', levels: ['Low', 'Medium', 'High'] }
      }
    });

    panel.OnAddChoiceOption('intent');
    let choiceQ = panel.AsChoiceQuestion(panel.DecisionConfig.questions['intent']);
    expect(choiceQ.options.length).toBe(3);

    panel.OnChoiceOptionChange('intent', 2, 'value', 'sales');
    panel.OnChoiceOptionChange('intent', 2, 'description', 'Sales queries');
    choiceQ = panel.AsChoiceQuestion(panel.DecisionConfig.questions['intent']);
    expect(choiceQ.options[2]).toEqual({ value: 'sales', description: 'Sales queries' });

    panel.OnRemoveChoiceOption('intent', 0);
    choiceQ = panel.AsChoiceQuestion(panel.DecisionConfig.questions['intent']);
    expect(choiceQ.options.length).toBe(2);
    expect(choiceQ.options[0].value).toBe('billing');

    panel.OnMoveScoreLevel('urgency', 2, 'up');
    let scoreQ = panel.AsScoreQuestion(panel.DecisionConfig.questions['urgency']);
    expect(scoreQ.levels).toEqual(['Low', 'High', 'Medium']);

    panel.OnMoveScoreLevel('urgency', 0, 'down');
    scoreQ = panel.AsScoreQuestion(panel.DecisionConfig.questions['urgency']);
    expect(scoreQ.levels).toEqual(['High', 'Low', 'Medium']);
  });
});

describe('AgentPropertiesPanelComponent — renaming a Decision step key', () => {
  let panel: AgentPropertiesPanelComponent;
  let emittedPaths: MJAIAgentStepPathEntity[];

  beforeEach(() => {
    panel = new AgentPropertiesPanelComponent();
    emittedPaths = [];
    panel.PathChanged.subscribe(p => emittedPaths.push(p));
  });

  it('renames the key and the conditions that read it on commit, and leaves other conditions alone', () => {
    const step = MakeDecisionStep('s1', intentConfig('old_key'));
    const reads = MakePath('p1', 's1', { Condition: "decisions.old_key.intent.value === 'a'" });
    const other = MakePath('p2', 's1', { Condition: 'payload.count > 0' });
    panel.Step = step;
    panel.AllSteps = [step];
    panel.AllPaths = [reads, other];

    typeKey(panel, ['new_key']);
    panel.OnDecisionKeyCommit();

    expect(storedKey(panel)).toBe('new_key');
    expect(reads.Condition).toBe("decisions.new_key.intent.value === 'a'");
    expect(other.Condition).toBe('payload.count > 0');
    expect(emittedPaths.map(p => p.ID)).toEqual(['p1']);
  });

  it('does not merge two steps\' conditions when a key is typed through the other step\'s key (review scenario 1)', () => {
    const stepA = MakeDecisionStep('a', intentConfig('triage'), { Name: 'Step A' });
    const stepB = MakeDecisionStep('b', intentConfig('triage_2'), { Name: 'Step B' });
    const readsA = MakePath('pa', 'a', { Condition: "decisions.triage.intent.value === 'a'" });
    const readsB = MakePath('pb', 'b', { Condition: "decisions.triage_2.intent.value === 'b'" });
    panel.AllSteps = [stepA, stepB];
    panel.AllPaths = [readsA, readsB];
    panel.Step = stepB;

    // Backspace B's key to A's key and past it, then type a new ending.
    typeKey(panel, ['triage_', 'triage', 'triage_', 'triage_x']);
    expect(readsA.Condition).toBe("decisions.triage.intent.value === 'a'");
    expect(readsB.Condition).toBe("decisions.triage_2.intent.value === 'b'");

    panel.OnDecisionKeyCommit();
    expect(readsA.Condition).toBe("decisions.triage.intent.value === 'a'");
    expect(readsB.Condition).toBe("decisions.triage_x.intent.value === 'b'");
    expect(storedKey(panel)).toBe('triage_x');
    expect(JSON.parse(stepA.Configuration ?? '{}').key).toBe('triage');
  });

  it('does not leave conditions on a fragment of the old key when the field is cleared and retyped (review scenario 2)', () => {
    const step = MakeDecisionStep('s1', intentConfig('triage'));
    const reads = MakePath('p1', 's1', { Condition: "decisions.triage.intent.value === 'a'" });
    panel.Step = step;
    panel.AllSteps = [step];
    panel.AllPaths = [reads];

    typeKey(panel, ['triag', 'tria', 'tri', 'tr', 't', '', 'r', 'ro', 'rou', 'rout', 'route']);
    expect(reads.Condition).toBe("decisions.triage.intent.value === 'a'");
    expect(storedKey(panel)).toBe('triage');

    panel.OnDecisionKeyCommit();
    expect(storedKey(panel)).toBe('route');
    expect(reads.Condition).toBe("decisions.route.intent.value === 'a'");
  });

  it('refuses a key another Decision step uses, keeps the typed key with its error, and renames from the original key later', () => {
    const stepA = MakeDecisionStep('a', intentConfig('triage'), { Name: 'Step A' });
    const stepB = MakeDecisionStep('b', intentConfig('triage_2'), { Name: 'Step B' });
    const readsA = MakePath('pa', 'a', { Condition: "decisions.triage.intent.value === 'a'" });
    const readsB = MakePath('pb', 'b', { Condition: "decisions.triage_2.intent.value === 'b'" });
    panel.AllSteps = [stepA, stepB];
    panel.AllPaths = [readsA, readsB];
    panel.Step = stepB;

    typeKey(panel, ['triage']);
    expect(panel.DecisionKeyError).toContain('Decision step "Step A" already uses the key "triage"');
    panel.OnDecisionKeyCommit();
    expect(storedKey(panel)).toBe('triage_2');
    expect(panel.DecisionKeyText).toBe('triage');
    expect(emittedPaths).toEqual([]);

    typeKey(panel, ['triage_b']);
    expect(panel.DecisionKeyError).toBeNull();
    panel.OnDecisionKeyCommit();
    expect(storedKey(panel)).toBe('triage_b');
    expect(readsB.Condition).toBe("decisions.triage_b.intent.value === 'b'");
    expect(readsA.Condition).toBe("decisions.triage.intent.value === 'a'");
  });

  it('refuses a key a condition cannot name, in the runtime\'s words, and does not strand the conditions', () => {
    const step = MakeDecisionStep('s1', intentConfig('triage'));
    const reads = MakePath('p1', 's1', { Condition: "decisions.triage.intent.value === 'a'" });
    panel.Step = step;
    panel.AllSteps = [step];
    panel.AllPaths = [reads];

    for (const bad of ['my key', '1st', '']) {
      typeKey(panel, [bad]);
      panel.OnDecisionKeyCommit();
      expect(storedKey(panel)).toBe('triage');
      expect(panel.DecisionKeyError).toMatch(/cannot be named in a path condition|it has no key/i);
    }
    expect(reads.Condition).toBe("decisions.triage.intent.value === 'a'");

    typeKey(panel, ['my_key']);
    panel.OnDecisionKeyCommit();
    expect(reads.Condition).toBe("decisions.my_key.intent.value === 'a'");
  });

  it('stores a key without the whitespace around it, since the runtime would refuse it', () => {
    const step = MakeDecisionStep('s1', intentConfig('triage'));
    panel.Step = step;
    panel.AllSteps = [step];

    typeKey(panel, ['route ']);
    expect(panel.DecisionKeyError).toBeNull();
    panel.OnDecisionKeyCommit();
    expect(storedKey(panel)).toBe('route');
    expect(panel.DecisionKeyText).toBe('route');
  });

  it('does not move conditions when the old key was shared, since which step they meant cannot be told', () => {
    const stepA = MakeDecisionStep('a', intentConfig('triage'));
    const stepB = MakeDecisionStep('b', intentConfig('triage'));
    const reads = MakePath('p1', 'a', { Condition: "decisions.triage.intent.value === 'a'" });
    panel.AllSteps = [stepA, stepB];
    panel.AllPaths = [reads];
    panel.Step = stepB;

    expect(panel.RenameDecisionKey('triage_b')).toBeNull();
    expect(storedKey(panel)).toBe('triage_b');
    expect(reads.Condition).toBe("decisions.triage.intent.value === 'a'");
  });

  it('drops an uncommitted key when another step is selected', () => {
    const stepA = MakeDecisionStep('a', intentConfig('triage'));
    const stepB = MakeDecisionStep('b', intentConfig('route'));
    panel.AllSteps = [stepA, stepB];
    panel.Step = stepA;
    typeKey(panel, ['half typed']);

    panel.Step = stepB;
    expect(panel.DecisionKeyText).toBe('route');
    panel.Step = stepA;
    expect(panel.DecisionKeyText).toBe('triage');
    expect(panel.DecisionKeyError).toBeNull();
  });
});

describe('AgentPropertiesPanelComponent — Route on Answer & Coverage hint', () => {
  let panel: AgentPropertiesPanelComponent;

  const decisionStep = MakeDecisionStep('step-dec-1', {
    key: 'triage',
    state: 'payload.ticket',
    questions: {
      team: {
        kind: 'Choice',
        instructions: 'Route team',
        options: [
          { value: 'billing', description: 'Billing inquiries' },
          { value: 'support', description: 'Support help' },
          { value: 'sales', description: 'Sales opportunities' }
        ]
      },
      urgent: { kind: 'Likelihood', instructions: 'Is urgent?' },
      priority_rank: { kind: 'Score', instructions: 'Rate priority', levels: ['P3 - Low', 'P2 - Medium', 'P1 - High'] }
    }
  });

  beforeEach(() => {
    panel = new AgentPropertiesPanelComponent();
    panel.AllSteps = [decisionStep];
  });

  it('resolves OriginDecisionStep and OriginDecisionConfig for outgoing path', () => {
    panel.PathEntity = MakePath('path-1', 'step-dec-1', { DestinationStepID: 'step-dest-1' });
    panel.SelectedConnection = { ID: 'conn-1', SourceNodeID: 'step-dec-1', SourcePortID: 'p1', TargetNodeID: 'step-dest-1', TargetPortID: 'p2' };

    expect(panel.OriginDecisionStep?.ID).toBe('step-dec-1');
    expect(panel.OriginDecisionConfig?.key).toBe('triage');
    expect(panel.OriginDecisionQuestions.length).toBe(3);
  });

  it('generates condition for Choice question', () => {
    const path = MakePath('path-1', 'step-dec-1');
    panel.PathEntity = path;
    panel.OnRouteQuestionChange('team');
    panel.OnRouteChoiceOptionChange('billing');

    expect(panel.GetGeneratedRouteCondition()).toBe("decisions.triage.team.value === 'billing'");
    panel.ApplyRouteCondition();
    expect(path.Condition).toBe("decisions.triage.team.value === 'billing'");
  });

  it('generates condition for Likelihood question', () => {
    const path = MakePath('path-1', 'step-dec-1');
    panel.PathEntity = path;
    panel.OnRouteQuestionChange('urgent');
    panel.OnRouteLikelihoodThresholdChange(0.85);

    expect(panel.GetGeneratedRouteCondition()).toBe('decisions.triage.urgent.probability >= 0.85');
    panel.ApplyRouteCondition();
    expect(path.Condition).toBe('decisions.triage.urgent.probability >= 0.85');
  });

  it('generates condition for Score question', () => {
    const path = MakePath('path-1', 'step-dec-1');
    panel.PathEntity = path;
    panel.OnRouteQuestionChange('priority_rank');
    panel.OnRouteScoreLevelChange(2);

    expect(panel.GetGeneratedRouteCondition()).toBe('decisions.triage.priority_rank.value >= 2');
    panel.ApplyRouteCondition();
    expect(path.Condition).toBe('decisions.triage.priority_rank.value >= 2');
  });

  it('computes choice coverage hints correctly', () => {
    const path1 = MakePath('path-1', 'step-dec-1', { Condition: "decisions.triage.team.value === 'billing'" });
    const path2 = MakePath('path-2', 'step-dec-1', { Condition: "decisions.triage.team.value === 'support'" });
    panel.AllPaths = [path1, path2];
    panel.PathEntity = path1;
    panel.OnRouteQuestionChange('team');

    expect(panel.RouteChoiceCoverageHint).toBe('Paths cover 2 of 3 options (missing: sales)');

    const path3 = MakePath('path-3', 'step-dec-1', { Condition: "decisions.triage.team.value === 'sales'" });
    panel.AllPaths = [path1, path2, path3];
    expect(panel.RouteChoiceCoverageHint).toBe('Paths cover all 3 options');
  });
});
