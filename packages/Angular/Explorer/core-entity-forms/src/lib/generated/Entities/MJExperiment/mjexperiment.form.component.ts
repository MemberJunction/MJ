import { Component } from '@angular/core';
import { MJExperimentEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Experiments') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjexperiment-form',
    templateUrl: './mjexperiment.form.component.html'
})
export class MJExperimentFormComponent extends BaseFormComponent {
    public record!: MJExperimentEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'experimentProfile', sectionName: 'Experiment Profile', isExpanded: true },
            { sectionKey: 'optimizationStrategy', sectionName: 'Optimization & Strategy', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJExperimentSessions', sectionName: 'Experiment Sessions', isExpanded: false }
        ]);
    }
}

