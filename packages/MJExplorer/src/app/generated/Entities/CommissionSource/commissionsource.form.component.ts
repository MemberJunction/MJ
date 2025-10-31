import { Component } from '@angular/core';
import { CommissionSourceEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCommissionSourceDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Commission Sources') // Tell MemberJunction about this class
@Component({
    selector: 'gen-commissionsource-form',
    templateUrl: './commissionsource.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CommissionSourceFormComponent extends BaseFormComponent {
    public record!: CommissionSourceEntity;
} 

export function LoadCommissionSourceFormComponent() {
    LoadCommissionSourceDetailsComponent();
}
