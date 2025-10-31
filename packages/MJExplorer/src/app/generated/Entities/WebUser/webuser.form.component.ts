import { Component } from '@angular/core';
import { WebUserEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadWebUserDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Web Users') // Tell MemberJunction about this class
@Component({
    selector: 'gen-webuser-form',
    templateUrl: './webuser.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class WebUserFormComponent extends BaseFormComponent {
    public record!: WebUserEntity;
} 

export function LoadWebUserFormComponent() {
    LoadWebUserDetailsComponent();
}
