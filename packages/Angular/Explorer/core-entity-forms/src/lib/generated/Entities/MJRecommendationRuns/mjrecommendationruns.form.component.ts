import { Component } from '@angular/core';
import { MJRecommendationRunsEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Recommendation Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecommendationruns-form',
    templateUrl: './mjrecommendationruns.form.component.html'
})
export class MJRecommendationRunsFormComponent extends BaseFormComponent {
    public record!: MJRecommendationRunsEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'runIdentification', sectionName: 'Run Identification', isExpanded: true },
            { sectionKey: 'runScheduleStatus', sectionName: 'Run Schedule & Status', isExpanded: true },
            { sectionKey: 'runDescription', sectionName: 'Run Description', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'recommendations', sectionName: 'Recommendations', isExpanded: false }
        ]);
    }
}

