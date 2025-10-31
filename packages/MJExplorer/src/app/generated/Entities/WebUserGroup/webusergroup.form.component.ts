import { Component } from '@angular/core';
import { WebUserGroupEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadWebUserGroupDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Web User Groups') // Tell MemberJunction about this class
@Component({
    selector: 'gen-webusergroup-form',
    templateUrl: './webusergroup.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WebUserGroupFormComponent extends BaseFormComponent {
    public record!: WebUserGroupEntity;
} 

export function LoadWebUserGroupFormComponent() {
    LoadWebUserGroupDetailsComponent();
}
