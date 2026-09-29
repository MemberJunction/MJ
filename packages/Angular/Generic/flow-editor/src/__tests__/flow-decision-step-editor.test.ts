import { describe, it, expect, beforeEach } from 'vitest';
import { AgentFlowTransformerService, AGENT_STEP_TYPE_CONFIGS } from '../lib/agent-editor/agent-flow-transformer.service';
import { AgentPropertiesPanelComponent } from '../lib/agent-editor/agent-properties-panel.component';
import { GenerateUniqueDecisionKey } from '../lib/agent-editor/flow-agent-editor.component';
import type { MJAIAgentStepEntity, MJAIAgentStepPathEntity } from '@memberjunction/core-entities';

function createMockStep(options: {
  ID: string;
  Name?: string;
  StepType?: MJAIAgentStepEntity['StepType'];
  Configuration?: string | null;
  PromptID?: string | null;
  Status?: string;
}): MJAIAgentStepEntity {
  return {
    ID: options.ID,
    Name: options.Name ?? 'Test Step',
    StepType: options.StepType ?? 'Decision',
    Configuration: options.Configuration ?? null,
    PromptID: options.PromptID ?? null,
    Status: options.Status ?? 'Active',
    LoopBodyType: null,
    ActionInputMapping: null,
    ActionOutputMapping: null,
    OnErrorBehavior: 'fail',
    RetryCount: 0,
    TimeoutSeconds: 60,
  } as unknown as MJAIAgentStepEntity;
}

function createMockPath(options: {
  ID: string;
  OriginStepID: string;
  DestinationStepID?: string;
  Condition?: string | null;
  Description?: string | null;
  Priority?: number;
}): MJAIAgentStepPathEntity {
  return {
    ID: options.ID,
    OriginStepID: options.OriginStepID,
    DestinationStepID: options.DestinationStepID ?? 'dest-id',
    Condition: options.Condition ?? null,
    Description: options.Description ?? null,
    Priority: options.Priority ?? 0,
  } as unknown as MJAIAgentStepPathEntity;
}

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
    const validConfig = JSON.stringify({
      key: 'triage',
      state: 'payload.ticket',
      questions: {
        q1: { kind: 'Likelihood', instructions: 'Is urgent?' },
        q2: { kind: 'Choice', instructions: 'Pick route', options: [{ value: 'a', description: 'A' }, { value: 'b', description: 'B' }] }
      }
    });

    const step = createMockStep({ ID: 's1', StepType: 'Decision', Configuration: validConfig });
    expect(transformer.BuildStepSubtitle(step)).toBe('triage · 2 questions');
  });

  it('BuildStepSubtitle returns Unconfigured when configuration is missing or invalid', () => {
    const stepEmpty = createMockStep({ ID: 's1', StepType: 'Decision', Configuration: null });
    expect(transformer.BuildStepSubtitle(stepEmpty)).toBe('Unconfigured');

    const stepInvalid = createMockStep({ ID: 's1', StepType: 'Decision', Configuration: '{ invalid json' });
    expect(transformer.BuildStepSubtitle(stepInvalid)).toBe('Unconfigured');
  });

  it('BuildConfigWarningMessage reports validation errors from ReadFlowDecisionStepConfiguration', () => {
    const invalidConfig = JSON.stringify({
      key: '123-invalid-key',
      state: 'payload',
      questions: {}
    });
    const step = createMockStep({ ID: 's1', StepType: 'Decision', Configuration: invalidConfig });
    const warning = transformer.BuildConfigWarningMessage(step);
    expect(warning).not.toBeNull();
    expect(warning).toContain('cannot be named in a path condition');
  });

  it('BuildConfigWarningMessage returns null for valid Decision configuration', () => {
    const validConfig = JSON.stringify({
      key: 'triage',
      state: 'payload',
      questions: {
        urgent: { kind: 'Likelihood', instructions: 'Is it urgent?' }
      }
    });
    const step = createMockStep({ ID: 's1', StepType: 'Decision', Configuration: validConfig });
    expect(transformer.BuildConfigWarningMessage(step)).toBeNull();
  });

  it('IsStepMissingConfiguration returns true for missing or invalid configuration', () => {
    const stepEmpty = createMockStep({ ID: 's1', StepType: 'Decision', Configuration: null });
    expect(transformer.IsStepMissingConfiguration(stepEmpty)).toBe(true);

    const stepValid = createMockStep({
      ID: 's1',
      StepType: 'Decision',
      Configuration: JSON.stringify({
        key: 'triage',
        state: 'payload',
        questions: { q1: { kind: 'Likelihood', instructions: 'Test' } }
      })
    });
    expect(transformer.IsStepMissingConfiguration(stepValid)).toBe(false);
  });
});

describe('GenerateUniqueDecisionKey', () => {
  it('returns "decision" when no steps exist', () => {
    expect(GenerateUniqueDecisionKey([])).toBe('decision');
  });

  it('returns "decision" when other step types exist without Decision steps', () => {
    const steps = [
      createMockStep({ ID: 's1', StepType: 'Action' }),
      createMockStep({ ID: 's2', StepType: 'Prompt' })
    ];
    expect(GenerateUniqueDecisionKey(steps)).toBe('decision');
  });

  it('returns "decision_2" when "decision" already exists', () => {
    const steps = [
      createMockStep({
        ID: 's1',
        StepType: 'Decision',
        Configuration: JSON.stringify({ key: 'decision', state: 'payload', questions: {} })
      })
    ];
    expect(GenerateUniqueDecisionKey(steps)).toBe('decision_2');
  });

  it('returns "decision_3" when "decision" and "decision_2" exist', () => {
    const steps = [
      createMockStep({
        ID: 's1',
        StepType: 'Decision',
        Configuration: JSON.stringify({ key: 'decision', state: 'payload', questions: {} })
      }),
      createMockStep({
        ID: 's2',
        StepType: 'Decision',
        Configuration: JSON.stringify({ key: 'decision_2', state: 'payload', questions: {} })
      })
    ];
    expect(GenerateUniqueDecisionKey(steps)).toBe('decision_3');
  });

  it('fills gaps when numbering is sparse', () => {
    const steps = [
      createMockStep({
        ID: 's1',
        StepType: 'Decision',
        Configuration: JSON.stringify({ key: 'decision', state: 'payload', questions: {} })
      }),
      createMockStep({
        ID: 's2',
        StepType: 'Decision',
        Configuration: JSON.stringify({ key: 'decision_3', state: 'payload', questions: {} })
      })
    ];
    expect(GenerateUniqueDecisionKey(steps)).toBe('decision_2');
  });
});

describe('AgentPropertiesPanelComponent — Decision step properties', () => {
  let panel: AgentPropertiesPanelComponent;

  beforeEach(() => {
    panel = new AgentPropertiesPanelComponent();
  });

  it('correctly reports ShowDecisionConfig and StepTypeLabel', () => {
    panel.Step = createMockStep({ ID: 's1', StepType: 'Decision' });
    expect(panel.ShowDecisionConfig).toBe(true);
    expect(panel.StepTypeLabel).toBe('Decision');

    panel.Step = createMockStep({ ID: 's2', StepType: 'Action' });
    expect(panel.ShowDecisionConfig).toBe(false);
    expect(panel.StepTypeLabel).toBe('Action');
  });

  it('filters DecisionPrompts to only prompts bound to Decision model type', () => {
    panel.DecisionModelTypeID = 'decision-uuid';
    panel.Prompts = [
      { ID: 'p1', Name: 'General Prompt', AIModelType: 'LLM' },
      { ID: 'p2', Name: 'Classifier', AIModelType: 'Decision' },
      { ID: 'p3', Name: 'Router', AIModelTypeID: 'decision-uuid' },
      { ID: 'p4', Name: 'Chat Prompt', AIModelType: 'Chat' },
      { ID: 'p5', Name: 'Mismatched Prompt', AIModelType: 'Decision', AIModelTypeID: 'other-uuid' }
    ];

    const decisionPrompts = panel.DecisionPrompts;
    expect(decisionPrompts.length).toBe(2);
    expect(decisionPrompts.map(p => p.ID)).toEqual(['p2', 'p3']);
  });

  it('SelectedDecisionPromptName returns "Default Decision (system default)" when PromptID is null', () => {
    panel.Step = createMockStep({ ID: 's1', StepType: 'Decision', PromptID: null });
    expect(panel.SelectedDecisionPromptName).toBe('Default Decision (system default)');

    panel.Prompts = [{ ID: 'p1', Name: 'My Classifier', AIModelType: 'Decision' }];
    panel.Step = createMockStep({ ID: 's1', StepType: 'Decision', PromptID: 'p1' });
    expect(panel.SelectedDecisionPromptName).toBe('My Classifier');
  });

  it('DecisionKeyError enforces presence, pattern, and uniqueness', () => {
    const step1 = createMockStep({
      ID: 's1',
      StepType: 'Decision',
      Configuration: JSON.stringify({ key: 'triage', state: 'payload', questions: {} })
    });
    const step2 = createMockStep({
      ID: 's2',
      StepType: 'Decision',
      Configuration: JSON.stringify({ key: 'triage', state: 'payload', questions: {} })
    });

    panel.AllSteps = [step1, step2];
    panel.Step = step2;

    // Uniqueness violation
    expect(panel.DecisionKeyError).toContain('already used by another Decision step');

    // Pattern violation
    panel.Step.Configuration = JSON.stringify({ key: '123-bad', state: 'payload', questions: {} });
    expect(panel.DecisionKeyError).toContain('Key must start with a letter or underscore');

    // Required violation
    panel.Step.Configuration = JSON.stringify({ key: '', state: 'payload', questions: {} });
    expect(panel.DecisionKeyError).toContain('Key is required');

    // Valid unique key
    panel.Step.Configuration = JSON.stringify({ key: 'valid_key_2', state: 'payload', questions: {} });
    expect(panel.DecisionKeyError).toBeNull();
  });

  it('DecisionStateError validates state format', () => {
    panel.Step = createMockStep({
      ID: 's1',
      StepType: 'Decision',
      Configuration: JSON.stringify({ key: 'triage', state: 'payload', questions: {} })
    });
    expect(panel.DecisionStateError).toBeNull();

    panel.Step.Configuration = JSON.stringify({ key: 'triage', state: 'payload.ticket.details', questions: {} });
    expect(panel.DecisionStateError).toBeNull();

    panel.Step.Configuration = JSON.stringify({ key: 'triage', state: 'other_root.data', questions: {} });
    expect(panel.DecisionStateError).toContain('State must be "payload" or start with "payload."');
  });

  it('OnDecisionKeyChange renames key and rewrites references across AllPaths', () => {
    const step = createMockStep({
      ID: 's1',
      StepType: 'Decision',
      Configuration: JSON.stringify({ key: 'old_key', state: 'payload', questions: {} })
    });

    const path1 = createMockPath({
      ID: 'p1',
      OriginStepID: 's1',
      Condition: "decisions.old_key.urgent.value === 'yes'"
    });
    const path2 = createMockPath({
      ID: 'p2',
      OriginStepID: 's1',
      Condition: 'payload.count > 0'
    });

    panel.Step = step;
    panel.AllPaths = [path1, path2];

    let stepEmitted = false;
    let pathEmitted: MJAIAgentStepPathEntity | null = null;
    panel.StepChanged.subscribe(() => { stepEmitted = true; });
    panel.PathChanged.subscribe(p => { pathEmitted = p; });

    panel.OnDecisionKeyChange('new_key');

    expect(stepEmitted).toBe(true);
    expect(panel.DecisionConfig.key).toBe('new_key');
    expect(path1.Condition).toBe("decisions.new_key.urgent.value === 'yes'");
    expect(path2.Condition).toBe('payload.count > 0');
    expect(pathEmitted?.ID).toBe('p1');
  });

  it('manages question lifecycle (add, rename, remove, kind change)', () => {
    const step = createMockStep({
      ID: 's1',
      StepType: 'Decision',
      Configuration: JSON.stringify({ key: 'triage', state: 'payload', questions: {} })
    });
    panel.Step = step;

    // Add question
    panel.OnAddDecisionQuestion();
    expect(panel.DecisionQuestionsList.length).toBe(1);
    expect(panel.DecisionQuestionsList[0].key).toBe('question_1');
    expect(panel.DecisionQuestionsList[0].question.kind).toBe('Likelihood');

    // Change kind to Choice
    panel.OnDecisionQuestionKindChange('question_1', 'Choice');
    const choiceQ = panel.AsChoiceQuestion(panel.DecisionQuestionsList[0].question);
    expect(choiceQ.kind).toBe('Choice');
    expect(choiceQ.options.length).toBe(2);

    // Rename question key
    panel.OnDecisionQuestionKeyChange('question_1', 'route');
    expect(panel.DecisionQuestionsList[0].key).toBe('route');

    // Remove question
    panel.OnRemoveDecisionQuestion('route');
    expect(panel.DecisionQuestionsList.length).toBe(0);
  });

  it('manages choice options and score levels with reordering', () => {
    const step = createMockStep({
      ID: 's1',
      StepType: 'Decision',
      Configuration: JSON.stringify({
        key: 'triage',
        state: 'payload',
        questions: {
          intent: {
            kind: 'Choice',
            instructions: 'Select intent',
            options: [{ value: 'support', description: 'Tech help' }, { value: 'billing', description: 'Billing' }]
          },
          urgency: {
            kind: 'Score',
            instructions: 'Rate urgency',
            levels: ['Low', 'Medium', 'High']
          }
        }
      })
    });
    panel.Step = step;

    // Add choice option
    panel.OnAddChoiceOption('intent');
    let choiceQ = panel.AsChoiceQuestion(panel.DecisionConfig.questions['intent']);
    expect(choiceQ.options.length).toBe(3);

    // Edit choice option
    panel.OnChoiceOptionChange('intent', 2, 'value', 'sales');
    panel.OnChoiceOptionChange('intent', 2, 'description', 'Sales queries');
    choiceQ = panel.AsChoiceQuestion(panel.DecisionConfig.questions['intent']);
    expect(choiceQ.options[2]).toEqual({ value: 'sales', description: 'Sales queries' });

    // Remove choice option
    panel.OnRemoveChoiceOption('intent', 0);
    choiceQ = panel.AsChoiceQuestion(panel.DecisionConfig.questions['intent']);
    expect(choiceQ.options.length).toBe(2);
    expect(choiceQ.options[0].value).toBe('billing');

    // Score level reordering: move 'High' up from index 2 to index 1
    panel.OnMoveScoreLevel('urgency', 2, 'up');
    let scoreQ = panel.AsScoreQuestion(panel.DecisionConfig.questions['urgency']);
    expect(scoreQ.levels).toEqual(['Low', 'High', 'Medium']);

    // Move 'Low' down from index 0 to index 1
    panel.OnMoveScoreLevel('urgency', 0, 'down');
    scoreQ = panel.AsScoreQuestion(panel.DecisionConfig.questions['urgency']);
    expect(scoreQ.levels).toEqual(['High', 'Low', 'Medium']);
  });
});

describe('AgentPropertiesPanelComponent — Route on Answer & Coverage hint', () => {
  let panel: AgentPropertiesPanelComponent;

  const decisionStep = createMockStep({
    ID: 'step-dec-1',
    StepType: 'Decision',
    Configuration: JSON.stringify({
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
        urgent: {
          kind: 'Likelihood',
          instructions: 'Is urgent?'
        },
        priority_rank: {
          kind: 'Score',
          instructions: 'Rate priority',
          levels: ['P3 - Low', 'P2 - Medium', 'P1 - High']
        }
      }
    })
  });

  beforeEach(() => {
    panel = new AgentPropertiesPanelComponent();
    panel.AllSteps = [decisionStep];
  });

  it('resolves OriginDecisionStep and OriginDecisionConfig for outgoing path', () => {
    const path = createMockPath({
      ID: 'path-1',
      OriginStepID: 'step-dec-1',
      DestinationStepID: 'step-dest-1'
    });
    panel.PathEntity = path;
    panel.SelectedConnection = {
      ID: 'conn-1',
      SourceNodeID: 'step-dec-1',
      SourcePortID: 'p1',
      TargetNodeID: 'step-dest-1',
      TargetPortID: 'p2'
    };

    expect(panel.OriginDecisionStep?.ID).toBe('step-dec-1');
    expect(panel.OriginDecisionConfig?.key).toBe('triage');
    expect(panel.OriginDecisionQuestions.length).toBe(3);
  });

  it('generates condition for Choice question', () => {
    const path = createMockPath({
      ID: 'path-1',
      OriginStepID: 'step-dec-1'
    });
    panel.PathEntity = path;
    panel.OnRouteQuestionChange('team');
    panel.OnRouteChoiceOptionChange('billing');

    expect(panel.GetGeneratedRouteCondition()).toBe("decisions.triage.team.value === 'billing'");

    panel.ApplyRouteCondition();
    expect(path.Condition).toBe("decisions.triage.team.value === 'billing'");
  });

  it('generates condition for Likelihood question', () => {
    const path = createMockPath({
      ID: 'path-1',
      OriginStepID: 'step-dec-1'
    });
    panel.PathEntity = path;
    panel.OnRouteQuestionChange('urgent');
    panel.OnRouteLikelihoodThresholdChange(0.85);

    expect(panel.GetGeneratedRouteCondition()).toBe('decisions.triage.urgent.probability >= 0.85');

    panel.ApplyRouteCondition();
    expect(path.Condition).toBe('decisions.triage.urgent.probability >= 0.85');
  });

  it('generates condition for Score question', () => {
    const path = createMockPath({
      ID: 'path-1',
      OriginStepID: 'step-dec-1'
    });
    panel.PathEntity = path;
    panel.OnRouteQuestionChange('priority_rank');
    panel.OnRouteScoreLevelChange(2);

    expect(panel.GetGeneratedRouteCondition()).toBe('decisions.triage.priority_rank.value >= 2');

    panel.ApplyRouteCondition();
    expect(path.Condition).toBe('decisions.triage.priority_rank.value >= 2');
  });

  it('computes choice coverage hints correctly', () => {
    const path1 = createMockPath({
      ID: 'path-1',
      OriginStepID: 'step-dec-1',
      Condition: "decisions.triage.team.value === 'billing'"
    });
    const path2 = createMockPath({
      ID: 'path-2',
      OriginStepID: 'step-dec-1',
      Condition: "decisions.triage.team.value === 'support'"
    });

    panel.AllPaths = [path1, path2];
    panel.PathEntity = path1;
    panel.OnRouteQuestionChange('team');

    // 2 of 3 covered
    expect(panel.RouteChoiceCoverageHint).toBe('Paths cover 2 of 3 options (missing: sales)');

    // Add 3rd path
    const path3 = createMockPath({
      ID: 'path-3',
      OriginStepID: 'step-dec-1',
      Condition: "decisions.triage.team.value === 'sales'"
    });
    panel.AllPaths = [path1, path2, path3];

    expect(panel.RouteChoiceCoverageHint).toBe('Paths cover all 3 options');
  });
});
