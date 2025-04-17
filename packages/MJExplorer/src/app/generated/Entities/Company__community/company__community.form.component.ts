import { Component } from '@angular/core';
import { Company__communityEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCompany__communityDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Companies__community') // Tell MemberJunction about this class
@Component({
    selector: 'gen-company__community-form',
    templateUrl: './company__community.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class Company__communityFormComponent extends BaseFormComponent {
    public record!: Company__communityEntity;
} 

export function LoadCompany__communityFormComponent() {
    LoadCompany__communityDetailsComponent();
}
