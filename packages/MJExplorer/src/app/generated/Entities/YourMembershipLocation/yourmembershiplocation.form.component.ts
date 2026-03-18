import { Component } from '@angular/core';
import { YourMembershipLocationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Locations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershiplocation-form',
    templateUrl: './yourmembershiplocation.form.component.html'
})
export class YourMembershipLocationFormComponent extends BaseFormComponent {
    public record!: YourMembershipLocationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'locationDetails', sectionName: 'Location Details', isExpanded: true },
            { sectionKey: 'taxAndAccounting', sectionName: 'Tax and Accounting', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

