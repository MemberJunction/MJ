import { Component } from '@angular/core';
import { YourMembershipSponsorRotatorEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Sponsor Rotators') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipsponsorrotator-form',
    templateUrl: './yourmembershipsponsorrotator.form.component.html'
})
export class YourMembershipSponsorRotatorFormComponent extends BaseFormComponent {
    public record!: YourMembershipSponsorRotatorEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'rotatorConfiguration', sectionName: 'Rotator Configuration', isExpanded: true },
            { sectionKey: 'displayAndAnimation', sectionName: 'Display and Animation', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

