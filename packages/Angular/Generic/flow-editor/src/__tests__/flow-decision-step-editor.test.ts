import { describe, it, expect, beforeEach } from 'vitest';
import type { MJAIAgentStepPathEntity } from '@memberjunction/core-entities';
import { DecisionChoiceTestOf, DecisionReferencesIn } from '@memberjunction/ai-core-plus';
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

  it('reports a state the runtime cannot resolve in the runtime reader\'s words, including "payload."', () => {
    const questions = { q: { kind: 'Likelihood', instructions: 'Is it?' } };
    panel.Step = MakeDecisionStep('s1', { key: 'triage', state: 'payload.ticket.details', questions });
    expect(panel.DecisionValidationError).toBeNull();

    for (const state of ['other_root.data', 'payload.']) {
      panel.Step = MakeDecisionStep('s1', { key: 'triage', state, questions });
      expect(panel.DecisionValidationError).toBe(`its state "${state}" is not "payload" or "payload.<path>"`);
    }
  });

  it('stores no state for an empty state field, which the runtime reads as the whole payload', () => {
    panel.Step = MakeDecisionStep('s1', { key: 'triage', state: 'payload.ticket', questions: {} });
    panel.OnDecisionStateChange('  ');
    expect(JSON.parse(panel.Step.Configuration ?? '{}')).not.toHaveProperty('state');
    panel.OnDecisionStateChange(' payload.order ');
    expect(panel.DecisionConfig.state).toBe('payload.order');
  });

  it('manages question lifecycle (add, rename, remove, kind change)', () => {
    panel.Step = MakeDecisionStep('s1', { key: 'triage', state: 'payload', questions: {} });

    panel.OnAddDecisionQuestion();
    expect(panel.DecisionQuestionsList.length).toBe(1);
    expect(panel.DecisionQuestionsList[0].key).toBe('question_1');
    expect(panel.DecisionQuestionsList[0].question.kind).toBe('Likelihood');

    panel.OnDecisionQuestionKindChange('question_1', 'Choice');
    expect(panel.DecisionQuestionsList[0].question.kind).toBe('Choice');
    expect(panel.ChoiceOptionsOf(panel.DecisionQuestionsList[0].question).length).toBe(2);

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

    const options = (): Array<{ value: string; description: string }> => panel.ChoiceOptionsOf(panel.DecisionConfig.questions['intent']);
    const levels = (): string[] => panel.ScoreLevelsOf(panel.DecisionConfig.questions['urgency']);

    panel.OnAddChoiceOption('intent');
    expect(options().length).toBe(3);

    panel.OnChoiceOptionChange('intent', 2, 'value', 'sales');
    panel.OnChoiceOptionChange('intent', 2, 'description', 'Sales queries');
    expect(options()[2]).toEqual({ value: 'sales', description: 'Sales queries' });

    panel.OnRemoveChoiceOption('intent', 0);
    expect(options().length).toBe(2);
    expect(options()[0].value).toBe('billing');

    panel.OnMoveScoreLevel('urgency', 2, 'up');
    expect(levels()).toEqual(['Low', 'High', 'Medium']);

    panel.OnMoveScoreLevel('urgency', 0, 'down');
    expect(levels()).toEqual(['High', 'Low', 'Medium']);
  });

  it('adds an option under a value no other option has', () => {
    panel.Step = MakeDecisionStep('s1', {
      key: 'triage',
      questions: {
        intent: {
          kind: 'Choice',
          instructions: 'Select intent',
          options: [{ value: 'option_1', description: 'One' }, { value: 'option_3', description: 'Three' }]
        }
      }
    });
    panel.OnAddChoiceOption('intent');
    expect(panel.ChoiceOptionsOf(panel.DecisionConfig.questions['intent']).map(o => o.value)).toEqual(['option_1', 'option_3', 'option_4']);
  });

  it('changes a question\'s kind only to a kind the editor offers', () => {
    panel.Step = MakeDecisionStep('s1', { key: 'triage', questions: { q: { kind: 'Likelihood', instructions: 'Is it?' } } });
    panel.OnDecisionQuestionKindSelect('q', 'Verdict');
    expect(panel.DecisionConfig.questions['q'].kind).toBe('Likelihood');
    panel.OnDecisionQuestionKindSelect('q', 'Score');
    expect(panel.DecisionConfig.questions['q'].kind).toBe('Score');
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
    panel.OnRouteLikelihoodThresholdChange('0.85');

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

describe('AgentPropertiesPanelComponent — question keys a condition can name (review should-fix 1)', () => {
  let panel: AgentPropertiesPanelComponent;

  beforeEach(() => {
    panel = new AgentPropertiesPanelComponent();
    panel.Step = MakeDecisionStep('s1', {
      key: 'triage',
      questions: {
        intent: { kind: 'Choice', instructions: 'Which team?', options: [{ value: 'a', description: 'A' }, { value: 'b', description: 'B' }] },
        urgent: { kind: 'Likelihood', instructions: 'Is it urgent?' }
      }
    });
  });

  it.each([
    ['my question', /cannot be named in a path condition/],
    ['bad-key', /cannot be named in a path condition/],
    ['1st', /cannot be named in a path condition/],
    ['', /needs a key/],
    ['   ', /needs a key/],
    ['urgent', /already asks a question keyed "urgent"/]
  ])('refuses the question key %p and keeps the question as it was', (typed, message) => {
    expect(panel.OnDecisionQuestionKeyChange('intent', typed)).toMatch(message);
    expect(panel.DecisionQuestionsList.map(q => q.key)).toEqual(['intent', 'urgent']);
    expect(panel.QuestionKeyError('intent')).toMatch(message);
    expect(panel.DecisionValidationError).toBeNull();
  });

  it('renames a question in place, and clears a refusal once a good key is committed', () => {
    panel.OnDecisionQuestionKeyChange('intent', 'my question');
    expect(panel.OnDecisionQuestionKeyChange('intent', ' category ')).toBeNull();
    expect(panel.DecisionQuestionsList.map(q => q.key)).toEqual(['category', 'urgent']);
    expect(panel.QuestionKeyError('category')).toBeNull();
    expect(panel.QuestionKeyError('intent')).toBeNull();
  });

  it('flags a stored question key a condition cannot name with dots', () => {
    panel.Step = MakeDecisionStep('s2', { key: 'triage', questions: { 'my question': { kind: 'Likelihood', instructions: 'Is it?' } } });
    expect(panel.QuestionKeyError('my question')).toMatch(/cannot be named in a path condition with dots/);
  });
});

describe('AgentPropertiesPanelComponent — Route on Answer writes conditions the runtime reads back (review should-fix 1)', () => {
  let panel: AgentPropertiesPanelComponent;

  const routeFrom = (questions: object): MJAIAgentStepPathEntity => {
    const origin = MakeDecisionStep('dec', { key: 'triage', questions });
    const path = MakePath('p1', 'dec', { Condition: 'payload.kept === true' });
    panel.AllSteps = [origin];
    panel.AllPaths = [path];
    panel.PathEntity = path;
    return path;
  };

  beforeEach(() => {
    panel = new AgentPropertiesPanelComponent();
  });

  it('writes a stored question key with a space in brackets, which the scanner reads as that question and not "my"', () => {
    routeFrom({ 'my question': { kind: 'Choice', instructions: 'Which?', options: [{ value: 'a', description: 'A' }, { value: 'b', description: 'B' }] } });
    panel.OnRouteChoiceOptionChange('a');

    const condition = panel.GetGeneratedRouteCondition();
    expect(condition).toBe("decisions.triage['my question'].value === 'a'");
    expect(DecisionReferencesIn(condition).References).toEqual([{ NodeId: 'triage', QuestionKey: 'my question', Field: 'value' }]);
    expect(DecisionChoiceTestOf(condition)).toEqual({ NodeId: 'triage', QuestionKey: 'my question', Values: ['a'] });
  });

  it('quotes an option holding an apostrophe with double quotes, so the Choice test and the coverage hint see it', () => {
    const path = routeFrom({
      intent: { kind: 'Choice', instructions: 'Which?', options: [{ value: "don't know", description: 'Unsure' }, { value: 'billing', description: 'Billing' }] }
    });
    panel.OnRouteChoiceOptionChange("don't know");

    expect(panel.GetGeneratedRouteCondition()).toBe('decisions.triage.intent.value === "don\'t know"');
    panel.ApplyRouteCondition();
    expect(DecisionChoiceTestOf(path.Condition ?? '')?.Values).toEqual(["don't know"]);
    expect(panel.RouteChoiceCoverageHint).toBe('Paths cover 1 of 2 options (missing: billing)');
  });

  it('refuses to write an option no literal can carry verbatim, and says why', () => {
    const path = routeFrom({
      intent: { kind: 'Choice', instructions: 'Which?', options: [{ value: 'both \' and "', description: 'Odd' }, { value: 'b', description: 'B' }] }
    });
    panel.OnRouteChoiceOptionChange('both \' and "');

    expect(panel.GetGeneratedRouteCondition()).toBe('');
    expect(panel.RouteConditionProblem).toMatch(/cannot be written in a condition/);
    panel.ApplyRouteCondition();
    expect(path.Condition).toBe('payload.kept === true');
  });

  it('writes nothing for a cleared threshold rather than probability >= 0 (review minor 3)', () => {
    const path = routeFrom({ urgent: { kind: 'Likelihood', instructions: 'Is it urgent?' } });

    panel.OnRouteLikelihoodThresholdChange('');
    expect(panel.RouteLikelihoodThreshold).toBeNull();
    expect(panel.GetGeneratedRouteCondition()).toBe('');
    expect(panel.RouteConditionProblem).toBe('Enter a probability threshold from 0 to 1');
    panel.ApplyRouteCondition();
    expect(path.Condition).toBe('payload.kept === true');
  });

  it.each(['1.5', '-0.1', 'abc'])('writes nothing for the threshold %p, which no probability can sensibly meet', (text) => {
    routeFrom({ urgent: { kind: 'Likelihood', instructions: 'Is it urgent?' } });
    panel.OnRouteLikelihoodThresholdChange(text);
    expect(panel.GetGeneratedRouteCondition()).toBe('');
  });

  it('writes the threshold as typed when it is a probability', () => {
    routeFrom({ urgent: { kind: 'Likelihood', instructions: 'Is it urgent?' } });
    panel.OnRouteLikelihoodThresholdChange(' 0.6 ');
    expect(panel.GetGeneratedRouteCondition()).toBe('decisions.triage.urgent.probability >= 0.6');
  });
});

describe('AgentPropertiesPanelComponent — renaming a question or option renames the paths that read it (review should-fix 2)', () => {
  let panel: AgentPropertiesPanelComponent;
  let emittedPaths: MJAIAgentStepPathEntity[];

  const triage = (): object => ({
    key: 'triage',
    questions: {
      intent: { kind: 'Choice', instructions: 'Which team?', options: [{ value: 'billing', description: 'Billing' }, { value: 'refund', description: 'Refunds' }] },
      urgent: { kind: 'Likelihood', instructions: 'Is it urgent?' }
    }
  });

  beforeEach(() => {
    panel = new AgentPropertiesPanelComponent();
    emittedPaths = [];
    panel.PathChanged.subscribe(p => emittedPaths.push(p));
  });

  it('renames the question in every path that reads it, and nothing else', () => {
    const step = MakeDecisionStep('dec', triage());
    const other = MakeDecisionStep('other', { key: 'route', questions: { intent: { kind: 'Likelihood', instructions: 'Other?' } } });
    const fromStep = MakePath('p1', 'dec', { Condition: "decisions.triage.intent.value === 'billing'" });
    const downstream = MakePath('p2', 'x', { Condition: "decisions.triage.intent.value === 'refund' && decisions.triage.urgent.probability > 0.5" });
    const otherStep = MakePath('p3', 'other', { Condition: 'decisions.route.intent.probability > 0.5' });
    panel.AllSteps = [step, other];
    panel.AllPaths = [fromStep, downstream, otherStep];
    panel.Step = step;

    expect(panel.OnDecisionQuestionKeyChange('intent', 'category')).toBeNull();

    expect(fromStep.Condition).toBe("decisions.triage.category.value === 'billing'");
    expect(downstream.Condition).toBe("decisions.triage.category.value === 'refund' && decisions.triage.urgent.probability > 0.5");
    expect(otherStep.Condition).toBe('decisions.route.intent.probability > 0.5');
    expect(emittedPaths.map(p => p.ID)).toEqual(['p1', 'p2']);
  });

  it('touches no path when a question rename is refused', () => {
    const step = MakeDecisionStep('dec', triage());
    const reads = MakePath('p1', 'dec', { Condition: "decisions.triage.intent.value === 'billing'" });
    panel.AllSteps = [step];
    panel.AllPaths = [reads];
    panel.Step = step;

    expect(panel.OnDecisionQuestionKeyChange('intent', 'urgent')).not.toBeNull();
    expect(reads.Condition).toBe("decisions.triage.intent.value === 'billing'");
    expect(emittedPaths).toEqual([]);
  });

  it('renames an option in the paths that compare the answer with it, on commit', () => {
    const step = MakeDecisionStep('dec', triage());
    const fork = MakePath('p1', 'dec', { Condition: "decisions.triage.intent.value === 'billing' || decisions.triage.intent.value === 'refund'" });
    const plain = MakePath('p2', 'dec', { Condition: "payload.team === 'billing'" });
    panel.AllSteps = [step];
    panel.AllPaths = [fork, plain];
    panel.Step = step;

    expect(panel.OnChoiceOptionValueChange('intent', 0, 'invoices')).toBeNull();

    expect(panel.ChoiceOptionsOf(panel.DecisionConfig.questions['intent']).map(o => o.value)).toEqual(['invoices', 'refund']);
    expect(fork.Condition).toBe("decisions.triage.intent.value === 'invoices' || decisions.triage.intent.value === 'refund'");
    expect(plain.Condition).toBe("payload.team === 'billing'");
  });

  it.each([
    ['', /needs a value/],
    ['refund', /already offers "refund"/],
    ['both \' and "', /cannot hold a backslash, a line break, or both kinds of quote/]
  ])('refuses the option value %p, keeping the option and its paths', (typed, message) => {
    const step = MakeDecisionStep('dec', triage());
    const reads = MakePath('p1', 'dec', { Condition: "decisions.triage.intent.value === 'billing'" });
    panel.AllSteps = [step];
    panel.AllPaths = [reads];
    panel.Step = step;

    expect(panel.OnChoiceOptionValueChange('intent', 0, typed)).toMatch(message);
    expect(panel.OptionValueError('intent', 0)).toMatch(message);
    expect(panel.ChoiceOptionsOf(panel.DecisionConfig.questions['intent'])[0].value).toBe('billing');
    expect(reads.Condition).toBe("decisions.triage.intent.value === 'billing'");
  });

  it('does not rewrite paths while the step shares its key with another step', () => {
    const step = MakeDecisionStep('dec', triage());
    const twin = MakeDecisionStep('twin', triage());
    const reads = MakePath('p1', 'twin', { Condition: "decisions.triage.intent.value === 'billing'" });
    panel.AllSteps = [step, twin];
    panel.AllPaths = [reads];
    panel.Step = step;

    panel.OnDecisionQuestionKeyChange('intent', 'category');
    panel.OnChoiceOptionValueChange('category', 0, 'invoices');
    expect(reads.Condition).toBe("decisions.triage.intent.value === 'billing'");
  });
});
