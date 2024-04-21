import { Component, Input } from '@angular/core';
import { BaseFormComponent } from './base-form-component';
import { ChatMessage } from '@memberjunction/ng-chat';
import { SharedService } from '@memberjunction/ng-shared';


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
                @if (form.UserCanEdit) {
                    <button kendoButton (click)="form.StartEditMode()" title="Edit Record">
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
                <button kendoButton (mouseup)="saveRecord($event)" title="Save Record">
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
            @if (SkipChatVisible) {
                <mj-chat (MessageAdded)="NewChatMessage($event)"></mj-chat>
            }
            @if (form.isHistoryDialogOpen) {
                <mj-record-changes [record]="form.record" (dialogClosed)="form.handleHistoryDialog()"></mj-record-changes>
            }
        </div>
    `
})
export class FormToolbarComponent {
    @Input() ShowSkipChatButton: boolean = true;
    @Input() form!: BaseFormComponent;

    public saveRecord(event: MouseEvent): void {
        // Ensure the button takes focus
        const button = event.target as HTMLElement;
        button.focus();
      
        // Proceed to call your save record function
        this.form.SaveRecord(true);
    }

    public SkipChatVisible: boolean = false;
    public ShowSkipChat(): void {
        this.SkipChatVisible = !this.SkipChatVisible;
        SharedService.Instance.InvokeManualResize();
    }   

    public NewChatMessage(message: ChatMessage): void {
        // send messages to Skip from here
    }
}
