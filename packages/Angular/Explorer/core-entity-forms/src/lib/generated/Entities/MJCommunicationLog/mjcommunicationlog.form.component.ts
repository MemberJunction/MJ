import { Component } from '@angular/core';
import { MJCommunicationLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Communication Logs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationlog-form',
    templateUrl: './mjcommunicationlog.form.component.html'
})
export class MJCommunicationLogFormComponent extends BaseFormComponent {
    public record!: MJCommunicationLogEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'messageIdentification', sectionName: 'Message Identification', isExpanded: true },
            { sectionKey: 'messageDetails', sectionName: 'Message Details', isExpanded: true },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

