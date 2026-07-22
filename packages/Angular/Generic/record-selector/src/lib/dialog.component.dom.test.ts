import { describe, it, expect } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import type { BaseEntity } from '@memberjunction/core';
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, text, click, capture } from '@memberjunction/ng-test-utils';
import { RecordSelectorDialogComponent } from './dialog.component';
import { RecordSelectorComponent } from './record-selector.component';

/**
 * DOM-level spec for <mj-record-selector-dialog> — the modal wrapper around
 * <mj-record-selector>. mj-dialog renders its content INLINE (native overlay div in the
 * fixture, no CDK overlay outside it), so the projected selector + action buttons are
 * queryable. We assert the @if(DialogVisible) gating, the title binding, and the
 * OK/Cancel → DialogClosed(true/false) contract.
 *
 * Rows are minimal .Get()-only fakes (the inner selector reads item.Get(DisplayField)); the
 * single documented `unknown` seam casts them to BaseEntity[] for the typed @Input.
 */

class FakeRow {
  constructor(private readonly values: Record<string, string>) {}
  Get(field: string): string {
    return this.values[field];
  }
}

const asEntities = (rows: FakeRow[]): BaseEntity[] => rows as unknown as BaseEntity[];
const makeRows = (...names: string[]): FakeRow[] => names.map((n) => new FakeRow({ Name: n }));

function render(inputs: Record<string, unknown>): ComponentFixture<RecordSelectorDialogComponent> {
  return renderComponentFixture(RecordSelectorDialogComponent, {
    imports: [CommonModule, MJButtonDirective, MJDialogComponent, MJDialogActionsComponent],
    declarations: [RecordSelectorDialogComponent, RecordSelectorComponent],
    inputs,
  });
}

describe('RecordSelectorDialogComponent (DOM)', () => {
  it('does NOT render the dialog when DialogVisible is false', () => {
    const f = render({ DialogVisible: false, DisplayField: 'Name' });
    expect(query(f, '.mj-dialog-container')).toBeNull();
    expect(query(f, 'mj-record-selector')).toBeNull();
  });

  it('renders the dialog and the inner record-selector when DialogVisible is true', () => {
    const f = render({
      DialogVisible: true,
      DisplayField: 'Name',
      UnselectedRecords: asEntities(makeRows('Alpha')),
    });
    expect(query(f, '.mj-dialog-container')).not.toBeNull();
    expect(query(f, 'mj-record-selector')).not.toBeNull();
    // the inner selector actually rendered the projected row
    expect(text(f, '.unselected-list .list-item')).toBe('Alpha');
  });

  it('binds DialogTitle into the dialog titlebar', () => {
    const f = render({ DialogVisible: true, DialogTitle: 'Pick Members', DisplayField: 'Name' });
    expect(text(f, '.mj-dialog-title')).toBe('Pick Members');
  });

  it('emits DialogClosed(true) when OK is clicked', () => {
    const f = render({ DialogVisible: true, DisplayField: 'Name' });
    const closed = capture(f.componentInstance.DialogClosed);

    click(f, 'button[variant="primary"]'); // OK button
    f.detectChanges();

    expect(closed).toEqual([true]);
  });

  it('emits DialogClosed(false) when Cancel is clicked', () => {
    const f = render({ DialogVisible: true, DisplayField: 'Name' });
    const closed = capture(f.componentInstance.DialogClosed);

    // Cancel is the second action button (OK is variant="primary", Cancel has no variant)
    const buttons = Array.from(f.nativeElement.querySelectorAll('mj-dialog-actions button')) as HTMLButtonElement[];
    const cancel = buttons.find((b) => !b.getAttribute('variant'));
    expect(cancel).toBeTruthy();
    cancel!.click();
    f.detectChanges();

    expect(closed).toEqual([false]);
  });

  it('hides the dialog after OK is clicked (DialogVisible flips to false)', () => {
    const f = render({ DialogVisible: true, DisplayField: 'Name' });
    expect(query(f, '.mj-dialog-container')).not.toBeNull();

    click(f, 'button[variant="primary"]');
    f.detectChanges();

    expect(f.componentInstance.DialogVisible).toBe(false);
    expect(query(f, '.mj-dialog-container')).toBeNull();
  });

  it('Cancel restores the original selection (reverts in-place edits made while open)', () => {
    // RefreshInitialValues snapshots on open; OnCancel rebuilds the arrays from that snapshot.
    // The snapshot is taken in the DialogVisible setter, so the record inputs must be present
    // BEFORE we flip it visible — open it in `setup` (after inputs are applied), not via input.
    const selected = asEntities(makeRows('Gamma'));
    const unselected = asEntities(makeRows('Alpha', 'Beta'));
    const f = renderComponentFixture(RecordSelectorDialogComponent, {
      imports: [CommonModule, MJButtonDirective, MJDialogComponent, MJDialogActionsComponent],
      declarations: [RecordSelectorDialogComponent, RecordSelectorComponent],
      inputs: {
        DisplayField: 'Name',
        SelectedRecords: selected,
        UnselectedRecords: unselected,
      },
      setup: (c) => {
        c.DialogVisible = true; // snapshots initial values now that records are set
      },
    });

    // simulate an edit while the dialog is open: move Alpha into selected
    f.componentInstance.SelectedRecords.push(f.componentInstance.UnselectedRecords.splice(0, 1)[0]);
    expect(f.componentInstance.SelectedRecords.map((r) => r.Get('Name'))).toEqual(['Gamma', 'Alpha']);

    f.componentInstance.OnCancel();

    expect(f.componentInstance.SelectedRecords.map((r) => r.Get('Name'))).toEqual(['Gamma']);
    expect(f.componentInstance.UnselectedRecords.map((r) => r.Get('Name'))).toEqual(['Alpha', 'Beta']);
  });
});
