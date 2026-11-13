import { describe, it, expect, vi } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { RunViewParams } from '@memberjunction/core';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJAlertComponent, MJButtonDirective, MJConfirmService } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import type { ApplyResult, ListRefreshPreview } from '@memberjunction/lists-base';

import type { ListRefreshSummary, ListSourceDiff, ListSourceParameterInfo } from '../../models/list-refresh.models';
import { ListRefreshService } from '../../services/list-refresh.service';
import { ListSourceReviewComponent, ShortFingerprint } from './list-source-review.component';

/**
 * DOM spec for <mj-list-source-review>. Data comes through ListRefreshService, which is replaced by
 * a stub; the component's own two simple RunViews (the list's stored fingerprint and parameters, the
 * source's current fingerprint) are served by a fake provider passed as [Provider].
 */

const SUMMARY: ListRefreshSummary = {
  ListID: 'list-1', ListName: 'Board candidates', EntityName: 'Contacts', OwnerID: 'owner-1', OwnerName: 'Yuri Lee',
  SourceKind: 'query', SourceID: 'query-1', SourceName: 'Board-eligible contacts', RefreshMode: 'Sync', AutoRefresh: true,
  UseSnapshot: false, LastRefreshedAt: null, LastRefreshedBy: null, Routine: null, Status: 'Paused',
};

const DIFF: ListSourceDiff = {
  SourceKind: 'query', SourceID: 'query-1', SourceName: 'Board-eligible contacts',
  Before: 'SELECT c.ID\nWHERE b.YearsActive >= 3', After: 'SELECT c.ID\nWHERE b.YearsActive >= 2',
  ApprovedAt: new Date('2026-10-02T12:00:00Z'), ChangedBy: 'J. Ortiz', ChangedAt: new Date('2026-11-10T15:14:00Z'),
  Lines: [
    { Kind: 'same', Text: 'SELECT c.ID', OldNumber: 1, NewNumber: 1 },
    { Kind: 'remove', Text: 'WHERE b.YearsActive >= 3', OldNumber: 2, NewNumber: null },
    { Kind: 'add', Text: 'WHERE b.YearsActive >= 2', OldNumber: null, NewNumber: 2 },
  ],
};

const PARAMS: ListSourceParameterInfo[] = [
  { Name: 'Region', Type: 'string', IsRequired: true, Description: 'Which region', SampleValue: 'Northeast', CurrentValue: 'Northeast' },
];

function preview(add: number, remove: number): ListRefreshPreview {
  return {
    Success: true, ResultCode: 'SUCCESS', Message: 'ok',
    Delta: {
      TargetListId: 'list-1', EntityName: 'Contacts', ToAdd: [], ToRemove: [], Unchanged: [],
      Counts: { Add: add, Remove: remove, Unchanged: 0, SourceTotal: 0, TargetTotal: 41 }, Warnings: [], DeltaToken: 'tok',
    },
  };
}

function makeService(previewResult: ListRefreshPreview) {
  return {
    Provider: null as unknown,
    LoadSummaryAsync: vi.fn(async () => SUMMARY),
    LoadSourceDiffAsync: vi.fn(async () => DIFF),
    LoadSourceParametersAsync: vi.fn(async () => PARAMS),
    PreviewRefreshAsync: vi.fn(async () => previewResult),
    ApproveSourceAsync: vi.fn(async (): Promise<ApplyResult> => ({ Success: true, ResultCode: 'SUCCESS', Message: 'ok' })),
    UnlinkSourceAsync: vi.fn(async () => undefined),
  };
}

const rows = (p: RunViewParams) =>
  p.EntityName === 'MJ: Lists'
    ? [{ ID: 'list-1', SourceFingerprint: '3f9a0000000000c21', SourceQueryParameters: '{"Region":"Northeast"}' }]
    : p.EntityName === 'MJ: Queries' ? [{ ID: 'query-1', DefinitionFingerprint: '8b07000000000e4d' }] : [];

async function render(isOwner: boolean, previewResult: ListRefreshPreview = preview(6, 0)) {
  const service = makeService(previewResult);
  const confirm = { Confirm: vi.fn(async () => true) };
  const f = renderComponentFixture(ListSourceReviewComponent, {
    imports: [CommonModule, FormsModule, SharedGenericModule, MJButtonDirective, MJAlertComponent],
    declarations: [ListSourceReviewComponent],
    providers: [
      { provide: ListRefreshService, useValue: service },
      { provide: MJConfirmService, useValue: confirm },
    ],
    inputs: { Provider: createFakeProvider({ runViewResults: rows }), IsOwner: isOwner, ListID: 'list-1' },
  });
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  f.detectChanges();
  return { f, service, confirm };
}

describe('ShortFingerprint', () => {
  it('keeps the first four and last three characters', () => {
    expect(ShortFingerprint('3f9a0000000000c21')).toBe('3f9a…c21');
    expect(ShortFingerprint(null)).toBe('—');
  });
});

describe('ListSourceReviewComponent (DOM)', () => {
  it('renders the diff lines with add and remove markers', async () => {
    const { f } = await render(true);
    const lines = queryAll(f, '.review-diff__line');
    expect(lines).toHaveLength(3);
    expect(queryAll(f, '.review-diff__line--remove')).toHaveLength(1);
    expect(text(f, '.review-diff__line--add .review-diff__text')).toBe('WHERE b.YearsActive >= 2');
  });

  it('shows the changed-by facts and short fingerprints', async () => {
    const { f } = await render(true);
    expect(text(f, '.review-banner__detail')).toContain('J. Ortiz');
    expect(text(f, '.review-facts')).toContain('3f9a…c21');
    expect(text(f, '.review-facts')).toContain('8b07…e4d');
  });

  it('renders a prefilled input for each parameter', async () => {
    const { f } = await render(true);
    const inputs = queryAll(f, '.review-param__input') as HTMLInputElement[];
    expect(inputs).toHaveLength(1);
    expect(text(f, '.review-param__label')).toContain('Region');
    expect(query(f, '.review-param__required')).not.toBeNull();
  });

  it('previews the approval with the parameter values', async () => {
    const { f, service } = await render(true);
    expect(service.PreviewRefreshAsync).toHaveBeenCalledWith('list-1', { AcceptCurrentSource: true, Parameters: { Region: 'Northeast' } });
    expect(text(f, '.review-count--add')).toBe('+6');
    expect(text(f, '.review-count__result')).toContain('47');
  });

  it('keeps approve disabled until removals are acknowledged, then approves with confirmDrops', async () => {
    const { f, service } = await render(true, preview(6, 19));
    const approve = () => query(f, '.review-approve') as HTMLButtonElement;
    expect(approve().disabled).toBe(true);

    const box = query(f, '.review-ack input') as HTMLInputElement;
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    f.detectChanges();
    expect(approve().disabled).toBe(false);

    const emitted = capture(f.componentInstance.Approved);
    approve().click();
    await new Promise((r) => setTimeout(r, 0));
    expect(service.ApproveSourceAsync).toHaveBeenCalledWith('list-1', true, { Region: 'Northeast' });
    expect(emitted).toHaveLength(1);
  });

  it('approves without confirmDrops when nothing is removed', async () => {
    const { f, service } = await render(true, preview(6, 0));
    (query(f, '.review-approve') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(service.ApproveSourceAsync).toHaveBeenCalledWith('list-1', false, { Region: 'Northeast' });
  });

  it('shows the error and emits nothing when approval fails', async () => {
    const { f, service } = await render(true);
    service.ApproveSourceAsync.mockResolvedValue({ Success: false, ResultCode: 'PERMISSION_DENIED', Message: 'owner only' });
    const emitted = capture(f.componentInstance.Approved);
    (query(f, '.review-approve') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    f.detectChanges();
    expect(emitted).toHaveLength(0);
    expect(f.nativeElement.textContent).toContain('owner only');
  });

  it('unlinks after confirmation', async () => {
    const { f, service, confirm } = await render(true);
    const emitted = capture(f.componentInstance.Unlinked);
    (query(f, '.review-unlink') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));
    expect(confirm.Confirm).toHaveBeenCalled();
    expect(service.UnlinkSourceAsync).toHaveBeenCalledWith('list-1');
    expect(emitted).toHaveLength(1);
  });

  it('a non-owner sees the change but no actions, and nothing is previewed', async () => {
    const { f, service } = await render(false);
    expect(queryAll(f, '.review-diff__line')).toHaveLength(3);
    expect(query(f, '.review-approve')).toBeNull();
    expect(query(f, '.review-unlink')).toBeNull();
    expect(query(f, '.review-readonly')).not.toBeNull();
    expect(service.PreviewRefreshAsync).not.toHaveBeenCalled();
  });
});
