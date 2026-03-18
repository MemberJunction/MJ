import { Component } from '@angular/core';
import { HubSpotCallEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Calls') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-hubspotcall-form',
    templateUrl: './hubspotcall.form.component.html'
})
export class HubSpotCallFormComponent extends BaseFormComponent {
    public record!: HubSpotCallEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'callDetailsOutcome', sectionName: 'Call Details & Outcome', isExpanded: true },
            { sectionKey: 'callConnectivityRecording', sectionName: 'Call Connectivity & Recording', isExpanded: true },
            { sectionKey: 'timelineOwnership', sectionName: 'Timeline & Ownership', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'dealCalls', sectionName: 'Deal Calls', isExpanded: false },
            { sectionKey: 'companyCalls', sectionName: 'Company Calls', isExpanded: false },
            { sectionKey: 'contactCalls', sectionName: 'Contact Calls', isExpanded: false },
            { sectionKey: 'ticketCalls', sectionName: 'Ticket Calls', isExpanded: false }
        ]);
    }
}

