import { Component } from '@angular/core';
import { AuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { LoadAuditLogDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Audit Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-auditlog-form',
    templateUrl: './auditlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AuditLogFormComponent extends BaseFormComponent {
    public record!: AuditLogEntity;
} 

export function LoadAuditLogFormComponent() {
    LoadAuditLogDetailsComponent();
}
