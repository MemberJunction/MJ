import { Component } from '@angular/core';
import { ChannelMessageEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Channel Messages') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channelmessage-form',
    templateUrl: './channelmessage.form.component.html'
})
export class ChannelMessageFormComponent extends BaseFormComponent {
    public record!: ChannelMessageEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'messageMetadata', sectionName: 'Message Metadata', isExpanded: false },
            { sectionKey: 'contentCommunication', sectionName: 'Content & Communication', isExpanded: true },
            { sectionKey: 'aIProcessingGeneration', sectionName: 'AI Processing & Generation', isExpanded: false },
            { sectionKey: 'approvalReplyManagement', sectionName: 'Approval & Reply Management', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'channelMessageAttachments', sectionName: 'Channel Message Attachments', isExpanded: false },
            { sectionKey: 'channelMessages', sectionName: 'Channel Messages', isExpanded: false }
        ]);
    }
}

export function LoadChannelMessageFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
