import { Component } from '@angular/core';
import { MJCommunicationEndpointEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Communication Endpoints') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjcommunicationendpoint-form',
    templateUrl: './mjcommunicationendpoint.form.component.html'
})
export class MJCommunicationEndpointFormComponent extends BaseFormComponent {
    public record!: MJCommunicationEndpointEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJCommunicationEndpointPrincipals', sectionName: 'Communication Endpoint Principals', isExpanded: false },
            { sectionKey: 'mJCommunicationLogs', sectionName: 'Communication Logs', isExpanded: false },
            { sectionKey: 'mJCommunicationActivities', sectionName: 'Communication Activities', isExpanded: false },
            { sectionKey: 'mJCommunicationSuppressions', sectionName: 'Communication Suppressions', isExpanded: false }
        ]);
    }
}

