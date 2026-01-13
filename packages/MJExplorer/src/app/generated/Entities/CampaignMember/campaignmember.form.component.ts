import { Component } from '@angular/core';
import { CampaignMemberEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Campaign Members') // Tell MemberJunction about this class
@Component({
    selector: 'gen-campaignmember-form',
    templateUrl: './campaignmember.form.component.html'
})
export class CampaignMemberFormComponent extends BaseFormComponent {
    public record!: CampaignMemberEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

export function LoadCampaignMemberFormComponent() {
    // does nothing, but called to prevent tree-shaking from eliminating this component from the build
}
