import { Component } from '@angular/core';
import { MJAuditLogTypesEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Audit Log Types') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjauditlogtypes-form',
    templateUrl: './mjauditlogtypes.form.component.html'
})
export class MJAuditLogTypesFormComponent extends BaseFormComponent {
    public record!: MJAuditLogTypesEntity;

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

