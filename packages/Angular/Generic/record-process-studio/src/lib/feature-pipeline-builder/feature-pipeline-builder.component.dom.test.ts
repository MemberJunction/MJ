import '@angular/compiler';
import { ComponentFixture, getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, vi } from 'vitest';
import { EntityInfo, type RunViewParams, type RunViewResult } from '@memberjunction/core';
import { SafeJSONParse, UUIDsEqual } from '@memberjunction/global';
import { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import { FeaturePipelineBuilderComponent, ParseConfidenceFloor, type EscalationTargetCandidate } from './feature-pipeline-builder.component';
import type { DataFeatureSpec } from '@memberjunction/feature-pipelines';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

const ENTITIES = [
  new EntityInfo({
    ID: 'e1',
    Name: 'Accounts',
    DisplayName: 'Accounts',
    Fields: [
      {
        Name: 'Rating',
        Type: 'nvarchar',
        DisplayName: 'Rating',
        EntityFieldValues: [
          { Value: 'Hot', Description: 'High intent prospect' },
          { Value: 'Warm', Description: 'Engaged prospect' },
          { Value: 'Cold', Description: 'Unresponsive lead' },
        ],
      },
      {
        Name: 'ChurnRiskScore',
        Type: 'decimal',
        DisplayName: 'Churn Risk Score',
      },
      {
        Name: 'IsAtRisk',
        Type: 'bit',
        DisplayName: 'Is At Risk',
      },
      {
        Name: 'Summary',
        Type: 'nvarchar',
        DisplayName: 'Summary',
      },
    ],
  }),
];

/** The Record Process columns the builder reads and writes. */
const RECORD_PROCESS_ENTITY = new EntityInfo({
  ID: 'rp-entity',
  Name: 'MJ: Record Processes',
  Fields: ['ID', 'Name', 'Description', 'EntityID', 'Status', 'WorkType', 'PromptID', 'Configuration', 'OutputMapping', 'WatermarkStrategy', 'SkipUnchanged'].map(
    (Name) => ({ Name, IsPrimaryKey: Name === 'ID', AllowUpdateAPI: Name !== 'ID' })
  ),
});

const makeRecord = (spec?: Partial<DataFeatureSpec>): MJRecordProcessEntity => {
  const record = new MJRecordProcessEntity(RECORD_PROCESS_ENTITY);
  record.ID = 'rec1';
  record.Name = 'Customer Churn Predictor';
  record.Status = 'Active';
  record.Description = 'Predicts churn risk';
  record.EntityID = 'e1';
  record.PromptID = 'prompt-1';
  record.Configuration = JSON.stringify(spec ?? {
    PipelineType: 'LLM',
    Outputs: [
      {
        Name: 'ChurnRisk',
        Ref: 'risk',
        Target: { Mode: 'field', EntityFieldName: 'Rating' },
        Constraint: { Type: 'enum', Values: ['Hot', 'Warm', 'Cold'], OnViolation: 'fail' },
      },
    ],
  });
  return record;
};

function fakeProvider() {
  return Object.assign(createFakeProvider({ entities: ENTITIES }), {
    EntityByID: (id: string) => ENTITIES.find((e) => UUIDsEqual(e.ID, id)),
  });
}

/** A change event from a real <select>/<input> holding `value`, as the builder's handlers receive it. */
function eventWithValue(value: string, tag: 'select' | 'input' = 'select'): Event {
  const element = document.createElement(tag);
  if (element instanceof HTMLSelectElement) {
    const option = document.createElement('option');
    option.value = value;
    element.appendChild(option);
  }
  element.value = value;
  const event = new Event('change');
  element.dispatchEvent(event);
  return event;
}

/** A change event from a real checkbox, checked or not. */
function checkboxEvent(checked: boolean): Event {
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  const event = new Event('change');
  input.dispatchEvent(event);
  return event;
}

/** A RunView result, successful unless an error message is given. */
function runViewResult<T>(rows: T[], errorMessage?: string): RunViewResult<T> {
  return {
    Success: !errorMessage,
    Results: rows,
    RowCount: rows.length,
    TotalRowCount: rows.length,
    ExecutionTime: 0,
    ErrorMessage: errorMessage ?? '',
  };
}

/** The fake provider, with its RunView answered by `runView` (to fail, throw, or record the params). */
function providerWithRunView(runView: (params: RunViewParams) => Promise<RunViewResult>) {
  return Object.assign(fakeProvider(), { RunView: runView });
}

/** The spec the builder last wrote to the record. */
function savedSpec(record: MJRecordProcessEntity): DataFeatureSpec | null {
  return SafeJSONParse<DataFeatureSpec>(record.Configuration ?? '');
}

/** The output's constraint narrowed to its boolean variant; throws (failing the test) for any other type. */
function booleanConstraint(output: DataFeatureSpec['Outputs'][number]) {
  const constraint = output.Constraint;
  if (constraint?.Type !== 'boolean') {
    throw new Error(`expected a boolean constraint, got ${constraint?.Type ?? 'none'}`);
  }
  return constraint;
}

const render = (record: MJRecordProcessEntity, validity?: boolean[]) =>
  renderComponentFixture(FeaturePipelineBuilderComponent, {
    inputs: {
      Record: record,
      Provider: fakeProvider(),
      EntityID: record.EntityID,
    },
    setup: (instance) => {
      if (validity) {
        instance.ValidChange.subscribe((valid) => validity.push(valid));
      }
    },
  });

describe('FeaturePipelineBuilderComponent (DOM & Type Switching)', () => {
  it('renders the pipeline type picker and detects current pipeline type', () => {
    const rec = makeRecord();
    const f = render(rec);
    const typeSelect = query(f, '.fpb-type-sec select') as HTMLSelectElement;
    expect(typeSelect).not.toBeNull();
    expect(typeSelect.value).toBe('LLM');
    expect(f.componentInstance.IsDecisionPipeline).toBe(false);
  });

  it('filters target modes and constraint types for Decision pipelines', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'RiskScore',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'Rating' },
          Constraint: { Type: 'boolean', Threshold: 0.5, OnViolation: 'fail' },
        },
      ],
    });
    const f = render(rec);
    expect(f.componentInstance.IsDecisionPipeline).toBe(true);
    expect(f.componentInstance.AvailableTargetModes.map((m) => m.Value)).toEqual(['field']);
    expect(f.componentInstance.AvailableConstraintTypes.map((c) => c.Value)).toEqual(['boolean', 'enum', 'numeric']);
  });

  it('renders Decision numeric levels editor and supports adding levels', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'RiskLevel',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'Rating' },
          Constraint: { Type: 'numeric', Levels: ['Low', 'High'], OnViolation: 'fail' },
        },
      ],
    });
    const f = render(rec);
    const rows = queryAll(f, '.fpb-level-row');
    expect(rows.length).toBe(2);

    f.componentInstance.AddNumericLevel(0);
    f.detectChanges();

    const updatedRows = queryAll(f, '.fpb-level-row');
    expect(updatedRows.length).toBe(3);
  });

  it('renders Decision boolean threshold editor', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'IsAtRisk',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
          Constraint: { Type: 'boolean', Threshold: 0.75, OnViolation: 'fail' },
        },
      ],
    });
    const f = render(rec);
    const thresholdInput = query(f, 'input[type="number"]') as HTMLInputElement;
    expect(thresholdInput).not.toBeNull();
    expect(thresholdInput.value).toBe('0.75');
  });

  it('renders Decision enum value descriptions editor', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'Tier',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'Rating' },
          Constraint: {
            Type: 'enum',
            Values: ['Hot', 'Warm', 'Cold'],
            ValueDescriptions: { Hot: 'Immediate lead', Warm: 'In nurture', Cold: 'Disqualified' },
            OnViolation: 'fail',
          },
        },
      ],
    });
    const f = render(rec);
    const descRows = queryAll(f, '.fpb-enum-desc-row');
    expect(descRows.length).toBe(3);
  });

  it('shows confirm dialog when switching to Decision with incompatible output', () => {
    const rec = makeRecord({
      PipelineType: 'LLM',
      Outputs: [
        {
          Name: 'Summary',
          Ref: 'sum',
          Target: { Mode: 'field', EntityFieldName: 'Rating' },
          Constraint: { Type: 'freetext', MaxLength: 500, OnViolation: 'fail' },
        },
      ],
    });
    const f = render(rec);

    f.componentInstance.OnPipelineTypeSelect(eventWithValue('Decision'));

    expect(f.componentInstance.ShowTypeSwitchConfirm).toBe(true);
    expect(f.componentInstance.PendingPipelineType).toBe('Decision');
    expect(f.componentInstance.TypeSwitchIssues.length).toBeGreaterThan(0);

    // Cancel switch
    f.componentInstance.OnTypeSwitchCancelled();
    expect(f.componentInstance.ShowTypeSwitchConfirm).toBe(false);
    expect(f.componentInstance.CurrentPipelineTypeName).toBe('LLM');

    // Select again and confirm
    f.componentInstance.OnPipelineTypeSelect(eventWithValue('Decision'));
    f.componentInstance.OnTypeSwitchConfirmed();
    expect(f.componentInstance.ShowTypeSwitchConfirm).toBe(false);
    expect(f.componentInstance.CurrentPipelineTypeName).toBe('Decision');
  });

  it('lists unconstrained output and numeric output without levels when switching LLM to Decision in confirm dialog', () => {
    const rec = makeRecord({
      PipelineType: 'LLM',
      Outputs: [
        {
          Name: 'UnconstrainedOut',
          Ref: 'unconstrained',
          Target: { Mode: 'field', EntityFieldName: 'Rating' },
        },
        {
          Name: 'NumericMinMaxOut',
          Ref: 'numeric_min_max',
          Target: { Mode: 'field', EntityFieldName: 'ChurnRiskScore' },
          Constraint: { Type: 'numeric', Min: 0, Max: 100, OnViolation: 'fail' },
        },
      ],
    });
    const f = render(rec);

    f.componentInstance.OnPipelineTypeSelect(eventWithValue('Decision'));
    f.detectChanges();

    expect(f.componentInstance.ShowTypeSwitchConfirm).toBe(true);
    expect(f.componentInstance.PendingPipelineType).toBe('Decision');

    const issues = f.componentInstance.TypeSwitchIssues;
    expect(issues.some((msg) => msg.includes('UnconstrainedOut') && msg.includes('has no constraint'))).toBe(true);
    expect(issues.some((msg) => msg.includes('NumericMinMaxOut') && msg.includes('between 2 and 10 Level descriptions'))).toBe(true);

    const dialogEl = query(f, '.fpb-confirm-issues');
    expect(dialogEl).not.toBeNull();
    const issueItems = queryAll(f, '.fpb-confirm-issues li');
    expect(issueItems.length).toBe(issues.length);
  });

  it('does not mutate output.Constraint.Levels from GetNumericLevels template getter', () => {
    const output = {
      Name: 'NumOut',
      Ref: 'num',
      Target: { Mode: 'field' as const, EntityFieldName: 'ChurnRiskScore' },
      Constraint: { Type: 'numeric' as const, Min: 0, Max: 100, OnViolation: 'fail' as const },
    };
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [output],
    });
    const f = render(rec);
    const levels = f.componentInstance.GetNumericLevels(output);
    expect(levels).toEqual([]);
    expect(output.Constraint).toEqual({ Type: 'numeric', Min: 0, Max: 100, OnViolation: 'fail' });
  });

  it('handles optional boolean threshold without default or silent clamping', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'IsAtRisk',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
          Constraint: { Type: 'boolean', OnViolation: 'fail' },
        },
      ],
    });
    const f = render(rec);
    const out = f.componentInstance.spec.Outputs[0];
    expect(f.componentInstance.GetBooleanThreshold(out)).toBeNull();

    const thresholdInput = query(f, 'input[type="number"]') as HTMLInputElement;
    expect(thresholdInput).not.toBeNull();
    expect(thresholdInput.placeholder).toBe('0.5');
    expect(thresholdInput.value).toBe('');

    f.componentInstance.UpdateBooleanThreshold(0, eventWithValue('1.5', 'input'));
    expect(booleanConstraint(out).Threshold).toBe(1.5);

    f.componentInstance.UpdateBooleanThreshold(0, eventWithValue('', 'input'));
    expect(booleanConstraint(out).Threshold).toBeUndefined();
    expect(f.componentInstance.GetBooleanThreshold(out)).toBeNull();
  });

  it('does not write default threshold when adding output in Decision pipeline', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [],
    });
    const f = render(rec);
    f.componentInstance.addOutput();
    const newOut = f.componentInstance.spec.Outputs[0];
    expect(newOut.Constraint?.Type).toBe('boolean');
    expect(booleanConstraint(newOut).Threshold).toBeUndefined();
  });

  it('shows inactive or unrecognized pipeline types as selected options', () => {
    const rec = makeRecord({
      PipelineType: 'CustomLegacy',
      Outputs: [
        {
          Name: 'Out1',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'Rating' },
        },
      ],
    });
    const f = render(rec);
    const opt = f.componentInstance.AvailablePipelineTypes.find((t) => t.Name === 'CustomLegacy');
    expect(opt).toBeDefined();
    expect(opt?.DisplayName).toBe('CustomLegacy (unrecognized)');
  });

  it('renders escalation section only for Decision pipelines', () => {
    const llmRec = makeRecord({ PipelineType: 'LLM' });
    const f1 = render(llmRec);
    expect(query(f1, '.fpb-escalation-sec')).toBeNull();

    const decisionRec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'IsAtRisk',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
          Constraint: { Type: 'boolean', OnViolation: 'fail' },
        },
      ],
    });
    const f2 = render(decisionRec);
    expect(query(f2, '.fpb-escalation-sec')).not.toBeNull();
  });

  it('toggles escalation on and off and updates spec.Escalation', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'IsAtRisk',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
          Constraint: { Type: 'boolean', OnViolation: 'fail' },
        },
      ],
    });
    const f = render(rec);
    expect(f.componentInstance.IsEscalationEnabled).toBe(false);
    expect(f.componentInstance.spec.Escalation).toBeUndefined();

    // Toggle ON
    f.componentInstance.OnEscalationToggle(checkboxEvent(true));
    f.detectChanges();
    expect(f.componentInstance.IsEscalationEnabled).toBe(true);
    expect(f.componentInstance.spec.Escalation).toEqual({
      PipelineID: '',
      BelowConfidence: 0.7,
    });

    // Toggle OFF
    f.componentInstance.OnEscalationToggle(checkboxEvent(false));
    f.detectChanges();
    expect(f.componentInstance.IsEscalationEnabled).toBe(false);
    expect(f.componentInstance.spec.Escalation).toBeUndefined();
  });

  it('populates escalation target candidates and identifies problems with invalid targets', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'IsAtRisk',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
          Constraint: { Type: 'boolean', OnViolation: 'fail' },
        },
      ],
      Escalation: {
        PipelineID: '',
        BelowConfidence: 0.7,
      },
    });
    const f = render(rec);

    const validCandidate: EscalationTargetCandidate = {
      ID: 'target-1',
      Name: 'Full LLM Pipeline',
      WorkType: 'Infer',
      PromptID: 'llm-prompt',
      Status: 'Active',
      EntityID: 'e1',
      Entity: 'Accounts',
      ParsedSpec: {
        Name: 'Full LLM Pipeline',
        Description: 'Full LLM',
        PromptID: 'llm-prompt',
        Context: { Fields: ['Name'] },
        Caching: { Cacheable: false },
        Outputs: [
          {
            Name: 'IsAtRisk',
            Ref: '$',
            Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
          },
        ],
      },
    };

    const wrongEntityCandidate: EscalationTargetCandidate = {
      ID: 'target-2',
      Name: 'Wrong Entity Pipeline',
      WorkType: 'Infer',
      PromptID: 'llm-prompt',
      Status: 'Active',
      EntityID: 'e2',
      Entity: 'Contacts',
    };

    const missingOutputCandidate: EscalationTargetCandidate = {
      ID: 'target-3',
      Name: 'Incomplete Pipeline',
      WorkType: 'Infer',
      PromptID: 'llm-prompt',
      Status: 'Active',
      EntityID: 'e1',
      Entity: 'Accounts',
      ParsedSpec: {
        Name: 'Incomplete',
        Description: 'Incomplete',
        PromptID: 'llm-prompt',
        Context: { Fields: ['Name'] },
        Caching: { Cacheable: false },
        Outputs: [
          {
            Name: 'OtherOutput',
            Ref: '$',
            Target: { Mode: 'field', EntityFieldName: 'Rating' },
          },
        ],
      },
    };

    const decisionCandidate: EscalationTargetCandidate = {
      ID: 'target-4',
      Name: 'Another Decision Pipeline',
      WorkType: 'Infer',
      PromptID: 'llm-prompt',
      Status: 'Active',
      EntityID: 'e1',
      Entity: 'Accounts',
      ParsedSpec: {
        Name: 'Another Decision',
        Description: 'Another Decision',
        PromptID: 'decision-prompt',
        Context: { Fields: ['Name'] },
        Caching: { Cacheable: false },
        PipelineType: 'Decision',
        Outputs: [
          {
            Name: 'IsAtRisk',
            Ref: '$',
            Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
          },
        ],
      },
    };

    f.componentInstance.AvailableEscalationTargets = [
      validCandidate,
      wrongEntityCandidate,
      missingOutputCandidate,
      decisionCandidate,
    ];
    f.componentInstance.EscalationTargetsLoaded = true;
    f.detectChanges();

    expect(f.componentInstance.GetTargetProblem(validCandidate)).toBeNull();
    expect(f.componentInstance.GetTargetProblem(wrongEntityCandidate)).toContain("is on entity 'Contacts'");
    expect(f.componentInstance.GetTargetProblem(missingOutputCandidate)).toContain("it has no output named 'IsAtRisk'");
    expect(f.componentInstance.GetTargetProblem(decisionCandidate)).toContain("is a 'Decision' pipeline");

    // Select valid candidate
    f.componentInstance.OnEscalationTargetChange(eventWithValue('target-1'));
    expect(f.componentInstance.spec.Escalation?.PipelineID).toBe('target-1');
    expect(f.componentInstance.ValidationErrors.some((e) => e.Path === 'Escalation.PipelineID')).toBe(false);

    // Select invalid candidate
    f.componentInstance.OnEscalationTargetChange(eventWithValue('target-3'));
    expect(f.componentInstance.ValidationErrors.some((e) => e.Path === 'Escalation.PipelineID')).toBe(true);
  });

  it('stores the confidence floor as a number, keeping an out-of-range or blank entry for the spec check to report', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'IsAtRisk',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
          Constraint: { Type: 'boolean', OnViolation: 'fail' },
        },
      ],
      Escalation: {
        PipelineID: 'target-1',
        BelowConfidence: 0.7,
      },
    });
    const f = render(rec);
    const floorErrors = () => f.componentInstance.ValidationErrors.filter((e) => e.Path === 'Escalation.BelowConfidence').map((e) => e.Message);

    // A valid floor
    f.componentInstance.OnEscalationFloorChange(eventWithValue('0.85', 'input'));
    expect(f.componentInstance.spec.Escalation?.BelowConfidence).toBe(0.85);
    expect(savedSpec(rec)?.Escalation?.BelowConfidence).toBe(0.85);
    expect(floorErrors()).toEqual([]);

    // Out of range: kept as typed (not clamped), and reported
    f.componentInstance.OnEscalationFloorChange(eventWithValue('1.5', 'input'));
    expect(f.componentInstance.spec.Escalation?.BelowConfidence).toBe(1.5);
    expect(floorErrors()).toEqual([expect.stringContaining('but is 1.5')]);

    // Cleared: NaN, a number, reported; the pipeline keeps its target
    f.componentInstance.OnEscalationFloorChange(eventWithValue('', 'input'));
    expect(f.componentInstance.spec.Escalation).toEqual({ PipelineID: 'target-1', BelowConfidence: Number.NaN });
    expect(floorErrors()).toEqual([expect.stringContaining('but is NaN')]);
    // JSON has no NaN, so the record holds null, never a string
    expect(savedSpec(rec)?.Escalation?.BelowConfidence).toBeNull();
  });

  it('parses a confidence floor strictly, to NaN when blank or not a number', () => {
    expect(ParseConfidenceFloor(' 0.25 ')).toBe(0.25);
    expect(ParseConfidenceFloor('1e-1')).toBe(0.1);
    expect(ParseConfidenceFloor('')).toBeNaN();
    expect(ParseConfidenceFloor('   ')).toBeNaN();
    expect(ParseConfidenceFloor('0.7abc')).toBeNaN();
  });

  it('deletes Escalation when switching away from Decision pipeline', () => {
    const rec = makeRecord({
      PipelineType: 'Decision',
      Outputs: [
        {
          Name: 'IsAtRisk',
          Ref: '$',
          Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
          Constraint: { Type: 'boolean', OnViolation: 'fail' },
        },
      ],
      Escalation: {
        PipelineID: 'target-1',
        BelowConfidence: 0.7,
      },
    });
    const f = render(rec);
    expect(f.componentInstance.spec.Escalation).toBeDefined();

    // Switch to LLM
    f.componentInstance.ApplyPipelineTypeChange('LLM');
    expect(f.componentInstance.spec.Escalation).toBeUndefined();
    expect(f.componentInstance.IsEscalationEnabled).toBe(false);
  });

  describe('escalation targets', () => {
    const decisionWithTarget = (): MJRecordProcessEntity =>
      makeRecord({
        PipelineType: 'Decision',
        Outputs: [
          {
            Name: 'IsAtRisk',
            Ref: '$',
            Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
            Constraint: { Type: 'boolean', OnViolation: 'fail' },
          },
        ],
        Escalation: { PipelineID: 'target-1', BelowConfidence: 0.7 },
      });
    const renderWith = (record: MJRecordProcessEntity, provider: ReturnType<typeof fakeProvider>, validity?: boolean[]) =>
      renderComponentFixture(FeaturePipelineBuilderComponent, {
        inputs: { Record: record, Provider: provider, EntityID: record.EntityID },
        setup: (instance) => {
          if (validity) {
            instance.ValidChange.subscribe((valid) => validity.push(valid));
          }
        },
      });
    const targetIssues = (f: ReturnType<typeof renderWith>) =>
      f.componentInstance.ValidationErrors.filter((e) => e.Path === 'Escalation.PipelineID');

    it('reports a failed load as a failure to check the target, a warning, not as "target not found"', async () => {
      const validity: boolean[] = [];
      const f = renderWith(decisionWithTarget(), providerWithRunView(async () => runViewResult([], 'Timeout expired')), validity);

      await f.componentInstance.LoadEscalationTargets();

      expect(f.componentInstance.EscalationTargetsLoaded).toBe(false);
      expect(f.componentInstance.EscalationTargetsLoadError).toBe('Timeout expired');
      expect(targetIssues(f)).toEqual([
        expect.objectContaining({ Severity: 'warning', Message: expect.stringContaining('could not be loaded (Timeout expired)') }),
      ]);
      expect(targetIssues(f).some((e) => e.Message.includes('was not found'))).toBe(false);
      expect(validity[validity.length - 1]).toBe(true);
      expect(f.componentInstance.EscalationTargetsPlaceholder).toBe('— Pipelines could not be loaded —');
    });

    it('treats a load that throws the same way', async () => {
      const f = renderWith(
        decisionWithTarget(),
        providerWithRunView(async () => {
          throw new Error('network down');
        })
      );

      await f.componentInstance.LoadEscalationTargets();

      expect(f.componentInstance.EscalationTargetsLoadError).toBe('network down');
      expect(targetIssues(f).map((e) => e.Severity)).toEqual(['warning']);
    });

    it('still reports a target that a successful load did not find', async () => {
      const validity: boolean[] = [];
      const f = renderWith(decisionWithTarget(), providerWithRunView(async () => runViewResult([])), validity);

      await f.componentInstance.LoadEscalationTargets();

      expect(targetIssues(f)).toEqual([
        expect.objectContaining({ Severity: 'error', Message: "Escalation target pipeline 'target-1' was not found on this entity." }),
      ]);
      expect(validity[validity.length - 1]).toBe(false);
    });

    it('keeps the latest load when an earlier, slower one finishes after it', async () => {
      let releaseSlow: (result: RunViewResult) => void = () => undefined;
      const slow = new Promise<RunViewResult>((resolve) => {
        releaseSlow = resolve;
      });
      const answers = [() => slow, async () => runViewResult([{ ID: 'fresh', Name: 'Fresh', WorkType: 'Infer', Status: 'Active', EntityID: 'e1' }])];
      const f = renderWith(decisionWithTarget(), providerWithRunView(() => (answers.shift() ?? (async () => runViewResult([])))()));

      const earlier = f.componentInstance.LoadEscalationTargets();
      await f.componentInstance.LoadEscalationTargets();
      releaseSlow(runViewResult([{ ID: 'stale', Name: 'Stale', WorkType: 'Infer', Status: 'Active', EntityID: 'e1' }]));
      await earlier;

      expect(f.componentInstance.AvailableEscalationTargets.map((t) => t.ID)).toEqual(['fresh']);
    });

    it('loads nothing when the pipeline has no entity, and escapes the entity ID in the filter', async () => {
      const filters: Array<RunViewParams['ExtraFilter']> = [];
      const provider = providerWithRunView(async (params) => {
        if (params.EntityName === 'MJ: Record Processes') {
          filters.push(params.ExtraFilter);
        }
        return runViewResult([]);
      });
      const noEntity = decisionWithTarget();
      noEntity.EntityID = '';
      const f = renderWith(noEntity, provider);
      await f.whenStable();

      await f.componentInstance.LoadEscalationTargets();
      expect(filters).toEqual([]);

      noEntity.EntityID = "e'1";
      await f.componentInstance.LoadEscalationTargets();
      expect(filters).toEqual(["WorkType='Infer' AND EntityID='e''1'"]);
    });

    it("rejects a target whose own spec the engine would refuse to build", () => {
      const f = render(decisionWithTarget());
      const invalidSpec: EscalationTargetCandidate = {
        ID: 'target-5',
        Name: 'No Prompt Pipeline',
        WorkType: 'Infer',
        PromptID: 'llm-prompt',
        Status: 'Active',
        EntityID: 'e1',
        Entity: 'Accounts',
        ParsedSpec: {
          Name: 'No Prompt',
          Description: 'Missing its prompt',
          PromptID: '',
          Context: { Fields: ['Name'] },
          Caching: { Cacheable: false },
          Outputs: [{ Name: 'IsAtRisk', Ref: '$', Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' } }],
        },
      };

      expect(f.componentInstance.GetTargetProblem(invalidSpec)).toBe('has an invalid spec: DataFeatureSpec PromptID is required.');
    });

    it('rejects a target row with no PromptID, which the engine cannot build, and loads the column to check it', async () => {
      const fields: Array<RunViewParams['Fields']> = [];
      const f = renderWith(
        decisionWithTarget(),
        providerWithRunView(async (params) => {
          if (params.EntityName === 'MJ: Record Processes') {
            fields.push(params.Fields);
          }
          return runViewResult([]);
        })
      );
      await f.componentInstance.LoadEscalationTargets();
      const noPrompt: EscalationTargetCandidate = {
        ID: 'target-6',
        Name: 'Promptless Pipeline',
        WorkType: 'Infer',
        PromptID: null,
        Status: 'Active',
        EntityID: 'e1',
        Entity: 'Accounts',
        ParsedSpec: {
          Name: 'Promptless',
          Description: 'Its spec names a prompt, its row does not',
          PromptID: 'llm-prompt',
          Context: { Fields: ['Name'] },
          Caching: { Cacheable: false },
          Outputs: [{ Name: 'IsAtRisk', Ref: '$', Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' } }],
        },
      };

      expect(fields.at(-1)).toContain('PromptID');
      expect(f.componentInstance.GetTargetProblem(noPrompt)).toBe('has no PromptID; an Infer pipeline needs a prompt to run');
    });
  });

  describe('the capability rules, live', () => {
    const REASONING_ERROR = 'This pipeline type does not produce reasoning; turn off CaptureReasoning or use an LLM pipeline.';
    const isAtRisk = {
      Name: 'IsAtRisk',
      Ref: '$.isAtRisk',
      Target: { Mode: 'field' as const, EntityFieldName: 'IsAtRisk' },
      Constraint: { Type: 'boolean' as const, OnViolation: 'fail' as const },
    };

    it('reports a Decision freetext output as an error and emits ValidChange(false)', () => {
      const validity: boolean[] = [];
      const rec = makeRecord({
        PipelineType: 'Decision',
        Outputs: [
          {
            Name: 'Summary',
            Ref: '$.summary',
            Target: { Mode: 'field', EntityFieldName: 'Summary' },
            Constraint: { Type: 'freetext', MaxLength: 500 },
          },
        ],
      });

      const f = render(rec, validity);

      expect(f.componentInstance.ValidationErrors.map((e) => e.Message)).toContain(
        "Output 'Summary' has constraint type 'freetext', which this pipeline type cannot produce."
      );
      expect(validity.length).toBeGreaterThan(0);
      expect(validity[validity.length - 1]).toBe(false);
    });

    it('emits ValidChange(true) for the same output on an LLM pipeline', () => {
      const validity: boolean[] = [];
      const rec = makeRecord({
        Outputs: [
          {
            Name: 'Summary',
            Ref: '$.summary',
            Target: { Mode: 'field', EntityFieldName: 'Summary' },
            Constraint: { Type: 'freetext', MaxLength: 500 },
          },
        ],
      });

      render(rec, validity);

      expect(validity[validity.length - 1]).toBe(true);
    });

    it("loads CaptureReasoning, so a Decision pipeline shows the runtime's reasoning error", () => {
      const f = render(makeRecord({ PipelineType: 'Decision', CaptureReasoning: true, Outputs: [isAtRisk] }));

      expect(f.componentInstance.spec.CaptureReasoning).toBe(true);
      expect(f.componentInstance.ValidationErrors.map((e) => e.Message)).toContain(REASONING_ERROR);
      expect(query(f, '.fpb-reasoning-select')).not.toBeNull();
    });

    it('keeps CaptureReasoning and Watermark on the next edit', () => {
      const rec = makeRecord({
        CaptureReasoning: true,
        Watermark: { Enabled: true, Strategy: 'UpdatedAt' },
        Outputs: [isAtRisk],
      });
      const f = render(rec);

      f.componentInstance.UpdateBooleanThreshold(0, eventWithValue('0.6', 'input'));

      expect(savedSpec(rec)?.CaptureReasoning).toBe(true);
      expect(savedSpec(rec)?.Watermark).toEqual({ Enabled: true, Strategy: 'UpdatedAt' });
    });

    it('turning Capture Reasoning off clears the error and removes the flag from the record', () => {
      const validity: boolean[] = [];
      const rec = makeRecord({ PipelineType: 'Decision', CaptureReasoning: true, Outputs: [isAtRisk] });
      const f = render(rec, validity);

      f.componentInstance.UpdateCaptureReasoning(eventWithValue('false'));
      f.detectChanges();

      expect(f.componentInstance.ValidationErrors.map((e) => e.Message)).not.toContain(REASONING_ERROR);
      expect(savedSpec(rec)).not.toHaveProperty('CaptureReasoning');
      expect(validity[validity.length - 1]).toBe(true);
      expect(query(f, '.fpb-reasoning-select')).toBeNull();
    });
  });

  // A <select> whose options come from @for gets its [value] before the options exist, so the browser
  // falls back to the first option. These read what the user sees, not what the spec says.
  describe('the pickers show the saved values', () => {
    const CONTACTS = new EntityInfo({ ID: 'e2', Name: 'Contacts', DisplayName: 'Contacts', Fields: [] });

    /** A fake provider whose RunView answers each entity with the rows given for it, or none. */
    const providerWithRows = (rowsByEntity: Record<string, object[]>, entities: EntityInfo[] = ENTITIES) =>
      Object.assign(createFakeProvider({ entities, runViewResults: (params) => rowsByEntity[params.EntityName ?? ''] ?? [] }), {
        EntityByID: (id: string) => entities.find((e) => UUIDsEqual(e.ID, id)),
      });

    const renderWithProvider = (record: MJRecordProcessEntity, provider: ReturnType<typeof providerWithRows>) =>
      renderComponentFixture(FeaturePipelineBuilderComponent, {
        inputs: { Record: record, Provider: provider, EntityID: record.EntityID },
      });

    /** The <select> in the field under `root` whose label reads `label`. */
    const selectIn = (root: Element, label: string): HTMLSelectElement => {
      const field = Array.from(root.querySelectorAll('.field')).find((el) => el.querySelector('label')?.textContent?.trim() === label);
      const select = field?.querySelector('select');
      if (!select) {
        throw new Error(`no select labelled '${label}'`);
      }
      return select;
    };

    /** The first <select> in the builder whose label reads `label`. */
    const selectFor = (f: ComponentFixture<FeaturePipelineBuilderComponent>, label: string): HTMLSelectElement =>
      selectIn(f.nativeElement as Element, label);

    /** The text of the option the user sees. */
    const shownText = (select: HTMLSelectElement): string => select.options[select.selectedIndex]?.textContent?.trim() ?? '';

    it('shows a saved enum output as Enum, on its saved field', () => {
      const f = render(makeRecord());

      expect(selectFor(f, 'Constraint Type').value).toBe('enum');
      expect(selectFor(f, 'Target Field').value).toBe('Rating');
    });

    it('shows a saved Decision spec as Decision, with its numeric output as Numeric', () => {
      const f = render(
        makeRecord({
          PipelineType: 'Decision',
          Outputs: [
            {
              Name: 'RiskLevel',
              Ref: '$',
              Target: { Mode: 'field', EntityFieldName: 'ChurnRiskScore' },
              Constraint: { Type: 'numeric', Levels: ['Low', 'High'], OnViolation: 'fail' },
            },
          ],
        })
      );

      expect(selectFor(f, 'Pipeline Type').value).toBe('Decision');
      expect(selectFor(f, 'Constraint Type').value).toBe('numeric');
    });

    it('matches the saved pipeline type to the listed one whatever its case', () => {
      const record = makeRecord({ PipelineType: 'decision', Outputs: [] });
      const f = renderComponentFixture(FeaturePipelineBuilderComponent, {
        inputs: { Record: record, Provider: fakeProvider(), EntityID: record.EntityID },
        setup: (instance) => {
          instance.AvailablePipelineTypes = [{ Name: 'LLM' }, { Name: 'Decision' }];
        },
      });

      expect(selectFor(f, 'Pipeline Type').value).toBe('Decision');
    });

    it('shows the placeholder, not Boolean, for an unconstrained Decision output', () => {
      const f = render(
        makeRecord({
          PipelineType: 'Decision',
          Outputs: [{ Name: 'Left', Ref: '$', Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' } }],
        })
      );

      const select = selectFor(f, 'Constraint Type');
      expect(select.value).toBe('none');
      expect(shownText(select)).toBe('— Select Constraint —');
    });

    it('shows the placeholder for a Decision output kept with a constraint type Decision cannot produce', () => {
      const f = render(
        makeRecord({
          PipelineType: 'Decision',
          Outputs: [
            {
              Name: 'Summary',
              Ref: '$',
              Target: { Mode: 'field', EntityFieldName: 'Summary' },
              Constraint: { Type: 'freetext', MaxLength: 500, OnViolation: 'fail' },
            },
          ],
        })
      );

      expect(shownText(selectFor(f, 'Constraint Type'))).toBe('— Select Constraint —');
    });

    it('shows a saved tags output as Taxonomy Tags', () => {
      const f = render(
        makeRecord({
          Outputs: [{ Name: 'Topics', Ref: '$.topics', Target: { Mode: 'tags', RootTagID: 'root-1' } }],
        })
      );

      expect(selectFor(f, 'Target Mode').value).toBe('tags');
    });

    it('shows the placeholder for a Decision output kept with a target mode Decision cannot write', () => {
      const f = render(
        makeRecord({
          PipelineType: 'Decision',
          Outputs: [
            {
              Name: 'Topics',
              Ref: '$',
              Target: { Mode: 'tags', RootTagID: 'root-1' },
              Constraint: { Type: 'boolean', OnViolation: 'fail' },
            },
          ],
        })
      );

      const select = selectFor(f, 'Target Mode');
      expect(select.value).toBe('');
      expect(shownText(select)).toBe('— Select Target Mode —');
    });

    it('shows the placeholder for a saved field the entity no longer has', () => {
      const f = render(
        makeRecord({
          Outputs: [{ Name: 'Gone', Ref: '$', Target: { Mode: 'field', EntityFieldName: 'Dropped' } }],
        })
      );

      const select = selectFor(f, 'Target Field');
      expect(select.value).toBe('');
      expect(shownText(select)).toBe('— Select Column —');
    });

    it('shows a saved child entity once the entity list renders', async () => {
      const f = renderWithProvider(
        makeRecord({
          Outputs: [
            { Name: 'Kids', Ref: '$.kids', Target: { Mode: 'child', EntityName: 'Contacts', ParentField: 'AccountID', Map: {} } },
          ],
        }),
        providerWithRows({}, [...ENTITIES, CONTACTS])
      );

      await vi.waitFor(() => expect(selectFor(f, 'Child Entity').options.length).toBe(3));

      expect(selectFor(f, 'Child Entity').value).toBe('Contacts');
    });

    it('shows the saved prompt once the prompts load after the first render, whatever the ID case', async () => {
      const record = makeRecord();
      record.PromptID = 'PROMPT-1';
      const f = renderWithProvider(
        record,
        providerWithRows({
          'MJ: AI Prompts': [
            { ID: 'prompt-0', Name: 'Alpha', Description: null },
            { ID: 'prompt-1', Name: 'Beta', Description: null },
          ],
        })
      );

      await vi.waitFor(() => expect(selectFor(f, 'Prompt').options.length).toBe(3));

      const select = selectFor(f, 'Prompt');
      expect(select.value).toBe('prompt-1');
      expect(shownText(select)).toBe('Beta');
    });

    it('shows the saved entity document once the documents load after the first render', async () => {
      const f = renderWithProvider(
        makeRecord({ Context: { EntityDocumentID: 'doc-1' }, Outputs: [] }),
        providerWithRows({
          'MJ: Entity Documents': [
            { ID: 'doc-0', Name: 'Account Summary', EntityID: 'e1' },
            { ID: 'doc-1', Name: 'Account Detail', EntityID: 'e1' },
          ],
        })
      );

      await vi.waitFor(() => expect(selectFor(f, 'Entity Document').options.length).toBe(3));

      expect(selectFor(f, 'Entity Document').value).toBe('doc-1');
    });

    it('shows the placeholders when a switch to Decision leaves an output unconstrained and on tags', () => {
      const f = render(
        makeRecord({
          Outputs: [
            { Name: 'Left', Ref: '$', Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' } },
            { Name: 'Topics', Ref: '$', Target: { Mode: 'tags', RootTagID: 'root-1' }, Constraint: { Type: 'boolean', OnViolation: 'fail' } },
          ],
        })
      );
      const [constraintSelect] = queryAll(f, '.fpb-output-card').map((card) => selectIn(card, 'Constraint Type'));
      const tagsModeSelect = selectIn(queryAll(f, '.fpb-output-card')[1], 'Target Mode');
      expect(constraintSelect.value).toBe('none');
      expect(tagsModeSelect.value).toBe('tags');

      f.componentInstance.ApplyPipelineTypeChange('Decision');

      expect(shownText(constraintSelect)).toBe('— Select Constraint —');
      expect(shownText(tagsModeSelect)).toBe('— Select Target Mode —');
    });

    describe('the escalation target picker', () => {
      /** An Active LLM pipeline on the entity that produces the Decision pipeline's output, so the picker offers it. */
      const llmTarget = (ID: string, Name: string) => ({
        ID,
        Name,
        WorkType: 'Infer',
        Status: 'Active',
        EntityID: 'e1',
        Entity: 'Accounts',
        PromptID: 'llm-prompt',
        Configuration: JSON.stringify({
          Name,
          Description: Name,
          PromptID: 'llm-prompt',
          Context: { Fields: ['Name'] },
          Caching: { Cacheable: false },
          Outputs: [{ Name: 'IsAtRisk', Ref: '$', Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' } }],
        }),
      });
      const decisionEscalatingTo = (pipelineID: string) =>
        makeRecord({
          PipelineType: 'Decision',
          Outputs: [
            {
              Name: 'IsAtRisk',
              Ref: '$',
              Target: { Mode: 'field', EntityFieldName: 'IsAtRisk' },
              Constraint: { Type: 'boolean', OnViolation: 'fail' },
            },
          ],
          Escalation: { PipelineID: pipelineID, BelowConfidence: 0.7 },
        });
      const renderWithTargets = async (pipelineID: string) => {
        const f = renderWithProvider(
          decisionEscalatingTo(pipelineID),
          providerWithRows({ 'MJ: Record Processes': [llmTarget('t-a', 'Alpha'), llmTarget('t-b', 'Beta')] })
        );
        await vi.waitFor(() => expect(selectFor(f, 'Target LLM Pipeline').options.length).toBe(3));
        return f;
      };

      it('shows the saved target once the targets load after the first render', async () => {
        const f = await renderWithTargets('t-b');

        const select = selectFor(f, 'Target LLM Pipeline');
        expect(Array.from(select.options).map((o) => o.disabled)).toEqual([true, false, false]);
        expect(select.value).toBe('t-b');
        expect(shownText(select)).toBe('Beta');
      });

      it('matches a saved target ID in another case', async () => {
        const f = await renderWithTargets('T-B');

        expect(selectFor(f, 'Target LLM Pipeline').value).toBe('t-b');
        expect(f.componentInstance.ValidationErrors.filter((e) => e.Path === 'Escalation.PipelineID')).toEqual([]);
      });

      it('shows the placeholder when the saved target is not among the loaded pipelines', async () => {
        const f = await renderWithTargets('t-gone');

        const select = selectFor(f, 'Target LLM Pipeline');
        expect(select.value).toBe('');
        expect(shownText(select)).toBe('— Select LLM Pipeline —');
      });
    });

    it('moves the constraint picker with the spec when the user changes the type', () => {
      const f = render(makeRecord());

      f.componentInstance.UpdateConstraintType(0, eventWithValue('boolean'));

      expect(selectFor(f, 'Constraint Type').value).toBe('boolean');
    });
  });
});
