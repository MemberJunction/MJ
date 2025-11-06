import { Component } from '@angular/core';
import { AuditLogTypeEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import { UserViewGridComponent } from "@memberjunction/ng-user-view-grid"

@RegisterClass(BaseFormComponent, 'Audit Log Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-auditlogtype-form',
    templateUrl: './auditlogtype.form.component.html',
    styleUrls: ['../../../../shared/form-styles.css']
})
export class AuditLogTypeFormComponent extends BaseFormComponent {
    public record!: AuditLogTypeEntity;

    // Collapsible section state
    public sectionsExpanded = {
        details: true,
        auditLogTypes: false,
        auditLogs: false
    };

    // Row counts for related entity sections (populated after grids load)
    public sectionRowCounts: { [key: string]: number } = {};

    public toggleSection(section: keyof typeof this.sectionsExpanded): void {
        this.sectionsExpanded[section] = !this.sectionsExpanded[section];
    }
}

export function LoadAuditLogTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
