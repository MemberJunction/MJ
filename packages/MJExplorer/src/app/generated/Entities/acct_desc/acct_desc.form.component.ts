import { Component } from '@angular/core';
import { acct_descEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { Loadacct_descDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Account Descriptions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-acct_desc-form',
    templateUrl: './acct_desc.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class acct_descFormComponent extends BaseFormComponent {
    public record!: acct_descEntity;
} 

export function Loadacct_descFormComponent() {
    Loadacct_descDetailsComponent();
}
