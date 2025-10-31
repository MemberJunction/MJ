import { Component } from '@angular/core';
import { FrequencyAgreementEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadFrequencyAgreementDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Frequency Agreements') // Tell MemberJunction about this class
@Component({
    selector: 'gen-frequencyagreement-form',
    templateUrl: './frequencyagreement.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class FrequencyAgreementFormComponent extends BaseFormComponent {
    public record!: FrequencyAgreementEntity;
} 

export function LoadFrequencyAgreementFormComponent() {
    LoadFrequencyAgreementDetailsComponent();
}
