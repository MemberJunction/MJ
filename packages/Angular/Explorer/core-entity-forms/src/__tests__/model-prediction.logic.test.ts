import { describe, it, expect } from 'vitest';
import { AuthorizationInfo, UserInfo } from '@memberjunction/core';
import {
    ModelPredictionLogic,
    MAX_DRIVERS,
    type PanelBindingRow,
    type PanelOutputBindingRow,
    type PanelRunRow,
    type PanelValueRow,
} from '../lib/panels/model-predictions/model-prediction.logic';

/** An authorization whose holders are named by user ID, so the ancestor walk is tested without a metadata provider. */
class HeldAuthorization extends AuthorizationInfo {
    constructor(init: { ID: string; Name: string; ParentID?: string | null }, private readonly holders: readonly string[]) {
        super({ IsActive: true, ParentID: null, ...init });
    }

    public override UserCanExecute(user: UserInfo): boolean {
        return this.holders.includes(user.ID);
    }
}

const user = (id: string, type = 'User'): UserInfo => new UserInfo(null, { ID: id, Name: id, Type: type });

const binding = (over: Partial<PanelBindingRow> = {}): PanelBindingRow => ({
    ID: 'B1', FeatureName: 'Renewal risk', MLTrainingPipelineID: 'P1', MLTrainingPipeline: 'Renewal',
    TargetEntityID: 'E1', ViewAuthorizationID: 'A-VIEW', Status: 'Active', LastScoredAt: null, ...over,
});

const DAY1 = new Date('2026-11-01T00:00:00Z');
const DAY3 = new Date('2026-11-03T00:00:00Z');

const value = (over: Partial<PanelValueRow> = {}): PanelValueRow => ({
    ID: 'V1', EntityID: 'E1', RecordID: 'R1', FeatureName: 'Renewal risk', Source: 'Model', EffectiveAsOf: DAY3, ComputedAt: DAY3,
    MLModelScoringBindingID: 'B1', MLModelID: 'M1', MLScoringRunID: 'RUN1', InTraining: false,
    ValueText: 'lapsed', ValueNumeric: 0.72, Confidence: 0.72,
    ValueJSON: JSON.stringify({
        Probabilities: { renewed: 0.28, lapsed: 0.72 },
        Drivers: [
            { sourceColumn: 'DaysSinceLogin', contribution: 0.9, effect: 'raises-adverse' },
            { sourceColumn: 'AutoRenew', contribution: 0.4, effect: 'lowers-adverse' },
        ],
    }),
    ...over,
});

const run = (over: Partial<PanelRunRow> = {}): PanelRunRow => ({ ID: 'RUN1', ModelID: 'M1', ModelVersion: 3, StartedAt: DAY3, ...over });

const recordPanel = (over: Partial<PanelOutputBindingRow> = {}): PanelOutputBindingRow => ({
    ID: 'OB1', ModelID: 'M1', Surface: 'record-panel', SortsBy: 'adverse-probability-desc', DriverDirectionRelativeTo: 'adverse-class', Label: 'Lapse risk', ...over,
});

describe('ModelPredictionLogic — number formatting', () => {
    it('ToNumber passes finite numbers and numeric strings, and returns null otherwise', () => {
        expect([ModelPredictionLogic.ToNumber(0.5), ModelPredictionLogic.ToNumber('  12 '), ModelPredictionLogic.ToNumber('Renewing'), ModelPredictionLogic.ToNumber(NaN), ModelPredictionLogic.ToNumber(null)])
            .toEqual([0.5, 12, null, null, null]);
    });
    it('BandFor splits [0,1] into neutral terciles and clamps', () => {
        expect([0, 0.33, 0.34, 0.66, 0.67, 1, -1, 2].map((v) => ModelPredictionLogic.BandFor(v))).toEqual(['low', 'low', 'mid', 'mid', 'high', 'high', 'low', 'high']);
    });
    it('GaugePct maps 0–1 to a clamped 0–100 integer', () => {
        expect([0, 0.724, 0.726, 1, -0.5, 1.5].map((v) => ModelPredictionLogic.GaugePct(v))).toEqual([0, 72, 73, 100, 0, 100]);
    });
    it('FormatDate returns null for a missing or invalid date and a short date otherwise', () => {
        expect(ModelPredictionLogic.FormatDate(null)).toBeNull();
        expect(ModelPredictionLogic.FormatDate('not a date')).toBeNull();
        expect(ModelPredictionLogic.FormatDate('2026-03-15T12:00:00Z')).toContain('2026');
    });
});

describe('ModelPredictionLogic.PanelQueries — the one batch the panel sends (G5.6 replays it)', () => {
    it('reads the Active bindings, the latest binding values, the Champion Model history and the record\'s pipeline values', () => {
        const q = ModelPredictionLogic.PanelQueries('E1', "R'1", []);
        expect(q.map((p) => p.EntityName)).toEqual(['MJ: ML Model Scoring Bindings', 'MJ: Latest Feature Values', 'MJ: Feature Values', 'MJ: Feature Values']);
        expect(q[0].ExtraFilter).toBe("TargetEntityID='E1' AND Status='Active'");
        expect(q[1].ExtraFilter).toBe("EntityID='E1' AND RecordID='R''1' AND MLModelScoringBindingID IS NOT NULL");
        expect(q[2].ExtraFilter).toBe("EntityID='E1' AND RecordID='R''1' AND MLModelScoringBindingID IS NOT NULL AND Source='Model' AND Role='Champion'");
        expect(q[3].ExtraFilter).toBe("EntityID='E1' AND RecordID='R''1' AND RecordProcessID IS NOT NULL AND Role='Champion'");
        expect(q.map((p) => p.ResultType)).toEqual(['simple', 'simple', 'simple', 'simple']);
    });
    it('reads the live values past the server cache: the virtual entity has no save event to invalidate it', () => {
        const q = ModelPredictionLogic.PanelQueries('E1', 'R1', []);
        expect(q.map((p) => p.BypassCache === true)).toEqual([false, true, true, false]);
    });
    it('narrows the value reads to the named features', () => {
        const q = ModelPredictionLogic.PanelQueries('E1', 'R1', ['Renewal risk', "Tier's"]);
        expect(q[1].ExtraFilter).toContain("AND FeatureName IN ('Renewal risk','Tier''s')");
        expect(q[2].ExtraFilter).toContain("AND FeatureName IN ('Renewal risk','Tier''s')");
    });
    it('LineageQueries reads the scoring models\' record-panel output bindings and the runs, skipping an empty list', () => {
        const q = ModelPredictionLogic.LineageQueries(['M1', 'M2'], ['RUN1']);
        expect(q.map((p) => [p.EntityName, p.ExtraFilter])).toEqual([
            ['MJ: ML Output Bindings', "Surface='record-panel' AND ModelID IN ('M1','M2')"],
            ['MJ: ML Scoring Runs', "ID IN ('RUN1')"],
        ]);
        expect(ModelPredictionLogic.LineageQueries([], []).length).toBe(0);
    });
});

describe('ModelPredictionLogic.AuthorizedBindings — the user holds the binding\'s view authorization', () => {
    const view = new HeldAuthorization({ ID: 'A-VIEW', Name: 'View Model Predictions' }, ['u-dev']);
    const child = new HeldAuthorization({ ID: 'A-CHILD', Name: 'Child', ParentID: 'A-VIEW' }, []);
    const all = [view, child];

    it('keeps a binding the user holds directly or through an ancestor, and drops the others', () => {
        const bindings = [binding({ ID: 'B1' }), binding({ ID: 'B2', ViewAuthorizationID: 'A-CHILD' }), binding({ ID: 'B3', ViewAuthorizationID: 'A-MISSING' })];
        expect(ModelPredictionLogic.AuthorizedBindings(bindings, user('u-dev'), all).map((b) => b.ID)).toEqual(['B1', 'B2']);
        expect(ModelPredictionLogic.AuthorizedBindings(bindings, user('u-ui'), all)).toEqual([]);
    });
    it('a binding with no view authorization matches no user, an Owner included (fail closed)', () => {
        expect(ModelPredictionLogic.AuthorizedBindings([binding({ ViewAuthorizationID: null })], user('u-dev'), all)).toEqual([]);
        expect(ModelPredictionLogic.AuthorizedBindings([binding({ ViewAuthorizationID: null })], user('u-owner', 'Owner'), all)).toEqual([]);
    });
    it('an Owner holds every authorization, as vwUserHeldAuthorizations states', () => {
        expect(ModelPredictionLogic.AuthorizedBindings([binding()], user('u-owner', 'Owner'), all).map((b) => b.ID)).toEqual(['B1']);
    });
});

describe('ModelPredictionLogic.BuildCard', () => {
    it('BuildCard reads the class order of the record-panel output binding, not the column', () => {
        const multiclass = value({
            ValueText: 'Gold', ValueNumeric: 0.3, Confidence: 0.7,
            ValueJSON: JSON.stringify({ Probabilities: { Bronze: 0.1, Silver: 0.2, Gold: 0.7 }, Drivers: [] }),
        });
        const card = ModelPredictionLogic.BuildCard(binding({ FeatureName: 'Tier' }), multiclass, [], recordPanel({ Label: 'Membership tier' }), run());
        expect(card?.Label).toBe('Membership tier');
        expect(card?.Class).toBe('Gold');
        expect(card?.Classes.map((c) => `${c.Class} ${c.Pct}%`)).toEqual(['Bronze 10%', 'Silver 20%', 'Gold 70%']);
    });
    it('a classification card shows the adverse probability with its risk band, the class and the probability of that class', () => {
        const card = ModelPredictionLogic.BuildCard(binding(), value(), [], null, run());
        expect([card?.Kind, card?.DisplayValue, card?.GaugePct, card?.Class, card?.ClassProbability, card?.StatusLabel, card?.BadgeColor]).toEqual(
            ['probability', '72%', 72, 'lapsed', '72%', 'High risk', 'red'],
        );
        expect(card?.Label).toBe('Renewal risk');
    });
    it('a regression card shows the point prediction and no risk band', () => {
        const card = ModelPredictionLogic.BuildCard(binding(), value({ ValueText: null, ValueNumeric: 1240.5, Confidence: null, ValueJSON: JSON.stringify({ Drivers: [] }) }), [], null, run());
        expect([card?.Kind, card?.DisplayValue, card?.StatusLabel, card?.Class]).toEqual(['numeric', (1240.5).toLocaleString(undefined, { maximumFractionDigits: 4 }), null, null]);
    });
    it('returns no card for a binding with no value for the record', () => {
        expect(ModelPredictionLogic.BuildCard(binding(), null, [], null, null)).toBeNull();
    });
    it('the lineage names the model version and the run, the as-of date and an optimistic in-training score', () => {
        const card = ModelPredictionLogic.BuildCard(binding(), value({ InTraining: true }), [], null, run({ ModelVersion: 4 }));
        expect(card?.Lineage).toMatchObject({ Source: 'Model', ModelVersion: 4, ScoringRunID: 'RUN1', InTraining: true });
        expect(card?.Lineage.AsOf).toContain('2026');
        expect(card?.Provenance).toBe('Renewal v4');
    });
    it('a person\'s value of the binding\'s feature has no model lineage', () => {
        const card = ModelPredictionLogic.BuildCard(binding(), value({ Source: 'Human', MLModelID: null, MLScoringRunID: null }), [], null, null);
        expect(card?.Lineage).toMatchObject({ Source: 'Human', ModelVersion: null, ScoringRunID: null });
    });
    it('signs the per-record drivers by the stored effect, or by the raw contribution when the output binding says so', () => {
        const adverse = ModelPredictionLogic.BuildCard(binding(), value(), [], recordPanel(), run());
        expect(adverse?.Drivers.map((d) => [d.Name, d.RaisesAdverse, d.RelativePct])).toEqual([['Days Since Login', true, 100], ['Auto Renew', false, 44]]);
        const raw = ModelPredictionLogic.BuildCard(binding(), value({ ValueJSON: JSON.stringify({ Drivers: [{ sourceColumn: 'AutoRenew', contribution: -0.4, effect: 'raises-adverse' }] }) }), [], recordPanel({ DriverDirectionRelativeTo: 'raw-contribution' }), run());
        expect(raw?.Drivers.map((d) => d.RaisesAdverse)).toEqual([false]);
    });
    it('keeps at most MAX_DRIVERS drivers, strongest first', () => {
        const drivers = Array.from({ length: MAX_DRIVERS + 2 }, (_, i) => ({ sourceColumn: `F${i}`, contribution: i + 1, effect: 'raises-adverse' }));
        const card = ModelPredictionLogic.BuildCard(binding(), value({ ValueJSON: JSON.stringify({ Drivers: drivers }) }), [], null, run());
        expect(card?.Drivers.length).toBe(MAX_DRIVERS);
        expect(card?.Drivers[0].Name).toBe(`F${MAX_DRIVERS + 1}`);
    });
    it('the history is the binding\'s Champion values in as-of order, plotted on a 0–1 scale for a probability', () => {
        const history = [value({ ID: 'H3', EffectiveAsOf: DAY3, ValueNumeric: 0.72 }), value({ ID: 'H1', EffectiveAsOf: DAY1, ValueNumeric: 0.6 })];
        const card = ModelPredictionLogic.BuildCard(binding(), value(), history, null, run());
        expect(card?.History.map((p) => [p.ID, p.Display])).toEqual([['H1', '60%'], ['H3', '72%']]);
        expect(card?.History.map((p) => p.Y)).toEqual([40, 28]);
        expect(card?.SparklinePoints).toBe('0,40 100,28');
    });
});
