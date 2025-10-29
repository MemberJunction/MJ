import { Component, Input, OnInit } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { BaseEntity, CompositeKey, LogError, Metadata, RecordDependency, RunView } from '@memberjunction/core';
import { Router } from '@angular/router';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';
import { ListDetailEntity, ListEntity } from '@memberjunction/core-entities';


@Component({
    selector: 'mj-form-toolbar',
    styleUrl: './form-toolbar.css',
    templateUrl: './form-toolbar.html'
})
export class FormToolbarComponent implements OnInit {
    @Input() ShowSkipChatButton: boolean = true;
    @Input() form!: BaseFormComponent;


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
        this.listDialogVisible = show;

        if(show){
            this.availableLists = [];
            this.availableLists = await this.form.GetListsCanAddTo();
        }
    }

    public async addRecordToList(list: ListEntity): Promise<void> {
        this.toggleListDialog(false);
        
        const md: Metadata = new Metadata();
        
        const listDetailEntity: ListDetailEntity = await md.GetEntityObject<ListDetailEntity>("List Details", md.CurrentUser);
        listDetailEntity.NewRecord();
        listDetailEntity.ListID = list.ID;
        listDetailEntity.RecordID = this.form.record.FirstPrimaryKey.Value;

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
