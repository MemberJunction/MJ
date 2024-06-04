import { Component } from '@angular/core';
import { EntityActionFilterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadEntityActionFilterDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Entity Action Filters') // Tell MemberJunction about this class
@Component({
    selector: 'gen-entityactionfilter-form',
    templateUrl: './entityactionfilter.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class EntityActionFilterFormComponent extends BaseFormComponent {
    public record!: EntityActionFilterEntity;
} 

export function LoadEntityActionFilterFormComponent() {
    LoadEntityActionFilterDetailsComponent();
}
