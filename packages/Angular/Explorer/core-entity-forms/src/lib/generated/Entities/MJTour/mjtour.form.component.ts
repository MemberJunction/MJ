import { Component } from '@angular/core';
import { MJTourEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tours') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtour-form',
    templateUrl: './mjtour.form.component.html'
})
export class MJTourFormComponent extends BaseFormComponent {
    public record!: MJTourEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'tourDetails', sectionName: 'Tour Details', isExpanded: true },
            { sectionKey: 'launchPolicyAndRules', sectionName: 'Launch Policy and Rules', isExpanded: true },
            { sectionKey: 'guidanceConfiguration', sectionName: 'Guidance Configuration', isExpanded: true },
            { sectionKey: 'advancedConfiguration', sectionName: 'Advanced Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTourOverrides', sectionName: 'Tour Overrides', isExpanded: false },
            { sectionKey: 'mJTourVersions', sectionName: 'Tour Versions', isExpanded: false },
            { sectionKey: 'mJTourLearningPathTourLinks', sectionName: 'Tour Learning Path Tour Links', isExpanded: false },
            { sectionKey: 'mJTourSurfaceTours', sectionName: 'Tour Surface Tours', isExpanded: false },
            { sectionKey: 'mJTourPrerequisitesTourID', sectionName: 'Tour Prerequisites (Tour ID)', isExpanded: false },
            { sectionKey: 'mJTourPrerequisitesRequiredTourID', sectionName: 'Tour Prerequisites (Required Tour ID)', isExpanded: false },
            { sectionKey: 'mJTourTriggers', sectionName: 'Tour Triggers', isExpanded: false },
            { sectionKey: 'mJTourStepPaths', sectionName: 'Tour Step Paths', isExpanded: false },
            { sectionKey: 'mJTourSteps', sectionName: 'Tour Steps', isExpanded: false },
            { sectionKey: 'mJTourRuns', sectionName: 'Tour Runs', isExpanded: false }
        ]);
    }
}

