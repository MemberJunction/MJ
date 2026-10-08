import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { DashboardEngine } from '@memberjunction/core-entities';
import type { MJDashboardPartTypeEntity } from '@memberjunction/core-entities';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, Capture, Click, HasClass, Query, Text, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { DashboardViewerComponent } from './dashboard-viewer.component';
import { DashboardBreadcrumbComponent } from '../breadcrumb/dashboard-breadcrumb.component';

/**
 * DOM coverage for the empty state of <mj-dashboard-viewer>. A dashboard with no parts shows
 * "No parts yet". Its Add part action shows in edit mode, and in view mode only to a user who can
 * edit (CanEdit). The action asks the host for the Add part dialog through PanelInteraction.
 */

/** The part types DashboardEngine holds. */
const PART_TYPES = [{ ID: 'pt-view', Name: 'View', Icon: 'fa-solid fa-table' }] as unknown as MJDashboardPartTypeEntity[];

/** A viewer with no dashboard, so it has no parts, and with no toolbar. */
function render(inputs: Record<string, unknown> = {}): ComponentFixture<DashboardViewerComponent> {
  return RenderComponentFixture(DashboardViewerComponent, {
    imports: [MJEmptyStateComponent, StubLoadingComponent],
    declarations: [DashboardViewerComponent, DashboardBreadcrumbComponent],
    inputs: { ShowToolbar: false, ...inputs },
  });
}

/** Lets the viewer load its part types, which it starts when it is created. */
function settle(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

describe('DashboardViewerComponent empty state (DOM)', () => {
  beforeEach(() => {
    const engine = { Config: vi.fn(async () => undefined), DashboardPartTypes: PART_TYPES };
    vi.spyOn(DashboardEngine, 'Instance', 'get').mockReturnValue(engine as unknown as DashboardEngine);
  });

  it('shows "No parts yet" and an Add part action in edit mode', () => {
    const f = render({ IsEditing: true });

    expect(HasClass(f, '.dashboard-empty .mj-empty-state__icon', 'fa-table-columns')).toBe(true);
    expect(Text(f, '.dashboard-empty .mj-empty-state__title')).toBe('No parts yet');
    expect(Text(f, '.dashboard-empty .mj-empty-state__message')).toBe('Add a view, query, artifact, or web page to get started.');
    expect(Text(f, '.dashboard-empty .mj-empty-state__actions button')).toBe('Add part');
  });

  it('shows no action in view mode to a user who cannot edit', () => {
    const f = render();

    expect(f.componentInstance.CanEdit).toBe(false);
    expect(Text(f, '.dashboard-empty .mj-empty-state__title')).toBe('No parts yet');
    expect(Query(f, '.dashboard-empty .mj-empty-state__actions button')).toBeNull();
  });

  it('shows Add part in view mode to a user who can edit', () => {
    const f = render({ CanEdit: true });

    expect(Text(f, '.dashboard-empty .mj-empty-state__actions button')).toBe('Add part');
  });

  it('asks the host for the Add part dialog when the user clicks Add part', async () => {
    const f = render({ CanEdit: true });
    await settle();
    const requests = Capture(f.componentInstance.PanelInteraction);

    Click(f, '.dashboard-empty .mj-empty-state__actions button');

    expect(requests).toEqual([{ panelId: '', interactionType: 'custom', payload: { action: 'add-panel-requested', partTypes: PART_TYPES } }]);
  });
});
