import { describe, it, expect, afterEach } from 'vitest';
import { Component, Input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AuthorizationInfo, UserInfo, type BaseEntity, type CompositeKey, type EntityInfo, type IMetadataProvider, type RunViewParams } from '@memberjunction/core';
import type { FormContext } from '@memberjunction/ng-base-forms';
import { CreateFakeProvider, Query, QueryAll } from '@memberjunction/ng-test-utils';
import { PredictionPanelQueries } from '@memberjunction/predictive-studio-core';
import { ModelPredictionPanel } from './model-prediction.panel';
import type { PanelBindingRow, PanelOutputBindingRow, PanelRunRow, PanelValueRow } from './model-prediction.logic';
import type { FeatureValueRow } from '../feature-values/feature-values.logic';

/**
 * DOM coverage for <mj-model-prediction-panel> re-pointed at Feature Values (§5.8.5): the entity's Active bindings the
 * user holds, the latest value from `MJ: Latest Feature Values`, the Champion history from `MJ: Feature Values`, the
 * lineage and the "Derived values" section. `<mj-collapsible-panel>` is replaced by a content-projecting stub.
 */
@Component({ standalone: true, selector: 'mj-collapsible-panel', template: '<ng-content></ng-content>' })
class CollapsiblePanelStub {
    @Input() SectionKey = '';
    @Input() SectionName = '';
    @Input() Icon = '';
    @Input() Order: number | null = null;
    @Input() Form: FormDouble | null = null;
    @Input() FormContext: FormContext | null = null;
    @Input() BadgeCount: number | null = null;
}

/** The record members the panel reads: whether it is saved, its entity's ID and its compact key. */
type RecordDouble = Pick<BaseEntity, 'IsSaved'> & { EntityInfo: Pick<EntityInfo, 'ID'>; PrimaryKey: Pick<CompositeKey, 'ToCompactURLSegment'> };
/** The form members the panel reads: its provider. */
interface FormDouble { ProviderToUse: IMetadataProvider }

/** An authorization held by the users it names, so the panel's authorization check needs no role metadata. */
class HeldAuthorization extends AuthorizationInfo {
    constructor(id: string, private readonly holders: readonly string[]) {
        super({ ID: id, Name: id, IsActive: true, ParentID: null });
    }

    public override UserCanExecute(user: UserInfo): boolean {
        return this.holders.includes(user.ID);
    }
}

const developer = new UserInfo(null, { ID: 'u-dev', Name: 'Developer', Type: 'User' });
const uiOnly = new UserInfo(null, { ID: 'u-ui', Name: 'UI user', Type: 'User' });
const viewModelPredictions = new HeldAuthorization('A-VIEW', [developer.ID]);

const DAY1 = new Date('2026-11-01T00:00:00Z');
const DAY3 = new Date('2026-11-03T00:00:00Z');
const MODEL_VERSION = 3;

const binding: PanelBindingRow = {
    ID: 'B1', FeatureName: 'Renewal risk', MLTrainingPipelineID: 'P1', MLTrainingPipeline: 'Renewal', TargetEntityID: 'E1',
    ViewAuthorizationID: viewModelPredictions.ID, Status: 'Active', LastScoredAt: DAY3,
};

/** A Champion Model value of the binding for record R1. */
const Latest = (score: number, asOf: Date, over: Partial<PanelValueRow> = {}): PanelValueRow => ({
    ID: `V-${asOf.toISOString()}`, EntityID: 'E1', RecordID: 'R1', FeatureName: binding.FeatureName, Source: 'Model', EffectiveAsOf: asOf, ComputedAt: asOf,
    MLModelScoringBindingID: binding.ID, MLModelID: 'M1', MLScoringRunID: 'RUN1', InTraining: false,
    ValueText: 'lapsed', ValueNumeric: score, Confidence: score,
    ValueJSON: JSON.stringify({ Probabilities: { renewed: 1 - score, lapsed: score }, Drivers: [{ sourceColumn: 'DaysSinceLogin', contribution: 0.8, effect: 'raises-adverse' }] }),
    ...over,
});
const H = (score: number, asOf: Date): PanelValueRow => Latest(score, asOf);

/** A pipeline Feature Value of record R1. */
const P = (feature: string, text: string, confidence: number, version: number): FeatureValueRow => ({
    ID: `FV-${feature}`, RecordProcessID: 'RP1', RecordProcess: 'Member Features', FeatureName: feature,
    ValueText: text, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null, Source: 'Pipeline',
    Confidence: confidence, PipelineVersion: version, ComputedAt: DAY1, Reasoning: 'from the membership history', ProcessRunID: null,
});

const run: PanelRunRow = { ID: 'RUN1', ModelID: 'M1', ModelVersion: MODEL_VERSION, StartedAt: DAY3 };
const outputBinding: PanelOutputBindingRow = { ID: 'OB1', ModelID: 'M1', Surface: 'record-panel', SortsBy: 'adverse-probability-desc', DriverDirectionRelativeTo: 'adverse-class', Label: 'Lapse risk' };

interface RenderOptions {
    bindings: PanelBindingRow[];
    latest?: PanelValueRow[];
    history?: PanelValueRow[];
    pipelineValues?: FeatureValueRow[];
    user: UserInfo;
}

type ServedRow = PanelBindingRow | PanelValueRow | FeatureValueRow | PanelRunRow | PanelOutputBindingRow;

/** The rows each read returns, by entity and filter, as the server would serve them. */
function served(p: RunViewParams, o: RenderOptions): ServedRow[] {
    const filter = typeof p.ExtraFilter === 'string' ? p.ExtraFilter : '';
    switch (p.EntityName) {
        case 'MJ: ML Model Scoring Bindings': return o.bindings;
        case 'MJ: Latest Feature Values': return o.latest || [];
        case 'MJ: Feature Values': return filter.includes("Source='Model'") ? (o.history || []) : (o.pipelineValues || []);
        case 'MJ: ML Scoring Runs': return [run];
        case 'MJ: ML Output Bindings': return [outputBinding];
        default: return [];
    }
}

let reads: RunViewParams[] = [];

async function RenderPanel(o: RenderOptions): Promise<ComponentFixture<ModelPredictionPanel>> {
    reads = [];
    const provider = CreateFakeProvider<ServedRow>({ runViewResults: (p) => { reads.push(p); return served(p, o); } });
    const form: FormDouble = { ProviderToUse: Object.assign(provider, { CurrentUser: o.user, Authorizations: [viewModelPredictions] }) };
    const record: RecordDouble = { IsSaved: true, EntityInfo: { ID: 'E1' }, PrimaryKey: { ToCompactURLSegment: () => 'R1' } };
    TestBed.configureTestingModule({ imports: [CollapsiblePanelStub], declarations: [ModelPredictionPanel] });
    const fixture = TestBed.createComponent(ModelPredictionPanel);
    fixture.componentRef.setInput('Record', record);
    fixture.componentRef.setInput('FormComponent', form);
    fixture.detectChanges(false);
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.detectChanges(false);
    return fixture;
}

const Text = (f: ComponentFixture<ModelPredictionPanel>, testId: string): string => (Query(f, `[data-testid="${testId}"]`)?.textContent || '').replace(/\s+/g, ' ').trim();
const Count = (f: ComponentFixture<ModelPredictionPanel>, testId: string): number => QueryAll(f, `[data-testid="${testId}"]`).length;

afterEach(() => TestBed.resetTestingModule());

describe('ModelPredictionPanel (DOM) — predictions from Feature Values', () => {
    it('shows an authorized binding\'s value, probability, drivers, history and lineage', async () => {
        const f = await RenderPanel({ bindings: [binding], latest: [Latest(0.72, DAY3)], history: [H(0.6, DAY1), H(0.72, DAY3)], user: developer });
        expect(Text(f, 'ps-prediction-value')).toContain('72%');
        expect(Text(f, 'ps-prediction-class')).toContain('lapsed');
        expect(Text(f, 'ps-prediction-drivers')).toContain('Days Since Login');
        expect(Count(f, 'ps-prediction-history-point')).toBe(2);
        expect(Text(f, 'ps-prediction-lineage')).toContain(`v${MODEL_VERSION}`);
        expect(Text(f, 'ps-prediction-lineage')).toContain('RUN1');
        // the card names its binding, so a reader (the browser walk) finds one binding's card among several
        expect(f.nativeElement.querySelector('[data-testid="ps-prediction-card"]')?.getAttribute('data-binding-id')).toBe(binding.ID);
    });

    it('renders nothing for a user who holds none of the bindings\' authorizations', async () => {
        const f = await RenderPanel({ bindings: [binding], latest: [Latest(0.72, DAY3)], user: uiOnly });
        expect(f.nativeElement.querySelector('[data-testid="ps-prediction-card"]')).toBeNull();
        expect(f.nativeElement.textContent).not.toContain('72%');
    });

    it('marks a score of a training-set record as optimistic', async () => {
        const f = await RenderPanel({ bindings: [binding], latest: [Latest(0.72, DAY3, { InTraining: true })], user: developer });
        expect(Text(f, 'ps-prediction-lineage')).toContain('in the training set');
    });

    it('lists the record\'s pipeline features under Derived values with confidence and version', async () => {
        const f = await RenderPanel({ bindings: [], pipelineValues: [P('Tier', 'Gold', 0.81, 3)], user: uiOnly });
        expect(Text(f, 'ps-derived-values')).toContain('Tier');
        expect(Text(f, 'ps-derived-values')).toContain('Gold');
        expect(Text(f, 'ps-derived-values')).toContain('81%');
        expect(Text(f, 'ps-derived-values')).toContain('v3');
    });

    it('sends the Core panel batch G5.6 replays first and the lineage batch only for the values it shows, never the column or Process Run Details', async () => {
        await RenderPanel({ bindings: [binding], latest: [Latest(0.72, DAY3)], user: developer });
        expect(reads.slice(0, 4)).toEqual(PredictionPanelQueries.For('E1', 'R1', []));
        expect(reads.map((p) => p.EntityName)).toEqual([
            'MJ: ML Model Scoring Bindings', 'MJ: Latest Feature Values', 'MJ: Feature Values', 'MJ: Feature Values',
            'MJ: ML Output Bindings', 'MJ: ML Scoring Runs',
        ]);
    });

    it('a binding with no value for the record renders no card and no lineage read', async () => {
        const f = await RenderPanel({ bindings: [binding], latest: [], user: developer });
        expect(Count(f, 'ps-prediction-card')).toBe(0);
        expect(reads.some((p) => p.EntityName === 'MJ: ML Scoring Runs')).toBe(false);
    });

    it('drops a value of a binding the user does not hold even when the server returns it', async () => {
        const other = Latest(0.4, DAY3, { ID: 'V-other', MLModelScoringBindingID: 'B-OTHER', FeatureName: 'Other' });
        const f = await RenderPanel({ bindings: [binding], latest: [Latest(0.72, DAY3), other], user: developer });
        expect(Count(f, 'ps-prediction-card')).toBe(1);
        expect(f.nativeElement.textContent).not.toContain('40%');
    });
});
