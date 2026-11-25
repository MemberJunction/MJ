import { Component } from '@angular/core';
import { MJLearningPathEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Learning Paths') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjlearningpath-form',
    templateUrl: './mjlearningpath.form.component.html'
})
export class MJLearningPathFormComponent extends BaseFormComponent {
    public record!: MJLearningPathEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'pathDetails', sectionName: 'Path Details', isExpanded: true },
            { sectionKey: 'configurationAndTargeting', sectionName: 'Configuration and Targeting', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJLearningPathTours', sectionName: 'Learning Path Tours', isExpanded: false }
        ]);
    }
}

