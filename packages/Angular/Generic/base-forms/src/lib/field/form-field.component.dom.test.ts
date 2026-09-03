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
      // A DATE-ONLY column, deliberately beside the datetime above: the two must render differently.
      { ID: 'F9', Name: 'EffectiveDate', Type: 'date', AllowsNull: true, AllowUpdateAPI: true },
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

describe('date-only fields are a calendar day, not an instant', () => {
    /**
     * READ AND EDIT MODE DISAGREED BY A DAY, on ordinary valid data.
     *
     * A `date` column arrives as UTC midnight. Read mode ran it through `toLocaleString()`, a
     * LOCAL-time formatter, which subtracts the reader's offset and lands on the previous day for
     * everyone west of Greenwich. Edit mode used `toISOString()` and was correct. So a stored
     * 2026-11-20 showed as 11/19/2026 on the form and 2026-11-20 in the editor, same field.
     *
     * These tests PIN A TIMEZONE rather than trusting the runner's. A suite that happens to run in
     * UTC cannot observe this bug at all, which is how it survived: every assertion passes at
     * Greenwich and fails in New York.
     */
    const AT = (tz: string, fn: () => void) => {
        const original = process.env.TZ;
        process.env.TZ = tz;
        try {
            fn();
        } finally {
            process.env.TZ = original;
        }
    };

    it('renders the stored day, not the previous one, west of Greenwich', () => {
        AT('America/New_York', () => {
            const w = makeWidget({ EffectiveDate: new Date('2026-11-20T00:00:00.000Z') });
            const f = render({ Record: w, FieldName: 'EffectiveDate', Type: 'textbox' });
            const shown = text(f, '.mj-forms-field-value');
            expect(shown, `a stored 2026-11-20 must not render as the 19th (got ${shown})`).toContain('20');
            expect(shown).not.toContain('19');
        });
    });

    it('does not roll a January date back into the previous YEAR', () => {
        AT('America/New_York', () => {
            const w = makeWidget({ EffectiveDate: new Date('2026-01-01T00:00:00.000Z') });
            const f = render({ Record: w, FieldName: 'EffectiveDate', Type: 'textbox' });
            expect(text(f, '.mj-forms-field-value')).not.toContain('2025');
        });
    });

    it('shows no time of day — a calendar day has none', () => {
        AT('America/New_York', () => {
            const w = makeWidget({ EffectiveDate: new Date('2026-11-20T00:00:00.000Z') });
            const f = render({ Record: w, FieldName: 'EffectiveDate', Type: 'textbox' });
            expect(text(f, '.mj-forms-field-value')).not.toMatch(/\d{1,2}:\d{2}/);
        });
    });

    it('leaves a TIMESTAMP in local time, with its time — that one really is an instant', () => {
        AT('America/New_York', () => {
            const w = makeWidget({ LaunchDate: new Date('2026-11-20T22:30:00.000Z') });
            const f = render({ Record: w, FieldName: 'LaunchDate', Type: 'textbox' });
            const shown = text(f, '.mj-forms-field-value');
            expect(shown, 'a datetime must keep local-time rendering').toMatch(/\d{1,2}:\d{2}/);
        });
describe('an unreadable stored date is announced, not hidden (bc-aidp-next-golive#185)', () => {
    /**
     * THE FAILURE THIS PREVENTS IS DATA LOSS, not an ugly form.
     *
     * `DateInputValue` returns '' for a value it cannot render, and `<input type="date">` shows ''
     * as an empty box - the same box it shows for a field that was never set. So the field reads as
     * "no date", and the next save writes that emptiness over whatever was actually stored. The
     * element cannot display the bad value itself; there is no string that makes it show
     * `not-a-date`. Saying so beside the control is the only option available.
     */
    const WARNING = '.mj-forms-field-validation--warning';

    it('warns when the stored value cannot be shown in the date editor', () => {
        const f = render({ Record: makeWidget({ LaunchDate: new Date('not a date') }), FieldName: 'LaunchDate', Type: 'datepicker', EditMode: true });
        const input = query(f, 'input[type="date"]') as HTMLInputElement | null;
        expect(input!.value, 'precondition: the editor is blank').toBe('');
        expect(query(f, WARNING), 'a blank box with no explanation is the defect').not.toBeNull();
    });

    it('does NOT warn for a field that is simply empty', () => {
        const f = render({ Record: makeWidget({ LaunchDate: null }), FieldName: 'LaunchDate', Type: 'datepicker', EditMode: true });
        expect(query(f, 'input[type="date"]')).not.toBeNull();
        expect(query(f, WARNING), 'empty means empty and must not be decorated as a fault').toBeNull();
    });

    it('does NOT warn for a perfectly good date', () => {
        const f = render({ Record: makeWidget({ LaunchDate: new Date('2026-11-20T00:00:00.000Z') }), FieldName: 'LaunchDate', Type: 'datepicker', EditMode: true });
        const input = query(f, 'input[type="date"]') as HTMLInputElement | null;
        expect(input!.value).toBe('2026-11-20');
        expect(query(f, WARNING)).toBeNull();
    });

    /**
     * WHICH INGRESS SHAPES ACTUALLY REACH HERE UNREADABLE — measured, not assumed.
     *
     * A value LOADED FROM THE DATABASE never triggers this: the API sends dates as epoch
     * milliseconds (measured on a live server: ExpectedCloseDate came over as 1790726400000), and a
     * number always parses. So this warning cannot fire by opening a record, and these tests exist
     * to record what CAN reach it — client-side assignment from an import, an integration or an
     * Action, where `BaseEntity.Set` takes whatever it is handed.
     *
     * The UK/EU case is the one worth caring about: `20/11/2026` is the ordinary way most of the
     * world writes a date, and it is exactly what a CSV out of a European system contains.
     */
    it('a UK / EU formatted string reaches here unreadable and is announced', () => {
        const f = render({ Record: makeWidget({ LaunchDate: '20/11/2026' }), FieldName: 'LaunchDate', Type: 'datepicker', EditMode: true });
        expect((query(f, 'input[type="date"]') as HTMLInputElement).value).toBe('');
        expect(query(f, WARNING), 'a European date must not read as "no date"').not.toBeNull();
    });

    it('a dd-MM-yyyy string is announced too', () => {
        const f = render({ Record: makeWidget({ LaunchDate: '20-11-2026' }), FieldName: 'LaunchDate', Type: 'datepicker', EditMode: true });
        expect(query(f, WARNING)).not.toBeNull();
    });

    it('a whitespace-only value is announced rather than passing as empty', () => {
        const f = render({ Record: makeWidget({ LaunchDate: '   ' }), FieldName: 'LaunchDate', Type: 'datepicker', EditMode: true });
        expect(query(f, WARNING)).not.toBeNull();
    });

    it('the epoch-millisecond wire format is NOT announced — that is the normal load path', () => {
        // 1790726400000 is a real value taken off the running API for a `date` column holding
        // 2026-09-30. If this ever warns, the warning has started firing on ordinary data.
        const f = render({ Record: makeWidget({ LaunchDate: 1790726400000 }), FieldName: 'LaunchDate', Type: 'datepicker', EditMode: true });
        expect((query(f, 'input[type="date"]') as HTMLInputElement).value).toBe('2026-09-30');
        expect(query(f, WARNING)).toBeNull();
    });

    /**
     * NOT CAUGHT, AND THIS TEST SAYS SO RATHER THAN PRETENDING OTHERWISE.
     *
     * An Excel date serial (46346 = 20 Nov 2026 in Excel's epoch) is read as 46346 MILLISECONDS and
     * renders 1970-01-01. It parses, so nothing here can tell it from a real date — the field shows
     * a confident, wrong day and no warning. Same shape as `2026-02-31` rolling to 3 March.
     *
     * Both need the value refused at INGRESS, in the entity's type coercion, before anything is
     * asked to display it. Recorded here so the limit of this warning is written down next to it.
     */
    it('does NOT catch a value that parses to the wrong date — a known limit', () => {
        const f = render({ Record: makeWidget({ LaunchDate: 46346 }), FieldName: 'LaunchDate', Type: 'datepicker', EditMode: true });
        expect((query(f, 'input[type="date"]') as HTMLInputElement).value).toBe('1970-01-01');
        expect(query(f, WARNING), 'documents the gap: a parseable-but-wrong value is invisible here').toBeNull();
    });

    it('stays out of READ mode, which already surfaces the value itself', () => {
        // FormatValue() renders 'Invalid Date' / the raw text, so read mode needs no warning and
        // adding one there would be noise on a surface that is already honest.
        const f = render({ Record: makeWidget({ LaunchDate: new Date('not a date') }), FieldName: 'LaunchDate', Type: 'datepicker' });
        expect(query(f, WARNING)).toBeNull();
        expect(text(f, '.mj-forms-field-value')).toContain('Invalid Date');
    });
});
