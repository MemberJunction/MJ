import { Component } from '@angular/core';
import { AssociationDemoProductAwardEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Product Awards') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-associationdemoproductaward-form',
    templateUrl: './associationdemoproductaward.form.component.html'
})
export class AssociationDemoProductAwardFormComponent extends BaseFormComponent {
    public record!: AssociationDemoProductAwardEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'awardDetails', sectionName: 'Award Details', isExpanded: true },
            { sectionKey: 'competitionInformation', sectionName: 'Competition Information', isExpanded: true },
            { sectionKey: 'timelineAndPerformance', sectionName: 'Timeline and Performance', isExpanded: false },
            { sectionKey: 'documentation', sectionName: 'Documentation', isExpanded: false },
            { sectionKey: 'displaySettings', sectionName: 'Display Settings', isExpanded: false },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

