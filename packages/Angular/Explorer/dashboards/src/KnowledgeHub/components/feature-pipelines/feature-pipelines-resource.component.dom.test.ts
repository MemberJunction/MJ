import '@angular/compiler';
import { getTestBed, TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NavigationService } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import {
  MJButtonDirective,
  MJPageBodyComponent,
  MJPageHeaderComponent,
  MJPageLayoutComponent,
  MJPageSearchComponent,
  MJRefreshButtonComponent,
  MJStatBadgeComponent,
} from '@memberjunction/ng-ui-components';
import { StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import type { IMetadataProvider, RemoteOpResult } from '@memberjunction/core';
import type { PredictiveStudioRunFeaturePipelineOutput } from '@memberjunction/core-entities';
import { FeaturePipelinesResourceComponent } from './feature-pipelines-resource.component';
import type { FeaturePipelineSummary } from './feature-pipeline.engine';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

const SUMMARY: FeaturePipelineSummary = {
  ID: 'rp-1', Name: 'Member Engagement', Description: null, Status: 'Active', WorkType: 'Infer', TargetEntityID: 'e-1', TargetEntity: 'Members',
  OutputAttribute: 'Score', OnDemandEnabled: true, ScheduleEnabled: false, LastRunAt: new Date(), LastRunStatus: 'Completed', LastRunProcessRunID: 'run-1',
  LastRunProcessed: 10, LastRunSuccess: 9, LastRunErrors: 1, LastRunOutcomeText: null, LastRunErrorMessage: null, PipelineType: 'LLM',
};

function render(pipeline: FeaturePipelineSummary, navigation: Partial<NavigationService> = {}): ComponentFixture<FeaturePipelinesResourceComponent> {
  // the base class's tab and query-param wiring and the engine load are not under test
  vi.spyOn(FeaturePipelinesResourceComponent.prototype, 'ngAfterViewInit').mockResolvedValue();
  vi.spyOn(FeaturePipelinesResourceComponent.prototype, 'ngOnInit').mockReturnValue();
  TestBed.configureTestingModule({
    // the page chrome, badges, search and buttons are the real light components; loading and empty states are stubs
    imports: [
      MJPageLayoutComponent, MJPageHeaderComponent, MJPageBodyComponent, MJPageSearchComponent, MJRefreshButtonComponent,
      MJStatBadgeComponent, MJButtonDirective, StubLoadingComponent, StubEmptyStateComponent,
    ],
    declarations: [FeaturePipelinesResourceComponent],
    providers: [{ provide: NavigationService, useValue: navigation }],
  });
  const fixture = TestBed.createComponent(FeaturePipelinesResourceComponent);
  fixture.componentInstance.IsLoading = false;
  fixture.componentInstance.AllPipelines = [pipeline];
  fixture.componentInstance.FilteredPipelines = [pipeline];
  fixture.detectChanges();
  return fixture;
}

const lastRunLine = (f: ComponentFixture<FeaturePipelinesResourceComponent>): string | undefined =>
  Array.from((f.nativeElement as Element).querySelectorAll('.fp-meta-row'))
    .map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim())
    .find((r) => r.startsWith('Last run'));

/** A RunFeaturePipeline result as the provider's RouteOperation returns it. */
function opResult(output: Partial<PredictiveStudioRunFeaturePipelineOutput>): RemoteOpResult<PredictiveStudioRunFeaturePipelineOutput> {
  return { Success: true, Output: { status: 'Completed', processed: 0, written: 0, skipped: 0, error: 0, ...output } };
}

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('Feature Pipelines card (DOM)', () => {
  it('reports the last run by the outcome text the engine built', () => {
    expect(lastRunLine(render({ ...SUMMARY, LastRunOutcomeText: '5 of 5 up to date (5 unchanged)' }))).toContain('· 5 of 5 up to date (5 unchanged)');
  });

  it('reports a run without a result summary as processed, not written', () => {
    expect(lastRunLine(render(SUMMARY))).toContain('9/10 processed');
  });

  it('shows a failed run\'s error message on the card', () => {
    const fixture = render({ ...SUMMARY, LastRunStatus: 'Failed', LastRunErrorMessage: 'Feature Pipeline version v6 is not activated' });

    expect((fixture.nativeElement as Element).querySelector('.fp-card__error')?.textContent).toContain('version v6 is not activated');
  });

  it('shows a refused run\'s error toast when Run is clicked, and returns it', async () => {
    const notify = vi.fn();
    const notifications: MJNotificationService = Object.create(MJNotificationService.prototype);
    notifications.CreateSimpleNotification = notify;
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(notifications);
    const component = render(SUMMARY).componentInstance;
    const provider: IMetadataProvider = Object.create(null);
    Object.assign(provider, { RouteOperation: vi.fn().mockResolvedValue(opResult({ status: 'Failed', errorMessage: 'version v6 is not activated' })) });
    component.Provider = provider;
    // the engine reload after a run fails on this provider double and logs it; that reload is not under test
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const notice = await component.OnRunPipeline(SUMMARY);

    expect(notify).toHaveBeenCalledWith('"Member Engagement" failed: version v6 is not activated', 'error', 5000);
    expect(notice?.Style).toBe('error');
  });
});

describe('RunFeaturePipeline agent tool', () => {
  type AgentTools = Parameters<NavigationService['SetAgentClientTools']>[1];

  /** Runs the registered tool for a pipeline whose run ends with `output`, and returns what the tool answers. */
  async function runTool(output: Partial<PredictiveStudioRunFeaturePipelineOutput>): Promise<unknown> {
    const notifications: MJNotificationService = Object.create(MJNotificationService.prototype);
    notifications.CreateSimpleNotification = vi.fn();
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(notifications);
    let tools: AgentTools = [];
    const component = render(SUMMARY, { SetAgentClientTools: (_caller, registered) => { tools = registered; } }).componentInstance;
    const provider: IMetadataProvider = Object.create(null);
    Object.assign(provider, { RouteOperation: vi.fn().mockResolvedValue(opResult(output)) });
    component.Provider = provider;
    // the engine reload after a run fails on this provider double and logs it; that reload is not under test
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    component['registerAgentTools']();
    const tool = tools.find((t) => t.Name === 'RunFeaturePipeline');
    if (!tool) {
      throw new Error('RunFeaturePipeline was not registered');
    }
    return tool.Handler({ pipeline: SUMMARY.Name });
  }

  it('reports a refused run as a failure with its message', async () => {
    expect(await runTool({ status: 'Failed', errorMessage: 'version v6 is not activated' })).toEqual({
      Success: false, ErrorMessage: '"Member Engagement" failed: version v6 is not activated',
    });
  });

  it('reports a cancelled run as a failure, not a success', async () => {
    expect(await runTool({ status: 'Cancelled' })).toEqual({
      Success: false, ErrorMessage: '"Member Engagement" did not finish: the run ended with status Cancelled',
    });
  });
});

describe('Feature Pipelines Run notice', () => {
  it('reports a cancelled run as a warning, not as finished', () => {
    expect(FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({ status: 'Cancelled' }))).toEqual({
      Style: 'warning', Completed: false, Message: '"Job Titles" did not finish: the run ended with status Cancelled',
    });
  });

  it('reports a completed run as finished, with its counts', () => {
    expect(FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({ processed: 5, written: 0, skipped: 5 }))).toEqual({
      Style: 'success', Completed: true, Message: '"Job Titles" finished: 5 processed, 0 succeeded, 5 skipped unchanged, 0 error(s).',
    });
  });
});
