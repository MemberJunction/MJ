import { Component } from '@angular/core';
import { VersionLabelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Version Labels') // Tell MemberJunction about this class
@Component({
    selector: 'gen-versionlabel-form',
    templateUrl: './versionlabel.form.component.html'
})
export class VersionLabelFormComponent extends BaseFormComponent {
    public record!: VersionLabelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'labelDetails', sectionName: 'Label Details', isExpanded: true },
            { sectionKey: 'targetScope', sectionName: 'Target Scope', isExpanded: true },
            { sectionKey: 'ownershipIntegration', sectionName: 'Ownership & Integration', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJVersionLabelRestores', sectionName: 'MJ: Version Label Restores', isExpanded: false },
            { sectionKey: 'mJVersionLabelItems', sectionName: 'MJ: Version Label Items', isExpanded: false },
            { sectionKey: 'mJVersionLabelRestores1', sectionName: 'MJ: Version Label Restores', isExpanded: false }
        ]);
    }
}

export function LoadVersionLabelFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
