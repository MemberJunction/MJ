import { Component } from '@angular/core';
import { ClassCertificatePrintRunEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadClassCertificatePrintRunDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Class Certificate Print Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-classcertificateprintrun-form',
    templateUrl: './classcertificateprintrun.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ClassCertificatePrintRunFormComponent extends BaseFormComponent {
    public record!: ClassCertificatePrintRunEntity;
} 

export function LoadClassCertificatePrintRunFormComponent() {
    LoadClassCertificatePrintRunDetailsComponent();
}
