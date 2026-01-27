import { Component } from '@angular/core';
import { ChannelTypeActionEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Channel Type Actions') // Tell MemberJunction about this class
@Component({
    selector: 'gen-channeltypeaction-form',
    templateUrl: './channeltypeaction.form.component.html'
})
export class ChannelTypeActionFormComponent extends BaseFormComponent {
    public record!: ChannelTypeActionEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'referenceData', sectionName: 'Reference Data', isExpanded: true },
            { sectionKey: 'actionConfiguration', sectionName: 'Action Configuration', isExpanded: true },
            { sectionKey: 'credentialSettings', sectionName: 'Credential Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

export function LoadChannelTypeActionFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
