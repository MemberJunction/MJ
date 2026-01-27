import { Component } from '@angular/core';
import { ChannelActionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Channel Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channelaction-form',
    templateUrl: './channelaction.form.component.html'
})
export class ChannelActionFormComponent extends BaseFormComponent {
    public record!: ChannelActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'identificationReferences', sectionName: 'Identification & References', isExpanded: true },
            { sectionKey: 'configurationExecution', sectionName: 'Configuration & Execution', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadChannelActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
