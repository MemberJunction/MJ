import { Component } from '@angular/core';
import { YourMembershipCustomTaxLocationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Custom Tax Locations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-yourmembershipcustomtaxlocation-form',
    templateUrl: './yourmembershipcustomtaxlocation.form.component.html'
})
export class YourMembershipCustomTaxLocationFormComponent extends BaseFormComponent {
    public record!: YourMembershipCustomTaxLocationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'taxAndLocation', sectionName: 'Tax and Location', isExpanded: true },
            { sectionKey: 'systemMetadata', sectionName: 'System Metadata', isExpanded: false }
        ]);
    }
}

