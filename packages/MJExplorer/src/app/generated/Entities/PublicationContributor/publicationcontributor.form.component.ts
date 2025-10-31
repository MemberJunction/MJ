import { Component } from '@angular/core';
import { PublicationContributorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPublicationContributorDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Publication Contributors') // Tell MemberJunction about this class
@Component({
    selector: 'gen-publicationcontributor-form',
    templateUrl: './publicationcontributor.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PublicationContributorFormComponent extends BaseFormComponent {
    public record!: PublicationContributorEntity;
} 

export function LoadPublicationContributorFormComponent() {
    LoadPublicationContributorDetailsComponent();
}
