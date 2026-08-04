import { describe, it, expect } from 'vitest';
import { Component, EventEmitter, Input, Output, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ComponentFixture } from '@angular/core/testing';
import { renderComponentFixture, query, queryAll, text, click, typeInto, capture, hasClass } from '@memberjunction/ng-test-utils';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { MjFormFieldComponent } from './form-field.component';

/**
 * DOM-level spec for <mj-form-field> — the single most-used component in MJ forms.
 *
 * Record double approach: NO structural double at all. `BaseEntity` is abstract but has
 * no abstract members, so a trivial local subclass (`TestWidgetEntity`) over a real
 * `EntityInfo` (constructible from plain init data — same pattern as CodeGenLib's unit
 * tests) gives the component the REAL `Get`/`Set`/`Validate`/`IsSaved`/dirty-tracking
 * behavior it binds against, with zero seam casts. `SetMany(data, true, true)` is the
 * provider-free load path: `replaceOldValues=true` hydrates fields and marks the record
 * saved once all PKs are set, exactly like a view-row load.
 *
 * DEFERRED (not faked):
 * - The FK / `HasRelatedEntity` edit-mode machinery (search dropdown, scope picker,
 *   column prefs, create-new): it reads the `LinkedFieldOptionsStore.Instance` and
 *   `BaseEngineRegistry.Instance` process singletons plus `ProviderToUse.EntityByName`
 *   / `RunView` against related-entity metadata — that path is integration-shaped and
 *   is exercised against a live provider, not stubbed here.
 * - `AllowFKCreate` dialogs (`CanCreateFK` needs entity permissions off a real provider).
 * - Rich-text branches (`mj-markdown` / `mj-code-editor` / `mjSafeRichHtml`): the child
 *   components are heavy (CodeMirror, marked); inert selector-matching stubs below keep
 *   the template compiling — none of these tests assert rich-text behavior, and all
 *   test fields stay under the 255-char rich-text-eligibility threshold.
 */

// ---- Inert child stubs (template compile only — see header) ----

@Component({ standalone: true, selector: 'mj-markdown', template: '<span class="stub-markdown">{{ data }}</span>' })
class StubMarkdownComponent {
  @Input() data = '';
}

@Component({ standalone: true, selector: 'mj-code-editor', template: '<span class="stub-code-editor">{{ value }}</span>' })
class StubCodeEditorComponent {
  @Input() value = '';
  @Input() language = '';
  @Input() readonly = false;
  @Output() change = new EventEmitter<string>();
}

@Pipe({ standalone: true, name: 'mjSafeRichHtml' })
class StubSafeRichHtmlPipe implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

// ---- Real entity fixture ----

class TestWidgetEntity extends BaseEntity {}

const WIDGET_ID = '11111111-2222-3333-4444-555555555555';

function makeWidgetEntityInfo(): EntityInfo {
  // Real EntityInfo from plain init data: the constructor builds real EntityFieldInfo
  // instances, so derived metadata the component reads (TSType, ReadOnly, MaxLength,
  // DisplayNameOrName, EntityFieldValues) comes from the genuine getters.
  return new EntityInfo({
    ID: 'E0000001-0000-0000-0000-000000000001',
    Name: 'Test Widgets',
    Status: 'Active',
    BaseTable: 'TestWidget',
    BaseView: 'vwTestWidgets',
    Fields: [
      { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
      { ID: 'F2', Name: 'Name', DisplayName: 'Widget Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
      { ID: 'F3', Name: 'Description', Type: 'nvarchar', Length: 200, AllowsNull: true, AllowUpdateAPI: true },
      { ID: 'F4', Name: 'Quantity', Type: 'int', AllowsNull: true, AllowUpdateAPI: true },
      { ID: 'F5', Name: 'LaunchDate', Type: 'datetime', AllowsNull: true, AllowUpdateAPI: true },
      { ID: 'F6', Name: 'IsActive', Type: 'bit', AllowsNull: true, AllowUpdateAPI: true },
      {
        ID: 'F7',
        Name: 'Status',
        Type: 'nvarchar',
        Length: 100,
        AllowsNull: true,
        AllowUpdateAPI: true,
        EntityFieldValues: [{ Value: 'Active' }, { Value: 'Inactive' }, { Value: 'Pending' }],
      },
      { ID: 'F8', Name: 'Email', Type: 'nvarchar', Length: 200, AllowsNull: true, AllowUpdateAPI: true },
      { ID: 'F9', Name: 'Website', Type: 'nvarchar', Length: 400, AllowsNull: true, AllowUpdateAPI: true },
    ],
  });
}

/** A real, "saved" BaseEntity — SetMany with replaceOldValues=true hydrates + marks saved. */
function makeWidget(values: Record<string, unknown> = {}): BaseEntity {
  const entity = new TestWidgetEntity(makeWidgetEntityInfo());
  entity.SetMany({ ID: WIDGET_ID, Name: 'Gadget', ...values }, true, true);
  return entity;
}

function render(
  inputs: Record<string, unknown>,
  setup?: (c: MjFormFieldComponent) => void,
): ComponentFixture<MjFormFieldComponent> {
  return renderComponentFixture(MjFormFieldComponent, {
    declarations: [MjFormFieldComponent],
    imports: [CommonModule, StubMarkdownComponent, StubCodeEditorComponent, StubSafeRichHtmlPipe],
    inputs,
    setup,
  });
}

/** Dispatch a mousedown — the dropdown option handlers bind (mousedown), not (click). */
function mousedown(fixture: ComponentFixture<MjFormFieldComponent>, selector: string): void {
  const el = query(fixture, selector);
  if (!el) throw new Error(`mousedown(): no element matched "${selector}"`);
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

describe('MjFormFieldComponent (DOM)', () => {
  describe('read-only mode', () => {
    it('renders the metadata display name as the label and the field value as text', () => {
      const f = render({ Record: makeWidget(), FieldName: 'Name', Type: 'textbox' });
      expect(text(f, '.mj-forms-field-label')).toBe('Widget Name');
      expect(text(f, '.mj-forms-field-value')).toBe('Gadget');
      expect(query(f, 'input')).toBeNull(); // no edit control in read mode
    });

    it('prefers DisplayNameOverride over the metadata display name', () => {
      const f = render({ Record: makeWidget(), FieldName: 'Name', Type: 'textbox', DisplayNameOverride: 'Custom Label' });
      expect(text(f, '.mj-forms-field-label')).toBe('Custom Label');
    });

    it('renders no label when ShowLabel is false', () => {
      const f = render({ Record: makeWidget(), FieldName: 'Name', Type: 'textbox', ShowLabel: false });
      expect(query(f, '.mj-forms-field-label')).toBeNull();
      expect(text(f, '.mj-forms-field-value')).toBe('Gadget');
    });

    it('hides an empty field entirely by default (HideWhenEmptyInReadOnlyMode)', () => {
      const f = render({ Record: makeWidget({ Description: null }), FieldName: 'Description', Type: 'textbox' });
      expect(query(f, '.mj-forms-field')).toBeNull();
    });

    it('still renders an empty field when HideWhenEmptyInReadOnlyMode is false', () => {
      const f = render({
        Record: makeWidget({ Description: null }),
        FieldName: 'Description',
        Type: 'textbox',
        HideWhenEmptyInReadOnlyMode: false,
      });
      expect(query(f, '.mj-forms-field')).not.toBeNull();
      expect(text(f, '.mj-forms-field-value')).toBe('');
    });

    it('renders a boolean as a disabled checkbox mirroring the value', () => {
      const f = render({ Record: makeWidget({ IsActive: true }), FieldName: 'IsActive', Type: 'checkbox' });
      const box = query(f, '.mj-forms-field-checkbox input[type="checkbox"]') as HTMLInputElement;
      expect(box).not.toBeNull();
      expect(box.disabled).toBe(true);
      expect(box.checked).toBe(true);
    });

    it("LinkType 'Email' renders a mailto-style link and clicking it emits an email Navigate event", () => {
      const f = render({
        Record: makeWidget({ Email: 'ada@example.com' }),
        FieldName: 'Email',
        Type: 'textbox',
        LinkType: 'Email',
      });
      const events = capture(f.componentInstance.Navigate);
      expect(text(f, '.mj-forms-field-link')).toContain('ada@example.com');
      click(f, '.mj-forms-field-link');
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.Kind).toBe('email');
      if (e.Kind === 'email') {
        expect(e.EmailAddress).toBe('ada@example.com');
      }
    });

    it("LinkType 'URL' renders a link and clicking it emits an external-link Navigate event (new tab)", () => {
      const f = render({
        Record: makeWidget({ Website: 'https://example.com' }),
        FieldName: 'Website',
        Type: 'textbox',
        LinkType: 'URL',
      });
      const events = capture(f.componentInstance.Navigate);
      click(f, '.mj-forms-field-link');
      expect(events).toHaveLength(1);
      const e = events[0];
      expect(e.Kind).toBe('external-link');
      if (e.Kind === 'external-link') {
        expect(e.Url).toBe('https://example.com');
        expect(e.OpenInNewTab).toBe(true);
      }
    });
  });

  describe('edit mode', () => {
    it('renders a text input for textbox and typing emits ValueChange with Old/New values and writes through to the record', () => {
      const record = makeWidget();
      const f = render({ Record: record, FieldName: 'Name', Type: 'textbox', EditMode: true });
      const changes = capture(f.componentInstance.ValueChange);

      const input = query(f, 'input.mj-forms-field-input') as HTMLInputElement;
      expect(input.value).toBe('Gadget');

      typeInto(f, 'input.mj-forms-field-input', 'Gizmo');
      f.detectChanges();

      expect(changes).toEqual([{ FieldName: 'Name', OldValue: 'Gadget', NewValue: 'Gizmo' }]);
      expect(record.Get('Name')).toBe('Gizmo');
      // Real dirty tracking on a saved record surfaces the dirty modifier class
      expect(hasClass(f, '.mj-forms-field', 'mj-forms-field--dirty')).toBe(true);
    });

    it('renders a textarea for Type textarea and typing updates the record', () => {
      const record = makeWidget({ Description: 'old text' });
      const f = render({ Record: record, FieldName: 'Description', Type: 'textarea', EditMode: true });
      const area = query(f, 'textarea.mj-forms-field-input--textarea') as HTMLTextAreaElement;
      expect(area).not.toBeNull();
      expect(area.value).toBe('old text');

      typeInto(f, 'textarea.mj-forms-field-input--textarea', 'new text');
      expect(record.Get('Description')).toBe('new text');
    });

    it('renders a number input and change emits a numeric value (empty input emits null)', () => {
      const record = makeWidget({ Quantity: 5 });
      const f = render({ Record: record, FieldName: 'Quantity', Type: 'number', EditMode: true });
      const changes = capture(f.componentInstance.ValueChange);
      const input = query(f, 'input[type="number"]') as HTMLInputElement;
      expect(input.value).toBe('5');

      input.value = '42';
      input.dispatchEvent(new Event('change'));
      expect(changes[0]).toEqual({ FieldName: 'Quantity', OldValue: 5, NewValue: 42 });

      input.value = '';
      input.dispatchEvent(new Event('change'));
      expect(changes[1].NewValue).toBeNull();
    });

    it('renders a date input pre-filled yyyy-MM-dd and change emits a Date', () => {
      const record = makeWidget({ LaunchDate: new Date(Date.UTC(2026, 0, 15)) });
      const f = render({ Record: record, FieldName: 'LaunchDate', Type: 'datepicker', EditMode: true });
      const changes = capture(f.componentInstance.ValueChange);
      const input = query(f, 'input[type="date"]') as HTMLInputElement;
      expect(input.value).toBe('2026-01-15');

      input.value = '2026-03-02';
      input.dispatchEvent(new Event('change'));
      expect(changes).toHaveLength(1);
      expect(changes[0].NewValue).toBeInstanceOf(Date);
      expect((changes[0].NewValue as Date).toISOString().startsWith('2026-03-02')).toBe(true);
    });

    it('renders an editable checkbox and clicking it emits the toggled boolean', () => {
      const record = makeWidget({ IsActive: false });
      const f = render({ Record: record, FieldName: 'IsActive', Type: 'checkbox', EditMode: true });
      const changes = capture(f.componentInstance.ValueChange);
      const box = query(f, '.mj-forms-field-checkbox input[type="checkbox"]') as HTMLInputElement;
      expect(box.disabled).toBe(false);
      expect(box.checked).toBe(false);

      box.click(); // jsdom fires the change event on checkbox activation
      expect(changes).toEqual([{ FieldName: 'IsActive', OldValue: false, NewValue: true }]);
      expect(record.Get('IsActive')).toBe(true);
    });

    it('select: opens a dropdown listing the value-list options from field metadata and selecting one updates the record', () => {
      const record = makeWidget({ Status: 'Active' });
      const f = render({ Record: record, FieldName: 'Status', Type: 'select', EditMode: true });
      const changes = capture(f.componentInstance.ValueChange);

      expect(text(f, '.mj-custom-select-value')).toBe('Active');
      expect(query(f, '.mj-fk-dropdown')).toBeNull(); // closed initially

      click(f, '.mj-custom-select-trigger');
      f.detectChanges();
      const options = queryAll(f, '.mj-fk-option').map((o) => o.textContent?.trim());
      expect(options).toEqual(['Active', 'Inactive', 'Pending']);

      mousedown(f, '.mj-fk-option:nth-child(3)');
      f.detectChanges();
      expect(changes).toEqual([{ FieldName: 'Status', OldValue: 'Active', NewValue: 'Pending' }]);
      expect(record.Get('Status')).toBe('Pending');
      expect(query(f, '.mj-fk-dropdown')).toBeNull(); // closed after selection
      expect(text(f, '.mj-custom-select-value')).toBe('Pending');
    });

    it('PossibleValuesOverride replaces the metadata value list in the select dropdown', () => {
      const f = render({
        Record: makeWidget({ Status: 'Alpha' }),
        FieldName: 'Status',
        Type: 'select',
        EditMode: true,
        PossibleValuesOverride: ['Alpha', 'Beta'],
      });
      click(f, '.mj-custom-select-trigger');
      f.detectChanges();
      const options = queryAll(f, '.mj-fk-option').map((o) => o.textContent?.trim());
      expect(options).toEqual(['Alpha', 'Beta']);
    });

    it("normalizes the deprecated 'dropdownlist' type name to the select control", () => {
      const f = render({ Record: makeWidget({ Status: 'Active' }), FieldName: 'Status', Type: 'dropdownlist', EditMode: true });
      expect(query(f, '.mj-custom-select-trigger')).not.toBeNull();
    });

    it("normalizes the deprecated 'numerictextbox' type name to a number input", () => {
      const f = render({ Record: makeWidget({ Quantity: 3 }), FieldName: 'Quantity', Type: 'numerictextbox', EditMode: true });
      expect(query(f, 'input[type="number"]')).not.toBeNull();
    });

    it('renders a metadata-read-only field (primary key) as read-only display even in edit mode', () => {
      const f = render({ Record: makeWidget(), FieldName: 'ID', Type: 'textbox', EditMode: true });
      expect(query(f, 'input')).toBeNull();
      expect(hasClass(f, '.mj-forms-field', 'mj-forms-field--readonly')).toBe(true);
      expect(text(f, '.mj-forms-field-value')).toBe(WIDGET_ID);
    });

    it('flags a required (non-nullable) field with the required-empty modifier when empty', () => {
      const f = render({ Record: makeWidget({ Name: '' }), FieldName: 'Name', Type: 'textbox', EditMode: true });
      expect(hasClass(f, '.mj-forms-field', 'mj-forms-field--required-empty')).toBe(true);
    });

    it('does not flag a required field as required-empty when it has a value', () => {
      const f = render({ Record: makeWidget(), FieldName: 'Name', Type: 'textbox', EditMode: true });
      expect(query(f, '.mj-forms-field')).not.toBeNull();
      expect(hasClass(f, '.mj-forms-field', 'mj-forms-field--required-empty')).toBe(false);
    });

    it('autocomplete: focus shows all value-list options, typing filters them, and mousedown selects', () => {
      const record = makeWidget({ Status: '' });
      const f = render({ Record: record, FieldName: 'Status', Type: 'autocomplete', EditMode: true });
      const input = query(f, 'input.mj-forms-field-input') as HTMLInputElement;

      input.dispatchEvent(new Event('focus'));
      f.detectChanges();
      expect(queryAll(f, '.mj-fk-option').map((o) => o.textContent?.trim())).toEqual(['Active', 'Inactive', 'Pending']);

      typeInto(f, 'input.mj-forms-field-input', 'pen');
      f.detectChanges();
      expect(queryAll(f, '.mj-fk-option').map((o) => o.textContent?.trim())).toEqual(['Pending']);

      mousedown(f, '.mj-fk-option');
      f.detectChanges();
      expect(record.Get('Status')).toBe('Pending');
      expect(query(f, '.mj-fk-dropdown')).toBeNull();
    });
  });
});
