import { Component, Input } from '@angular/core';
import { BaseFormComponent } from './base-form-component';


@Component({
    selector: 'mj-form-toolbar',
    styles: [
                `button { margin-right: 10px; }`, 
                `.toolbar-container { border-bottom: solid 1px lightgray; padding-bottom: 10px; margin-bottom: 5px; }`
            ],
    template: `
        <div class="toolbar-container">
            <button kendoButton *ngIf="!form.EditMode && form.UserCanEdit" (click)="form.StartEditMode()">Edit Record</button> 
            <button kendoButton *ngIf="form.EditMode" (mouseup)="saveRecord($event)">Save Record</button> 
            <button kendoButton *ngIf="form.EditMode" (click)="form.CancelEdit()">Cancel</button> 
            <button kendoButton *ngIf="form.FavoriteInitDone && form.IsFavorite" (click)="form.RemoveFavorite()">Remove Favorite</button> 
            <button kendoButton *ngIf="form.FavoriteInitDone && !form.IsFavorite" (click)="form.MakeFavorite()">Make Favorite</button> 
            <button kendoButton *ngIf="form.EntityInfo?.TrackRecordChanges" (click)="form.handleHistoryDialog()">History</button> 
            <mj-record-changes *ngIf="form.isHistoryDialogOpen" [record]="form.record" (dialogClosed)="form.handleHistoryDialog()"></mj-record-changes>
        </div>
    `
})
export class FormToolbarComponent {
    @Input() form!: BaseFormComponent;

    public saveRecord(event: MouseEvent): void {
        // Ensure the button takes focus
        const button = event.target as HTMLElement;
        button.focus();
      
        // Proceed to call your save record function
        this.form.SaveRecord(true);
    }
}
