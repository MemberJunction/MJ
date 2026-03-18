import { Component } from '@angular/core';
import { YourMembershipEngagementScoreEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Engagement Scores') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipengagementscore-form',
    templateUrl: './yourmembershipengagementscore.form.component.html'
})
export class YourMembershipEngagementScoreFormComponent extends BaseFormComponent {
    public record!: YourMembershipEngagementScoreEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'engagementMetrics', sectionName: 'Engagement Metrics', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

