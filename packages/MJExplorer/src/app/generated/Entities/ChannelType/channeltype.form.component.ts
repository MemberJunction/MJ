import { Component } from '@angular/core';
import { ChannelTypeEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Channel Types') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channeltype-form',
    templateUrl: './channeltype.form.component.html'
})
export class ChannelTypeFormComponent extends BaseFormComponent {
    public record!: ChannelTypeEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'channelBasics', sectionName: 'Channel Basics', isExpanded: true },
            { sectionKey: 'providerSettings', sectionName: 'Provider Settings', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'channels', sectionName: 'Channels', isExpanded: false },
            { sectionKey: 'channelTypeActions', sectionName: 'Channel Type Actions', isExpanded: false }
        ]);
    }
}

export function LoadChannelTypeFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
