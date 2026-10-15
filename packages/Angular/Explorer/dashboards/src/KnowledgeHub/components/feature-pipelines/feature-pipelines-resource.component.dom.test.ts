import '@angular/compiler';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { getTestBed, TestBed, type ComponentFixture } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { NavigationService } from '@memberjunction/ng-shared';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { IMetadataProvider, RemoteOpResult } from '@memberjunction/core';
import type { PredictiveStudioRunFeaturePipelineOutput } from '@memberjunction/core-entities';
import { FeaturePipelinesResourceComponent } from './feature-pipelines-resource.component';
import type { FeaturePipelineSummary } from './feature-pipeline.engine';

try {
  getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
} catch {
  // already initialized
}

/**
 * DOM coverage for the Feature Pipelines card's last-run lines: a real run reports what it wrote, a run without a
 * result summary reports the run row's counts as processed, and a newer dry run is its own line, never "written".
 * The card's data is set directly; the engine load that normally fills it is not run.
 */

const SUMMARY: FeaturePipelineSummary = {
  ID: 'rp-1', Name: 'Member Engagement', Description: null, Status: 'Active', WorkType: 'Infer', TargetEntityID: 'e-1', TargetEntity: 'Members',
  OutputAttribute: 'Score', OnDemandEnabled: true, ScheduleEnabled: false, LastRunAt: new Date(), LastRunStatus: 'Completed', LastRunProcessRunID: 'run-1',
  LastRunProcessed: 10, LastRunSuccess: 9, LastRunErrors: 1, LastRunResult: null, LastRunOutcome: null, LastRunOutcomeText: null, LastRunErrorMessage: null, LatestDryRun: null, PipelineType: 'LLM',
};

const REAL_RESULT = { RecordProcessID: 'rp-1', Pin: null, ParameterFidelity: null, Attempted: 10, Upserted: 6, Unchanged: 3, Previewed: 0, RejectedInvalid: 0, Failed: 1, Skipped: 0, HumanValuesPreserved: 0, BelowConfidence: 0, Status: 'completed' as const };

function render(pipeline: FeaturePipelineSummary): ComponentFixture<FeaturePipelinesResourceComponent> {
  // the base class's tab and query-param wiring and the engine load are not under test
  vi.spyOn(FeaturePipelinesResourceComponent.prototype, 'ngAfterViewInit').mockResolvedValue();
  vi.spyOn(FeaturePipelinesResourceComponent.prototype, 'ngOnInit').mockReturnValue();
  TestBed.configureTestingModule({
    declarations: [FeaturePipelinesResourceComponent],
    providers: [{ provide: NavigationService, useValue: {} }],
    schemas: [NO_ERRORS_SCHEMA],
  });
  const fixture = TestBed.createComponent(FeaturePipelinesResourceComponent);
  fixture.componentInstance.IsLoading = false;
  fixture.componentInstance.AllPipelines = [pipeline];
  fixture.componentInstance.FilteredPipelines = [pipeline];
  fixture.detectChanges();
  return fixture;
}

const metaRows = (f: ComponentFixture<FeaturePipelinesResourceComponent>): string[] =>
  Array.from((f.nativeElement as Element).querySelectorAll('.fp-meta-row')).map((r) => (r.textContent ?? '').replace(/\s+/g, ' ').trim());

afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('Feature Pipelines card last-run lines (DOM)', () => {
  it('reports a real run by the outcome text the engine built', () => {
    const rows = metaRows(render({
      ...SUMMARY, LastRunResult: REAL_RESULT, LastRunOutcome: { Written: 6, Unchanged: 3, Failed: 1, Total: 10 },
      LastRunOutcomeText: '6 written, 3 unchanged, 1 failed of 10',
    }));

    expect(rows.find((r) => r.startsWith('Last run'))).toContain('· 6 written, 3 unchanged, 1 failed of 10');
    expect(rows.join(' ')).not.toContain('processed');
  });

  it('shows a run that skipped every record on its watermark as up to date (F12)', () => {
    const skipped = { ...REAL_RESULT, Attempted: 0, Upserted: 0, Unchanged: 0, Failed: 0, Skipped: 5 };
    const rows = metaRows(render({
      ...SUMMARY, LastRunProcessed: 5, LastRunSuccess: 0, LastRunErrors: 0, LastRunResult: skipped,
      LastRunOutcome: { Written: 0, Unchanged: 5, Failed: 0, Total: 5 }, LastRunOutcomeText: '5 of 5 up to date (5 unchanged)',
    }));

    const lastRun = rows.find((r) => r.startsWith('Last run'));
    expect(lastRun).toContain('5 of 5 up to date (5 unchanged)');
    expect(lastRun).not.toContain('0 of 0');
  });

  it('shows a failed run\'s error message on the card (F16)', () => {
    const fixture = render({
      ...SUMMARY, LastRunStatus: 'Failed', LastRunOutcomeText: 'no records processed',
      LastRunErrorMessage: 'Feature Pipeline version v6 is not activated: run its golden-set test',
    });
    const error = (fixture.nativeElement as Element).querySelector('.fp-card__error');

    expect(error?.textContent).toContain('Feature Pipeline version v6 is not activated');
    expect(error?.getAttribute('title')).toContain('run its golden-set test');
  });

  it('shows a cancelled run\'s message as a warning, a failed run\'s as an error', () => {
    const cancelled = render({ ...SUMMARY, LastRunStatus: 'Cancelled', LastRunErrorMessage: 'Cancelled by the user' });
    expect((cancelled.nativeElement as Element).querySelector('.fp-card__error')?.classList.contains('fp-card__error--warning')).toBe(true);
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
    const failed = render({ ...SUMMARY, LastRunStatus: 'Failed', LastRunErrorMessage: 'refused' });
    expect((failed.nativeElement as Element).querySelector('.fp-card__error')?.classList.contains('fp-card__error--warning')).toBe(false);
  });

  it('shows no error line for a completed run', () => {
    expect((render(SUMMARY).nativeElement as Element).querySelector('.fp-card__error')).toBeNull();
  });

  it('reports a run without a result summary as processed', () => {
    const rows = metaRows(render(SUMMARY));

    expect(rows.find((r) => r.startsWith('Last run'))).toContain('9/10 processed');
  });

  it('shows a newer dry run as its own line, previewed and not written, with its errors', () => {
    const rows = metaRows(render({ ...SUMMARY, LatestDryRun: { ProcessRunID: 'run-2', RunAt: new Date(), Previewed: 4, Attempted: 5, Errors: 1 } }));

    const dry = rows.find((r) => r.startsWith('Dry run'));
    expect(dry).toContain('4/5 previewed (dry run, nothing written)');
    expect(dry).toContain('1 error(s)');
    expect(rows.find((r) => r.startsWith('Last run'))).toContain('9/10 processed');
  });

  it('shows no dry-run line when there is no newer dry run', () => {
    expect(metaRows(render(SUMMARY)).some((r) => r.startsWith('Dry run'))).toBe(false);
  });
});

/** A RunFeaturePipeline result as the provider's RouteOperation returns it. */
function opResult(output: Partial<PredictiveStudioRunFeaturePipelineOutput>, success = true): RemoteOpResult<PredictiveStudioRunFeaturePipelineOutput> {
  return {
    Success: success,
    Output: { status: 'Completed', processed: 0, written: 0, skipped: 0, error: 0, ...output },
  };
}

describe('Feature Pipelines Run notice (F16)', () => {
  it('reports a refused (Failed) run as an error with the run\'s message, never as finished', () => {
    const notice = FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({
      status: 'Failed', errorMessage: 'Feature Pipeline version v6 is not activated: run its golden-set test',
    }));

    expect(notice.Style).toBe('error');
    expect(notice.Message).toBe('"Job Titles" failed: Feature Pipeline version v6 is not activated: run its golden-set test');
    expect(notice.Message).not.toContain('finished');
  });

  it('reports a Failed run without a message as failed with its status', () => {
    const notice = FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({ status: 'Failed' }));

    expect(notice).toEqual({ Style: 'error', Completed: false, Message: '"Job Titles" failed: the run ended with status Failed' });
  });

  it('reports a cancelled or paused run as a warning, not as finished', () => {
    const cancelled = FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({ status: 'Cancelled', processed: 2 }));

    expect(cancelled.Style).toBe('warning');
    expect(cancelled.Message).toBe('"Job Titles" did not finish: the run ended with status Cancelled');
  });

  it('reports a completed run as finished, with its counts', () => {
    const notice = FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({ status: 'Completed', processed: 5, written: 0, skipped: 5 }));

    expect(notice).toEqual({ Style: 'success', Completed: true, Message: '"Job Titles" finished: 5 processed, 0 succeeded, 5 skipped unchanged, 0 error(s).' });
  });

  it('reports a completed run with record errors as a warning', () => {
    expect(FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({ processed: 3, written: 2, error: 1 })).Style).toBe('warning');
  });

  it('reports an operation failure with its error message', () => {
    const failed: RemoteOpResult<PredictiveStudioRunFeaturePipelineOutput> = { Success: false, ErrorMessage: 'not authorized' };

    expect(FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', failed)).toEqual({ Style: 'error', Completed: false, Message: '"Job Titles" did not complete: not authorized' });
  });

  it('shows the refused run\'s error toast when Run is clicked', async () => {
    const notify = vi.fn();
    const notifications: MJNotificationService = Object.create(MJNotificationService.prototype);
    notifications.CreateSimpleNotification = notify;
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(notifications);
    const fixture = render(SUMMARY);
    const component = fixture.componentInstance;
    const provider: IMetadataProvider = Object.create(null);
    Object.assign(provider, { RouteOperation: vi.fn().mockResolvedValue(opResult({ status: 'Failed', errorMessage: 'version v6 is not activated' })) });
    component.Provider = provider;
    // the engine reload after a run fails on this provider double and logs it; that reload is not under test
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await component.OnRunPipeline(SUMMARY);

    expect(notify).toHaveBeenCalledWith('"Member Engagement" failed: version v6 is not activated', 'error', 8000);
  });
});

describe('RunFeaturePipeline agent tool result (F16 sweep)', () => {
  it('reports a refused run as a failure with the run\'s message, never as a success', () => {
    const notice = FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({ status: 'Failed', errorMessage: 'version v6 is not activated' }));

    expect(FeaturePipelinesResourceComponent.RunToolResult('Job Titles', notice)).toEqual({ Success: false, ErrorMessage: '"Job Titles" failed: version v6 is not activated' });
  });

  it('reports a completed run as a success with its counts', () => {
    const notice = FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({ status: 'Completed', processed: 2, written: 2 }));

    expect(FeaturePipelinesResourceComponent.RunToolResult('Job Titles', notice)).toEqual({
      Success: true, Data: { Pipeline: 'Job Titles', Message: '"Job Titles" finished: 2 processed, 2 succeeded, 0 skipped unchanged, 0 error(s).' },
    });
  });

  it('reports a cancelled or paused run as a failure with its message, not a success', () => {
    for (const status of ['Cancelled', 'Paused'] as const) {
      const notice = FeaturePipelinesResourceComponent.RunResultNotice('Job Titles', opResult({ status, errorMessage: `Run ${status.toLowerCase()} by a user` }));
      expect(FeaturePipelinesResourceComponent.RunToolResult('Job Titles', notice)).toEqual({ Success: false, ErrorMessage: `"Job Titles" did not finish: Run ${status.toLowerCase()} by a user` });
    }
  });

  it('reports a run that did not start (one already in flight) as a failure', () => {
    expect(FeaturePipelinesResourceComponent.RunToolResult('Job Titles', null)).toEqual({ Success: false, ErrorMessage: '"Job Titles" is already running.' });
  });

  it('returns the refused run\'s notice from Run, for the tool to report', async () => {
    const notifications: MJNotificationService = Object.create(MJNotificationService.prototype);
    notifications.CreateSimpleNotification = vi.fn();
    vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue(notifications);
    const component = render(SUMMARY).componentInstance;
    const provider: IMetadataProvider = Object.create(null);
    Object.assign(provider, { RouteOperation: vi.fn().mockResolvedValue(opResult({ status: 'Failed', errorMessage: 'version v6 is not activated' })) });
    component.Provider = provider;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await component.OnRunPipeline(SUMMARY)).toEqual({ Style: 'error', Completed: false, Message: '"Member Engagement" failed: version v6 is not activated' });
  });
});
