import { Component } from '@angular/core';
import { CertificationAnswerSheetEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCertificationAnswerSheetDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Certification Answer Sheets') // Tell MemberJunction about this class
@Component({
    selector: 'gen-certificationanswersheet-form',
    templateUrl: './certificationanswersheet.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CertificationAnswerSheetFormComponent extends BaseFormComponent {
    public record!: CertificationAnswerSheetEntity;
} 

export function LoadCertificationAnswerSheetFormComponent() {
    LoadCertificationAnswerSheetDetailsComponent();
}
