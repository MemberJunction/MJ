import { Component } from '@angular/core';
import { ListCategoryEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadListCategoryDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'List Categories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-listcategory-form',
    templateUrl: './listcategory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ListCategoryFormComponent extends BaseFormComponent {
    public record!: ListCategoryEntity;
} 

export function LoadListCategoryFormComponent() {
    LoadListCategoryDetailsComponent();
}
