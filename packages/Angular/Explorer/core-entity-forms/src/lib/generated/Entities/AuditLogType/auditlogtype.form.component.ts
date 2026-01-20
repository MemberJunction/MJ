import { Component } from '@angular/core';
import { AuditLogTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Audit Log Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-auditlogtype-form',
    templateUrl: './auditlogtype.form.component.html'
})
export class AuditLogTypeFormComponent extends BaseFormComponent {
    public record!: AuditLogTypeEntity;

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

export function LoadAuditLogTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
