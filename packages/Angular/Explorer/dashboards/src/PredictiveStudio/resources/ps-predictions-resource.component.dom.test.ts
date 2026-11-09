import '@angular/compiler';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { ComponentFixture } from '@angular/core/testing';
import { getTestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, Subject } from 'rxjs';
import type { IMetadataProvider } from '@memberjunction/core';
import { ResourceData, type MJListDetailEntity, type MJListEntity, type MJMLModelEntity, type MJMLTrainingPipelineEntity } from '@memberjunction/core-entities';
import { NavigationService } from '@memberjunction/ng-shared';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, CreateFakeProvider, Query } from '@memberjunction/ng-test-utils';
import { AtRiskRules, type AtRiskRow } from '@memberjunction/predictive-studio-core';
import { PredictiveStudioEngine } from '../engine/predictive-studio.engine';
import type { PredictionGridRowsLoadedEvent } from '../components/ps-predictions-grid.component';
import { PSPredictionsResourceComponent } from './ps-predictions-resource.component';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for the Predictions workspace (<mj-ps-predictions-resource>): the at-risk rows come from the embedded
 * grid's RowsLoaded event (the resource never reads the run itself), the capped notice, the model-switch reset, and the
 * "Send to a list" result line. The page chrome, the splitter and the grid are stubs; the engine is a double.
 */

@Component({ standalone: true, selector: 'mj-page-header-interior', template: '<ng-content></ng-content>' })
class PageHeaderInteriorStub {
  @Input() Title = '';
  @Input() Subtitle = '';
}

@Component({ standalone: true, selector: 'mj-page-body-interior', template: '<ng-content></ng-content>' })
class PageBodyInteriorStub {
  @Input() Flex = false;
  @Input() Padding = true;
}

@Component({ standalone: true, selector: 'as-split', template: '<ng-content></ng-content>' })
class SplitStub {
  @Input() direction = '';
  @Input() unit = '';
  @Input() gutterSize = 0;
  @Output() dragEnd = new EventEmitter<{ sizes: number[] }>();
}

@Component({ standalone: true, selector: 'as-split-area', template: '<ng-content></ng-content>' })
class SplitAreaStub {
  @Input() size = 0;
  @Input() minSize = 0;
  @Input() maxSize = 0;
}

@Component({ standalone: true, selector: 'mj-loading', template: '' })
class LoadingStub {
  @Input() text = '';
  @Input() size = '';
}

/** Stands in for <ps-predictions-grid>: records its run input and lets the test emit its outputs. */
@Component({ standalone: true, selector: 'ps-predictions-grid', template: '<div data-testid="grid-stub"></div>' })
class GridStub {
  @Input() modelId: string | null = null;
  @Input() runId: string | null = null;
  @Input() title: string | null = null;
  @Input() entityName: string | null = null;
  @Input() problemType: string | null = null;
  @Input() height = '';
  @Output() RowsLoaded = new EventEmitter<PredictionGridRowsLoadedEvent>();
  @Output() RowsLoadFailed = new EventEmitter<string>();
}

const MODEL_ID = 'M0000000-0000-4000-8000-000000000001';
const ENTITY_ID = 'E0000000-0000-4000-8000-000000000001';

const model = {
  ID: MODEL_ID,
  Status: 'Published',
  ProblemType: 'classification',
  TargetVariable: 'Renewed',
  HoldoutMetrics: JSON.stringify({ AUC: 0.86 }),
  Metrics: JSON.stringify({ AUC: 0.9 }),
  Lineage: null,
  FeatureImportance: null,
  PipelineID: 'P1',
  __mj_UpdatedAt: new Date('2026-10-01T00:00:00Z'),
} as unknown as MJMLModelEntity;

/** The engine members the workspace reads. `LoadRunDetails` must never be called: the grid reads the run. */
function fakeEngine() {
  return {
    Config: vi.fn(async () => undefined),
    Models: [model],
    Sessions: [],
    PublishedModels: [model],
    Pipelines: [{ ID: 'P1', TargetEntityID: ENTITY_ID } as unknown as MJMLTrainingPipelineEntity],
    ModelDisplayName: () => 'Who will renew?',
    LoadRecentRunsForModel: vi.fn(async () => [{ ID: 'run-1' }]),
    LoadRunDetails: vi.fn(async () => ({ Rows: [], Capped: false })),
  };
}

function fakeNavigation() {
  return {
    QueryParamChanged$: new Subject<never>(),
    ObserveTabQueryParams: () => of({}),
    UpdateTabQueryParams: vi.fn(),
    SetAgentContext: vi.fn(),
    SetAgentClientTools: vi.fn(),
  };
}

const row = (id: string, riskPct: number): AtRiskRow => {
  const band = AtRiskRules.RiskBandFor(riskPct / 100);
  const display = AtRiskRules.RiskBandDisplayFor(band);
  return { RecordID: id, Label: null, Score: 1 - riskPct / 100, RiskPct: riskPct, Class: null, Band: band, Status: display.Label, BadgeColor: display.BadgeColor, Icon: display.Icon, Drivers: null };
};

const settle = async (fixture: ComponentFixture<PSPredictionsResourceComponent>): Promise<void> => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
};

async function renderWorkspace(provider: IMetadataProvider = CreateFakeProvider({ entities: [{ ID: ENTITY_ID, Name: 'Members' }] })) {
  const engine = fakeEngine();
  vi.spyOn(PredictiveStudioEngine, 'GetProviderInstance').mockReturnValue(engine as unknown as PredictiveStudioEngine);
  const fixture = RenderComponentFixture(PSPredictionsResourceComponent, {
    imports: [MJButtonDirective, PageHeaderInteriorStub, PageBodyInteriorStub, SplitStub, SplitAreaStub, LoadingStub, GridStub],
    declarations: [PSPredictionsResourceComponent],
    providers: [{ provide: NavigationService, useValue: fakeNavigation() }],
    setup: (instance) => {
      instance.Provider = provider;
      instance.Data = new ResourceData({ Configuration: { tabId: 'predictions-tab', resourceType: 'Custom', driverClass: 'PredictiveStudioPredictionsResource' } });
      instance.LoadCompleteEvent = vi.fn();
    },
  });
  await settle(fixture);
  const resource = fixture.componentInstance;
  resource.Open(resource.Cards[0]);
  await settle(fixture);
  return { fixture, resource, engine };
}

/** The grid stub the workspace rendered, or null. */
const gridStub = (fixture: ComponentFixture<PSPredictionsResourceComponent>): GridStub | null => {
  const el = fixture.debugElement.query((d) => d.componentInstance instanceof GridStub);
  return el ? (el.componentInstance as GridStub) : null;
};

afterEach(() => vi.restoreAllMocks());

describe('PSPredictionsResourceComponent (DOM) — at-risk workspace', () => {
  it('passes the resolved latest run to the grid and takes its rows from RowsLoaded, never reading the run itself', async () => {
    const { fixture, resource, engine } = await renderWorkspace();
    const grid = gridStub(fixture);
    expect(grid?.runId).toBe('run-1');
    grid?.RowsLoaded.emit({ Rows: [row('a', 90), row('b', 20)], Capped: false });
    await settle(fixture);
    expect(resource.AtRiskRows.map((r) => r.RecordID)).toEqual(['a', 'b']);
    expect(resource.AtRiskLoading).toBe(false);
    expect(engine.LoadRunDetails).not.toHaveBeenCalled();
    expect(Query(fixture, '[data-testid="ps-atrisk-capped"]')).toBeNull();
  });

  it('shows the capped notice without promising list coverage', async () => {
    const { fixture } = await renderWorkspace();
    gridStub(fixture)?.RowsLoaded.emit({ Rows: [row('a', 90)], Capped: true });
    await settle(fixture);
    expect(Query(fixture, '[data-testid="ps-atrisk-capped"]')?.textContent?.trim()).toBe(
      'The latest run has more than 50,000 predictions; this list shows the first 50,000.',
    );
  });

  it('resets the rows and the capped notice when the prediction is reopened', async () => {
    const { fixture, resource } = await renderWorkspace();
    gridStub(fixture)?.RowsLoaded.emit({ Rows: [row('a', 90)], Capped: true });
    await settle(fixture);
    resource.BackToCatalog();
    resource.Open(resource.Cards[0]);
    fixture.detectChanges();
    expect(resource.AtRiskRows).toEqual([]);
    expect(resource.AtRiskCapped).toBe(false);
    expect(Query(fixture, '[data-testid="ps-atrisk-capped"]')).toBeNull();
  });

  it('reports how many of the qualifying records "Send to a list" added', async () => {
    const saved = { list: 0, details: 0 };
    const base = CreateFakeProvider({ entities: [{ ID: ENTITY_ID, Name: 'Members' }] });
    const provider = {
      ...base,
      GetEntityObject: vi.fn(async (entityName: string) =>
        entityName === 'MJ: Lists'
          ? ({ ID: 'L1', Name: '', Save: async () => ++saved.list > 0 } as unknown as MJListEntity)
          : ({ Save: async () => ++saved.details > 0 } as unknown as MJListDetailEntity),
      ),
    } as unknown as IMetadataProvider;
    const { fixture, resource } = await renderWorkspace(provider);
    // 250 records at or above the list's risk floor, plus 10 below it.
    const rows = [...Array.from({ length: 250 }, (_, i) => row(`hi-${i}`, 80)), ...Array.from({ length: 10 }, (_, i) => row(`lo-${i}`, 10))];
    gridStub(fixture)?.RowsLoaded.emit({ Rows: rows, Capped: false });
    await settle(fixture);
    await resource.SendToList();
    fixture.detectChanges();
    expect(saved.details).toBe(200);
    expect(Query(fixture, '[data-testid="ps-list-result"]')?.textContent).toContain('Added 200 of 250 at-risk records (highest risk first)');
  });
});
