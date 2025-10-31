import { Component } from '@angular/core';
import { ContactLogEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadContactLogDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Contact Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-contactlog-form',
    templateUrl: './contactlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ContactLogFormComponent extends BaseFormComponent {
    public record!: ContactLogEntity;
} 

export function LoadContactLogFormComponent() {
    LoadContactLogDetailsComponent();
}
