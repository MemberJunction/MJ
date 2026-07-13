import { Component } from '@angular/core';
import { MJClusterAnalysisClusterEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: Cluster Analysis Clusters') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjclusteranalysiscluster-form',
    templateUrl: './mjclusteranalysiscluster.form.component.html'
})
export class MJClusterAnalysisClusterFormComponent extends BaseFormComponent {
    public record!: MJClusterAnalysisClusterEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

