import { Component } from '@angular/core';
import { YourMembershipEventCEUAwardEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Event CEU Awards') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipeventceuaward-form',
    templateUrl: './yourmembershipeventceuaward.form.component.html'
})
export class YourMembershipEventCEUAwardFormComponent extends BaseFormComponent {
    public record!: YourMembershipEventCEUAwardEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'awardConfiguration', sectionName: 'Award Configuration', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

