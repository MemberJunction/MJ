/**
 * @fileoverview Dynamic form panel extension providing cloning integration for entity edit forms.
 *
 * Implements §12.2 of the Record Cloning architectural blueprint. Registers with the
 * wildcard entity ('*') in the 'after-everything' slot. Inspects entity cloning capability
 * via RecordCloneService and, if cloneable, injects a standard "Clone" button into the
 * parent FormComponent toolbar. Orchestrates the slide-in RecordClonePanelComponent.
 */

import {
    Component,
    ChangeDetectionStrategy,
    OnInit,
    OnDestroy,
    ChangeDetectorRef,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RegisterClassEx, MJGlobal, MJEventType } from '@memberjunction/global';
import { BaseEntity, CompositeKey } from '@memberjunction/core';
import { RecordNavigationAdapter } from '@memberjunction/ng-base-types';
import { BaseFormPanel } from '@memberjunction/ng-base-forms';
import type { FormToolbarItemConfig } from '@memberjunction/ng-base-forms';
import { RecordCloneService } from './record-clone.service';
import { RecordClonePanelComponent } from './record-clone-panel.component';
import {
    type CloneCompletedEvent,
    type FormNavigationEvent,
    EntityToRecordCloneKey,
} from './record-clone-types';

@RegisterClassEx(BaseFormPanel, {
    key: 'record-clone:toolbar-panel',
    skipNullKeyWarning: true,
    metadata: {
        entity: '*',
        slot: 'after-everything',
        sortKey: 10,
    },
})
@Component({
    standalone: true,
    selector: 'mj-record-clone-toolbar-panel',
    template: `
        <mj-record-clone-panel
            [IsOpen]="IsPanelOpen"
            [Record]="Record"
            (IsOpenChange)="OnPanelOpenChange($event)"
            (CloseRequested)="OnClosePanel()"
            (CloneCompleted)="OnCloneCompleted($event)"
            (NavigateToRecord)="OnNavigateToRecord($event)">
        </mj-record-clone-panel>
    `,
    styles: [`
        :host {
            display: contents;
        }
    `],
    imports: [
        CommonModule,
        RecordClonePanelComponent,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecordCloneToolbarPanel extends BaseFormPanel implements OnInit, OnDestroy {
    private cloneService = inject(RecordCloneService);
    private cdr = inject(ChangeDetectorRef);

    public IsPanelOpen = false;
    public CanClone = false;
    public CheckClonePromise?: Promise<void>;
    private readonly TOOLBAR_ITEM_KEY = 'record-clone';

    public ngOnInit(): void {
        if (!this.Record) {
            return;
        }

        this.CheckClonePromise = this.CheckCloneCapability();
    }

    public ngOnDestroy(): void {
        this.UnregisterToolbarItem(this.TOOLBAR_ITEM_KEY);
    }

    public async CheckCloneCapability(): Promise<void> {
        if (!this.Record?.EntityInfo?.Name) {
            return;
        }

        try {
            const describe = await this.cloneService.DescribeRecord({
                EntityName: this.Record.EntityInfo.Name,
                Key: EntityToRecordCloneKey(this.Record),
            });

            this.CanClone = describe.CanClone;

            if (this.CanClone) {
                this.RegisterCloneToolbarButton();
            }
        } catch {
            this.CanClone = false;
        } finally {
            this.cdr.markForCheck();
        }
    }

    public RegisterCloneToolbarButton(): void {
        const item: FormToolbarItemConfig = {
            Key: this.TOOLBAR_ITEM_KEY,
            Text: 'Clone',
            Icon: 'fa-solid fa-clone',
            Description: `Clone this ${this.Record?.EntityInfo?.Name || 'record'} and related dependencies`,
            Mode: 'read',
            Placement: 'actions',
            Order: 15, // Sits between Edit (10) and Delete (20)
            Visible: (record: BaseEntity, editMode: boolean) => {
                // Must be a saved record (not newly created / unsaved) and cloneable
                return !editMode && !!record?.IsSaved && this.CanClone;
            },
            OnClick: () => {
                this.OpenPanel();
            },
        };

        this.RegisterToolbarItem(item);
    }

    public OpenPanel(): void {
        this.IsPanelOpen = true;
        this.cdr.markForCheck();
    }

    public OnClosePanel(): void {
        this.IsPanelOpen = false;
        this.cdr.markForCheck();
    }

    public OnPanelOpenChange(isOpen: boolean): void {
        this.IsPanelOpen = isOpen;
        this.cdr.markForCheck();
    }

    public OnCloneCompleted(event: CloneCompletedEvent): void {
        MJGlobal.Instance.RaiseEvent({
            component: this,
            event: MJEventType.ComponentEvent,
            eventCode: BaseEntity.BaseEventCode,
            args: {
                type: 'save',
                saveSubType: 'create',
                entityName: event.EntityName,
                payload: {
                    RecordKey: event.TargetKey,
                    CloneLogID: event.CloneLogID,
                },
            },
        });
    }

    public OnNavigateToRecord(event: FormNavigationEvent): void {
        if (!event || !event.RecordKey) return;

        const entInfo = this.FormComponent?.ProviderToUse?.EntityByName(event.EntityName);
        const compKey = CompositeKey.FromURLSegment(entInfo, event.RecordKey);

        if (this.FormComponent) {
            this.FormComponent.OnFormNavigate({
                Kind: 'record',
                EntityName: event.EntityName,
                PrimaryKey: compKey,
                OpenInNewTab: true,
            });
        } else if (RecordNavigationAdapter.IsRegistered) {
            RecordNavigationAdapter.OpenEntityRecord(event.EntityName, compKey);
        }
    }
}
