import { Component } from '@angular/core';
import { CommunicationRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Communication Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-communicationrun-form',
    templateUrl: './communicationrun.form.component.html'
})
export class CommunicationRunFormComponent extends BaseFormComponent {
    public record!: CommunicationRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runMetadata', sectionName: 'Run Metadata', isExpanded: false },
            { sectionKey: 'executionTimeline', sectionName: 'Execution Timeline', isExpanded: true },
            { sectionKey: 'resultNotes', sectionName: 'Result & Notes', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'communicationLogs', sectionName: 'Communication Logs', isExpanded: false }
        ]);
    }
}

export function LoadCommunicationRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
