import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { By } from '@angular/platform-browser';
import type { BaseEntity } from '@memberjunction/core';
import { renderComponentFixture, query, capture } from '@memberjunction/ng-test-utils';
import { MjRecordFormContainerComponent } from './record-form-container.component';

/**
 * DOM coverage for <mj-record-form-container> — the form host CodeGen wraps every entity form in
 * (~407×). The 8 heavy children (toolbar, section-manager, panel-slot, isa-panel, record-changes/tags,
 * list-management-dialog, empty-state) are stubbed to their bound surfaces. With no FormComponent
 * bound, the Effective* getters fall back to the @Inputs and the toolbar-event handlers re-emit the
 * container's own outputs — so these verify the layout-class logic, the toolbar input wiring, and the
 * toolbar → container output forwarding (the container's actual job).
 */

// --- child stubs: declare every INPUT the template binds (errorOnUnknownProperties is on);
//     unknown outputs fall back to native event listeners, so only tested outputs are declared. ---
@Component({ standalone: true, selector: 'mj-form-toolbar', template: '' })
class ToolbarStub {
  @Input() Record: unknown; @Input() EditMode = false; @Input() UserCanEdit = false; @Input() UserCanDelete = false;
  @Input() IsFavorite = false; @Input() FavoriteInitDone = false; @Input() IsDirty = false; @Input() DirtyFieldNames: unknown;
  @Input() ListCount = 0; @Input() TagCount = 0; @Input() VersionCount = 0; @Input() EntityInfo: unknown; @Input() Config: unknown;
  @Input() IsSaving = false; @Input() VisibleSectionCount = 0; @Input() TotalSectionCount = 0; @Input() ExpandedSectionCount = 0;
  @Input() SearchFilter = ''; @Input() ShowEmptyFields = false; @Input() WidthMode = ''; @Input() HasCustomSectionOrder = false;
  @Input() Variants: unknown; @Input() CurrentVariantID: unknown;
  @Output() Navigate = new EventEmitter<unknown>();
  @Output() EditModeChange = new EventEmitter<boolean>();
  @Output() BeforeSave = new EventEmitter<unknown>();
  @Output() SaveRequested = new EventEmitter<void>();
  @Output() CancelRequested = new EventEmitter<void>();
  @Output() DeleteRequested = new EventEmitter<void>();
}
@Component({ standalone: true, selector: 'mj-section-manager', template: '' })
class SectionManagerStub { @Input() Sections: unknown; @Input() SectionOrder: unknown; @Input() Visible = false; }
@Component({ standalone: true, selector: 'mj-form-panel-slot', template: '' })
class PanelSlotStub { @Input() Entity: unknown; @Input() Record: unknown; @Input() FormComponent: unknown; }
@Component({ standalone: true, selector: 'mj-empty-state', template: '' })
class EmptyStateStub { @Input() Message = ''; }
@Component({ standalone: true, selector: 'mj-isa-related-panel', template: '' })
class IsaPanelStub { @Input() Record: unknown; @Input() EditMode = false; @Input() Collapsed = false; }
@Component({ standalone: true, selector: 'mj-record-changes', template: '' })
class RecordChangesStub { @Input() record: unknown; @Input() AllowRestore = false; }
@Component({ standalone: true, selector: 'mj-record-tags', template: '' })
class RecordTagsStub { @Input() Record: unknown; @Input() WidthPx = 0; }
@Component({ standalone: true, selector: 'mj-list-management-dialog', template: '' })
class ListMgmtStub { @Input() visible = false; @Input() config: unknown; }

const CHILD_STUBS = [ToolbarStub, SectionManagerStub, PanelSlotStub, EmptyStateStub, IsaPanelStub, RecordChangesStub, RecordTagsStub, ListMgmtStub];

const RECORD = { EntityInfo: { Name: 'Accounts' } } as unknown as BaseEntity;

const render = (inputs: Record<string, unknown> = {}) =>
  renderComponentFixture(MjRecordFormContainerComponent, {
    imports: CHILD_STUBS,
    declarations: [MjRecordFormContainerComponent],
    inputs: { Record: RECORD, EntityInfo: { Name: 'Accounts' }, ...inputs },
  });
const toolbar = (f: ReturnType<typeof render>) => f.debugElement.query(By.directive(ToolbarStub)).componentInstance as ToolbarStub;
const panels = (f: ReturnType<typeof render>) => query(f, '.mj-forms-panels-container') as HTMLElement;

describe('MjRecordFormContainerComponent (DOM)', () => {
  it('has no full-width layout class in centered mode', () => {
    expect(panels(render({ WidthMode: 'centered' })).classList.contains('mj-forms-panels--full-width')).toBe(false);
  });

  it('applies the full-width layout class in full-width mode', () => {
    expect(panels(render({ WidthMode: 'full-width' })).classList.contains('mj-forms-panels--full-width')).toBe(true);
  });

  it('applies the edit-mode layout class when EditMode is on', () => {
    expect(panels(render({ EditMode: true })).classList.contains('mj-forms-panels--edit-mode')).toBe(true);
  });

  it('wires the effective state inputs onto the toolbar', () => {
    const t = toolbar(render({ EditMode: true, UserCanEdit: true, IsDirty: true }));
    expect(t.EditMode).toBe(true);
    expect(t.UserCanEdit).toBe(true);
    expect(t.IsDirty).toBe(true);
    expect(t.Record).toBe(RECORD);
  });

  it('re-emits SaveRequested from the toolbar (no FormComponent → container emits)', () => {
    const f = render();
    const out = capture(f.componentInstance.SaveRequested);
    toolbar(f).SaveRequested.emit();
    expect(out.length).toBe(1);
  });

  it('re-emits CancelRequested from the toolbar', () => {
    const f = render();
    const out = capture(f.componentInstance.CancelRequested);
    toolbar(f).CancelRequested.emit();
    expect(out.length).toBe(1);
  });

  it('re-emits DeleteRequested from the toolbar', () => {
    const f = render();
    const out = capture(f.componentInstance.DeleteRequested);
    toolbar(f).DeleteRequested.emit();
    expect(out.length).toBe(1);
  });

  it('passes the BeforeSave event straight through', () => {
    const f = render();
    const out = capture(f.componentInstance.BeforeSave);
    const evt = { cancel: false } as unknown as Parameters<typeof f.componentInstance.BeforeSave.emit>[0];
    toolbar(f).BeforeSave.emit(evt);
    expect(out).toEqual([evt]);
  });
  // NOTE: the <mj-form-panel-slot> host renders only when the form has resolved sections/panels
  // (data wiring beyond this container's own contract); its own coverage lives in
  // form-panel-slot.component.dom.test.ts. PanelSlotStub is imported only so the template compiles.
});
