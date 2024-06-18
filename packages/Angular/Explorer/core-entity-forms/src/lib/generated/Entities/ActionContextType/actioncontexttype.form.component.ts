import { Component } from '@angular/core';
import { ActionContextTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionContextTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Action Context Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actioncontexttype-form',
    templateUrl: './actioncontexttype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionContextTypeFormComponent extends BaseFormComponent {
    public record!: ActionContextTypeEntity;
} 

export function LoadActionContextTypeFormComponent() {
    LoadActionContextTypeDetailsComponent();
}
