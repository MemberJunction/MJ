import { Component, Input } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';


@Component({
  standalone: false,
    selector: 'mj-form-toolbar',
    styles: [`button { margin-right: 10px; }`],
    template: `
        @if (!this.form.EditMode && this.form.UserCanEdit) {
          <button kendoButton (click)="this.form.StartEditMode()">Edit Record</button>
        }
        @if (this.form.EditMode) {
          <button kendoButton (click)="this.form.SaveRecord(true)">Save Record</button>
        }
        @if (this.form.EditMode) {
          <button kendoButton (click)="this.form.CancelEdit()">Cancel</button>
        }
        @if (this.form.FavoriteInitDone && this.form.IsFavorite) {
          <button kendoButton (click)="this.form.RemoveFavorite()">Remove Favorite</button>
        }
        @if (this.form.FavoriteInitDone && !this.form.IsFavorite) {
          <button kendoButton (click)="this.form.MakeFavorite()">Make Favorite</button>
        }
        @if (this.form.EntityInfo?.TrackRecordChanges) {
          <button kendoButton (click)="this.form.handleHistoryDialog()">History</button>
        }
        <hr />
        @if (this.form.isHistoryDialogOpen) {
          <mj-record-changes [record]="this.form.record" (dialogClosed)="this.form.handleHistoryDialog()"></mj-record-changes>
        }
        `
})
export class FormToolbarComponent {
    @Input() form!: BaseFormComponent;
}
