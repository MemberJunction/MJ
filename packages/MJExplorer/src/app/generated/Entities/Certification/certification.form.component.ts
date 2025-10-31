import { Component } from '@angular/core';
import { CertificationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCertificationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Certifications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-certification-form',
    templateUrl: './certification.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CertificationFormComponent extends BaseFormComponent {
    public record!: CertificationEntity;
} 

export function LoadCertificationFormComponent() {
    LoadCertificationDetailsComponent();
}
