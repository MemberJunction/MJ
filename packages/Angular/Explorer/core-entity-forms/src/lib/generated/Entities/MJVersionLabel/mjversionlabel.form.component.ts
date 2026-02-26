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
            { sectionKey: 'mJVersionLabelRestores', sectionName: 'MJ: Version Label Restores', isExpanded: false },
            { sectionKey: 'mJVersionLabelItems', sectionName: 'MJ: Version Label Items', isExpanded: false },
            { sectionKey: 'mJVersionLabelRestores1', sectionName: 'MJ: Version Label Restores', isExpanded: false },
            { sectionKey: 'mJVersionLabels', sectionName: 'MJ: Version Labels', isExpanded: false }
        ]);
    }
}

