import { Component } from '@angular/core';
import { MJMLAlgorithmUseCaseEntity } from '@memberjunction/core-entities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';
import {  } from "@memberjunction/ng-entity-viewer"

@RegisterClass(BaseFormComponent, 'MJ: ML Algorithm Use Cases') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-mjmlalgorithmusecase-form',
    templateUrl: './mjmlalgorithmusecase.form.component.html'
})
export class MJMLAlgorithmUseCaseFormComponent extends BaseFormComponent {
    public record!: MJMLAlgorithmUseCaseEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'useCaseDetails', sectionName: 'Use Case Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false },
            { sectionKey: 'mJMLAlgorithmUseCaseRankings', sectionName: 'ML Algorithm Use Case Rankings', isExpanded: false }
        ]);
    }
}

