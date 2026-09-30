import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
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

/** The spec the builder last wrote to the record. */
function savedSpec(record: MJRecordProcessEntity): DataFeatureSpec | null {
  return SafeJSONParse<DataFeatureSpec>(record.Configuration ?? '');
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
    expect(output.Constraint.Levels).toBeUndefined();
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
    expect(out.Constraint?.Threshold).toBe(1.5);

    f.componentInstance.UpdateBooleanThreshold(0, eventWithValue('', 'input'));
    expect(out.Constraint?.Threshold).toBeUndefined();
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
    expect(newOut.Constraint?.Threshold).toBeUndefined();
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
      Status: 'Active',
      EntityID: 'e1',
      Entity: 'Accounts',
      ParsedSpec: {
        Name: 'Full LLM Pipeline',
        Description: 'Full LLM',
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
      Status: 'Active',
      EntityID: 'e2',
      Entity: 'Contacts',
    };

    const missingOutputCandidate: EscalationTargetCandidate = {
      ID: 'target-3',
      Name: 'Incomplete Pipeline',
      WorkType: 'Infer',
      Status: 'Active',
      EntityID: 'e1',
      Entity: 'Accounts',
      ParsedSpec: {
        Name: 'Incomplete',
        Description: 'Incomplete',
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
      Status: 'Active',
      EntityID: 'e1',
      Entity: 'Accounts',
      ParsedSpec: {
        Name: 'Another Decision',
        Description: 'Another Decision',
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
});
