import { Component } from '@angular/core';
import { ScheduleTransAccountEntryEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadScheduleTransAccountEntryDetailsComponent } from "./sections/details.component"

@RegisterClass(BaseFormComponent, 'Schedule Trans Account Entries') // Tell MemberJunction about this class
@Component({
    selector: 'gen-scheduletransaccountentry-form',
    templateUrl: './scheduletransaccountentry.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ScheduleTransAccountEntryFormComponent extends BaseFormComponent {
    public record!: ScheduleTransAccountEntryEntity;
} 

export function LoadScheduleTransAccountEntryFormComponent() {
    LoadScheduleTransAccountEntryDetailsComponent();
}
