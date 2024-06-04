import { Component } from '@angular/core';
import { UserRecordLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadUserRecordLogDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'User Record Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-userrecordlog-form',
    templateUrl: './userrecordlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class UserRecordLogFormComponent extends BaseFormComponent {
    public record!: UserRecordLogEntity;
} 

export function LoadUserRecordLogFormComponent() {
    LoadUserRecordLogDetailsComponent();
}
