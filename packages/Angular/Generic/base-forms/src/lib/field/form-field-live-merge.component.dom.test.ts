import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output, Pipe, PipeTransform } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseEntity, EntityInfo } from '@memberjunction/core';
import { renderComponentFixture, query, text, capture, hasClass } from '@memberjunction/ng-test-utils';
import { MjFormFieldComponent } from './form-field.component';
import { FormFieldEditCoordinator } from '../form-field-edit.coordinator';
import { FormRecordRefreshCoordinator, type FormFieldConflict } from '../form-record-refresh.coordinator';

@Component({ standalone: true, selector: 'mj-markdown', template: '<span>{{ data }}</span>' })
class StubMarkdownComponent {
    @Input() data = '';
}

@Component({ standalone: true, selector: 'mj-code-editor', template: '<span>{{ value }}</span>' })
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

class TestAccountEntity extends BaseEntity {}

function makeAccountEntityInfo(): EntityInfo {
    return new EntityInfo({
        ID: 'E0000001-0000-0000-0000-000000000099',
        Name: 'Accounts',
        Status: 'Active',
        BaseTable: 'Account',
        BaseView: 'vwAccounts',
        Fields: [
            { ID: 'F1', Name: 'ID', Type: 'uniqueidentifier', AllowsNull: false, IsPrimaryKey: true, AllowUpdateAPI: false },
            { ID: 'F2', Name: 'Name', DisplayName: 'Account Name', Type: 'nvarchar', Length: 200, AllowsNull: false, AllowUpdateAPI: true },
            { ID: 'F3', Name: 'Industry', DisplayName: 'Industry', Type: 'nvarchar', Length: 100, AllowsNull: true, AllowUpdateAPI: true },
            { ID: 'F4', Name: 'AnnualRevenue', DisplayName: 'Annual Revenue', Type: 'decimal', AllowsNull: true, AllowUpdateAPI: true }
        ]
    });
}

function makeAccount(values: Record<string, unknown> = {}): BaseEntity {
    const entity = new TestAccountEntity(makeAccountEntityInfo());
    entity.SetMany(
        {
            ID: '11111111-2222-3333-4444-555555555555',
            Name: 'Acme Corp',
            Industry: 'Manufacturing',
            AnnualRevenue: 500000,
            ...values
        },
        true,
        true
    );
    return entity;
}

describe('MjFormFieldComponent — Original-Value Popover, Live Auto-Merge & Conflict Resolution', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('shows the quiet history icon on a dirty field in EditMode and restores the original value when Restore is clicked', () => {
        const record = makeAccount();
        const editCoordinator = new FormFieldEditCoordinator();
        const refreshCoordinator = new FormRecordRefreshCoordinator();

        const fixture = renderComponentFixture(MjFormFieldComponent, {
            declarations: [MjFormFieldComponent],
            imports: [CommonModule, StubMarkdownComponent, StubCodeEditorComponent, StubSafeRichHtmlPipe],
            providers: [
                { provide: FormFieldEditCoordinator, useValue: editCoordinator },
                { provide: FormRecordRefreshCoordinator, useValue: refreshCoordinator }
            ],
            inputs: {
                Record: record,
                FieldName: 'Name',
                Type: 'textbox',
                EditMode: true
            }
        });

        const comp = fixture.componentInstance;
        expect(comp.IsFieldDirty).toBe(false);
        expect(query(fixture, '.mj-forms-field__history-trigger')).toBeNull();

        // Modify the field locally
        comp.Value = 'Acme Global Holdings';
        fixture.detectChanges();

        expect(comp.IsFieldDirty).toBe(true);
        expect(comp.FormattedOriginalValue).toBe('Acme Corp');

        const trigger = query(fixture, '.mj-forms-field__history-trigger') as HTMLButtonElement;
        expect(trigger).not.toBeNull();

        // Click trigger to open popover
        trigger.click();
        fixture.detectChanges();

        const popover = query(fixture, '.mj-forms-field__history-popover');
        expect(popover).not.toBeNull();
        expect(text(fixture, '.mj-forms-field__history-popover-header')).toBe('Original value');
        expect(text(fixture, '.mj-forms-field__history-popover-value')).toBe('Acme Corp');

        // Click Restore
        const edits = capture(editCoordinator.Edited$);
        const restoreBtn = query(fixture, '.mj-forms-field__restore-btn') as HTMLButtonElement;
        restoreBtn.click();
        fixture.detectChanges();

        expect(record.Get('Name')).toBe('Acme Corp');
        expect(comp.IsFieldDirty).toBe(false);
        expect(comp.ShowOriginalValuePopover).toBe(false);
        expect(edits).toEqual([{ FieldName: 'Name' }]);
    });

    it('renders the auto-merged badge ("Updated live" + "Previously: ...") when a clean field is auto-merged during EditMode', () => {
        const record = makeAccount();
        const refreshCoordinator = new FormRecordRefreshCoordinator();

        const fixture = renderComponentFixture(MjFormFieldComponent, {
            declarations: [MjFormFieldComponent],
            imports: [CommonModule, StubMarkdownComponent, StubCodeEditorComponent, StubSafeRichHtmlPipe],
            providers: [{ provide: FormRecordRefreshCoordinator, useValue: refreshCoordinator }],
            inputs: {
                Record: record,
                FieldName: 'Industry',
                Type: 'textbox',
                EditMode: true
            }
        });

        // Simulate clean auto-merge on Industry
        const field = record.Fields.find(f => f.Name === 'Industry')!;
        field.Value = 'Aerospace';
        field.ResetOldValue();

        refreshCoordinator.NotifyRemoteUpdate(
            record,
            new Set(['industry']),
            new Map([['industry', 'Manufacturing']])
        );
        fixture.detectChanges();

        const badge = query(fixture, '.mj-forms-field__auto-merged-badge');
        expect(badge).not.toBeNull();
        expect(badge?.textContent).toContain('Updated live');
        expect(badge?.textContent).toContain('Previously: Manufacturing');
        expect(fixture.componentInstance.IsRemotelyUpdated).toBe(true);
    });

    it('renders inline conflict resolution card and supports "Keep mine" (AcceptLocalConflictValue)', () => {
        const record = makeAccount();
        const refreshCoordinator = new FormRecordRefreshCoordinator();

        const fixture = renderComponentFixture(MjFormFieldComponent, {
            declarations: [MjFormFieldComponent],
            imports: [CommonModule, StubMarkdownComponent, StubCodeEditorComponent, StubSafeRichHtmlPipe],
            providers: [{ provide: FormRecordRefreshCoordinator, useValue: refreshCoordinator }],
            inputs: {
                Record: record,
                FieldName: 'Name',
                Type: 'textbox',
                EditMode: true
            }
        });

        // User edits Name locally to "Acme Local Edit"
        record.Set('Name', 'Acme Local Edit');

        const conflict: FormFieldConflict = {
            fieldName: 'Name',
            previousServerValue: 'Acme Corp',
            incomingServerValue: 'Acme Server Update',
            localEditedValue: 'Acme Local Edit'
        };

        refreshCoordinator.NotifyRemoteUpdate(
            record,
            new Set(['name']),
            undefined,
            new Map([['name', conflict]])
        );
        fixture.detectChanges();

        expect(hasClass(fixture, '.mj-forms-field', 'mj-forms-field--conflict')).toBe(true);
        const card = query(fixture, '.mj-forms-field__conflict-card');
        expect(card).not.toBeNull();
        expect(card?.textContent).toContain('Updated in another session while you were editing');
        expect(card?.textContent).toContain('Acme Local Edit');
        expect(card?.textContent).toContain('Acme Server Update');

        // Click "Keep mine"
        const keepBtn = query(fixture, '.mj-forms-field__conflict-btn--keep') as HTMLButtonElement;
        keepBtn.click();
        fixture.detectChanges();

        expect(fixture.componentInstance.ActiveConflict).toBeNull();
        expect(refreshCoordinator.ActiveConflicts.size).toBe(0);
        expect(record.Get('Name')).toBe('Acme Local Edit');
        const nameField = record.Fields.find(f => f.Name === 'Name')!;
        expect(nameField.OldValue).toBe('Acme Server Update');
        expect(nameField.Dirty).toBe(true);
    });

    it('supports "Use new value" (AcceptRemoteConflictValue) to adopt incoming server value and clear dirty state', () => {
        const record = makeAccount();
        const editCoordinator = new FormFieldEditCoordinator();
        const refreshCoordinator = new FormRecordRefreshCoordinator();

        const fixture = renderComponentFixture(MjFormFieldComponent, {
            declarations: [MjFormFieldComponent],
            imports: [CommonModule, StubMarkdownComponent, StubCodeEditorComponent, StubSafeRichHtmlPipe],
            providers: [
                { provide: FormFieldEditCoordinator, useValue: editCoordinator },
                { provide: FormRecordRefreshCoordinator, useValue: refreshCoordinator }
            ],
            inputs: {
                Record: record,
                FieldName: 'Name',
                Type: 'textbox',
                EditMode: true
            }
        });

        record.Set('Name', 'Acme Local Edit');

        const conflict: FormFieldConflict = {
            fieldName: 'Name',
            previousServerValue: 'Acme Corp',
            incomingServerValue: 'Acme Server Update',
            localEditedValue: 'Acme Local Edit'
        };

        refreshCoordinator.NotifyRemoteUpdate(
            record,
            new Set(['name']),
            undefined,
            new Map([['name', conflict]])
        );
        fixture.detectChanges();

        const edits = capture(editCoordinator.Edited$);
        const useRemoteBtn = query(fixture, '.mj-forms-field__conflict-btn--use-remote') as HTMLButtonElement;
        useRemoteBtn.click();
        fixture.detectChanges();

        expect(fixture.componentInstance.ActiveConflict).toBeNull();
        expect(refreshCoordinator.ActiveConflicts.size).toBe(0);
        expect(record.Get('Name')).toBe('Acme Server Update');
        const nameField = record.Fields.find(f => f.Name === 'Name')!;
        expect(nameField.OldValue).toBe('Acme Server Update');
        expect(nameField.Dirty).toBe(false);
        expect(edits).toEqual([{ FieldName: 'Name' }]);
    });
});
