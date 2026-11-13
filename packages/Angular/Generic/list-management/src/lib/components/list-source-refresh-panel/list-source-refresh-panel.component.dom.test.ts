import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import {
  MJAlertComponent,
  MJButtonDirective,
  MJConfirmService,
  MJDialogActionsComponent,
  MJDialogComponent,
  MJSwitchComponent,
} from '@memberjunction/ng-ui-components';
import { capture, query, queryAll, renderComponentFixture, text } from '@memberjunction/ng-test-utils';
import type { ListDelta } from '@memberjunction/lists-base';

import type { ListRefreshSummary } from '../../models/list-refresh.models';
import { ListRefreshService } from '../../services/list-refresh.service';
import { ListDeltaConfirmComponent } from '../list-delta-confirm/list-delta-confirm.component';
import { ListSourceRefreshPanelComponent } from './list-source-refresh-panel.component';

/**
 * DOM spec for <mj-list-source-refresh-panel>. All data goes through ListRefreshService, which is
 * replaced by a stub; MJConfirmService is stubbed so Unlink never mounts a real dialog.
 */
function summary(overrides: Partial<ListRefreshSummary> = {}): ListRefreshSummary {
  return {
    ListID: 'list-1', ListName: 'Members', EntityName: 'Contacts', OwnerID: 'u1', OwnerName: 'Yuri Lee',
    SourceKind: 'view', SourceID: 'view-1', SourceName: 'Active members', RefreshMode: 'Sync', AutoRefresh: true,
    UseSnapshot: false, LastRefreshedAt: null, LastRefreshedBy: null, Status: 'Scheduled',
    Routine: { ID: 'r1', Name: 'Refresh list: Members', Status: 'Active', CronExpression: '0 2 * * *', Timezone: 'America/New_York', NextRunAt: null, LastRunAt: null, LastRunStatus: null },
    ...overrides,
  };
}

function delta(add: number, remove: number): ListDelta {
  return {
    TargetListId: 'list-1', EntityName: 'Contacts', ToAdd: Array(add).fill('a'), ToRemove: Array(remove).fill('r'), Unchanged: [],
    Counts: { Add: add, Remove: remove, Unchanged: 0, SourceTotal: add, TargetTotal: remove }, Warnings: [], DeltaToken: 'tok',
  };
}

let service: {
  Provider: unknown;
  LoadSummaryAsync: ReturnType<typeof vi.fn>;
  PreviewRefreshAsync: ReturnType<typeof vi.fn>;
  ApplyRefreshAsync: ReturnType<typeof vi.fn>;
  UpdateListAsync: ReturnType<typeof vi.fn>;
  UnlinkSourceAsync: ReturnType<typeof vi.fn>;
};
let confirmResult = true;

async function render(inputs: Record<string, unknown> = {}) {
  const f = renderComponentFixture(ListSourceRefreshPanelComponent, {
    imports: [CommonModule, FormsModule, SharedGenericModule, MJButtonDirective, MJAlertComponent, MJSwitchComponent, MJDialogComponent, MJDialogActionsComponent],
    declarations: [ListSourceRefreshPanelComponent, ListDeltaConfirmComponent],
    providers: [
      { provide: ListRefreshService, useValue: service },
      { provide: MJConfirmService, useValue: { Confirm: vi.fn(async () => confirmResult) } },
    ],
    inputs: { IsOwner: true, CanEdit: true, ListID: 'list-1', ...inputs },
  });
  await settle(f);
  return f;
}

async function settle(f: { detectChanges(): void }) {
  await new Promise((r) => setTimeout(r, 0));
  f.detectChanges();
}

beforeEach(() => {
  confirmResult = true;
  service = {
    Provider: null,
    LoadSummaryAsync: vi.fn(async () => summary()),
    PreviewRefreshAsync: vi.fn(async () => ({ Success: true, ResultCode: 'SUCCESS', Message: '', Delta: delta(2, 0) })),
    ApplyRefreshAsync: vi.fn(async () => ({ Success: true, ResultCode: 'SUCCESS', Message: '', Counts: { Added: 2, Removed: 0, Failed: 0 } })),
    UpdateListAsync: vi.fn(async () => undefined),
    UnlinkSourceAsync: vi.fn(async () => undefined),
  };
});

describe('ListSourceRefreshPanelComponent (DOM)', () => {
  it('shows the source, its match status, the mode and the schedule in words', async () => {
    const f = await render();
    expect(text(f, '.srp-source')).toContain('Active members');
    expect(text(f, '.srp-pill--ok')).toContain('Matches approved version');
    expect(text(f, '.srp-segmented__on')).toBe('Sync');
    expect(text(f, '.srp-schedule')).toContain('Daily at 2:00 am · America/New_York');
  });

  it('offers the owner to link a source when the list has none', async () => {
    service.LoadSummaryAsync.mockResolvedValue(summary({ SourceKind: null, SourceID: null, SourceName: null, Status: 'Static' }));
    const owner = await render();
    expect(text(owner, '.srp-empty')).toContain('Link a view or query');
  });

  it('does not offer anyone else to link a source', async () => {
    service.LoadSummaryAsync.mockResolvedValue(summary({ SourceKind: null, SourceID: null, SourceName: null, Status: 'Static' }));
    const other = await render({ IsOwner: false });
    expect(query(other, '.srp-empty button')).toBeNull();
  });

  it('a changed source asks for review and blocks Refresh now', async () => {
    service.LoadSummaryAsync.mockResolvedValue(summary({ Status: 'Paused' }));
    const f = await render();
    const reviews = capture(f.componentInstance.ReviewSourceChange);
    expect(text(f, '.srp-pill--warn')).toContain('Source changed');
    expect((query(f, '.srp-header button') as HTMLButtonElement).disabled).toBe(true);
    const review = queryAll(f, 'button').find((b) => b.textContent?.includes('Review source change')) as HTMLButtonElement;
    review.click();
    expect(reviews).toHaveLength(1);
  });

  it('Refresh now previews first and applies only on confirm', async () => {
    const f = await render();
    const changed = capture(f.componentInstance.Changed);
    await f.componentInstance.OnRefreshNow();
    f.detectChanges();
    expect(service.ApplyRefreshAsync).not.toHaveBeenCalled();
    expect(f.componentInstance.PreviewVisible).toBe(true);

    await f.componentInstance.OnPreviewConfirmed();
    expect(service.ApplyRefreshAsync).toHaveBeenCalledWith(expect.objectContaining({ DeltaToken: 'tok' }), false);
    expect(changed).toHaveLength(1);
  });

  it('confirms removals when the previewed delta removes records', async () => {
    service.PreviewRefreshAsync.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: '', Delta: delta(1, 3) });
    const f = await render();
    await f.componentInstance.OnRefreshNow();
    await f.componentInstance.OnPreviewConfirmed();
    expect(service.ApplyRefreshAsync).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('says so when a refresh would change nothing, without opening a preview', async () => {
    service.PreviewRefreshAsync.mockResolvedValue({ Success: true, ResultCode: 'SUCCESS', Message: '', Delta: delta(0, 0) });
    const f = await render();
    await f.componentInstance.OnRefreshNow();
    f.detectChanges();
    expect(f.componentInstance.PreviewVisible).toBe(false);
    expect(text(f, 'mj-alert')).toContain('Already up to date');
  });

  it('a source that changed since the last load sends the user to the review', async () => {
    service.PreviewRefreshAsync.mockResolvedValue({ Success: false, ResultCode: 'SOURCE_CHANGED', Message: 'changed' });
    const f = await render();
    const reviews = capture(f.componentInstance.ReviewSourceChange);
    await f.componentInstance.OnRefreshNow();
    expect(reviews).toHaveLength(1);
  });

  it('only the owner can turn on Refresh automatically', async () => {
    service.LoadSummaryAsync.mockResolvedValue(summary({ AutoRefresh: false, Routine: null, Status: 'Manual' }));
    const editor = await render({ IsOwner: false });
    expect(editor.componentInstance.CanToggleAutoRefresh).toBe(false);
  });

  it('anyone who can edit can turn Refresh automatically off', async () => {
    const editor = await render({ IsOwner: false });
    expect(editor.componentInstance.CanToggleAutoRefresh).toBe(true);
  });

  it('saves a mode change and Refresh automatically through the service', async () => {
    const f = await render();
    await f.componentInstance.OnModeChange('Additive');
    await f.componentInstance.OnAutoRefreshChange(false);
    expect(service.UpdateListAsync).toHaveBeenNthCalledWith(1, 'list-1', { RefreshMode: 'Additive' });
    expect(service.UpdateListAsync).toHaveBeenNthCalledWith(2, 'list-1', { AutoRefresh: false });
  });

  it('unlinks only after the owner confirms', async () => {
    confirmResult = false;
    const f = await render();
    await f.componentInstance.OnUnlink();
    expect(service.UnlinkSourceAsync).not.toHaveBeenCalled();
    confirmResult = true;
    await f.componentInstance.OnUnlink();
    expect(service.UnlinkSourceAsync).toHaveBeenCalledWith('list-1');
  });

  it('shows a failed save as an error', async () => {
    service.UpdateListAsync.mockRejectedValue(new Error('Only the owner of this List can link it'));
    const f = await render();
    await f.componentInstance.OnModeChange('Additive');
    f.detectChanges();
    expect(text(f, 'mj-alert')).toContain('Only the owner');
  });
});
