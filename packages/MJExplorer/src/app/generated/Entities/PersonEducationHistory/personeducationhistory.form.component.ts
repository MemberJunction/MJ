import { Component } from '@angular/core';
import { PersonEducationHistoryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPersonEducationHistoryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Person Education Histories') // Tell MemberJunction about this class
@Component({
    selector: 'gen-personeducationhistory-form',
    templateUrl: './personeducationhistory.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PersonEducationHistoryFormComponent extends BaseFormComponent {
    public record!: PersonEducationHistoryEntity;
} 

export function LoadPersonEducationHistoryFormComponent() {
    LoadPersonEducationHistoryDetailsComponent();
}
