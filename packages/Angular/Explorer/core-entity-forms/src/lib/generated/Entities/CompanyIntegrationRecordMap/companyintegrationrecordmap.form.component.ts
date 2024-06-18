import { Component } from '@angular/core';
import { CompanyIntegrationRecordMapEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompanyIntegrationRecordMapDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Company Integration Record Maps') // Tell MemberJunction about this class
@Component({
    selector: 'gen-companyintegrationrecordmap-form',
    templateUrl: './companyintegrationrecordmap.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CompanyIntegrationRecordMapFormComponent extends BaseFormComponent {
    public record!: CompanyIntegrationRecordMapEntity;
} 

export function LoadCompanyIntegrationRecordMapFormComponent() {
    LoadCompanyIntegrationRecordMapDetailsComponent();
}
