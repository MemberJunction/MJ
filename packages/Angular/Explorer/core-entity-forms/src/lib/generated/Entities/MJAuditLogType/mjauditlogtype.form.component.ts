import { Component } from '@angular/core';
import { MJAuditLogTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Audit Log Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjauditlogtype-form',
    templateUrl: './mjauditlogtype.form.component.html'
})
export class MJAuditLogTypeFormComponent extends BaseFormComponent {
    public record!: MJAuditLogTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'logTypeDefinition', sectionName: 'Log Type Definition', isExpanded: true },
            { sectionKey: 'hierarchyStructure', sectionName: 'Hierarchy Structure', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'auditLogTypes', sectionName: 'Audit Log Types', isExpanded: false },
            { sectionKey: 'auditLogs', sectionName: 'Audit Logs', isExpanded: false }
        ]);
    }
}

