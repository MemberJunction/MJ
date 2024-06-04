import { Component } from '@angular/core';
import { ErrorLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadErrorLogDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Error Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-errorlog-form',
    templateUrl: './errorlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class ErrorLogFormComponent extends BaseFormComponent {
    public record!: ErrorLogEntity;
} 

export function LoadErrorLogFormComponent() {
    LoadErrorLogDetailsComponent();
}
