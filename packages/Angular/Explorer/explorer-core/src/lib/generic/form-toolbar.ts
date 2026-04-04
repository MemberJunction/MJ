import { Component, Input } from '@angular/core';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';


@Component({
  standalone: false,
    selector: 'mj-form-toolbar',
    styles: [`button { margin-right: 10px; }`],
    template: `
        @if (!this.form.EditMode && this.form.UserCanEdit) {
          <button mjButton (click)="this.form.StartEditMode()">Edit Record</button>
        }
        @if (this.form.EditMode) {
          <button mjButton (click)="this.form.SaveRecord(true)">Save Record</button>
        }
        @if (this.form.EditMode) {
          <button mjButton (click)="this.form.CancelEdit()">Cancel</button>
        }
        @if (this.form.FavoriteInitDone && this.form.IsFavorite) {
          <button mjButton (click)="this.form.RemoveFavorite()">Remove Favorite</button>
        }
        @if (this.form.FavoriteInitDone && !this.form.IsFavorite) {
          <button mjButton (click)="this.form.MakeFavorite()">Make Favorite</button>
        }
        @if (this.form.EntityInfo?.TrackRecordChanges) {
          <button mjButton (click)="this.form.handleHistoryDialog()">History</button>
        }
        <button mjButton (click)="this.form.HandleTagsPanel()">
          <i class="fa-solid fa-tags"></i> Tags @if (this.form.TagCount > 0) { ({{ this.form.TagCount }}) }
        </button>
        <hr />
        @if (this.form.isHistoryDialogOpen) {
          <mj-record-changes [record]="this.form.record" (dialogClosed)="this.form.handleHistoryDialog()"></mj-record-changes>
        }
        @if (this.form.IsTagsPanelOpen) {
          <mj-record-tags [Record]="this.form.record" (PanelClosed)="this.form.HandleTagsPanel()"></mj-record-tags>
        }
        `
})
export class FormToolbarComponent {
    @Input() form!: BaseFormComponent;
}
