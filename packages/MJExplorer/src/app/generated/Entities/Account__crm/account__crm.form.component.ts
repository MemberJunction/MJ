import { Component } from '@angular/core';
import { Account__crmEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAccount__crmDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Accounts__crm') // Tell MemberJunction about this class
@Component({
    selector: 'gen-account__crm-form',
    templateUrl: './account__crm.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Account__crmFormComponent extends BaseFormComponent {
    public record!: Account__crmEntity;
} 

export function LoadAccount__crmFormComponent() {
    LoadAccount__crmDetailsComponent();
}
