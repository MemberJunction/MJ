import { Component } from '@angular/core';
import { ItemRatingEntryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadItemRatingEntryDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Item Rating Entries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-itemratingentry-form',
    templateUrl: './itemratingentry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ItemRatingEntryFormComponent extends BaseFormComponent {
    public record!: ItemRatingEntryEntity;
} 

export function LoadItemRatingEntryFormComponent() {
    LoadItemRatingEntryDetailsComponent();
}
