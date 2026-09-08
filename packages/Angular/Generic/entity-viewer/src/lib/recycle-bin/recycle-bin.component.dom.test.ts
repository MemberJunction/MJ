import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, queryAll, text, capture, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { RecycleBinComponent } from './recycle-bin.component';
import type { RecycleBinEntry } from './events/recycle-bin-events';

/**
 * DOM coverage for <mj-recycle-bin> — the slide-in panel that lists an entity's soft-deleted records
 * and restores them (~7×). Its list comes from a provider-backed RunView (LoadDeletedRecords), so the
 * specs stub that (so ngOnInit doesn't overwrite state) and set the public state before the first
 * render, with the slide-panel / restore-preview children stubbed. Verifies the loading / no-access /
 * empty / list render branches, the per-entry restore card, the restore → BeforeRecordRestore + preview
 * open path, and the slide-panel close → Closed relay.
 */

@Component({ standalone: true, selector: 'mj-slide-panel', template: '<ng-content></ng-content>' })
class SlidePanelStub {
  @Input() Mode = '';
  @Input() Title = '';
  @Input() Visible = false;
  @Input() Resizable = false;
  @Input() MinWidthPx = 0;
  @Input() MaxWidthRatio = 0;
  @Output() Closed = new EventEmitter<void>();
}
@Component({ standalone: true, selector: 'mj-restore-preview-panel', template: '' })
class RestorePreviewStub {
  @Input() Visible = false;
  @Input() Mode = '';
  @Input() RecordChange: unknown;
  @Input() EntityName: string | null = null;
  @Output() RestoreConfirmed = new EventEmitter<unknown>();
  @Output() RestoreCancelled = new EventEmitter<void>();
}

const CHILDREN = [SlidePanelStub, RestorePreviewStub, StubEmptyStateComponent, StubLoadingComponent];

const entry = (id: string, summary: string): RecycleBinEntry =>
  ({ RecordChange: { ID: id }, RecordID: id, DisplaySummary: summary, SupportingFields: [] } as unknown as RecycleBinEntry);

interface RbState {
  Entries?: RecycleBinEntry[];
  IsLoading?: boolean;
  LoadError?: string | null;
  CanDelete?: boolean;
  CanCreate?: boolean;
}

function render(state: RbState = {}) {
  return renderComponentFixture(RecycleBinComponent, {
    imports: CHILDREN,
    declarations: [RecycleBinComponent],
    inputs: { EntityName: 'Accounts' },
    setup: (c) => {
      c.Entries = state.Entries ?? [];
      c.IsLoading = state.IsLoading ?? false;
      c.LoadError = state.LoadError ?? null;
      c.CanDelete = state.CanDelete ?? true; // HasAccess === CanDelete
      c.CanCreate = state.CanCreate ?? true;
    },
  });
}

describe('RecycleBinComponent (DOM)', () => {
  beforeEach(() => {
    // LoadDeletedRecords hits the provider (RunView) — stub it so ngOnInit doesn't overwrite state.
    vi.spyOn(RecycleBinComponent.prototype as unknown as { LoadDeletedRecords: () => Promise<void> }, 'LoadDeletedRecords').mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders one restore card per deleted-record entry', () => {
    const f = render({ Entries: [entry('a', 'Acme Corp'), entry('b', 'Globex')] });
    const cards = queryAll(f, '.rb-card');
    expect(cards.length).toBe(2);
    expect(text(f, '.rb-card-name')).toBe('Acme Corp');
  });

  it('shows the loading indicator while loading', () => {
    const f = render({ IsLoading: true });
    expect(query(f, 'mj-loading')).not.toBeNull();
    expect(query(f, '.rb-card')).toBeNull();
  });

  it('shows the empty state when access is granted but there are no entries', () => {
    const f = render({ Entries: [], CanDelete: true });
    expect(query(f, 'mj-empty-state')).not.toBeNull();
    expect(query(f, '.rb-card')).toBeNull();
  });

  it('shows the no-access empty state when the user lacks delete access', () => {
    const f = render({ CanDelete: false, LoadError: 'no access' });
    expect(query(f, 'mj-empty-state')).not.toBeNull();
  });

  it('disables the restore button when the user cannot create', () => {
    const f = render({ Entries: [entry('a', 'Acme')], CanCreate: false });
    expect((query(f, '.rb-btn-restore') as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens the restore preview and emits BeforeRecordRestore when Restore is clicked', () => {
    const f = render({ Entries: [entry('a', 'Acme')], CanCreate: true });
    const out = capture(f.componentInstance.BeforeRecordRestore);
    (query(f, '.rb-btn-restore') as HTMLElement).click();
    f.detectChanges(false);
    expect(out.length).toBe(1);
    expect(out[0].entry.RecordID).toBe('a');
    expect(f.componentInstance.PreviewVisible).toBe(true);
  });

  it('emits Closed and clears Visible when the slide panel closes', () => {
    const f = render({ Entries: [entry('a', 'Acme')] });
    const out = capture(f.componentInstance.Closed);
    const slidePanel = f.debugElement.query(By.directive(SlidePanelStub)).componentInstance as SlidePanelStub;
    slidePanel.Closed.emit();
    expect(out.length).toBe(1);
    expect(f.componentInstance.Visible).toBe(false);
  });
});
