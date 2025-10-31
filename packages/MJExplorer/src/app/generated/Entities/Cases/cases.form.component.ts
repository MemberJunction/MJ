import { Component } from '@angular/core';
import { CasesEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCasesDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Cases') // Tell MemberJunction about this class
@Component({
    selector: 'gen-cases-form',
    templateUrl: './cases.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CasesFormComponent extends BaseFormComponent {
    public record!: CasesEntity;
} 

export function LoadCasesFormComponent() {
    LoadCasesDetailsComponent();
}
