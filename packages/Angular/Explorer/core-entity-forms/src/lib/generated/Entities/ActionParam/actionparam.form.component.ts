import { Component } from '@angular/core';
import { ActionParamEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadActionParamDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Action Params') // Tell MemberJunction about this class
@Component({
    selector: 'gen-actionparam-form',
    templateUrl: './actionparam.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ActionParamFormComponent extends BaseFormComponent {
    public record!: ActionParamEntity;
} 

export function LoadActionParamFormComponent() {
    LoadActionParamDetailsComponent();
}
