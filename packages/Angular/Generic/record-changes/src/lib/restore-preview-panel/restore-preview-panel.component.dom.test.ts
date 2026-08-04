import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EntityFieldTSType } from '@memberjunction/core';
import { MjSlidePanelComponent, MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, click, capture } from '@memberjunction/ng-test-utils';
import { RestorePreviewPanelComponent, RestoreCommitEvent, BeforeRestoreCommitEvent } from './restore-preview-panel.component';

/**
 * DOM-level spec for <mj-restore-preview-panel>.
 *
 * This is a module-declared (standalone:false), purely presentational component:
 * it takes a historical RecordChange (+ a live record in 'live' mode), builds a
 * field-level diff table, and emits RestoreConfirmed / RestoreCancelled — it never
 * touches a backend. So the inputs are plain typed fakes; no provider needed. It
 * renders inside <mj-slide-panel>, whose content is always projected into the DOM
 * (CSS-hidden, not @if-gated), so the table is queryable.
 *
 * We cover: header rendering, the parsed diff table (changed rows, [class.x] flags),
 * drift/empty banners, the reason gate (RequireReason → button disabled), the
 * select/deselect actions driving the button label + SelectedCount, the
 * BeforeRestoreCommit cancel seam, and the RestoreConfirmed / RestoreCancelled
 * emissions with their payload shapes.
 */

// ── Minimal field-metadata fakes (the component reads Name / DisplayNameOrName /
//    TSType / ReadOnly / IsPrimaryKey from EntityInfo.Fields, and Name / Value from
//    LiveRecord.Fields). EntityFieldTSType is a real const object, so we use real values.
interface FakeField {
  Name: string;
  DisplayNameOrName: string;
  TSType: string;
  ReadOnly: boolean;
  IsPrimaryKey: boolean;
}
interface FakeLiveField {
  Name: string;
  Value: unknown;
}

function field(name: string, opts: Partial<FakeField> = {}): FakeField {
  return {
    Name: name,
    DisplayNameOrName: opts.DisplayNameOrName ?? name,
    TSType: opts.TSType ?? EntityFieldTSType.String,
    ReadOnly: opts.ReadOnly ?? false,
    IsPrimaryKey: opts.IsPrimaryKey ?? false,
  };
}

const ENTITY_FIELDS: FakeField[] = [
  field('ID', { IsPrimaryKey: true }),
  field('Name', { DisplayNameOrName: 'Display Name' }),
  field('Description'),
  field('Status'),
];

// Live record currently shows Name='New Name', Description unchanged, Status changed.
function liveRecord(values: Record<string, unknown>) {
  const fields: FakeLiveField[] = ENTITY_FIELDS.map((f) => ({ Name: f.Name, Value: values[f.Name] }));
  return {
    EntityInfo: { Fields: ENTITY_FIELDS },
    Fields: fields,
  };
}

// A historical change whose snapshot (FullRecordJSON) is the state we'd restore to.
function recordChange(snapshot: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    ID: 'change-1',
    ChangedAt: new Date('2025-03-01T17:56:00Z'),
    User: 'ada@example.com',
    FullRecordJSON: JSON.stringify(snapshot),
    ...overrides,
  };
}

function render(inputs: Record<string, unknown>): ComponentFixture<RestorePreviewPanelComponent> {
  return renderComponentFixture(RestorePreviewPanelComponent, {
    declarations: [RestorePreviewPanelComponent],
    imports: [CommonModule, FormsModule, MjSlidePanelComponent, MJEmptyStateComponent],
    inputs,
  });
}

// Standard live-mode scenario: snapshot differs from live in Name + Status, same Description.
const SNAPSHOT = { ID: 'rec-1', Name: 'Old Name', Description: 'same', Status: 'Old' };
const LIVE = { ID: 'rec-1', Name: 'New Name', Description: 'same', Status: 'New' };

describe('RestorePreviewPanelComponent (DOM)', () => {
  it('renders the header title and version metadata from the RecordChange', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    expect(text(f, '.rpp-header-title')).toBe('Restore record to this version');
    // The "By:" user line renders the change's User.
    expect(f.nativeElement.textContent).toContain('ada@example.com');
  });

  it('builds one diff row per non-system snapshot field and pre-checks the changed ones', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    // Two fields differ (Name, Status); Description matches and is unchanged. By default
    // only changed rows show (ShowUnchanged=false), so 2 rows render.
    const rows = queryAll(f, 'tbody tr');
    expect(rows.length).toBe(2);
    // Both changed rows carry the changed class and are pre-selected (checkbox checked).
    expect(queryAll(f, 'tr.rpp-row-changed').length).toBe(2);
    expect(queryAll(f, '.rpp-checkbox.checked').length).toBe(2);
  });

  it('shows current vs restore values in live mode', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    const cells = queryAll(f, '.rpp-col-current').map((c) => c.textContent?.trim());
    // The Name row's current value is the live value.
    expect(cells).toContain('New Name');
    const restoreCells = queryAll(f, '.rpp-col-restore').map((c) => c.textContent?.trim());
    expect(restoreCells).toContain('Old Name');
  });

  it('reveals unchanged rows when the disclosure is toggled', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    expect(queryAll(f, 'tbody tr').length).toBe(2);
    click(f, '.rpp-disclosure'); // Show unchanged
    f.detectChanges();
    // Now the unchanged Description row also renders (3 total: ID is PK/immutable but
    // still a snapshot field → also a row). Recompute: snapshot has ID, Name, Description,
    // Status = 4 fields, none are __mj_, so 4 rows once unchanged are shown.
    expect(queryAll(f, 'tbody tr').length).toBe(4);
    // the revealed set carries the per-row state classes: unchanged rows + the immutable PK row
    expect(queryAll(f, 'tr.rpp-row-unchanged').length).toBeGreaterThan(0);
    expect(queryAll(f, 'tr.rpp-row-immutable').length).toBeGreaterThan(0);
  });

  it('disables the Restore button until a reason is entered when RequireReason is set', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RequireReason: true,
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    const btn = query(f, '.rpp-btn-primary') as HTMLButtonElement;
    expect(btn.disabled).toBe(true); // changed rows selected, but no reason yet
  });

  it('Deselect all disables the Restore button and resets the label', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    let btn = query(f, '.rpp-btn-primary') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    expect(btn.textContent).toContain('Restore (2 fields)');

    click(f, '.rpp-action-bar-buttons button:last-child'); // Deselect all
    f.detectChanges();
    btn = query(f, '.rpp-btn-primary') as HTMLButtonElement;
    expect(btn.disabled).toBe(true); // SelectedCount === 0
    expect(btn.textContent).toContain('Restore');
    expect(btn.textContent).not.toContain('(');
  });

  it('emits RestoreConfirmed with the selected field values when Restore is clicked', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    const confirmed = capture(f.componentInstance.RestoreConfirmed);
    click(f, '.rpp-btn-primary');
    f.detectChanges();

    expect(confirmed).toHaveLength(1);
    const evt: RestoreCommitEvent = confirmed[0];
    expect(evt.SourceChangeID).toBe('change-1');
    expect(evt.Mode).toBe('live');
    // Both changed fields (Name, Status) are selected; their RawRestoreValue is the snapshot value.
    const byField = new Map(evt.FieldValues.map((fv) => [fv.FieldName, fv.Value]));
    expect(byField.get('Name')).toBe('Old Name');
    expect(byField.get('Status')).toBe('Old');
    expect(byField.has('Description')).toBe(false); // unchanged → not selected
  });

  it('fires BeforeRestoreCommit and aborts RestoreConfirmed when a consumer cancels', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    // Wire the cancelable Before event to set cancel=true.
    f.componentInstance.BeforeRestoreCommit.subscribe((e: BeforeRestoreCommitEvent) => {
      e.cancel = true;
    });
    const confirmed = capture(f.componentInstance.RestoreConfirmed);
    click(f, '.rpp-btn-primary');
    f.detectChanges();

    expect(confirmed).toHaveLength(0); // aborted
  });

  it('emits RestoreCancelled when Cancel is clicked', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    const cancelled = capture(f.componentInstance.RestoreCancelled);
    click(f, '.rpp-btn-secondary');
    expect(cancelled).toHaveLength(1);
  });

  it('shows the drift banner for snapshot fields that no longer exist on the entity', () => {
    // snapshot has a "Legacy" field not present in ENTITY_FIELDS → drift.
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange({ ...SNAPSHOT, Legacy: 'gone' }),
      LiveRecord: liveRecord(LIVE),
    });
    expect(query(f, '.rpp-banner-warning')).not.toBeNull();
    expect(text(f, '.rpp-banner-warning')).toContain('no longer exist');
  });

  it('shows the empty state when the snapshot has no parseable fields', () => {
    const f = render({
      Visible: true,
      Mode: 'live',
      RecordChange: recordChange({}),
      LiveRecord: liveRecord(LIVE),
    });
    expect(query(f, '.rpp-empty')).not.toBeNull();
    expect(text(f, '.rpp-empty')).toContain('No fields');
  });

  it('uses undelete-mode labels and a single value column', () => {
    // undelete mode ignores LiveRecord's current values, but resolveEntityInfo still
    // prefers LiveRecord.EntityInfo over a provider lookup — so pass a LiveRecord purely
    // to supply field metadata (avoids needing a fake provider's Entities list).
    const f = render({
      Visible: true,
      Mode: 'undelete',
      EntityName: 'Customers',
      RecordChange: recordChange(SNAPSHOT),
      LiveRecord: liveRecord(LIVE),
    });
    expect(text(f, '.rpp-header-title')).toBe('Re-create from snapshot');
    // The header row uses the combined "Will be created with" column (no Current Value column).
    expect(f.nativeElement.textContent).toContain('Will be created with');
    expect(query(f, '.rpp-col-current')).toBeNull();
    const btn = query(f, '.rpp-btn-primary') as HTMLButtonElement;
    expect(btn.textContent).toContain('Re-create');
  });
});
