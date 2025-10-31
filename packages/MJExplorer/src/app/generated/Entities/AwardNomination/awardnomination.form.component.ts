import { Component } from '@angular/core';
import { AwardNominationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAwardNominationDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Award Nominations') // Tell MemberJunction about this class
@Component({
    selector: 'gen-awardnomination-form',
    templateUrl: './awardnomination.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AwardNominationFormComponent extends BaseFormComponent {
    public record!: AwardNominationEntity;
} 

export function LoadAwardNominationFormComponent() {
    LoadAwardNominationDetailsComponent();
}
