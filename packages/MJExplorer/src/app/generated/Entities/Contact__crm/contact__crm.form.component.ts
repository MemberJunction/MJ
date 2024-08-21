import { Component } from '@angular/core';
import { Contact__crmEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContact__crmDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Contacts__crm') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contact__crm-form',
    templateUrl: './contact__crm.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Contact__crmFormComponent extends BaseFormComponent {
    public record!: Contact__crmEntity;
} 

export function LoadContact__crmFormComponent() {
    LoadContact__crmDetailsComponent();
}
