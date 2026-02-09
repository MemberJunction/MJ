import { Component } from '@angular/core';
import { AuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Audit Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-auditlog-form',
    templateUrl: './auditlog.form.component.html'
})
export class AuditLogFormComponent extends BaseFormComponent {
    public record!: AuditLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'auditEntry', sectionName: 'Audit Entry', isExpanded: true },
            { sectionKey: 'targetEntityReference', sectionName: 'Target Entity Reference', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

