import { Component } from '@angular/core';
import { ContactLogTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContactLogTypeDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Contact Log Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactlogtype-form',
    templateUrl: './contactlogtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContactLogTypeFormComponent extends BaseFormComponent {
    public record!: ContactLogTypeEntity;
} 

export function LoadContactLogTypeFormComponent() {
    LoadContactLogTypeDetailsComponent();
}
