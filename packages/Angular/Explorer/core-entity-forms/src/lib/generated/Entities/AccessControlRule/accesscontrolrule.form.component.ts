import { Component } from '@angular/core';
import { AccessControlRuleEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAccessControlRuleDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'MJ: Access Control Rules') // Tell MemberJunction about this class
@Component({
    selector: 'gen-accesscontrolrule-form',
    templateUrl: './accesscontrolrule.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AccessControlRuleFormComponent extends BaseFormComponent {
    public record!: AccessControlRuleEntity;
} 

export function LoadAccessControlRuleFormComponent() {
    LoadAccessControlRuleDetailsComponent();
}
