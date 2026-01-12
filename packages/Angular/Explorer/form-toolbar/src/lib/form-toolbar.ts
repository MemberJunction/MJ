import { Component, Input, OnInit, ContentChild, ElementRef } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { CompositeKey, LogError, Metadata, RecordDependency, BaseEntity, RunView } from '@memberjunction/core';
import { Router } from '@angular/router';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { ListDetailEntity, ListDetailEntityExtended, ListEntity } from '@memberjunction/core-entities';
import { ListManagementDialogConfig, ListManagementResult } from '@memberjunction/ng-list-management';


@Component({
    selector: 'mj-form-toolbar',
    styleUrl: './form-toolbar.css',
    templateUrl: './form-toolbar.html'
})
export class FormToolbarComponent implements OnInit {
    @Input() ShowSkipChatButton: boolean = true;
    @Input() form!: BaseFormComponent;
    @ContentChild('additionalControls', { read: ElementRef }) additionalControls?: ElementRef;

    public get hasAdditionalControls(): boolean {
        return !!this.additionalControls;
    }


    /**
     * This property does not get modified by the toolbar as things change within its state, it is the global setting you can change to disable the toolbar
     */
    public Disabled: boolean = false;

    /**
     * Determines if the toolbar is enabled or disabled.
     */
    public get CurrentlyDisabled(): boolean {
        return this.Disabled && this._currentlyDisabled;
    }

    public listDialogVisible: boolean = false;
    public showListDialogLoader: boolean = false;
    public availableLists: ListEntity[] = [];
    public selectedLists: ListEntity[] = [];

    // Enhanced list management dialog
    public showEnhancedListDialog: boolean = false;
    public listManagementConfig: ListManagementDialogConfig | null = null;
    public useEnhancedListDialog: boolean = true; // Toggle to use enhanced dialog

    // List membership indicator
    public recordListCount: number = 0;
    public recordListsLoading: boolean = false;
    public recordLists: ListEntity[] = [];

    /**
     * Internal property that changes over time based on the state of the record being managed. Don't access this directly, use the CurrentlyDisabled property instead.
     */
    public _currentlyDisabled: boolean = false;

    /**
     * Internal property used to determine if the delete record confirmation dialog is currently displayed or not
     */
    public _deleteDialogVisible: boolean = false;
    /**
     * Internal property used to determine if the skip chat window is currently displayed or not
     */
    public _skipChatDialogVisible: boolean = false;

    public get LinkedEntityPrimaryKey(): CompositeKey {
        return this.form.record.PrimaryKey;
    }

    public constructor(private router: Router) {
    }

    public async ngOnInit(): Promise<void> {
        // Load list membership info for the current record
        await this.loadRecordListCount();
    }

    /**
     * Load the count of lists this record belongs to
     */
    public async loadRecordListCount(): Promise<void> {
        const record = this.form?.record;
        if (!record || !record.IsSaved) {
            this.recordListCount = 0;
            this.recordLists = [];
            return;
        }

        this.recordListsLoading = true;

        try {
            const rv = new RunView();
            // Use the proper RecordID format based on PK count:
            // Single PK: raw value, Composite PK: concatenated format
            const recordId = ListDetailEntityExtended.BuildRecordID(record.EntityInfo, record);
            const entityId = record.EntityInfo.ID;

            // Get list details for this record
            const detailsResult = await rv.RunView<ListDetailEntity>({
                EntityName: 'List Details',
                ExtraFilter: `RecordID = '${recordId}'`,
                ResultType: 'entity_object'
            });

            if (!detailsResult.Success || !detailsResult.Results || detailsResult.Results.length === 0) {
                this.recordListCount = 0;
                this.recordLists = [];
                return;
            }

            const listIds = [...new Set(detailsResult.Results.map((d: ListDetailEntity) => d.ListID))];

            // Get the lists filtered by entity
            const listIdFilter = listIds.map(id => `'${id}'`).join(',');
            const listsResult = await rv.RunView<ListEntity>({
                EntityName: 'Lists',
                ExtraFilter: `ID IN (${listIdFilter}) AND EntityID = '${entityId}'`,
                ResultType: 'entity_object'
            });

            if (listsResult.Success && listsResult.Results) {
                this.recordLists = listsResult.Results;
                this.recordListCount = listsResult.Results.length;
            } else {
                this.recordListCount = 0;
                this.recordLists = [];
            }
        } catch (error) {
            console.error('Error loading record list count:', error);
            this.recordListCount = 0;
            this.recordLists = [];
        } finally {
            this.recordListsLoading = false;
        }
    }
 
    public async saveExistingRecord(event: MouseEvent) {
        // Ensure the button takes focus
        const button = event.target as HTMLElement;
        button.focus();

        // while we are saving the record we are editing, we need to apply a UX effect on our peer elements in the browser to ensure they are 
        // not further edited and also disable all of the other stuff on this toolbar. So get the HTML reference to the toolbar, and disable it
        // then get the HTML reference to the parent of the toolbar and opacity it out.
        // Then create an HTML element that is centered horizaontall across the parent and is below the toolbar and show a status message of "Saving..." in it

        // Disable the toolbar and apply the UX effect to the form parent
        this._currentlyDisabled = true;
        const toolbar = button.closest('.toolbar-container') as HTMLElement;
        const formElement = toolbar.closest('form') as HTMLElement;

        // Apply inline styles to disable interactions and set opacity
        formElement.style.pointerEvents = 'none'; // This prevents interactions with the form
        formElement.style.opacity = '0.75'; // This makes the form opaque

        // Create and show the status message element
        const statusMessage = document.createElement('div');
        statusMessage.className = 'form-toolbar-status-message';
        formElement.appendChild(statusMessage);

        statusMessage.style.position = 'absolute';
        statusMessage.style.top = `${100}px`;

        // Timer variables
        let elapsedTime = 0;
        let serverUpdateMessage: string = "";
        const timer = setInterval(() => {
            elapsedTime += .1;
            statusMessage.innerHTML = `<div>Saving...<span class="form-toolbar-elapsed-time">(${Math.floor(elapsedTime)} sec${elapsedTime === 0 || elapsedTime > 1 ? 's' : ''})</span></div>` + (serverUpdateMessage ? `<div class="form-toolbar-server-update-message">${serverUpdateMessage}</div>` : '');
        }, 100);

        try {
            // listen for status updates from MJGlobal that come from the server
            MJGlobal.Instance.GetEventListener(false).subscribe((event: MJEvent) => {
                if (event.eventCode === EventCodes.PushStatusUpdates) {
                    serverUpdateMessage = event.args?.message;
                    console.log(event);
                }
            });

            // Save the record
            const result = await this.form.SaveRecord(true);
            if (!result) {
                const msg = this.form.record.LatestResult?.CompleteMessage ? ': ' + this.form.record.LatestResult.CompleteMessage : '';
                SharedService.Instance.CreateSimpleNotification(`Error saving record${msg}`, 'error', 3000);
            }
        } finally {
            // Re-enable the toolbar and remove the UX effect
            this._currentlyDisabled = false;

            formElement.style.pointerEvents = 'auto'; // This re-enables interactions with the form
            formElement.style.opacity = '1'; // This restores the form's opacity

            // Remove the status message element
            formElement.removeChild(statusMessage);

            // Clear the timer
            clearInterval(timer);
        }
    }
    
    
    /**
     * This method is called internally when the user clicks on the Skip button, and also can be invoked manually in code to show the Skip dialog.
     */
    public ShowSkipChat(): void {
        this._skipChatDialogVisible = !this._skipChatDialogVisible;
        SharedService.Instance.InvokeManualResize();
    }
    
    public toggleDeleteDialog(show: boolean): void {
        this._deleteDialogVisible = show;
    }

    public async toggleListDialog(show: boolean): Promise<void> {
        if (this.useEnhancedListDialog && show) {
            // Use the enhanced list management dialog
            this.openEnhancedListDialog();
            return;
        }

        // Fallback to original simple dialog
        this.listDialogVisible = show;

        if(show){
            this.availableLists = [];
            this.availableLists = await this.form.GetListsCanAddTo();
        }
    }

    /**
     * Opens the enhanced list management dialog
     */
    public openEnhancedListDialog(): void {
        const record = this.form.record;
        if (!record) return;

        // Use the proper RecordID format based on PK count:
        // Single PK: raw value, Composite PK: concatenated format
        const entityInfo = record.EntityInfo;
        const recordId = ListDetailEntityExtended.BuildRecordID(entityInfo, record);
        const recordName = this.getRecordDisplayName(record);

        this.listManagementConfig = {
            mode: 'manage',
            entityId: entityInfo.ID,
            entityName: entityInfo.Name,
            recordIds: [recordId],
            recordDisplayNames: [recordName],
            allowCreate: true,
            allowRemove: true,
            showMembership: true,
            dialogTitle: `Manage Lists for "${recordName}"`
        };

        this.showEnhancedListDialog = true;
    }

    /**
     * Get a display name for a record
     */
    private getRecordDisplayName(record: BaseEntity): string {
        const entityInfo = record.EntityInfo;
        if (entityInfo?.NameField) {
            const name = record.Get(entityInfo.NameField.Name);
            if (name) return String(name);
        }
        return record.PrimaryKey.ToConcatenatedString();
    }

    /**
     * Handle completion of the enhanced list management dialog
     */
    public async onEnhancedListDialogComplete(result: ListManagementResult): Promise<void> {
        this.showEnhancedListDialog = false;
        this.listManagementConfig = null;

        if (result.action === 'apply') {
            const addedCount = result.added.length;
            const removedCount = result.removed.length;

            if (addedCount > 0 || removedCount > 0) {
                let message = '';
                if (addedCount > 0) {
                    message += `Added to ${addedCount} list(s)`;
                }
                if (removedCount > 0) {
                    if (message) message += ', ';
                    message += `Removed from ${removedCount} list(s)`;
                }
                SharedService.Instance.CreateSimpleNotification(message, 'success', 2500);

                // Refresh the list count
                await this.loadRecordListCount();
            }
        }
    }

    /**
     * Handle cancellation of the enhanced list management dialog
     */
    public onEnhancedListDialogCancel(): void {
        this.showEnhancedListDialog = false;
        this.listManagementConfig = null;
    }

    public async addRecordToList(list: ListEntity): Promise<void> {
        this.toggleListDialog(false);

        const md: Metadata = new Metadata();

        const listDetailEntity = await md.GetEntityObject<ListDetailEntityExtended>("List Details", md.CurrentUser);
        listDetailEntity.NewRecord();
        listDetailEntity.ListID = list.ID;
        // Use SetRecordIDFromEntity which handles single vs composite PK properly
        listDetailEntity.SetRecordIDFromEntity(this.form.record.EntityInfo, this.form.record);

        const saveResult: boolean = await listDetailEntity.Save();
        if(!saveResult){
            LogError(`Error adding record to list ${list.Name}`, undefined, listDetailEntity.LatestResult);
        }

        if(saveResult){
            SharedService.Instance.CreateSimpleNotification("Record added to list successfully", "success", 2500);
        }
        else{
            SharedService.Instance.CreateSimpleNotification(`Failed to add record to list`, "error", 2500);
        }
    }
    
    public async deleteRecord(): Promise<void> {
        this.toggleDeleteDialog(false);
        
        // Check if the entity has cascade deletes enabled
        const entityInfo = this.form.record?.EntityInfo;
        const hasCascadeDeletes = entityInfo?.CascadeDeletes === true;
        
        // Only check dependencies if cascade deletes are NOT enabled
        if (!hasCascadeDeletes) {
            let dependencies: RecordDependency[] = await this.form.GetRecordDependencies();
            if(dependencies.length > 0){
                SharedService.Instance.CreateSimpleNotification(`This record cannot be deleted because it is being used by ${dependencies.length} other records.`, 'error', 2000);
                return;
            }
        }

        const deleteResult: boolean = await this.form.record.Delete();
        if (deleteResult) {
            SharedService.Instance.CreateSimpleNotification('Record deleted succesfully', 'success', 2000);
            let event: any = {
                event: MJEventType.ComponentEvent, 
                eventCode: EventCodes.CloseCurrentTab,
                component: null,
                args: null
            };

            MJGlobal.Instance.RaiseEvent(event);
        }
        else {
            SharedService.Instance.CreateSimpleNotification('Error deleting record', 'error', 2000);
        }
    }
}
