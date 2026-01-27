import { Component } from '@angular/core';
import { ChannelRunEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'Channel Runs') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channelrun-form',
    templateUrl: './channelrun.form.component.html'
})
export class ChannelRunFormComponent extends BaseFormComponent {
    public record!: ChannelRunEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identifiers', sectionName: 'Identifiers', isExpanded: true },
            { sectionKey: 'runExecution', sectionName: 'Run Execution', isExpanded: true },
            { sectionKey: 'runMetrics', sectionName: 'Run Metrics', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'channelMessages', sectionName: 'Channel Messages', isExpanded: false }
        ]);
    }
}

export function LoadChannelRunFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
