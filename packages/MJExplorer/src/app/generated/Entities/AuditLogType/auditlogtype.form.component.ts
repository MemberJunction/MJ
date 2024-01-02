import { Component } from '@angular/core';
import { AuditLogTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-explorer-core';
import { LoadAuditLogTypeDetailsComponent } from "./sections/details.component"
@RegisterClass(BaseFormComponent, 'Audit Log Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-auditlogtype-form',
    templateUrl: './auditlogtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AuditLogTypeFormComponent extends BaseFormComponent {
    public record: AuditLogTypeEntity | null = null;
} 

export function LoadAuditLogTypeFormComponent() {
    LoadAuditLogTypeDetailsComponent();
}
