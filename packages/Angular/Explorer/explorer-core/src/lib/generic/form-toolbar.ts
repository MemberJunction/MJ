import { Component, Input } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';


@Component({
  standalone: false,
    selector: 'mj-form-toolbar',
    styles: [`button { margin-right: 10px; }`],
    template: `
        <button kendoButton *ngIf="!this.form.EditMode && this.form.UserCanEdit" (click)="this.form.StartEditMode()">Edit Record</button> 
        <button kendoButton *ngIf="this.form.EditMode" (click)="this.form.SaveRecord(true)">Save Record</button> 
        <button kendoButton *ngIf="this.form.EditMode" (click)="this.form.CancelEdit()">Cancel</button> 
        <button kendoButton *ngIf="this.form.FavoriteInitDone && this.form.IsFavorite" (click)="this.form.RemoveFavorite()">Remove Favorite</button> 
        <button kendoButton *ngIf="this.form.FavoriteInitDone && !this.form.IsFavorite" (click)="this.form.MakeFavorite()">Make Favorite</button> 
        <button kendoButton *ngIf="this.form.EntityInfo?.TrackRecordChanges" (click)="this.form.handleHistoryDialog()">History</button> 
        <hr />
        <mj-record-changes *ngIf="this.form.isHistoryDialogOpen" [record]="this.form.record" (dialogClosed)="this.form.handleHistoryDialog()"></mj-record-changes>
    `
})
export class FormToolbarComponent {
    @Input() form!: BaseFormComponent;
}
