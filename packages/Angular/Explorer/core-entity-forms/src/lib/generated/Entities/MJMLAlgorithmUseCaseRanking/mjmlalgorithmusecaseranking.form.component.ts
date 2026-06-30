import { Component } from '@angular/core';
import { MJMLAlgorithmUseCaseRankingEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'MJ: ML Algorithm Use Case Rankings') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlalgorithmusecaseranking-form',
    templateUrl: './mjmlalgorithmusecaseranking.form.component.html'
})
export class MJMLAlgorithmUseCaseRankingFormComponent extends BaseFormComponent {
    public record!: MJMLAlgorithmUseCaseRankingEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'useCaseMapping', sectionName: 'Use Case Mapping', isExpanded: true },
            { sectionKey: 'rankingDetails', sectionName: 'Ranking Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

