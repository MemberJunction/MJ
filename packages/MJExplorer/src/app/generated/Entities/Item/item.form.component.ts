import { Component } from '@angular/core';
import { ItemEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadItemDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Items') // Tell MemberJunction about this class
@Component({
    selector: 'gen-item-form',
    templateUrl: './item.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ItemFormComponent extends BaseFormComponent {
    public record!: ItemEntity;
} 

export function LoadItemFormComponent() {
    LoadItemDetailsComponent();
}
