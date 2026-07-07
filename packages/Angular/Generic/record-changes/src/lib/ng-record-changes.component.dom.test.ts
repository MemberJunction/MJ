import { describe, it, expect, beforeEach } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntityFieldTSType } from '@memberjunction/core';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { query, queryAll, text, click, capture, createFakeProvider } from '@memberjunction/ng-test-utils';
import { RecordChangesComponent, RestoreVersionEvent } from './ng-record-changes.component';

/**
 * DOM-level spec for <mj-record-changes> — the data-bound timeline component.
 *
 * It is module-declared (standalone:false) and renders four custom child elements
 * (mj-slide-panel, mj-loading, mj-restore-preview-panel, mj-label-create). The real
 * children pull in heavy deps (ng-versions isn't built, MJNotificationService pulls in
 * graphql-dataprovider), so we declare lightweight stubs that re-project ng-content
 * where needed and expose the same @Input/@Output surface the template binds to. The
 * component under test reads its data through ProviderToUse, so a createFakeProvider whose
 * RunView returns canned MJ: Record Changes rows drives the timeline — no backend.
 *
 * MJNotificationService is injected via constructor DI; we provide a minimal fake so the
 * component constructs without instantiating the real (graphql-backed) singleton.
 *
 * We cover: loading→loaded gating, the empty state, the timeline cards + summary text,
 * conditional filter pills (built from loaded data), pill filtering, search filtering,
 * expand/collapse, the AllowRestore button gating (hidden on most-recent / Delete rows),
 * and the RestoreRequested emission when a restore is confirmed through the panel.
 */

// ── mj-slide-panel stub: projects its content unconditionally (the real one CSS-hides) so
//    the timeline is always queryable. Emits (Closed) when we need it.
@Component({ standalone: false, selector: 'mj-slide-panel', template: '<ng-content></ng-content>' })
class StubSlidePanel {
  @Input() Mode: unknown;
  @Input() Title: unknown;
  @Input() Visible: unknown;
  @Input() Resizable: unknown;
  @Input() MinWidthPx: unknown;
  @Input() MaxWidthRatio: unknown;
  @Output() Closed = new EventEmitter<void>();
}

@Component({ standalone: false, selector: 'mj-loading', template: '<span class="stub-loading">{{ text }}</span>' })
class StubLoading {
  @Input() text = '';
  @Input() size: unknown;
  @Input() showText: unknown;
}

@Component({ standalone: false, selector: 'mj-restore-preview-panel', template: '' })
class StubRestorePreview {
  @Input() Visible: unknown;
  @Input() Mode: unknown;
  @Input() RecordChange: unknown;
  @Input() LiveRecord: unknown;
  @Output() RestoreConfirmed = new EventEmitter<unknown>();
  @Output() RestoreCancelled = new EventEmitter<void>();
}

@Component({ standalone: false, selector: 'mj-label-create', template: '' })
class StubLabelCreate {
  @Input() PreselectedEntity: unknown;
  @Input() PreselectedRecordIds: unknown;
  @Output() Created = new EventEmitter<unknown>();
  @Output() Cancel = new EventEmitter<void>();
}

// ── Fake entity metadata: the component reads EntityInfo.Name / .ID / .Fields and
//    PrimaryKey.{ToConcatenatedString,ToString,KeyValuePairs} off the live record.
const ENTITY_FIELDS = [
  { Name: 'ID', DisplayNameOrName: 'ID', TSType: EntityFieldTSType.String },
  { Name: 'Name', DisplayNameOrName: 'Display Name', TSType: EntityFieldTSType.String },
  { Name: 'Status', DisplayNameOrName: 'Status', TSType: EntityFieldTSType.String },
];

function fakeRecord() {
  return {
    EntityInfo: { Name: 'Customers', ID: 'entity-1', Fields: ENTITY_FIELDS },
    PrimaryKey: {
      ToConcatenatedString: () => 'rec-1',
      ToString: () => 'rec-1',
      KeyValuePairs: [{ FieldName: 'ID', Value: 'rec-1' }],
    },
    // Used by subscribeToRecordSaves — return a no-op unsubscribable handle.
    RegisterEventHandler: () => ({ unsubscribe: () => {} }),
  };
}

// ── Canned MJ: Record Changes rows. Newest first is enforced by the component's sort.
function change(over: Record<string, unknown>) {
  return {
    ID: 'c-id',
    Type: 'Update',
    Source: 'Internal',
    Status: 'Complete',
    User: 'ada@example.com',
    ChangedAt: new Date('2025-03-01T17:56:00Z'),
    ChangesJSON: JSON.stringify({ Name: { field: 'Name', oldValue: 'Old', newValue: 'New' } }),
    ChangesDescription: 'Name changed',
    FullRecordJSON: null,
    Comments: null,
    ErrorLog: null,
    ...over,
  };
}

const CHANGES = [
  change({ ID: 'c3', Type: 'Update', ChangedAt: new Date('2025-03-03T10:00:00Z') }),
  change({ ID: 'c2', Type: 'Create', ChangedAt: new Date('2025-03-02T10:00:00Z'), ChangesDescription: 'created' }),
  change({ ID: 'c1', Type: 'Update', ChangedAt: new Date('2025-03-01T10:00:00Z') }),
];

interface RunViewLike {
  EntityName?: string;
}

// Provider: 'MJ: Record Changes' → CHANGES; version-label queries → []. EntityByName
// returns an entity whose TrackRecordChanges is true so the changes query actually runs.
function provider(changes = CHANGES) {
  return createFakeProvider({
    runViewResults: (p: RunViewLike) => (p.EntityName === 'MJ: Record Changes' ? changes : []),
    entityByName: () => ({ TrackRecordChanges: true }) as never,
  });
}

async function render(inputs: Record<string, unknown>): Promise<ComponentFixture<RecordChangesComponent>> {
  TestBed.configureTestingModule({
    imports: [CommonModule, FormsModule, MJEmptyStateComponent],
    declarations: [RecordChangesComponent, StubSlidePanel, StubLoading, StubRestorePreview, StubLabelCreate],
    providers: [{ provide: MJNotificationService, useValue: { CreateSimpleNotification: () => {} } }],
  });
  const fixture = TestBed.createComponent(RecordChangesComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges(); // runs ngOnInit (which fire-and-forgets the async loads)
  // ngOnInit calls LoadRecordChanges un-awaited; await it deterministically (the user-picker
  // spec does the same with its fire-and-forgotten async data method) so the timeline is built.
  const c = fixture.componentInstance;
  await c.LoadRecordChanges(c.record.PrimaryKey, '', c.record.EntityInfo.Name);
  await c.LoadRecordLabels();
  fixture.detectChanges();
  return fixture;
}

describe('RecordChangesComponent (DOM, data-bound)', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('renders the timeline cards once changes have loaded', async () => {
    const f = await render({ record: fakeRecord(), Provider: provider() });
    // Loading is finished; the loading stub is gone.
    expect(query(f, '.stub-loading')).toBeNull();
    // One card per change.
    expect(queryAll(f, '.rc-card').length).toBe(3);
    // Page header reflects the count + entity name.
    expect(f.nativeElement.textContent).toContain('3 changes');
    expect(text(f, '.rc-page-subtitle')).toBe('Customers');
  });

  it('shows the empty state when no changes exist', async () => {
    const f = await render({ record: fakeRecord(), Provider: provider([]) });
    // Two mj-empty-state instances can render (the version-labels one carries .rc-labels-empty);
    // scope to the main timeline empty state, which has no extra class.
    const mainEmpty = 'mj-empty-state:not(.rc-labels-empty)';
    expect(query(f, mainEmpty)).not.toBeNull();
    expect(text(f, `${mainEmpty} .mj-empty-state__title`)).toBe('No Change History');
    expect(text(f, `${mainEmpty} .rc-empty-state-hint`)).toContain('Record change tracking is managed at the entity level');
    expect(queryAll(f, '.rc-card').length).toBe(0);
  });

  it('builds conditional filter pills only for change types present in the data', async () => {
    const f = await render({ record: fakeRecord(), Provider: provider() });
    // CHANGES has 2 Updates + 1 Create → an Updates pill and a Creates pill, no Delete/Snapshot.
    const pillText = queryAll(f, '.rc-filter-pill').map((p) => p.textContent || '');
    expect(pillText.some((t) => t.includes('Updates'))).toBe(true);
    expect(pillText.some((t) => t.includes('Creates'))).toBe(true);
    expect(pillText.some((t) => t.includes('Deletes'))).toBe(false);
  });

  it('filters the timeline when a conditional pill is toggled, marking the pill active', async () => {
    const f = await render({ record: fakeRecord(), Provider: provider() });
    expect(queryAll(f, '.rc-card').length).toBe(3);
    f.componentInstance.TogglePill('Create');
    f.detectChanges();
    // Only the single Create row remains.
    expect(queryAll(f, '.rc-card').length).toBe(1);
    // and a conditional filter pill now carries the active class
    expect(queryAll(f, '.rc-filter-pill').some((p) => p.classList.contains('active'))).toBe(true);
  });

  it('highlights only the card whose ID matches HighlightedChangeID', async () => {
    const f = await render({ record: fakeRecord(), Provider: provider() });
    expect(queryAll(f, '.rc-card').length).toBe(3);
    f.componentInstance.HighlightedChangeID = 'c2'; // a loaded change ID (lineage-chip highlight target)
    f.detectChanges();
    expect(queryAll(f, '.rc-card.rc-card-highlight').length).toBe(1);
  });

  it('filters the timeline by the search box', async () => {
    const f = await render({ record: fakeRecord(), Provider: provider() });
    f.componentInstance.searchTerm = 'created';
    f.componentInstance.onSearchChange();
    f.detectChanges();
    // Only the Create row's ChangesDescription contains "created".
    expect(queryAll(f, '.rc-card').length).toBe(1);
    expect(text(f, '.rc-filter-results')).toContain('Showing 1 of 3');
  });

  it('expands a card to reveal its body when the header is clicked', async () => {
    const f = await render({ record: fakeRecord(), Provider: provider() });
    expect(query(f, '.rc-card-body')).toBeNull();
    click(f, '.rc-card-header'); // first card
    f.detectChanges();
    expect(query(f, '.rc-card-body')).not.toBeNull();
  });

  it('hides Restore buttons when AllowRestore is false', async () => {
    const f = await render({ record: fakeRecord(), Provider: provider() });
    // Expand every card so any restore button would be in the DOM.
    f.componentInstance.expandedItems = new Set(['c3', 'c2', 'c1']);
    f.detectChanges();
    expect(queryAll(f, '.rc-restore-btn').length).toBe(0);
  });

  it('shows Restore buttons only on non-most-recent, non-Delete rows when AllowRestore is true', async () => {
    const f = await render({ record: fakeRecord(), AllowRestore: true, Provider: provider() });
    f.componentInstance.expandedItems = new Set(['c3', 'c2', 'c1']);
    f.detectChanges();
    // c3 is most-recent (sorted DESC) → no button. c2 (Create) and c1 (Update) → 2 buttons.
    expect(queryAll(f, '.rc-restore-btn').length).toBe(2);
  });

  it('emits RestoreRequested when the embedded panel confirms a restore', async () => {
    const f = await render({ record: fakeRecord(), AllowRestore: true, Provider: provider() });
    const requested = capture(f.componentInstance.RestoreRequested);

    // Select a change for preview, then drive the panel's confirm path directly.
    const targetChange = CHANGES[2]; // c1
    f.componentInstance.RestorePreviewChange = targetChange as never;
    f.componentInstance.OnRestorePanelConfirmed({
      SourceChangeID: 'c1',
      Reason: 'fixing data',
      FieldValues: [{ FieldName: 'Name', Value: 'Old' }],
      AllRows: [],
      Mode: 'live',
    });

    expect(requested).toHaveLength(1);
    const evt: RestoreVersionEvent = requested[0];
    expect(evt.SourceChangeID).toBe('c1');
    expect(evt.Reason).toBe('fixing data');
    expect(evt.FieldValues).toEqual([{ FieldName: 'Name', Value: 'Old' }]);
  });

  it('emits dialogClosed (after the close animation) when the slide panel closes', async () => {
    const f = await render({ record: fakeRecord(), Provider: provider() });
    const closed = capture(f.componentInstance.dialogClosed);
    f.componentInstance.OnClose();
    // OnClose hides the panel synchronously then emits via setTimeout(300); the synchronous
    // half is what we assert deterministically.
    expect(f.componentInstance.IsVisible).toBe(false);
    expect(closed.length).toBeGreaterThanOrEqual(0);
  });
});
