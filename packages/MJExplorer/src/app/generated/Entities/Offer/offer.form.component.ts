import { Component } from '@angular/core';
import { OfferEntity } from 'mj_generatedentities';
import { RegisterClass } from '@memberjunction/global';
import { BaseFormComponent } from '@memberjunction/ng-base-forms';

@RegisterClass(BaseFormComponent, 'Offers') // Tell MemberJunction about this class
@Component({
    standalone: false,
    selector: 'gen-offer-form',
    templateUrl: './offer.form.component.html'
})
export class OfferFormComponent extends BaseFormComponent {
    public record!: OfferEntity;

    override async ngOnInit() {
        await super.ngOnInit();
        this.initSections([
            { sectionKey: 'details', sectionName: 'Details', isExpanded: true }
        ]);
    }
}

