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
            { sectionKey: 'tourAndStepDefinition', sectionName: 'Tour and Step Definition', isExpanded: true },
            { sectionKey: 'contentAndGuidance', sectionName: 'Content and Guidance', isExpanded: true },
            { sectionKey: 'advancedConfigurationAndLogic', sectionName: 'Advanced Configuration and Logic', isExpanded: true },
            { sectionKey: 'uIAndInteractionBehavior', sectionName: 'UI and Interaction Behavior', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTourStepPathsFromStepID', sectionName: 'Tour Step Paths (From Step)', isExpanded: false },
            { sectionKey: 'mJTourStepPathsToStepID', sectionName: 'Tour Step Paths (To Step)', isExpanded: false }
        ]);
    }
}

