import { Component, Input, OnInit } from '@angular/core';
import { BaseFormComponent } from './base-form-component';
import { SharedService } from '@memberjunction/ng-shared';
import { BaseEntity, CompositeKey, Metadata, RecordDependency } from '@memberjunction/core';
import { Router } from '@angular/router';


@Component({
    selector: 'mj-form-toolbar',
    styles: [
                `button { margin-right: 10px; }`, 
                `.button-text { margin-left: 7px; }`, 
                `.toolbar-container { border-bottom: solid 1px lightgray; padding-bottom: 10px; margin-bottom: 5px; }`
            ],
    template: `
        <div class="toolbar-container">
            @if (!form.EditMode) {
                @if(form.UserCanCreate){
                    <button kendoButton (click)="toggleCreateDialog(true)" title="Create New Record">
                        <span class="fa-solid fa-plus"></span>
                        <span class="button-text">Create</span>
                    </button> 
                }
                @if(form.UserCanDelete){
                    <button kendoButton (click)="toggleDeleteDialog(true)" title="Delete this Record">
                        <span class="fa-regular fa-trash-can"></span>
                        <span class="button-text">Delete</span>
                    </button> 
                }
                @if (form.UserCanEdit) {
                    <button kendoButton (click)="form.StartEditMode()" title="Edit this Record">
                        <span class="fa-solid fa-pen-to-square"></span>
                        <span class="button-text">Edit</span>
                    </button> 
                }
                @if (form.FavoriteInitDone) {
                    @if (form.IsFavorite) {
                        <button kendoButton (click)="form.RemoveFavorite()" title="Remove Favorite">
                            <span class="fa-solid fa-star"></span>
                        </button> 
                    }
                    @else {
                        <button kendoButton (click)="form.MakeFavorite()" title="Make Favorite">
                            <span class="fa-regular fa-star"></span>
                        </button> 
                    }
                }
            }
            @else {
                <button kendoButton (mouseup)="saveExistingRecord($event)" title="Save Record">
                    <span class="fa-solid fa-floppy-disk"></span>
                    <span class="button-text">Save</span>
                </button> 
                <button kendoButton (click)="form.CancelEdit()" title="Cancel Edit">
                    <span class="fa-solid fa-rotate-left"></span>
                    <span class="button-text">Cancel</span>
                </button> 
                @if (form.record.Dirty) {
                    <button kendoButton (click)="form.ShowChanges()" title="Fields you have changed">
                        <span class="fa-solid fa-clipboard-list"></span>
                        <span class="button-text">Changes</span>
                    </button> 
                }
            }
            @if (form.EntityInfo?.TrackRecordChanges) {
                <button kendoButton (click)="form.handleHistoryDialog()" title="Show History">
                    <span class="fa-solid fa-business-time"></span>
                    <span class="button-text">History</span>
                </button> 
            }
            @if (ShowSkipChatButton) {
                <button kendoButton (click)="ShowSkipChat()" title="Discuss this record with Skip">
                    <span class="fa-regular fa-comment-dots"></span>
                </button> 
            }
            @if (form.EntityInfo) {
                <mj-skip-chat-with-record-window
                    [LinkedEntityID]="form.EntityInfo.ID"
                    [LinkedEntityCompositeKey]="LinkedEntityCompositeKey"            
                    #mjChat
                    [WindowOpened]="SkipChatVisible" 
                    (WindowClosed)="ShowSkipChat()"
                >
                </mj-skip-chat-with-record-window>
            }
            @if (form.isHistoryDialogOpen) {
                <mj-record-changes [record]="form.record" (dialogClosed)="form.handleHistoryDialog()"></mj-record-changes>
            }
            <kendo-dialog 
            [minWidth]="450"
            [width]="650"
            class="dialog-wrapper" 
            title="Confirm" 
            *ngIf="showDeleteDialog" 
            (close)="toggleDeleteDialog(false)">
              <p class="k-m-7.5 k-text-center">
                Are you sure you want to delete this record?
              </p>
              <kendo-dialog-actions class="popup-actions-btn">
                <button class="cancel-btn" (click)="deleteRecord()" kendoButton themeColor="info">
                  Yes, Delete
                </button>
                <button class="yes-btn" (click)="toggleDeleteDialog(false)" kendoButton fillMode="outline" themeColor="info">
                  No, Cancel
                </button>
              </kendo-dialog-actions>
            </kendo-dialog>
            <kendo-dialog
            [minWidth]="750"
            [minHeight]="500"
            [maxHeight]= 800
            class="dialog-wrapper" 
            [title]="createNewDialogTitle" 
            *ngIf="showCreateDialog" 
            (close)="toggleCreateDialog(false)"
            >
                @if(showLoader){
                    <kendo-loader *ngIf="showLoader" type="converging-spinner"></kendo-loader>
                }
                @else{
                    <mj-form-section [Entity]="form.record.EntityInfo.Name" Section="details" [record]="newRecord" [EditMode]="true"></mj-form-section>
                }
                <kendo-dialog-actions class="popup-actions-btn">
                    <button class="cancel-btn" (click)="saveNewRecord()" kendoButton themeColor="info">
                        Create
                    </button>
                    <button class="yes-btn" (click)="toggleCreateDialog(false)" kendoButton fillMode="outline" themeColor="info">
                        Cancel
                    </button>
                </kendo-dialog-actions>
            </kendo-dialog>
        </div>
    `
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

    public get LinkedEntityCompositeKey(): CompositeKey {
        return this.form.record.CompositeKey;
    }

    public constructor(private router: Router) {
    }

    public async ngOnInit(): Promise<void> {
        if(this.form && this.form.record){
            this.createNewDialogTitle = `Create New ${this.form.record.EntityInfo.Name} Record`;
            await this.createNewRecord();
        }
    }

    public saveExistingRecord(event: MouseEvent): void {
        // Ensure the button takes focus
        const button = event.target as HTMLElement;
        button.focus();
      
        // Proceed to call your save record function
        this.form.SaveRecord(true);
    }

    public ShowSkipChat(): void {
        this.SkipChatVisible = !this.SkipChatVisible;
        SharedService.Instance.InvokeManualResize();
    }

    public toggleCreateDialog(show: boolean): void {
        this.showCreateDialog = show;
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

        console.log(this.form.record.CompositeKey);
        const deleteResult: boolean = await this.form.record.Delete();
        if (deleteResult) {
            SharedService.Instance.CreateSimpleNotification('Record deleted succesfully', 'success', 2000);
            this.router.navigate(['/']);
        }
        else {
            SharedService.Instance.CreateSimpleNotification('Error deleting record', 'error', 2000);
        }
    }

    public async createNewRecord(): Promise<void> {
        const md: Metadata = new Metadata();
        this.newRecord = await md.GetEntityObject(this.form.record.EntityInfo.Name);
        this.newRecord.NewRecord();
    }
    
    public async saveNewRecord(): Promise<void> {
        console.log('Create new record button pressed');
        this.showLoader = true;
        let saveResult: boolean = await this.newRecord.Save();
        if(saveResult){
            this.toggleCreateDialog(false);
            SharedService.Instance.CreateSimpleNotification(`Successfully created new ${this.form.record.EntityInfo.Name} record`, 'success', 1000);
            this.router.navigate(['resource', 'record', this.newRecord.CompositeKey.ToURLSegment()], { queryParams: { Entity: this.newRecord.EntityInfo.Name } });
        }
        else{
            SharedService.Instance.CreateSimpleNotification(`Failed to create new ${this.form.record.EntityInfo.Name} record`, 'error', 1000);
        }
        this.showLoader = false;
    }
}
