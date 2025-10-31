import { Component } from '@angular/core';
import { PublicationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadPublicationDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Publications') // Tell MemberJunction about this class
@Component({
    selector: 'gen-publication-form',
    templateUrl: './publication.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class PublicationFormComponent extends BaseFormComponent {
    public record!: PublicationEntity;
} 

export function LoadPublicationFormComponent() {
    LoadPublicationDetailsComponent();
}
