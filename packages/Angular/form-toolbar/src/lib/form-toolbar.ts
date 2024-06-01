import { Component, Input, OnInit } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { EventCodes, SharedService } from '@memberjunction/ng-shared';
import { BaseEntity, CompositeKey, Metadata, RecordDependency } from '@memberjunction/core';
import { Router } from '@angular/router';
import { MJEvent, MJEventType, MJGlobal } from '@memberjunction/global';


@Component({
    selector: 'mj-form-toolbar',
    styleUrl: './form-toolbar.css',
    templateUrl: './form-toolbar.html'
})
export class FormToolbarComponent implements OnInit {
    @Input() ShowSkipChatButton: boolean = true;
    @Input() form!: BaseFormComponent;

    public showLoader: boolean = false;
    public showCreateDialog: boolean = false;
    public showDeleteDialog: boolean = false;
    public SkipChatVisible: boolean = false;
    public createNewDialogTitle: string = 'Create New Record';
    public newRecord!: BaseEntity;
    public disableToolbar: boolean = false;

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
        this.disableToolbar = true;
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
            // Handle the result if needed
        } finally {
            // Re-enable the toolbar and remove the UX effect
            this.disableToolbar = false;

            formElement.style.pointerEvents = 'auto'; // This re-enables interactions with the form
            formElement.style.opacity = '1'; // This restores the form's opacity

            // Remove the status message element
            formElement.removeChild(statusMessage);

            // Clear the timer
            clearInterval(timer);
        }
    }
    
    

    public ShowSkipChat(): void {
        this.SkipChatVisible = !this.SkipChatVisible;
        SharedService.Instance.InvokeManualResize();
    }
    
    public toggleDeleteDialog(show: boolean): void {
        this.showDeleteDialog = show;
    }
    
    public async deleteRecord(): Promise<void> {
        this.toggleDeleteDialog(false);
        let dependencies: RecordDependency[] = await this.form.GetRecordDependencies();
        if(dependencies.length > 0){
            SharedService.Instance.CreateSimpleNotification(`This record cannot be deleted because it is being used by ${dependencies.length} other records.`, 'error', 2000);
            return;
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
