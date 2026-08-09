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
    });
});

// ─── Field-level security ─────────────────────────────────────────────────
//
// BaseEntity.Get() THROWS for a field the current user cannot read, so a form that rendered a
// denied field would take out the whole form rather than hide a column. These tests pin the
// gate that prevents that, and pin that it fails open — the server is the real boundary, so a
// form hiding fields because no user resolved yet would be worse than one showing them.

describe('MjFormFieldComponent — field-level security', () => {
  const HR_ROLE_ID = 'A0000000-0000-0000-0000-000000000001';
  const INTERN_ROLE_ID = 'A0000000-0000-0000-0000-000000000003';

  /** Widget metadata with field security ON and `Description` readable only by HR. */
  function makeSecuredEntityInfo(): EntityInfo {
    const openTo = (fieldId: string, roles: string[]) =>
      roles.map((roleId, i) => ({
        ID: `${fieldId}-open-${i}`,
        EntityFieldID: fieldId,
        RoleID: roleId,
        ReadAccess: 'Allow',
        UpdateAccess: 'Allow',
        CreateAccess: 'Allow',
      }));

    return new EntityInfo({
      ID: 'E0000001-0000-0000-0000-000000000001',
      Name: 'Test Widgets',
      Status: 'Active',
      BaseTable: 'TestWidget',
      BaseView: 'vwTestWidgets',
      EnableFieldLevelSecurity: true,
      Permissions: [
        { RoleID: HR_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true, CanDelete: true },
        { RoleID: INTERN_ROLE_ID, CanRead: true, CanUpdate: true, CanCreate: true, CanDelete: true },
      ],
      Fields: [
        { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
        { ID: 'F2', Name: 'Name', DisplayName: 'Widget Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true, EntityFieldPermissions: openTo('F2', [HR_ROLE_ID, INTERN_ROLE_ID]) },
        { ID: 'F3', Name: 'Description', Type: 'nvarchar', Length: 200, AllowsNull: true, AllowUpdateAPI: true, EntityFieldPermissions: openTo('F3', [HR_ROLE_ID]) },
      ],
    });
  }

  function makeSecuredWidget(user: unknown): BaseEntity {
    const entity = new TestWidgetEntity(makeSecuredEntityInfo());
    entity.SetMany({ ID: WIDGET_ID, Name: 'Gadget', Description: 'secret' }, true, true);
    // The ENTITY resolves its own acting user for BaseEntity.Get()'s gate. Set it explicitly so
    // the component's provider and the entity agree — otherwise the component would allow a
    // render that the entity then refuses, which is exactly the crash being guarded against.
    entity.ContextCurrentUser = user as never;
    return entity;
  }

  /** Stands in for the provider's signed-in user. */
  function userWithRoles(roleIds: string[]): unknown {
    return {
      ID: 'C0000000-0000-0000-0000-000000000001',
      Name: 'Test User',
      Email: 'test@example.com',
      IsActive: true,
      UserRoles: roleIds.map((RoleID) => ({ RoleID, Role: `Role-${RoleID}` })),
    };
  }

  function renderAs(fieldName: string, roleIds: string[] | null): ComponentFixture<MjFormFieldComponent> {
    const user = roleIds ? userWithRoles(roleIds) : null;
    // Provider is an @Input, so it is bound BEFORE the first change detection — which matters,
    // because the readability answer is memoized on first read.
    return render({
      Record: makeSecuredWidget(user),
      FieldName: fieldName,
      Type: 'textbox',
      Provider: { CurrentUser: user },
    });
  }

  it('renders nothing at all for a field the user cannot read', () => {
    const f = renderAs('Description', [INTERN_ROLE_ID]);
    expect(query(f, '.mj-forms-field')).toBeNull();
    expect(query(f, '.mj-forms-field-label')).toBeNull();
  });

  it('renders normally for a user who may read the field', () => {
    const f = renderAs('Description', [HR_ROLE_ID]);
    expect(text(f, '.mj-forms-field-value')).toBe('secret');
  });

  it('leaves unrestricted fields on the same entity alone', () => {
    const f = renderAs('Name', [INTERN_ROLE_ID]);
    expect(text(f, '.mj-forms-field-value')).toBe('Gadget');
  });

  it('FAILS OPEN when no user has resolved yet', () => {
    // Asserted on the gate rather than the DOM: with no user on the component's provider the
    // ENTITY still falls back to the global provider to resolve its own acting user, so a
    // render would exercise that fallback rather than this decision. The component's answer is
    // what this test is about — the server is the real boundary, and a form that hid fields
    // because no user had resolved yet would be worse than one that shows them.
    const f = render({ Record: makeSecuredWidget(null), FieldName: 'Description', Type: 'textbox', Provider: { CurrentUser: null } });
    expect(f.componentInstance.IsFieldReadableByUser).toBe(true);
  });

  it('FAILS OPEN on an entity with field security switched off', () => {
    const f = render({ Record: makeWidget(), FieldName: 'Description', Type: 'textbox', Provider: { CurrentUser: userWithRoles([INTERN_ROLE_ID]) } });
    expect(f.componentInstance.IsFieldReadableByUser).toBe(true);
  });

  it('never calls Get() for a denied field — rendering one would throw', () => {
    // The whole point of gating in the template rather than catching downstream: a single
    // denied field must not be able to take out the form it sits in.
    const f = renderAs('Description', [INTERN_ROLE_ID]);
    expect(() => f.detectChanges()).not.toThrow();
  });
});
