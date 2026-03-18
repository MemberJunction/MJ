import { Component } from '@angular/core';
import { YourMembershipTimeZoneEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Time Zones') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershiptimezone-form',
    templateUrl: './yourmembershiptimezone.form.component.html'
})
export class YourMembershipTimeZoneFormComponent extends BaseFormComponent {
    public record!: YourMembershipTimeZoneEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'timeZoneDetails', sectionName: 'Time Zone Details', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

