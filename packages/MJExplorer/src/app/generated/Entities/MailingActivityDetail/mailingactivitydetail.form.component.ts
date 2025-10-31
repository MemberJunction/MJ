import { Component } from '@angular/core';
import { MailingActivityDetailEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadMailingActivityDetailDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Mailing Activity Details') // Tell MemberJunction about this class
@Component({
    selector: 'gen-mailingactivitydetail-form',
    templateUrl: './mailingactivitydetail.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class MailingActivityDetailFormComponent extends BaseFormComponent {
    public record!: MailingActivityDetailEntity;
} 

export function LoadMailingActivityDetailFormComponent() {
    LoadMailingActivityDetailDetailsComponent();
}
