import { describe, it, expect } from 'vitest';
import type { FeatureColumnSpec } from '@memberjunction/predictive-studio-core';
import { UnitModelLineageParser, type UnitModelLineage } from '../unit-model-lineage';

const status: FeatureColumnSpec = { name: 'Status', source: { kind: 'record-changes', entity: 'People', field: 'Status', keyField: 'PersonID' }, encoding: { kind: 'categorical', cardinalityCap: 50, method: 'onehot' }, missing: { impute: 'mode', indicator: true, constant: null } };
const events: FeatureColumnSpec = {
  name: 'Events90',
  source: { kind: 'windowed-aggregate', childEntity: 'Events', foreignKey: 'PersonID', ownerKeyField: null, dateField: 'EventDate', endDateField: null, voidedAtField: null, aggregate: 'count', valueField: null, windowDays: 90, filter: [{ field: 'Kind', op: 'in', values: ['a', 1, true] }] },
  encoding: { kind: 'numeric', nonNumericValue: 'fail' },
  missing: { impute: 'constant', indicator: true, constant: 0 },
};
const lineage: UnitModelLineage = {
  predictionUnitId: 'U-1', predictionUnitVersion: 2, labelVersion: 1, featureSpecVersion: 3, unitRowEntity: 'Years',
  featureSpec: [status, events], categoryLevels: { Status: ['Active', 'Lapsed'] },
};
/** The lineage as stored: the unit part beside the pipeline provenance. */
const stored = (over: Record<string, unknown> = {}) => JSON.stringify({ pipelineId: 'p', ...lineage, ...over });

describe('UnitModelLineageParser.ParseUnitModelLineage', () => {
  it('reads back the unit part of a stored lineage unchanged', () => {
    expect(UnitModelLineageParser.ParseUnitModelLineage(stored())).toEqual({ Ok: true, Value: lineage });
  });

  it('fails on text that is not JSON', () => {
    const r = UnitModelLineageParser.ParseUnitModelLineage('{not json');
    expect(r.Ok).toBe(false);
  });

  it('fails a featureSpec entry without an encoding, naming the entry', () => {
    const r = UnitModelLineageParser.ParseUnitModelLineage(stored({ featureSpec: [{ name: 'Status', source: status.source, missing: status.missing }] }));
    expect(r.Ok === false && r.Errors[0]).toMatch(/featureSpec\[0\].*encoding/);
  });

  it('fails a source kind it does not know, a non-string level and an empty unitRowEntity', () => {
    const badSource = UnitModelLineageParser.ParseUnitModelLineage(stored({ featureSpec: [{ ...status, source: { kind: 'current-value', entity: 'People', field: 'Status' } }] }));
    expect(badSource.Ok === false && badSource.Errors[0]).toMatch(/featureSpec\[0\]\.source/);
    const badLevels = UnitModelLineageParser.ParseUnitModelLineage(stored({ categoryLevels: { Status: ['Active', 3] } }));
    expect(badLevels.Ok === false && badLevels.Errors[0]).toMatch(/categoryLevels\.Status/);
    const noEntity = UnitModelLineageParser.ParseUnitModelLineage(stored({ unitRowEntity: '' }));
    expect(noEntity.Ok === false && noEntity.Errors[0]).toMatch(/unitRowEntity/);
  });

  it('fails a lineage with no unit part (a model trained without a unit)', () => {
    const r = UnitModelLineageParser.ParseUnitModelLineage(JSON.stringify({ pipelineId: 'p', targetEntityName: 'Members' }));
    expect(r.Ok === false && r.Errors[0]).toMatch(/predictionUnitId/);
  });
});
