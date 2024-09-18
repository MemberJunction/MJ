import { Component } from '@angular/core';
import { PersonEmploymentHistoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonEmploymentHistoryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Employment Histories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personemploymenthistory-form',
    templateUrl: './personemploymenthistory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonEmploymentHistoryFormComponent extends BaseFormComponent {
    public record!: PersonEmploymentHistoryEntity;
} 

export function LoadPersonEmploymentHistoryFormComponent() {
    LoadPersonEmploymentHistoryDetailsComponent();
}
