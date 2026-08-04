import { describe, it, expect, vi, afterEach } from 'vitest';
import { FormsModule } from '@angular/forms';
import { renderComponentFixture, query, queryAll, capture, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { ScheduledJobEditorComponent } from './scheduled-job-editor.component';
import { ScheduledJobService } from '../../services/scheduled-job.service';

/**
 * DOM coverage for <mj-scheduled-job-editor> — the create/edit form for a scheduled job (~5×). It is
 * template-driven (ngModel over public fields). ngOnInit loads job types (faked) then resolves/creates
 * the job entity (loadOrCreateJob, stubbed so setup-provided field values survive). Save hits a
 * notification singleton so it isn't exercised; these cover the form fields + job-type dropdown, the
 * Save enable-gate (CanSave), Cancel → Cancelled, and the delete-confirmation open/close.
 */

const tick = () => new Promise((r) => setTimeout(r, 0));
type LoadJobProto = { loadOrCreateJob: () => Promise<void> };

interface FormState { Name?: string; SelectedJobTypeID?: string; CronExpression?: string }
async function render(state: FormState = {}) {
  // loadOrCreateJob would overwrite the form fields on init — stub it so our setup values survive.
  vi.spyOn(ScheduledJobEditorComponent.prototype as unknown as LoadJobProto, 'loadOrCreateJob').mockResolvedValue(undefined);
  const f = renderComponentFixture(ScheduledJobEditorComponent, {
    imports: [FormsModule, StubLoadingComponent],
    declarations: [ScheduledJobEditorComponent],
    providers: [{ provide: ScheduledJobService, useValue: { LoadJobTypes: async () => [{ ID: 'jt1', Name: 'Cleanup' }, { ID: 'jt2', Name: 'Sync' }] } }],
    setup: (c) => {
      if (state.Name !== undefined) c.Name = state.Name;
      if (state.SelectedJobTypeID !== undefined) c.SelectedJobTypeID = state.SelectedJobTypeID;
      if (state.CronExpression !== undefined) c.CronExpression = state.CronExpression;
    },
  });
  await tick(); // ngOnInit's async LoadJobTypes + (stubbed) loadOrCreateJob
  f.detectChanges(false);
  return f;
}
type Fx = Awaited<ReturnType<typeof render>>;
const saveBtn = (f: Fx) => query(f, '.btn-primary') as HTMLButtonElement;

afterEach(() => vi.restoreAllMocks());

describe('ScheduledJobEditorComponent (DOM)', () => {
  it('renders the name field and the job-type dropdown options from the service', async () => {
    const f = await render();
    expect(query(f, '#jobName')).not.toBeNull();
    const opts = queryAll(f, 'option').map((o) => o.textContent?.trim());
    expect(opts).toContain('Cleanup');
    expect(opts).toContain('Sync');
  });

  it('disables Save when the form is incomplete', async () => {
    const f = await render({ Name: '', SelectedJobTypeID: '', CronExpression: '' });
    expect(saveBtn(f).disabled).toBe(true);
  });

  it('enables Save when name + job type + cron are all set', async () => {
    const f = await render({ Name: 'Nightly', SelectedJobTypeID: 'jt1', CronExpression: '0 0 * * *' });
    expect(saveBtn(f).disabled).toBe(false);
  });

  it('emits Cancelled when Cancel is clicked', async () => {
    const f = await render();
    const out = capture(f.componentInstance.Cancelled);
    (query(f, '.btn-secondary') as HTMLElement).click();
    expect(out.length).toBe(1);
  });

  it('opens and closes the delete confirmation dialog', async () => {
    const f = await render();
    f.componentInstance.ConfirmDelete();
    f.detectChanges(false);
    expect(query(f, '.confirm-dialog')).not.toBeNull();
    f.componentInstance.CancelDelete();
    f.detectChanges(false);
    expect(query(f, '.confirm-dialog')).toBeNull();
  });
});
