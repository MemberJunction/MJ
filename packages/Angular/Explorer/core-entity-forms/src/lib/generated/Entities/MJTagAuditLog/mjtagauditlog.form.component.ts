import { Component } from '@angular/core';
import { MJTagAuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Tag Audit Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtagauditlog-form',
    templateUrl: './mjtagauditlog.form.component.html'
})
export class MJTagAuditLogFormComponent extends BaseFormComponent {
    public record!: MJTagAuditLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'affectedTags', sectionName: 'Affected Tags', isExpanded: true },
            { sectionKey: 'auditEvent', sectionName: 'Audit Event', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

