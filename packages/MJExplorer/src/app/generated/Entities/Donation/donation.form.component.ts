import { Component } from '@angular/core';
import { DonationEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Donations') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-donation-form',
    templateUrl: './donation.form.component.html'
})
export class DonationFormComponent extends BaseFormComponent {
    public record!: DonationEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

