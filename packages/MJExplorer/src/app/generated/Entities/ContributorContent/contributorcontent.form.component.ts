import { Component } from '@angular/core';
import { ContributorContentEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContributorContentDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Contributor Contents') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contributorcontent-form',
    templateUrl: './contributorcontent.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContributorContentFormComponent extends BaseFormComponent {
    public record!: ContributorContentEntity;
} 

export function LoadContributorContentFormComponent() {
    LoadContributorContentDetailsComponent();
}
