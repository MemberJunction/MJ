import { describe, it, expect, beforeEach } from 'vitest';
import { CommonModule } from '@angular/common';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { ScheduledJobSummaryComponent } from './scheduled-job-summary.component';
import { ScheduledJobService } from '../../services/scheduled-job.service';

/**
 * DOM spec for <mj-scheduled-job-summary> — a DATA-BOUND component that loads its job +
 * run stats from ScheduledJobService via inject(). We provide a fake ScheduledJobService
 * (its LoadJob/LoadJobRuns are the only seam the component touches) so we can drive the
 * three template branches (loading / job / empty) deterministically with no backend.
 *
 * mj-loading (from SharedGenericModule) is left unresolved via NO_ERRORS_SCHEMA — we never
 * assert on its internals, only on the host component's own template.
 */

interface FakeJob {
  Name: string;
  Status: string;
  CronExpression: string;
  Timezone: string;
}
interface FakeRun {
  Status: string;
}

// Minimal fake of ScheduledJobService — only LoadJob / LoadJobRuns are called by the summary.
class FakeScheduledJobService {
  public JobToReturn: FakeJob | null = null;
  public RunsToReturn: FakeRun[] = [];
  async LoadJob(_id: string): Promise<FakeJob | null> {
    return this.JobToReturn;
  }
  async LoadJobRuns(_id: string, _max: number): Promise<FakeRun[]> {
    return this.RunsToReturn;
  }
}

describe('ScheduledJobSummaryComponent (DOM, data-bound)', () => {
  let fakeService: FakeScheduledJobService;

  beforeEach(() => {
    fakeService = new FakeScheduledJobService();
    TestBed.configureTestingModule({
      imports: [CommonModule, MJEmptyStateComponent],
      declarations: [ScheduledJobSummaryComponent],
      providers: [{ provide: ScheduledJobService, useValue: fakeService }],
      schemas: [NO_ERRORS_SCHEMA],
    });
  });

  // ngOnInit calls loadJob() (async). Create, set inputs, then await whenStable so the
  // async load resolves before we render. This keeps us NG0100-safe: state settles, then
  // we render once.
  async function render(job: FakeJob | null, runs: FakeRun[], jobId = 'job-1'): Promise<ComponentFixture<ScheduledJobSummaryComponent>> {
    fakeService.JobToReturn = job;
    fakeService.RunsToReturn = runs;
    const fixture = TestBed.createComponent(ScheduledJobSummaryComponent);
    fixture.componentRef.setInput('ScheduledJobID', jobId);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renders the empty branch when no job loads', async () => {
    const f = await render(null, []);
    expect(query(f, '.summary-empty')).not.toBeNull();
    expect(query(f, '.summary-card')).toBeNull();
    expect(text(f, '.summary-empty .mj-empty-state__title')).toContain('No schedule configured');
  });

  it('renders the job card with name, status and cron when a job loads', async () => {
    const job: FakeJob = { Name: 'Nightly Sync', Status: 'Active', CronExpression: '0 0 * * *', Timezone: 'UTC' };
    const f = await render(job, []);

    expect(query(f, '.summary-card')).not.toBeNull();
    expect(query(f, '.summary-empty')).toBeNull();
    expect(text(f, '.summary-name')).toContain('Nightly Sync');
    expect(text(f, '.status-chip')).toBe('Active');
    // first meta-item is the cron expression
    expect(text(f, '.meta-item span')).toBe('0 0 * * *');
  });

  it('applies the status-active class for an Active job', async () => {
    const f = await render({ Name: 'A', Status: 'Active', CronExpression: '* * * * *', Timezone: 'UTC' }, []);
    expect(hasClass(f, '.status-chip', 'status-active')).toBe(true);
  });

  it('applies the status-paused class for a Paused job', async () => {
    const f = await render({ Name: 'A', Status: 'Paused', CronExpression: '* * * * *', Timezone: 'UTC' }, []);
    expect(hasClass(f, '.status-chip', 'status-paused')).toBe(true);
  });

  it('hides the timezone meta-item for UTC and shows it otherwise', async () => {
    const utc = await render({ Name: 'A', Status: 'Active', CronExpression: '* * * * *', Timezone: 'UTC' }, []);
    // only the cron meta-item is present for UTC
    expect(queryAll(utc, '.meta-item').length).toBe(1);

    const ny = await render({ Name: 'A', Status: 'Active', CronExpression: '* * * * *', Timezone: 'America/New_York' }, []);
    expect(queryAll(ny, '.meta-item').length).toBe(2);
    expect(text(ny, '.meta-item:nth-child(2) span')).toBe('America/New_York');
  });

  it('computes run counts and success rate from loaded runs', async () => {
    const runs: FakeRun[] = [{ Status: 'Completed' }, { Status: 'Completed' }, { Status: 'Failed' }, { Status: 'Running' }];
    const f = await render({ Name: 'A', Status: 'Active', CronExpression: '* * * * *', Timezone: 'UTC' }, runs);

    const nums = queryAll(f, '.stat-num').map((e) => e.textContent?.trim());
    // order in template: Total, OK (success), Failed, Rate
    expect(nums[0]).toBe('4'); // total
    expect(nums[1]).toBe('2'); // succeeded
    expect(nums[2]).toBe('1'); // failed
    expect(nums[3]).toBe('50%'); // 2 of 4
  });

  it('shows N/A success rate when there are no runs', async () => {
    const f = await render({ Name: 'A', Status: 'Active', CronExpression: '* * * * *', Timezone: 'UTC' }, []);
    const nums = queryAll(f, '.stat-num').map((e) => e.textContent?.trim());
    expect(nums[3]).toBe('N/A');
  });

  it('shows the edit button by default and emits EditRequested with the job id on click', async () => {
    const f = await render({ Name: 'A', Status: 'Active', CronExpression: '* * * * *', Timezone: 'UTC' }, [], 'job-77');
    const emitted = capture(f.componentInstance.EditRequested);

    expect(query(f, '.edit-btn')).not.toBeNull();
    click(f, '.edit-btn');
    expect(emitted).toEqual(['job-77']);
  });

  it('hides the edit button when ShowEditButton is false', async () => {
    fakeService.JobToReturn = { Name: 'A', Status: 'Active', CronExpression: '* * * * *', Timezone: 'UTC' };
    fakeService.RunsToReturn = [];
    const fixture = TestBed.createComponent(ScheduledJobSummaryComponent);
    fixture.componentRef.setInput('ScheduledJobID', 'job-1');
    fixture.componentRef.setInput('ShowEditButton', false);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(query(fixture, '.summary-actions')).toBeNull();
    expect(query(fixture, '.edit-btn')).toBeNull();
  });
});
