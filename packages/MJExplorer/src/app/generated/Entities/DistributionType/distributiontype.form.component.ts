import { Component } from '@angular/core';
import { DistributionTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadDistributionTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Distribution Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-distributiontype-form',
    templateUrl: './distributiontype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class DistributionTypeFormComponent extends BaseFormComponent {
    public record!: DistributionTypeEntity;
} 

export function LoadDistributionTypeFormComponent() {
    LoadDistributionTypeDetailsComponent();
}
