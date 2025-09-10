import { Component } from '@angular/core';
import { ContributorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContributorDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Contributors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contributor-form',
    templateUrl: './contributor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContributorFormComponent extends BaseFormComponent {
    public record!: ContributorEntity;
} 

export function LoadContributorFormComponent() {
    LoadContributorDetailsComponent();
}
