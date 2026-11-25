import { Component } from '@angular/core';
import { MJTourLearningPathEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Tour Learning Paths') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjtourlearningpath-form',
    templateUrl: './mjtourlearningpath.form.component.html'
})
export class MJTourLearningPathFormComponent extends BaseFormComponent {
    public record!: MJTourLearningPathEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'learningPathDetails', sectionName: 'Learning Path Details', isExpanded: true },
            { sectionKey: 'configurationAndTargeting', sectionName: 'Configuration and Targeting', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJTourLearningPathTourLinks', sectionName: 'Tour Learning Path Tour Links', isExpanded: false }
        ]);
    }
}

