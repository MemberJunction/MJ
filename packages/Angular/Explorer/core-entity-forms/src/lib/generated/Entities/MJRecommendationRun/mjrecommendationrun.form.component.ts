import { Component } from '@angular/core';
import { MJRecommendationRunEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Recommendation Runs') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjrecommendationrun-form',
    templateUrl: './mjrecommendationrun.form.component.html'
})
export class MJRecommendationRunFormComponent extends BaseFormComponent {
    public record!: MJRecommendationRunEntity;

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

