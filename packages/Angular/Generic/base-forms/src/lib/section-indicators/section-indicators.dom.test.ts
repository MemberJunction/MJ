import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { ValidationErrorInfo, ValidationErrorType } from '@memberjunction/global';
import { MjCollapsiblePanelComponent } from '../panel/collapsible-panel.component';
import { MjFormFieldComponent } from '../field/form-field.component';
import { FormSectionIndicatorCoordinator } from './form-section-indicator-coordinator.service';
import type { FormContext } from '../types/form-types';
import type { FormSectionIndicators } from './form-section-indicators';

/**
 * DOM spec for section indicators on `<mj-collapsible-panel>`: the unsaved-changes dot
 * and the invalid-field count a section derives from the real `<mj-form-field>`s it
 * projects, so a multi-section form can say WHICH section holds an edit or a failure.
 *
 * Every expectation is written from the field's own contract: a section is dirty when
 * one of its fields would show the amber label dot (edited, on a SAVED record), and
 * invalid when one of its fields would paint its underline red (a failing rule, or a
 * required field left empty in edit mode). The section can never disagree with its
 * fields because it reads the very same getters.
 */

// ---- Inert child stubs so <mj-form-field>'s template compiles (see form-field.component.dom.test.ts) ----
@Component({ standalone: true, selector: 'mj-markdown', template: '' })
class StubMarkdownComponent { @Input() data = ''; }

@Component({ standalone: true, selector: 'mj-code-editor', template: '' })
class StubCodeEditorComponent {
  @Input() value = '';
  @Input() language = '';
  @Input() readonly = false;
  @Output() change = new EventEmitter<string>();
}

@Pipe({ standalone: true, name: 'mjSafeRichHtml' })
class StubSafeRichHtmlPipe implements PipeTransform {
  transform(value: string): string { return value; }
}

class TestWidgetEntity extends BaseEntity {}

const WIDGET_ID = '11111111-2222-3333-4444-555555555555';

function makeWidgetInfo(): EntityInfo {
  return new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000001',
    Name: 'Test Widgets',
    Status: 'Active',
    BaseTable: 'TestWidget',
    BaseView: 'vwTestWidgets',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F3', Name: 'Code', Type: 'nvarchar', Length: 50, AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F4', Name: 'Notes', Type: 'nvarchar', Length: 200, AllowsNull: true, AllowUpdateAPI: true },
      // NOT NULL but read-only — like __mj_CreatedAt: empty on a new record, filled by the save itself.
      { ID: 'F5', Name: 'CreatedAt', Type: 'datetimeoffset', AllowsNull: false, AllowUpdateAPI: false },
      { ID: 'F6', Name: 'DueDate', Type: 'datetime', AllowsNull: true, AllowUpdateAPI: true },
    ],
  });
}

/** A real, SAVED record (replaceOldValues=true hydrates + marks saved, like a view-row load). */
function makeSavedWidget(values: Record<string, unknown> = {}): BaseEntity {
  const e = new TestWidgetEntity(makeWidgetInfo());
  e.SetMany({ ID: WIDGET_ID, Name: 'Gadget', Code: 'G1', Notes: 'n', ...values }, true, true);
  return e;
}

/** A real NEW record — never saved, every value is "new" rather than "changed". */
function makeNewWidget(values: Record<string, unknown> = {}): BaseEntity {
  const e = new TestWidgetEntity(makeWidgetInfo());
  e.SetMany({ Name: 'Gadget', Code: 'G1', ...values }, true, false);
  return e;
}

function failure(source: string, message = 'required'): ValidationErrorInfo {
  return new ValidationErrorInfo(source, message, null, ValidationErrorType.Failure);
}

function warning(source: string, message = 'check this'): ValidationErrorInfo {
  return new ValidationErrorInfo(source, message, null, ValidationErrorType.Warning);
}

/**
 * Two field panels + one related-entity panel that declares it owns the
 * `Modifications` graph collection, all under a shared coordinator — the shape a
 * generated (or custom) form projects into `<mj-record-form-container>`.
 */
@Component({
  standalone: false,
  template: `
    <mj-collapsible-panel SectionKey="identity" SectionName="Identity" [Form]="form" [FormContext]="ctx">
      <mj-form-field [Record]="record" FieldName="Name" Type="textbox" [EditMode]="editMode" [FormContext]="ctx"></mj-form-field>
      <mj-form-field [Record]="record" FieldName="Code" Type="textbox" [EditMode]="editMode" [FormContext]="ctx"></mj-form-field>
    </mj-collapsible-panel>
    <mj-collapsible-panel SectionKey="notes" SectionName="Notes" [Form]="form" [FormContext]="ctx" [Indicators]="extra">
      <mj-form-field [Record]="record" FieldName="Notes" Type="textbox" [EditMode]="editMode" [FormContext]="ctx"></mj-form-field>
      <mj-form-field [Record]="record" FieldName="CreatedAt" Type="datepicker" [EditMode]="editMode" [FormContext]="ctx"></mj-form-field>
      <mj-form-field [Record]="record" FieldName="DueDate" Type="datepicker" [EditMode]="editMode" [FormContext]="ctx"></mj-form-field>
    </mj-collapsible-panel>
    <mj-collapsible-panel SectionKey="modificationsPanel" SectionName="Modifications" Variant="related-entity"
                          ValidationSources="Modifications" [Form]="form" [FormContext]="ctx">
    </mj-collapsible-panel>
  `,
})
class HostComponent {
  record: BaseEntity = makeSavedWidget();
  editMode = true;
  extra: Partial<FormSectionIndicators> | null = null;
  form = {
    IsSectionExpanded: () => true,
    SetSectionExpanded: () => undefined,
    getSectionDisplayOrder: () => 0,
  };
  ctx: FormContext = { showValidation: false, validationErrors: [] };
}

interface HostSetup {
  record?: BaseEntity;
  editMode?: boolean;
  ctx?: FormContext;
  extra?: Partial<FormSectionIndicators>;
}

function render(setup: HostSetup = {}) {
  return renderComponentFixture(HostComponent, {
    imports: [CommonModule, StubMarkdownComponent, StubCodeEditorComponent, StubSafeRichHtmlPipe],
    declarations: [HostComponent, MjCollapsiblePanelComponent, MjFormFieldComponent],
    providers: [FormSectionIndicatorCoordinator],
    setup: (host) => {
      if (setup.record) host.record = setup.record;
      if (setup.editMode !== undefined) host.editMode = setup.editMode;
      if (setup.ctx) host.ctx = setup.ctx;
      if (setup.extra) host.extra = setup.extra;
    },
    autoDetect: true,
  });
}

type Fixture = ReturnType<typeof render>;

function panelByKey(f: Fixture, sectionKey: string): MjCollapsiblePanelComponent {
  const found = f.debugElement
    .queryAll(By.directive(MjCollapsiblePanelComponent))
    .map((d) => d.componentInstance as MjCollapsiblePanelComponent)
    .find((p) => p.SectionKey === sectionKey);
  if (!found) throw new Error(`no panel with SectionKey="${sectionKey}"`);
  return found;
}

function fieldByName(f: Fixture, fieldName: string): MjFormFieldComponent {
  const found = f.debugElement
    .queryAll(By.directive(MjFormFieldComponent))
    .map((d) => d.componentInstance as MjFormFieldComponent)
    .find((c) => c.FieldName === fieldName);
  if (!found) throw new Error(`no field "${fieldName}"`);
  return found;
}

function hostEl(f: Fixture, sectionKey: string): HTMLElement {
  const el = f.nativeElement.querySelector(`mj-collapsible-panel[data-section-key="${sectionKey}"]`);
  if (!el) throw new Error(`no host element for SectionKey="${sectionKey}"`);
  return el as HTMLElement;
}

function coordinator(): FormSectionIndicatorCoordinator {
  return TestBed.inject(FormSectionIndicatorCoordinator);
}

describe('Section indicators — unsaved-changes dot', () => {
  it('shows nothing on a clean saved record', () => {
    const f = render();
    expect(panelByKey(f, 'identity').SectionDirtyCount).toBe(0);
    expect(hostEl(f, 'identity').querySelector('.mj-forms-panel-dirty')).toBeNull();
    expect(hostEl(f, 'identity').classList.contains('mj-panel-dirty')).toBe(false);
  });

  it('marks the section whose field was edited, and only that section', () => {
    const f = render();
    fieldByName(f, 'Code').Value = 'G2';
    f.detectChanges();
    expect(panelByKey(f, 'identity').SectionDirtyCount).toBe(1);
    expect(panelByKey(f, 'notes').SectionDirtyCount).toBe(0);
    const identity = hostEl(f, 'identity');
    expect(identity.classList.contains('mj-panel-dirty')).toBe(true);
    expect(identity.getAttribute('data-dirty-count')).toBe('1');
    expect(identity.querySelector('.mj-forms-panel-dirty')).not.toBeNull();
    expect(hostEl(f, 'notes').querySelector('.mj-forms-panel-dirty')).toBeNull();
  });

  it('counts each edited field once', () => {
    const f = render();
    fieldByName(f, 'Name').Value = 'Gizmo';
    fieldByName(f, 'Code').Value = 'G2';
    f.detectChanges();
    expect(panelByKey(f, 'identity').SectionDirtyCount).toBe(2);
    expect(hostEl(f, 'identity').querySelector('.mj-forms-panel-dirty')?.getAttribute('title')).toBe('2 unsaved changes in this section');
  });

  it('clears when the edit is reverted to the original value', () => {
    const f = render();
    const code = fieldByName(f, 'Code');
    code.Value = 'G2';
    f.detectChanges();
    expect(panelByKey(f, 'identity').SectionDirtyCount).toBe(1);
    code.Value = 'G1';
    f.detectChanges();
    expect(panelByKey(f, 'identity').SectionDirtyCount).toBe(0);
  });

  it('shows no dot on a NEW record — mirrors the field, which only dots edits to saved records', () => {
    const f = render({ record: makeNewWidget() });
    fieldByName(f, 'Code').Value = 'G2';
    f.detectChanges();
    expect(fieldByName(f, 'Code').IsDirty).toBe(false);
    expect(panelByKey(f, 'identity').SectionDirtyCount).toBe(0);
  });
});

describe('Section indicators — invalid fields', () => {
  it('flags a required field left empty in edit mode, live, before any save is attempted', () => {
    const f = render({ record: makeSavedWidget({ Code: '' }) });
    expect(fieldByName(f, 'Code').IsRequiredEmpty).toBe(true);
    const identity = panelByKey(f, 'identity');
    expect(identity.SectionErrorCount).toBe(1);
    expect(panelByKey(f, 'notes').SectionErrorCount).toBe(0);
    const el = hostEl(f, 'identity');
    expect(el.classList.contains('mj-panel-has-errors')).toBe(true);
    expect(el.getAttribute('data-error-count')).toBe('1');
    expect(el.querySelector('.mj-forms-panel-error-badge')?.textContent?.trim()).toBe('1');
    expect(el.querySelector('.mj-forms-panel-error-badge')?.getAttribute('title')).toBe('1 field in this section needs attention');
  });

  it('never counts a READ-ONLY required field — it renders no editor and cannot be fixed by the user', () => {
    const f = render({ record: makeNewWidget() });
    const created = fieldByName(f, 'CreatedAt');
    expect(created.IsFieldReadOnly).toBe(true);
    expect(created.IsRequiredEmpty).toBe(true); // the field getter alone would say "empty"
    expect(panelByKey(f, 'notes').SectionErrorCount).toBe(0);
    expect(hostEl(f, 'notes').querySelector('.mj-forms-panel-error-badge')).toBeNull();
  });

  it('is silent in read mode — a blank required field is only a problem while editing', () => {
    const f = render({ record: makeSavedWidget({ Code: '' }), editMode: false });
    expect(panelByKey(f, 'identity').SectionErrorCount).toBe(0);
    expect(hostEl(f, 'identity').querySelector('.mj-forms-panel-error-badge')).toBeNull();
  });

  it('clears as soon as the required field is filled in', () => {
    const f = render({ record: makeSavedWidget({ Code: '' }) });
    expect(panelByKey(f, 'identity').SectionErrorCount).toBe(1);
    fieldByName(f, 'Code').Value = 'G9';
    f.detectChanges();
    expect(panelByKey(f, 'identity').SectionErrorCount).toBe(0);
    expect(hostEl(f, 'identity').querySelector('.mj-forms-panel-error-badge')).toBeNull();
  });

  it('attributes a failed-save validation error to the panel that renders the field', () => {
    const f = render({ ctx: { showValidation: true, validationErrors: [failure('Code')] } });
    expect(fieldByName(f, 'Code').ShowErrors).toBe(true);
    expect(panelByKey(f, 'identity').SectionErrorCount).toBe(1);
    expect(panelByKey(f, 'notes').SectionErrorCount).toBe(0);
  });

  it('counts a field once even when it is both required-empty and named by a failed save', () => {
    const f = render({ record: makeSavedWidget({ Code: '' }), ctx: { showValidation: true, validationErrors: [failure('Code'), failure('Code', 'too short')] } });
    expect(panelByKey(f, 'identity').SectionErrorCount).toBe(1);
  });

  it('counts every failing field in the same panel', () => {
    const f = render({ ctx: { showValidation: true, validationErrors: [failure('Name'), failure('Code')] } });
    expect(panelByKey(f, 'identity').SectionErrorCount).toBe(2);
    expect(hostEl(f, 'identity').querySelector('.mj-forms-panel-error-badge')?.textContent?.trim()).toBe('2');
  });

  it('routes a positional graph source to the panel that declares the collection — never to the header', () => {
    const f = render({ ctx: { showValidation: true, validationErrors: [failure('Modifications[2].ContractTemplateProvisionID')] } });
    expect(panelByKey(f, 'modificationsPanel').SectionErrorCount).toBe(1);
    expect(panelByKey(f, 'identity').SectionErrorCount).toBe(0);
    expect(panelByKey(f, 'notes').SectionErrorCount).toBe(0);
  });

  it('ignores graph sources until the form asks for validation to show', () => {
    const f = render({ ctx: { showValidation: false, validationErrors: [failure('Modifications[2].X')] } });
    expect(panelByKey(f, 'modificationsPanel').SectionErrorCount).toBe(0);
  });

  it('separates warnings from failures and shows the warning badge only when no failure is present', () => {
    const f = render({ ctx: { showValidation: true, validationErrors: [warning('Notes')] } });
    const notes = panelByKey(f, 'notes');
    expect(notes.SectionWarningCount).toBe(1);
    expect(notes.SectionErrorCount).toBe(0);
    const el = hostEl(f, 'notes');
    expect(el.classList.contains('mj-panel-has-warnings')).toBe(true);
    expect(el.querySelector('.mj-forms-panel-warning-badge')?.textContent?.trim()).toBe('1');
    expect(el.querySelector('.mj-forms-panel-error-badge')).toBeNull();
  });
});

describe('Section indicators — stored date the input cannot parse', () => {
  it('counts it as a warning, exactly as the field paints its own amber underline', () => {
    const f = render({ record: makeSavedWidget({ DueDate: 'not a date' }) });
    const due = fieldByName(f, 'DueDate');
    expect(due.StoredDateIsUnreadable).toBe(true);
    expect(due.ShowWarnings).toBe(false); // the validation pipeline knows nothing about it
    const notes = panelByKey(f, 'notes');
    expect(notes.SectionWarningCount).toBe(1);
    expect(notes.SectionErrorCount).toBe(0);
    expect(hostEl(f, 'notes').querySelector('.mj-forms-panel-warning-badge')?.textContent?.trim()).toBe('1');
  });
});

describe('Section indicators — custom content via [Indicators]', () => {
  it('adds the supplied counts to the ones derived from the fields', () => {
    const f = render({ extra: { DirtyCount: 2, ErrorCount: 1 } });
    fieldByName(f, 'Notes').Value = 'changed';
    f.detectChanges();
    const notes = panelByKey(f, 'notes');
    expect(notes.SectionDirtyCount).toBe(3);
    expect(notes.SectionErrorCount).toBe(1);
    expect(hostEl(f, 'notes').querySelector('.mj-forms-panel-error-badge')?.textContent?.trim()).toBe('1');
  });
});

describe('Section indicators — coordinator wiring', () => {
  it('registers every panel under its SectionKey so a rail group can sum the sections it fronts', () => {
    const f = render({ record: makeSavedWidget({ Code: '' }) });
    fieldByName(f, 'Notes').Value = 'changed';
    f.detectChanges();
    const c = coordinator();
    expect(c.RegisteredSectionKeys).toEqual(['identity', 'notes', 'modificationsPanel']);
    expect(c.IndicatorsForKeys(['identity', 'notes'])).toEqual({ DirtyCount: 1, ErrorCount: 1, WarningCount: 0 });
    expect(c.IndicatorsFor('modificationsPanel')).toEqual({ DirtyCount: 0, ErrorCount: 0, WarningCount: 0 });
  });

  it('notifies the coordinator on every field edit so an OnPush rail re-reads on the same tick', () => {
    const f = render();
    let fired = 0;
    coordinator().Changes.subscribe(() => fired++);
    fieldByName(f, 'Code').Value = 'G2';
    expect(fired).toBe(1);
  });

  it('answers which form-level errors no section claims', () => {
    render();
    const unrouted = coordinator().UnroutedValidationErrors([failure('Code'), failure('Modifications[0].X'), failure('NotOnThisForm')]);
    expect(unrouted.map((e) => e.Source)).toEqual(['NotOnThisForm']);
  });

  it('unregisters a destroyed panel', () => {
    const f = render();
    const c = coordinator();
    expect(c.Has('identity')).toBe(true);
    f.destroy();
    expect(c.RegisteredSectionKeys).toEqual([]);
  });
});
