import { Component } from '@angular/core';
import { YourMembershipCampaignEmailListEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Campaign Email Lists') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipcampaignemaillist-form',
    templateUrl: './yourmembershipcampaignemaillist.form.component.html'
})
export class YourMembershipCampaignEmailListFormComponent extends BaseFormComponent {
    public record!: YourMembershipCampaignEmailListEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'listConfiguration', sectionName: 'List Configuration', isExpanded: true },
            { sectionKey: 'activityAndSync', sectionName: 'Activity and Sync', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

