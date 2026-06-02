import { Component } from '@angular/core';
import { MJRSUAuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: RSU Audit Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrsuauditlog-form',
    templateUrl: './mjrsuauditlog.form.component.html'
})
export class MJRSUAuditLogFormComponent extends BaseFormComponent {
    public record!: MJRSUAuditLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'auditInformation', sectionName: 'Audit Information', isExpanded: true },
            { sectionKey: 'executionStatus', sectionName: 'Execution Status', isExpanded: true },
            { sectionKey: 'deploymentDetails', sectionName: 'Deployment Details', isExpanded: false },
            { sectionKey: 'errorDiagnostics', sectionName: 'Error Diagnostics', isExpanded: false },
            { sectionKey: 'executionDetails', sectionName: 'Execution Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

