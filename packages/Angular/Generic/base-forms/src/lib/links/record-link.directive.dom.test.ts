import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseEntity, CompositeKey, EntityInfo, IMetadataProvider, KeyValuePair } from '@memberjunction/core';
import { renderComponentFixture, query } from '@memberjunction/ng-test-utils';
import { MjRecordLinkDirective } from './record-link.directive';
import { MjRecordLinkComponent } from './record-link.component';
import { MjRecordPreviewPopoverService } from '../preview-popover/record-preview-popover.service';
import { FormNavigationEvent } from '../types/navigation-events';

const MOCK_ENTITIES = [
    {
        ID: 'ent-org-id',
        Name: 'MJ_BizApps_Common: Organizations',
        DisplayNameOrName: 'Organizations',
        Icon: 'fa-solid fa-building',
        NameField: { Name: 'Name' },
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [
            { Name: 'ID', IsPrimaryKey: true, IsVirtual: false },
            { Name: 'Name', IsPrimaryKey: false, IsVirtual: false }
        ]
    },
    {
        ID: 'ent-person-id',
        Name: 'MJ_BizApps_Common: People',
        DisplayNameOrName: 'People',
        Icon: 'fa-solid fa-user',
        NameField: { Name: 'DisplayName' },
        FirstPrimaryKey: { Name: 'ID' },
        PrimaryKeys: [{ Name: 'ID' }],
        Fields: [
            { Name: 'ID', IsPrimaryKey: true, IsVirtual: false },
            {
                Name: 'CurrentOrganizationID',
                RelatedEntity: 'MJ_BizApps_Common: Organizations',
                RelatedEntityFieldName: 'ID',
                RelatedEntityNameFieldMap: 'CurrentOrganizationName',
                IsVirtual: false
            },
            { Name: 'CurrentOrganizationName', IsVirtual: true }
        ],
        IsFieldReadableByUser: () => true
    }
] as unknown as EntityInfo[];

const MOCK_PROVIDER = {
    Entities: MOCK_ENTITIES,
    CurrentUser: { ID: 'user-1' },
    GetEntityRecordName: vi.fn().mockResolvedValue('Acme International')
} as unknown as IMetadataProvider;

@Component({
    standalone: false,
    selector: 'test-record-link-host',
    template: `
        <button
            type="button"
            class="field-link-btn"
            [mjRecordLink]="Record"
            FieldName="CurrentOrganizationID"
            [Provider]="Provider"
            (Navigate)="Navigated.emit($event)">
            {{ Record?.Get('CurrentOrganizationName') }}
        </button>

        <button
            type="button"
            class="direct-link-btn"
            mjRecordLink
            [EntityName]="'MJ_BizApps_Common: Organizations'"
            [RecordID]="'org-direct-7'"
            [DisplayName]="'Direct Org'"
            [Provider]="Provider"
            (Navigate)="Navigated.emit($event)">
            Direct Org
        </button>

        <mj-record-link
            class="comp-link"
            [Record]="Record"
            FieldName="CurrentOrganizationID"
            Variant="chip"
            [Provider]="Provider"
            (Navigate)="Navigated.emit($event)">
        </mj-record-link>
    `
})
class TestRecordLinkHostComponent {
    @Input() Record: BaseEntity | null = null;
    @Input() Provider: IMetadataProvider | null = MOCK_PROVIDER;
    @Output() Navigated = new EventEmitter<FormNavigationEvent>();
}

function makeRecord(): BaseEntity {
    const state: Record<string, unknown> = {
        ID: 'person-1',
        CurrentOrganizationID: 'org-555',
        CurrentOrganizationName: 'Acme Corp'
    };
    return {
        EntityInfo: MOCK_ENTITIES[1],
        ProviderToUse: MOCK_PROVIDER,
        Get: (f: string) => state[f],
        Set: (f: string, v: unknown) => {
            state[f] = v;
        }
    } as unknown as BaseEntity;
}

describe('MjRecordLinkDirective & MjRecordLinkComponent (DOM)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('emits FormNavigationEvent on click and Ctrl+Click in both Field-Driven and Direct modes', () => {
        const events: FormNavigationEvent[] = [];
        const record = makeRecord();
        const fixture = renderComponentFixture(TestRecordLinkHostComponent, {
            declarations: [TestRecordLinkHostComponent, MjRecordLinkDirective, MjRecordLinkComponent],
            imports: [CommonModule],
            inputs: { Record: record, Provider: MOCK_PROVIDER },
            setup: c => c.Navigated.subscribe(e => events.push(e))
        });

        const fieldBtn = query(fixture, '.field-link-btn') as HTMLButtonElement;
        expect(fieldBtn.classList.contains('mj-record-link-active')).toBe(true);
        fieldBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

        expect(events).toHaveLength(1);
        expect(events[0]).toEqual({
            Kind: 'record',
            EntityName: 'MJ_BizApps_Common: Organizations',
            PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'org-555')])
        });

        const directBtn = query(fixture, '.direct-link-btn') as HTMLButtonElement;
        directBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));

        expect(events).toHaveLength(2);
        expect(events[1]).toEqual({
            Kind: 'record',
            EntityName: 'MJ_BizApps_Common: Organizations',
            PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'org-direct-7')]),
            OpenInNewTab: true
        });
    });

    it('requests hover preview via MjRecordPreviewPopoverService and propagates Quick Edit updates back to Record', () => {
        const record = makeRecord();
        const previewService = {
            RequestOpen: vi.fn(),
            RequestClose: vi.fn(),
            CloseImmediately: vi.fn()
        };

        const fixture = renderComponentFixture(TestRecordLinkHostComponent, {
            declarations: [TestRecordLinkHostComponent, MjRecordLinkDirective, MjRecordLinkComponent],
            imports: [CommonModule],
            providers: [{ provide: MjRecordPreviewPopoverService, useValue: previewService }],
            inputs: { Record: record, Provider: MOCK_PROVIDER }
        });

        const fieldBtn = query(fixture, '.field-link-btn') as HTMLButtonElement;
        fieldBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

        expect(previewService.RequestOpen).toHaveBeenCalledTimes(1);
        const openReq = previewService.RequestOpen.mock.calls[0][0];
        expect(openReq.EntityName).toBe('MJ_BizApps_Common: Organizations');
        expect(openReq.RecordID).toBe('org-555');
        expect(openReq.DisplayName).toBe('Acme Corp');

        // Simulate inline Quick Edit saving a new Organization name inside the popover
        openReq.OnRecordUpdated({
            EntityName: 'MJ_BizApps_Common: Organizations',
            PrimaryKey: new CompositeKey([new KeyValuePair('ID', 'org-555')]),
            UpdatedFields: { Name: 'Acme Renamed via Quick Edit' }
        });
        fixture.detectChanges();

        expect(record.Get('CurrentOrganizationName')).toBe('Acme Renamed via Quick Edit');
        expect(fieldBtn.textContent?.trim()).toBe('Acme Renamed via Quick Edit');
    });
});
