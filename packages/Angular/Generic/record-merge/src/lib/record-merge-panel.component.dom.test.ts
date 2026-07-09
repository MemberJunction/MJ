import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { renderComponentFixture, query, queryAll, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import { MJEmptyStateComponent } from '@memberjunction/ng-ui-components';
import { RecordMergePanelComponent } from './record-merge-panel.component';
import { FieldComparison, MergeConfig } from './record-merge-types';

/**
 * DOM-level spec for <mj-record-merge-panel> — a module-declared (standalone:false)
 * compound component configured entirely via @Inputs (no projected children, no data
 * provider). Its contract lives mostly in the template: @if gating on Config/Comparison,
 * @for over visible fields, conditional [class.x] on selected/conflict/readonly cells,
 * (click) wiring to selection + emit, and the confirm-dialog gate. We render it with the
 * component declared + CommonModule imported, drive it through real DOM clicks (zoneless-safe),
 * and assert on rendered output + @Output payloads.
 */

const CONFIG: MergeConfig = {
  EntityName: 'Contacts',
  LeftRecordID: 'rec-1',
  RightRecordID: 'rec-2',
  SurvivorSide: 'left',
  LeftLabel: 'Record A',
  RightLabel: 'Record B',
};

function makeField(over: Partial<FieldComparison> = {}): FieldComparison {
  return {
    FieldName: 'Email',
    DisplayLabel: 'Email',
    LeftValue: 'john@a.com',
    RightValue: 'john@b.com',
    HasConflict: true,
    SelectedSide: 'left',
    IsReadOnly: false,
    DataType: 'string',
    ...over,
  };
}

function render(fields: FieldComparison[], extra: Record<string, unknown> = {}): ComponentFixture<RecordMergePanelComponent> {
  return renderComponentFixture(RecordMergePanelComponent, {
    imports: [CommonModule, MJEmptyStateComponent],
    declarations: [RecordMergePanelComponent],
    inputs: { Config: CONFIG, Fields: fields, ...extra },
  });
}

describe('RecordMergePanelComponent (DOM)', () => {
  it('renders the empty state when Config is null', () => {
    const f = renderComponentFixture(RecordMergePanelComponent, {
      imports: [CommonModule, MJEmptyStateComponent],
      declarations: [RecordMergePanelComponent],
      inputs: { Config: null, Fields: [] },
    });
    expect(query(f, 'mj-empty-state')).not.toBeNull();
    expect(text(f, 'mj-empty-state .mj-empty-state__title')).toBe('Select two records to compare');
    expect(query(f, '.merge-header')).toBeNull();
  });

  it('renders header info: entity name and conflict/total badge', () => {
    const f = render([makeField({ FieldName: 'A', HasConflict: true }), makeField({ FieldName: 'B', HasConflict: false })]);
    expect(text(f, '.merge-entity-name')).toBe('Contacts');
    // buildComparison runs in ngOnInit; 1 conflict out of 2 fields
    expect(text(f, '.merge-conflict-badge')).toBe('1 conflicts / 2 fields');
  });

  it('renders the column labels from Config', () => {
    const f = render([makeField()]);
    expect(text(f, '.merge-col-left span')).toBe('Record A');
    expect(text(f, '.merge-col-right span')).toBe('Record B');
  });

  it('renders one row per field with display labels and formatted values', () => {
    const f = render([makeField({ FieldName: 'A', DisplayLabel: 'Email Address' })]);
    expect(queryAll(f, '.merge-row').length).toBe(1);
    expect(text(f, '.merge-field-name')).toBe('Email Address');
    expect(text(f, '.merge-cell-left .merge-value')).toBe('john@a.com');
    expect(text(f, '.merge-cell-right .merge-value')).toBe('john@b.com');
  });

  it('marks conflict rows with the merge-row-conflict class', () => {
    const f = render([makeField({ HasConflict: true })]);
    expect(hasClass(f, '.merge-row', 'merge-row-conflict')).toBe(true);
  });

  it('shows the selected check icon on the side matching SelectedSide', () => {
    const f = render([makeField({ SelectedSide: 'left' })]);
    expect(hasClass(f, '.merge-cell-left', 'merge-cell-selected')).toBe(true);
    expect(hasClass(f, '.merge-cell-right', 'merge-cell-selected')).toBe(false);
    expect(query(f, '.merge-cell-left .merge-check-icon')).not.toBeNull();
    expect(query(f, '.merge-cell-right .merge-check-icon')).toBeNull();
  });

  it('clicking the right cell selects it, moves the check icon, and emits FieldSelected', () => {
    const f = render([makeField({ FieldName: 'Email', SelectedSide: 'left', RightValue: 'john@b.com' })]);
    const selected = capture(f.componentInstance.FieldSelected);

    click(f, '.merge-cell-right');
    f.detectChanges();

    expect(hasClass(f, '.merge-cell-right', 'merge-cell-selected')).toBe(true);
    expect(query(f, '.merge-cell-right .merge-check-icon')).not.toBeNull();
    expect(selected).toHaveLength(1);
    expect(selected[0]).toEqual({ FieldName: 'Email', SelectedSide: 'right', Value: 'john@b.com' });
  });

  it('renders a lock icon for read-only fields and does not show a selectable check', () => {
    const f = render([makeField({ IsReadOnly: true, SelectedSide: 'left' })]);
    expect(query(f, '.merge-readonly-icon')).not.toBeNull();
    expect(hasClass(f, '.merge-cell-left', 'merge-cell-selectable')).toBe(false);
    // @if (SelectedSide === 'left' && !IsReadOnly) — no check on read-only fields
    expect(query(f, '.merge-cell-left .merge-check-icon')).toBeNull();
  });

  it('does not change selection or emit when a read-only cell is clicked', () => {
    const f = render([makeField({ IsReadOnly: true, SelectedSide: 'left' })]);
    const selected = capture(f.componentInstance.FieldSelected);

    click(f, '.merge-cell-right');
    f.detectChanges();

    expect(hasClass(f, '.merge-cell-right', 'merge-cell-selected')).toBe(false);
    expect(selected).toHaveLength(0);
  });

  it('formats null/undefined values as (empty)', () => {
    const f = render([makeField({ LeftValue: null, RightValue: undefined })]);
    expect(text(f, '.merge-cell-left .merge-value')).toBe('(empty)');
    expect(text(f, '.merge-cell-right .merge-value')).toBe('(empty)');
    expect(hasClass(f, '.merge-cell-left .merge-value', 'merge-value-empty')).toBe(true);
  });

  it('formats boolean values as Yes/No', () => {
    const f = render([makeField({ LeftValue: true, RightValue: false })]);
    expect(text(f, '.merge-cell-left .merge-value')).toBe('Yes');
    expect(text(f, '.merge-cell-right .merge-value')).toBe('No');
  });

  it('SelectAllLeft button selects the left side of every editable field', () => {
    const f = render([makeField({ FieldName: 'A', SelectedSide: 'right' }), makeField({ FieldName: 'B', SelectedSide: 'right' })]);
    click(f, '.merge-col-left .merge-select-all-btn');
    f.detectChanges();

    const leftCells = queryAll(f, '.merge-cell-left');
    expect(leftCells.every((c) => c.classList.contains('merge-cell-selected'))).toBe(true);
  });

  it('respects ShowConflictsOnly: shows only conflicting fields initially', () => {
    const f = render([makeField({ FieldName: 'A', HasConflict: true }), makeField({ FieldName: 'B', HasConflict: false })], { ShowConflictsOnly: true });
    expect(queryAll(f, '.merge-row').length).toBe(1);
  });

  it('toggle button switches between all fields and conflicts only', () => {
    const f = render([makeField({ FieldName: 'A', HasConflict: true }), makeField({ FieldName: 'B', HasConflict: false })]);
    expect(queryAll(f, '.merge-row').length).toBe(2);

    click(f, '.merge-toggle-btn');
    f.detectChanges();
    expect(queryAll(f, '.merge-row').length).toBe(1);
  });

  it('hides the footer actions when MergeEnabled is false', () => {
    const f = render([makeField()], { MergeEnabled: false });
    expect(query(f, '.merge-footer')).toBeNull();
  });

  it('shows the footer and a primary Merge button when MergeEnabled is true', () => {
    const f = render([makeField()], { MergeEnabled: true });
    expect(query(f, '.merge-footer')).not.toBeNull();
    expect(text(f, '.merge-btn-primary')).toContain('Merge Records');
  });

  it('disables footer buttons and shows the spinner label while IsMerging', () => {
    const f = render([makeField()], { MergeEnabled: true, IsMerging: true });
    expect((query(f, '.merge-btn-primary') as HTMLButtonElement).disabled).toBe(true);
    expect((query(f, '.merge-btn-secondary') as HTMLButtonElement).disabled).toBe(true);
    expect(text(f, '.merge-btn-primary')).toContain('Merging...');
  });

  it('Cancel button in the footer emits MergeCancelled', () => {
    const f = render([makeField()], { MergeEnabled: true });
    const cancelled = capture(f.componentInstance.MergeCancelled);
    click(f, '.merge-footer .merge-btn-secondary');
    expect(cancelled).toHaveLength(1);
  });

  it('opens the confirmation dialog only after clicking Merge Records', () => {
    const f = render([makeField()], { MergeEnabled: true });
    expect(query(f, '.merge-dialog')).toBeNull();

    click(f, '.merge-footer .merge-btn-primary');
    f.detectChanges();
    expect(query(f, '.merge-dialog')).not.toBeNull();
    expect(text(f, '.merge-dialog-header h4')).toBe('Confirm Merge');
  });

  it('confirming the dialog emits MergeConfirmed with Config and resolved fields, then closes', () => {
    const fields = [makeField({ FieldName: 'Email' })];
    const f = render(fields, { MergeEnabled: true });
    const confirmed = capture(f.componentInstance.MergeConfirmed);

    click(f, '.merge-footer .merge-btn-primary'); // open dialog
    f.detectChanges();
    click(f, '.merge-dialog .merge-btn-primary'); // confirm
    f.detectChanges();

    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].Config).toBe(CONFIG);
    expect(confirmed[0].ResolvedFields).toBe(fields);
    expect(query(f, '.merge-dialog')).toBeNull();
  });

  it('cancelling the dialog closes it without emitting MergeConfirmed', () => {
    const f = render([makeField()], { MergeEnabled: true });
    const confirmed = capture(f.componentInstance.MergeConfirmed);

    click(f, '.merge-footer .merge-btn-primary'); // open dialog
    f.detectChanges();
    click(f, '.merge-dialog .merge-btn-secondary'); // cancel inside dialog
    f.detectChanges();

    expect(query(f, '.merge-dialog')).toBeNull();
    expect(confirmed).toHaveLength(0);
  });
});
