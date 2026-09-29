import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect } from 'vitest';
import type { EntityInfo, EntityFieldInfo } from '@memberjunction/core';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { renderComponentFixture, query, queryAll, createFakeProvider } from '@memberjunction/ng-test-utils';
import { FeaturePipelineBuilderComponent } from './feature-pipeline-builder.component';
import type { DataFeatureSpec } from '@memberjunction/feature-pipelines';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

const ENTITIES = [
  {
    ID: 'e1',
    Name: 'Accounts',
    DisplayName: 'Accounts',
    Fields: [
      {
        Name: 'Rating',
        DisplayName: 'Rating',
        EntityFieldValues: [
          { Value: 'Hot', Description: 'High intent prospect' },
          { Value: 'Warm', Description: 'Engaged prospect' },
          { Value: 'Cold', Description: 'Unresponsive lead' },
        ],
      },
      {
        Name: 'ChurnRiskScore',
        DisplayName: 'Churn Risk Score',
      },
      {
        Name: 'IsAtRisk',
        DisplayName: 'Is At Risk',
      },
    ],
  },
] as Array<Partial<EntityInfo>>;

const makeRecord = (spec?: Partial<DataFeatureSpec>): MJRecordProcessEntity =>
  ({
    ID: 'rec1',
    Name: 'Customer Churn Predictor',
    Status: 'Active',
    Description: 'Predicts churn risk',
    EntityID: 'e1',
    Configuration: JSON.stringify(spec ?? {
      PipelineType: 'LLM',
      Outputs: [
        {
          Name: 'ChurnRisk',
          Ref: 'risk',
          Target: { Mode: 'field', EntityFieldName: 'Rating' },
          Constraint: { Type: 'enum', Values: ['Hot', 'Warm', 'Cold'], OnViolation: 'fail' },
        },
      ],
    }),
  } as unknown as MJRecordProcessEntity);

function fakeProvider() {
  const p = createFakeProvider({ entities: ENTITIES });
  Object.assign(p, {
    EntityByID: (id: string) => ENTITIES.find((e) => e.ID === id),
  });
  return p;
}

const render = (record: MJRecordProcessEntity) =>
  renderComponentFixture(FeaturePipelineBuilderComponent, {
    inputs: {
      Record: record,
      Provider: fakeProvider(),
      EntityID: record.EntityID,
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

    const makeSelectEvent = (val: string) => ({ target: { value: val } } as unknown as Event);
    f.componentInstance.OnPipelineTypeSelect(makeSelectEvent('Decision'));

    expect(f.componentInstance.ShowTypeSwitchConfirm).toBe(true);
    expect(f.componentInstance.PendingPipelineType).toBe('Decision');
    expect(f.componentInstance.TypeSwitchIssues.length).toBeGreaterThan(0);

    // Cancel switch
    f.componentInstance.OnTypeSwitchCancelled();
    expect(f.componentInstance.ShowTypeSwitchConfirm).toBe(false);
    expect(f.componentInstance.CurrentPipelineTypeName).toBe('LLM');

    // Select again and confirm
    f.componentInstance.OnPipelineTypeSelect(makeSelectEvent('Decision'));
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

    const makeSelectEvent = (val: string) => ({ target: { value: val } } as unknown as Event);
    f.componentInstance.OnPipelineTypeSelect(makeSelectEvent('Decision'));
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

    const inputEvent = (val: string) => ({ target: { value: val } } as unknown as Event);
    f.componentInstance.UpdateBooleanThreshold(0, inputEvent('1.5'));
    expect(out.Constraint?.Threshold).toBe(1.5);

    f.componentInstance.UpdateBooleanThreshold(0, inputEvent(''));
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
});
