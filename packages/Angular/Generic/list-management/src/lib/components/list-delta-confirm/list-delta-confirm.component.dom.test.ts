import { describe, it, expect } from 'vitest';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MJButtonDirective, MJDialogComponent, MJDialogActionsComponent } from '@memberjunction/ng-ui-components';
import { renderComponentFixture, query, queryAll, text, hasClass, click, capture } from '@memberjunction/ng-test-utils';
import type { ListDelta } from '@memberjunction/lists-base';
import { ListDeltaConfirmComponent } from './list-delta-confirm.component';

// ListDeltaConfirmComponent is module-declared (standalone: false). It renders into
// mj-dialog (which projects ng-content inline into the fixture DOM — no CDK overlay),
// and uses mjButton + mj-dialog-actions. It is pure @Input/@Output + getter-driven
// gating with NO data loading, so it is a high-value, honestly-unit-testable component.

const IMPORTS = [CommonModule, FormsModule, MJButtonDirective, MJDialogComponent, MJDialogActionsComponent];
const DECLARATIONS = [ListDeltaConfirmComponent];

function makeDelta(overrides: Partial<ListDelta> = {}): ListDelta {
  return {
    TargetListId: 'list-1',
    EntityName: 'Contacts',
    ToAdd: ['a1', 'a2', 'a3'],
    ToRemove: [],
    Unchanged: ['u1', 'u2'],
    Counts: { Add: 3, Remove: 0, Unchanged: 2, SourceTotal: 5, TargetTotal: 2 },
    Warnings: [],
    DeltaToken: 'token-abc',
    ...overrides,
  };
}

function render(inputs: Record<string, unknown>) {
  return renderComponentFixture(ListDeltaConfirmComponent, { imports: IMPORTS, declarations: DECLARATIONS, inputs });
}

describe('ListDeltaConfirmComponent (DOM)', () => {
  it('renders nothing when not Visible', () => {
    const fixture = render({ Visible: false, Delta: makeDelta() });
    expect(query(fixture, '.mj-dialog-backdrop')).toBeNull();
    expect(query(fixture, '.delta-confirm-body')).toBeNull();
  });

  it('renders nothing when Visible but Delta is null', () => {
    const fixture = render({ Visible: true, Delta: null });
    expect(query(fixture, '.delta-confirm-body')).toBeNull();
  });

  it('renders the dialog body when Visible with a Delta', () => {
    const fixture = render({ Visible: true, Delta: makeDelta() });
    expect(query(fixture, '.delta-confirm-body')).not.toBeNull();
  });

  describe('safe operation (no removals)', () => {
    it('shows the safe banner and not the danger banner', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      expect(query(fixture, '.delta-banner--safe')).not.toBeNull();
      expect(query(fixture, '.delta-banner--danger')).toBeNull();
    });

    it('does not apply the danger modifier to the body', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      expect(hasClass(fixture, '.delta-confirm-body', 'delta-confirm-body--danger')).toBe(false);
    });

    it('renders the add/unchanged/remove count tiles', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      expect(text(fixture, '.delta-tile--add .delta-tile__count')).toBe('+3');
      expect(text(fixture, '.delta-tile--keep .delta-tile__count')).toBe('2');
      // No drops: the remove tile shows the count with no minus sign.
      expect(text(fixture, '.delta-tile--remove-empty .delta-tile__count')).toBe('0');
    });

    it('enables the confirm button immediately', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      const btn = query(fixture, 'mj-dialog-actions button') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);
    });

    it('emits Confirm with the delta token on click', () => {
      const fixture = render({ Visible: true, Delta: makeDelta({ DeltaToken: 'safe-token' }) });
      const emitted = capture(fixture.componentInstance.Confirm);
      click(fixture, 'mj-dialog-actions button');
      expect(emitted).toEqual(['safe-token']);
    });
  });

  describe('drop-warning operation (removals present)', () => {
    const dropDelta = () =>
      makeDelta({
        ToRemove: ['r1', 'r2'],
        Counts: { Add: 3, Remove: 2, Unchanged: 2, SourceTotal: 5, TargetTotal: 4 },
      });

    it('shows the danger banner and the acknowledgement checkbox', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      expect(query(fixture, '.delta-banner--danger')).not.toBeNull();
      expect(query(fixture, '.delta-banner--safe')).toBeNull();
      expect(query(fixture, '.delta-banner__ack input[type="checkbox"]')).not.toBeNull();
    });

    it('applies the danger modifier to the body', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      expect(hasClass(fixture, '.delta-confirm-body', 'delta-confirm-body--danger')).toBe(true);
    });

    it('renders the remove tile with a minus-prefixed count', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      expect(text(fixture, '.delta-tile--remove .delta-tile__count')).toBe('−2');
    });

    it('disables the confirm button until the user acknowledges', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      const btn = query(fixture, 'mj-dialog-actions button') as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it('does not emit Confirm while the button is disabled', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      const emitted = capture(fixture.componentInstance.Confirm);
      click(fixture, 'mj-dialog-actions button');
      expect(emitted).toEqual([]);
    });

    it('enables and emits Confirm after the acknowledgement checkbox is checked', () => {
      const fixture = render({ Visible: true, Delta: dropDelta() });
      const emitted = capture(fixture.componentInstance.Confirm);

      const ack = query(fixture, '.delta-banner__ack input[type="checkbox"]') as HTMLInputElement;
      ack.checked = true;
      ack.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      const btn = query(fixture, 'mj-dialog-actions button') as HTMLButtonElement;
      expect(btn.disabled).toBe(false);

      btn.click();
      expect(emitted).toEqual(['token-abc']);
    });
  });

  describe('preview lists', () => {
    it('renders add preview rows limited by PreviewLimit', () => {
      const fixture = render({
        Visible: true,
        Delta: makeDelta({ ToAdd: ['a1', 'a2', 'a3', 'a4', 'a5'], Counts: { Add: 5, Remove: 0, Unchanged: 0, SourceTotal: 5, TargetTotal: 0 } }),
        PreviewLimit: 2,
      });
      expect(queryAll(fixture, '.delta-preview__row--add').length).toBe(2);
    });

    it('renders remove preview rows when drops are present', () => {
      const fixture = render({
        Visible: true,
        Delta: makeDelta({ ToRemove: ['r1', 'r2', 'r3'], Counts: { Add: 0, Remove: 3, Unchanged: 0, SourceTotal: 0, TargetTotal: 3 } }),
        PreviewLimit: 5,
      });
      expect(queryAll(fixture, '.delta-preview__row--remove').length).toBe(3);
    });
  });

  describe('target name binding', () => {
    it('renders the provided target list name', () => {
      const fixture = render({ Visible: true, Delta: makeDelta(), TargetListName: 'VIP Donors' });
      expect(text(fixture, '.delta-confirm-intro')).toContain('VIP Donors');
    });

    it('falls back to "this list" when no name is provided', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      expect(text(fixture, '.delta-confirm-intro')).toContain('this list');
    });
  });

  describe('cancel', () => {
    it('emits Cancel when the Cancel button is clicked', () => {
      const fixture = render({ Visible: true, Delta: makeDelta() });
      const emitted = capture(fixture.componentInstance.Cancel);
      const buttons = queryAll(fixture, 'mj-dialog-actions button') as HTMLButtonElement[];
      const cancel = buttons.find((b) => b.textContent?.trim() === 'Cancel')!;
      cancel.click();
      expect(emitted.length).toBe(1);
    });
  });
});
