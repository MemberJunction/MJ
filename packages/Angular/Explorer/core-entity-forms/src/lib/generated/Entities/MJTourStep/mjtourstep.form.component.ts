import { Component } from '@angular/core';
import { MJTourStepEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tour Steps') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtourstep-form',
    templateUrl: './mjtourstep.form.component.html'
})
export class MJTourStepFormComponent extends BaseFormComponent {
    public record!: MJTourStepEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tourStepDetails', sectionName: 'Tour Step Details', isExpanded: true },
            { sectionKey: 'contentAndCopy', sectionName: 'Content and Copy', isExpanded: true },
            { sectionKey: 'configurationAndActions', sectionName: 'Configuration and Actions', isExpanded: true },
            { sectionKey: 'behaviorAndExecution', sectionName: 'Behavior and Execution', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTourStepPathsFromStepID', sectionName: 'Tour Step Paths (From Step)', isExpanded: false },
            { sectionKey: 'mJTourStepPathsToStepID', sectionName: 'Tour Step Paths (To Step)', isExpanded: false }
        ]);
    }
}

