import { Component } from '@angular/core';
import { AuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadAuditLogDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Audit Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-auditlog-form',
    templateUrl: './auditlog.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AuditLogFormComponent extends BaseFormComponent {
    public record: AuditLogEntity | null = null;
} 

export function LoadAuditLogFormComponent() {
    LoadAuditLogDetailsComponent();
}
