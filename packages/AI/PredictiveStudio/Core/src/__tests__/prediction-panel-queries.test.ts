/**
 * The record panel's batched reads (§5.8.5), built once so the panel and gate G5.6 send the same `RunViews` (review
 * minor m7): the entity's Active bindings, the latest Model value per bound feature from the view entity, the Champion
 * history, and the record's pipeline values.
 */
import { describe, it, expect } from 'vitest';
import { PredictionViewAuthorization, PredictionPanelQueries } from '../prediction-panel-queries';

const ENTITY = 'E1';
const RECORD = "r'1";

describe('PredictionPanelQueries.For', () => {
  const queries = PredictionPanelQueries.For(ENTITY, RECORD, ['Renewal risk', "O'Brien score"]);

  it('reads the four sets in the documented positions', () => {
    expect(queries.map((q) => q.EntityName)).toEqual(['MJ: ML Model Scoring Bindings', 'MJ: Latest Feature Values', 'MJ: Feature Values', 'MJ: Feature Values']);
    const { Bindings, Latest, History, Derived } = PredictionPanelQueries.Index;
    expect([Bindings, Latest, History, Derived]).toEqual([0, 1, 2, 3]);
  });

  it('the bindings are the entity\'s Active ones', () => {
    expect(queries[PredictionPanelQueries.Index.Bindings].ExtraFilter).toBe("TargetEntityID='E1' AND Status='Active'");
  });

  it('the latest values and the Champion history are the record\'s Model rows of the bound features, escaped', () => {
    const record = "EntityID='E1' AND RecordID='r''1'";
    const features = " AND FeatureName IN ('Renewal risk','O''Brien score')";
    expect(queries[PredictionPanelQueries.Index.Latest].ExtraFilter).toBe(`${record} AND MLModelScoringBindingID IS NOT NULL${features}`);
    expect(queries[PredictionPanelQueries.Index.History].ExtraFilter).toBe(`${record} AND MLModelScoringBindingID IS NOT NULL AND Source='Model' AND Role='Champion'${features}`);
    expect(queries[PredictionPanelQueries.Index.History].OrderBy).toBe('EffectiveAsOf DESC, ComputedAt DESC');
  });

  it('the derived values are the record\'s pipeline rows', () => {
    expect(queries[PredictionPanelQueries.Index.Derived].ExtraFilter).toBe("EntityID='E1' AND RecordID='r''1' AND RecordProcessID IS NOT NULL AND Role='Champion'");
  });

  it('every value read bypasses the cache, so a fresh scoring run is read live', () => {
    expect(queries.slice(1, 3).every((q) => q.BypassCache === true)).toBe(true);
    expect(queries.every((q) => q.ResultType === 'simple' && q.Fields.length > 0)).toBe(true);
  });

  it('with no bound feature the value reads drop the feature filter', () => {
    const none = PredictionPanelQueries.For(ENTITY, 'r1', []);
    expect(none[PredictionPanelQueries.Index.Latest].ExtraFilter).toBe("EntityID='E1' AND RecordID='r1' AND MLModelScoringBindingID IS NOT NULL");
  });
});

describe('PredictionPanelQueries.Lineage', () => {
  it('reads the scoring models\' record-panel output bindings and the runs in the documented positions, escaped', () => {
    const q = PredictionPanelQueries.Lineage(['M1', "M'2"], ['RUN1']);
    const { OutputBindings, Runs } = PredictionPanelQueries.LineageIndex;
    expect([q[OutputBindings].EntityName, q[OutputBindings].ExtraFilter]).toEqual(['MJ: ML Output Bindings', "Surface='record-panel' AND ModelID IN ('M1','M''2')"]);
    expect([q[Runs].EntityName, q[Runs].ExtraFilter]).toEqual(['MJ: ML Scoring Runs', "ID IN ('RUN1')"]);
    expect(q[OutputBindings].BypassCache).toBe(true);
  });

  it('an empty ID list keeps its position and matches nothing', () => {
    const q = PredictionPanelQueries.Lineage([], ['RUN1']);
    expect(q.map((p) => p.ExtraFilter)).toEqual(["Surface='record-panel' AND 1=0", "ID IN ('RUN1')"]);
    expect(PredictionPanelQueries.Lineage(['M1'], [])[PredictionPanelQueries.LineageIndex.Runs].ExtraFilter).toBe('1=0');
  });
});

describe('PredictionViewAuthorization.FindDefault', () => {
  it('is the seeded "View Model Predictions" authorization', () => {
    expect(PredictionViewAuthorization.DefaultName).toBe('View Model Predictions');
  });

  it('matches the name trimmed and case-insensitive, the one rule the editor and the engine share', () => {
    const found = PredictionViewAuthorization.FindDefault([{ ID: 'A1', Name: 'Run Reports' }, { ID: 'A2', Name: ' view model PREDICTIONS ' }]);
    expect(found?.ID).toBe('A2');
  });

  it('is undefined when the authorization is not loaded', () => {
    expect(PredictionViewAuthorization.FindDefault([{ ID: 'A1', Name: 'Run Reports' }])).toBeUndefined();
  });
});
