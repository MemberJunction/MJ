import { Component, Input } from '@angular/core';
import { BaseFormComponent } from './base-form-component';


@Component({
    selector: 'mj-form-toolbar',
    styles: [`button { margin-right: 10px; }`],
    template: `
        <button kendoButton *ngIf="!form.EditMode && form.UserCanEdit" (click)="form.StartEditMode()">Edit Record</button> 
        <button kendoButton *ngIf="form.EditMode" (mouseup)="saveRecord($event)">Save Record</button> 
        <button kendoButton *ngIf="form.EditMode" (click)="form.CancelEdit()">Cancel</button> 
        <button kendoButton *ngIf="form.FavoriteInitDone && form.IsFavorite" (click)="form.RemoveFavorite()">Remove Favorite</button> 
        <button kendoButton *ngIf="form.FavoriteInitDone && !form.IsFavorite" (click)="form.MakeFavorite()">Make Favorite</button> 
        <button kendoButton *ngIf="form.EntityInfo?.TrackRecordChanges" (click)="form.handleHistoryDialog()">History</button> 
        <hr />
        <mj-record-changes *ngIf="form.isHistoryDialogOpen" [record]="form.record" (dialogClosed)="form.handleHistoryDialog()"></mj-record-changes>
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
