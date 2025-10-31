import { Component } from '@angular/core';
import { CaseSurveyMethodEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadCaseSurveyMethodDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Case Survey Methods') // Tell MemberJunction about this class
@Component({
    selector: 'gen-casesurveymethod-form',
    templateUrl: './casesurveymethod.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class CaseSurveyMethodFormComponent extends BaseFormComponent {
    public record!: CaseSurveyMethodEntity;
} 

export function LoadCaseSurveyMethodFormComponent() {
    LoadCaseSurveyMethodDetailsComponent();
}
