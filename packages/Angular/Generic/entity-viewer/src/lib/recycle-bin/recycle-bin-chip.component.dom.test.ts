import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import { renderComponentFixture, query, text, capture } from '@memberjunction/ng-test-utils';
import { RecycleBinChipComponent } from './recycle-bin-chip.component';
import type { AfterRecycleBinOpenEventArgs, AfterRestoreCommitEventArgs, BeforeRecordRestoreEventArgs } from './events/recycle-bin-events';

/**
 * DOM coverage for <mj-recycle-bin-chip> — the deleted-record count chip + hosted slide-in panel
 * dropped into entity-viewer toolbars. Its self-hiding visibility comes from a provider-backed count
 * query (refreshCount), which needs a live metadata provider; we stub that method so ngOnInit doesn't
 * reset the state, then set the public IsVisible/DeletedCount before the first render. The inner
 * <mj-recycle-bin> is stubbed so we verify the chip surface (count + title), Toggle → panel visibility,
 * the count updates from the panel's after-events, and the passthrough re-emission of Before/After.
 */

@Component({ standalone: true, selector: 'mj-recycle-bin', template: '' })
class RecycleBinStub {
  @Input() Visible = false;
  @Input() EntityName: string | null = null;
  @Input() ContextUser: unknown;
  @Output() Closed = new EventEmitter<void>();
  @Output() BeforeRecycleBinOpen = new EventEmitter<unknown>();
  @Output() AfterRecycleBinOpen = new EventEmitter<AfterRecycleBinOpenEventArgs>();
  @Output() BeforeRecordRestore = new EventEmitter<BeforeRecordRestoreEventArgs>();
  @Output() AfterRecordRestore = new EventEmitter<unknown>();
  @Output() BeforeRestoreCommit = new EventEmitter<unknown>();
  @Output() AfterRestoreCommit = new EventEmitter<AfterRestoreCommitEventArgs>();
}

/** Force the chip visible with a count via `setup` (before the first render), and neutralise the
 *  provider-backed refreshCount that ngOnInit fires so it doesn't reset the state. */
function shown(count = 3) {
  return renderComponentFixture(RecycleBinChipComponent, {
    imports: [RecycleBinStub],
    declarations: [RecycleBinChipComponent],
    setup: (c) => {
      c.IsVisible = true;
      c.DeletedCount = count;
    },
  });
}
type Fx = ReturnType<typeof shown>;
const panel = (f: Fx) => f.debugElement.query(By.directive(RecycleBinStub)).componentInstance as RecycleBinStub;

describe('RecycleBinChipComponent (DOM)', () => {
  beforeEach(() => {
    // refreshCount hits the metadata provider (Entities / permissions / RunView) — stub it so ngOnInit
    // doesn't overwrite the state we set in `setup`.
    vi.spyOn(RecycleBinChipComponent.prototype as unknown as { refreshCount: () => Promise<void> }, 'refreshCount').mockResolvedValue(undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('renders nothing when not visible', () => {
    const f = renderComponentFixture(RecycleBinChipComponent, { imports: [RecycleBinStub], declarations: [RecycleBinChipComponent] });
    expect(query(f, '.rbc-chip')).toBeNull();
  });

  it('renders the chip with the deleted-record count when visible', () => {
    const f = shown(3);
    expect(query(f, '.rbc-chip')).not.toBeNull();
    expect(text(f, '.rbc-chip-count')).toBe('3');
    expect(query(f, '.rbc-chip')?.getAttribute('title')).toContain('3 deleted records');
  });

  it('uses the singular title when exactly one record is deleted', () => {
    const title = query(shown(1), '.rbc-chip')?.getAttribute('title') ?? '';
    expect(title).toContain('1 deleted record');
    expect(title.endsWith('record')).toBe(true);
  });

  it('opens the hosted panel when the chip is clicked', () => {
    const f = shown();
    expect(panel(f).Visible).toBe(false);
    (query(f, '.rbc-chip') as HTMLElement).click();
    f.detectChanges(false);
    expect(panel(f).Visible).toBe(true);
  });

  it('updates the count from the panel AfterRecycleBinOpen event and re-emits it', () => {
    const f = shown(3);
    const out = capture(f.componentInstance.AfterRecycleBinOpen);
    const evt = { deletedRecordCount: 7 } as AfterRecycleBinOpenEventArgs;
    panel(f).AfterRecycleBinOpen.emit(evt);
    f.detectChanges(false);
    expect(text(f, '.rbc-chip-count')).toBe('7');
    expect(out).toEqual([evt]);
  });

  it('decrements the count on a successful restore commit and re-emits', () => {
    const f = shown(3);
    const out = capture(f.componentInstance.AfterRestoreCommit);
    const evt = { success: true } as AfterRestoreCommitEventArgs;
    panel(f).AfterRestoreCommit.emit(evt);
    f.detectChanges(false);
    expect(text(f, '.rbc-chip-count')).toBe('2');
    expect(out).toEqual([evt]);
  });

  it('passes the BeforeRecordRestore event straight through', () => {
    const f = shown();
    const out = capture(f.componentInstance.BeforeRecordRestore);
    const evt = { recordId: 'r1' } as unknown as BeforeRecordRestoreEventArgs;
    panel(f).BeforeRecordRestore.emit(evt);
    expect(out).toEqual([evt]);
  });
});
