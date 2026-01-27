import { Component } from '@angular/core';
import { ChannelEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Channels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channel-form',
    templateUrl: './channel.form.component.html'
})
export class ChannelFormComponent extends BaseFormComponent {
    public record!: ChannelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'organizationalContext', sectionName: 'Organizational Context', isExpanded: true },
            { sectionKey: 'channelBasics', sectionName: 'Channel Basics', isExpanded: true },
            { sectionKey: 'integrationSettings', sectionName: 'Integration Settings', isExpanded: false },
            { sectionKey: 'details', sectionName: 'Details', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'channelRuns', sectionName: 'Channel Runs', isExpanded: false },
            { sectionKey: 'organizationSettings', sectionName: 'Organization Settings', isExpanded: false },
            { sectionKey: 'channelActions', sectionName: 'Channel Actions', isExpanded: false },
            { sectionKey: 'channelMessages', sectionName: 'Channel Messages', isExpanded: false }
        ]);
    }
}

export function LoadChannelFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
