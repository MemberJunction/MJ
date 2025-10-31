import { Component } from '@angular/core';
import { MailingActivityEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMailingActivityDetailsComponent } from "./sections/details.component"
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Mailing Activities') // Tell MemberJunction about this class
@Component({
    selector: 'gen-mailingactivity-form',
    templateUrl: './mailingactivity.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MailingActivityFormComponent extends BaseFormComponent {
    public record!: MailingActivityEntity;
} 

export function LoadMailingActivityFormComponent() {
    LoadMailingActivityDetailsComponent();
}
