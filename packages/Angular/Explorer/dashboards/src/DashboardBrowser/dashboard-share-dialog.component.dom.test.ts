import { describe, it, expect } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, capture } from '@memberjunction/ng-test-utils';
import type { MJDashboardEntity } from '@memberjunction/core-entities';
import { DashboardShareDialogComponent } from './dashboard-share-dialog.component';

/**
 * DOM coverage for <mj-dashboard-share-dialog> — a thin wrapper over <mj-resource-share-dialog>: it
 * builds the ResourceShareContext from the Dashboard input, forwards Visible/Context, and re-emits
 * Result (attaching the dashboard on 'save'). The generic share dialog is stubbed; these specs verify
 * the wrapper's contract. Single synchronous render.
 */

@Component({ standalone: true, selector: 'mj-resource-share-dialog', template: '' })
class ShareDialogStub {
  @Input() Visible = false;
  @Input() Context: unknown;
  @Input() Adapter: unknown;
  @Output() Result = new EventEmitter<{ Action: string }>();
}

const DASHBOARD = { ID: 'd1', Name: 'Sales Dashboard', UserID: 'u1', User: 'Alice' } as unknown as MJDashboardEntity;

const render = () =>
  renderComponentFixture(DashboardShareDialogComponent, {
    imports: [ShareDialogStub],
    declarations: [DashboardShareDialogComponent],
    inputs: { Visible: true, Dashboard: DASHBOARD },
  });

const child = (f: ReturnType<typeof render>) => f.debugElement.query(By.directive(ShareDialogStub)).componentInstance as ShareDialogStub;

describe('DashboardShareDialogComponent (DOM)', () => {
  it('forwards Visible to the generic share dialog', () => {
    expect(child(render()).Visible).toBe(true);
  });

  it('builds the share context from the dashboard', () => {
    const ctx = child(render()).Context as { ResourceID: string; ResourceName: string; OwnerUserID: string };
    expect(ctx.ResourceID).toBe('d1');
    expect(ctx.ResourceName).toBe('Sales Dashboard');
    expect(ctx.OwnerUserID).toBe('u1');
  });

  it('re-emits Result with the dashboard attached on save', () => {
    const fixture = render();
    const results = capture(fixture.componentInstance.Result);
    child(fixture).Result.emit({ Action: 'save' });
    expect(results.length).toBe(1);
    const r = results[0] as { Action: string; Dashboard?: MJDashboardEntity };
    expect(r.Action).toBe('save');
    expect(r.Dashboard).toBe(DASHBOARD);
  });

  it('re-emits Result without a dashboard on cancel', () => {
    const fixture = render();
    const results = capture(fixture.componentInstance.Result);
    child(fixture).Result.emit({ Action: 'cancel' });
    const r = results[0] as { Action: string; Dashboard?: MJDashboardEntity };
    expect(r.Action).toBe('cancel');
    expect(r.Dashboard).toBeUndefined();
  });
});
