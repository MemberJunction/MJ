import { Component } from '@angular/core';
import { MJVersionLabelEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Version Labels') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjversionlabel-form',
    templateUrl: './mjversionlabel.form.component.html'
})
export class MJVersionLabelFormComponent extends BaseFormComponent {
    public record!: MJVersionLabelEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'labelDefinition', sectionName: 'Label Definition', isExpanded: true },
            { sectionKey: 'scopeTargets', sectionName: 'Scope Targets', isExpanded: true },
            { sectionKey: 'creationMetrics', sectionName: 'Creation Metrics', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJVersionLabelRestoresPreRestoreLabelID', sectionName: 'Version Label Restores (Pre-Restore Label ID)', isExpanded: false },
            { sectionKey: 'mJVersionLabelItems', sectionName: 'Version Label Items', isExpanded: false },
            { sectionKey: 'mJVersionLabelRestoresVersionLabelID', sectionName: 'Version Label Restores (Version Label ID)', isExpanded: false },
            { sectionKey: 'mJVersionLabels', sectionName: 'Version Labels', isExpanded: false }
        ]);
    }
}

