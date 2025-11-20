import { Component } from '@angular/core';
import { CommunicationLogEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Communication Logs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationlog-form',
    templateUrl: './communicationlog.form.component.html'
})
export class CommunicationLogFormComponent extends BaseFormComponent {
    public record!: CommunicationLogEntity;

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

export function LoadCommunicationLogFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
