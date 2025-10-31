import { Component } from '@angular/core';
import { ListTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadListTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'List Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-listtype-form',
    templateUrl: './listtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ListTypeFormComponent extends BaseFormComponent {
    public record!: ListTypeEntity;
} 

export function LoadListTypeFormComponent() {
    LoadListTypeDetailsComponent();
}
