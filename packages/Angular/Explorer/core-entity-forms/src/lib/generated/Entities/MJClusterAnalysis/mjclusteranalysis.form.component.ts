import { Component } from '@angular/core';
import { MJClusterAnalysisEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: Cluster Analysis') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjclusteranalysis-form',
    templateUrl: './mjclusteranalysis.form.component.html'
})
export class MJClusterAnalysisFormComponent extends BaseFormComponent {
    public record!: MJClusterAnalysisEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true },
            { sectionKey: 'mJClusterAnalysisClusters', sectionName: 'Cluster Analysis Clusters', isExpanded: false }
        ]);
    }
}

