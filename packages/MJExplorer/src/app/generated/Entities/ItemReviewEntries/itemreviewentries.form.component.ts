import { Component } from '@angular/core';
import { ItemReviewEntriesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadItemReviewEntriesDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Item Review Entries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-itemreviewentries-form',
    templateUrl: './itemreviewentries.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ItemReviewEntriesFormComponent extends BaseFormComponent {
    public record!: ItemReviewEntriesEntity;
} 

export function LoadItemReviewEntriesFormComponent() {
    LoadItemReviewEntriesDetailsComponent();
}
