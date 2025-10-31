import { Component } from '@angular/core';
import { ContactLogLinkEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContactLogLinkDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Contact Log Links') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactloglink-form',
    templateUrl: './contactloglink.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContactLogLinkFormComponent extends BaseFormComponent {
    public record!: ContactLogLinkEntity;
} 

export function LoadContactLogLinkFormComponent() {
    LoadContactLogLinkDetailsComponent();
}
