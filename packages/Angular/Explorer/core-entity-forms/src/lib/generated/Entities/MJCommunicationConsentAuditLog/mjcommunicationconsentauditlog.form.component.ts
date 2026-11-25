import { Component } from '@angular/core';
import { MJCommunicationConsentAuditLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Consent Audit Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationconsentauditlog-form',
    templateUrl: './mjcommunicationconsentauditlog.form.component.html'
})
export class MJCommunicationConsentAuditLogFormComponent extends BaseFormComponent {
    public record!: MJCommunicationConsentAuditLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

