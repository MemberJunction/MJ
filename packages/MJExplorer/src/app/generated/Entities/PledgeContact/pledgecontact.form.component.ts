import { Component } from '@angular/core';
import { PledgeContactEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPledgeContactDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Pledge Contacts') // Tell MemberJunction about this class
@Component({
    selector: 'gen-pledgecontact-form',
    templateUrl: './pledgecontact.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PledgeContactFormComponent extends BaseFormComponent {
    public record!: PledgeContactEntity;
} 

export function LoadPledgeContactFormComponent() {
    LoadPledgeContactDetailsComponent();
}
